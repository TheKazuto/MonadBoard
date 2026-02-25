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

// ─── Step 1: Etherscan tokennfttx chainid=143 ────────────────────────────────
async function discoverNFTs(address: string, apiKey: string) {
  const url  = `https://api.etherscan.io/v2/api?chainid=143&module=account&action=tokennfttx&address=${address}&page=1&offset=100&sort=desc&apikey=${apiKey}`
  const res  = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  const data = await res.json()

  if (data.status !== '1') {
    if (data.message?.includes('No transactions')) return []
    throw new Error(`Etherscan: ${data.message}`)
  }

  const addrLower = address.toLowerCase()
  const lastTx    = new Map<string, any>()
  for (const tx of data.result as any[])
    lastTx.set(`${tx.contractAddress.toLowerCase()}_${BigInt(tx.tokenID)}`, lastTx.has(`${tx.contractAddress.toLowerCase()}_${BigInt(tx.tokenID)}`) ? lastTx.get(`${tx.contractAddress.toLowerCase()}_${BigInt(tx.tokenID)}`) : tx)

  return [...lastTx.values()]
    .filter(tx => tx.to?.toLowerCase() === addrLower)
    .map(tx => ({ contract: tx.contractAddress.toLowerCase(), tokenId: BigInt(tx.tokenID) }))
}

// ─── Step 2: ownerOf verification ────────────────────────────────────────────
async function verifyOwnership(candidates: { contract: string; tokenId: bigint }[], address: string) {
  const calls = candidates.map((c, i) => ({
    jsonrpc: '2.0', method: 'eth_call',
    params: [{ to: c.contract, data: '0x6352211e' + padUint256(c.tokenId) }, 'latest'], id: i,
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

// ─── Step 3: name/symbol/tokenURI ─────────────────────────────────────────────
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

// ─── Step 4: floor price — ME API + page scraping ────────────────────────────
const ME_BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
}

async function fetchFloorFromMEApi(contract: string): Promise<number> {
  const meKey = process.env.MAGIC_EDEN_API_KEY
  const headers: Record<string,string> = { accept: 'application/json' }
  if (meKey) headers['Authorization'] = `Bearer ${meKey}`

  for (const slug of ['monad', 'monad-mainnet']) {
    try {
      const r = await fetch(
        `https://api-mainnet.magiceden.dev/v3/rtp/${slug}/collections/v7?id=${contract}&limit=1`,
        { headers, signal: AbortSignal.timeout(5_000), cache: 'no-store' }
      )
      if (!r.ok) continue
      const floor = (await r.json())?.collections?.[0]?.floorAsk?.price?.amount?.native ?? 0
      if (floor > 0) return floor
    } catch { /* next slug */ }
  }
  return 0
}

async function fetchFloorFromMEPage(contract: string): Promise<number> {
  try {
    const r = await fetch(`https://magiceden.io/collections/monad/${contract}`, {
      headers: ME_BROWSER_HEADERS,
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (!r.ok) return 0
    const html = await r.text()

    // ── A: Parse __NEXT_DATA__ (SSR JSON blob) ──
    const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (ndMatch) {
      try {
        const str = ndMatch[1]
        // Search for any floor price key in the entire JSON string
        for (const pat of [
          /"floorPrice"\s*:\s*([\d.]+)/,
          /"floor_price"\s*:\s*([\d.]+)/,
          /"floorAsk"\s*:\s*\{[^}]*"native"\s*:\s*([\d.]+)/,
          /"native"\s*:\s*([\d.]+)[^}]*"usd"/,
        ]) {
          const m = str.match(pat)
          if (m) {
            const v = parseFloat(m[1])
            if (v > 0 && v < 10_000_000) return v
          }
        }
      } catch { /* fall through */ }
    }

    // ── B: Scan all JSON-like blobs in script tags ──
    const scriptBlobs = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    for (const [, blob] of scriptBlobs) {
      for (const pat of [/"floorPrice"\s*:\s*([\d.]+)/, /"floor_price"\s*:\s*([\d.]+)/]) {
        const m = blob.match(pat)
        if (m) {
          const v = parseFloat(m[1])
          if (v > 0 && v < 10_000_000) return v
        }
      }
    }

    // ── C: Visible text — "Floor\n88.00\nMON" or "88.00 MON" near "floor" ──
    // Strip tags first for cleaner matching
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const textPatterns = [
      /floor\s+(?:price\s+)?(\d[\d,]*\.?\d*)\s*(?:K\s+)?mon/i,
      /(\d[\d,]*\.?\d*)\s*(?:K\s+)?mon\s+floor/i,
      /floor\s*:\s*(\d[\d,]*\.?\d*)/i,
    ]
    for (const pat of textPatterns) {
      const m = text.match(pat)
      if (m) {
        let val = m[1].replace(',', '')
        const v = parseFloat(val)
        if (v > 0 && v < 10_000_000) return v
      }
    }

    return 0
  } catch { return 0 }
}

async function fetchFloorMON(contract: string): Promise<number> {
  // Run API and page scrape in parallel — first non-zero wins
  const [apiFloor, pageFloor] = await Promise.all([
    fetchFloorFromMEApi(contract),
    fetchFloorFromMEPage(contract),
  ])
  return apiFloor || pageFloor || 0
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
    // 1. Discover NFTs
    const candidates = await discoverNFTs(address, apiKey)
    if (!candidates.length) return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })

    // 2. Verify ownership
    const owned = await verifyOwnership(candidates, address)
    if (!owned.length) return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })

    const cap   = owned.slice(0, 20)
    const total = owned.length

    // 3. On-chain metadata
    const { cMeta, uriRes } = await fetchOnChainMeta(cap)

    // 4. Token JSON metadata + floor prices + MON price — all parallel
    const contracts = [...new Set(cap.map(t => t.contract))]

    const [metaResults, floorResults, monPrice] = await Promise.all([
      Promise.all(cap.map((_, i) => fetchTokenMeta(decodeString(uriRes[i]?.result ?? '')))),
      Promise.all(contracts.map(c => fetchFloorMON(c))),
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd', { next: { revalidate: 60 } })
        .then(r => r.json()).then(d => (d?.monad?.usd ?? 0) as number).catch(() => 0),
    ])

    const floorMap: Record<string, number> = {}
    contracts.forEach((c, i) => { floorMap[c] = floorResults[i] })

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
      contracts: contracts.map((c, i) => ({
        contract: c,
        floorMON: floorResults[i],
        mePageUrl: `https://magiceden.io/collections/monad/${c}`,
      })),
    } : undefined

    return NextResponse.json({ nfts, nftValue, total, ...(debugInfo ? { debug: debugInfo } : {}) })

  } catch (err: any) {
    console.error('[nfts]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 })
  }
}
