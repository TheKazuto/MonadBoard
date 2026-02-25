import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'

async function batchCall(calls: any[]) {
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

// Market Manager for gMON/WMON — found in tx logs (0xb00a...)
const MARKET_MANAGER = '0xb00aff53a4df2b4e2f97a3d9ffadb55564c8e42f'
const CGMON          = '0x5ca6966543c0786f547446234492d2f11c82f11f'

// Common function selectors that lending protocols use for borrow balance
const SELECTORS: Record<string, string> = {
  borrowBalanceOf:       '0x28c0e77b', // borrowBalanceOf(address)
  getBorrowBalance:      '0x0e752702', // borrowBalanceOf(address) alt
  debtBalanceOf:         '0x5fe3b567', // debtBalanceOf(address)
  borrowBalance:         '0x18160ddd', // totalSupply (wrong but let's see)
  accountBorrows:        '0x1e87c356', // accountBorrows(address) returns (uint,uint)
  borrowBalanceCurrent:  '0xaa5af0fd', // borrowBalanceCurrent(address)
  debtOf:                '0x7d945c6f', // debtOf(address)
  getAccountSnapshot:    '0xc37f68e2', // getAccountSnapshot(address)
  tokensAccrued:         '0x11f9cfe0', // tokensAccrued(address)
  borrowIndex:           '0xaa5af0fd', // borrowIndex
  // Market Manager specific
  getBorrowedAmount:     '0x5c11d62e', // getBorrowedAmount(address)
  getDebt:               '0xe5b7c3e4', // getDebt(address)
  positionOf:            '0x8e5d588e', // positionOf(address)
  accountLiquidity:      '0x5ec88c79', // getAccountLiquidity(address)
  getHypotheticalLiq:    '0x4e79238f', // getHypotheticalAccountLiquidity
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  const calls: any[] = []
  let id = 0

  // Try all selectors on both cgMON and Market Manager
  for (const [name, sel] of Object.entries(SELECTORS)) {
    calls.push({ jsonrpc: '2.0', id: id++, method: 'eth_call', params: [{ to: CGMON,          data: sel + padAddr(address) }, 'latest'] })
    calls.push({ jsonrpc: '2.0', id: id++, method: 'eth_call', params: [{ to: MARKET_MANAGER, data: sel + padAddr(address) }, 'latest'] })
  }

  // Also try getAccountSnapshot(address) on cgMON — returns (err, cTokenBal, borrowBal, exchRate)
  calls.push({ jsonrpc: '2.0', id: 900, method: 'eth_call', params: [{ to: CGMON, data: '0xc37f68e2' + padAddr(address) }, 'latest'] })

  // Try no-arg calls on market manager
  calls.push({ jsonrpc: '2.0', id: 901, method: 'eth_call', params: [{ to: MARKET_MANAGER, data: '0x18160ddd' }, 'latest'] }) // totalSupply
  calls.push({ jsonrpc: '2.0', id: 902, method: 'eth_call', params: [{ to: MARKET_MANAGER, data: '0x95d89b41' }, 'latest'] }) // symbol
  calls.push({ jsonrpc: '2.0', id: 903, method: 'eth_call', params: [{ to: MARKET_MANAGER, data: '0x313ce567' }, 'latest'] }) // decimals

  const results = await batchCall(calls)

  // Show non-empty, non-zero results
  const interesting: any[] = []
  const selNames = Object.keys(SELECTORS)

  results.forEach((r: any) => {
    const res = r.result
    if (!res || res === '0x' || res === '0x0000000000000000000000000000000000000000000000000000000000000000') return
    
    const idx = r.id
    let label = `id_${idx}`
    if (idx < selNames.length * 2) {
      const selName = selNames[Math.floor(idx / 2)]
      const contract = idx % 2 === 0 ? 'cgMON' : 'MarketManager'
      label = `${contract}.${selName}`
    } else {
      label = ['getAccountSnapshot(cgMON)', 'totalSupply(MM)', 'symbol(MM)', 'decimals(MM)'][idx - 900] ?? label
    }
    
    interesting.push({ label, id: idx, result: res })
  })

  return NextResponse.json({ address, interesting, totalCalls: calls.length })
}
