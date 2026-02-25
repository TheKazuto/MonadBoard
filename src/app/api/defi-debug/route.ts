import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'

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

// keccak256(abi.encode(key, slot)) — Solidity mapping slot derivation
function mappingSlot(key: string, slot: number): string {
  const keyPadded  = key.slice(2).toLowerCase().padStart(64, '0')
  const slotPadded = slot.toString(16).padStart(64, '0')
  const data = Buffer.from(keyPadded + slotPadded, 'hex')
  return '0x' + createHash('sha3-256').update(data).digest('hex') // NOTE: need keccak256 not sha3
}

const CWMON          = '0xf473568b26b8c5aadca9fbc0ea17e1728d5ec925'
const MARKET_MANAGER = '0xb00aff53a4df2b4e2f97a3d9ffadb55564c8e42f'
const KNOWN_DEBT     = '0x0acb7ef4d8733c719d60e0992b489b629bc55c02'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  // Read raw storage slots 0-20 on both cWMON and MarketManager
  // to understand the contract layout
  const storageCalls: any[] = []
  for (let slot = 0; slot <= 20; slot++) {
    storageCalls.push({ jsonrpc: '2.0', id: slot,       method: 'eth_getStorageAt', params: [CWMON,          '0x' + slot.toString(16), 'latest'] })
    storageCalls.push({ jsonrpc: '2.0', id: slot + 100, method: 'eth_getStorageAt', params: [MARKET_MANAGER, '0x' + slot.toString(16), 'latest'] })
  }

  // Also check the KNOWN_DEBT contract storage
  for (let slot = 0; slot <= 10; slot++) {
    storageCalls.push({ jsonrpc: '2.0', id: slot + 200, method: 'eth_getStorageAt', params: [KNOWN_DEBT, '0x' + slot.toString(16), 'latest'] })
  }

  const storageResults = await batchCall(storageCalls)
  const zero = '0x' + '0'.repeat(64)

  const cwmonStorage: any = {}
  const mmStorage: any    = {}
  const debtStorage: any  = {}

  storageResults.forEach((r: any) => {
    if (!r.result || r.result === zero) return
    const id = r.id
    if (id < 100)       cwmonStorage[id]       = r.result
    else if (id < 200)  mmStorage[id - 100]    = r.result
    else                debtStorage[id - 200]  = r.result
  })

  // Check if KNOWN_DEBT has a function that returns its owner/user
  const debtCalls = [
    { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: KNOWN_DEBT, data: '0x8da5cb5b' }, 'latest'] }, // owner()
    { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: KNOWN_DEBT, data: '0xfc0c546a' }, 'latest'] }, // token()
    { jsonrpc: '2.0', id: 3, method: 'eth_call', params: [{ to: KNOWN_DEBT, data: '0x38d07436' }, 'latest'] }, // debtToken()
    { jsonrpc: '2.0', id: 4, method: 'eth_call', params: [{ to: KNOWN_DEBT, data: '0xb6a9987a' }, 'latest'] }, // lendingMarket()
    { jsonrpc: '2.0', id: 5, method: 'eth_call', params: [{ to: KNOWN_DEBT, data: '0xae6e2953' }, 'latest'] }, // cToken()
    { jsonrpc: '2.0', id: 6, method: 'eth_call', params: [{ to: KNOWN_DEBT, data: '0x7535d246' }, 'latest'] }, // POOL()
    { jsonrpc: '2.0', id: 7, method: 'eth_call', params: [{ to: KNOWN_DEBT, data: '0x18160ddd' }, 'latest'] }, // totalSupply()
    { jsonrpc: '2.0', id: 8, method: 'eth_call', params: [{ to: KNOWN_DEBT, data: '0x70a08231' + padAddr(address) }, 'latest'] }, // balanceOf(user)
    { jsonrpc: '2.0', id: 9, method: 'eth_call', params: [{ to: KNOWN_DEBT, data: '0x70a08231' + padAddr(KNOWN_DEBT) }, 'latest'] }, // balanceOf(self)
    // Try: does CWMON have a debtTokenFor(user) at various selectors?
    { jsonrpc: '2.0', id: 10, method: 'eth_call', params: [{ to: CWMON, data: '0x6352211e' + padAddr(address) }, 'latest'] }, // ownerOf(addr as uint)
    { jsonrpc: '2.0', id: 11, method: 'eth_call', params: [{ to: CWMON, data: '0x2f745c59' + padAddr(address) + '0'.repeat(64) }, 'latest'] }, // tokenOfOwnerByIndex(addr,0)
  ]
  const debtResults = await batchCall(debtCalls)
  const debtHits = debtResults
    .filter((r: any) => r.result && r.result !== '0x' && r.result !== zero)
    .map((r: any) => ({ id: r.id, result: r.result, asAddr: '0x' + r.result.slice(-40) }))

  return NextResponse.json({
    cwmonStorage,
    mmStorage,
    debtTokenStorage: debtStorage,
    debtContractCalls: debtHits,
  })
}
