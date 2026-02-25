import { NextRequest, NextResponse } from 'next/server'
const RPC = 'https://rpc.monad.xyz'

async function batchCall(calls: any[]) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(calls), cache: 'no-store' })
  const d = await res.json(); return Array.isArray(d) ? d : [d]
}
function padAddr(a: string) { return a.slice(2).toLowerCase().padStart(64, '0') }
function decodeUint(h: string) { return (!h || h === '0x') ? 0n : BigInt(h) }
function decodeAddr(h: string) { return (!h || h.length < 42) ? null : '0x' + h.slice(-40) }

const CWMON = '0xf473568b26b8c5aadca9fbc0ea17e1728d5ec925'
// Known debt token for this user from borrow tx
const DEBT_TOKEN = '0x0acb7ef4d8733c719d60e0992b489b629bc55c02'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  // Try multiple selectors on cWMON to find the one that maps user → debt token
  const selectors: Record<string, string> = {
    'debtTokenOf(addr)':        '0x3b2c0b77',
    'getDebtToken(addr)':       '0xa6333d9e',
    'debtAccountOf(addr)':      '0x9a4de1a6',
    'positionOf(addr)':         '0x8e5d588e',
    'getBorrowData(addr)':      '0xc4d66de8',
    'accountOf(addr)':          '0xf4f3b200',
    'getUserDebt(addr)':        '0x741bef1a',
    'lenderDebtToken(addr)':    '0x1c1b8772',
    'debtOf(addr)':             '0x7d945c6f',
    'borrowerOf(addr)':         '0x5be7fde8',
    'getDebtAccount(addr)':     '0x0e6f3b6d',
    'debtTokenAccount(addr)':   '0x2ef7b935',
  }

  const calls: any[] = []
  // Try all selectors on cWMON with user address
  Object.entries(selectors).forEach(([name, sel], i) => {
    calls.push({ jsonrpc: '2.0', id: i, method: 'eth_call', params: [{ to: CWMON, data: sel + padAddr(address) }, 'latest'] })
  })

  // Also: check balanceOf(known debt token) on cWMON — maybe cWMON tracks it
  calls.push({ jsonrpc: '2.0', id: 100, method: 'eth_call', params: [{ to: CWMON, data: '0x70a08231' + padAddr(DEBT_TOKEN) }, 'latest'] })
  // balanceOf(user) on DEBT_TOKEN contract itself
  calls.push({ jsonrpc: '2.0', id: 101, method: 'eth_call', params: [{ to: DEBT_TOKEN, data: '0x70a08231' + padAddr(address) }, 'latest'] })
  // balanceOf(debt_token) on DEBT_TOKEN — maybe it stores its own balance
  calls.push({ jsonrpc: '2.0', id: 102, method: 'eth_call', params: [{ to: DEBT_TOKEN, data: '0x70a08231' + padAddr(DEBT_TOKEN) }, 'latest'] })
  // totalSupply of DEBT_TOKEN
  calls.push({ jsonrpc: '2.0', id: 103, method: 'eth_call', params: [{ to: DEBT_TOKEN, data: '0x18160ddd' }, 'latest'] })
  // symbol of DEBT_TOKEN
  calls.push({ jsonrpc: '2.0', id: 104, method: 'eth_call', params: [{ to: DEBT_TOKEN, data: '0x95d89b41' }, 'latest'] })
  // balanceOf(user) on cWMON directly
  calls.push({ jsonrpc: '2.0', id: 105, method: 'eth_call', params: [{ to: CWMON, data: '0x70a08231' + padAddr(address) }, 'latest'] })
  // Try: does DEBT_TOKEN have an "owner()" or "borrower()"?
  calls.push({ jsonrpc: '2.0', id: 106, method: 'eth_call', params: [{ to: DEBT_TOKEN, data: '0x8da5cb5b' }, 'latest'] }) // owner()
  calls.push({ jsonrpc: '2.0', id: 107, method: 'eth_call', params: [{ to: DEBT_TOKEN, data: '0xb6549f75' }, 'latest'] }) // borrower() / lender()
  calls.push({ jsonrpc: '2.0', id: 108, method: 'eth_call', params: [{ to: DEBT_TOKEN, data: '0xae6e2953' }, 'latest'] }) // cToken()
  calls.push({ jsonrpc: '2.0', id: 109, method: 'eth_call', params: [{ to: DEBT_TOKEN, data: '0xfc0c546a' }, 'latest'] }) // token() / underlying

  const results = await batchCall(calls)
  const zero = '0x' + '0'.repeat(64)

  const selectorHits: any[] = []
  Object.keys(selectors).forEach((name, i) => {
    const r = results.find((x: any) => x.id === i)?.result
    if (r && r !== '0x' && r !== zero) selectorHits.push({ name, result: r, asAddr: decodeAddr(r) })
  })

  const misc: any = {}
  ;[100,101,102,103,104,105,106,107,108,109].forEach(id => {
    const r = results.find((x: any) => x.id === id)?.result
    const labels: Record<number,string> = {100:'cWMON.balanceOf(debtToken)',101:'debtToken.balanceOf(user)',102:'debtToken.balanceOf(self)',103:'debtToken.totalSupply',104:'debtToken.symbol',105:'cWMON.balanceOf(user)',106:'debtToken.owner',107:'debtToken.borrower',108:'debtToken.cToken',109:'debtToken.underlying'}
    if (r && r !== '0x') misc[labels[id]] = r
  })

  return NextResponse.json({ selectorHits, misc })
}
