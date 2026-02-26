import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

const SUPPORTED_CHAINS = new Set([143, 1, 56, 137, 42161, 10, 8453])

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const chainId   = Number(searchParams.get('chainId'))
  const topic0    = searchParams.get('topic0')
  const topic1    = searchParams.get('topic1')
  const fromBlock = searchParams.get('fromBlock') ?? '0'
  const toBlock   = searchParams.get('toBlock')   ?? 'latest'

  if (!SUPPORTED_CHAINS.has(chainId)) {
    return NextResponse.json({ status: '0', message: 'Unsupported chain', result: [] }, { status: 400 })
  }
  if (!topic0 || !topic1) {
    return NextResponse.json({ status: '0', message: 'Missing topic0 or topic1', result: [] }, { status: 400 })
  }

  const apiKey = process.env.ETHERSCAN_API_KEY
  if (!apiKey) {
    return NextResponse.json({ status: '0', message: 'ETHERSCAN_API_KEY not configured', result: [] }, { status: 500 })
  }

  // Etherscan V2 unified endpoint — one key works for all 60+ chains
  const url = new URL('https://api.etherscan.io/v2/api')
  url.searchParams.set('chainid',      String(chainId))
  url.searchParams.set('apikey',       apiKey)
  url.searchParams.set('module',       'logs')
  url.searchParams.set('action',       'getLogs')
  url.searchParams.set('topic0',       topic0)
  url.searchParams.set('topic1',       topic1)
  url.searchParams.set('topic0_1_opr', 'and')
  url.searchParams.set('fromBlock',    fromBlock)
  url.searchParams.set('toBlock',      toBlock)
  url.searchParams.set('page',         '1')
  url.searchParams.set('offset',       '1000')

  try {
    const res  = await fetch(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[approvals-logs] chainId:', chainId, 'error:', e.message)
    return NextResponse.json({ status: '0', message: e.message ?? 'Fetch failed', result: [] }, { status: 502 })
  }
}
