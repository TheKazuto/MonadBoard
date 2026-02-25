import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'

async function batchCall(calls: any[]) {
  const res = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(calls), cache:'no-store' })
  const d = await res.json(); return Array.isArray(d) ? d : [d]
}
function padAddr(a: string) { return a.slice(2).toLowerCase().padStart(64,'0') }

const CWMON           = '0xf473568b26b8c5aadca9fbc0ea17e1728d5ec925'
const KNOWN_DEBT      = '0x0acb7ef4d8733c719d60e0992b489b629bc55c02'
const CANDIDATE_1     = '0x175cd6b817ff0d6425b4263e2f662229e58d7390' // returned by 0xb3d7f6b9(user)
const CANDIDATE_2     = '0x15cee70aa6d77c847064e4a608efe2fdea4a284f' // returned by 0xef8b30f7(user)
const DUMMY           = '0x0000000000000000000000000000000000000001'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  const calls = [
    // Is 0xb3d7f6b9 a user→debtToken mapping? Test with dummy address
    {jsonrpc:'2.0',id:1, method:'eth_call', params:[{to:CWMON,data:'0xb3d7f6b9'+padAddr(DUMMY)},'latest']},
    // cWMON.balanceOf on each candidate — which one has debt?
    {jsonrpc:'2.0',id:2, method:'eth_call', params:[{to:CWMON,data:'0x70a08231'+padAddr(CANDIDATE_1)},'latest']},
    {jsonrpc:'2.0',id:3, method:'eth_call', params:[{to:CWMON,data:'0x70a08231'+padAddr(CANDIDATE_2)},'latest']},
    {jsonrpc:'2.0',id:4, method:'eth_call', params:[{to:CWMON,data:'0x70a08231'+padAddr(KNOWN_DEBT)},'latest']},
    // What does 0xb3d7f6b9 return for the known debt token address?
    {jsonrpc:'2.0',id:5, method:'eth_call', params:[{to:CWMON,data:'0xb3d7f6b9'+padAddr(KNOWN_DEBT)},'latest']},
    // symbol of candidates
    {jsonrpc:'2.0',id:6, method:'eth_call', params:[{to:CANDIDATE_1,data:'0x95d89b41'},'latest']},
    {jsonrpc:'2.0',id:7, method:'eth_call', params:[{to:CANDIDATE_2,data:'0x95d89b41'},'latest']},
  ]

  const results = await batchCall(calls)
  const get = (id: number) => results.find((r:any) => r.id === id)?.result ?? '0x'
  const toNum = (h: string) => h && h !== '0x' ? BigInt(h).toString() : '0'
  const toAddr = (h: string) => h && h.length === 66 ? '0x'+h.slice(-40) : h

  return NextResponse.json({
    'b3d7f6b9(dummy)':          toAddr(get(1)),
    'cWMON.balOf(candidate1)':  toNum(get(2)),
    'cWMON.balOf(candidate2)':  toNum(get(3)),
    'cWMON.balOf(knownDebt)':   toNum(get(4)),
    'b3d7f6b9(knownDebt)':      toAddr(get(5)),
    'candidate1_symbol':        get(6),
    'candidate2_symbol':        get(7),
  })
}
