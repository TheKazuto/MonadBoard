import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://rpc.monad.xyz'

async function rpc(method: string, params: any[]) {
  const res = await fetch(RPC, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0',id:1,method,params}), cache:'no-store' })
  return (await res.json()).result ?? null
}
async function batchCall(calls: any[]) {
  const res = await fetch(RPC, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(calls), cache:'no-store' })
  const d = await res.json(); return Array.isArray(d) ? d : [d]
}

function padAddr(a: string) { return a.slice(2).toLowerCase().padStart(64,'0') }
function padUint(n: number)  { return n.toString(16).padStart(64,'0') }

// Compute keccak256 for mapping slot: keccak256(abi.encode(key, slot))
async function keccakSlot(keyHex: string, slot: number): Promise<string> {
  // Use eth_call on a precompile trick — or compute via a helper contract
  // Actually we can't compute keccak256 server-side without a library
  // But we CAN use eth_call with a known keccak256 precompile approach
  // Simpler: try slots directly around what we know
  return ''
}

const CWMON      = '0xf473568b26b8c5aadca9fbc0ea17e1728d5ec925'
const DEBT_TOKEN = '0x0acb7ef4d8733c719d60e0992b489b629bc55c02'
// slot 0 of debt token = 0x29fcb43b46531bca003ddc8fcb67ffe91900c762
const SLOT0_ADDR = '0x29fcb43b46531bca003ddc8fcb67ffe91900c762'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  const calls: any[] = []

  // 1. What is SLOT0_ADDR? Check symbol, owner, isContract
  calls.push({jsonrpc:'2.0',id:1, method:'eth_call', params:[{to:SLOT0_ADDR, data:'0x95d89b41'},'latest']}) // symbol
  calls.push({jsonrpc:'2.0',id:2, method:'eth_call', params:[{to:SLOT0_ADDR, data:'0x8da5cb5b'},'latest']}) // owner
  calls.push({jsonrpc:'2.0',id:3, method:'eth_getCode', params:[SLOT0_ADDR,'latest']})
  
  // 2. Read more slots of debt token to find the user address
  for (let s = 1; s <= 15; s++) {
    calls.push({jsonrpc:'2.0',id:10+s, method:'eth_getStorageAt', params:[DEBT_TOKEN,'0x'+s.toString(16),'latest']})
  }

  // 3. Check if SLOT0_ADDR (the factory/registry?) has a mapping user→debtToken
  calls.push({jsonrpc:'2.0',id:50, method:'eth_call', params:[{to:SLOT0_ADDR, data:'0x70a08231'+padAddr(address)},'latest']}) // balanceOf
  calls.push({jsonrpc:'2.0',id:51, method:'eth_call', params:[{to:SLOT0_ADDR, data:'0x2726d3ef'+padAddr(address)},'latest']}) // debtPosition
  calls.push({jsonrpc:'2.0',id:52, method:'eth_call', params:[{to:SLOT0_ADDR, data:'0x9e2517d3'+padAddr(address)},'latest']}) // positions
  calls.push({jsonrpc:'2.0',id:53, method:'eth_call', params:[{to:SLOT0_ADDR, data:'0x715b208b'+padAddr(address)},'latest']}) // getPosition
  calls.push({jsonrpc:'2.0',id:54, method:'eth_call', params:[{to:SLOT0_ADDR, data:'0xeee2e346'+padAddr(address)},'latest']}) // getDebtPosition
  
  // 4. cWMON storage slots 0-7 and 10-20 (we saw 3,8,9 had values)
  for (let s = 0; s <= 20; s++) {
    if (s === 3 || s === 8 || s === 9) continue // already know these
    calls.push({jsonrpc:'2.0',id:100+s, method:'eth_getStorageAt', params:[CWMON,'0x'+s.toString(16),'latest']})
  }
  
  // 5. CWMON slot 8 = 0x034cb4... — what is this address?
  const SLOT8 = '0x034cb4152b6506c445f18d564b3ce86b0de05c7b'
  calls.push({jsonrpc:'2.0',id:200, method:'eth_call', params:[{to:SLOT8, data:'0x95d89b41'},'latest']}) // symbol
  calls.push({jsonrpc:'2.0',id:201, method:'eth_call', params:[{to:SLOT8, data:'0x70a08231'+padAddr(address)},'latest']}) // balanceOf(user)
  calls.push({jsonrpc:'2.0',id:202, method:'eth_call', params:[{to:SLOT8, data:'0x70a08231'+padAddr(DEBT_TOKEN)},'latest']}) // balanceOf(debtToken)
  calls.push({jsonrpc:'2.0',id:203, method:'eth_call', params:[{to:SLOT8, data:'0x2726d3ef'+padAddr(address)},'latest']}) // debtPosition(user)
  calls.push({jsonrpc:'2.0',id:204, method:'eth_call', params:[{to:SLOT8, data:'0x9e2517d3'+padAddr(address)},'latest']}) // positions(user)
  calls.push({jsonrpc:'2.0',id:205, method:'eth_call', params:[{to:SLOT8, data:'0x715b208b'+padAddr(address)},'latest']}) // getPosition(user)
  calls.push({jsonrpc:'2.0',id:206, method:'eth_call', params:[{to:SLOT8, data:'0xeee2e346'+padAddr(address)},'latest']}) // getDebtPosition(user)
  calls.push({jsonrpc:'2.0',id:207, method:'eth_call', params:[{to:SLOT8, data:'0xb6549f75'},'latest']}) // borrower/lender
  calls.push({jsonrpc:'2.0',id:208, method:'eth_getCode', params:[SLOT8,'latest']})

  const results = await batchCall(calls)
  const zero = '0x'+'0'.repeat(64)
  
  const debtSlots: any = {}
  for (let s = 1; s <= 15; s++) {
    const r = results.find((x:any) => x.id === 10+s)?.result
    if (r && r !== zero) debtSlots[s] = r
  }

  const cwmonSlots: any = {}
  for (let s = 0; s <= 20; s++) {
    const r = results.find((x:any) => x.id === 100+s)?.result
    if (r && r !== zero) cwmonSlots[s] = r
  }

  const slot8Results: any = {}
  for (let id = 200; id <= 208; id++) {
    const r = results.find((x:any) => x.id === id)?.result
    if (r && r !== '0x' && r !== zero) slot8Results[id] = r
  }

  const slot0Results: any = {}
  for (let id = 50; id <= 54; id++) {
    const r = results.find((x:any) => x.id === id)?.result
    if (r && r !== '0x' && r !== zero) slot0Results[id] = r
  }

  // Decode symbol from id=1
  let slot0Symbol = '?', slot8Symbol = '?', slot0Code = '?', slot8Code = '?'
  try {
    const h = results.find((x:any)=>x.id===1)?.result ?? ''
    if (h?.length > 130) { const hex=h.slice(2),off=parseInt(hex.slice(0,64),16)*2,len=parseInt(hex.slice(off,off+64),16); slot0Symbol=Buffer.from(hex.slice(off+64,off+64+len*2),'hex').toString('utf8') }
    const h2 = results.find((x:any)=>x.id===200)?.result ?? ''
    if (h2?.length > 130) { const hex=h2.slice(2),off=parseInt(hex.slice(0,64),16)*2,len=parseInt(hex.slice(off,off+64),16); slot8Symbol=Buffer.from(hex.slice(off+64,off+64+len*2),'hex').toString('utf8') }
    slot0Code = (results.find((x:any)=>x.id===3)?.result ?? '').slice(0,20)
    slot8Code = (results.find((x:any)=>x.id===208)?.result ?? '').slice(0,20)
  } catch {}

  return NextResponse.json({
    debtToken_slot0_address: SLOT0_ADDR,
    debtToken_allSlots: debtSlots,
    slot0_addr_info: { symbol: slot0Symbol, codePrefix: slot0Code, owner: results.find((x:any)=>x.id===2)?.result },
    slot0_addr_calls: slot0Results,
    cwmon_slot8_address: '0x034cb4152b6506c445f18d564b3ce86b0de05c7b',
    cwmon_slot8_info: { symbol: slot8Symbol, codePrefix: slot8Code },
    cwmon_slot8_calls: slot8Results,
    cwmon_otherSlots: cwmonSlots,
  })
}
