import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

// ─── CHAIN CONFIG ─────────────────────────────────────────────────────────────
const CHAINS: Record<string, {
  name: string; rpc: string; explorer: string; apiBase?: string; nativeSymbol: string; chainId: number
}> = {
  MONAD:    { name: 'Monad',    chainId: 143,   nativeSymbol: 'MON',  rpc: 'https://rpc.monad.xyz',                  explorer: 'https://monadexplorer.com',       apiBase: process.env.ETHERSCAN_API_KEY ? `https://api.etherscan.io/v2/api?chainid=143&apikey=${process.env.ETHERSCAN_API_KEY}` : '' },
  ETH:      { name: 'Ethereum', chainId: 1,     nativeSymbol: 'ETH',  rpc: 'https://ethereum-rpc.publicnode.com',    explorer: 'https://etherscan.io',            apiBase: process.env.ETHERSCAN_API_KEY ? `https://api.etherscan.io/v2/api?chainid=1&apikey=${process.env.ETHERSCAN_API_KEY}` : '' },
  BSC:      { name: 'BSC',      chainId: 56,    nativeSymbol: 'BNB',  rpc: 'https://bsc-rpc.publicnode.com',         explorer: 'https://bscscan.com',             apiBase: process.env.ETHERSCAN_API_KEY ? `https://api.etherscan.io/v2/api?chainid=56&apikey=${process.env.ETHERSCAN_API_KEY}` : '' },
  POLYGON:  { name: 'Polygon',  chainId: 137,   nativeSymbol: 'POL',  rpc: 'https://polygon-rpc.com',                explorer: 'https://polygonscan.com',         apiBase: process.env.ETHERSCAN_API_KEY ? `https://api.etherscan.io/v2/api?chainid=137&apikey=${process.env.ETHERSCAN_API_KEY}` : '' },
  ARBITRUM: { name: 'Arbitrum', chainId: 42161, nativeSymbol: 'ETH',  rpc: 'https://arb1.arbitrum.io/rpc',           explorer: 'https://arbiscan.io',             apiBase: process.env.ETHERSCAN_API_KEY ? `https://api.etherscan.io/v2/api?chainid=42161&apikey=${process.env.ETHERSCAN_API_KEY}` : '' },
  OPTIMISM: { name: 'Optimism', chainId: 10,    nativeSymbol: 'ETH',  rpc: 'https://mainnet.optimism.io',            explorer: 'https://optimistic.etherscan.io', apiBase: process.env.ETHERSCAN_API_KEY ? `https://api.etherscan.io/v2/api?chainid=10&apikey=${process.env.ETHERSCAN_API_KEY}` : '' },
  BASE:     { name: 'Base',     chainId: 8453,  nativeSymbol: 'ETH',  rpc: 'https://mainnet.base.org',               explorer: 'https://basescan.org',            apiBase: process.env.ETHERSCAN_API_KEY ? `https://api.etherscan.io/v2/api?chainid=8453&apikey=${process.env.ETHERSCAN_API_KEY}` : '' },
}

// Well-known spender labels
const SPENDER_LABELS: Record<string, string> = {
  '0x000000000022d473030f116ddee9f6b43ac78ba3': 'Uniswap Permit2',
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'Uniswap Universal Router',
  '0xe592427a0aece92de3edee1f18e0157c05861564': 'Uniswap V3 Router',
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap V3 Router 2',
  '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch V5',
  '0x1111111254fb6c44bac0bed2854e76f90643097d': '1inch V4',
  '0x111111125421ca6dc452d289314280a0f8842a65': '1inch V6',
  '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x Exchange Proxy',
  '0x6352a56caadc4f1e25cd6c75970fa768a3304e64': 'OpenOcean',
  '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506': 'SushiSwap Router',
  '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f': 'SushiSwap Router',
  '0x74de5d4fcbf63e00296fd95d33236b9794016631': 'MetaMask Swap Router',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC Contract',
}

// EVM function selectors
const SEL_APPROVE            = '0x095ea7b3'  // approve(address,uint256)
const SEL_APPROVAL_FOR_ALL   = 'a22cb465'    // setApprovalForAll(address,bool)
const TOPIC_APPROVAL         = '0x8c5be1e5bebec7c5160f55d8ff0b20a1f23ca6882e22f7e96bc0e3b1ea0f6498e'  // ERC-20 Approval
const TOPIC_APPROVAL_ALL     = '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31'  // ApprovalForAll

// ─── RPC HELPERS ──────────────────────────────────────────────────────────────
async function ethCall(rpc: string, to: string, data: string): Promise<string> {
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
      signal: AbortSignal.timeout(5000),
    })
    const d = await r.json()
    return d.result ?? '0x'
  } catch { return '0x' }
}

async function ethGetLogs(rpc: string, params: object): Promise<any[]> {
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [params] }),
      signal: AbortSignal.timeout(10000),
    })
    const d = await r.json()
    return Array.isArray(d.result) ? d.result : []
  } catch { return [] }
}

// ERC-20: allowance(owner, spender) → selector 0xdd62ed3e
function allowanceData(owner: string, spender: string): string {
  const pad = (a: string) => a.replace('0x', '').toLowerCase().padStart(64, '0')
  return '0xdd62ed3e' + pad(owner) + pad(spender)
}

// ERC-20: symbol() → 0x95d89b41
// ERC-20: name()   → 0x06fdde03
// ERC-20: decimals()→ 0x313ce567
async function getTokenMeta(rpc: string, token: string): Promise<{ symbol: string; name: string; decimals: number }> {
  const [symHex, nameHex, decHex] = await Promise.all([
    ethCall(rpc, token, '0x95d89b41'),
    ethCall(rpc, token, '0x06fdde03'),
    ethCall(rpc, token, '0x313ce567'),
  ])
  function decodeStr(hex: string): string {
    try {
      if (!hex || hex === '0x') return ''
      // Skip first 2 words (offset + length), decode bytes
      const raw = hex.slice(2)
      if (raw.length < 128) {
        // Short string — try direct decode
        const bytes = Buffer.from(raw, 'hex')
        return bytes.toString('utf8').replace(/\0/g, '').trim()
      }
      const lenHex = raw.slice(64, 128)
      const len = parseInt(lenHex, 16)
      if (len === 0 || len > 100) return ''
      const strHex = raw.slice(128, 128 + len * 2)
      return Buffer.from(strHex, 'hex').toString('utf8').trim()
    } catch { return '' }
  }
  const symbol   = decodeStr(symHex) || token.slice(0, 6)
  const name     = decodeStr(nameHex) || symbol
  const decimals = decHex && decHex !== '0x' ? parseInt(decHex, 16) : 18
  return { symbol, name, decimals: isNaN(decimals) ? 18 : decimals }
}

// ERC-721/1155: isApprovedForAll(owner, operator) → 0xe985e9c5
async function isApprovedForAll(rpc: string, contract: string, owner: string, operator: string): Promise<boolean> {
  const pad = (a: string) => a.replace('0x', '').toLowerCase().padStart(64, '0')
  const data = '0xe985e9c5' + pad(owner) + pad(operator)
  const res = await ethCall(rpc, contract, data)
  return res === '0x0000000000000000000000000000000000000000000000000000000000000001'
}

// ERC-721: name() / symbol() — same selectors as ERC-20
async function getNFTMeta(rpc: string, contract: string): Promise<{ name: string; symbol: string }> {
  const [nameHex, symHex] = await Promise.all([
    ethCall(rpc, contract, '0x06fdde03'),
    ethCall(rpc, contract, '0x95d89b41'),
  ])
  function decodeStr(hex: string): string {
    try {
      if (!hex || hex === '0x') return ''
      const raw = hex.slice(2)
      const bytes = Buffer.from(raw, 'hex')
      return bytes.toString('utf8').replace(/\0/g, '').trim().slice(0, 40)
    } catch { return '' }
  }
  return { name: decodeStr(nameHex) || contract.slice(0, 8), symbol: decodeStr(symHex) || '?' }
}

// ─── FETCH APPROVALS VIA LOGS ─────────────────────────────────────────────────
async function fetchApprovals(chainKey: string, address: string): Promise<any[]> {
  const chain = CHAINS[chainKey]
  if (!chain) return []

  const { rpc, apiBase, explorer } = chain
  const addrLower = address.toLowerCase()
  const padded = '0x000000000000000000000000' + addrLower.slice(2)

  // Get current block to set a scan window
  let fromBlock = '0x0'
  try {
    const r = await fetch(rpc, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: AbortSignal.timeout(5000),
    })
    const d = await r.json()
    const latest = parseInt(d.result, 16)
    // Scan last ~3 months of blocks (rough estimate per chain)
    const blocksPerDay: Record<string, number> = {
      MONAD: 86400, ETH: 7200, BSC: 28800, POLYGON: 43200, ARBITRUM: 300000, OPTIMISM: 86400, BASE: 86400
    }
    const bpd = blocksPerDay[chainKey] ?? 7200
    fromBlock = '0x' + Math.max(0, latest - bpd * 90).toString(16)
  } catch { /* use 0x0 */ }

  // Fetch ERC-20 Approval logs + ApprovalForAll logs in parallel
  const [erc20Logs, nftLogs] = await Promise.all([
    ethGetLogs(rpc, { fromBlock, toBlock: 'latest', topics: [TOPIC_APPROVAL, padded] }),
    ethGetLogs(rpc, { fromBlock, toBlock: 'latest', topics: [TOPIC_APPROVAL_ALL, padded] }),
  ])

  // ── ERC-20 approvals ─────────────────────────────────────────────────────
  // Group by (token, spender) — keep only latest log per pair
  const erc20Map = new Map<string, any>()
  for (const log of erc20Logs) {
    const spender = '0x' + (log.topics[2] ?? '').slice(26).toLowerCase()
    if (!spender || spender === '0x') continue
    const key = `${log.address.toLowerCase()}:${spender}`
    const existing = erc20Map.get(key)
    if (!existing || parseInt(log.blockNumber, 16) > parseInt(existing.blockNumber, 16)) {
      erc20Map.set(key, { ...log, spender })
    }
  }

  // ── NFT ApprovalForAll ────────────────────────────────────────────────────
  const nftMap = new Map<string, any>()
  for (const log of nftLogs) {
    const operator = '0x' + (log.topics[2] ?? '').slice(26).toLowerCase()
    const approved = log.data === '0x0000000000000000000000000000000000000000000000000000000000000001'
    if (!operator || operator === '0x') continue
    const key = `${log.address.toLowerCase()}:${operator}`
    const existing = nftMap.get(key)
    if (!existing || parseInt(log.blockNumber, 16) > parseInt(existing.blockNumber, 16)) {
      nftMap.set(key, { ...log, operator, approved })
    }
  }

  const results: any[] = []

  // ── Resolve ERC-20 allowances on-chain ───────────────────────────────────
  const erc20Entries = [...erc20Map.values()]
  await Promise.all(erc20Entries.map(async (log) => {
    try {
      const token   = log.address.toLowerCase()
      const spender = log.spender
      const [allowHex, meta] = await Promise.all([
        ethCall(rpc, token, allowanceData(address, spender)),
        getTokenMeta(rpc, token),
      ])
      const allowance = allowHex && allowHex !== '0x' ? BigInt(allowHex) : 0n
      if (allowance === 0n) return  // already revoked

      const MAX = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
      const isUnlimited = allowance === MAX || allowance > BigInt('0x8000000000000000000000000000000000000000000000000000000000000000')
      const humanAmount = isUnlimited ? 'Unlimited' : (Number(allowance) / Math.pow(10, meta.decimals)).toLocaleString('en-US', { maximumFractionDigits: 4 })

      results.push({
        type:        'ERC-20',
        chain:       chainKey,
        chainName:   chain.name,
        token,
        tokenSymbol: meta.symbol,
        tokenName:   meta.name,
        spender,
        spenderLabel: SPENDER_LABELS[spender] ?? null,
        amount:      humanAmount,
        isUnlimited,
        risk:        isUnlimited ? 'high' : 'medium',
        blockNumber: parseInt(log.blockNumber, 16),
        explorerUrl: `${explorer}/token/${token}`,
      })
    } catch { /* skip */ }
  }))

  // ── Resolve NFT approvals ─────────────────────────────────────────────────
  const nftEntries = [...nftMap.values()].filter(e => e.approved)
  await Promise.all(nftEntries.map(async (log) => {
    try {
      const contract = log.address.toLowerCase()
      const operator = log.operator
      // Confirm approval is still active on-chain
      const stillApproved = await isApprovedForAll(rpc, contract, address, operator)
      if (!stillApproved) return

      const meta = await getNFTMeta(rpc, contract)
      results.push({
        type:          'NFT',
        chain:         chainKey,
        chainName:     chain.name,
        token:         contract,
        tokenSymbol:   meta.symbol,
        tokenName:     meta.name,
        spender:       operator,
        spenderLabel:  SPENDER_LABELS[operator] ?? null,
        amount:        'All NFTs',
        isUnlimited:   true,
        risk:          'high',
        blockNumber:   parseInt(log.blockNumber, 16),
        explorerUrl:   `${explorer}/address/${contract}`,
      })
    } catch { /* skip */ }
  }))

  return results.sort((a, b) => b.blockNumber - a.blockNumber)
}

// ─── ROUTE HANDLER ────────────────────────────────────────────────────────────
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
    return NextResponse.json({ approvals, chain, address })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
