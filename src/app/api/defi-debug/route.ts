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
  if (!calls.length) return []
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calls),
    cache: 'no-store',
  })
  const data = await res.json()
  return Array.isArray(data) ? data : [data]
}

function padAddr(a: string) { return a.slice(2).toLowerCase().padStart(64, '0') }
function toUint(hex: string) { return (!hex || hex === '0x') ? 0n : BigInt(hex) }
function decodeAddr(hex: string) {
  if (!hex || hex === '0x' || hex.length < 42) return null
  return '0x' + hex.slice(-40)
}

const CENTRAL_REGISTRY = '0x1310f352f1389969Ece6741671c4B919523912fF'
// gMON token address from Magma
const GMON = '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  // 1. Scan last Tx of user to find gMON-related contract
  //    Use eth_getLogs for gMON Transfer TO or FROM user (recent blocks only)
  const latestHex = await rpc('eth_blockNumber', [])
  const latest = parseInt(latestHex, 16)
  const fromBlock = '0x' + Math.max(0, latest - 500000).toString(16)

  const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  const userTopic = '0x' + address.slice(2).toLowerCase().padStart(64, '0')

  // Look for gMON transfers FROM user (deposit: user sends gMON to Curvance)
  const gmonLogsFrom = await rpc('eth_getLogs', [{
    fromBlock, toBlock: 'latest',
    address: GMON,
    topics: [TRANSFER, userTopic],
  }])

  // Look for cToken transfers TO user (deposit: cToken minted to user)
  const anyTransferToUser = await rpc('eth_getLogs', [{
    fromBlock, toBlock: 'latest',
    topics: [TRANSFER, null, userTopic],
  }])

  // Collect all contracts that sent tokens to user recently
  const receivedFrom = new Set<string>()
  for (const log of (anyTransferToUser ?? [])) {
    receivedFrom.add(log.address.toLowerCase())
  }

  // Destinations of gMON from user (= cToken contract or position manager)
  const gmonDestinations = new Set<string>()
  for (const log of (gmonLogsFrom ?? [])) {
    // The 'to' address is topic[2]
    if (log.topics[2]) {
      gmonDestinations.add('0x' + log.topics[2].slice(26).toLowerCase())
    }
  }

  // 2. Try CentralRegistry to list all registered markets
  // numMarkets() or getAllMarkets() — try common selectors
  const registryCalls = [
    { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: CENTRAL_REGISTRY, data: '0xb0e21e8a' }, 'latest'] }, // numTokens/numMarkets
    { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: CENTRAL_REGISTRY, data: '0x0565bb83' }, 'latest'] }, // getAllMarkets()
    { jsonrpc: '2.0', id: 3, method: 'eth_call', params: [{ to: CENTRAL_REGISTRY, data: '0x9d1b5a81' }, 'latest'] }, // allMarketsLength()
    { jsonrpc: '2.0', id: 4, method: 'eth_call', params: [{ to: CENTRAL_REGISTRY, data: '0xa9c61cef' }, 'latest'] }, // marketsLength()
    // isMarketManager(gMON market manager candidates from similar protocols)
    { jsonrpc: '2.0', id: 5, method: 'eth_call', params: [{ to: CENTRAL_REGISTRY, data: '0x40c10f19' + padAddr(GMON) }, 'latest'] }, // mint(gMON)?
  ]
  const regResults = await batchCall(registryCalls)

  // 3. Check balanceOf on all contracts that sent tokens to user (potential cgMON)
  const candidateAddrs = [...new Set([...receivedFrom, ...gmonDestinations])]
  const balCalls = candidateAddrs.flatMap((addr, i) => [
    { jsonrpc: '2.0', id: 100 + i * 3,     method: 'eth_call', params: [{ to: addr, data: '0x70a08231' + padAddr(address) }, 'latest'] }, // balanceOf
    { jsonrpc: '2.0', id: 100 + i * 3 + 1, method: 'eth_call', params: [{ to: addr, data: '0x95dd9193' + padAddr(address) }, 'latest'] }, // borrowBalanceStored
    { jsonrpc: '2.0', id: 100 + i * 3 + 2, method: 'eth_call', params: [{ to: addr, data: '0x95d89b41' }, 'latest'] }, // symbol()
  ])
  const balResults = await batchCall(balCalls)

  const positions: any[] = []
  candidateAddrs.forEach((addr, i) => {
    const bal  = toUint(balResults.find((r: any) => r.id === 100 + i * 3)?.result)
    const debt = toUint(balResults.find((r: any) => r.id === 100 + i * 3 + 1)?.result)
    let symbol = addr.slice(0, 10)
    try {
      const symHex = balResults.find((r: any) => r.id === 100 + i * 3 + 2)?.result ?? ''
      if (symHex && symHex.length > 130) {
        const hex = symHex.slice(2)
        const offset = parseInt(hex.slice(0, 64), 16) * 2
        const len = parseInt(hex.slice(offset, offset + 64), 16)
        symbol = Buffer.from(hex.slice(offset + 64, offset + 64 + len * 2), 'hex').toString('utf8')
      }
    } catch {}
    positions.push({ addr, symbol, bal: bal.toString(), debt: debt.toString(), hasBalance: bal > 0n || debt > 0n })
  })

  return NextResponse.json({
    latestBlock: latest,
    gmonTransfersFromUser: (gmonLogsFrom ?? []).map((l: any) => ({
      block: parseInt(l.blockNumber, 16),
      to: '0x' + l.topics[2]?.slice(26),
      txHash: l.transactionHash,
    })),
    contractsReceivedByUser: [...receivedFrom],
    gmonDestinations: [...gmonDestinations],
    candidatePositions: positions,
    registryProbes: regResults.map((r: any) => ({ id: r.id, result: r.result })),
  })
}
