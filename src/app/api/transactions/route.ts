import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const apiKey = process.env.ETHERSCAN_API_KEY
  const addrLower = address.toLowerCase()

  // ── CAMINHO 1: Etherscan V2 (se tiver API key configurada) ──────────────────
  if (apiKey && apiKey !== 'YourApiKeyToken') {
    try {
      const BASE = `https://api.etherscan.io/v2/api?chainid=143&apikey=${apiKey}`

      const [txRes, tokenRes] = await Promise.all([
        fetch(`${BASE}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc`, { cache: 'no-store' }),
        fetch(`${BASE}&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc`, { cache: 'no-store' }),
      ])

      const [txData, tokenData] = await Promise.all([txRes.json(), tokenRes.json()])

      console.log('[tx] etherscan status:', txData.status, txData.message)

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

  // ── CAMINHO 2: RPC direto via eth_getLogs ────────────────────────────────────
  try {
    const RPC = 'https://rpc.monad.xyz'

    const blockNumRes = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      cache: 'no-store',
    })
    const blockNumData = await blockNumRes.json()
    const latestBlock = parseInt(blockNumData.result, 16)

    const BLOCKS_TO_SCAN = 500
    const fromBlock = Math.max(0, latestBlock - BLOCKS_TO_SCAN)

    const paddedAddr = '0x000000000000000000000000' + address.slice(2).toLowerCase()
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

    const [logsFromRes, logsToRes] = await Promise.all([
      fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'eth_getLogs', id: 2,
          params: [{ fromBlock: '0x' + fromBlock.toString(16), toBlock: 'latest', topics: [TRANSFER_TOPIC, paddedAddr] }],
        }),
        cache: 'no-store',
      }),
      fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'eth_getLogs', id: 3,
          params: [{ fromBlock: '0x' + fromBlock.toString(16), toBlock: 'latest', topics: [TRANSFER_TOPIC, null, paddedAddr] }],
        }),
        cache: 'no-store',
      }),
    ])

    const [logsFrom, logsTo] = await Promise.all([logsFromRes.json(), logsToRes.json()])

    const allLogs = [
      ...(logsFrom.result || []).map((l: any) => ({ ...l, direction: 'send' })),
      ...(logsTo.result || []).map((l: any) => ({ ...l, direction: 'receive' })),
    ]

    const uniqueBlocks = [...new Set(allLogs.map((l: any) => l.blockNumber))]
    const blockTimestamps: Record<string, number> = {}

    await Promise.all(uniqueBlocks.slice(0, 20).map(async (blockNum) => {
      const r = await fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBlockByNumber', params: [blockNum, false], id: 4 }),
        cache: 'no-store',
      })
      const d = await r.json()
      if (d.result) blockTimestamps[blockNum] = parseInt(d.result.timestamp, 16)
    }))

    const transactions = allLogs
      .sort((a: any, b: any) => (blockTimestamps[b.blockNumber] || 0) - (blockTimestamps[a.blockNumber] || 0))
      .slice(0, 100)
      .map((log: any) => ({
        hash: log.transactionHash,
        type: log.direction,
        from: log.direction === 'send' ? address : '0x' + log.topics[1]?.slice(26),
        to: log.direction === 'receive' ? address : '0x' + log.topics[2]?.slice(26),
        valueNative: log.data === '0x' ? '0' : (Number(BigInt(log.data)) / 1e18).toFixed(6),
        symbol: 'TOKEN',
        timestamp: blockTimestamps[log.blockNumber] || 0,
        isError: false,
        isToken: true,
        functionName: '',
      }))

    return NextResponse.json({ transactions, source: 'rpc' })
  } catch (e) {
    console.error('[tx] rpc error:', e)
  }

  return NextResponse.json({
    transactions: [],
    error: 'no_api_key',
    message: 'Add ETHERSCAN_API_KEY to Vercel environment variables to enable transaction history.',
  })
}
