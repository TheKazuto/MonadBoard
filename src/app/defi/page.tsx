'use client'

import { mockDeFiPositions, formatCurrency } from '@/lib/mockData'
import { TrendingUp, ExternalLink, Zap, AlertCircle } from 'lucide-react'

const allPositions = [
  ...mockDeFiPositions,
  { protocol: 'MonadStake', type: 'Native Staking', position: 'Stake MON', value: 620.00, apy: 14.2, percentage: 18.4, logo: '⚡', chain: 'Monad' },
]

export default function DeFiPage() {
  const totalDeFi = allPositions.reduce((sum, p) => sum + p.value, 0)
  const weightedApy = allPositions.reduce((sum, p) => sum + p.apy * (p.value / totalDeFi), 0)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>
          DeFi Positions
        </h1>
        <p className="text-gray-500 text-sm mt-1">Your active positions across Monad protocols</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total in DeFi', value: formatCurrency(totalDeFi), sub: 'across all protocols' },
          { label: 'Avg. APY', value: `${weightedApy.toFixed(1)}%`, sub: 'weighted average' },
          { label: 'Active Protocols', value: `${allPositions.length}`, sub: 'on Monad' },
          { label: 'Est. Annual Yield', value: formatCurrency((totalDeFi * weightedApy) / 100), sub: 'projected' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className="font-display text-2xl font-bold text-violet-700" style={{ fontFamily: 'Sora, sans-serif' }}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Positions List */}
      <div className="card p-5">
        <h2 className="font-display font-semibold text-gray-800 mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>All Positions</h2>
        <div className="space-y-4">
          {allPositions.map((pos) => {
            const pct = (pos.value / totalDeFi) * 100
            return (
              <div key={`${pos.protocol}-${pos.position}`} className="p-4 rounded-xl border border-violet-100 hover:border-violet-300 transition-all">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-2xl">
                      {pos.logo}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{pos.protocol}</p>
                      <p className="text-xs text-gray-400">{pos.type} · {pos.chain}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg text-gray-800">{formatCurrency(pos.value)}</p>
                    <p className="text-sm font-medium text-emerald-600 flex items-center justify-end gap-1">
                      <TrendingUp size={13} />
                      {pos.apy.toFixed(1)}% APY
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>{pos.position}</span>
                  <span>{pct.toFixed(1)}% of DeFi</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                  <div className="text-xs text-gray-400">
                    Est. daily yield: <span className="text-emerald-600 font-medium">+{formatCurrency((pos.value * pos.apy) / 100 / 365)}</span>
                  </div>
                  <button className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 transition-colors">
                    View on {pos.protocol} <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Coming soon protocols */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle size={16} className="text-violet-400" />
          <h2 className="font-display font-semibold text-gray-700 text-sm" style={{ fontFamily: 'Sora, sans-serif' }}>More Protocols Coming</h2>
        </div>
        <p className="text-xs text-gray-400 mb-4">As the Monad ecosystem grows, we&apos;ll automatically detect and display your positions in new protocols.</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {['Kuru', 'Ambient', 'Curvance', 'aPriori', 'Shmonad', 'Other'].map(name => (
            <div key={name} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-violet-50 opacity-50">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-base">⏳</div>
              <span className="text-xs text-gray-500 text-center">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
