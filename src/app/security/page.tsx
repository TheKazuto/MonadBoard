'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Shield, ShieldAlert, ShieldCheck, AlertTriangle, RefreshCw,
  ExternalLink, Loader, XCircle, CheckCircle,
  Search, Info, Coins, Image as ImageIcon,
} from 'lucide-react'
import { useWallet } from '@/contexts/WalletContext'
import { useChainId, useSwitchChain, useSendTransaction } from 'wagmi'
import { createPublicClient, http, formatUnits, encodeFunctionData } from 'viem'
import { mainnet, bsc, polygon, arbitrum, optimism, base } from 'viem/chains'

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Approval {
  type:         'ERC-20' | 'NFT'
  chainKey:     string
  token:        `0x${string}`
  tokenSymbol:  string
  tokenName:    string
  spender:      `0x${string}`
  spenderLabel: string | null
  amount:       string
  rawAllowance: bigint
  isUnlimited:  boolean
  risk:         'high' | 'medium'
  blockNumber:  bigint
  explorerUrl:  string
}

// ─── CORRECT EVENT TOPICS (keccak256 verified from etherscan) ─────────────────
// Approval(address indexed owner, address indexed spender, uint256 value)
const TOPIC_ERC20_APPROVAL   = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925' as `0x${string}`
// ApprovalForAll(address indexed owner, address indexed operator, bool approved)
const TOPIC_NFT_APPROVAL_ALL = '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31' as `0x${string}`

const HALF_MAX = BigInt('0x8000000000000000000000000000000000000000000000000000000000000000')

// ─── MONAD CHAIN DEFINITION ──────────────────────────────────────────────────
const MONAD_CHAIN = {
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'MonadExplorer', url: 'https://monadexplorer.com' } },
} as const

// ─── CHAIN CONFIG ─────────────────────────────────────────────────────────────
// scanMode:
//   'etherscan' = use Etherscan V2 API (1 call, full history, fast)
//   'rpc'       = chunked eth_getLogs from block 0 (Monad only)
interface ChainCfg {
  key: string; label: string; chainId: number; color: string
  viemChain: any; rpc: string; rpcFallback?: string; explorer: string; logoSlug: string
  scanMode: 'etherscan' | 'rpc'
  etherscanApi?: string
  rpcChunkSize?: number
}

// Etherscan V2 supports all EVM chains via chainid param
// All chains route through the server-side proxy so ETHERSCAN_API_KEY stays secret
const ES_V2 = (chainId: number) => `/api/approvals-logs?chainId=${chainId}`

const CHAIN_CONFIGS: ChainCfg[] = [
  {
    key: 'MONAD', label: 'Monad', chainId: 143, color: '#836EF9',
    viemChain: MONAD_CHAIN, rpc: 'https://rpc.monad.xyz',
    explorer: 'https://monadexplorer.com', logoSlug: 'monad',
    // Etherscan V2 supports Monad (chainid=143) — use server proxy to keep API key secret
    scanMode: 'etherscan', etherscanApi: '/api/approvals-logs?chainId=143',
  },
  {
    key: 'ETH', label: 'Ethereum', chainId: 1, color: '#627EEA',
    viemChain: mainnet, rpc: 'https://eth.llamarpc.com',
    explorer: 'https://etherscan.io', logoSlug: 'ethereum',
    scanMode: 'etherscan', etherscanApi: ES_V2(1),
  },
  {
    key: 'BSC', label: 'BSC', chainId: 56, color: '#F3BA2F',
    viemChain: bsc, rpc: 'https://binance.llamarpc.com', rpcFallback: 'https://bsc-dataseed4.ninicoin.io',
    explorer: 'https://bscscan.com', logoSlug: 'binance',
    scanMode: 'etherscan', etherscanApi: ES_V2(56),
  },
  {
    key: 'POLYGON', label: 'Polygon', chainId: 137, color: '#8247E5',
    viemChain: polygon, rpc: 'https://rpc-mainnet.matic.quiknode.pro',
    explorer: 'https://polygonscan.com', logoSlug: 'polygon',
    scanMode: 'etherscan', etherscanApi: ES_V2(137),
  },
  {
    key: 'ARBITRUM', label: 'Arbitrum', chainId: 42161, color: '#28A0F0',
    viemChain: arbitrum, rpc: 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io', logoSlug: 'arbitrum',
    scanMode: 'etherscan', etherscanApi: ES_V2(42161),
  },
  {
    key: 'OPTIMISM', label: 'Optimism', chainId: 10, color: '#FF0420',
    viemChain: optimism, rpc: 'https://mainnet.optimism.io',
    explorer: 'https://optimistic.etherscan.io', logoSlug: 'optimism',
    scanMode: 'etherscan', etherscanApi: ES_V2(10),
  },
  {
    key: 'BASE', label: 'Base', chainId: 8453, color: '#0052FF',
    viemChain: base, rpc: 'https://base-rpc.publicnode.com', rpcFallback: 'https://base.gateway.tenderly.co',
    explorer: 'https://basescan.org', logoSlug: 'base',
    scanMode: 'etherscan', etherscanApi: ES_V2(8453),
  },
]

// ─── KNOWN SPENDER LABELS ─────────────────────────────────────────────────────
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
  '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9': 'Aave V2',
  '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2': 'Aave V3',
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 'Lido stETH',
  '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7': 'Curve 3Pool',
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  { name: 'symbol',    type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'name',      type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'decimals',  type: 'function', inputs: [], outputs: [{ type: 'uint8'  }], stateMutability: 'view' },
  { name: 'allowance', type: 'function', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'approve',   type: 'function', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const

const NFT_ABI = [
  { name: 'name',              type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'symbol',            type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'isApprovedForAll',  type: 'function', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'setApprovalForAll', type: 'function', inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
] as const

// ─── LOG FETCHING STRATEGIES ──────────────────────────────────────────────────

// Strategy A: Etherscan V2 getLogs — full history in 1 API call, no block limit
// Returns normalized logs compatible with eth_getLogs format
async function fetchLogsEtherscan(
  apiBase: string,
  address: string,
  topic0: `0x${string}`,
  signal: AbortSignal,
): Promise<any[]> {
  const paddedAddr = '0x000000000000000000000000' + address.toLowerCase().slice(2)
  // Fetch up to 1000 logs (Etherscan max per page); most wallets have far fewer
  // apiBase can be a server proxy (/api/approvals-logs?chainId=N) or direct Etherscan URL
  const isProxy = apiBase.startsWith('/')
  const url = isProxy
    ? `${apiBase}&topic0=${topic0}&topic1=${paddedAddr}&fromBlock=0&toBlock=latest`
    : `${apiBase}&module=logs&action=getLogs&topic0=${topic0}&topic1=${paddedAddr}&topic0_1_opr=and&fromBlock=0&toBlock=latest&page=1&offset=1000`

  const res  = await fetch(url, { signal, cache: 'no-store' })
  const data = await res.json()

  if (data.status === '1' && Array.isArray(data.result)) {
    return data.result.map((log: any) => ({
      address:         String(log.address).toLowerCase(),
      topics:          log.topics,
      data:            log.data,
      blockNumber:     log.blockNumber,   // hex string from Etherscan
      transactionHash: log.transactionHash,
    }))
  }

  // status '0' with these messages = no approvals found (not an error)
  if (data.message === 'No records found' || data.result?.length === 0) return []

  // NOTOK typically means the API key doesn't have access to this chain
  // Treat as empty rather than crashing the whole scan
  if (data.status === '0') {
    console.warn('[approvals] Etherscan returned:', data.message, '— treating as empty')
    return []
  }

  throw new Error(`Etherscan error: ${data.message ?? JSON.stringify(data)}`)
}

// Strategy B: Chunked eth_getLogs from block 0 (for Monad / chains without Etherscan)
async function fetchLogsRPC(
  client: ReturnType<typeof createPublicClient>,
  address: string,
  topic0: `0x${string}`,
  latestBlock: bigint,
  chunkSize: bigint,
  onProgress: (msg: string, pct: number) => void,
  signal: AbortSignal,
): Promise<any[]> {
  const paddedAddr = ('0x000000000000000000000000' + address.toLowerCase().slice(2)) as `0x${string}`
  const logs: any[] = []

  for (let from = 0n; from <= latestBlock; from += chunkSize) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const to  = from + chunkSize - 1n > latestBlock ? latestBlock : from + chunkSize - 1n
    const pct = Math.round(Number(to * 100n / latestBlock))
    onProgress(`Scanning blocks ${from.toLocaleString()}–${to.toLocaleString()}…`, pct)

    try {
      const chunk = await (client.request as any)({
        method: 'eth_getLogs',
        params: [{
          fromBlock: ('0x' + from.toString(16)) as `0x${string}`,
          toBlock:   ('0x' + to.toString(16))   as `0x${string}`,
          topics:    [topic0, paddedAddr],
        }],
      })
      if (Array.isArray(chunk)) logs.push(...chunk)
    } catch {
      // RPC rejected range — halve and retry
      const mid = (from + to) / 2n
      try {
        const [a, b] = await Promise.all([
          (client.request as any)({ method: 'eth_getLogs', params: [{ fromBlock: ('0x'+from.toString(16)) as `0x${string}`, toBlock: ('0x'+mid.toString(16)) as `0x${string}`, topics: [topic0, paddedAddr] }] }),
          (client.request as any)({ method: 'eth_getLogs', params: [{ fromBlock: ('0x'+(mid+1n).toString(16)) as `0x${string}`, toBlock: ('0x'+to.toString(16)) as `0x${string}`, topics: [topic0, paddedAddr] }] }),
        ])
        if (Array.isArray(a)) logs.push(...a)
        if (Array.isArray(b)) logs.push(...b)
      } catch { /* skip range on double failure */ }
    }
  }
  return logs
}

// ─── MAIN SCAN ────────────────────────────────────────────────────────────────
async function scanApprovals(
  chainKey: string,
  address: `0x${string}`,
  onProgress: (msg: string) => void,
  signal: AbortSignal,
): Promise<Approval[]> {
  const cfg = CHAIN_CONFIGS.find(c => c.key === chainKey)
  if (!cfg) return []

  // Try primary RPC, fall back if it fails
  const makeRpcClient = (rpc: string) => createPublicClient({
    chain: cfg.viemChain,
    transport: http(rpc, { timeout: 30_000, retryCount: 2, retryDelay: 500 }),
    batch: { multicall: { wait: 32 } },
  })
  let client = makeRpcClient(cfg.rpc)

  let erc20Logs: any[] = []
  let nftLogs:   any[] = []

  if (cfg.scanMode === 'etherscan' && cfg.etherscanApi) {
    // ── Fast path: Etherscan API (single call, full history) ─────────────────
    onProgress(`Fetching approvals from ${cfg.label} explorer…`)
    ;[erc20Logs, nftLogs] = await Promise.all([
      fetchLogsEtherscan(cfg.etherscanApi, address, TOPIC_ERC20_APPROVAL,   signal),
      fetchLogsEtherscan(cfg.etherscanApi, address, TOPIC_NFT_APPROVAL_ALL, signal),
    ])
  } else {
    // ── RPC path: chunked getLogs (Monad) ─────────────────────────────────────
    onProgress('Fetching latest block…')
    const latestBlock = await client.getBlockNumber()
    const chunk = BigInt(cfg.rpcChunkSize ?? 10_000)

    onProgress(`Scanning ${cfg.label} (${latestBlock.toLocaleString()} blocks)…`)
    ;[erc20Logs, nftLogs] = await Promise.all([
      fetchLogsRPC(client, address, TOPIC_ERC20_APPROVAL,   latestBlock, chunk,
        (msg, pct) => onProgress(`ERC-20: ${msg} (${pct}%)`), signal),
      fetchLogsRPC(client, address, TOPIC_NFT_APPROVAL_ALL, latestBlock, chunk,
        (msg) => {}, signal),
    ])
  }

  if (signal.aborted) return []

  // If we got logs but readContract might fail, test RPC health and switch to fallback if needed
  if (cfg.rpcFallback && (erc20Logs.length + nftLogs.length) > 0) {
    try {
      await client.getBlockNumber()
    } catch {
      console.warn(`[approvals] Primary RPC failed, switching to fallback: ${cfg.rpcFallback}`)
      client = makeRpcClient(cfg.rpcFallback)
    }
  }

  onProgress(`Found ${erc20Logs.length} ERC-20 + ${nftLogs.length} NFT approval events. Verifying on-chain…`)

  // ── Deduplicate: keep latest log per (token, spender) pair ───────────────
  function dedupe(logs: any[], topicIndex: number) {
    const map = new Map<string, any>()
    for (const log of logs) {
      const addr = ('0x' + String(log.topics?.[topicIndex] ?? '').slice(-40)).toLowerCase()
      if (addr.length !== 42) continue
      const key  = `${String(log.address).toLowerCase()}:${addr}`
      const bn   = BigInt(log.blockNumber ?? 0)
      const prev = map.get(key)
      if (!prev || bn > BigInt(prev.blockNumber ?? 0)) map.set(key, log)
    }
    return map
  }

  const erc20Map = dedupe(erc20Logs, 2)
  const nftMap   = dedupe(nftLogs,   2)

  const results: Approval[] = []
  const BATCH = 5   // conservative batch — avoids rate-limits on public RPCs

  // ── Verify ERC-20 allowances on-chain ────────────────────────────────────
  const erc20List = [...erc20Map.values()]
  for (let i = 0; i < erc20List.length; i += BATCH) {
    if (signal.aborted) break
    onProgress(`Checking ${Math.min(i + BATCH, erc20List.length)}/${erc20List.length} ERC-20 allowances…`)
    if (i > 0) await new Promise(r => setTimeout(r, 100)) // avoid RPC rate-limit
    await Promise.all(erc20List.slice(i, i + BATCH).map(async (log) => {
      try {
        const token   = String(log.address).toLowerCase() as `0x${string}`
        const spender = ('0x' + String(log.topics[2]).slice(-40)).toLowerCase() as `0x${string}`

        const [allowRes, symRes, nameRes, decRes] = await Promise.allSettled([
          client.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [address, spender] }),
          client.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }),
          client.readContract({ address: token, abi: ERC20_ABI, functionName: 'name' }),
          client.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }),
        ])

        const allow = allowRes.status === 'fulfilled' ? allowRes.value as bigint : 0n
        if (allow === 0n) return

        const sym  = symRes.status  === 'fulfilled' ? symRes.value  as string : token.slice(0, 8)
        const name = nameRes.status === 'fulfilled' ? nameRes.value as string : sym
        const dec  = decRes.status  === 'fulfilled' ? decRes.value  as number : 18

        const isUnlimited = allow >= HALF_MAX
        const humanAmount = isUnlimited
          ? 'Unlimited'
          : Number(formatUnits(allow, dec)).toLocaleString('en-US', { maximumFractionDigits: 4 })

        results.push({
          type: 'ERC-20', chainKey,
          token, tokenSymbol: sym, tokenName: name,
          spender, spenderLabel: SPENDER_LABELS[spender] ?? null,
          amount: humanAmount, rawAllowance: allow, isUnlimited,
          risk: isUnlimited ? 'high' : 'medium',
          blockNumber: BigInt(log.blockNumber ?? 0),
          explorerUrl: `${cfg.explorer}/token/${token}`,
        })
      } catch (e: any) { console.warn('[allowance]', String(e?.shortMessage ?? e?.message)) }
    }))
  }

  // ── Verify NFT approvals on-chain ─────────────────────────────────────────
  const nftList = [...nftMap.values()]
  for (let i = 0; i < nftList.length; i += BATCH) {
    if (signal.aborted) break
    onProgress(`Checking ${Math.min(i + BATCH, nftList.length)}/${nftList.length} NFT approvals…`)
    if (i > 0) await new Promise(r => setTimeout(r, 100))
    await Promise.all(nftList.slice(i, i + BATCH).map(async (log) => {
      try {
        const contract = String(log.address).toLowerCase() as `0x${string}`
        const operator = ('0x' + String(log.topics[2]).slice(-40)).toLowerCase() as `0x${string}`

        const [approvedRes, nameRes, symRes] = await Promise.allSettled([
          client.readContract({ address: contract, abi: NFT_ABI, functionName: 'isApprovedForAll', args: [address, operator] }),
          client.readContract({ address: contract, abi: NFT_ABI, functionName: 'name' }),
          client.readContract({ address: contract, abi: NFT_ABI, functionName: 'symbol' }),
        ])

        if (approvedRes.status !== 'fulfilled' || !approvedRes.value) return

        results.push({
          type: 'NFT', chainKey,
          token: contract,
          tokenName:   nameRes.status === 'fulfilled' ? nameRes.value as string : contract.slice(0, 10),
          tokenSymbol: symRes.status  === 'fulfilled' ? symRes.value  as string : '?',
          spender: operator, spenderLabel: SPENDER_LABELS[operator] ?? null,
          amount: 'All NFTs', rawAllowance: 1n, isUnlimited: true,
          risk: 'high',
          blockNumber: BigInt(log.blockNumber ?? 0),
          explorerUrl: `${cfg.explorer}/address/${contract}`,
        })
      } catch (e: any) { console.warn('[nft-approval]', String(e?.shortMessage ?? e?.message)) }
    }))
  }

  return results.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1))
}

// ─── UI HELPERS ──────────────────────────────────────────────────────────────
function shortAddr(a: string) { return a.slice(0, 6) + '…' + a.slice(-4) }

function ChainImg({ chainKey }: { chainKey: string }) {
  const cfg = CHAIN_CONFIGS.find(c => c.key === chainKey)
  const [err, setErr] = useState(false)
  if (err) return (
    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0"
      style={{ background: cfg?.color ?? '#836EF9', fontSize: 8 }}>
      {chainKey.slice(0, 2)}
    </div>
  )
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://icons.llamao.fi/icons/chains/rsz_${cfg?.logoSlug}.jpg`}
      alt={chainKey} width={20} height={20}
      className="rounded-full object-cover shrink-0"
      onError={() => setErr(true)} />
  )
}

function RiskBadge({ risk, isUnlimited }: { risk: string; isUnlimited: boolean }) {
  if (risk === 'high') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">
      <ShieldAlert size={10} />{isUnlimited ? 'Unlimited' : 'High'}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-600">
      <AlertTriangle size={10} />Medium
    </span>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function SecurityPage() {
  const { address, isConnected } = useWallet()
  const connectedChainId = useChainId()
  const { switchChain }  = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()

  const [selectedChain, setSelectedChain] = useState('MONAD')
  const [approvals,  setApprovals]  = useState<Approval[]>([])
  const [loading,    setLoading]    = useState(false)
  const [progress,   setProgress]   = useState('')
  const [error,      setError]      = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [filter,     setFilter]     = useState<'all' | 'ERC-20' | 'NFT'>('all')
  const [revoking,   setRevoking]   = useState<string | null>(null)
  const [revoked,    setRevoked]    = useState<Set<string>>(new Set())
  const [txError,    setTxError]    = useState<string | null>(null)
  const [txSuccess,  setTxSuccess]  = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const runScan = useCallback(async () => {
    if (!address) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setError(null); setApprovals([]); setRevoked(new Set()); setProgress('')
    try {
      const list = await scanApprovals(selectedChain, address, setProgress, ctrl.signal)
      if (!ctrl.signal.aborted) setApprovals(list)
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message ?? 'Scan failed')
    } finally { setLoading(false); setProgress('') }
  }, [address, selectedChain])

  useEffect(() => {
    if (isConnected && address) runScan()
    return () => abortRef.current?.abort()
  }, [isConnected, address, selectedChain]) // eslint-disable-line

  async function revokeApproval(approval: Approval) {
    const key = `${approval.token}:${approval.spender}`
    setRevoking(key); setTxError(null); setTxSuccess(null)
    const targetCfg = CHAIN_CONFIGS.find(c => c.key === approval.chainKey)
    if (targetCfg && connectedChainId !== targetCfg.chainId) {
      try {
        await switchChain({ chainId: targetCfg.chainId })
        // Wait until the wallet actually switches — poll useChainId up to 15s
        const deadline = Date.now() + 15_000
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 300))
          // Re-read chainId from window.ethereum directly (most reliable)
          try {
            const hex = await (window as any).ethereum?.request({ method: 'eth_chainId' })
            if (hex && parseInt(hex, 16) === targetCfg.chainId) break
          } catch { /* ignore */ }
        }
      } catch (e: any) {
        setTxError(`Please switch to ${targetCfg.label} in your wallet`)
        setRevoking(null)
        return
      }
    }
    try {
      if (approval.type === 'ERC-20') {
        await sendTransactionAsync({
          to: approval.token,
          data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [approval.spender, 0n] }),
        })
      } else {
        await sendTransactionAsync({
          to: approval.token,
          data: encodeFunctionData({ abi: NFT_ABI, functionName: 'setApprovalForAll', args: [approval.spender, false] }),
        })
      }
      setRevoked(prev => new Set([...prev, key]))
      setTxSuccess(`${approval.tokenSymbol} approval revoked successfully`)
    } catch (e: any) {
      setTxError(e.shortMessage ?? e.message ?? 'Transaction failed')
    } finally { setRevoking(null) }
  }

  const visible = approvals.filter(a => {
    if (revoked.has(`${a.token}:${a.spender}`)) return false
    if (filter !== 'all' && a.type !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return a.tokenSymbol.toLowerCase().includes(q) ||
             a.tokenName.toLowerCase().includes(q) ||
             a.spender.toLowerCase().includes(q) ||
             (a.spenderLabel ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const highCount  = visible.filter(a => a.risk === 'high').length
  const erc20Count = visible.filter(a => a.type === 'ERC-20').length
  const nftCount   = visible.filter(a => a.type === 'NFT').length
  const chainLabel = CHAIN_CONFIGS.find(c => c.key === selectedChain)?.label ?? selectedChain
  const chainCfg   = CHAIN_CONFIGS.find(c => c.key === selectedChain)!

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center shadow-lg shadow-red-200 shrink-0">
          <Shield size={20} className="text-white" />
        </div>
        <div>
          <h1 className="font-bold text-2xl text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>Security</h1>
          <p className="text-sm text-gray-500">Review and revoke token approvals &amp; NFT permissions</p>
        </div>
      </div>

      {/* Chain selector */}
      <div className="card p-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Select Network</p>
        <div className="flex flex-wrap gap-2">
          {CHAIN_CONFIGS.map(c => (
            <button key={c.key}
              onClick={() => { setSelectedChain(c.key); setApprovals([]); setRevoked(new Set()) }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                selectedChain === c.key
                  ? 'border-violet-300 bg-violet-50 text-violet-700 shadow-sm'
                  : 'border-gray-200 text-gray-600 hover:border-violet-200 hover:bg-violet-50/50'
              }`}>
              <ChainImg chainKey={c.key} />
              {c.label}
              {c.key === 'MONAD' && (
                <span className="text-xs bg-violet-200 text-violet-700 px-1.5 py-0.5 rounded-full">Main</span>
              )}
            </button>
          ))}
        </div>


      </div>

      {/* Not connected */}
      {!isConnected && (
        <div className="card p-10 text-center">
          <Shield size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Connect your wallet to scan approvals</p>
          <p className="text-sm text-gray-400 mt-1">We'll scan full on-chain history for all token and NFT permissions</p>
        </div>
      )}

      {/* Loading */}
      {isConnected && loading && (
        <div className="card p-10 text-center space-y-3">
          <RefreshCw size={28} className="text-violet-400 mx-auto animate-spin" />
          <p className="text-gray-700 font-medium">{progress || `Scanning ${chainLabel}…`}</p>
          <p className="text-xs text-gray-400">
            {'Using Etherscan API — should complete in a few seconds'}
          </p>
          <button onClick={() => { abortRef.current?.abort(); setLoading(false) }}
            className="text-xs text-red-400 hover:text-red-600 underline">Cancel</button>
        </div>
      )}

      {/* Error */}
      {isConnected && !loading && error && (
        <div className="card p-6 text-center border-red-100 bg-red-50/50">
          <XCircle size={28} className="text-red-400 mx-auto mb-2" />
          <p className="text-red-600 font-medium">{error}</p>
          <button onClick={runScan} className="mt-3 text-sm text-violet-600 hover:text-violet-800 font-medium underline">Try again</button>
        </div>
      )}

      {/* Results */}
      {isConnected && !loading && !error && (
        <>
          {approvals.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Active approvals', value: visible.length,  warn: false },
                { label: 'High risk',        value: highCount,       warn: highCount > 0 },
                { label: 'Token approvals',  value: erc20Count,      warn: false },
                { label: 'NFT approvals',    value: nftCount,        warn: false },
              ].map(s => (
                <div key={s.label} className={`card p-4 text-center ${s.warn ? 'border-red-200 bg-red-50/50' : ''}`}>
                  <p className={`text-2xl font-bold ${s.warn ? 'text-red-600' : 'text-gray-800'}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {txSuccess && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
              <CheckCircle size={16} />{txSuccess}
              <button onClick={() => setTxSuccess(null)} className="ml-auto"><XCircle size={14} /></button>
            </div>
          )}
          {txError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
              <XCircle size={16} />{txError}
              <button onClick={() => setTxError(null)} className="ml-auto"><XCircle size={14} /></button>
            </div>
          )}

          {approvals.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-200 flex-1">
                <Search size={14} className="text-gray-400 shrink-0" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search token, spender or contract…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400" />
              </div>
              <div className="flex gap-1">
                {(['all', 'ERC-20', 'NFT'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      filter === f ? 'bg-violet-100 text-violet-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-violet-50'
                    }`}>
                    {f === 'all' ? 'All' : f}
                    {f === 'ERC-20' && erc20Count > 0 && <span className="ml-1 text-xs opacity-60">{erc20Count}</span>}
                    {f === 'NFT'    && nftCount   > 0 && <span className="ml-1 text-xs opacity-60">{nftCount}</span>}
                  </button>
                ))}
              </div>
              <button onClick={runScan}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm text-gray-600 hover:bg-violet-50 hover:border-violet-300 transition-colors">
                <RefreshCw size={13} />Refresh
              </button>
            </div>
          )}

          {approvals.length === 0 && (
            <div className="card p-10 text-center">
              <ShieldCheck size={40} className="text-green-400 mx-auto mb-3" />
              <p className="text-gray-700 font-semibold">No active approvals found</p>
              <p className="text-sm text-gray-400 mt-1">Your wallet has no active approvals on {chainLabel}</p>
            </div>
          )}

          {highCount > 0 && visible.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <ShieldAlert size={16} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">
                <span className="font-semibold">{highCount} high-risk approval{highCount > 1 ? 's' : ''}</span>
                {' '}— unlimited approvals let contracts spend all your tokens. Revoke if no longer needed.
              </p>
            </div>
          )}

          {visible.length > 0 && (
            <div className="space-y-2">
              {visible.map(a => {
                const key = `${a.token}:${a.spender}`
                const isRev = revoking === key
                return (
                  <div key={key} className={`card p-4 ${a.risk === 'high' ? 'border-red-100' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${a.type === 'NFT' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                        {a.type === 'NFT' ? <ImageIcon size={18} className="text-purple-600" /> : <Coins size={18} className="text-blue-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800">{a.tokenSymbol}</span>
                          <span className="text-xs text-gray-400 truncate max-w-[140px]">{a.tokenName}</span>
                          <RiskBadge risk={a.risk} isUnlimited={a.isUnlimited} />
                          {a.type === 'NFT' && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">NFT</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                          <ChainImg chainKey={a.chainKey} />
                          <span>{CHAIN_CONFIGS.find(c => c.key === a.chainKey)?.label}</span>
                          <span className="text-gray-300">·</span>
                          <span>Spender:</span>
                          {a.spenderLabel
                            ? <span className="text-violet-600 font-semibold">{a.spenderLabel}</span>
                            : <span className="font-mono">{shortAddr(a.spender)}</span>}
                          <span className="text-gray-300">·</span>
                          <span className={`font-medium ${a.isUnlimited ? 'text-red-500' : 'text-gray-700'}`}>{a.amount}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a href={a.explorerUrl} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                          <ExternalLink size={14} />
                        </a>
                        <button onClick={() => revokeApproval(a)} disabled={isRev}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                          style={{ background: isRev ? '#9ca3af' : 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: isRev ? 'none' : '0 2px 8px rgba(239,68,68,.3)' }}>
                          {isRev ? <><Loader size={13} className="animate-spin" />Revoking…</> : 'Revoke'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {approvals.length > 0 && visible.length === 0 && (
            <div className="card p-8 text-center">
              <Search size={28} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No approvals match your search</p>
            </div>
          )}
        </>
      )}

      <div className="flex items-start gap-2 text-xs text-gray-400">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>Approvals verified in real-time via on-chain RPC calls. Revoking sends a transaction from your wallet — Monboard never holds your funds.</span>
      </div>
    </div>
  )
}
