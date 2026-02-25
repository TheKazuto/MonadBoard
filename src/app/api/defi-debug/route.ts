import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'

// Possible Neverland pool addresses to try
const CANDIDATES = [
  { label: 'current',     addr: '0x3c1B89Db834A833D0Cf48Ed8d36C70bFf8f1E1E1' },
  { label: 'lowercase1',  addr: '0x3c1b89db834a833d0cf48ed8d36c70bff8f1e1e1' },
]

// getUserAccountData(address) selector
const SELECTOR = '0xbf92857c'

async function tryCall(pool: string, user: string) {
  const data = SELECTOR + user.slice(2).toLowerCase().padStart(64, '0')
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'eth_call',
      params: [{ to: pool, data }, 'latest'],
      id: 1,
    }),
    cache: 'no-store',
  })
  const json = await res.json()
  return json.result ?? null
}

async function getCode(addr: string) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'eth_getCode',
      params: [addr, 'latest'],
      id: 1,
    }),
    cache: 'no-store',
  })
  const json = await res.json()
  const code = json.result ?? '0x'
  return code === '0x' ? 'NO CONTRACT' : `CONTRACT (${(code.length - 2) / 2} bytes)`
}

// Try to find nToken addresses by calling pool.getReservesList()
// selector: 0xd1946dbc
async function getReservesList(pool: string) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'eth_call',
      params: [{ to: pool, data: '0xd1946dbc' }, 'latest'],
      id: 1,
    }),
    cache: 'no-store',
  })
  const json = await res.json()
  return json.result ?? '0x'
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  const results: any = {}

  for (const { label, addr } of CANDIDATES) {
    const code   = await getCode(addr)
    const result = await tryCall(addr, address)
    const reserves = await getReservesList(addr)
    results[label] = { addr, code, getUserAccountData: result, getReservesList: reserves }
  }

  // Also check nToken addresses to see if they exist
  const nTokenChecks: any = {}
  const nTokenAddrs = [
    { sym: 'WMON',  addr: '0xD0fd2Cf7F6CEff4F96B1161F5E995D5843326154' },
    { sym: 'USDC',  addr: '0x38648958836eA88b368b4ac23b86Ad44B0fe7508' },
    { sym: 'WETH',  addr: '0x31f63Ae5a96566b93477191778606BeBDC4CA66f' },
  ]
  for (const { sym, addr } of nTokenAddrs) {
    const code = await getCode(addr)
    // balanceOf(user)
    const balData = '0x70a08231' + address.slice(2).toLowerCase().padStart(64, '0')
    const balRes = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'eth_call',
        params: [{ to: addr, data: balData }, 'latest'],
        id: 1,
      }),
      cache: 'no-store',
    })
    const balJson = await balRes.json()
    nTokenChecks[sym] = { addr, code, balanceOf: balJson.result }
  }

  return NextResponse.json({ poolCandidates: results, nTokenChecks })
}
