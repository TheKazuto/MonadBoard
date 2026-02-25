'use client'

import TopTokens from '@/components/TopTokens'
import RecentActivity from '@/components/RecentActivity'
import FearAndGreed from '@/components/FearAndGreed'
import TokenExposure from '@/components/TokenExposure'
import PortfolioHistory from '@/components/PortfolioHistory'
import { usePortfolio } from '@/contexts/PortfolioContext'
import { useWallet }    from '@/contexts/WalletContext'
import { mockDeFiPositions, formatCurrency } from '@/lib/mockData'
import {
  RefreshCw, Wallet, Image,
  Zap, ChevronRight, Bell,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(2)}K`
  if (v >= 1)         return `$${v.toFixed(2)}`
  if (v > 0)          return `$${v.toFixed(4)}`
  return '$0.00'
}

// ─── Wallet Summary hero ──────────────────────────────────────────────────────
function WalletSummary() {
  const { totals, status, lastUpdated, refresh } = usePortfolio()
  const { isConnected } = useWallet()

  const isLoading = status === 'loading'
  const isPartial = status === 'partial'
  const hasData   = isConnected && (status === 'partial' || status === 'done')

  // Skeleton shimmer for a number slot
  const Shimmer = ({ w = 'w-28' }: { w?: string }) => (
    <div className={`${w} h-5 rounded-md bg-white/20 animate-pulse`} />
  )

  return (
    <div className="card p-6 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #836EF9 0%, #6d28d9 100%)' }}>

      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, white, transparent)', transform: 'translate(30%, -40%)' }} />
      <div className="absolute bottom-0 left-20 w-40 h-40 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, white, transparent)', transform: 'translate(0, 40%)' }} />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-violet-200 text-sm font-medium mb-1">Total Portfolio Value</p>

            {/* Main value */}
            {!isConnected ? (
              <h2 className="text-white font-display text-4xl font-bold" style={{ fontFamily: 'Sora, sans-serif' }}>
                —
              </h2>
            ) : isLoading ? (
              <div className="w-48 h-10 rounded-lg bg-white/20 animate-pulse mt-1" />
            ) : (
              <h2 className="text-white font-display text-4xl font-bold" style={{ fontFamily: 'Sora, sans-serif' }}>
                {fmt(totals.totalValueUSD)}
              </h2>
            )}

            {/* Wallet connected label */}
            {!isConnected && (
              <p className="text-violet-300 text-sm mt-2">Connect your wallet to see your portfolio</p>
            )}

            {/* Last updated */}
            {hasData && lastUpdated && (
              <p className="text-violet-300 text-xs mt-2">
                Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                {isPartial && <span className="ml-1 animate-pulse">· loading…</span>}
              </p>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={refresh}
            disabled={!isConnected || isLoading}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white disabled:opacity-40 disabled:cursor-not-allowed"
            title="Refresh portfolio"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Three breakdown pills */}
        <div className="flex gap-6 pt-4 border-t border-white/20">

          {/* Token Assets */}
          <div>
            <div className="flex items-center gap-1.5 text-violet-200 text-xs mb-1">
              <Wallet size={12} />
              Token Assets
            </div>
            {!isConnected ? (
              <p className="text-white font-semibold text-lg">—</p>
            ) : isLoading ? (
              <Shimmer />
            ) : (
              <p className="text-white font-semibold text-lg">{fmt(totals.tokenValueUSD)}</p>
            )}
          </div>

          {/* NFT Value */}
          <div>
            <div className="flex items-center gap-1.5 text-violet-200 text-xs mb-1">
              <Image size={12} />
              NFT Value
            </div>
            {!isConnected ? (
              <p className="text-white font-semibold text-lg">—</p>
            ) : isLoading ? (
              <Shimmer />
            ) : (
              <p className="text-white font-semibold text-lg">{fmt(totals.nftValueUSD)}</p>
            )}
          </div>

          {/* DeFi Positions */}
          <div>
            <div className="flex items-center gap-1.5 text-violet-200 text-xs mb-1">
              <Zap size={12} />
              DeFi Positions
            </div>
            {!isConnected ? (
              <p className="text-white font-semibold text-lg">—</p>
            ) : isLoading ? (
              <Shimmer />
            ) : (
              <p className="text-white font-semibold text-lg">{fmt(totals.defiNetValueUSD)}</p>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── DeFi Positions widget (dashboard mini preview) ───────────────────────────
function DeFiPositions() {
  const { totals, status } = usePortfolio()
  const { isConnected }   = useWallet()

  // If connected and has DeFi data, show active protocols count
  const hasDefi = isConnected && totals.defiNetValueUSD > 0

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>
          DeFi Positions
        </h3>
        <a href="/defi" className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-0.5">
          See all <ChevronRight size={12} />
        </a>
      </div>

      {/* If connected and has real DeFi data, show summary */}
      {isConnected && hasDefi && (
        <div className="mb-4 p-3 rounded-xl bg-violet-50 border border-violet-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-violet-500 mb-0.5">Total DeFi Value</p>
              <p className="text-lg font-bold text-violet-800">{fmt(totals.defiNetValueUSD)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-violet-500 mb-0.5">Active protocols</p>
              <p className="text-lg font-bold text-violet-800">{totals.defiActiveProtocols.length}</p>
            </div>
          </div>
          {totals.defiActiveProtocols.length > 0 && (
            <p className="text-xs text-violet-400 mt-2 truncate">
              {totals.defiActiveProtocols.join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Mock positions as preview / placeholder */}
      <div className="space-y-4">
        {mockDeFiPositions.map((pos) => (
          <div key={pos.protocol} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{pos.logo}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{pos.protocol}</p>
                  <p className="text-xs text-gray-400">{pos.type} · {pos.apy.toFixed(1)}% APY</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-800">{formatCurrency(pos.value)}</p>
                <p className="text-xs text-emerald-600 font-medium">+{pos.apy.toFixed(1)}% APY</p>
              </div>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pos.percentage}%` }} />
            </div>
            <p className="text-xs text-gray-400 text-right">{pos.percentage.toFixed(1)}% of DeFi</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── NFT Gating Banner ────────────────────────────────────────────────────────
function NFTGatingBanner() {
  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shrink-0">
        <Bell size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-violet-900">Unlock Telegram Alerts</p>
        <p className="text-xs text-violet-600 mt-0.5">
          Hold a <strong>MonadBoard NFT</strong> to get real-time wallet alerts via Telegram and monitor other wallets.
        </p>
      </div>
      <button className="shrink-0 btn-primary text-xs px-4 py-2">Get NFT</button>
    </div>
  )
}

// ─── Sponsors Banner ──────────────────────────────────────────────────────────
function SponsorsBanner() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-gray-800 text-sm" style={{ fontFamily: 'Sora, sans-serif' }}>
          Partners & Sponsors
        </h3>
        <a href="mailto:partner@monadboard.xyz" className="text-xs text-violet-600">Become a partner →</a>
      </div>
      <div className="flex items-center justify-center gap-8 py-4 border border-dashed border-violet-200 rounded-xl">
        {['MonadSwap', 'MonadLend', 'NadPets', 'MagicEden'].map(name => (
          <div key={name} className="flex flex-col items-center gap-1 opacity-50 hover:opacity-100 transition-opacity cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center text-lg">
              {name === 'MonadSwap' ? '🔄' : name === 'MonadLend' ? '🏦' : name === 'NadPets' ? '🐾' : '✨'}
            </div>
            <span className="text-xs text-gray-500">{name}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1 opacity-40 hover:opacity-80 transition-opacity cursor-pointer">
          <div className="w-10 h-10 rounded-lg border-2 border-dashed border-violet-200 flex items-center justify-center text-violet-300 text-xl">+</div>
          <span className="text-xs text-gray-400">Your Brand</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <NFTGatingBanner />

      {/* Hero Row: Wallet Summary + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3">
          <WalletSummary />
        </div>
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
      </div>

      {/* Middle Row: Token Allocation + DeFi Positions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TokenExposure />
        <DeFiPositions />
      </div>

      {/* Portfolio History Chart */}
      <PortfolioHistory />

      {/* Bottom Row: Top Tokens + Fear & Greed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2"><TopTokens /></div>
        <div className="lg:col-span-1"><FearAndGreed /></div>
      </div>

      <SponsorsBanner />
    </div>
  )
}
