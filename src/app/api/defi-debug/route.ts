import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'

// Known Curvance cToken addresses from docs
const CTOKENS: Record<string, { symbol: string; underlying: string; decimals: number }> = {
  '0xD9E2025b907E95EcC963A5018f56B87575B4aB26': { symbol: 'caprMON', underlying: 'aprMON', decimals: 18 },
  '0xF32B334042DC1EB9732454cc9bc1a06205d184f2': { symbol: 'cWMON(apMON mkt)',  underlying: 'WMON',   decimals: 18 },
  '0x926C101Cf0a3dE8725Eb24a93E980f9FE34d6230': { symbol: 'cshMON', underlying: 'shMON',  decimals: 18 },
  '0x0fcEd51b526BfA5619F83d97b54a57e3327eB183': { symbol: 'cWMON(shMON mkt)', underlying: 'WMON',   decimals: 18 },
  '0x494876051B0E85dCe5ecd5822B1aD39b9660c928': { symbol: 'csMON',  underlying: 'sMON',   decimals: 18 },
  '0xebE45A6ceA7760a71D8e0fa5a0AE80a75320D708': { symbol: 'cWMON(sMON mkt)',  underlying: 'WMON',   decimals: 18 },
}

const PROTOCOL_READER = '0x878cDfc2F3D96a49A5CbD805FAF4F3080768a6d2'

async function rpcCall(to: string, data: string) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'], id: 1 }),
    cache: 'no-store',
  })
  return (await res.json()).result ?? '0x'
}

async function rpcBatch(calls: any[]) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calls),
    cache: 'no-store',
  })
  const data = await res.json()
  return Array.isArray(data) ? data : [data]
}

function padAddr(addr: string) {
  return addr.slice(2).toLowerCase().padStart(64, '0')
}
function decodeUint(hex: string) {
  if (!hex || hex === '0x') return 0n
  return BigInt(hex)
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  // 1. Check balanceOf and borrowBalanceStored for each cToken
  const balCalls = Object.entries(CTOKENS).flatMap(([addr, info], i) => [
    // balanceOf(user) - collateral/supply balance
    { jsonrpc: '2.0', id: i * 3, method: 'eth_call', params: [{ to: addr, data: '0x70a08231' + padAddr(address) }, 'latest'] },
    // borrowBalanceStored(user) - debt balance
    { jsonrpc: '2.0', id: i * 3 + 1, method: 'eth_call', params: [{ to: addr, data: '0x95dd9193' + padAddr(address) }, 'latest'] },
    // exchangeRateStored() - cToken → underlying rate
    { jsonrpc: '2.0', id: i * 3 + 2, method: 'eth_call', params: [{ to: addr, data: '0x182df0f5' }, 'latest'] },
  ])

  // 2. Also try ProtocolReader — getUserSnapshot(address,cToken[])
  // selector for getUserSnapshot(address,address[]) = keccak256 first 4 bytes
  // We'll try a few common view function selectors on ProtocolReader
  const readerCalls = [
    // Try calling with the user address to see what returns
    { jsonrpc: '2.0', id: 999, method: 'eth_call', params: [{ to: PROTOCOL_READER, data: '0xf0f44260' + padAddr(address) }, 'latest'] },
    { jsonrpc: '2.0', id: 998, method: 'eth_call', params: [{ to: PROTOCOL_READER, data: '0x9de07ba8' + padAddr(address) }, 'latest'] },
  ]

  const results = await rpcBatch([...balCalls, ...readerCalls])

  const cTokenData: any = {}
  Object.entries(CTOKENS).forEach(([addr, info], i) => {
    const bal      = decodeUint(results.find((r: any) => r.id === i * 3)?.result ?? '0x')
    const debt     = decodeUint(results.find((r: any) => r.id === i * 3 + 1)?.result ?? '0x')
    const exchRate = decodeUint(results.find((r: any) => r.id === i * 3 + 2)?.result ?? '0x')

    // Exchange rate is scaled by 1e18 in Compound-style: underlying = cTokens * exchangeRate / 1e18
    const underlying = exchRate > 0n ? Number(bal) * Number(exchRate) / 1e36 : 0
    const debtAmt    = Number(debt) / 1e18

    if (bal > 0n || debt > 0n) {
      cTokenData[info.symbol] = {
        addr,
        underlying: info.underlying,
        balRaw:     bal.toString(),
        debtRaw:    debt.toString(),
        exchRate:   exchRate.toString(),
        underlyingAmount: underlying.toFixed(6),
        debtAmount:  debtAmt.toFixed(6),
        hasPosition: true,
      }
    }
  })

  const readerRes: any = {}
  for (const r of results.filter((r: any) => r.id >= 998)) {
    readerRes[`id_${r.id}`] = r.result
  }

  return NextResponse.json({
    address,
    cTokenPositions: cTokenData,
    protocolReaderProbes: readerRes,
    allCtokensChecked: Object.keys(CTOKENS).length,
  })
}
