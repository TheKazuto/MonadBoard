import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'

async function batchCall(calls: any[]) {
  const res = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(calls), cache:'no-store' })
  const d = await res.json(); return Array.isArray(d) ? d : [d]
}
function padAddr(a: string) { return a.slice(2).toLowerCase().padStart(64,'0') }

const CWMON      = '0xf473568b26b8c5aadca9fbc0ea17e1728d5ec925'
const KNOWN_DEBT = '0x0acb7ef4d8733c719d60e0992b489b629bc55c02'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  // 0x4b3fd148 was the inputSel of the borrow tx — this IS the borrow function
  // The borrow tx called cWMON.0x4b3fd148(...) and created the debt token
  // So the debt token address must be derivable from the user somehow
  // 
  // Key insight: b3d7f6b9(dummy=0x1) = 0x2, b3d7f6b9(knownDebt) = some other addr
  // This looks like it converts between debt token ↔ something
  // 
  // Let's try: what does b3d7f6b9(user) return vs what is the actual debt token?
  // user=0x169272... → b3d7f6b9 → 0x175cd6b8... (candidate1, not a contract)
  // 
  // NEW THEORY: The debt token 0x0acb7ef4 was created by the borrow tx
  // Its address = CREATE2(cWMON, salt=keccak256(user), initcode)
  // We need to find the mapping in cWMON storage: user → debtTokenAddress
  //
  // Let's try reading the tx INPUT data to understand the borrow call params
  // and look for any function that takes address and returns the debt token addr

  const calls = [
    // Try all "interesting" selectors from bytecode with user address, looking for 0x0acb7ef4
    // From the 159 selectors, try ones that could be "getDebtToken", "borrowerOf", etc.
    // Focus on selectors we haven't tried yet
    {jsonrpc:'2.0',id:1,  method:'eth_call', params:[{to:CWMON,data:'0x38d52e0f'},'latest']},             // asset() - ERC4626
    {jsonrpc:'2.0',id:2,  method:'eth_call', params:[{to:CWMON,data:'0x7313ee5a'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:3,  method:'eth_call', params:[{to:CWMON,data:'0x7ada7a09'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:4,  method:'eth_call', params:[{to:CWMON,data:'0x9616756e'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:5,  method:'eth_call', params:[{to:CWMON,data:'0xa7af467a'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:6,  method:'eth_call', params:[{to:CWMON,data:'0xab21e628'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:7,  method:'eth_call', params:[{to:CWMON,data:'0x87367d71'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:8,  method:'eth_call', params:[{to:CWMON,data:'0x85b13080'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:9,  method:'eth_call', params:[{to:CWMON,data:'0x8f73dcfa'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:10, method:'eth_call', params:[{to:CWMON,data:'0x775a814a'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:11, method:'eth_call', params:[{to:CWMON,data:'0x7c0e0c8c'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:12, method:'eth_call', params:[{to:CWMON,data:'0x5722baf3'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:13, method:'eth_call', params:[{to:CWMON,data:'0x635d9771'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:14, method:'eth_call', params:[{to:CWMON,data:'0x5296a431'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:15, method:'eth_call', params:[{to:CWMON,data:'0x3ba0b9a9'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:16, method:'eth_call', params:[{to:CWMON,data:'0x402d267d'+padAddr(address)},'latest']}, // ?  maxDeposit(addr)
    {jsonrpc:'2.0',id:17, method:'eth_call', params:[{to:CWMON,data:'0x40c09eba'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:18, method:'eth_call', params:[{to:CWMON,data:'0xa75df498'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:19, method:'eth_call', params:[{to:CWMON,data:'0x41ed2c12'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:20, method:'eth_call', params:[{to:CWMON,data:'0x371fd8e6'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:21, method:'eth_call', params:[{to:CWMON,data:'0x2f4a61d9'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:22, method:'eth_call', params:[{to:CWMON,data:'0x21570256'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:23, method:'eth_call', params:[{to:CWMON,data:'0x1dd19cb4'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:24, method:'eth_call', params:[{to:CWMON,data:'0x11005b07'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:25, method:'eth_call', params:[{to:CWMON,data:'0x17667967'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:26, method:'eth_call', params:[{to:CWMON,data:'0x1e75db16'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:27, method:'eth_call', params:[{to:CWMON,data:'0x0a28a477'+padAddr(address)},'latest']}, // ?
    {jsonrpc:'2.0',id:28, method:'eth_call', params:[{to:CWMON,data:'0x0f0f5436'+padAddr(address)},'latest']}, // ?
  ]

  const results = await batchCall(calls)
  const zero = '0x'+'0'.repeat(64)
  const KNOWN_DEBT_LOWER = KNOWN_DEBT.toLowerCase()

  const hits: any[] = []
  results.forEach((r: any) => {
    if (!r.result || r.result === '0x' || r.result === zero) return
    const val = r.result
    const asAddr = val.length === 66 ? '0x'+val.slice(-40) : null
    // Flag if it matches our known debt token!
    const isDebtToken = asAddr?.toLowerCase() === KNOWN_DEBT_LOWER
    hits.push({ id: r.id, result: val, asAddr, isDebtToken })
  })

  return NextResponse.json({ hits, note: `Looking for debt token ${KNOWN_DEBT}` })
}
