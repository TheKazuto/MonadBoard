import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

const RPC = 'https://rpc.monad.xyz'

async function rpc(method: string, params: any[], id = 1) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
    cache: 'no-store',
  })
  const d = await r.json()
  return d.result
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const addrLower = address.toLowerCase()
  const apiKey = process.env.ETHERSCAN_API_KEY

  // ── PATH 1: Etherscan V2 (if API key is set) ────────────────────────────────
  if (apiKey && apiKey !== 'YourApiKeyToken') {
    try {
      const BASE = `https://api.etherscan.io/v2/api?chainid=143&apikey=${apiKey}`
      const [txRes, tokenRes] = await Promise.all([
        fetch(`${BASE}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc`, { cache: 'no-store' }),
        fetch(`${BASE}&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc`, { cache: 'no-store' }),
      ])
      const [txData, tokenData] = await Promise.all([txRes.json(), tokenRes.json()])

      if (txData.status === '1' || tokenData.status === '1') {
        const normalTxs = Array.isArray(txData.result) ? txData.result.map((tx: any) => ({
          hash: tx.hash,
          type: tx.from?.toLowerCase() === addrLower ? 'send' : 'receive',
          from: tx.from, to: tx.to,
          valueNative: (Number(tx.value) / 1e18).toFixed(6),
          symbol: 'MON',
          timestamp: Number(tx.timeStamp),
          isError: tx.isError === '1',
          functionName: tx.functionName || '',
        })) : []

        const tokenTxs = Array.isArray(tokenData.result) ? tokenData.result.map((tx: any) => ({
          hash: tx.hash,
          type: tx.from?.toLowerCase() === addrLower ? 'send' : 'receive',
          from: tx.from, to: tx.to,
          valueNative: (Number(tx.value) / Math.pow(10, Number(tx.tokenDecimal || 18))).toFixed(4),
          symbol: tx.tokenSymbol || '?',
          timestamp: Number(tx.timeStamp),
          isError: false, isToken: true, functionName: '',
        })) : []

        const all = [...normalTxs, ...tokenTxs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 100)
        return NextResponse.json({ transactions: all, source: 'etherscan' })
      }
    } catch (e) {
      console.error('[tx] etherscan error:', e)
    }
  }

  // ── PATH 2: RPC — scan recent blocks for native MON + ERC-20 transfers ──────
  try {
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    const paddedAddr = '0x000000000000000000000000' + addrLower.slice(2)

    // Get latest block
    const latestHex: string = await rpc('eth_blockNumber', [])
    const latest = parseInt(latestHex, 16)
    const SCAN_BLOCKS = 2000
    const fromBlock = '0x' + Math.max(0, latest - SCAN_BLOCKS).toString(16)

    // Fetch ERC-20 logs and native txs in parallel
    const [logsFromRes, logsToRes, nativeTxsRes] = await Promise.all([
      // ERC-20 sent
      rpc('eth_getLogs', [{ fromBlock, toBlock: 'latest', topics: [TRANSFER_TOPIC, paddedAddr] }]),
      // ERC-20 received
      rpc('eth_getLogs', [{ fromBlock, toBlock: 'latest', topics: [TRANSFER_TOPIC, null, paddedAddr] }]),
      // Native MON: scan blocks for txs involving this address
      fetchNativeTxs(addrLower, fromBlock, latest),
    ])

    // Collect unique blocks for timestamp resolution
    const allLogs = [
      ...((logsFromRes || []).map((l: any) => ({ ...l, direction: 'send' }))),
      ...((logsToRes   || []).map((l: any) => ({ ...l, direction: 'receive' }))),
    ]

    const blockNums = [...new Set([
      ...allLogs.map((l: any) => l.blockNumber),
      ...nativeTxsRes.map((t: any) => t.blockNumber),
    ])] as string[]

    // Resolve timestamps in parallel (max 30 blocks)
    const blockTimestamps: Record<string, number> = {}
    await Promise.all(blockNums.slice(0, 30).map(async (bn) => {
      const block = await rpc('eth_getBlockByNumber', [bn, false])
      if (block) blockTimestamps[bn] = parseInt(block.timestamp, 16)
    }))

    // Build ERC-20 txs
    const erc20Txs = allLogs.map((log: any) => ({
      hash: log.transactionHash,
      type: log.direction as 'send' | 'receive',
      from: log.direction === 'send' ? address : '0x' + log.topics[1]?.slice(26),
      to:   log.direction === 'receive' ? address : '0x' + log.topics[2]?.slice(26),
      valueNative: log.data === '0x' ? '0' : (Number(BigInt(log.data)) / 1e18).toFixed(6),
      symbol: 'TOKEN',
      timestamp: blockTimestamps[log.blockNumber] || 0,
      isError: false, isToken: true, functionName: '',
    }))

    // Build native txs
    const nativeTxs = nativeTxsRes.map((t: any) => ({
      hash: t.hash,
      type: (t.from?.toLowerCase() === addrLower ? 'send' : 'receive') as 'send' | 'receive',
      from: t.from, to: t.to,
      valueNative: (Number(BigInt(t.value || '0x0')) / 1e18).toFixed(6),
      symbol: 'MON',
      timestamp: blockTimestamps[t.blockNumber] || 0,
      isError: false, isToken: false, functionName: t.input === '0x' ? '' : 'contract call',
    }))

    const all = [...nativeTxs, ...erc20Txs]
      .filter((t, i, arr) => arr.findIndex(x => x.hash === t.hash) === i) // dedupe
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100)

    if (all.length > 0) {
      return NextResponse.json({ transactions: all, source: 'rpc' })
    }
  } catch (e) {
    console.error('[tx] rpc error:', e)
  }

  // Nothing found — return empty (not an error, just no activity)
  return NextResponse.json({ transactions: [], source: 'rpc_empty' })
}

// Fetch native MON transactions by scanning recent block receipts
async function fetchNativeTxs(addrLower: string, fromBlockHex: string, latestBlock: number): Promise<any[]> {
  try {
    const from = parseInt(fromBlockHex, 16)
    // Sample at most 50 block numbers spread across the range to stay fast
    const total = latestBlock - from
    const step  = Math.max(1, Math.floor(total / 50))
    const blockNums: number[] = []
    for (let b = latestBlock; b >= from && blockNums.length < 50; b -= step) {
      blockNums.push(b)
    }

    const results: any[] = []
    await Promise.all(blockNums.map(async (bn) => {
      try {
        const block = await fetch(RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBlockByNumber', params: ['0x' + bn.toString(16), true], id: bn }),
          cache: 'no-store',
        }).then(r => r.json())

        const txs: any[] = block?.result?.transactions ?? []
        for (const tx of txs) {
          if (
            tx.value && tx.value !== '0x0' &&
            (tx.from?.toLowerCase() === addrLower || tx.to?.toLowerCase() === addrLower)
          ) {
            results.push({ ...tx, blockNumber: block.result.number })
          }
        }
      } catch { /* skip block */ }
    }))

    return results
  } catch {
    return []
  }
}
