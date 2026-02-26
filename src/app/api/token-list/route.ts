import { NextRequest, NextResponse } from 'next/server'

// In-memory cache — 1h TTL
const cache = new Map<string, { data: unknown; ts: number }>()
const TTL = 60 * 60 * 1000

// Chains that use GeckoTerminal instead of CoinGecko token list
// because they don't have a CoinGecko token list yet
const GECKO_TERMINAL_NETWORKS: Record<string, string> = {
  monad:   'monad',
  'monad-mainnet': 'monad',
}

// Fetch top tokens from GeckoTerminal for chains not in CoinGecko token list
// Returns tokens in the same shape as CoinGecko token list { tokens: [...] }
async function fetchFromGeckoTerminal(network: string) {
  // Fetch multiple pages of top pools to build a token list
  // Each pool has base_token + quote_token with image_url
  const tokenMap = new Map<string, {
    symbol: string; name: string; address: string; decimals: number; logoURI: string
  }>()

  // Fetch top pools page 1 and 2 (each has 100 pools = ~200 unique tokens)
  for (let page = 1; page <= 3; page++) {
    try {
      const res = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/${network}/pools?include=base_token,quote_token&page=${page}&sort=h24_volume_usd_desc`,
        { headers: { 'Accept': 'application/json' }, next: { revalidate: 3600 } }
      )
      if (!res.ok) break

      const data = await res.json()
      const included: any[] = data.included ?? []

      for (const item of included) {
        if (item.type !== 'token') continue
        const a = item.attributes
        const addr = a.address?.toLowerCase()
        if (!addr || tokenMap.has(addr)) continue

        tokenMap.set(addr, {
          symbol:   a.symbol ?? '',
          name:     a.name ?? a.symbol ?? '',
          address:  a.address,
          decimals: a.decimals ?? 18,
          logoURI:  a.image_url && a.image_url !== 'missing.png' ? a.image_url : '',
        })
      }
    } catch { break }
  }

  return { tokens: Array.from(tokenMap.values()) }
}

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform')
  if (!platform) return NextResponse.json({ error: 'missing platform' }, { status: 400 })

  // Check cache
  const cached = cache.get(platform)
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data)
  }

  try {
    let data: unknown

    const gtNetwork = GECKO_TERMINAL_NETWORKS[platform]
    if (gtNetwork) {
      // Use GeckoTerminal for chains not yet on CoinGecko token list
      data = await fetchFromGeckoTerminal(gtNetwork)
    } else {
      // Use CoinGecko token list (Uniswap-compatible format)
      const res = await fetch(`https://tokens.coingecko.com/${platform}/all.json`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 3600 },
      })
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
      data = await res.json()
    }

    cache.set(platform, { data, ts: Date.now() })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message, tokens: [] }, { status: 502 })
  }
}
