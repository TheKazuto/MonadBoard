import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

const RPC         = 'https://rpc.monad.xyz'
const ME_BASE     = 'https://api-mainnet.magiceden.dev/v3/rtp/monad'
const MONAD_SCAN  = 'https://api.monadexplorer.com/api/v2'  // Blockscout-compatible

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolveURI(uri: string): string {
  if (!uri) return ''
  return uri.startsWith('ipfs://') ? uri.replace('ipfs://', 'https://ipfs.io/ipfs/') : uri
}

function padUint256(n: bigint) {
  return n.toString(16).padStart(64, '0')
}

function decodeString(hex: string): string {
  try {
    if (!hex || hex === '0x') return ''
    const bytes = Buffer.from(hex.slice(2), 'hex')
    if (bytes.length < 64) return ''
    const len = Number(BigInt('0x' + bytes.slice(32, 64).toString('hex')))
    return bytes.slice(64, 64 + len).toString('utf8').replace(/\0/g, '')
  } catch { return '' }
}

async function rpcCall(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  return (await res.json())?.result
}

async function rpcBatch(calls: object[]): Promise<any[]> {
  if (!calls.length) return []
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calls),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  const data = await res.json()
  return Array.isArray(data) ? data : [data]
}

async function fetchMetadata(uri: string) {
  try {
    const url = resolveURI(uri)
    if (!url || url.startsWith('data:')) return null
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

async function getMonPrice(): Promise<number> {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd', { next: { revalidate: 60 } })
    return (await r.json())?.monad?.usd ?? 0
  } catch { return 0 }
}

// ─── Try Magic Eden for wallet NFTs ───────────────────────────────────────────
async function tryMagicEden(address: string, apiKey?: string) {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const res = await fetch(
    `${ME_BASE}/users/${address}/tokens/v7?limit=50&sortBy=acquiredAt&excludeSpam=true&excludeBurnt=true`,
    { headers, signal: AbortSignal.timeout(8000), cache: 'no-store' }
  )
  if (!res.ok) return null

  const data = await res.json()
  const tokens: any[] = data?.tokens ?? []
  if (!tokens.length) return null   // empty = fall through

  return { tokens, totalCount: data?.totalCount ?? tokens.length }
}

// ─── Blockscout-compatible NFT tokens endpoint ────────────────────────────────
async function tryBlockscout(address: string) {
  // MonadScan/Blockscout: GET /v2/addresses/{address}/nft?type=ERC-721,ERC-1155
  const res = await fetch(
    `${MONAD_SCAN}/addresses/${address}/nft?type=ERC-721,ERC-1155&limit=50`,
    { signal: AbortSignal.timeout(8000), cache: 'no-store' }
  )
  if (!res.ok) return null
  const data = await res.json()
  const items: any[] = data?.items ?? data?.result ?? []
  if (!items.length) return null
  return items
}

// ─── Etherscan V2 tokennfttx ──────────────────────────────────────────────────
async function tryEtherscanNFT(address: string, apiKey?: string) {
  if (!apiKey) return null
  const url = `https://api.etherscan.io/v2/api?chainid=10143&module=account&action=tokennfttx&address=${address}&page=1&offset=100&sort=desc&apikey=${apiKey}`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  if (data.status !== '1') return null

  // Filter: only txs where `to` = address (received), deduplicate by contractAddress+tokenID
  const received = (data.result as any[]).filter(tx => tx.to?.toLowerCase() === address.toLowerCase())
  // Deduplicate: keep last known state (sort by blockNumber desc, first = most recent)
  const seen = new Map<string, any>()
  for (const tx of received) {
    const key = `${tx.contractAddress.toLowerCase()}_${tx.tokenID}`
    if (!seen.has(key)) seen.set(key, tx)
  }
  return [...seen.values()]
}

// ─── RPC fallback: getLogs with small ranges to avoid RPC limits ───────────────
async function tryRPCLogs(address: string) {
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  const paddedAddr = '0x000000000000000000000000' + address.slice(2).toLowerCase()

  const latestHex = await rpcCall('eth_blockNumber', []) as string
  const latest    = parseInt(latestHex, 16)

  // Scan in small chunks — most RPCs allow max 10k blocks per getLogs call
  const CHUNK = 10_000
  const SCAN_BACK = 100_000 // ~34 hours at 1.2s/block
  const candidates = new Map<string, Set<string>>()

  for (let end = latest; end > latest - SCAN_BACK; end -= CHUNK) {
    const start = Math.max(0, end - CHUNK)
    try {
      const result = await rpcCall('eth_getLogs', [{
        fromBlock: '0x' + start.toString(16),
        toBlock:   '0x' + end.toString(16),
        topics: [TRANSFER_TOPIC, null, paddedAddr],
      }])
      if (!Array.isArray(result)) break
      for (const log of result) {
        if (log.topics?.length !== 4) continue // only ERC-721
        const c = log.address.toLowerCase()
        if (!candidates.has(c)) candidates.set(c, new Set())
        candidates.get(c)!.add(log.topics[3])
      }
    } catch { break }
  }
  return candidates
}

// ─── Verify current ownership ─────────────────────────────────────────────────
async function verifyOwnership(candidates: Map<string, Set<string>>, address: string) {
  const SEL_OWNER_OF = '0x6352211e'
  const checks: { contract: string; tokenId: bigint; call: object }[] = []

  for (const [contract, ids] of candidates) {
    for (const idHex of ids) {
      const tokenId = BigInt(idHex)
      checks.push({
        contract, tokenId,
        call: { jsonrpc: '2.0', method: 'eth_call', params: [{ to: contract, data: SEL_OWNER_OF + padUint256(tokenId) }, 'latest'], id: `o${checks.length}` }
      })
    }
  }

  const results: any[] = []
  for (let i = 0; i < checks.length; i += 50) {
    results.push(...await rpcBatch(checks.slice(i, i + 50).map(c => c.call)))
  }

  return checks.filter((c, i) => {
    const r = results[i]?.result
    return r && r !== '0x' && ('0x' + r.slice(-40)).toLowerCase() === address.toLowerCase()
  })
}

// ─── Enrich tokens with name/image/floor ──────────────────────────────────────
async function enrichNFTs(
  owned: { contract: string; tokenId: bigint }[],
  monPrice: number,
  apiKey?: string
) {
  const SEL_NAME      = '0x06fdde03'
  const SEL_SYMBOL    = '0x95d89b41'
  const SEL_TOKEN_URI = '0xc87b56dd'

  const contractAddrs = [...new Set(owned.map(t => t.contract))]

  const [nameRes, symRes, uriRes] = await Promise.all([
    rpcBatch(contractAddrs.map((a, i) => ({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: a, data: SEL_NAME }, 'latest'], id: `n${i}` }))),
    rpcBatch(contractAddrs.map((a, i) => ({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: a, data: SEL_SYMBOL }, 'latest'], id: `s${i}` }))),
    rpcBatch(owned.map(({ contract, tokenId }, i) => ({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: contract, data: SEL_TOKEN_URI + padUint256(tokenId) }, 'latest'], id: `u${i}` }))),
  ])

  const cMeta: Record<string, { name: string; symbol: string }> = {}
  contractAddrs.forEach((a, i) => {
    cMeta[a] = { name: decodeString(nameRes[i]?.result ?? ''), symbol: decodeString(symRes[i]?.result ?? '') }
  })

  // Floor prices from Magic Eden
  const floorMap: Record<string, number> = {}
  await Promise.all(contractAddrs.map(async (contract) => {
    try {
      const headers: Record<string, string> = { accept: 'application/json' }
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
      const r = await fetch(`${ME_BASE}/collections/v7?id=${contract}`, { headers, signal: AbortSignal.timeout(5000), cache: 'no-store' })
      if (r.ok) {
        const d = await r.json()
        floorMap[contract] = d?.collections?.[0]?.floorAsk?.price?.amount?.native ?? 0
      }
    } catch { /* ignore */ }
  }))

  return Promise.all(owned.map(async ({ contract, tokenId }, i) => {
    const rawUri  = decodeString(uriRes[i]?.result ?? '')
    const meta    = rawUri ? await fetchMetadata(rawUri) : null
    const cm      = cMeta[contract] ?? { name: 'Unknown', symbol: '?' }
    const floorMON = floorMap[contract] ?? 0

    return {
      id:           `${contract}_${tokenId}`,
      contract,
      tokenId:      tokenId.toString(),
      collection:   cm.name || cm.symbol || contract.slice(0, 10) + '...',
      symbol:       cm.symbol,
      name:         meta?.name ?? `${cm.name || cm.symbol} #${tokenId}`,
      image:        meta?.image ? resolveURI(meta.image) : null,
      floorMON,
      floorUSD:     floorMON * monPrice,
      magicEdenUrl: `https://magiceden.io/item-details/monad/${contract}/${tokenId}`,
    }
  }))
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const etherscanKey = process.env.ETHERSCAN_API_KEY
  const meKey        = process.env.MAGIC_EDEN_API_KEY

  try {
    const monPrice = await getMonPrice()

    // ── 1. Try Magic Eden (richest data) ────────────────────────────────────
    try {
      const meResult = await tryMagicEden(address, meKey)
      if (meResult) {
        const { tokens, totalCount } = meResult

        // Floor prices for unique contracts
        const contractAddrs = [...new Set(tokens.map((t:any) => (t.token?.contract ?? '').toLowerCase()))]
        const floorMap: Record<string,number> = {}
        await Promise.all(contractAddrs.map(async (c) => {
          try {
            const headers: Record<string,string> = { accept: 'application/json' }
            if (meKey) headers['Authorization'] = `Bearer ${meKey}`
            const r = await fetch(`${ME_BASE}/collections/v7?id=${c}`, { headers, signal: AbortSignal.timeout(5000), cache: 'no-store' })
            if (r.ok) floorMap[c] = (await r.json())?.collections?.[0]?.floorAsk?.price?.amount?.native ?? 0
          } catch {}
        }))

        const nfts = tokens.map((t: any) => {
          const token    = t.token ?? {}
          const contract = (token.contract ?? '').toLowerCase()
          const floorMON = floorMap[contract] ?? 0
          return {
            id:           `${contract}_${token.tokenId}`,
            contract:     token.contract ?? '',
            tokenId:      token.tokenId ?? '',
            collection:   token.collection?.name ?? 'Unknown',
            symbol:       token.collection?.symbol ?? '',
            name:         token.name ?? `#${token.tokenId}`,
            image:        token.image ? resolveURI(token.image) : null,
            floorMON,
            floorUSD:     floorMON * monPrice,
            magicEdenUrl: `https://magiceden.io/item-details/monad/${token.contract}/${token.tokenId}`,
          }
        })

        return NextResponse.json({ nfts, nftValue: nfts.reduce((s:number,n:any) => s+n.floorUSD,0), total: totalCount, source: 'magiceden' })
      }
    } catch (e) {
      console.log('[nfts] ME failed:', (e as Error).message)
    }

    // ── 2. Try Blockscout/MonadScan NFT endpoint ─────────────────────────────
    try {
      const bsItems = await tryBlockscout(address)
      if (bsItems && bsItems.length > 0) {
        const nfts = await Promise.all(bsItems.slice(0, 20).map(async (item: any) => {
          const contract  = (item.token?.address ?? item.contractAddress ?? '').toLowerCase()
          const tokenId   = item.id ?? item.tokenId ?? item.token_id ?? '0'
          const image     = item.image_url ?? item.metadata?.image ?? null
          const floorMON  = 0 // Blockscout doesn't have floor prices

          return {
            id:           `${contract}_${tokenId}`,
            contract,
            tokenId:      String(tokenId),
            collection:   item.token?.name ?? item.token?.symbol ?? 'Unknown',
            symbol:       item.token?.symbol ?? '',
            name:         item.metadata?.name ?? item.name ?? `#${tokenId}`,
            image:        image ? resolveURI(String(image)) : null,
            floorMON,
            floorUSD:     0,
            magicEdenUrl: `https://magiceden.io/item-details/monad/${contract}/${tokenId}`,
          }
        }))

        return NextResponse.json({ nfts, nftValue: 0, total: bsItems.length, source: 'blockscout' })
      }
    } catch (e) {
      console.log('[nfts] Blockscout failed:', (e as Error).message)
    }

    // ── 3. Try Etherscan V2 tokennfttx ──────────────────────────────────────
    try {
      const ethTxs = await tryEtherscanNFT(address, etherscanKey)
      if (ethTxs && ethTxs.length > 0) {
        // Verify current ownership via ownerOf
        const candidates = new Map<string, Set<string>>()
        for (const tx of ethTxs) {
          const c = tx.contractAddress.toLowerCase()
          if (!candidates.has(c)) candidates.set(c, new Set())
          candidates.get(c)!.add('0x' + BigInt(tx.tokenID).toString(16).padStart(64, '0'))
        }

        const owned = await verifyOwnership(candidates, address)
        if (owned.length > 0) {
          const nfts = await enrichNFTs(owned.slice(0, 20), monPrice, meKey)
          return NextResponse.json({ nfts, nftValue: nfts.reduce((s,n) => s+n.floorUSD,0), total: owned.length, source: 'etherscan' })
        }
        return NextResponse.json({ nfts: [], nftValue: 0, total: 0, source: 'etherscan' })
      }
    } catch (e) {
      console.log('[nfts] Etherscan failed:', (e as Error).message)
    }

    // ── 4. RPC getLogs fallback (chunked) ────────────────────────────────────
    const candidates = await tryRPCLogs(address)
    if (candidates.size === 0) {
      return NextResponse.json({ nfts: [], nftValue: 0, total: 0, source: 'rpc' })
    }

    const owned = await verifyOwnership(candidates, address)
    if (!owned.length) return NextResponse.json({ nfts: [], nftValue: 0, total: 0, source: 'rpc' })

    const nfts = await enrichNFTs(owned.slice(0, 20), monPrice, meKey)
    return NextResponse.json({ nfts, nftValue: nfts.reduce((s,n) => s+n.floorUSD,0), total: owned.length, source: 'rpc' })

  } catch (err) {
    console.error('[nfts] fatal error:', err)
    return NextResponse.json({ error: 'Failed to fetch NFTs' }, { status: 500 })
  }
}
