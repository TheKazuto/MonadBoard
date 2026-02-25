import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'

async function rpc(method: string, params: any[]) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  return (await res.json()).result ?? null
}

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

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export async function GET(req: NextRequest) {
  const tx      = req.nextUrl.searchParams.get('tx')
  const address = req.nextUrl.searchParams.get('address')

  // ── MODE 1: inspect a specific tx hash ────────────────────────────────────
  if (tx) {
    const [receipt, txData] = await Promise.all([
      rpc('eth_getTransactionReceipt', [tx]),
      rpc('eth_getTransactionByHash',  [tx]),
    ])

    if (!receipt) return NextResponse.json({ error: 'tx not found' })

    const transfers = receipt.logs
      .filter((l: any) => l.topics[0] === TRANSFER)
      .map((l: any) => ({
        contract: l.address,
        from: '0x' + l.topics[1]?.slice(26),
        to:   '0x' + l.topics[2]?.slice(26),
        data: l.data,
      }))

    const otherLogs = receipt.logs
      .filter((l: any) => l.topics[0] !== TRANSFER)
      .map((l: any) => ({ contract: l.address, topic0: l.topics[0], data: l.data?.slice(0, 66) }))

    // For each unique contract in logs, get symbol
    const contracts = [...new Set(receipt.logs.map((l: any) => l.address as string))]
    const symCalls = contracts.map((addr, i) => ({
      jsonrpc: '2.0', id: i, method: 'eth_call',
      params: [{ to: addr, data: '0x95d89b41' }, 'latest'],
    }))
    const symResults = await batchCall(symCalls)
    const symbols: Record<string, string> = {}
    contracts.forEach((addr, i) => {
      try {
        const h = symResults.find((r: any) => r.id === i)?.result ?? ''
        if (h && h.length > 130) {
          const hex = h.slice(2)
          const offset = parseInt(hex.slice(0, 64), 16) * 2
          const len = parseInt(hex.slice(offset, offset + 64), 16)
          symbols[addr] = Buffer.from(hex.slice(offset + 64, offset + 64 + len * 2), 'hex').toString('utf8')
        }
      } catch {}
    })

    // For each contract in transfers, check balanceOf(address) if address provided
    const balData: any[] = []
    if (address) {
      const unique = [...new Set(transfers.map((t: any) => t.contract as string))]
      const balCalls = unique.flatMap((addr, i) => [
        { jsonrpc: '2.0', id: 500 + i * 2,     method: 'eth_call', params: [{ to: addr, data: '0x70a08231' + padAddr(address) }, 'latest'] },
        { jsonrpc: '2.0', id: 500 + i * 2 + 1, method: 'eth_call', params: [{ to: addr, data: '0x95dd9193' + padAddr(address) }, 'latest'] },
      ])
      const bals = await batchCall(balCalls)
      unique.forEach((addr, i) => {
        const bal  = bals.find((r: any) => r.id === 500 + i * 2)?.result
        const debt = bals.find((r: any) => r.id === 500 + i * 2 + 1)?.result
        balData.push({ addr, symbol: symbols[addr] ?? '?', balanceOf: bal, borrowBalance: debt })
      })
    }

    return NextResponse.json({
      txTo:      txData?.to,
      txFrom:    txData?.from,
      inputSel:  txData?.input?.slice(0, 10),
      contracts: contracts.map(a => ({ addr: a, symbol: symbols[a] ?? '?' })),
      transfers,
      otherLogs,
      currentBalances: balData,
    })
  }

  return NextResponse.json({ error: 'pass ?tx=0x... or ?address=0x...' })
}
