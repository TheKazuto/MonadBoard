import { NextRequest, NextResponse } from 'next/server'

// Cache token lists in-memory for 1 hour (survives between requests in same serverless instance)
const cache: Map<string, { data: unknown; ts: number }> = new Map()
const TTL = 60 * 60 * 1000 // 1 hour

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform')
  if (!platform) return NextResponse.json({ error: 'missing platform' }, { status: 400 })

  const cached = cache.get(platform)
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data)
  }

  try {
    const res = await fetch(`https://tokens.coingecko.com/${platform}/all.json`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 3600 }, // Next.js cache layer too
    })
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
    const data = await res.json()
    cache.set(platform, { data, ts: Date.now() })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message, tokens: [] }, { status: 502 })
  }
}
