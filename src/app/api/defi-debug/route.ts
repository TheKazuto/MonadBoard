import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'

async function rpc(method: string, params: any[]) {
  const res = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}), cache:'no-store' })
  return (await res.json()).result ?? null
}
async function batchCall(calls: any[]) {
  const res = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(calls), cache:'no-store' })
  const d = await res.json(); return Array.isArray(d) ? d : [d]
}
function padAddr(a: string) { return a.slice(2).toLowerCase().padStart(64,'0') }

const CWMON = '0xf473568b26b8c5aadca9fbc0ea17e1728d5ec925'

// Extract 4-byte selectors from bytecode
function extractSelectors(bytecode: string): string[] {
  const hex = bytecode.replace('0x','')
  const selectors = new Set<string>()
  // PUSH4 opcode = 0x63, followed by 4 bytes
  for (let i = 0; i < hex.length - 10; i += 2) {
    if (hex[i]+hex[i+1] === '63') {
      const sel = '0x' + hex.slice(i+2, i+10)
      selectors.add(sel)
    }
  }
  return [...selectors]
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  // Get bytecode of cWMON and extract all function selectors
  const code = await rpc('eth_getCode', [CWMON, 'latest'])
  const selectors = extractSelectors(code ?? '')

  // Try ALL extracted selectors with user address
  const calls = selectors.map((sel, i) => ({
    jsonrpc: '2.0', id: i,
    method: 'eth_call',
    params: [{ to: CWMON, data: sel + padAddr(address) }, 'latest']
  }))

  // Also try without args (no-arg functions)
  selectors.forEach((sel, i) => {
    calls.push({ jsonrpc: '2.0', id: 10000+i, method: 'eth_call', params: [{ to: CWMON, data: sel }, 'latest'] })
  })

  const results = await batchCall(calls)
  const zero = '0x'+'0'.repeat(64)

  // Find results that look like addresses (non-zero, 32 bytes, leading zeros)
  const addressHits: any[] = []
  const uintHits: any[] = []

  results.forEach((r: any) => {
    if (!r.result || r.result === '0x' || r.result === zero) return
    const val = r.result
    const sel = r.id < 10000 ? selectors[r.id] : selectors[r.id - 10000]
    const withArg = r.id < 10000

    // Check if result looks like an address (24 leading zero chars after 0x)
    if (val.length === 66 && val.startsWith('0x000000000000000000000000')) {
      const addr = '0x' + val.slice(-40)
      addressHits.push({ sel, withArg, result: addr })
    } else if (val.length === 66) {
      const num = BigInt(val)
      uintHits.push({ sel, withArg, result: val, approxNum: num.toString() })
    }
  })

  return NextResponse.json({
    totalSelectors: selectors.length,
    allSelectors: selectors,
    addressResults: addressHits,
    uintResults: uintHits.slice(0,20),
  })
}
