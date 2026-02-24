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
    signal: AbortSignal.timeout(10_000),
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

// ─── Step 1: discover NFTs via Etherscan V2 tokennfttx ────────────────────────
// Returns map of contractAddress → Set<tokenId as bigint>
async function discoverNFTs(address: string, apiKey: string): Promise<Map<string, Set<bigint>>> {
  const url = `https://api.etherscan.io/v2/api?chainid=10143&module=account&action=tokennfttx&address=${address}&page=1&offset=100&sort=desc&apikey=${apiKey}`
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`)
  const data = await res.json()

  // status '0' with NOTX message = valid empty result
  if (data.status !== '1') {
    if (data.message === 'No transactions found') return new Map()
    throw new Error(`Etherscan: ${data.message}`)
  }

  const txs: any[] = data.result
  const addrLower  = address.toLowerCase()

  // Build a map of token → last known owner direction
  // Use a map keyed by (contract, tokenId) → last tx (sorted desc = most recent first)
  const lastTx = new Map<string, any>()
  for (const tx of txs) {
    const key = `${tx.contractAddress.toLowerCase()}_${BigInt(tx.tokenID).toString()}`
    if (!lastTx.has(key)) lastTx.set(key, tx) // first = most recent (sort=desc)
  }

  // Keep only tokens where the most recent transfer was TO our address
  const owned = new Map<string, Set<bigint>>()
  for (const [, tx] of lastTx) {
    if (tx.to?.toLowerCase() !== addrLower) continue
    const contract = tx.contractAddress.toLowerCase()
    if (!owned.has(contract)) owned.set(contract, new Set())
    owned.get(contract)!.add(BigInt(tx.tokenID))
  }

  return owned
}

// ─── Step 2: verify current ownership via ownerOf RPC ────────────────────────
async function verifyOwnership(
  candidates: Map<string, Set<bigint>>,
  address: string
): Promise<{ contract: string; tokenId: bigint }[]> {
  const SEL_OWNER = '0x6352211e'
  const checks: { contract: string; tokenId: bigint; call: object }[] = []

  for (const [contract, ids] of candidates) {
    for (const tokenId of ids) {
      checks.push({
        contract, tokenId,
        call: {
          jsonrpc: '2.0', method: 'eth_call',
          params: [{ to: contract, data: SEL_OWNER + padUint256(tokenId) }, 'latest'],
          id: checks.length,
        },
      })
    }
  }

  if (!checks.length) return []

  // Batch in chunks of 20 to be gentle with the RPC
  const results: any[] = []
  for (let i = 0; i < checks.length; i += 20) {
    const chunk = await rpcBatch(checks.slice(i, i + 20).map(c => c.call))
    results.push(...chunk)
  }

  const addrLower = address.toLowerCase()
  return checks.filter((c, i) => {
    const r = results[i]?.result
    return r && r.length >= 26 && ('0x' + r.slice(-40)).toLowerCase() === addrLower
  }).map(c => ({ contract: c.contract, tokenId: c.tokenId }))
}

// ─── Step 3: fetch name/symbol/tokenURI for each token ───────────────────────
async function fetchOnChainMeta(owned: { contract: string; tokenId: bigint }[]) {
  const SEL_NAME    = '0x06fdde03'
  const SEL_SYMBOL  = '0x95d89b41'
  const SEL_URI     = '0xc87b56dd'
  const contracts   = [...new Set(owned.map(t => t.contract))]

  const [nameRes, symRes, uriRes] = await Promise.all([
    rpcBatch(contracts.map((a, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:a,data:SEL_NAME},'latest'], id:i }))),
    rpcBatch(contracts.map((a, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:a,data:SEL_SYMBOL},'latest'], id:i }))),
    rpcBatch(owned.map(({ contract, tokenId }, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:contract,data:SEL_URI+padUint256(tokenId)},'latest'], id:i }))),
  ])

  const cMeta: Record<string, { name: string; symbol: string }> = {}
  contracts.forEach((a, i) => {
    cMeta[a] = { name: decodeString(nameRes[i]?.result ?? ''), symbol: decodeString(symRes[i]?.result ?? '') }
  })

  return { cMeta, uriRes }
}

// ─── Step 4: fetch token metadata JSON from tokenURI ─────────────────────────
async function fetchTokenMetadata(uri: string): Promise<{ name?: string; image?: string } | null> {
  try {
    const url = resolveURI(uri)
    if (!url || url.startsWith('data:')) return null
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// ─── Step 5: get floor price from Magic Eden page (no API key needed) ─────────
// ME embeds collection data in the page's __NEXT_DATA__ JSON
async function getMEFloorPrice(contractAddress: string): Promise<{ floorMON: number; floorUSD: number }> {
  try {
    // ME collection page for Monad — parses __NEXT_DATA__ which contains stats
    const url = `https://magiceden.io/collections/monad/${contractAddress}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MonadBoard/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(6_000),
      cache: 'no-store',
    })
    if (!res.ok) return { floorMON: 0, floorUSD: 0 }

    const html = await res.text()

    // Extract __NEXT_DATA__ JSON
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/)
    if (!match) return { floorMON: 0, floorUSD: 0 }

    const nextData = JSON.parse(match[1])

    // Navigate to collection stats — path varies but floorPrice is usually here
    const props = nextData?.props?.pageProps
    const stats  = props?.collection?.stats ?? props?.stats ?? props?.collectionStats ?? {}

    // floorPrice is in lamports/wei equivalent — ME usually stores in native token units
    const floorNative = stats?.floor_price ?? stats?.floorPrice ?? stats?.floor ?? 0
    const floorUSD    = stats?.floor_price_usd ?? stats?.floorPriceUsd ?? 0

    return { floorMON: Number(floorNative) || 0, floorUSD: Number(floorUSD) || 0 }
  } catch {
    return { floorMON: 0, floorUSD: 0 }
  }
}

// ─── Main route ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const apiKey = process.env.ETHERSCAN_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'no_api_key', nfts: [], nftValue: 0, total: 0 })
  }

  try {
    // 1. Discover via Etherscan (fast, reliable)
    const candidates = await discoverNFTs(address, apiKey)

    if (candidates.size === 0) {
      return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })
    }

    // 2. Verify current ownership on-chain
    const owned = await verifyOwnership(candidates, address)

    if (owned.length === 0) {
      return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })
    }

    // Cap at 20 for performance
    const cap = owned.slice(0, 20)
    const total = owned.length

    // 3. Fetch on-chain metadata (name, symbol, tokenURI)
    const { cMeta, uriRes } = await fetchOnChainMeta(cap)

    // 4. Fetch token JSON metadata + floor prices in parallel
    const contracts = [...new Set(cap.map(t => t.contract))]
    const [metaResults, floorResults] = await Promise.all([
      // Token metadata from tokenURIs
      Promise.all(cap.map(async ({ contract, tokenId }, i) => {
        const rawUri = decodeString(uriRes[i]?.result ?? '')
        return fetchTokenMetadata(rawUri)
      })),
      // Floor prices from Magic Eden pages
      Promise.all(contracts.map(c => getMEFloorPrice(c))),
    ])

    const floorMap: Record<string, { floorMON: number; floorUSD: number }> = {}
    contracts.forEach((c, i) => { floorMap[c] = floorResults[i] })

    // 5. Build final NFT list
    const nfts = cap.map(({ contract, tokenId }, i) => {
      const cm      = cMeta[contract] ?? { name: 'Unknown', symbol: '?' }
      const meta    = metaResults[i]
      const floor   = floorMap[contract] ?? { floorMON: 0, floorUSD: 0 }
      const rawUri  = decodeString(uriRes[i]?.result ?? '')

      return {
        id:           `${contract}_${tokenId}`,
        contract,
        tokenId:      tokenId.toString(),
        collection:   cm.name || cm.symbol || contract.slice(0, 10) + '...',
        symbol:       cm.symbol,
        name:         meta?.name ?? `${cm.name || cm.symbol} #${tokenId}`,
        image:        meta?.image ? resolveURI(meta.image) : null,
        floorMON:     floor.floorMON,
        floorUSD:     floor.floorUSD,
        magicEdenUrl: `https://magiceden.io/item-details/monad/${contract}/${tokenId}`,
      }
    })

    const nftValue = nfts.reduce((s, n) => s + n.floorUSD, 0)

    return NextResponse.json({ nfts, nftValue, total })

  } catch (err: any) {
    console.error('[nfts]', err?.message ?? err)
    return NextResponse.json({ error: 'Failed to fetch NFTs' }, { status: 500 })
  }
}
