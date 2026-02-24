import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0 // sem cache — sempre busca ao vivo

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const apiKey = process.env.MONADSCAN_API_KEY || 'YourApiKeyToken'
  const baseUrl = 'https://api.monadscan.com/api'

  try {
    // Busca transações normais e token transfers em paralelo
    const [txRes, tokenRes] = await Promise.all([
      fetch(
        `${baseUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${apiKey}`
      ),
      fetch(
        `${baseUrl}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${apiKey}`
      ),
    ])

    const [txData, tokenData] = await Promise.all([
      txRes.json(),
      tokenRes.json(),
    ])

    // Normaliza transações normais
    const normalTxs = (txData.result && Array.isArray(txData.result) ? txData.result : [])
      .slice(0, 20)
      .map((tx: any) => ({
        hash: tx.hash,
        type: tx.from.toLowerCase() === address.toLowerCase() ? 'send' : 'receive',
        from: tx.from,
        to: tx.to,
        value: tx.value, // em wei
        valueNative: (Number(tx.value) / 1e18).toFixed(6),
        symbol: 'MON',
        timestamp: Number(tx.timeStamp),
        isError: tx.isError === '1',
        methodId: tx.methodId,
        functionName: tx.functionName,
      }))

    // Normaliza token transfers
    const tokenTxs = (tokenData.result && Array.isArray(tokenData.result) ? tokenData.result : [])
      .slice(0, 20)
      .map((tx: any) => ({
        hash: tx.hash,
        type: tx.from.toLowerCase() === address.toLowerCase() ? 'send' : 'receive',
        from: tx.from,
        to: tx.to,
        value: tx.value,
        valueNative: (Number(tx.value) / Math.pow(10, Number(tx.tokenDecimal || 18))).toFixed(4),
        symbol: tx.tokenSymbol,
        tokenName: tx.tokenName,
        timestamp: Number(tx.timeStamp),
        isError: false,
        isToken: true,
      }))

    // Merge e ordena por timestamp
    const all = [...normalTxs, ...tokenTxs]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6) // só as 6 mais recentes para o dashboard

    return NextResponse.json({ transactions: all })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}
