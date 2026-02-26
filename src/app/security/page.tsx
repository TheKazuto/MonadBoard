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

// ─── CHAIN CONFIG ─────────────────────────────────────────────────────────────
const MONAD_CHAIN = {
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'MonadExplorer', url: 'https://monadexplorer.com' } },
} as const

const CHAIN_CONFIGS = [
  { key: 'MONAD',    label: 'Monad',    chainId: 143,   color: '#836EF9', viemChain: MONAD_CHAIN,  rpc: 'https://rpc.monad.xyz',                explorer: 'https://monadexplorer.com',       logoSlug: 'monad' },
  { key: 'ETH',      label: 'Ethereum', chainId: 1,     color: '#627EEA', viemChain: mainnet,      rpc: 'https://ethereum-rpc.publicnode.com',  explorer: 'https://etherscan.io',            logoSlug: 'ethereum' },
  { key: 'BSC',      label: 'BSC',      chainId: 56,    color: '#F3BA2F', viemChain: bsc,          rpc: 'https://bsc-rpc.publicnode.com',        explorer: 'https://bscscan.com',             logoSlug: 'binance' },
  { key: 'POLYGON',  label: 'Polygon',  chainId: 137,   color: '#8247E5', viemChain: polygon,      rpc: 'https://polygon-rpc.com',              explorer: 'https://polygonscan.com',         logoSlug: 'polygon' },
  { key: 'ARBITRUM', label: 'Arbitrum', chainId: 42161, color: '#28A0F0', viemChain: arbitrum,     rpc: 'https://arb1.arbitrum.io/rpc',          explorer: 'https://arbiscan.io',             logoSlug: 'arbitrum' },
  { key: 'OPTIMISM', label: 'Optimism', chainId: 10,    color: '#FF0420', viemChain: optimism,     rpc: 'https://mainnet.optimism.io',           explorer: 'https://optimistic.etherscan.io', logoSlug: 'optimism' },
  { key: 'BASE',     label: 'Base',     chainId: 8453,  color: '#0052FF', viemChain: base,         rpc: 'https://mainnet.base.org',             explorer: 'https://basescan.org',            logoSlug: 'base' },
]

// ─── CORRECT EVENT TOPICS (keccak256 verified) ───────────────────────────────
// Approval(address indexed owner, address indexed spender, uint256 value)
const TOPIC_ERC20_APPROVAL = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925' as `0x${string}`
// ApprovalForAll(address indexed owner, address indexed operator, bool approved)
const TOPIC_NFT_APPROVAL_ALL = '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31' as `0x${string}`

const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
const HALF_MAX    = MAX_UINT256 / 2n

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
}

// ─── ABI FRAGMENTS ────────────────────────────────────────────────────────────
const ERC20_ABI = [
  { name: 'symbol',    type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'name',      type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'decimals',  type: 'function', inputs: [], outputs: [{ type: 'uint8'  }], stateMutability: 'view' },
  { name: 'allowance', type: 'function', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'approve',   type: 'function', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const

const NFT_ABI = [
  { name: 'name',               type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'symbol',             type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'isApprovedForAll',   type: 'function', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { name: 'setApprovalForAll',  type: 'function', inputs: [{ type: 'address' }, { type: 'bool'    }], outputs: [], stateMutability: 'nonpayable' },
] as const

// ─── VIEM CLIENT FACTORY ──────────────────────────────────────────────────────
function makeClient(cfg: typeof CHAIN_CONFIGS[number]) {
  return createPublicClient({
    chain: cfg.viemChain as any,
    transport: http(cfg.rpc, { timeout: 30_000 }),
    batch: { multicall: { wait: 20 } },
  })
}

// ─── SCAN FUNCTION (runs in browser, no API route) ────────────────────────────
async function scanApprovals(
  chainKey: string,
  address: `0x${string}`,
  onProgress: (msg: string) => void,
  signal: AbortSignal,
): Promise<Approval[]> {
  const cfg = CHAIN_CONFIGS.find(c => c.key === chainKey)
  if (!cfg) return []

  const client = makeClient(cfg)
  const addrLower = address.toLowerCase() as `0x${string}`

  onProgress('Fetching latest block…')
  const latestBlock = await client.getBlockNumber()

  // ── Fetch ALL Approval logs from block 0 ─────────────────────────────────
  // viem getLogs handles chunking internally on some transports
  // We do manual chunking to handle RPCs with strict limits
  const CHUNK = 50_000n  // 50k blocks per request — handles most RPCs

  async function fetchAllLogs(topic0: `0x${string}`) {
    const logs: any[] = []
    for (let from = 0n; from <= latestBlock; from += CHUNK) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const to = from + CHUNK - 1n > latestBlock ? latestBlock : from + CHUNK - 1n
      try {
        const chunk = await client.request({
          method: 'eth_getLogs',
          params: [{
            fromBlock: '0x' + from.toString(16) as `0x${string}`,
            toBlock:   '0x' + to.toString(16)   as `0x${string}`,
            topics: [topic0, ('0x000000000000000000000000' + addrLower.slice(2)) as `0x${string}`],
          }],
        }) as any[]
        logs.push(...(Array.isArray(chunk) ? chunk : []))
      } catch {
        // Chunk too large — try splitting in half
        try {
          const mid = (from + to) / 2n
          const [a, b] = await Promise.all([
            client.request({ method: 'eth_getLogs', params: [{ fromBlock: '0x' + from.toString(16) as `0x${string}`, toBlock: '0x' + mid.toString(16) as `0x${string}`, topics: [topic0, ('0x000000000000000000000000' + addrLower.slice(2)) as `0x${string}`] }] }) as Promise<any[]>,
            client.request({ method: 'eth_getLogs', params: [{ fromBlock: '0x' + (mid + 1n).toString(16) as `0x${string}`, toBlock: '0x' + to.toString(16) as `0x${string}`, topics: [topic0, ('0x000000000000000000000000' + addrLower.slice(2)) as `0x${string}`] }] }) as Promise<any[]>,
          ])
          logs.push(...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : []))
        } catch { /* skip range */ }
      }
      const pct = Math.round(Number(to * 100n / latestBlock))
      onProgress(`Scanning ${cfg.label}… ${pct}%`)
    }
    return logs
  }

  onProgress(`Scanning ${cfg.label} ERC-20 approvals…`)
  const [erc20Logs, nftLogs] = await Promise.all([
    fetchAllLogs(TOPIC_ERC20_APPROVAL),
    fetchAllLogs(TOPIC_NFT_APPROVAL_ALL),
  ])

  if (signal.aborted) return []
  onProgress(`Found ${erc20Logs.length} ERC-20 events, ${nftLogs.length} NFT events. Verifying on-chain…`)

  // ── Deduplicate: keep LATEST log per (token, spender) ────────────────────
  const erc20Map = new Map<string, any>()
  for (const log of erc20Logs) {
    const spender = ('0x' + String(log.topics?.[2] ?? '').slice(-40)).toLowerCase()
    if (spender.length !== 42) continue
    const key = `${String(log.address).toLowerCase()}:${spender}`
    const prev = erc20Map.get(key)
    const bn = BigInt(log.blockNumber ?? 0)
    if (!prev || bn > BigInt(prev.blockNumber ?? 0)) erc20Map.set(key, log)
  }

  const nftMap = new Map<string, any>()
  for (const log of nftLogs) {
    const operator = ('0x' + String(log.topics?.[2] ?? '').slice(-40)).toLowerCase()
    if (operator.length !== 42) continue
    const key = `${String(log.address).toLowerCase()}:${operator}`
    const prev = nftMap.get(key)
    const bn = BigInt(log.blockNumber ?? 0)
    if (!prev || bn > BigInt(prev.blockNumber ?? 0)) nftMap.set(key, log)
  }

  const results: Approval[] = []

  // ── Verify ERC-20 allowances on-chain via multicall ───────────────────────
  const erc20Entries = [...erc20Map.entries()]
  // Batch: get allowance + symbol + name + decimals for each token
  const BATCH = 10
  for (let i = 0; i < erc20Entries.length; i += BATCH) {
    if (signal.aborted) break
    const batch = erc20Entries.slice(i, i + BATCH)
    onProgress(`Verifying ERC-20 approvals ${i + 1}–${Math.min(i + BATCH, erc20Entries.length)} of ${erc20Entries.length}…`)

    await Promise.all(batch.map(async ([key, log]) => {
      try {
        const token   = String(log.address).toLowerCase() as `0x${string}`
        const spender = ('0x' + String(log.topics[2]).slice(-40)).toLowerCase() as `0x${string}`

        // Read allowance + metadata in parallel
        const [allowance, symbol, tokenName, decimals] = await Promise.allSettled([
          client.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [address, spender] }),
          client.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }),
          client.readContract({ address: token, abi: ERC20_ABI, functionName: 'name' }),
          client.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }),
        ])

        const allow = allowance.status === 'fulfilled' ? allowance.value as bigint : 0n
        if (allow === 0n) return  // already revoked

        const sym  = symbol.status === 'fulfilled'    ? symbol.value as string    : token.slice(0, 8)
        const name = tokenName.status === 'fulfilled' ? tokenName.value as string : sym
        const dec  = decimals.status === 'fulfilled'  ? decimals.value as number  : 18

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
      } catch { /* skip */ }
    }))
  }

  // ── Verify NFT approvals on-chain ─────────────────────────────────────────
  const nftEntries = [...nftMap.entries()]
  for (let i = 0; i < nftEntries.length; i += BATCH) {
    if (signal.aborted) break
    const batch = nftEntries.slice(i, i + BATCH)
    onProgress(`Verifying NFT approvals ${i + 1}–${Math.min(i + BATCH, nftEntries.length)} of ${nftEntries.length}…`)

    await Promise.all(batch.map(async ([key, log]) => {
      try {
        const contract = String(log.address).toLowerCase() as `0x${string}`
        const operator = ('0x' + String(log.topics[2]).slice(-40)).toLowerCase() as `0x${string}`

        const [stillApproved, name, symbol] = await Promise.allSettled([
          client.readContract({ address: contract, abi: NFT_ABI, functionName: 'isApprovedForAll', args: [address, operator] }),
          client.readContract({ address: contract, abi: NFT_ABI, functionName: 'name' }),
          client.readContract({ address: contract, abi: NFT_ABI, functionName: 'symbol' }),
        ])

        if (stillApproved.status !== 'fulfilled' || !stillApproved.value) return

        const nftName = name.status === 'fulfilled'   ? name.value as string   : contract.slice(0, 10)
        const nftSym  = symbol.status === 'fulfilled' ? symbol.value as string : '?'

        results.push({
          type: 'NFT', chainKey,
          token: contract, tokenSymbol: nftSym, tokenName: nftName,
          spender: operator, spenderLabel: SPENDER_LABELS[operator] ?? null,
          amount: 'All NFTs', rawAllowance: 1n, isUnlimited: true,
          risk: 'high',
          blockNumber: BigInt(log.blockNumber ?? 0),
          explorerUrl: `${cfg.explorer}/address/${contract}`,
        })
      } catch { /* skip */ }
    }))
  }

  return results.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1))
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function shortAddr(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4) }

function ChainImg({ chainKey }: { chainKey: string }) {
  const cfg = CHAIN_CONFIGS.find(c => c.key === chainKey)
  const [err, setErr] = useState(false)
  if (err) return (
    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ background: cfg?.color ?? '#836EF9', fontSize: 8 }}>
      {chainKey.slice(0, 2)}
    </div>
  )
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://icons.llamao.fi/icons/chains/rsz_${cfg?.logoSlug ?? chainKey.toLowerCase()}.jpg`}
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
    } finally {
      setLoading(false); setProgress('')
    }
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
      try { await switchChain({ chainId: targetCfg.chainId }); await new Promise(r => setTimeout(r, 1500)) }
      catch { setTxError('Please switch to ' + targetCfg.label + ' manually'); setRevoking(null); return }
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
      setTxSuccess(`${approval.tokenSymbol} approval revoked`)
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
          <p className="text-sm text-gray-400 mt-1">We'll scan on-chain history for all token and NFT permissions</p>
        </div>
      )}

      {/* Loading */}
      {isConnected && loading && (
        <div className="card p-10 text-center space-y-3">
          <RefreshCw size={28} className="text-violet-400 mx-auto animate-spin" />
          <p className="text-gray-600 font-medium">{progress || `Scanning ${CHAIN_CONFIGS.find(c => c.key === selectedChain)?.label}…`}</p>
          <p className="text-xs text-gray-400">Scanning full on-chain history from block 0</p>
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
          {/* Summary */}
          {approvals.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Active approvals', value: visible.length, warn: false },
                { label: 'High risk',        value: highCount,      warn: highCount > 0 },
                { label: 'Token approvals',  value: erc20Count,     warn: false },
                { label: 'NFT approvals',    value: nftCount,       warn: false },
              ].map(s => (
                <div key={s.label} className={`card p-4 text-center ${s.warn ? 'border-red-200 bg-red-50/50' : ''}`}>
                  <p className={`text-2xl font-bold ${s.warn ? 'text-red-600' : 'text-gray-800'}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Toast feedback */}
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

          {/* Filters */}
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
                    {f === 'NFT'   && nftCount   > 0 && <span className="ml-1 text-xs opacity-60">{nftCount}</span>}
                  </button>
                ))}
              </div>
              <button onClick={runScan}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm text-gray-600 hover:bg-violet-50 hover:border-violet-300 transition-colors">
                <RefreshCw size={13} />Refresh
              </button>
            </div>
          )}

          {/* Zero state */}
          {approvals.length === 0 && (
            <div className="card p-10 text-center">
              <ShieldCheck size={40} className="text-green-400 mx-auto mb-3" />
              <p className="text-gray-700 font-semibold">No active approvals found</p>
              <p className="text-sm text-gray-400 mt-1">
                Your wallet has no active token or NFT approvals on {CHAIN_CONFIGS.find(c => c.key === selectedChain)?.label}
              </p>
            </div>
          )}

          {/* High-risk banner */}
          {highCount > 0 && visible.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <ShieldAlert size={16} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">
                <span className="font-semibold">{highCount} high-risk approval{highCount > 1 ? 's' : ''}</span>
                {' '}— unlimited approvals let contracts spend all your tokens. Revoke if no longer needed.
              </p>
            </div>
          )}

          {/* Approval list */}
          {visible.length > 0 && (
            <div className="space-y-2">
              {visible.map(a => {
                const key = `${a.token}:${a.spender}`
                const isRevoking = revoking === key
                return (
                  <div key={key} className={`card p-4 transition-all ${a.risk === 'high' ? 'border-red-100' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${a.type === 'NFT' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                        {a.type === 'NFT' ? <ImageIcon size={18} className="text-purple-600" /> : <Coins size={18} className="text-blue-600" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800">{a.tokenSymbol}</span>
                          <span className="text-xs text-gray-400 truncate max-w-[120px]">{a.tokenName}</span>
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
                            : <span className="font-mono">{shortAddr(a.spender)}</span>
                          }
                          <span className="text-gray-300">·</span>
                          <span className={`font-medium ${a.isUnlimited ? 'text-red-500' : 'text-gray-700'}`}>{a.amount}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <a href={a.explorerUrl} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                          <ExternalLink size={14} />
                        </a>
                        <button onClick={() => revokeApproval(a)} disabled={isRevoking}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                          style={{ background: isRevoking ? '#9ca3af' : 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: isRevoking ? 'none' : '0 2px 8px rgba(239,68,68,.3)' }}>
                          {isRevoking ? <><Loader size={13} className="animate-spin" />Revoking…</> : 'Revoke'}
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
        <span>Approvals are scanned directly from on-chain logs and verified in real-time via RPC. Revoking sends an on-chain transaction — Monboard never holds your funds.</span>
      </div>
    </div>
  )
}
