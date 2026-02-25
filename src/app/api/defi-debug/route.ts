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

// From previous debug, these selectors return addresses when called with user addr:
const CANDIDATE_SELS = {
  '0xb3d7f6b9': '0x175cd6b817ff0d6425b4263e2f662229e58d7390',
  '0xef8b30f7': '0x15cee70aa6d77c847064e4a608efe2fdea4a284f',
  '0xc6e6f592': '0x15cee70aa6d77c847064e4a608efe2fdea4a284f',
  '0xdeee7704': '(large uint, not address)',
  '0x80fd997f': '0x0000000000000000000000000000000000001770',
  '0xf4110291': '(small number)',
}

// Known debt token from borrow tx
const KNOWN_DEBT_TOKEN = '0x0acb7ef4d8733c719d60e0992b489b629bc55c02'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  const calls: any[] = []

  // Check candidate addresses: are they contracts? Do they have balanceOf?
  const candidates = [
    '0x175cd6b817ff0d6425b4263e2f662229e58d7390',
    '0x15cee70aa6d77c847064e4a608efe2fdea4a284f',
    KNOWN_DEBT_TOKEN,
  ]
  candidates.forEach((addr, i) => {
    calls.push({jsonrpc:'2.0',id:i*10+0, method:'eth_getCode',    params:[addr,'latest']})
    calls.push({jsonrpc:'2.0',id:i*10+1, method:'eth_call',       params:[{to:addr,data:'0x95d89b41'},'latest']}) // symbol
    calls.push({jsonrpc:'2.0',id:i*10+2, method:'eth_call',       params:[{to:addr,data:'0x18160ddd'},'latest']}) // totalSupply
    calls.push({jsonrpc:'2.0',id:i*10+3, method:'eth_call',       params:[{to:addr,data:'0x70a08231'+padAddr(address)},'latest']}) // balanceOf(user)
    calls.push({jsonrpc:'2.0',id:i*10+4, method:'eth_call',       params:[{to:addr,data:'0x70a08231'+padAddr(CWMON)},'latest']}) // balanceOf(cWMON)
    // Also: check if cWMON.balanceOf(candidate) has debt
    calls.push({jsonrpc:'2.0',id:i*10+5, method:'eth_call',       params:[{to:CWMON,data:'0x70a08231'+padAddr(addr)},'latest']}) // cWMON.balanceOf(candidate)
  })

  // Also: call 0xb3d7f6b9 with a DIFFERENT address to see if it's deterministic
  // Use a dummy address to confirm it's actually mapping user→debtToken
  const dummyAddr = '0x0000000000000000000000000000000000000001'
  calls.push({jsonrpc:'2.0',id:900, method:'eth_call', params:[{to:CWMON,data:'0xb3d7f6b9'+padAddr(dummyAddr)},'latest']})
  calls.push({jsonrpc:'2.0',id:901, method:'eth_call', params:[{to:CWMON,data:'0xef8b30f7'+padAddr(dummyAddr)},'latest']})
  // Also call with the known debt token address itself
  calls.push({jsonrpc:'2.0',id:902, method:'eth_call', params:[{to:CWMON,data:'0xb3d7f6b9'+padAddr(KNOWN_DEBT_TOKEN)},'latest']})
  calls.push({jsonrpc:'2.0',id:903, method:'eth_call', params:[{to:CWMON,data:'0xef8b30f7'+padAddr(KNOWN_DEBT_TOKEN)},'latest']})

  const results = await batchCall(calls)
  const zero = '0x'+'0'.repeat(64)

  const info: any = {}
  candidates.forEach((addr, i) => {
    const code = results.find((r:any) => r.id === i*10+0)?.result ?? ''
    let sym = '?'
    try {
      const h = results.find((r:any) => r.id === i*10+1)?.result ?? ''
      if (h?.length > 130) { const hex=h.slice(2),off=parseInt(hex.slice(0,64),16)*2,len=parseInt(hex.slice(off,off+64),16); sym=Buffer.from(hex.slice(off+64,off+64+len*2),'hex').toString('utf8') }
    } catch {}
    const ts  = results.find((r:any) => r.id === i*10+2)?.result
    const balUser  = results.find((r:any) => r.id === i*10+3)?.result
    const balCwmon = results.find((r:any) => r.id === i*10+4)?.result
    const cwmonBal = results.find((r:any) => r.id === i*10+5)?.result
    info[addr] = {
      isContract: code && code !== '0x' && code.length > 10,
      symbol: sym,
      totalSupply: ts && ts !== zero ? BigInt(ts).toString() : '0',
      balanceOf_user:  balUser  && balUser  !== zero ? BigInt(balUser).toString()  : '0',
      balanceOf_cWMON: balCwmon && balCwmon !== zero ? BigInt(balCwmon).toString() : '0',
      cWMON_balanceOf_this: cwmonBal && cwmonBal !== zero ? BigInt(cwmonBal).toString() : '0',
    }
  })

  const dummyTests = {
    'b3d7f6b9_dummy':     results.find((r:any)=>r.id===900)?.result,
    'ef8b30f7_dummy':     results.find((r:any)=>r.id===901)?.result,
    'b3d7f6b9_debtToken': results.find((r:any)=>r.id===902)?.result,
    'ef8b30f7_debtToken': results.find((r:any)=>r.id===903)?.result,
  }

  return NextResponse.json({ candidates: info, dummyTests })
}
