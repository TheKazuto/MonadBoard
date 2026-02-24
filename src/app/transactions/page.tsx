'use client'

import { useState } from 'react'
import { mockTransactions, formatCurrency, formatTime, TX_ICONS, TX_COLORS, shortenAddress } from '@/lib/mockData'
import { Search, Filter, Plus, Trash2, Eye, Bell, Lock } from 'lucide-react'

const FILTERS = ['All', 'Receive', 'Send', 'Swap', 'DeFi', 'NFT']

const watchedWallets = [
  { address: '0x1234...5678', label: 'Whale Watch', txCount: 142, lastTx: '5m ago' },
  { address: '0xabcd...ef01', label: 'Monad Team', txCount: 8, lastTx: '2h ago' },
]

export default function TransactionsPage() {
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [watchInput, setWatchInput] = useState('')
  const [nftGated] = useState(false) // false = no NFT, true = has NFT

  const filtered = mockTransactions.filter(tx => {
    if (filter !== 'All' && tx.type !== filter.toLowerCase()) return false
    if (search && !tx.amount.toLowerCase().includes(search.toLowerCase()) && !tx.hash.includes(search)) return false
    return true
  })

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>
          Transactions
        </h1>
        <p className="text-gray-500 text-sm mt-1">Full history and wallet monitoring</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Transaction History */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search + Filter */}
          <div className="card p-4 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search transactions..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-violet-100 text-sm bg-violet-50/30 focus:outline-none focus:border-violet-300 focus:bg-white transition-all"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filter === f ? 'bg-violet-600 text-white' : 'bg-violet-50 text-gray-600 hover:bg-violet-100'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Transactions */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>
                Transaction History
              </h2>
              <span className="text-xs text-gray-400">{filtered.length} transactions</span>
            </div>
            <div className="space-y-3">
              {filtered.map(tx => {
                const colorClass = TX_COLORS[tx.type] || 'text-gray-600 bg-gray-50'
                const icon = TX_ICONS[tx.type] || '•'
                return (
                  <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-violet-50/60 transition-all cursor-pointer">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-medium shrink-0 ${colorClass}`}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800 truncate">{tx.amount}</p>
                        <p className={`text-sm font-bold ml-2 shrink-0 ${tx.type === 'receive' ? 'text-emerald-600' : tx.type === 'send' ? 'text-red-500' : 'text-gray-700'}`}>
                          {tx.type === 'receive' ? '+' : tx.type === 'send' ? '-' : ''}{formatCurrency(tx.valueUSD)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {tx.protocol && <span className="text-xs font-medium text-violet-500">{tx.protocol}</span>}
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-400">{formatTime(tx.timestamp)}</span>
                        <span className="text-xs text-gray-400">·</span>
                        <a href={`https://monad.xyz/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 hover:text-violet-600 font-mono">{tx.hash}</a>
                      </div>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No transactions match your filters
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Wallet Monitor (NFT gated) */}
        <div className="space-y-4">
          <div className="card p-5 relative">
            {/* NFT Gate Overlay */}
            {!nftGated && (
              <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center z-10 text-center p-6"
                style={{ background: 'rgba(250,249,255,0.92)', backdropFilter: 'blur(4px)' }}
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center mb-3">
                  <Lock size={24} className="text-white" />
                </div>
                <h3 className="font-display font-bold text-gray-800 mb-1" style={{ fontFamily: 'Sora, sans-serif' }}>Premium Feature</h3>
                <p className="text-sm text-gray-500 mb-4">Hold a <strong className="text-violet-700">MonadBoard NFT</strong> to monitor wallets and receive Telegram alerts.</p>
                <button className="btn-primary text-sm px-5 py-2">
                  Get Your NFT
                </button>
                <p className="text-xs text-gray-400 mt-2">NFT collection launching soon</p>
              </div>
            )}

            <h2 className="font-display font-semibold text-gray-800 mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>
              <Eye size={16} className="inline mr-1.5 text-violet-500" />
              Watch Wallets
            </h2>

            {/* Add wallet input */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={watchInput}
                onChange={e => setWatchInput(e.target.value)}
                placeholder="0x... or ENS name"
                className="flex-1 px-3 py-2 rounded-lg border border-violet-100 text-sm bg-violet-50/30 focus:outline-none focus:border-violet-300 transition-all"
              />
              <button className="btn-primary text-sm px-3 py-2">
                <Plus size={15} />
              </button>
            </div>

            {/* Watched wallets */}
            <div className="space-y-3">
              {watchedWallets.map(wallet => (
                <div key={wallet.address} className="flex items-center gap-3 p-3 rounded-xl bg-violet-50/60 border border-violet-100">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center">
                    <Eye size={13} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{wallet.label}</p>
                    <p className="text-xs text-gray-400 font-mono">{wallet.address}</p>
                    <p className="text-xs text-gray-400">{wallet.txCount} txs · last {wallet.lastTx}</p>
                  </div>
                  <button className="text-gray-400 hover:text-red-500 transition-colors p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Telegram Bot */}
          <div className="card p-5 relative">
            {!nftGated && (
              <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center z-10 text-center p-6"
                style={{ background: 'rgba(250,249,255,0.92)', backdropFilter: 'blur(4px)' }}
              >
                <Lock size={20} className="text-violet-400 mb-2" />
                <p className="text-xs text-gray-500">NFT required</p>
              </div>
            )}

            <h2 className="font-display font-semibold text-gray-800 mb-3" style={{ fontFamily: 'Sora, sans-serif' }}>
              <Bell size={16} className="inline mr-1.5 text-violet-500" />
              Telegram Alerts
            </h2>
            <p className="text-xs text-gray-500 mb-4">Connect Telegram to get real-time notifications for your wallet and watched wallets.</p>
            <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100 transition-all">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              Connect Telegram Bot
            </button>
            <p className="text-xs text-gray-400 mt-2 text-center">@MonadBoardBot</p>
          </div>
        </div>
      </div>
    </div>
  )
}
