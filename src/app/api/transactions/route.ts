import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  // Etherscan V2 com chainid=143 (Monad Mainnet) — endpoint oficial do MonadScan
  const BASE = 'https://api.etherscan.io/v2/api?chainid=143'
  const apiKey = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken'

  try {
    const [txRes, tokenRes] = await Promise.all([
      fetch(`${BASE}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${apiKey}`),
      fetch(`${BASE}&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${apiKey}`),
    ])

    const [txData, tokenData] = await Promise.all([
      txRes.json(),
      tokenRes.json(),
    ])

    const addrLower = address.toLowerCase()

    // Transações MON nativas
    const normalTxs = Array.isArray(txData.result) ? txData.result.map((tx: any) => ({
      hash: tx.hash,
      type: tx.from?.toLowerCase() === addrLower ? 'send' : 'receive',
      from: tx.from,
      to: tx.to,
      valueNative: (Number(tx.value) / 1e18).toFixed(6),
      symbol: 'MON',
      timestamp: Number(tx.timeStamp),
      isError: tx.isError === '1',
      functionName: tx.functionName || '',
    })) : []

    // Token transfers ERC-20
    const tokenTxs = Array.isArray(tokenData.result) ? tokenData.result.map((tx: any) => ({
      hash: tx.hash,
      type: tx.from?.toLowerCase() === addrLower ? 'send' : 'receive',
      from: tx.from,
      to: tx.to,
      valueNative: (Number(tx.value) / Math.pow(10, Number(tx.tokenDecimal || 18))).toFixed(4),
      symbol: tx.tokenSymbol || '???',
      tokenName: tx.tokenName,
      timestamp: Number(tx.timeStamp),
      isError: false,
      isToken: true,
      functionName: '',
    })) : []

    const all = [...normalTxs, ...tokenTxs]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6)

    return NextResponse.json({ transactions: all })
  } catch (err) {
    console.error('Transaction fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}
