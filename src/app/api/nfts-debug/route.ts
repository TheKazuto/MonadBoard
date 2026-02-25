import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

// Debug endpoint — call /api/nfts-debug?address=0x... to see raw Etherscan response
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

  const apiKey = process.env.ETHERSCAN_API_KEY

  const results: Record<string, any> = {
    address,
    hasApiKey: !!apiKey,
    apiKeyPreview: apiKey ? apiKey.slice(0, 6) + '...' : null,
  }

  // Test chainid=143 (mainnet)
  try {
    const url143 = `https://api.etherscan.io/v2/api?chainid=143&module=account&action=tokennfttx&address=${address}&page=1&offset=10&sort=desc&apikey=${apiKey ?? 'YourApiKeyToken'}`
    const r143 = await fetch(url143, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    const d143 = await r143.json()
    results.chainid_143 = { status: d143.status, message: d143.message, resultCount: Array.isArray(d143.result) ? d143.result.length : d143.result, sample: Array.isArray(d143.result) ? d143.result.slice(0, 2) : null }
  } catch (e: any) {
    results.chainid_143 = { error: e.message }
  }

  // Also test regular txlist to confirm API key works
  try {
    const urlTx = `https://api.etherscan.io/v2/api?chainid=143&module=account&action=txlist&address=${address}&page=1&offset=3&sort=desc&apikey=${apiKey ?? 'YourApiKeyToken'}`
    const rTx = await fetch(urlTx, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    const dTx = await rTx.json()
    results.txlist_143 = { status: dTx.status, message: dTx.message, resultCount: Array.isArray(dTx.result) ? dTx.result.length : dTx.result }
  } catch (e: any) {
    results.txlist_143 = { error: e.message }
  }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } })
}
