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

async function call(to: string, data: string) {
  return await rpc('eth_call', [{ to, data }, 'latest'])
}

function padAddr(addr: string) {
  return addr.slice(2).toLowerCase().padStart(64, '0')
}

// keccak256("Transfer(address,address,uint256)") — ERC-20 Transfer event
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'need ?address=0x...' })

  const userTopic = '0x' + address.slice(2).toLowerCase().padStart(64, '0')

  // 1. Find all ERC-20 contracts that sent tokens TO the user (potential cToken deposits)
  //    eth_getLogs: Transfer(from=any, to=user) in last ~500k blocks
  const latestHex = await rpc('eth_blockNumber', [])
  const latest = parseInt(latestHex, 16)
  const fromBlock = '0x' + Math.max(0, latest - 200000).toString(16)

  const logsTo = await rpc('eth_getLogs', [{
    fromBlock,
    toBlock: 'latest',
    topics: [TRANSFER_TOPIC, null, userTopic],
  }])

  // 2. Also transfers FROM user (borrows or withdrawals from cTokens)
  const logsFrom = await rpc('eth_getLogs', [{
    fromBlock,
    toBlock: 'latest',
    topics: [TRANSFER_TOPIC, userTopic, null],
  }])

  // Collect unique contract addresses that interacted with user
  const contractAddrs = new Set<string>()
  for (const log of [...(logsTo ?? []), ...(logsFrom ?? [])]) {
    contractAddrs.add(log.address.toLowerCase())
  }

  // 3. For each unique contract, check balanceOf and borrowBalanceStored
  const results: any[] = []
  const batch: any[] = []
  const addrList = [...contractAddrs]

  addrList.forEach((addr, i) => {
    batch.push({ jsonrpc: '2.0', id: i * 2,     method: 'eth_call', params: [{ to: addr, data: '0x70a08231' + padAddr(address) }, 'latest'] })
    batch.push({ jsonrpc: '2.0', id: i * 2 + 1, method: 'eth_call', params: [{ to: addr, data: '0x95dd9193' + padAddr(address) }, 'latest'] })
  })

  let batchResults: any[] = []
  if (batch.length > 0) {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      cache: 'no-store',
    })
    batchResults = await res.json()
    if (!Array.isArray(batchResults)) batchResults = [batchResults]
  }

  for (let i = 0; i < addrList.length; i++) {
    const addr = addrList[i]
    const balHex  = batchResults.find((r: any) => r.id === i * 2)?.result ?? '0x'
    const debtHex = batchResults.find((r: any) => r.id === i * 2 + 1)?.result ?? '0x'

    const bal  = balHex  !== '0x' && balHex  ? BigInt(balHex)  : 0n
    const debt = debtHex !== '0x' && debtHex ? BigInt(debtHex) : 0n

    if (bal > 0n || debt > 0n) {
      // Try to get symbol
      const symHex = await call(addr, '0x95d89b41') // symbol()
      let symbol = '?'
      try {
        if (symHex && symHex !== '0x' && symHex.length > 10) {
          const hex = symHex.slice(2)
          const offset = parseInt(hex.slice(0, 64), 16) * 2
          const len    = parseInt(hex.slice(offset, offset + 64), 16)
          symbol = Buffer.from(hex.slice(offset + 64, offset + 64 + len * 2), 'hex').toString('utf8')
        }
      } catch {}

      results.push({
        addr,
        symbol,
        balance:  bal.toString(),
        debt:     debt.toString(),
        balEther: (Number(bal) / 1e18).toFixed(6),
        debtEther:(Number(debt) / 1e18).toFixed(6),
      })
    }
  }

  return NextResponse.json({
    address,
    latestBlock: latest,
    fromBlock: parseInt(fromBlock, 16),
    uniqueContracts: contractAddrs.size,
    positionsFound: results,
  })
}
