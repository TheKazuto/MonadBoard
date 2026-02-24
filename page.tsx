'use client'

import { useState } from 'react'
import {
  mockWalletData, mockTokens, mockTransactions, mockDeFiPositions,
  mockPortfolioHistory, mockTopTokens, mockFearGreed,
  formatCurrency, formatTime, TX_ICONS, TX_COLORS, CHART_COLORS
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
function RecentTransactions() {
  const last6 = mockTransactions.slice(0, 6)

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>Recent Activity</h3>
        <a href="/transactions" className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-0.5">
          View all <ChevronRight size={12} />
        </a>
      </div>
      <div className="space-y-3">
        {last6.map((tx) => {
          const colorClass = TX_COLORS[tx.type] || 'text-gray-600 bg-gray-50'
          const icon = TX_ICONS[tx.type] || '•'
          return (
            <div key={tx.id} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${colorClass}`}>
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{tx.amount}</p>
                <p className="text-xs text-gray-400">
                  {tx.protocol ? <span className="text-violet-500">{tx.protocol} · </span> : ''}
                  {formatTime(tx.timestamp)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold ${tx.type === 'receive' ? 'text-emerald-600' : tx.type === 'send' ? 'text-red-500' : 'text-gray-700'}`}>
                  {tx.type === 'receive' ? '+' : tx.type === 'send' ? '-' : ''}{formatCurrency(tx.valueUSD)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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

function TokenAllocation() {
  return (
    <div className="card p-5">
      <h3 className="font-display font-semibold text-gray-800 mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>Token Exposure</h3>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="w-48 h-48 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={mockTokens}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {mockTokens.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2 w-full">
          {mockTokens.map((token, i) => (
            <div key={token.symbol} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i] }} />
              <span className="text-sm font-medium text-gray-700 w-14 shrink-0">{token.symbol}</span>
              <div className="flex-1">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${token.percentage}%`, background: CHART_COLORS[i] }} />
                </div>
              </div>
              <span className="text-xs text-gray-500 w-10 text-right shrink-0">{token.percentage.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
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
function TopTokens() {
  return (
    <div className="card p-5">
      <h3 className="font-display font-semibold text-gray-800 mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>Top Monad Tokens</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm responsive-table">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 text-left font-medium">#</th>
              <th className="pb-2 text-left font-medium">Token</th>
              <th className="pb-2 text-right font-medium">Price</th>
              <th className="pb-2 text-right font-medium hidden sm:table-cell">Mkt Cap</th>
              <th className="pb-2 text-right font-medium">24h</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {mockTopTokens.map((token) => {
              const isPositive = token.change24h >= 0
              return (
                <tr key={token.symbol} className="hover:bg-violet-50/50 transition-colors">
                  <td className="py-2.5 text-gray-400 text-xs">{token.rank}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{token.logo}</span>
                      <div>
                        <p className="font-semibold text-gray-800">{token.symbol}</p>
                        <p className="text-xs text-gray-400 hidden sm:block">{token.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-right font-mono text-gray-700">
                    {token.price < 0.01 ? `$${token.price.toFixed(6)}` : token.price < 1 ? `$${token.price.toFixed(4)}` : `$${token.price.toFixed(2)}`}
                  </td>
                  <td className="py-2.5 text-right text-gray-500 hidden sm:table-cell">
                    {formatCurrency(token.marketCap)}
                  </td>
                  <td className={`py-2.5 text-right font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                    {isPositive ? '+' : ''}{token.change24h.toFixed(1)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Fear & Greed ────────────────────────────────────────────────────────────
function FearAndGreed() {
  const { value, label, weekAgo, monthAgo } = mockFearGreed

  const getColor = (v: number) => {
    if (v <= 25) return '#ef4444'
    if (v <= 45) return '#f97316'
    if (v <= 55) return '#eab308'
    if (v <= 75) return '#22c55e'
    return '#10b981'
  }

  const getLabel = (v: number) => {
    if (v <= 25) return 'Extreme Fear'
    if (v <= 45) return 'Fear'
    if (v <= 55) return 'Neutral'
    if (v <= 75) return 'Greed'
    return 'Extreme Greed'
  }

  const color = getColor(value)

  // SVG gauge
  const radius = 60
  const circumference = Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>Fear & Greed</h3>
        <a href="https://cryptorank.io/charts/fear-and-greed" target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-0.5">
          CryptoRank <ChevronRight size={12} />
        </a>
      </div>

      <div className="flex flex-col items-center flex-1 justify-center">
        {/* Gauge SVG */}
        <div className="relative">
          <svg width="160" height="90" viewBox="0 0 160 90">
            {/* Background arc */}
            <path
              d="M 10 80 A 70 70 0 0 1 150 80"
              fill="none"
              stroke="#f3f0ff"
              strokeWidth="14"
              strokeLinecap="round"
            />
            {/* Colored arc */}
            <path
              d="M 10 80 A 70 70 0 0 1 150 80"
              fill="none"
              stroke={color}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }}
            />
          </svg>
          {/* Center value */}
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
            <span className="text-3xl font-bold font-display" style={{ fontFamily: 'Sora, sans-serif', color }}>{value}</span>
            <span className="text-xs font-medium" style={{ color }}>{label}</span>
          </div>
        </div>

        {/* Historical comparison */}
        <div className="w-full mt-4 grid grid-cols-2 gap-2">
          <div className="bg-violet-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-400 mb-1">Last Week</p>
            <p className="font-bold text-gray-700">{weekAgo}</p>
            <p className="text-xs font-medium" style={{ color: getColor(weekAgo) }}>{getLabel(weekAgo)}</p>
          </div>
          <div className="bg-violet-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-400 mb-1">Last Month</p>
            <p className="font-bold text-gray-700">{monthAgo}</p>
            <p className="text-xs font-medium" style={{ color: getColor(monthAgo) }}>{getLabel(monthAgo)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

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
          <RecentTransactions />
        </div>
      </div>

      {/* Middle Row: Token Allocation + DeFi Positions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TokenAllocation />
        <DeFiPositions />
      </div>

      {/* Portfolio History Chart */}
      <PortfolioHistory />

      {/* Bottom Row: Top Tokens + Fear & Greed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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
