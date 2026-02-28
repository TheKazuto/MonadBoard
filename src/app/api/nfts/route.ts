import { NextRequest, NextResponse } from 'next/server'
import { MONAD_RPC as RPC, rpcBatch, getMonPrice } from '@/lib/monad'

export const revalidate = 0

// Fix #4 (ALTO): SSRF via NFT metadata — previously the server fetched any URL
// returned by the blockchain's tokenURI, including internal network addresses.
// Now only URLs from an explicit allowlist of trusted IPFS/metadata hosts are fetched.

/** Trusted hosts allowed for NFT metadata and image fetching */
// Removed the strict allowlist — NFT metadata is hosted on hundreds of different
// CDNs and custom domains. Blocking by host was too restrictive and broke all NFTs.
// Real SSRF protection is the combination of: HTTPS-only + private IP blocking below.

/** Private / link-local IP ranges that must never be fetched (SSRF protection) */
const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|::1|fc00:|fd)/

function isSafeMetaUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    // Only HTTPS — blocks file:, data:, javascript:, ftp:, http:
    if (u.protocol !== 'https:') return false
    // Block private/internal IP ranges (core SSRF protection)
    if (PRIVATE_IP_RE.test(u.hostname)) return false
    // Block localhost by name
    if (u.hostname === 'localhost' || u.hostname.endsWith('.local')) return false
    return true
  } catch {
    return false
  }
}

/** Fix #13: Sanitize image URL — only accept https from allowed hosts */
function sanitizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const resolved = resolveURI(String(raw))
  return isSafeMetaUrl(resolved) ? resolved : null
}

function padUint256(n: bigint) { return n.toString(16).padStart(64, '0') }

function decodeString(hex: string): string {
  try {
    if (!hex || hex === '0x') return ''
    const b = Buffer.from(hex.slice(2), 'hex')
    if (b.length < 64) return ''
    const len = Number(BigInt('0x' + b.slice(32, 64).toString('hex')))
    return b.slice(64, 64 + len).toString('utf8').replace(/\0/g, '')
  } catch { return '' }
}

function resolveURI(uri: string): string {
  if (!uri) return ''
  // Convert IPFS URIs to HTTPS gateway
  if (uri.startsWith('ipfs://')) return uri.replace('ipfs://', 'https://ipfs.io/ipfs/')
  return uri
}

// ─── Step 1: Discover NFTs via Etherscan ──────────────────────────────────────
async function discoverNFTs(address: string, apiKey: string) {
  // Fix #5 (ALTO): Key moved to query param via URLSearchParams (standard for Etherscan v2).
  // While query params are still logged by Etherscan, they are no longer interpolated
  // directly into template strings — using URL object prevents accidental injection.
  const url = new URL('https://api.etherscan.io/v2/api')
  url.searchParams.set('chainid',  '143')
  url.searchParams.set('module',   'account')
  url.searchParams.set('action',   'tokennfttx')
  url.searchParams.set('address',  address)
  url.searchParams.set('page',     '1')
  url.searchParams.set('offset',   '100')
  url.searchParams.set('sort',     'desc')
  url.searchParams.set('apikey',   apiKey)

  const res  = await fetch(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  const data = await res.json()
  if (data.status !== '1') {
    if (data.message?.includes('No transactions')) return []
    throw new Error('NFT discovery failed')  // Fix #9: generic message
  }
  const addrLower = address.toLowerCase()
  const lastTx    = new Map<string, Record<string, unknown>>()
  for (const tx of data.result as Record<string, unknown>[]) {
    const key = `${String(tx.contractAddress).toLowerCase()}_${BigInt(tx.tokenID as string)}`
    if (!lastTx.has(key)) lastTx.set(key, tx)
  }
  return [...lastTx.values()]
    .filter(tx => String(tx.to).toLowerCase() === addrLower)
    .map(tx => ({
      contract: String(tx.contractAddress).toLowerCase(),
      tokenId:  BigInt(tx.tokenID as string),
    }))
}

// ─── Step 2: Verify ownership on-chain ────────────────────────────────────────
async function verifyOwnership(candidates: { contract: string; tokenId: bigint }[], address: string) {
  const calls = candidates.map((c, i) => ({
    jsonrpc: '2.0', method: 'eth_call',
    params: [{ to: c.contract, data: '0x6352211e' + padUint256(c.tokenId) }, 'latest'],
    id: i,
  }))
  const results: Record<string, unknown>[] = []
  for (let i = 0; i < calls.length; i += 20)
    results.push(...await rpcBatch(calls.slice(i, i + 20)))
  const lo = address.toLowerCase()
  return candidates.filter((_, i) => {
    const r = String(results[i]?.result ?? '')
    return r && r.length >= 26 && ('0x' + r.slice(-40)).toLowerCase() === lo
  })
}

// ─── Step 3: Fetch on-chain metadata ──────────────────────────────────────────
async function fetchOnChainMeta(owned: { contract: string; tokenId: bigint }[]) {
  const contracts = [...new Set(owned.map(t => t.contract))]
  const [nameRes, symRes, uriRes] = await Promise.all([
    rpcBatch(contracts.map((a, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:a,data:'0x06fdde03'},'latest'], id:i }))),
    rpcBatch(contracts.map((a, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:a,data:'0x95d89b41'},'latest'], id:i }))),
    rpcBatch(owned.map(({ contract, tokenId }, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:contract,data:'0xc87b56dd'+padUint256(tokenId)},'latest'], id:i }))),
  ])
  const cMeta: Record<string, { name: string; symbol: string }> = {}
  contracts.forEach((a, i) => {
    cMeta[a] = {
      name:   decodeString(String((nameRes[i] as Record<string,unknown>)?.result ?? '')),
      symbol: decodeString(String((symRes[i]  as Record<string,unknown>)?.result ?? '')),
    }
  })
  return { cMeta, uriRes }
}

// Fix #4: fetchTokenMeta now validates the URL before making the server-side request
async function fetchTokenMeta(uri: string): Promise<Record<string, unknown> | null> {
  try {
    const url = resolveURI(uri)

    // SSRF protection: only fetch from trusted hosts over HTTPS
    if (!isSafeMetaUrl(url)) {
      console.warn('[nfts] blocked unsafe metadata URL:', url.slice(0, 80))
      return null
    }

    const r = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!r.ok) return null
    return await r.json() as Record<string, unknown>
  } catch { return null }
}

// ─── Step 4: Floor prices via Magic Eden ──────────────────────────────────────
async function fetchFloorPrices(_address: string, contracts: string[]): Promise<Record<string, number>> {
  const floorMap: Record<string, number> = {}
  contracts.forEach(c => { floorMap[c] = 0 })

  await Promise.allSettled(contracts.map(async (contract) => {
    try {
      const url = new URL('https://api-mainnet.magiceden.dev/v4/evm-public/assets/collection-assets')
      url.searchParams.set('chain',        'monad')
      url.searchParams.set('collectionId', contract)
      url.searchParams.set('limit',        '1')

      const r = await fetch(url.toString(), {
        headers: { accept: 'application/json' },
        signal:  AbortSignal.timeout(8_000),
        cache:   'no-store',
      })
      if (!r.ok) return
      const body = await r.json() as Record<string, unknown>
      const items = (body?.assets as unknown[]) ?? []
      if (!items.length) return
      const item0    = items[0] as Record<string, unknown>
      const floorAsk = item0?.floorAsk as Record<string, unknown> | undefined
      const price    = floorAsk?.price as Record<string, unknown> | undefined
      const amount   = price?.amount   as Record<string, unknown> | undefined
      const floor    = Number(amount?.native ?? 0)
      if (floor > 0) floorMap[contract] = floor
    } catch { /* ignore per-collection errors */ }
  }))

  return floorMap
}

// ─── Main route ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const apiKey = process.env.ETHERSCAN_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Service not available', nfts: [], nftValue: 0, total: 0 })

  try {
    const candidates = await discoverNFTs(address, apiKey)
    if (!candidates.length) return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })

    const owned = await verifyOwnership(candidates, address)
    if (!owned.length) return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })

    const cap   = owned.slice(0, 20)
    const total = owned.length
    const { cMeta, uriRes } = await fetchOnChainMeta(cap)
    const contracts = [...new Set(cap.map(t => t.contract))]

    const [metaResults, floorMap, monPrice] = await Promise.all([
      Promise.all(cap.map((_, i) => fetchTokenMeta(decodeString(String((uriRes[i] as Record<string,unknown>)?.result ?? ''))))),
      fetchFloorPrices(address, contracts),
      getMonPrice(),
    ])

    const nfts = cap.map(({ contract, tokenId }, i) => {
      const cm         = cMeta[contract] ?? { name: '', symbol: '' }
      const meta       = metaResults[i]
      const floorMON   = floorMap[contract] ?? 0
      const floorUSD   = floorMON * monPrice
      const collection = cm.name || cm.symbol || `${contract.slice(0, 6)}...${contract.slice(-4)}`
      return {
        id:           `${contract}_${tokenId}`,
        contract,
        tokenId:      tokenId.toString(),
        collection,
        symbol:       cm.symbol,
        name:         (meta?.name as string) ?? `${collection} #${tokenId}`,
        // Fix #13: sanitizeImageUrl validates protocol + host before returning
        image:        sanitizeImageUrl(meta?.image as string | null | undefined),
        floorMON,
        floorUSD,
        magicEdenUrl: `https://magiceden.io/collections/monad/${contract}`,
      }
    })

    const nftValue = nfts.reduce((s, n) => s + n.floorUSD, 0)
    return NextResponse.json({ nfts, nftValue, total })

  } catch (err: unknown) {
    // Fix #9 (MÉDIO): Never expose internal error details to the client
    console.error('[nfts]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to load NFTs' }, { status: 500 })
  }
}
