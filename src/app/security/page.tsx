'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield, ShieldAlert, ShieldCheck, AlertTriangle, RefreshCw,
  ExternalLink, Loader, ChevronDown, XCircle, CheckCircle,
  Search, Zap, Info, Coins, Image as ImageIcon,
} from 'lucide-react'
import { useWallet } from '@/contexts/WalletContext'
import { useSendTransaction, useChainId, useSwitchChain } from 'wagmi'
import { encodeFunctionData } from 'viem'

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Approval {
  type:         'ERC-20' | 'NFT'
  chain:        string
  chainName:    string
  token:        string
  tokenSymbol:  string
  tokenName:    string
  spender:      string
  spenderLabel: string | null
  amount:       string
  isUnlimited:  boolean
  risk:         'high' | 'medium' | 'low'
  blockNumber:  number
  explorerUrl:  string
}

const CHAINS = [
  { key: 'MONAD',    name: 'Monad',    chainId: 143,   color: '#836EF9' },
  { key: 'ETH',      name: 'Ethereum', chainId: 1,     color: '#627EEA' },
  { key: 'BSC',      name: 'BSC',      chainId: 56,    color: '#F3BA2F' },
  { key: 'POLYGON',  name: 'Polygon',  chainId: 137,   color: '#8247E5' },
  { key: 'ARBITRUM', name: 'Arbitrum', chainId: 42161, color: '#28A0F0' },
  { key: 'OPTIMISM', name: 'Optimism', chainId: 10,    color: '#FF0420' },
  { key: 'BASE',     name: 'Base',     chainId: 8453,  color: '#0052FF' },
]

const CHAIN_LOGO: Record<string, string> = {
  MONAD:    'https://icons.llamao.fi/icons/chains/rsz_monad.jpg',
  ETH:      'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg',
  BSC:      'https://icons.llamao.fi/icons/chains/rsz_binance.jpg',
  POLYGON:  'https://icons.llamao.fi/icons/chains/rsz_polygon.jpg',
  ARBITRUM: 'https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg',
  OPTIMISM: 'https://icons.llamao.fi/icons/chains/rsz_optimism.jpg',
  BASE:     'https://icons.llamao.fi/icons/chains/rsz_base.jpg',
}

// ABI for revoking ERC-20 (approve spender to 0) and NFT (setApprovalForAll to false)
const ERC20_APPROVE_ABI = [{
  name: 'approve', type: 'function',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

const NFT_SET_APPROVAL_ABI = [{
  name: 'setApprovalForAll', type: 'function',
  inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
  outputs: [],
}] as const

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function shortAddr(addr: string) {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

function RiskBadge({ risk, isUnlimited }: { risk: string; isUnlimited: boolean }) {
  if (risk === 'high') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">
      <ShieldAlert size={10} /> {isUnlimited ? 'Unlimited' : 'High'}
    </span>
  )
  if (risk === 'medium') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-600">
      <AlertTriangle size={10} /> Medium
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-600">
      <ShieldCheck size={10} /> Low
    </span>
  )
}

function ChainImg({ chainKey }: { chainKey: string }) {
  const [err, setErr] = useState(false)
  const chain = CHAINS.find(c => c.key === chainKey)
  if (err) return (
    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
      style={{ background: chain?.color ?? '#836EF9', fontSize: 8 }}>
      {chainKey.slice(0, 2)}
    </div>
  )
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={CHAIN_LOGO[chainKey]} alt={chainKey} width={20} height={20}
      className="rounded-full object-cover"
      onError={() => setErr(true)} />
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function SecurityPage() {
  const { address, isConnected } = useWallet()
  const connectedChainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()

  const [selectedChain, setSelectedChain] = useState('MONAD')
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'ERC-20' | 'NFT'>('all')
  const [revoking, setRevoking] = useState<string | null>(null)   // token:spender key
  const [revoked,  setRevoked]  = useState<Set<string>>(new Set())
  const [txError,  setTxError]  = useState<string | null>(null)
  const [txSuccess, setTxSuccess] = useState<string | null>(null)

  const loadApprovals = useCallback(async () => {
    if (!address) return
    setLoading(true); setError(null); setApprovals([])
    try {
      const res = await fetch(`/api/approvals?address=${address}&chain=${selectedChain}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setApprovals(data.approvals ?? [])
    } catch (e: any) {
      setError(e.message ?? 'Failed to load approvals')
    } finally {
      setLoading(false)
    }
  }, [address, selectedChain])

  useEffect(() => {
    if (isConnected && address) loadApprovals()
  }, [isConnected, address, loadApprovals])

  async function revokeApproval(approval: Approval) {
    const key = `${approval.token}:${approval.spender}`
    setRevoking(key); setTxError(null); setTxSuccess(null)

    // Check if wallet is on the right chain
    const targetChain = CHAINS.find(c => c.key === approval.chain)
    if (targetChain && connectedChainId !== targetChain.chainId) {
      try {
        await switchChain({ chainId: targetChain.chainId })
        await new Promise(r => setTimeout(r, 1500)) // wait for chain switch
      } catch {
        setTxError('Please switch network manually to ' + targetChain.name)
        setRevoking(null); return
      }
    }

    try {
      if (approval.type === 'ERC-20') {
        await sendTransactionAsync({
          to: approval.token as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_APPROVE_ABI, functionName: 'approve',
            args: [approval.spender as `0x${string}`, 0n],
          }),
        })
      } else {
        // NFT — setApprovalForAll(operator, false)
        await sendTransactionAsync({
          to: approval.token as `0x${string}`,
          data: encodeFunctionData({
            abi: NFT_SET_APPROVAL_ABI, functionName: 'setApprovalForAll',
            args: [approval.spender as `0x${string}`, false],
          }),
        })
      }
      setRevoked(prev => new Set([...prev, key]))
      setTxSuccess(`${approval.tokenSymbol} approval revoked successfully`)
    } catch (e: any) {
      setTxError(e.shortMessage ?? e.message ?? 'Transaction failed')
    } finally {
      setRevoking(null)
    }
  }

  // Filtered + searched list
  const visible = approvals.filter(a => {
    const key = `${a.token}:${a.spender}`
    if (revoked.has(key)) return false
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

  const highRiskCount = visible.filter(a => a.risk === 'high').length
  const totalCount    = visible.length
  const erc20Count    = visible.filter(a => a.type === 'ERC-20').length
  const nftCount      = visible.filter(a => a.type === 'NFT').length

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center shadow-lg shadow-red-200">
              <Shield size={20} className="text-white" />
            </div>
            <h1 className="font-bold text-2xl text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>Security</h1>
          </div>
          <p className="text-sm text-gray-500 ml-13 pl-1">
            Review and revoke token approvals &amp; NFT permissions granted to smart contracts
          </p>
        </div>
      </div>

      {/* Chain selector */}
      <div className="card p-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Select Network</p>
        <div className="flex flex-wrap gap-2">
          {CHAINS.map(chain => (
            <button key={chain.key}
              onClick={() => { setSelectedChain(chain.key); setApprovals([]); setRevoked(new Set()) }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                selectedChain === chain.key
                  ? 'border-violet-300 bg-violet-50 text-violet-700 shadow-sm'
                  : 'border-gray-200 text-gray-600 hover:border-violet-200 hover:bg-violet-50/50'
              }`}>
              <ChainImg chainKey={chain.key} />
              {chain.name}
              {selectedChain === chain.key && chain.key === 'MONAD' && (
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
          <p className="text-sm text-gray-400 mt-1">We'll check all token and NFT permissions you've granted</p>
        </div>
      )}

      {/* Loading */}
      {isConnected && loading && (
        <div className="card p-10 text-center">
          <RefreshCw size={28} className="text-violet-400 mx-auto mb-3 animate-spin" />
          <p className="text-gray-600 font-medium">Scanning approvals on {CHAINS.find(c => c.key === selectedChain)?.name}…</p>
          <p className="text-sm text-gray-400 mt-1">Checking on-chain allowances and NFT permissions</p>
        </div>
      )}

      {/* Error */}
      {isConnected && !loading && error && (
        <div className="card p-6 text-center border-red-100 bg-red-50/50">
          <XCircle size={28} className="text-red-400 mx-auto mb-2" />
          <p className="text-red-600 font-medium">{error}</p>
          <button onClick={loadApprovals}
            className="mt-3 text-sm text-violet-600 hover:text-violet-800 font-medium underline">
            Try again
          </button>
        </div>
      )}

      {/* Results */}
      {isConnected && !loading && !error && (
        <>
          {/* Summary cards */}
          {approvals.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-gray-800">{totalCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">Active approvals</p>
              </div>
              <div className={`card p-4 text-center ${highRiskCount > 0 ? 'border-red-200 bg-red-50/50' : ''}`}>
                <p className={`text-2xl font-bold ${highRiskCount > 0 ? 'text-red-600' : 'text-gray-800'}`}>{highRiskCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">High risk</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-gray-800">{erc20Count}</p>
                <p className="text-xs text-gray-500 mt-0.5">Token approvals</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-2xl font-bold text-gray-800">{nftCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">NFT approvals</p>
              </div>
            </div>
          )}

          {/* Tx feedback */}
          {txSuccess && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-700">
              <CheckCircle size={16} /> {txSuccess}
              <button onClick={() => setTxSuccess(null)} className="ml-auto text-green-500 hover:text-green-700"><XCircle size={14} /></button>
            </div>
          )}
          {txError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
              <XCircle size={16} /> {txError}
              <button onClick={() => setTxError(null)} className="ml-auto"><XCircle size={14} /></button>
            </div>
          )}

          {/* Filters + search */}
          {approvals.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-200 flex-1">
                <Search size={14} className="text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by token, contract, or spender…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400" />
              </div>
              <div className="flex gap-1">
                {(['all', 'ERC-20', 'NFT'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      filter === f ? 'bg-violet-100 text-violet-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-violet-50'
                    }`}>
                    {f === 'all' ? 'All' : f}
                    {f === 'ERC-20' && erc20Count > 0 && <span className="ml-1.5 text-xs opacity-60">{erc20Count}</span>}
                    {f === 'NFT'   && nftCount > 0   && <span className="ml-1.5 text-xs opacity-60">{nftCount}</span>}
                  </button>
                ))}
              </div>
              <button onClick={loadApprovals}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm text-gray-600 hover:bg-violet-50 hover:border-violet-300 transition-colors">
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
          )}

          {/* Zero state */}
          {!loading && approvals.length === 0 && (
            <div className="card p-10 text-center">
              <ShieldCheck size={40} className="text-green-400 mx-auto mb-3" />
              <p className="text-gray-700 font-semibold">No active approvals found</p>
              <p className="text-sm text-gray-400 mt-1">
                Your wallet has no active token or NFT approvals on {CHAINS.find(c => c.key === selectedChain)?.name}
              </p>
              <button onClick={loadApprovals}
                className="mt-4 text-sm text-violet-500 hover:text-violet-700 font-medium underline">
                Scan again
              </button>
            </div>
          )}

          {/* Approval list */}
          {visible.length > 0 && (
            <div className="space-y-2">
              {/* High risk warning banner */}
              {highRiskCount > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                  <ShieldAlert size={16} className="text-red-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <span className="font-semibold text-red-700">{highRiskCount} high-risk approval{highRiskCount > 1 ? 's' : ''}</span>
                    <span className="text-red-600"> — unlimited approvals let contracts spend all your tokens. Revoke if no longer needed.</span>
                  </div>
                </div>
              )}

              {visible.map(approval => {
                const key = `${approval.token}:${approval.spender}`
                const isRevoking = revoking === key
                return (
                  <div key={key}
                    className={`card p-4 transition-all ${approval.risk === 'high' ? 'border-red-100' : ''}`}>
                    <div className="flex items-center gap-3">

                      {/* Token type icon */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        approval.type === 'NFT' ? 'bg-purple-100' : 'bg-blue-100'
                      }`}>
                        {approval.type === 'NFT'
                          ? <ImageIcon size={18} className="text-purple-600" />
                          : <Coins size={18} className="text-blue-600" />
                        }
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800">{approval.tokenSymbol}</span>
                          <span className="text-xs text-gray-400">{approval.tokenName}</span>
                          <RiskBadge risk={approval.risk} isUnlimited={approval.isUnlimited} />
                          {approval.type === 'NFT' && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">NFT</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                          <ChainImg chainKey={approval.chain} />
                          <span>{approval.chainName}</span>
                          <span className="text-gray-300">·</span>
                          <span>Spender: </span>
                          <span className="font-mono">
                            {approval.spenderLabel
                              ? <span className="text-violet-600 font-semibold">{approval.spenderLabel}</span>
                              : shortAddr(approval.spender)
                            }
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className={`font-medium ${approval.isUnlimited ? 'text-red-500' : 'text-gray-700'}`}>
                            {approval.amount}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <a href={approval.explorerUrl} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                          <ExternalLink size={14} />
                        </a>
                        <button
                          onClick={() => revokeApproval(approval)}
                          disabled={isRevoking}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                          style={{
                            background: isRevoking
                              ? '#9ca3af'
                              : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                            boxShadow: isRevoking ? 'none' : '0 2px 8px rgba(239,68,68,0.3)',
                          }}>
                          {isRevoking
                            ? <><Loader size={13} className="animate-spin" /> Revoking…</>
                            : 'Revoke'
                          }
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* No results after filter */}
          {approvals.length > 0 && visible.length === 0 && (
            <div className="card p-8 text-center">
              <Search size={28} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No approvals match your search</p>
            </div>
          )}
        </>
      )}

      {/* Info footer */}
      <div className="flex items-start gap-2 text-xs text-gray-400">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          Approvals are fetched directly from on-chain logs and verified via RPC calls.
          Revoking sends an on-chain transaction setting the allowance to zero — MonBoard never holds your funds.
        </span>
      </div>
    </div>
  )
}
