import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

const RPC = 'https://rpc.monad.xyz'

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

function padUint256(n: bigint) {
  return n.toString(16).padStart(64, '0')
}
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

// ─── Step 1: Etherscan tokennfttx — chainid=143 (Monad mainnet) ───────────────
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

// ─── Step 4: floor price — tries several sources ─────────────────────────────
async function fetchFloorPrice(contract: string, debugLog: string[]): Promise<{ floorMON: number; floorUSD: number }> {
  const meKey = process.env.MAGIC_EDEN_API_KEY
  const headers: Record<string, string> = { accept: 'application/json' }
  if (meKey) headers['x-api-key'] = meKey  // ME uses x-api-key, not Authorization

  // All endpoints to try, in order
  const attempts = [
    // Magic Eden EVM — monad slug variants
    { label: 'ME/monad',          url: `https://api-mainnet.magiceden.dev/v3/rtp/monad/collections/v7?id=${contract}&limit=1` },
    { label: 'ME/monad-mainnet',  url: `https://api-mainnet.magiceden.dev/v3/rtp/monad-mainnet/collections/v7?id=${contract}&limit=1` },
    // Reservoir — the underlying engine ME uses
    { label: 'Reservoir/default', url: `https://api.reservoir.tools/collections/v7?id=${contract}&limit=1` },
  ]

  for (const { label, url } of attempts) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(6_000), cache: 'no-store' })
      const status = r.status
      if (!r.ok) {
        debugLog.push(`${label}: HTTP ${status}`)
        continue
      }
      const data     = await r.json()
      const col      = data?.collections?.[0]
      const floorMON = col?.floorAsk?.price?.amount?.native ?? 0
      const floorUSD = col?.floorAsk?.price?.amount?.usd    ?? 0
      debugLog.push(`${label}: HTTP ${status} — floor=${floorMON} MON / $${floorUSD} (col=${col?.name ?? 'null'})`)
      if (floorMON > 0 || floorUSD > 0) return { floorMON, floorUSD }
    } catch (e: any) {
      debugLog.push(`${label}: ERROR ${e.message}`)
    }
  }

  return { floorMON: 0, floorUSD: 0 }
}

// ─── Main route ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address  = req.nextUrl.searchParams.get('address')
  const isDebug  = req.nextUrl.searchParams.get('debug') === '1'

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const apiKey = process.env.ETHERSCAN_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'no_api_key', nfts: [], nftValue: 0, total: 0 })
  }

  const debugInfo: Record<string, any> = {}

  try {
    // 1. Discover via Etherscan
    const candidates = await discoverNFTs(address, apiKey)
    debugInfo.candidatesFromEtherscan = candidates.length

    if (candidates.length === 0) {
      return NextResponse.json({ nfts: [], nftValue: 0, total: 0, ...(isDebug ? { debug: debugInfo } : {}) })
    }

    // 2. Verify ownership
    const owned = await verifyOwnership(candidates, address)
    debugInfo.ownedAfterVerify = owned.length

    if (owned.length === 0) {
      return NextResponse.json({ nfts: [], nftValue: 0, total: 0, ...(isDebug ? { debug: debugInfo } : {}) })
    }

    const cap   = owned.slice(0, 20)
    const total = owned.length

    // 3. On-chain metadata
    const { cMeta, uriRes } = await fetchOnChainMeta(cap)

    // 4. Token metadata JSON + floor prices + MON price — all in parallel
    const contracts   = [...new Set(cap.map(t => t.contract))]
    const floorLogs: Record<string, string[]> = {}
    contracts.forEach(c => { floorLogs[c] = [] })

    const [metaResults, floorResults, monPrice] = await Promise.all([
      Promise.all(cap.map((_, i) => fetchTokenMeta(decodeString(uriRes[i]?.result ?? '')))),
      Promise.all(contracts.map(c => fetchFloorPrice(c, floorLogs[c]))),
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd', { next: { revalidate: 60 } })
        .then(r => r.json()).then(d => (d?.monad?.usd ?? 0) as number).catch(() => 0),
    ])

    if (isDebug) {
      debugInfo.floorLogs = floorLogs
      debugInfo.monPrice  = monPrice
    }

    const floorMap: Record<string, { floorMON: number; floorUSD: number }> = {}
    contracts.forEach((c, i) => { floorMap[c] = floorResults[i] })

    // 5. Build NFTs
    const nfts = cap.map(({ contract, tokenId }, i) => {
      const cm         = cMeta[contract] ?? { name: '', symbol: '' }
      const meta       = metaResults[i]
      const floor      = floorMap[contract] ?? { floorMON: 0, floorUSD: 0 }
      const collection = cm.name || cm.symbol || `${contract.slice(0, 6)}...${contract.slice(-4)}`
      const floorUSD   = floor.floorUSD > 0 ? floor.floorUSD : floor.floorMON * monPrice

      return {
        id:           `${contract}_${tokenId}`,
        contract,
        tokenId:      tokenId.toString(),
        collection,
        symbol:       cm.symbol,
        name:         meta?.name ?? `${collection} #${tokenId}`,
        image:        meta?.image ? resolveURI(String(meta.image)) : null,
        floorMON:     floor.floorMON,
        floorUSD,
        magicEdenUrl: `https://magiceden.io/item-details/monad/${contract}/${tokenId}`,
      }
    })

    const nftValue = nfts.reduce((s, n) => s + n.floorUSD, 0)
    return NextResponse.json({ nfts, nftValue, total, ...(isDebug ? { debug: debugInfo } : {}) })

  } catch (err: any) {
    console.error('[nfts]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Failed', ...(isDebug ? { debug: debugInfo } : {}) }, { status: 500 })
  }
}
