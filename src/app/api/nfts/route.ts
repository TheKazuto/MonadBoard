import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

const RPC = 'https://rpc.monad.xyz'
const MONAD_CHAIN_ID = 143

// ─── RPC helpers ──────────────────────────────────────────────────────────────
async function rpcBatch(calls: object[]): Promise<any[]> {
  if (!calls.length) return []
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calls),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })
  const data = await res.json()
  return Array.isArray(data) ? data : [data]
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
  return uri.startsWith('ipfs://') ? uri.replace('ipfs://', 'https://ipfs.io/ipfs/') : uri
}

// ─── Step 1: Etherscan tokennfttx chainid=143 (Monad mainnet) ─────────────────
async function discoverNFTs(address: string, apiKey: string) {
  const url = `https://api.etherscan.io/v2/api?chainid=143&module=account&action=tokennfttx&address=${address}&page=1&offset=100&sort=desc&apikey=${apiKey}`
  const res  = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  const data = await res.json()
  if (data.status !== '1') {
    if (data.message?.includes('No transactions')) return []
    throw new Error(`Etherscan: ${data.message}`)
  }
  const addrLower = address.toLowerCase()
  const lastTx    = new Map<string, any>()
  for (const tx of data.result as any[]) {
    const key = `${tx.contractAddress.toLowerCase()}_${BigInt(tx.tokenID)}`
    if (!lastTx.has(key)) lastTx.set(key, tx)
  }
  return [...lastTx.values()]
    .filter(tx => tx.to?.toLowerCase() === addrLower)
    .map(tx => ({ contract: tx.contractAddress.toLowerCase(), tokenId: BigInt(tx.tokenID) }))
}

// ─── Step 2: verify ownerOf ───────────────────────────────────────────────────
async function verifyOwnership(candidates: { contract: string; tokenId: bigint }[], address: string) {
  const calls = candidates.map((c, i) => ({
    jsonrpc: '2.0', method: 'eth_call',
    params: [{ to: c.contract, data: '0x6352211e' + padUint256(c.tokenId) }, 'latest'],
    id: i,
  }))
  const results: any[] = []
  for (let i = 0; i < calls.length; i += 20)
    results.push(...await rpcBatch(calls.slice(i, i + 20)))
  const lo = address.toLowerCase()
  return candidates.filter((_, i) => {
    const r = results[i]?.result
    return r && r.length >= 26 && ('0x' + r.slice(-40)).toLowerCase() === lo
  })
}

// ─── Step 3: on-chain name/symbol/tokenURI ────────────────────────────────────
async function fetchOnChainMeta(owned: { contract: string; tokenId: bigint }[]) {
  const contracts = [...new Set(owned.map(t => t.contract))]
  const [nameRes, symRes, uriRes] = await Promise.all([
    rpcBatch(contracts.map((a, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:a,data:'0x06fdde03'},'latest'], id:i }))),
    rpcBatch(contracts.map((a, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:a,data:'0x95d89b41'},'latest'], id:i }))),
    rpcBatch(owned.map(({ contract, tokenId }, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:contract,data:'0xc87b56dd'+padUint256(tokenId)},'latest'], id:i }))),
  ])
  const cMeta: Record<string, { name: string; symbol: string }> = {}
  contracts.forEach((a, i) => {
    cMeta[a] = { name: decodeString(nameRes[i]?.result ?? ''), symbol: decodeString(symRes[i]?.result ?? '') }
  })
  return { cMeta, uriRes }
}

async function fetchTokenMeta(uri: string) {
  try {
    const url = resolveURI(uri)
    if (!url || url.startsWith('data:')) return null
    const r = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    return r.ok ? await r.json() : null
  } catch { return null }
}

// ─── Step 4: Floor price via ME v4 evm-public API (no key needed) ─────────────
// Strategy A: user-assets — returns NFTs with floor price info (best for wallets)
// Strategy B: collections search by contract address
// Strategy C: v3/rtp/monad collections endpoint (legacy)

async function fetchFloorPricesForWallet(
  address: string,
  contracts: string[]
): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  contracts.forEach(c => { result[c] = 0 })

  // ── Strategy A: ME v4 user-assets (returns all NFTs with floor prices) ──
  try {
    const url = `https://api-mainnet.magiceden.dev/v4/evm-public/assets/user-assets?` +
      `chain_id=${MONAD_CHAIN_ID}&wallet_address=${address}&limit=100`
    const r = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    })
    if (r.ok) {
      const data = await r.json()
      // Response structure: { assets: [{ contract_address, floor_price, ... }] }
      const assets: any[] = data?.assets ?? data?.data ?? data?.results ?? []
      for (const asset of assets) {
        const c = (asset?.contract_address ?? asset?.contractAddress ?? '').toLowerCase()
        if (!c || !result.hasOwnProperty(c)) continue
        const floor =
          asset?.floor_price ??
          asset?.floorPrice ??
          asset?.collection?.floor_price ??
          asset?.collection?.floorPrice ??
          0
        if (floor > 0 && result[c] === 0) result[c] = Number(floor)
      }
      // If we got data, check if any contracts are still missing
      const missing = contracts.filter(c => result[c] === 0)
      if (missing.length === 0) return result
      console.log('[nfts] v4 user-assets: missing floor for', missing)
    } else {
      console.log('[nfts] v4 user-assets HTTP', r.status)
    }
  } catch (e: any) {
    console.log('[nfts] v4 user-assets error:', e.message)
  }

  // ── Strategy B: ME v4 collections/search per contract ──
  const stillMissing = contracts.filter(c => result[c] === 0)
  await Promise.all(stillMissing.map(async (contract) => {
    try {
      const url = `https://api-mainnet.magiceden.dev/v4/evm-public/collections/search?` +
        `chain_id=${MONAD_CHAIN_ID}&contract_address=${contract}&limit=1`
      const r = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(6_000),
        cache: 'no-store',
      })
      if (r.ok) {
        const data = await r.json()
        const col  = (data?.collections ?? data?.data ?? [])[0]
        const floor = col?.floor_price ?? col?.floorPrice ?? col?.stats?.floor_price ?? 0
        if (floor > 0) result[contract] = Number(floor)
        console.log('[nfts] v4 search', contract, '→', floor)
      } else {
        console.log('[nfts] v4 search HTTP', r.status, 'for', contract)
      }
    } catch (e: any) {
      console.log('[nfts] v4 search error', contract, e.message)
    }
  }))

  // ── Strategy C: v3/rtp/monad (legacy, may work with API key) ──
  const stillMissing2 = contracts.filter(c => result[c] === 0)
  const meKey = process.env.MAGIC_EDEN_API_KEY
  if (stillMissing2.length && meKey) {
    await Promise.all(stillMissing2.map(async (contract) => {
      try {
        const url = `https://api-mainnet.magiceden.dev/v3/rtp/monad/collections/v7?id=${contract}&limit=1`
        const r   = await fetch(url, {
          headers: { accept: 'application/json', 'Authorization': `Bearer ${meKey}` },
          signal: AbortSignal.timeout(5_000),
          cache: 'no-store',
        })
        if (r.ok) {
          const floor = (await r.json())?.collections?.[0]?.floorAsk?.price?.amount?.native ?? 0
          if (floor > 0) result[contract] = Number(floor)
        }
      } catch { /* ignore */ }
    }))
  }

  return result
}

// ─── Main route ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  const isDebug = req.nextUrl.searchParams.get('debug') === '1'

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const apiKey = process.env.ETHERSCAN_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'no_api_key', nfts: [], nftValue: 0, total: 0 })

  try {
    // 1. Discover via Etherscan
    const candidates = await discoverNFTs(address, apiKey)
    if (!candidates.length) return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })

    // 2. Verify ownership
    const owned = await verifyOwnership(candidates, address)
    if (!owned.length) return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })

    const cap   = owned.slice(0, 20)
    const total = owned.length

    // 3. On-chain metadata
    const { cMeta, uriRes } = await fetchOnChainMeta(cap)
    const contracts = [...new Set(cap.map(t => t.contract))]

    // 4. All parallel: token JSON metadata + floor prices (via ME v4) + MON price
    const [metaResults, floorMap, monPrice] = await Promise.all([
      Promise.all(cap.map((_, i) => fetchTokenMeta(decodeString(uriRes[i]?.result ?? '')))),
      fetchFloorPricesForWallet(address, contracts),
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd', { next: { revalidate: 60 } })
        .then(r => r.json()).then(d => (d?.monad?.usd ?? 0) as number).catch(() => 0),
    ])

    // 5. Build response
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
        name:         meta?.name ?? `${collection} #${tokenId}`,
        image:        meta?.image ? resolveURI(String(meta.image)) : null,
        floorMON,
        floorUSD,
        magicEdenUrl: `https://magiceden.io/collections/monad/${contract}`,
      }
    })

    const nftValue = nfts.reduce((s, n) => s + n.floorUSD, 0)
    const debugInfo = isDebug ? {
      monPrice,
      meApiKey: !!process.env.MAGIC_EDEN_API_KEY,
      floorMap,
      contracts,
    } : undefined

    return NextResponse.json({ nfts, nftValue, total, ...(debugInfo ? { debug: debugInfo } : {}) })

  } catch (err: any) {
    console.error('[nfts]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 })
  }
}
