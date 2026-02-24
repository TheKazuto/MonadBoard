'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { RefreshCw, ChevronRight, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Zap, Image, ExternalLink } from 'lucide-react'

interface Transaction {
  hash: string
  type: 'send' | 'receive' | 'swap' | 'defi' | 'nft' | 'contract'
  from: string
  to: string
  valueNative: string
  symbol: string
  tokenName?: string
  timestamp: number
  isError: boolean
  isToken?: boolean
  functionName?: string
  methodId?: string
}

function classifyType(tx: Transaction, address: string): Transaction['type'] {
  const fn = (tx.functionName || '').toLowerCase()
  if (fn.includes('swap') || fn.includes('exchange')) return 'swap'
  if (fn.includes('deposit') || fn.includes('borrow') || fn.includes('supply') || fn.includes('withdraw') || fn.includes('stake')) return 'defi'
  if (fn.includes('mint') || fn.includes('transfer') || fn.includes('nft') || fn.includes('erc721')) return 'nft'
  if (tx.to && tx.functionName && tx.functionName !== '') return 'contract'
  return tx.from.toLowerCase() === address.toLowerCase() ? 'send' : 'receive'
}

function formatTimeAgo(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
  receive:  { icon: <ArrowDownLeft size={14} />,  bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Received' },
  send:     { icon: <ArrowUpRight size={14} />,   bg: 'bg-red-50',     text: 'text-red-500',    label: 'Sent' },
  swap:     { icon: <ArrowLeftRight size={14} />, bg: 'bg-violet-50',  text: 'text-violet-600', label: 'Swap' },
  defi:     { icon: <Zap size={14} />,            bg: 'bg-amber-50',   text: 'text-amber-600',  label: 'DeFi' },
  nft:      { icon: <Image size={14} />,          bg: 'bg-blue-50',    text: 'text-blue-600',   label: 'NFT' },
  contract: { icon: <Zap size={14} />,            bg: 'bg-gray-50',    text: 'text-gray-500',   label: 'Contract' },
}

export default function RecentActivity() {
  const { address, isConnected } = useAccount()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchTransactions = useCallback(async () => {
    if (!address) return
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/transactions?address=${address}`)
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      // Re-classifica o tipo com base na função chamada
      const enriched = data.transactions.map((tx: Transaction) => ({
        ...tx,
        type: classifyType(tx, address),
      }))

      setTransactions(enriched)
      setLastUpdated(new Date())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    if (isConnected && address) {
      fetchTransactions()
      const interval = setInterval(fetchTransactions, 30_000)
      return () => clearInterval(interval)
    }
  }, [isConnected, address, fetchTransactions])

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>
            Recent Activity
          </h3>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-0.5">
              Updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              onClick={fetchTransactions}
              className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-all"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
          <a
            href="/transactions"
            className="text-xs text-violet-500 hover:text-violet-700 flex items-center gap-0.5"
          >
            View all <ChevronRight size={11} />
          </a>
        </div>
      </div>

      {/* Wallet not connected */}
      {!isConnected && (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
          <div className="w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center mb-1">
            <ArrowDownLeft size={20} className="text-violet-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">Connect your wallet</p>
          <p className="text-xs text-gray-400">to see your recent activity</p>
        </div>
      )}

      {/* Loading skeleton */}
      {isConnected && loading && transactions.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton w-9 h-9 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
              <div className="skeleton h-4 w-14 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isConnected && error && (
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <p className="text-sm text-gray-400">Could not load transactions</p>
          <button onClick={fetchTransactions} className="btn-primary text-xs px-4 py-2">
            Try again
          </button>
        </div>
      )}

      {/* Transactions list */}
      {isConnected && !error && transactions.length > 0 && (
        <div className="space-y-2">
          {transactions.map((tx) => {
            const cfg = TYPE_CONFIG[tx.type] || TYPE_CONFIG.contract
            const isIncoming = tx.type === 'receive'
            const valueDisplay = `${Number(tx.valueNative) > 0 ? tx.valueNative : '—'} ${tx.symbol}`

            return (
              <a
                key={tx.hash}
                href={`https://monadvision.com/tx/${tx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-violet-50/60 transition-all group cursor-pointer"
              >
                {/* Icon */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.text}`}>
                  {cfg.icon}
                </div>

                {/* Description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {cfg.label}
                      {tx.symbol && tx.symbol !== 'MON' && (
                        <span className="ml-1 text-violet-500">{tx.symbol}</span>
                      )}
                    </p>
                    {tx.isError && (
                      <span className="text-xs text-red-400 font-medium">Failed</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {isIncoming
                      ? `From ${shortenAddr(tx.from)}`
                      : `To ${shortenAddr(tx.to)}`}
                    {' · '}
                    {formatTimeAgo(tx.timestamp)}
                  </p>
                </div>

                {/* Value */}
                <div className="text-right shrink-0 flex items-center gap-1">
                  <span className={`text-sm font-bold ${isIncoming ? 'text-emerald-600' : tx.isError ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {isIncoming ? '+' : '-'}{valueDisplay}
                  </span>
                  <ExternalLink size={10} className="text-gray-300 group-hover:text-violet-400 transition-colors shrink-0" />
                </div>
              </a>
            )
          })}
        </div>
      )}

      {/* No transactions yet */}
      {isConnected && !loading && !error && transactions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
          <p className="text-sm text-gray-400">No transactions found</p>
          <p className="text-xs text-gray-300">Your activity will appear here</p>
        </div>
      )}
    </div>
  )
}
