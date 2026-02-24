import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

const ME_BASE = 'https://api-mainnet.magiceden.dev/v3/rtp/monad'
const RPC = 'https://rpc.monad.xyz'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const SEL_OWNER_OF   = '0x6352211e'
const SEL_NAME       = '0x06fdde03'
const SEL_SYMBOL     = '0x95d89b41'
const SEL_TOKEN_URI  = '0xc87b56dd'

function padAddr(addr: string) {
  return '0x000000000000000000000000' + addr.slice(2).toLowerCase()
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
function resolveURI(uri: string): string {
  if (!uri) return ''
  return uri.startsWith('ipfs://') ? uri.replace('ipfs://', 'https://ipfs.io/ipfs/') : uri
}
async function rpcBatch(calls: object[]): Promise<any[]> {
  if (calls.length === 0) return []
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calls),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
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

async function fetchFromMagicEden(address: string) {
  const apiKey = process.env.MAGIC_EDEN_API_KEY
  const headers: Record<string, string> = { accept: 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  // Get NFTs owned by wallet
  const walletRes = await fetch(
    `${ME_BASE}/users/${address}/tokens/v7?limit=50&sortBy=acquiredAt&includeTopBid=false&excludeSpam=true&excludeBurnt=true`,
    { headers, signal: AbortSignal.timeout(8000), cache: 'no-store' }
  )
  if (!walletRes.ok) return null

  const walletData = await walletRes.json()
  const tokens: any[] = walletData?.tokens ?? []
  if (tokens.length === 0) return { nfts: [], nftValue: 0, total: 0 }

  // Unique contracts for floor price lookup
  const contractAddrs = [...new Set(tokens.map((t: any) => t.token?.contract as string).filter(Boolean))]

  // Fetch floor prices per collection
  const floorPrices: Record<string, number> = {}
  await Promise.all(
    contractAddrs.map(async (contract) => {
      try {
        const colRes = await fetch(
          `${ME_BASE}/collections/v7?id=${contract}&includeTopBid=false`,
          { headers, signal: AbortSignal.timeout(6000), cache: 'no-store' }
        )
        if (!colRes.ok) return
        const colData = await colRes.json()
        const col = colData?.collections?.[0]
        floorPrices[contract.toLowerCase()] = col?.floorAsk?.price?.amount?.native ?? 0
      } catch { /* ignore */ }
    })
  )

  // MON/USD price
  let monPrice = 0
  try {
    const pr = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd', { next: { revalidate: 60 } })
    monPrice = (await pr.json())?.monad?.usd ?? 0
  } catch { }

  const nfts = tokens.map((t: any) => {
    const token    = t.token ?? {}
    const contract = (token.contract ?? '').toLowerCase()
    const floorMON = floorPrices[contract] ?? 0
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

  return {
    nfts,
    nftValue: nfts.reduce((sum: number, n: any) => sum + n.floorUSD, 0),
    total: walletData?.totalCount ?? nfts.length,
  }
}

async function fetchFromRPC(address: string) {
  const latestHex = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
    cache: 'no-store',
  }).then(r => r.json()).then(d => d.result)

  const fromBlock = Math.max(0, parseInt(latestHex, 16) - 200_000)
  const paddedAddr = padAddr(address)

  const logs: any[] = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'eth_getLogs', id: 2,
      params: [{ fromBlock: '0x' + fromBlock.toString(16), toBlock: 'latest', topics: [TRANSFER_TOPIC, null, paddedAddr] }],
    }),
    cache: 'no-store',
  }).then(r => r.json()).then(d => d.result ?? [])

  const candidates = new Map<string, Set<string>>()
  for (const log of logs) {
    if (log.topics.length !== 4) continue
    const c = log.address.toLowerCase()
    if (!candidates.has(c)) candidates.set(c, new Set())
    candidates.get(c)!.add(log.topics[3])
  }
  if (candidates.size === 0) return { nfts: [], nftValue: 0, total: 0 }

  const ownerChecks: { contract: string; tokenIdHex: string; call: object }[] = []
  for (const [contract, tokenIds] of candidates.entries()) {
    for (const tokenIdHex of tokenIds) {
      const tokenIdBig = BigInt(tokenIdHex)
      ownerChecks.push({ contract, tokenIdHex, call: { jsonrpc: '2.0', method: 'eth_call', params: [{ to: contract, data: SEL_OWNER_OF + padUint256(tokenIdBig) }, 'latest'], id: `o_${contract}_${tokenIdHex}` } })
    }
  }

  const ownerResults: any[] = []
  for (let i = 0; i < ownerChecks.length; i += 50) {
    ownerResults.push(...await rpcBatch(ownerChecks.slice(i, i + 50).map(c => c.call)))
  }

  const ownedTokens: { contract: string; tokenId: bigint }[] = []
  ownerChecks.forEach((check, i) => {
    const result = ownerResults[i]?.result
    if (!result || result === '0x') return
    if (('0x' + result.slice(-40)).toLowerCase() === address.toLowerCase()) {
      ownedTokens.push({ contract: check.contract, tokenId: BigInt(check.tokenIdHex) })
    }
  })
  if (ownedTokens.length === 0) return { nfts: [], nftValue: 0, total: 0 }

  const cap = ownedTokens.slice(0, 20)
  const contractAddrs = [...candidates.keys()]

  const [nameResults, symbolResults, uriResults] = await Promise.all([
    rpcBatch(contractAddrs.map((a, i) => ({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: a, data: SEL_NAME }, 'latest'], id: `n_${i}` }))),
    rpcBatch(contractAddrs.map((a, i) => ({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: a, data: SEL_SYMBOL }, 'latest'], id: `s_${i}` }))),
    rpcBatch(cap.map(({ contract, tokenId }, i) => ({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: contract, data: SEL_TOKEN_URI + padUint256(tokenId) }, 'latest'], id: `u_${i}` }))),
  ])

  const contractMeta: Record<string, { name: string; symbol: string }> = {}
  contractAddrs.forEach((a, i) => {
    contractMeta[a] = { name: decodeString(nameResults[i]?.result ?? ''), symbol: decodeString(symbolResults[i]?.result ?? '') }
  })

  const nfts = await Promise.all(cap.map(async ({ contract, tokenId }, i) => {
    const rawUri = decodeString(uriResults[i]?.result ?? '')
    const meta   = rawUri ? await fetchMetadata(rawUri) : null
    const cm     = contractMeta[contract] ?? { name: 'Unknown', symbol: '?' }
    return {
      id:           `${contract}_${tokenId}`,
      contract,
      tokenId:      tokenId.toString(),
      collection:   cm.name || cm.symbol || contract.slice(0, 10),
      symbol:       cm.symbol,
      name:         meta?.name ?? `${cm.name || cm.symbol} #${tokenId}`,
      image:        meta?.image ? resolveURI(meta.image) : null,
      floorMON:     0,
      floorUSD:     0,
      magicEdenUrl: `https://magiceden.io/item-details/monad/${contract}/${tokenId}`,
    }
  }))

  return { nfts, nftValue: 0, total: ownedTokens.length }
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  try {
    const meResult = await fetchFromMagicEden(address)
    if (meResult !== null) return NextResponse.json({ ...meResult, source: 'magiceden' })
    const rpcResult = await fetchFromRPC(address)
    return NextResponse.json({ ...rpcResult, source: 'rpc' })
  } catch (err) {
    console.error('[nfts] error:', err)
    try {
      const rpcResult = await fetchFromRPC(address)
      return NextResponse.json({ ...rpcResult, source: 'rpc' })
    } catch {
      return NextResponse.json({ error: 'Failed to fetch NFTs' }, { status: 500 })
    }
  }
}
