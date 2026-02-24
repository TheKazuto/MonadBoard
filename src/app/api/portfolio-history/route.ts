import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

// Token config — must match token-exposure/route.ts
const KNOWN_TOKENS = [
  { symbol: 'USDC', contract: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', decimals: 6, coingeckoId: 'usd-coin' },
  { symbol: 'WETH', contract: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', decimals: 18, coingeckoId: 'ethereum' },
  { symbol: 'USDT', contract: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6, coingeckoId: 'tether' },
  { symbol: 'WBTC', contract: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', decimals: 8, coingeckoId: 'bitcoin' },
  { symbol: 'WMON', contract: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', decimals: 18, coingeckoId: 'monad' },
]

const RPC = 'https://rpc.monad.xyz'

function buildBalanceOfCall(tokenContract: string, walletAddress: string) {
  const paddedAddress = walletAddress.slice(2).toLowerCase().padStart(64, '0')
  return {
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [{ to: tokenContract, data: '0x70a08231' + paddedAddress }, 'latest'],
    id: tokenContract,
  }
}

async function fetchTokenBalance(tokenContract: string, walletAddress: string, decimals: number): Promise<number> {
  const call = buildBalanceOfCall(tokenContract, walletAddress)
  try {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(call),
      cache: 'no-store',
    })
    const data = await res.json()
    const raw = data?.result
    if (!raw || raw === '0x' || raw === '0x0' || raw === '0x' + '0'.repeat(64)) return 0
    return Number(BigInt(raw)) / Math.pow(10, decimals)
  } catch {
    return 0
  }
}

async function fetchNativeBalance(address: string): Promise<number> {
  try {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 'native' }),
      cache: 'no-store',
    })
    const data = await res.json()
    if (!data?.result) return 0
    return Number(BigInt(data.result)) / 1e18
  } catch {
    return 0
  }
}

async function fetchPriceHistory(coinId: string, days: number): Promise<[number, number][]> {
  try {
    const apiKey = process.env.COINGECKO_API_KEY
    const baseUrl = apiKey ? 'https://pro-api.coingecko.com' : 'https://api.coingecko.com'
    const keyParam = apiKey ? `&x_cg_pro_api_key=${apiKey}` : ''

    const url = `${baseUrl}/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily${keyParam}`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    const data = await res.json()
    return data?.prices ?? []
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30')

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  try {
    // ── 1. Fetch all current balances in parallel ──────────────────────────────
    const [monBalance, ...tokenBalances] = await Promise.all([
      fetchNativeBalance(address),
      ...KNOWN_TOKENS.map(t => fetchTokenBalance(t.contract, address, t.decimals)),
    ])

    // Build a map of symbol → balance (only non-zero)
    const balances: Record<string, number> = {}
    if (monBalance > 0.0001) balances['monad'] = monBalance
    KNOWN_TOKENS.forEach((t, i) => {
      if (tokenBalances[i] > 0.0001) balances[t.coingeckoId] = tokenBalances[i]
    })

    const heldCoinIds = Object.keys(balances)

    // If wallet is empty, return empty chart
    if (heldCoinIds.length === 0) {
      return NextResponse.json({ history: [], totalValue: 0, change: 0 })
    }

    // ── 2. Fetch price history for each held coin ──────────────────────────────
    const priceHistories = await Promise.all(
      heldCoinIds.map(id => fetchPriceHistory(id, days))
    )

    // ── 3. Build daily portfolio value ────────────────────────────────────────
    // Use monad or the first token as reference for dates
    const referenceHistory = priceHistories[0] ?? []
    if (referenceHistory.length === 0) {
      return NextResponse.json({ history: [], totalValue: 0, change: 0 })
    }

    // Build a map: coinId → Map<dateStr, price>
    const priceMaps: Map<string, Map<string, number>> = new Map()
    heldCoinIds.forEach((id, i) => {
      const map = new Map<string, number>()
      priceHistories[i].forEach(([ts, price]) => {
        const date = new Date(ts).toISOString().split('T')[0]
        map.set(date, price)
      })
      priceMaps.set(id, map)
    })

    // For each date in reference, sum value of all tokens
    const history: { date: string; value: number }[] = []

    referenceHistory.forEach(([ts]) => {
      const date = new Date(ts).toISOString().split('T')[0]
      let totalValue = 0
      for (const [coinId, balance] of Object.entries(balances)) {
        const price = priceMaps.get(coinId)?.get(date) ?? 0
        totalValue += balance * price
      }
      history.push({ date, value: Math.round(totalValue * 100) / 100 })
    })

    const first = history[0]?.value ?? 0
    const last = history[history.length - 1]?.value ?? 0
    const change = first > 0 ? ((last - first) / first) * 100 : 0

    return NextResponse.json({ history, totalValue: last, change })
  } catch (err) {
    console.error('[portfolio-history] error:', err)
    return NextResponse.json({ error: 'Failed to fetch portfolio history' }, { status: 500 })
  }
}
