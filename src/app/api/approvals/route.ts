import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

// ─── CHAIN CONFIG ─────────────────────────────────────────────────────────────
interface ChainConfig {
  name: string; chainId: number; nativeSymbol: string
  rpc: string; explorer: string
  etherscanApi?: string
  chunkSize: number
}

const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY

const CHAINS: Record<string, ChainConfig> = {
  MONAD: {
    name: 'Monad', chainId: 143, nativeSymbol: 'MON',
    rpc: 'https://rpc.monad.xyz', explorer: 'https://monadexplorer.com',
    etherscanApi: ETHERSCAN_KEY ? `https://api.etherscan.io/v2/api?chainid=143&apikey=${ETHERSCAN_KEY}` : undefined,
    chunkSize: 5000,
  },
  ETH: {
    name: 'Ethereum', chainId: 1, nativeSymbol: 'ETH',
    rpc: 'https://ethereum-rpc.publicnode.com', explorer: 'https://etherscan.io',
    etherscanApi: ETHERSCAN_KEY ? `https://api.etherscan.io/v2/api?chainid=1&apikey=${ETHERSCAN_KEY}` : undefined,
    chunkSize: 2000,
  },
  BSC: {
    name: 'BSC', chainId: 56, nativeSymbol: 'BNB',
    rpc: 'https://bsc-rpc.publicnode.com', explorer: 'https://bscscan.com',
    etherscanApi: ETHERSCAN_KEY ? `https://api.etherscan.io/v2/api?chainid=56&apikey=${ETHERSCAN_KEY}` : undefined,
    chunkSize: 2000,
  },
  POLYGON: {
    name: 'Polygon', chainId: 137, nativeSymbol: 'POL',
    rpc: 'https://polygon-rpc.com', explorer: 'https://polygonscan.com',
    etherscanApi: ETHERSCAN_KEY ? `https://api.etherscan.io/v2/api?chainid=137&apikey=${ETHERSCAN_KEY}` : undefined,
    chunkSize: 2000,
  },
  ARBITRUM: {
    name: 'Arbitrum', chainId: 42161, nativeSymbol: 'ETH',
    rpc: 'https://arb1.arbitrum.io/rpc', explorer: 'https://arbiscan.io',
    etherscanApi: ETHERSCAN_KEY ? `https://api.etherscan.io/v2/api?chainid=42161&apikey=${ETHERSCAN_KEY}` : undefined,
    chunkSize: 2000,
  },
  OPTIMISM: {
    name: 'Optimism', chainId: 10, nativeSymbol: 'ETH',
    rpc: 'https://mainnet.optimism.io', explorer: 'https://optimistic.etherscan.io',
    etherscanApi: ETHERSCAN_KEY ? `https://api.etherscan.io/v2/api?chainid=10&apikey=${ETHERSCAN_KEY}` : undefined,
    chunkSize: 2000,
  },
  BASE: {
    name: 'Base', chainId: 8453, nativeSymbol: 'ETH',
    rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org',
    etherscanApi: ETHERSCAN_KEY ? `https://api.etherscan.io/v2/api?chainid=8453&apikey=${ETHERSCAN_KEY}` : undefined,
    chunkSize: 2000,
  },
}

const SPENDER_LABELS: Record<string, string> = {
  '0x000000000022d473030f116ddee9f6b43ac78ba3': 'Uniswap Permit2',
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap Universal Router',
  '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3 Router 2',
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Uniswap V2 Router',
  '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24': 'Uniswap V2 Router',
  '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch V5',
  '0x1111111254fb6c44bac0bed2854e76f90643097d': '1inch V4',
  '0x111111125421ca6dc452d289314280a0f8842a65': '1inch V6',
  '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x Exchange Proxy',
  '0xdef171fe48cf0115b1d80b88dc8eab59176fee57': '0x Exchange Proxy V5',
  '0x6352a56caadc4f1e25cd6c75970fa768a3304e64': 'OpenOcean',
  '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506': 'SushiSwap Router',
  '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f': 'SushiSwap Router V2',
  '0x74de5d4fcbf63e00296fd95d33236b9794016631': 'MetaMask Swap Router',
  '0xba12222222228d8ba445958a75a0704d566bf2c8': 'Balancer Vault',
  '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b': 'Compound V2',
  '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9': 'Aave V2',
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'Aave V3',
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 'Lido stETH',
  '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7': 'Curve 3Pool',
  '0x3a9d48ab9751398bba147e86c5e53c68f4a03d52': 'Uniswap V2 (Monad)',
  '0x2aa47f6a9e36feae16aab31a7f0e1a8b78ac0af0': 'Neverland (Monad)',
}

const TOPIC_APPROVAL     = '0x8c5be1e5bebec7c5160f55d8ff0b20a1f23ca6882e22f7e96bc0e3b1ea0f6498e'
const TOPIC_APPROVAL_ALL = '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31'

// ─── RPC HELPERS ──────────────────────────────────────────────────────────────
async function rpcCall(rpc: string, method: string, params: any[], timeoutMs = 8000): Promise<any> {
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const d = await r.json()
    return d.result ?? null
  } catch { return null }
}

async function getLogsChunk(rpc: string, topic0: string, topic1: string, from: number, to: number): Promise<any[]> {
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_getLogs',
        params: [{ fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16), topics: [topic0, topic1] }],
      }),
      signal: AbortSignal.timeout(15000),
    })
    const d = await r.json()
    if (d.error) return []
    return Array.isArray(d.result) ? d.result : []
  } catch { return [] }
}

// Scan from block 0 to latest in chunks, auto-halving on errors
async function getAllLogsChunked(rpc: string, topic0: string, topic1: string, latestBlock: number, chunkSize: number): Promise<any[]> {
  const all: any[] = []
  let from = 0
  let chunk = chunkSize

  while (from <= latestBlock) {
    const to = Math.min(from + chunk - 1, latestBlock)
    const logs = await getLogsChunk(rpc, topic0, topic1, from, to)

    // If empty and chunk is large, assume range-too-large error
    if (logs.length === 0 && chunk > 200 && to < latestBlock) {
      chunk = Math.floor(chunk / 2)
      continue
    }

    all.push(...logs)
    from = to + 1
    if (chunk < chunkSize) chunk = Math.min(chunk * 2, chunkSize)
    if (from <= latestBlock) await new Promise(r => setTimeout(r, 60))
  }

  return all
}

// Etherscan getLogs (full history, no block range limit)
async function fetchLogsEtherscan(apiBase: string, address: string, topic0: string): Promise<any[]> {
  try {
    const url = `${apiBase}&module=logs&action=getLogs&topic0=${topic0}&topic1=0x000000000000000000000000${address.toLowerCase().slice(2)}&topic0_1_opr=and&fromBlock=0&toBlock=latest&page=1&offset=1000`
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
    const d = await r.json()
    if (d.status === '1' && Array.isArray(d.result)) {
      return d.result.map((log: any) => ({
        address:     log.address.toLowerCase(),
        topics:      log.topics,
        data:        log.data,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      }))
    }
    return []
  } catch { return [] }
}

// ─── TOKEN METADATA ───────────────────────────────────────────────────────────
function decodeAbiString(hex: string | null): string {
  try {
    if (!hex || hex === '0x' || hex.length < 4) return ''
    const raw = hex.slice(2)

    // ABI-encoded string: offset(32) + length(32) + data
    if (raw.length >= 128) {
      const len = parseInt(raw.slice(64, 128), 16)
      if (len > 0 && len <= 80 && raw.length >= 128 + len * 2) {
        const str = Buffer.from(raw.slice(128, 128 + len * 2), 'hex').toString('utf8').replace(/\0/g, '').trim()
        if (/^[\x20-\x7E]+$/.test(str) && str.length > 0) return str
      }
    }

    // bytes32 fixed (old tokens: MKR, etc.)
    if (raw.length >= 64) {
      const str = Buffer.from(raw.slice(0, 64), 'hex').toString('utf8').replace(/\0/g, '').trim()
      if (/^[\x20-\x7E]+$/.test(str) && str.length > 0 && str.length <= 20) return str
    }

    return ''
  } catch { return '' }
}

async function getTokenMeta(rpc: string, token: string): Promise<{ symbol: string; name: string; decimals: number }> {
  const [sym, name, dec] = await Promise.all([
    rpcCall(rpc, 'eth_call', [{ to: token, data: '0x95d89b41' }, 'latest']),
    rpcCall(rpc, 'eth_call', [{ to: token, data: '0x06fdde03' }, 'latest']),
    rpcCall(rpc, 'eth_call', [{ to: token, data: '0x313ce567' }, 'latest']),
  ])
  const symbol   = decodeAbiString(sym)  || token.slice(0, 6) + '…'
  const tokenName = decodeAbiString(name) || symbol
  const decimals = dec && dec !== '0x' ? parseInt(dec, 16) : 18
  return { symbol, name: tokenName, decimals: isNaN(decimals) ? 18 : decimals }
}

async function getNFTMeta(rpc: string, contract: string): Promise<{ symbol: string; name: string }> {
  const [name, sym] = await Promise.all([
    rpcCall(rpc, 'eth_call', [{ to: contract, data: '0x06fdde03' }, 'latest']),
    rpcCall(rpc, 'eth_call', [{ to: contract, data: '0x95d89b41' }, 'latest']),
  ])
  return { name: decodeAbiString(name) || contract.slice(0, 10), symbol: decodeAbiString(sym) || '?' }
}

function allowanceCalldata(owner: string, spender: string): string {
  const pad = (a: string) => a.replace('0x', '').toLowerCase().padStart(64, '0')
  return '0xdd62ed3e' + pad(owner) + pad(spender)
}

async function isApprovedForAll(rpc: string, contract: string, owner: string, operator: string): Promise<boolean> {
  const pad = (a: string) => a.replace('0x', '').toLowerCase().padStart(64, '0')
  const res = await rpcCall(rpc, 'eth_call', [{ to: contract, data: '0xe985e9c5' + pad(owner) + pad(operator) }, 'latest'])
  return res === '0x0000000000000000000000000000000000000000000000000000000000000001'
}

// ─── MAIN SCAN ────────────────────────────────────────────────────────────────
async function fetchApprovals(chainKey: string, address: string): Promise<any[]> {
  const chain = CHAINS[chainKey]
  if (!chain) return []
  const { rpc, etherscanApi, explorer, chunkSize } = chain
  const padded = '0x000000000000000000000000' + address.toLowerCase().slice(2)

  const latestHex = await rpcCall(rpc, 'eth_blockNumber', [])
  const latestBlock = latestHex ? parseInt(latestHex, 16) : 0
  if (latestBlock === 0) return []

  let erc20Logs: any[] = []
  let nftLogs:   any[] = []

  // Strategy 1: Etherscan (complete history, fast)
  if (etherscanApi) {
    console.log(`[approvals] Etherscan scan: ${chainKey}`)
    ;[erc20Logs, nftLogs] = await Promise.all([
      fetchLogsEtherscan(etherscanApi, address, TOPIC_APPROVAL),
      fetchLogsEtherscan(etherscanApi, address, TOPIC_APPROVAL_ALL),
    ])
  }

  // Strategy 2: Chunked RPC from block 0 (full history, slower)
  if (erc20Logs.length === 0 && nftLogs.length === 0) {
    console.log(`[approvals] Chunked RPC scan: ${chainKey}, latest=${latestBlock}`)
    ;[erc20Logs, nftLogs] = await Promise.all([
      getAllLogsChunked(rpc, TOPIC_APPROVAL,     padded, latestBlock, chunkSize),
      getAllLogsChunked(rpc, TOPIC_APPROVAL_ALL, padded, latestBlock, chunkSize),
    ])
  }

  console.log(`[approvals] ${chainKey}: ${erc20Logs.length} ERC-20 approval events, ${nftLogs.length} NFT approval events`)

  // Deduplicate: latest log per (token, spender)
  const erc20Map = new Map<string, any>()
  for (const log of erc20Logs) {
    const spender = ('0x' + (log.topics[2] ?? '').slice(-40)).toLowerCase()
    if (spender.length !== 42) continue
    const key = `${log.address.toLowerCase()}:${spender}`
    const blockNum = parseInt(String(log.blockNumber), 16)
    const prev = erc20Map.get(key)
    if (!prev || blockNum > parseInt(String(prev.blockNumber), 16)) {
      erc20Map.set(key, { ...log, spender, blockNum })
    }
  }

  const nftMap = new Map<string, any>()
  for (const log of nftLogs) {
    const operator = ('0x' + (log.topics[2] ?? '').slice(-40)).toLowerCase()
    if (operator.length !== 42) continue
    const key = `${log.address.toLowerCase()}:${operator}`
    const blockNum = parseInt(String(log.blockNumber), 16)
    const prev = nftMap.get(key)
    if (!prev || blockNum > parseInt(String(prev.blockNumber), 16)) {
      nftMap.set(key, { ...log, operator, blockNum })
    }
  }

  const results: any[] = []
  const BATCH = 15

  // Verify ERC-20 allowances on-chain
  const erc20List = [...erc20Map.values()]
  for (let i = 0; i < erc20List.length; i += BATCH) {
    await Promise.all(erc20List.slice(i, i + BATCH).map(async (log) => {
      try {
        const token   = log.address.toLowerCase()
        const spender = log.spender as string

        const [allowHex, meta] = await Promise.all([
          rpcCall(rpc, 'eth_call', [{ to: token, data: allowanceCalldata(address, spender) }, 'latest']),
          getTokenMeta(rpc, token),
        ])

        const allowance = (allowHex && allowHex !== '0x' && allowHex !== '0x0')
          ? BigInt(allowHex) : 0n
        if (allowance === 0n) return

        const HALF_MAX = BigInt('0x8000000000000000000000000000000000000000000000000000000000000000')
        const isUnlimited = allowance >= HALF_MAX

        const humanAmount = isUnlimited
          ? 'Unlimited'
          : (() => {
              const raw = Number(allowance) / Math.pow(10, meta.decimals)
              return raw >= 1000
                ? raw.toLocaleString('en-US', { maximumFractionDigits: 2 })
                : raw.toLocaleString('en-US', { maximumFractionDigits: 6 })
            })()

        results.push({
          type: 'ERC-20', chain: chainKey, chainName: chain.name,
          token, tokenSymbol: meta.symbol, tokenName: meta.name,
          spender, spenderLabel: SPENDER_LABELS[spender] ?? null,
          amount: humanAmount, isUnlimited,
          risk: isUnlimited ? 'high' : 'medium',
          blockNumber: log.blockNum,
          explorerUrl: `${explorer}/token/${token}`,
        })
      } catch { /* skip */ }
    }))
  }

  // Verify NFT approvals on-chain
  const nftList = [...nftMap.values()]
  for (let i = 0; i < nftList.length; i += BATCH) {
    await Promise.all(nftList.slice(i, i + BATCH).map(async (log) => {
      try {
        const contract = log.address.toLowerCase()
        const operator = log.operator as string

        const [stillApproved, meta] = await Promise.all([
          isApprovedForAll(rpc, contract, address, operator),
          getNFTMeta(rpc, contract),
        ])
        if (!stillApproved) return

        results.push({
          type: 'NFT', chain: chainKey, chainName: chain.name,
          token: contract, tokenSymbol: meta.symbol, tokenName: meta.name,
          spender: operator, spenderLabel: SPENDER_LABELS[operator] ?? null,
          amount: 'All NFTs', isUnlimited: true, risk: 'high',
          blockNumber: log.blockNum,
          explorerUrl: `${explorer}/address/${contract}`,
        })
      } catch { /* skip */ }
    }))
  }

  return results.sort((a, b) => b.blockNumber - a.blockNumber)
}

// ─── ROUTE ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  const chain   = req.nextUrl.searchParams.get('chain') ?? 'MONAD'

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  if (!CHAINS[chain]) {
    return NextResponse.json({ error: 'Unknown chain' }, { status: 400 })
  }

  try {
    const approvals = await fetchApprovals(chain, address)
    return NextResponse.json({ approvals, chain, address, count: approvals.length })
  } catch (e: any) {
    console.error('[approvals] fatal:', e)
    return NextResponse.json({ error: e.message ?? 'Scan failed' }, { status: 500 })
  }
}
