import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'

async function rpc(method: string, params: any[]) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  })
  return (await res.json()).result ?? null
}

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

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export async function GET(req: NextRequest) {
  const tx      = req.nextUrl.searchParams.get('tx')
  const address = req.nextUrl.searchParams.get('address')
  if (!tx) return NextResponse.json({ error: 'need ?tx=0x...' })

  const [receipt, txData] = await Promise.all([
    rpc('eth_getTransactionReceipt', [tx]),
    rpc('eth_getTransactionByHash', [tx]),
  ])

  if (!receipt) return NextResponse.json({ error: 'tx not found' })

  // Get symbol for every contract in logs
  const contracts = [...new Set(receipt.logs.map((l: any) => l.address as string))]
  const symCalls  = contracts.map((addr, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_call', params: [{ to: addr, data: '0x95d89b41' }, 'latest'] }))
  const symRes    = await batchCall(symCalls)

  const symbols: Record<string, string> = {}
  contracts.forEach((addr, i) => {
    try {
      const h = symRes.find((r: any) => r.id === i)?.result ?? ''
      if (h?.length > 130) {
        const hex = h.slice(2), offset = parseInt(hex.slice(0,64),16)*2, len = parseInt(hex.slice(offset,offset+64),16)
        symbols[addr.toLowerCase()] = Buffer.from(hex.slice(offset+64, offset+64+len*2),'hex').toString('utf8')
      }
    } catch {}
  })

  const transfers = receipt.logs
    .filter((l: any) => l.topics[0] === TRANSFER)
    .map((l: any) => ({
      contract: l.address,
      symbol:   symbols[l.address.toLowerCase()] ?? '?',
      from:     '0x' + l.topics[1]?.slice(26),
      to:       '0x' + l.topics[2]?.slice(26),
      amountHex: l.data,
      amount:   l.data !== '0x' ? (BigInt(l.data) / BigInt(1e14)).toString() + 'e-4' : '0',
    }))

  const otherLogs = receipt.logs
    .filter((l: any) => l.topics[0] !== TRANSFER)
    .map((l: any) => ({ contract: l.address, symbol: symbols[l.address.toLowerCase()] ?? '?', topic0: l.topics[0], data: l.data?.slice(0,66) }))

  // Check current balanceOf + common debt selectors for address on all contracts
  let balances: any[] = []
  if (address) {
    const balCalls = contracts.flatMap((addr, i) => [
      { jsonrpc: '2.0', id: i*3,   method: 'eth_call', params: [{ to: addr, data: '0x70a08231' + padAddr(address) }, 'latest'] }, // balanceOf
      { jsonrpc: '2.0', id: i*3+1, method: 'eth_call', params: [{ to: addr, data: '0x95dd9193' + padAddr(address) }, 'latest'] }, // borrowBalanceStored
      { jsonrpc: '2.0', id: i*3+2, method: 'eth_call', params: [{ to: addr, data: '0x28c0e77b' + padAddr(address) }, 'latest'] }, // borrowBalanceOf
    ])
    const balRes = await batchCall(balCalls)
    const zero   = '0x' + '0'.repeat(64)
    balances = contracts.map((addr, i) => ({
      addr,
      symbol:              symbols[addr.toLowerCase()] ?? '?',
      balanceOf:           balRes.find((r:any) => r.id === i*3)?.result,
      borrowBalanceStored: balRes.find((r:any) => r.id === i*3+1)?.result,
      borrowBalanceOf:     balRes.find((r:any) => r.id === i*3+2)?.result,
    })).filter(b =>
      [b.balanceOf, b.borrowBalanceStored, b.borrowBalanceOf].some(v => v && v !== '0x' && v !== zero)
    )
  }

  return NextResponse.json({
    txTo: txData?.to, inputSel: txData?.input?.slice(0,10),
    contracts: contracts.map(a => ({ addr: a, symbol: symbols[a.toLowerCase()] ?? '?' })),
    transfers,
    otherLogs,
    currentBalances: balances,
  })
}
