import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

const RPC = 'https://rpc.monad.xyz'

// ERC-721 Transfer(address,address,uint256) topic
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

// Function selectors
const SEL_OWNER_OF    = '0x6352211e' // ownerOf(uint256)
const SEL_NAME        = '0x06fdde03' // name()
const SEL_SYMBOL      = '0x95d89b41' // symbol()
const SEL_TOKEN_URI   = '0xc87b56dd' // tokenURI(uint256)
const SEL_BALANCE_OF  = '0x70a08231' // balanceOf(address)

async function rpc(method: string, params: unknown[], id: number | string = 1) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
    cache: 'no-store',
  })
  const data = await res.json()
  return data.result
}

async function rpcBatch(calls: object[]): Promise<any[]> {
  if (calls.length === 0) return []
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calls),
    cache: 'no-store',
  })
  const data = await res.json()
  return Array.isArray(data) ? data : [data]
}

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
    // ABI-encoded string: offset (32) + length (32) + data
    if (bytes.length < 64) return ''
    const len = Number(BigInt('0x' + bytes.slice(32, 64).toString('hex')))
    const str = bytes.slice(64, 64 + len).toString('utf8')
    return str.replace(/\0/g, '')
  } catch { return '' }
}

function isIPFS(uri: string) {
  return uri.startsWith('ipfs://')
}

function resolveURI(uri: string): string {
  if (isIPFS(uri)) {
    return uri.replace('ipfs://', 'https://ipfs.io/ipfs/')
  }
  return uri
}

async function fetchMetadata(uri: string): Promise<{ name?: string; image?: string; description?: string } | null> {
  try {
    const url = resolveURI(uri)
    // Skip data URIs (on-chain SVG, etc)
    if (url.startsWith('data:')) return null
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  try {
    // ── 1. Find NFT contracts the address has received transfers from ──────────
    const latestBlockHex = await rpc('eth_blockNumber', [])
    const latestBlock = parseInt(latestBlockHex, 16)
    // Scan last ~100k blocks (≈ 1-2 weeks at 0.5s blocks)
    const fromBlock = Math.max(0, latestBlock - 200_000)

    const paddedAddr = padAddr(address)

    // Get ERC-721 Transfer events TO this address
    const logs: any[] = await rpc('eth_getLogs', [{
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: 'latest',
      topics: [TRANSFER_TOPIC, null, paddedAddr],
    }]) ?? []

    // Collect unique (contract, tokenId) pairs
    const candidates = new Map<string, Set<string>>() // contractAddr -> Set<tokenIdHex>

    for (const log of logs) {
      // ERC-721 Transfer has indexed tokenId as topics[3]
      // ERC-20 Transfer only has 3 topics total — skip those
      if (log.topics.length !== 4) continue
      const contract = log.address.toLowerCase()
      const tokenIdHex = log.topics[3]
      if (!candidates.has(contract)) candidates.set(contract, new Set())
      candidates.get(contract)!.add(tokenIdHex)
    }

    if (candidates.size === 0) {
      return NextResponse.json({ nfts: [], total: 0 })
    }

    // ── 2. For each contract, fetch name + symbol + verify ownership ──────────
    const contractAddrs = [...candidates.keys()]

    // Batch: name() and symbol() for each contract
    const nameCalls = contractAddrs.map((addr, i) => ({
      jsonrpc: '2.0', method: 'eth_call',
      params: [{ to: addr, data: SEL_NAME }, 'latest'],
      id: `name_${i}`,
    }))
    const symbolCalls = contractAddrs.map((addr, i) => ({
      jsonrpc: '2.0', method: 'eth_call',
      params: [{ to: addr, data: SEL_SYMBOL }, 'latest'],
      id: `symbol_${i}`,
    }))

    const [nameResults, symbolResults] = await Promise.all([
      rpcBatch(nameCalls),
      rpcBatch(symbolCalls),
    ])

    const contractMeta: Record<string, { name: string; symbol: string }> = {}
    contractAddrs.forEach((addr, i) => {
      contractMeta[addr] = {
        name:   decodeString(nameResults[i]?.result ?? ''),
        symbol: decodeString(symbolResults[i]?.result ?? ''),
      }
    })

    // ── 3. Verify ownership: ownerOf(tokenId) must equal address ─────────────
    const ownerChecks: { contract: string; tokenIdHex: string; call: object }[] = []

    for (const [contract, tokenIds] of candidates.entries()) {
      for (const tokenIdHex of tokenIds) {
        const tokenIdBig = BigInt(tokenIdHex)
        const data = SEL_OWNER_OF + padUint256(tokenIdBig)
        ownerChecks.push({
          contract,
          tokenIdHex,
          call: {
            jsonrpc: '2.0', method: 'eth_call',
            params: [{ to: contract, data }, 'latest'],
            id: `owner_${contract}_${tokenIdHex}`,
          },
        })
      }
    }

    // Batch in chunks of 50 to avoid RPC limits
    const chunkSize = 50
    const ownerResults: any[] = []
    for (let i = 0; i < ownerChecks.length; i += chunkSize) {
      const chunk = ownerChecks.slice(i, i + chunkSize).map(c => c.call)
      const res = await rpcBatch(chunk)
      ownerResults.push(...res)
    }

    // Find owned token IDs
    const ownedTokens: { contract: string; tokenId: bigint; tokenIdHex: string }[] = []
    ownerChecks.forEach((check, i) => {
      const result = ownerResults[i]?.result
      if (!result || result === '0x') return
      // ownerOf returns address padded to 32 bytes
      const owner = '0x' + result.slice(-40)
      if (owner.toLowerCase() === address.toLowerCase()) {
        ownedTokens.push({
          contract: check.contract,
          tokenId: BigInt(check.tokenIdHex),
          tokenIdHex: check.tokenIdHex,
        })
      }
    })

    if (ownedTokens.length === 0) {
      return NextResponse.json({ nfts: [], total: 0 })
    }

    // ── 4. Fetch tokenURI for owned tokens (up to 20) ─────────────────────────
    const cap = ownedTokens.slice(0, 20)

    const uriCalls = cap.map(({ contract, tokenId }, i) => ({
      jsonrpc: '2.0', method: 'eth_call',
      params: [{ to: contract, data: SEL_TOKEN_URI + padUint256(tokenId) }, 'latest'],
      id: `uri_${i}`,
    }))

    const uriResults = await rpcBatch(uriCalls)

    // ── 5. Fetch metadata for each tokenURI ───────────────────────────────────
    const nfts = await Promise.all(
      cap.map(async ({ contract, tokenId }, i) => {
        const rawUri = decodeString(uriResults[i]?.result ?? '')
        const meta = rawUri ? await fetchMetadata(rawUri) : null
        const cm = contractMeta[contract] ?? { name: 'Unknown', symbol: '?' }

        return {
          id:         `${contract}_${tokenId}`,
          contract,
          tokenId:    tokenId.toString(),
          collection: cm.name || cm.symbol || shortenAddr(contract),
          symbol:     cm.symbol,
          name:       meta?.name ?? `${cm.name || cm.symbol} #${tokenId}`,
          image:      meta?.image ? resolveURI(meta.image) : null,
          tokenUri:   rawUri,
        }
      })
    )

    return NextResponse.json({
      nfts,
      total: ownedTokens.length,
    })

  } catch (err) {
    console.error('[nfts] error:', err)
    return NextResponse.json({ error: 'Failed to fetch NFTs' }, { status: 500 })
  }
}

function shortenAddr(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}
