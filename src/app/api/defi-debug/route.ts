import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'
const NEVERLAND_POOL = '0x3c1B89Db834A833D0Cf48Ed8d36C70bFf8f1E1E1'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'no address' })

  const data = '0xbf92857c' + address.slice(2).toLowerCase().padStart(64, '0')

  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'eth_call',
      params: [{ to: NEVERLAND_POOL, data }, 'latest'],
      id: 1,
    }),
    cache: 'no-store',
  })
  const json = await res.json()
  const raw: string = json.result ?? ''

  if (!raw || raw === '0x') {
    return NextResponse.json({ error: 'empty result', raw })
  }

  const hex = raw.slice(2)
  // Show ALL words regardless of count
  const wordCount = Math.floor(hex.length / 64)
  const words = Array.from({ length: wordCount }, (_, i) => hex.slice(i * 64, (i + 1) * 64))

  const w = (i: number) => BigInt('0x' + (words[i] ?? '0'))

  const totalCollateralBase  = w(0)
  const totalDebtBase        = w(1)
  const currentLiqThreshold  = w(3)
  const healthFactorRaw      = w(5)

  const hfFromW5    = Number(healthFactorRaw) / 1e18
  const hfFormula   = totalDebtBase > 0n
    ? (Number(totalCollateralBase) * Number(currentLiqThreshold) / 10000) / Number(totalDebtBase)
    : 999

  return NextResponse.json({
    wordCount,
    words,
    totalCollateralUSD:   Number(totalCollateralBase) / 1e8,
    totalDebtUSD:         Number(totalDebtBase) / 1e8,
    liqThresholdBps:      Number(currentLiqThreshold),
    liqThresholdPct:      (Number(currentLiqThreshold) / 100).toFixed(2) + '%',
    hf_w5_raw:            healthFactorRaw.toString(),
    hf_from_w5:           hfFromW5,
    hf_from_formula:      hfFormula,
  })
}
