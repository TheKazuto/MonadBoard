'use client'

import { useState } from 'react'
import TopTokens from '@/components/TopTokens'
import RecentActivity from '@/components/RecentActivity'
import FearAndGreed from '@/components/FearAndGreed'
import TokenExposure from '@/components/TokenExposure'
import {
  mockWalletData, mockDeFiPositions,
  mockPortfolioHistory,
  formatCurrency, CHART_COLORS
} from '@/lib/mockData'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  TrendingUp, TrendingDown, RefreshCw, Wallet, Image,
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Zap,
  ChevronRight, Bell, AlertCircle, Info
} from 'lucide-react'

// ─── Wallet Summary (top hero section) ─────────────────────────────────────
function WalletSummary() {
  const { totalValueUSD, nftValueUSD, change24h, changeAmount24h, totalAssets } = mockWalletData
  const isPositive = change24h >= 0

  return (
    <div className="card p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #836EF9 0%, #6d28d9 100%)' }}>
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, white, transparent)', transform: 'translate(30%, -40%)' }} />
      <div className="absolute bottom-0 left-20 w-40 h-40 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, white, transparent)', transform: 'translate(0, 40%)' }} />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-violet-200 text-sm font-medium mb-1">Total Portfolio Value</p>
            <h2 className="text-white font-display text-4xl font-bold" style={{ fontFamily: 'Sora, sans-serif' }}>
              {formatCurrency(totalValueUSD)}
            </h2>
            <div className={`flex items-center gap-1 mt-2 ${isPositive ? 'text-emerald-300' : 'text-red-300'}`}>
              {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span className="text-sm font-medium">
                {isPositive ? '+' : ''}{formatCurrency(changeAmount24h)} ({isPositive ? '+' : ''}{change24h.toFixed(2)}%) today
              </span>
            </div>
          </div>
          <button className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white">
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="flex gap-6 pt-4 border-t border-white/20">
          <div>
            <div className="flex items-center gap-1.5 text-violet-200 text-xs mb-1">
              <Wallet size={12} />
              Token Assets
            </div>
            <p className="text-white font-semibold text-lg">{formatCurrency(totalValueUSD - nftValueUSD)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-violet-200 text-xs mb-1">
              <Image size={12} />
              NFT Value
            </div>
            <p className="text-white font-semibold text-lg">{formatCurrency(nftValueUSD)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-violet-200 text-xs mb-1">
              <Zap size={12} />
              DeFi Positions
            </div>
            <p className="text-white font-semibold text-lg">{formatCurrency(3370)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Recent Transactions ────────────────────────────────────────────────────
// ─── Token Allocation Pie ───────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="chart-tooltip">
        <p className="font-semibold text-gray-800">{data.symbol}</p>
        <p className="text-violet-600">{data.percentage.toFixed(1)}%</p>
        <p className="text-gray-500 text-sm">{formatCurrency(data.value)}</p>
      </div>
    )
  }
  return null
}

// ─── DeFi Positions ─────────────────────────────────────────────────────────
function DeFiPositions() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>DeFi Positions</h3>
        <a href="/defi" className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-0.5">
          See all <ChevronRight size={12} />
        </a>
      </div>
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

// ─── Portfolio History Chart ─────────────────────────────────────────────────
type Range = '7d' | '30d' | '90d' | '1y'
const RANGES: { label: string; key: Range; days: number }[] = [
  { label: '7D', key: '7d', days: 7 },
  { label: '30D', key: '30d', days: 30 },
  { label: '90D', key: '90d', days: 90 },
  { label: '1Y', key: '1y', days: 365 },
]

function PortfolioHistory() {
  const [range, setRange] = useState<Range>('30d')
  const selectedDays = RANGES.find(r => r.key === range)?.days || 30
  const data = mockPortfolioHistory.slice(-selectedDays)
  const first = data[0]?.value || 0
  const last = data[data.length - 1]?.value || 0
  const change = ((last - first) / first) * 100
  const isPositive = change >= 0

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>Portfolio History</h3>
          <div className={`flex items-center gap-1 mt-0.5 text-sm ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            <span className="font-medium">{isPositive ? '+' : ''}{change.toFixed(2)}% in period</span>
          </div>
        </div>
        <div className="flex gap-1 bg-violet-50 rounded-lg p-1">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                range === r.key ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-violet-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#836EF9" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#836EF9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f0ff" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                const d = new Date(v)
                return selectedDays <= 7 ? d.toLocaleDateString('en', { weekday: 'short' }) : d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
              }}
              interval={Math.floor(data.length / 5)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(1)}K`}
              width={48}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="chart-tooltip">
                      <p className="text-xs text-gray-400">{new Date(label).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      <p className="font-bold text-violet-700">{formatCurrency(payload[0].value as number)}</p>
                    </div>
                  )
                }
                return null
              }}
            />
            <Area type="monotone" dataKey="value" stroke="#836EF9" strokeWidth={2} fill="url(#portfolioGrad)" dot={false} activeDot={{ r: 4, fill: '#836EF9' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Top Monad Tokens ────────────────────────────────────────────────────────
// ─── Fear & Greed ────────────────────────────────────────────────────────────
// ─── NFT Gating Banner ───────────────────────────────────────────────────────
function NFTGatingBanner() {
  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shrink-0">
        <Bell size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-violet-900">Unlock Telegram Alerts</p>
        <p className="text-xs text-violet-600 mt-0.5">Hold a <strong>MonadBoard NFT</strong> to get real-time wallet alerts via Telegram and monitor other wallets.</p>
      </div>
      <button className="shrink-0 btn-primary text-xs px-4 py-2">
        Get NFT
      </button>
    </div>
  )
}

// ─── Sponsors Banner ─────────────────────────────────────────────────────────
function SponsorsBanner() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-gray-800 text-sm" style={{ fontFamily: 'Sora, sans-serif' }}>Partners & Sponsors</h3>
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

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* NFT Gating Notification */}
      <NFTGatingBanner />

      {/* Hero Row: Wallet Summary + Recent Transactions */}
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
        <div className="lg:col-span-2">
          <TopTokens />
        </div>
        <div className="lg:col-span-1">
          <FearAndGreed />
        </div>
      </div>

      {/* Sponsors */}
      <SponsorsBanner />
    </div>
  )
}
