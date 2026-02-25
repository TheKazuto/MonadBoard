import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'

async function batchCall(calls: any[]) {
  if (!calls.length) return []
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calls),
    cache: 'no-store',
  })
  const d = await res.json()
  return Array.isArray(d) ? d : [d]
}

function padAddr(a: string) { return a.slice(2).toLowerCase().padStart(64, '0') }
function decodeUint(hex: string) { return (!hex || hex === '0x') ? 0n : BigInt(hex) }

const CTOKENS: Record<string, string> = {
  '0xD9E2025b907E95EcC963A5018f56B87575B4aB26': 'caprMON',
  '0xF32B334042DC1EB9732454cc9bc1a06205d184f2': 'cWMON(apMON)',
  '0x926C101Cf0a3dE8725Eb24a93E980f9FE34d6230': 'cshMON',
  '0x0fcEd51b526BfA5619F83d97b54a57e3327eB183': 'cWMON(shMON)',
  '0x494876051B0E85dCe5ecd5822B1aD39b9660c928': 'csMON',
  '0xebE45A6ceA7760a71D8e0fa5a0AE80a75320D708': 'cWMON(sMON)',
  '0x5ca6966543c0786f547446234492d2f11c82f11f': 'cgMON',
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  const addrs = Object.keys(CTOKENS)

  const calls = addrs.flatMap((addr, i) => [
    { jsonrpc: '2.0', id: i * 3,     method: 'eth_call', params: [{ to: addr, data: '0x70a08231' + padAddr(address) }, 'latest'] }, // balanceOf
    { jsonrpc: '2.0', id: i * 3 + 1, method: 'eth_call', params: [{ to: addr, data: '0x95dd9193' + padAddr(address) }, 'latest'] }, // borrowBalanceStored
    { jsonrpc: '2.0', id: i * 3 + 2, method: 'eth_call', params: [{ to: addr, data: '0x182df0f5' }, 'latest'] }, // exchangeRateStored
  ])

  const results = await batchCall(calls)

  const parsed = addrs.map((addr, i) => {
    const balRaw   = results.find((r: any) => r.id === i * 3)?.result ?? '0x'
    const debtRaw  = results.find((r: any) => r.id === i * 3 + 1)?.result ?? '0x'
    const exchRaw  = results.find((r: any) => r.id === i * 3 + 2)?.result ?? '0x'
    const bal  = decodeUint(balRaw)
    const debt = decodeUint(debtRaw)
    const exch = decodeUint(exchRaw)

    const underlyingAmt = exch > 0n ? Number(bal) * Number(exch) / 1e36 : Number(bal) / 1e18
    const debtAmt       = Number(debt) / 1e18

    return {
      addr,
      symbol:    CTOKENS[addr],
      balRaw,
      debtRaw,
      exchRaw,
      bal:       bal.toString(),
      debt:      debt.toString(),
      exch:      exch.toString(),
      underlyingAmt,
      debtAmt,
      hasPosition: bal > 0n || debt > 0n,
    }
  })

  const withPositions = parsed.filter(p => p.hasPosition)

  return NextResponse.json({ address, all: parsed, withPositions })
}
