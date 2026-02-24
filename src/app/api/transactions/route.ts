import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const BASE = 'https://api.etherscan.io/v2/api?chainid=143'
  const apiKey = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken'

  try {
    const [txRes, tokenRes] = await Promise.all([
      fetch(`${BASE}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${apiKey}`, {
        headers: { 'User-Agent': 'MonadBoard/1.0' },
        cache: 'no-store',
      }),
      fetch(`${BASE}&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${apiKey}`, {
        headers: { 'User-Agent': 'MonadBoard/1.0' },
        cache: 'no-store',
      }),
    ])

    const [txData, tokenData] = await Promise.all([
      txRes.json(),
      tokenRes.json(),
    ])

    // Debug — aparece nos logs do Vercel (Functions > Logs)
    console.log('[transactions] txData status:', txData.status, '| message:', txData.message, '| result type:', typeof txData.result, '| count:', Array.isArray(txData.result) ? txData.result.length : txData.result)
    console.log('[transactions] tokenData status:', tokenData.status, '| message:', tokenData.message)

    const addrLower = address.toLowerCase()

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

    // Retorna também o raw para debug no browser
    return NextResponse.json({
      transactions: all,
      _debug: {
        txStatus: txData.status,
        txMessage: txData.message,
        txCount: Array.isArray(txData.result) ? txData.result.length : txData.result,
        tokenStatus: tokenData.status,
        tokenMessage: tokenData.message,
        tokenCount: Array.isArray(tokenData.result) ? tokenData.result.length : tokenData.result,
      }
    })
  } catch (err: any) {
    console.error('[transactions] error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Failed to fetch' }, { status: 500 })
  }
}
