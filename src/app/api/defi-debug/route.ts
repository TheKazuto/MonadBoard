import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'
const NEVERLAND_POOL = '0x80F00661b13CC5F6ccd3885bE7b4C9c67545D585'

async function call(to: string, data: string) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'], id: 1 }),
    cache: 'no-store',
  })
  return (await res.json()).result ?? '0x'
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  const data    = '0xbf92857c' + address.slice(2).toLowerCase().padStart(64, '0')
  const raw     = await call(NEVERLAND_POOL, data)

  if (!raw || raw === '0x' || raw.length < 10) {
    return NextResponse.json({ pool: NEVERLAND_POOL, error: 'empty result', raw })
  }

  const hex = raw.slice(2)
  const w   = (i: number) => BigInt('0x' + hex.slice(i * 64, (i + 1) * 64))

  const collateral  = w(0)
  const debt        = w(1)
  const liqThr      = w(3)
  const hfRaw       = w(5)

  const hf_w5      = Number(hfRaw) / 1e18
  const hf_formula = debt > 0n
    ? (Number(collateral) * Number(liqThr) / 10000) / Number(debt)
    : 999

  return NextResponse.json({
    pool: NEVERLAND_POOL,
    totalCollateralUSD: Number(collateral) / 1e8,
    totalDebtUSD:       Number(debt) / 1e8,
    liqThresholdBps:    Number(liqThr),
    liqThresholdPct:    (Number(liqThr) / 100).toFixed(2) + '%',
    hf_w5,
    hf_formula,
    words: Array.from({ length: 6 }, (_, i) => hex.slice(i * 64, (i + 1) * 64)),
  })
}
