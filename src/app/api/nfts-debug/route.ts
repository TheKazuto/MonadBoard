import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

export async function GET(req: NextRequest) {
  const address  = req.nextUrl.searchParams.get('address')
  const contract = req.nextUrl.searchParams.get('contract') // optional: test ME floor for a contract

  const apiKey = process.env.ETHERSCAN_API_KEY
  const meKey  = process.env.MAGIC_EDEN_API_KEY

  const results: Record<string, any> = {
    address,
    hasEtherscanKey: !!apiKey,
    hasMEKey: !!meKey,
  }

  if (address) {
    // Test Etherscan tokennfttx chainid=143
    try {
      const url = `https://api.etherscan.io/v2/api?chainid=143&module=account&action=tokennfttx&address=${address}&page=1&offset=10&sort=desc&apikey=${apiKey ?? 'YourApiKeyToken'}`
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      const d = await r.json()
      results.etherscan_nft = {
        status: d.status,
        message: d.message,
        count: Array.isArray(d.result) ? d.result.length : d.result,
        sample: Array.isArray(d.result) ? d.result.slice(0, 2) : null,
      }
    } catch (e: any) {
      results.etherscan_nft = { error: e.message }
    }
  }

  if (contract) {
    // Test Magic Eden floor price — try different chain slugs
    const slugs = ['monad', 'monad-mainnet', 'monad_mainnet']
    for (const slug of slugs) {
      try {
        const headers: Record<string,string> = { accept: 'application/json' }
        if (meKey) headers['Authorization'] = `Bearer ${meKey}`
        const url = `https://api-mainnet.magiceden.dev/v3/rtp/${slug}/collections/v7?id=${contract}&limit=1`
        const r = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(6_000) })
        results[`me_${slug}`] = {
          status: r.status,
          ok: r.ok,
          body: r.ok ? await r.json() : await r.text().catch(() => '?'),
        }
      } catch (e: any) {
        results[`me_${slug}`] = { error: e.message }
      }
    }

    // Also try Reservoir directly
    try {
      const url = `https://api.reservoir.tools/collections/v7?id=${contract}&limit=1`
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6_000) })
      results.reservoir = { status: r.status, body: r.ok ? (await r.json()).collections?.[0]?.floorAsk ?? null : await r.text() }
    } catch (e: any) {
      results.reservoir = { error: e.message }
    }
  }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } })
}
