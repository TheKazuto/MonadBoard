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
  if (uri.startsWith('ipfs://')) return uri.replace('ipfs://', 'https://ipfs.io/ipfs/')
  return uri
}

// ─── Etherscan V2 — Monad Mainnet chainid=143 ────────────────────────────────
async function fetchEtherscanNFTs(address: string, apiKey: string) {
  // Chain ID 143 = Monad Mainnet (10143 = Monad Testnet — WRONG!)
  const url = `https://api.etherscan.io/v2/api?chainid=143&module=account&action=tokennfttx&address=${address}&page=1&offset=100&sort=desc&apikey=${apiKey}`
  
  console.log('[nfts] Fetching Etherscan tokennfttx chainid=143 for', address)
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  const data = await res.json()
  
  console.log('[nfts] Etherscan response status:', data.status, 'message:', data.message, 'result count:', Array.isArray(data.result) ? data.result.length : data.result)

  if (data.status !== '1') {
    // "No transactions found" is a valid empty result, not an error
    if (typeof data.message === 'string' && data.message.includes('No transactions')) {
      return []
    }
    throw new Error(`Etherscan: ${data.message} (status ${data.status})`)
  }

  const txs: any[] = data.result
  const addrLower = address.toLowerCase()

  // For each unique (contract, tokenId), check if last transfer was TO the wallet
  const lastTx = new Map<string, any>()
  for (const tx of txs) {
    const key = `${tx.contractAddress.toLowerCase()}_${BigInt(tx.tokenID).toString()}`
    if (!lastTx.has(key)) lastTx.set(key, tx) // sort=desc → first = most recent
  }

  const owned: { contract: string; tokenId: bigint }[] = []
  for (const [, tx] of lastTx) {
    if (tx.to?.toLowerCase() === addrLower) {
      owned.push({ contract: tx.contractAddress.toLowerCase(), tokenId: BigInt(tx.tokenID) })
    }
  }

  console.log('[nfts] Etherscan owned after dedup:', owned.length)
  return owned
}

// ─── Verify current ownership via ownerOf (catches transfers not in Etherscan) ─
async function verifyOwnership(candidates: { contract: string; tokenId: bigint }[], address: string) {
  const SEL_OWNER = '0x6352211e'
  
  const calls = candidates.map((c, i) => ({
    jsonrpc: '2.0', method: 'eth_call',
    params: [{ to: c.contract, data: SEL_OWNER + padUint256(c.tokenId) }, 'latest'],
    id: i,
  }))

  const results: any[] = []
  // Batch in groups of 20
  for (let i = 0; i < calls.length; i += 20) {
    const chunk = await rpcBatch(calls.slice(i, i + 20))
    results.push(...chunk)
  }

  const addrLower = address.toLowerCase()
  const verified = candidates.filter((_, i) => {
    const r = results[i]?.result
    return r && r.length >= 26 && ('0x' + r.slice(-40)).toLowerCase() === addrLower
  })

  console.log('[nfts] Verified via ownerOf:', verified.length, '/', candidates.length)
  return verified
}

// ─── Fetch on-chain name/symbol/tokenURI ──────────────────────────────────────
async function fetchOnChainMeta(owned: { contract: string; tokenId: bigint }[]) {
  const SEL_NAME   = '0x06fdde03'
  const SEL_SYMBOL = '0x95d89b41'
  const SEL_URI    = '0xc87b56dd'
  const contracts  = [...new Set(owned.map(t => t.contract))]

  const [nameRes, symRes, uriRes] = await Promise.all([
    rpcBatch(contracts.map((a, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:a,data:SEL_NAME},'latest'], id:i }))),
    rpcBatch(contracts.map((a, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:a,data:SEL_SYMBOL},'latest'], id:i }))),
    rpcBatch(owned.map(({ contract, tokenId }, i) => ({ jsonrpc:'2.0', method:'eth_call', params:[{to:contract,data:SEL_URI+padUint256(tokenId)},'latest'], id:i }))),
  ])

  const cMeta: Record<string, { name: string; symbol: string }> = {}
  contracts.forEach((a, i) => {
    cMeta[a] = {
      name:   decodeString(nameRes[i]?.result ?? ''),
      symbol: decodeString(symRes[i]?.result ?? ''),
    }
  })

  return { cMeta, uriRes }
}

// ─── Fetch token JSON from tokenURI ───────────────────────────────────────────
async function fetchTokenMeta(uri: string) {
  try {
    const url = resolveURI(uri)
    if (!url || url.startsWith('data:')) return null
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// ─── Main route ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const apiKey = process.env.ETHERSCAN_API_KEY
  if (!apiKey) {
    console.log('[nfts] No ETHERSCAN_API_KEY configured')
    return NextResponse.json({ error: 'no_api_key', nfts: [], nftValue: 0, total: 0 })
  }

  try {
    // 1. Get NFT transfer history from Etherscan V2 (Monad mainnet chainid=143)
    const candidates = await fetchEtherscanNFTs(address, apiKey)

    if (candidates.length === 0) {
      return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })
    }

    // 2. Verify current ownership on-chain via ownerOf
    const owned = await verifyOwnership(candidates, address)

    if (owned.length === 0) {
      return NextResponse.json({ nfts: [], nftValue: 0, total: 0 })
    }

    const cap   = owned.slice(0, 20)
    const total = owned.length

    // 3. Fetch name/symbol/tokenURI from contracts
    const { cMeta, uriRes } = await fetchOnChainMeta(cap)

    // 4. Fetch token metadata JSONs in parallel
    const metaResults = await Promise.all(
      cap.map((_, i) => fetchTokenMeta(decodeString(uriRes[i]?.result ?? '')))
    )

    // 5. Build response
    const nfts = cap.map(({ contract, tokenId }, i) => {
      const cm    = cMeta[contract] ?? { name: '', symbol: '' }
      const meta  = metaResults[i]
      const collection = cm.name || cm.symbol || `${contract.slice(0, 6)}...${contract.slice(-4)}`

      return {
        id:           `${contract}_${tokenId}`,
        contract,
        tokenId:      tokenId.toString(),
        collection,
        symbol:       cm.symbol,
        name:         meta?.name ?? `${collection} #${tokenId}`,
        image:        meta?.image ? resolveURI(String(meta.image)) : null,
        floorMON:     0,
        floorUSD:     0,
        magicEdenUrl: `https://magiceden.io/item-details/monad/${contract}/${tokenId}`,
      }
    })

    return NextResponse.json({ nfts, nftValue: 0, total })

  } catch (err: any) {
    console.error('[nfts] error:', err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? 'Failed to fetch NFTs' }, { status: 500 })
  }
}
