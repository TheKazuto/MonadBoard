import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

// Each chain has its own explorer API endpoint
// Etherscan V2 (api.etherscan.io/v2) works for all with a single key IF the key has multi-chain access
// Fallback: use the chain-specific explorer API (each has its own key env var, or reuse ETHERSCAN_API_KEY)
const CHAIN_APIS: Record<number, { url: string; keyEnv: string }> = {
  143:   { url: 'https://api.etherscan.io/v2/api?chainid=143', keyEnv: 'ETHERSCAN_API_KEY' },
  1:     { url: 'https://api.etherscan.io/api',                keyEnv: 'ETHERSCAN_API_KEY' },
  56:    { url: 'https://api.bscscan.com/api',                 keyEnv: 'BSCSCAN_API_KEY'   },
  137:   { url: 'https://api.polygonscan.com/api',             keyEnv: 'POLYGONSCAN_API_KEY' },
  42161: { url: 'https://api.arbiscan.io/api',                 keyEnv: 'ARBISCAN_API_KEY'   },
  10:    { url: 'https://api-optimistic.etherscan.io/api',     keyEnv: 'OPTIMISM_API_KEY'   },
  8453:  { url: 'https://api.basescan.org/api',                keyEnv: 'BASESCAN_API_KEY'   },
}

// Fallback: try Etherscan V2 multi-chain endpoint first, then chain-specific
async function fetchWithFallback(chainId: number, params: Record<string, string>): Promise<any> {
  const mainKey = process.env.ETHERSCAN_API_KEY ?? ''
  const chainCfg = CHAIN_APIS[chainId]

  // Attempt 1: Etherscan V2 unified API (works if key has multi-chain access)
  if (mainKey && chainId !== 1) {
    try {
      const v2url = new URL('https://api.etherscan.io/v2/api')
      v2url.searchParams.set('chainid', String(chainId))
      v2url.searchParams.set('apikey', mainKey)
      for (const [k, v] of Object.entries(params)) v2url.searchParams.set(k, v)
      const res  = await fetch(v2url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
      const data = await res.json()
      if (data.status === '1' || data.message === 'No records found') return data
      // If NOTOK, fall through to chain-specific API
    } catch { /* fall through */ }
  }

  // Attempt 2: Chain-specific explorer API
  if (!chainCfg) throw new Error(`No API config for chainId ${chainId}`)

  // Try chain-specific key first, then fall back to main Etherscan key
  const specificKey = process.env[chainCfg.keyEnv] ?? ''
  const apiKey = specificKey || mainKey
  if (!apiKey) throw new Error(`No API key for chainId ${chainId}`)

  const url = new URL(chainCfg.url)
  url.searchParams.set('apikey', apiKey)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res  = await fetch(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  return res.json()
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const chainId   = Number(searchParams.get('chainId'))
  const topic0    = searchParams.get('topic0')
  const topic1    = searchParams.get('topic1')
  const fromBlock = searchParams.get('fromBlock') ?? '0'
  const toBlock   = searchParams.get('toBlock')   ?? 'latest'

  if (!CHAIN_APIS[chainId]) {
    return NextResponse.json({ status: '0', message: 'Unsupported chain', result: [] }, { status: 400 })
  }
  if (!topic0 || !topic1) {
    return NextResponse.json({ status: '0', message: 'Missing topic0/topic1', result: [] }, { status: 400 })
  }

  const params = {
    module: 'logs', action: 'getLogs',
    topic0, topic1, topic0_1_opr: 'and',
    fromBlock, toBlock, page: '1', offset: '1000',
  }

  try {
    const data = await fetchWithFallback(chainId, params)
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[approvals-logs] error:', e.message)
    return NextResponse.json({ status: '0', message: e.message ?? 'Fetch failed', result: [] }, { status: 502 })
  }
}
