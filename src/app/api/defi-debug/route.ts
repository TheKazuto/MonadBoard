import { NextRequest, NextResponse } from 'next/server'
const RPC = 'https://rpc.monad.xyz'

async function rpc(method: string, params: any[]) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), cache: 'no-store' })
  return (await res.json()).result ?? null
}
async function batchCall(calls: any[]) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(calls), cache: 'no-store' })
  const d = await res.json(); return Array.isArray(d) ? d : [d]
}
function padAddr(a: string) { return a.slice(2).toLowerCase().padStart(64, '0') }

const CWMON          = '0xf473568b26b8c5aadca9fbc0ea17e1728d5ec925'
const MARKET_MANAGER = '0xb00aff53a4df2b4e2f97a3d9ffadb55564c8e42f'
// From borrow tx: topic0 of the non-Transfer log on cWMON
// 0x4e32a70f... and 0xbec1750e... and 0x5cbb919... 
// The event 0x5cbb919307f3804aff990e94bdc923c0878589779d539552a35353302b8ed8e5
// emitted by MarketManager with data = cWMON address — likely "MarketEntered" or "DebtTokenCreated"

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  const latestHex = await rpc('eth_blockNumber', [])
  const latest    = parseInt(latestHex, 16)
  const userTopic = '0x' + address.slice(2).toLowerCase().padStart(64, '0')

  // The borrow tx showed cWMON minted to 0x0acb7ef4... (debt token account)
  // That Transfer had from=0x0000... to=debtAccount
  // So scanning cWMON Transfer(from=zero, to=?) filtered by user-related events
  // But we need to find WHICH debt account belongs to THIS user
  
  // Strategy: scan ALL events on MarketManager where user is mentioned
  // The MarketManager event 0x5cbb919... had data = cWMON — it's likely "position opened"
  // Let's find ALL MarketManager events mentioning this user in any topic

  const mmLogs = await rpc('eth_getLogs', [{
    fromBlock: '0x0',
    toBlock: 'latest',
    address: MARKET_MANAGER,
    topics: [null, userTopic],  // user as topic[1]
  }])

  const mmLogs2 = await rpc('eth_getLogs', [{
    fromBlock: '0x0',
    toBlock: 'latest',
    address: MARKET_MANAGER,
    topics: [null, null, userTopic],  // user as topic[2]
  }])

  // Also scan cWMON for any event mentioning user
  const cwmonLogs = await rpc('eth_getLogs', [{
    fromBlock: '0x0',
    toBlock: 'latest',
    address: CWMON,
    topics: [null, userTopic],
  }])
  const cwmonLogs2 = await rpc('eth_getLogs', [{
    fromBlock: '0x0',
    toBlock: 'latest',
    address: CWMON,
    topics: [null, null, userTopic],
  }])

  // Also try: does cWMON have a mapping user→debtToken?
  // Common patterns: getDebtPosition(user), debtPositionOf(user), positions(user)
  const mapCalls = [
    { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: CWMON, data: '0x2726d3ef' + padAddr(address) }, 'latest'] }, // debtPosition(addr)
    { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: CWMON, data: '0x9e2517d3' + padAddr(address) }, 'latest'] }, // positions(addr)
    { jsonrpc: '2.0', id: 3, method: 'eth_call', params: [{ to: CWMON, data: '0x715b208b' + padAddr(address) }, 'latest'] }, // getPosition(addr)
    { jsonrpc: '2.0', id: 4, method: 'eth_call', params: [{ to: CWMON, data: '0x9153b9e1' + padAddr(address) }, 'latest'] }, // debtPositionOf(addr)
    { jsonrpc: '2.0', id: 5, method: 'eth_call', params: [{ to: CWMON, data: '0xeee2e346' + padAddr(address) }, 'latest'] }, // getDebtPosition(addr)
    { jsonrpc: '2.0', id: 6, method: 'eth_call', params: [{ to: CWMON, data: '0x6f307dc3' + padAddr(address) }, 'latest'] }, // getUser(addr)
    { jsonrpc: '2.0', id: 7, method: 'eth_call', params: [{ to: MARKET_MANAGER, data: '0x2726d3ef' + padAddr(address) }, 'latest'] },
    { jsonrpc: '2.0', id: 8, method: 'eth_call', params: [{ to: MARKET_MANAGER, data: '0x9e2517d3' + padAddr(address) }, 'latest'] },
    { jsonrpc: '2.0', id: 9, method: 'eth_call', params: [{ to: MARKET_MANAGER, data: '0x715b208b' + padAddr(address) }, 'latest'] },
    { jsonrpc: '2.0', id: 10, method: 'eth_call', params: [{ to: MARKET_MANAGER, data: '0x9153b9e1' + padAddr(address) }, 'latest'] },
    { jsonrpc: '2.0', id: 11, method: 'eth_call', params: [{ to: MARKET_MANAGER, data: '0xeee2e346' + padAddr(address) }, 'latest'] },
    { jsonrpc: '2.0', id: 12, method: 'eth_call', params: [{ to: MARKET_MANAGER, data: '0x6f307dc3' + padAddr(address) }, 'latest'] },
  ]
  const mapResults = await batchCall(mapCalls)
  const zero = '0x' + '0'.repeat(64)
  const mapHits = mapResults.filter((r: any) => r.result && r.result !== '0x' && r.result !== zero)
    .map((r: any) => ({ id: r.id, result: r.result, asAddr: '0x' + r.result.slice(-40) }))

  return NextResponse.json({
    mmLogs:     (mmLogs  ?? []).map((l: any) => ({ topic0: l.topics[0], topics: l.topics, data: l.data?.slice(0,66), tx: l.transactionHash })),
    mmLogs2:    (mmLogs2 ?? []).map((l: any) => ({ topic0: l.topics[0], topics: l.topics, data: l.data?.slice(0,66), tx: l.transactionHash })),
    cwmonLogs:  (cwmonLogs  ?? []).map((l: any) => ({ topic0: l.topics[0], topics: l.topics, data: l.data?.slice(0,66) })),
    cwmonLogs2: (cwmonLogs2 ?? []).map((l: any) => ({ topic0: l.topics[0], topics: l.topics, data: l.data?.slice(0,66) })),
    mapHits,
  })
}
