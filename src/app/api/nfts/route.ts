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

// ─── Step 1 ───────────────────────────────────────────────────────────────────
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

// ─── Step 2 ───────────────────────────────────────────────────────────────────
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

// ─── Step 3 ───────────────────────────────────────────────────────────────────
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

// ─── Step 4: Floor prices with FULL debug output ───────────────────────────────
async function fetchFloorPricesDebug(
  address: string,
  contracts: string[]
): Promise<{ floorMap: Record<string, number>; log: string[] }> {
  const floorMap: Record<string, number> = {}
  contracts.forEach(c => { floorMap[c] = 0 })
  const log: string[] = []

  // ── A: v4 user-assets — walletAddresses must be array (repeated param) ──
  try {
    const url = `https://api-mainnet.magiceden.dev/v4/evm-public/assets/user-assets?chain=monad&walletAddresses[]=${address}&limit=100`
    log.push(`A GET ${url}`)
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000), cache: 'no-store' })
    log.push(`A status=${r.status}`)
    const text = await r.text().catch(() => '')
    if (r.ok) {
      try {
        const body = JSON.parse(text)
        log.push(`A keys=${Object.keys(body).join(',')}`)
        const assets: any[] = body?.assets ?? body?.data ?? body?.results ?? body?.items ?? []
        log.push(`A assets_count=${assets.length}`)
        if (assets.length > 0) log.push(`A sample_keys=${Object.keys(assets[0]).slice(0, 12).join(',')}`)
        for (const asset of assets) {
          const c = (asset?.contract_address ?? asset?.contractAddress ?? asset?.collection?.id ?? asset?.collection?.contract_address ?? '').toLowerCase()
          if (contracts.includes(c)) {
            const floor = asset?.floor_price ?? asset?.floorPrice ?? asset?.collection?.floor_price ?? asset?.collection?.floorPrice ?? 0
            log.push(`A found contract=${c} floor=${floor}`)
            if (floor > 0) floorMap[c] = Number(floor)
          }
        }
      } catch { log.push(`A parse_error body=${text.slice(0, 200)}`) }
    } else {
      log.push(`A error_body=${text.slice(0, 400)}`)
    }
  } catch (e: any) { log.push(`A exception=${e.message}`) }

  // ── B: v4 collection stats endpoint (separate from the collections metadata endpoint) ──
  for (const contract of contracts.filter(c => floorMap[c] === 0)) {
    try {
      // Try the stats sub-endpoint
      const url = `https://api-mainnet.magiceden.dev/v4/evm-public/collections/${contract}/stats?chain=monad`
      log.push(`B GET ${url}`)
      const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6_000), cache: 'no-store' })
      log.push(`B status=${r.status}`)
      const text = await r.text().catch(() => '')
      if (r.ok) {
        try {
          const body = JSON.parse(text)
          log.push(`B keys=${Object.keys(body).join(',')}`)
          const floor = body?.floor_price ?? body?.floorPrice ?? body?.stats?.floor_price ?? body?.floorAsk?.price?.amount?.native ?? 0
          log.push(`B floor=${floor} | body=${JSON.stringify(body).slice(0, 400)}`)
          if (floor > 0) floorMap[contract] = Number(floor)
        } catch { log.push(`B parse_error body=${text.slice(0, 300)}`) }
      } else {
        log.push(`B error_body=${text.slice(0, 400)}`)
      }
    } catch (e: any) { log.push(`B exception=${e.message}`) }
  }

  // ── C: v4 collection stats with collectionId path param ──
  for (const contract of contracts.filter(c => floorMap[c] === 0)) {
    try {
      const url = `https://api-mainnet.magiceden.dev/v4/evm-public/collections/${contract}/market-stats?chain=monad`
      log.push(`C GET ${url}`)
      const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6_000), cache: 'no-store' })
      log.push(`C status=${r.status}`)
      const text = await r.text().catch(() => '')
      if (r.ok) {
        try {
          const body = JSON.parse(text)
          log.push(`C keys=${Object.keys(body).join(',')} | body=${JSON.stringify(body).slice(0, 400)}`)
          const floor = body?.floor_price ?? body?.floorPrice ?? body?.floorAsk?.price?.amount?.native ?? 0
          if (floor > 0) floorMap[contract] = Number(floor)
        } catch { log.push(`C parse_error`) }
      } else {
        log.push(`C error_body=${text.slice(0, 400)}`)
      }
    } catch (e: any) { log.push(`C exception=${e.message}`) }
  }

  // ── D: v4 listings endpoint — cheapest listing = floor price ──
  for (const contract of contracts.filter(c => floorMap[c] === 0)) {
    try {
      const url = `https://api-mainnet.magiceden.dev/v4/evm-public/collections/${contract}/listings?chain=monad&limit=1&sortBy=price&sortDirection=asc`
      log.push(`D GET ${url}`)
      const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6_000), cache: 'no-store' })
      log.push(`D status=${r.status}`)
      const text = await r.text().catch(() => '')
      if (r.ok) {
        try {
          const body = JSON.parse(text)
          log.push(`D keys=${Object.keys(body).join(',')}`)
          const items: any[] = body?.listings ?? body?.orders ?? body?.data ?? body?.results ?? body?.items ?? []
          log.push(`D items_count=${items.length}`)
          if (items.length > 0) {
            log.push(`D item0_keys=${Object.keys(items[0]).slice(0, 15).join(',')}`)
            log.push(`D item0=${JSON.stringify(items[0]).slice(0, 400)}`)
            const listing = items[0]
            const floor = listing?.price ?? listing?.price_amount ?? listing?.priceAmount ?? listing?.price?.amount?.native ?? 0
            log.push(`D floor=${floor}`)
            if (floor > 0) floorMap[contract] = Number(floor)
          }
        } catch { log.push(`D parse_error body=${text.slice(0, 300)}`) }
      } else {
        log.push(`D error_body=${text.slice(0, 400)}`)
      }
    } catch (e: any) { log.push(`D exception=${e.message}`) }
  }

  // ── C: v3/rtp/monad (requires API key) ──
  for (const contract of contracts.filter(c => floorMap[c] === 0)) {
    const meKey = process.env.MAGIC_EDEN_API_KEY
    try {
      const url = `https://api-mainnet.magiceden.dev/v3/rtp/monad/collections/v7?id=${contract}&limit=1`
      log.push(`C GET ${url} (hasKey=${!!meKey})`)
      const headers: Record<string,string> = { accept: 'application/json' }
      if (meKey) headers['Authorization'] = `Bearer ${meKey}`
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(6_000), cache: 'no-store' })
      log.push(`C status=${r.status}`)
      const text = await r.text().catch(() => '')
      if (r.ok) {
        try {
          const body = JSON.parse(text)
          const col  = body?.collections?.[0]
          const floor = col?.floorAsk?.price?.amount?.native ?? 0
          log.push(`C col=${col?.name ?? 'null'} floor=${floor}`)
          if (floor > 0) floorMap[contract] = Number(floor)
        } catch { log.push(`C parse_error`) }
      } else {
        log.push(`C error_body=${text.slice(0, 400)}`)
      }
    } catch (e: any) { log.push(`C exception=${e.message}`) }
  }

  return { floorMap, log }
}

// Non-debug version for production
async function fetchFloorPrices(address: string, contracts: string[]): Promise<Record<string, number>> {
  const { floorMap } = await fetchFloorPricesDebug(address, contracts)
  return floorMap
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
    const candidates = await discoverNFTs(address, apiKey)
    if (!candidates.length) return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })

    const owned = await verifyOwnership(candidates, address)
    if (!owned.length) return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })

    const cap   = owned.slice(0, 20)
    const total = owned.length
    const { cMeta, uriRes } = await fetchOnChainMeta(cap)
    const contracts = [...new Set(cap.map(t => t.contract))]

    const [metaResults, floorResult, monPrice] = await Promise.all([
      Promise.all(cap.map((_, i) => fetchTokenMeta(decodeString(uriRes[i]?.result ?? '')))),
      isDebug ? fetchFloorPricesDebug(address, contracts) : fetchFloorPrices(address, contracts).then(fm => ({ floorMap: fm, log: [] as string[] })),
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd', { next: { revalidate: 60 } })
        .then(r => r.json()).then(d => (d?.monad?.usd ?? 0) as number).catch(() => 0),
    ])

    const { floorMap, log } = floorResult

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

    return NextResponse.json({
      nfts, nftValue, total,
      ...(isDebug ? { debug: { monPrice, meApiKey: !!process.env.MAGIC_EDEN_API_KEY, floorMap, log } } : {}),
    })

  } catch (err: any) {
    console.error('[nfts]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 })
  }
}
