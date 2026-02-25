'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import {
  TrendingUp, TrendingDown, ExternalLink, AlertTriangle,
  RefreshCw, Loader2, Shield, Droplets, Layers
} from 'lucide-react'

interface SupplyItem  { symbol: string; amount?: number; amountUSD?: number; apy?: number }
interface BorrowItem  { symbol: string; amount?: number; amountUSD?: number; apy?: number }
interface TokenItem   { symbol: string; amountUSD?: number }

interface DefiPosition {
  protocol: string
  type: 'lending' | 'vault' | 'liquidity'
  logo: string
  url: string
  chain: string
  label?: string
  asset?: string
  supply?: SupplyItem[]
  borrow?: BorrowItem[]
  collateral?: TokenItem[]
  totalCollateralUSD?: number
  totalDebtUSD?: number
  healthFactor?: number | null
  amountUSD?: number
  apy?: number
  tokens?: string[]
  netValueUSD: number
}

interface Summary {
  totalValueUSD: number
  totalDebtUSD: number
  totalSupplyUSD: number
  netValueUSD: number
  activeProtocols: string[]
  monPrice: number
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

function hfColor(hf: number): string {
  if (hf >= 3)   return 'text-emerald-600'
  if (hf >= 1.5) return 'text-yellow-600'
  if (hf >= 1.1) return 'text-orange-500'
  return 'text-red-500'
}
function hfBg(hf: number): string {
  if (hf >= 3)   return 'bg-emerald-50 border-emerald-200'
  if (hf >= 1.5) return 'bg-yellow-50 border-yellow-200'
  if (hf >= 1.1) return 'bg-orange-50 border-orange-200'
  return 'bg-red-50 border-red-200'
}
function hfLabel(hf: number): string {
  if (hf >= 3)   return 'Safe'
  if (hf >= 1.5) return 'Healthy'
  if (hf >= 1.1) return 'Caution'
  return 'At Risk'
}

function LendingCard({ pos }: { pos: DefiPosition }) {
  const hasDebt   = (pos.totalDebtUSD ?? 0) > 0.01
  const hasSupply = (pos.totalCollateralUSD ?? 0) > 0.01

  return (
    <div className="p-4 rounded-xl border border-violet-100 hover:border-violet-300 transition-all bg-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-xl shrink-0">
            {pos.logo}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800">{pos.protocol}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Lending</span>
            </div>
            {pos.label && <p className="text-xs text-gray-400 mt-0.5">{pos.label} · {pos.chain}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-gray-800">{fmt(pos.netValueUSD)}</p>
          <p className="text-xs text-gray-400">net value</p>
        </div>
      </div>

      {hasSupply && (
        <div className="mb-2 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
              <TrendingUp size={12} /> Supplied / Collateral
            </span>
            <span className="text-sm font-bold text-emerald-700">{fmt(pos.totalCollateralUSD ?? 0)}</span>
          </div>
          {(pos.supply ?? []).map((s, i) => (
            <div key={i} className="flex justify-between text-xs text-emerald-600 mt-0.5">
              <span>{s.symbol}</span>
              <span>
                {s.amount !== undefined ? s.amount.toFixed(4) : ''}
                {s.amountUSD !== undefined ? ` (${fmt(s.amountUSD)})` : ''}
                {s.apy ? ` · ${s.apy.toFixed(2)}% APY` : ''}
              </span>
            </div>
          ))}
          {(pos.collateral ?? []).map((c, i) => (
            <div key={i} className="flex justify-between text-xs text-emerald-600 mt-0.5">
              <span>{c.symbol}</span>
              <span>{c.amountUSD !== undefined ? fmt(c.amountUSD) : ''}</span>
            </div>
          ))}
        </div>
      )}

      {hasDebt && (
        <div className="mb-2 p-3 rounded-lg bg-red-50 border border-red-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-red-600 flex items-center gap-1">
              <TrendingDown size={12} /> Borrowed
            </span>
            <span className="text-sm font-bold text-red-600">−{fmt(pos.totalDebtUSD ?? 0)}</span>
          </div>
          {(pos.borrow ?? []).map((b, i) => (
            <div key={i} className="flex justify-between text-xs text-red-500 mt-0.5">
              <span>{b.symbol}</span>
              <span>
                {b.amount !== undefined ? b.amount.toFixed(4) : ''}
                {b.amountUSD !== undefined ? ` (${fmt(b.amountUSD)})` : ''}
                {b.apy ? ` · ${b.apy.toFixed(2)}% APR` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {pos.healthFactor !== null && pos.healthFactor !== undefined && hasDebt && (
        <div className={`flex items-center justify-between p-2 rounded-lg border text-xs font-medium mt-2 ${hfBg(pos.healthFactor)}`}>
          <div className="flex items-center gap-1.5">
            <Shield size={13} />
            <span>Health Factor</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-bold text-sm ${hfColor(pos.healthFactor)}`}>
              {pos.healthFactor >= 100 ? '∞' : pos.healthFactor.toFixed(2)}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-xs ${hfColor(pos.healthFactor)}`}>
              {hfLabel(pos.healthFactor)}
            </span>
          </div>
        </div>
      )}

      <a href={pos.url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700 mt-3 transition-colors">
        Manage on {pos.protocol} <ExternalLink size={11} />
      </a>
    </div>
  )
}

function VaultCard({ pos }: { pos: DefiPosition }) {
  return (
    <div className="p-4 rounded-xl border border-violet-100 hover:border-violet-300 transition-all bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-xl shrink-0">
            {pos.logo}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800">{pos.protocol}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">Vault</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{pos.label ?? pos.asset} · {pos.chain}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-gray-800">{fmt(pos.amountUSD ?? pos.netValueUSD)}</p>
          {(pos.apy ?? 0) > 0 && (
            <p className="text-xs text-emerald-600 font-medium flex items-center justify-end gap-1">
              <TrendingUp size={11} /> {pos.apy!.toFixed(2)}% APY
            </p>
          )}
        </div>
      </div>
      <a href={pos.url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700 mt-3 transition-colors">
        View on {pos.protocol} <ExternalLink size={11} />
      </a>
    </div>
  )
}

function LiquidityCard({ pos }: { pos: DefiPosition }) {
  return (
    <div className="p-4 rounded-xl border border-violet-100 hover:border-violet-300 transition-all bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-xl shrink-0">
            {pos.logo}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800">{pos.protocol}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-600 font-medium flex items-center gap-1">
                <Droplets size={10} /> Liquidity
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {pos.label ?? (pos.tokens ?? []).join('/')} · {pos.chain}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-gray-800">{fmt(pos.amountUSD ?? pos.netValueUSD)}</p>
          {(pos.apy ?? 0) > 0 && (
            <p className="text-xs text-emerald-600 font-medium flex items-center justify-end gap-1">
              <TrendingUp size={11} /> {pos.apy!.toFixed(2)}% APY
            </p>
          )}
        </div>
      </div>
      {(pos.tokens ?? []).length > 0 && (
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {pos.tokens!.map(t => (
            <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{t}</span>
          ))}
        </div>
      )}
      <a href={pos.url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700 mt-3 transition-colors">
        View on {pos.protocol} <ExternalLink size={11} />
      </a>
    </div>
  )
}

export default function DeFiPage() {
  const { address, isConnected } = useAccount()
  const [positions, setPositions] = useState<DefiPosition[]>([])
  const [summary, setSummary]     = useState<Summary | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/defi?address=${address}`)
      const data = await res.json()
      if (data.error && !data.positions) throw new Error(data.error)
      setPositions(data.positions ?? [])
      setSummary(data.summary ?? null)
      setLastUpdated(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => { if (isConnected && address) load() }, [address, isConnected, load])

  if (!isConnected) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>
            DeFi Positions
          </h1>
          <p className="text-gray-500 text-sm mt-1">Your active positions across Monad protocols</p>
        </div>
        <div className="card p-12 text-center">
          <Layers size={48} className="mx-auto text-violet-200 mb-4" />
          <p className="text-gray-500 text-lg font-medium">Connect your wallet</p>
          <p className="text-gray-400 text-sm mt-1">to view your DeFi positions on Monad</p>
        </div>
      </div>
    )
  }

  const lendingPositions   = positions.filter(p => p.type === 'lending')
  const vaultPositions     = positions.filter(p => p.type === 'vault')
  const liquidityPositions = positions.filter(p => p.type === 'liquidity')

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>
            DeFi Positions
          </h1>
          <p className="text-gray-500 text-sm mt-1">Your active positions across Monad protocols</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-violet-600 hover:text-violet-800 border border-violet-200 hover:border-violet-400 rounded-lg transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {loading && positions.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-200" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/4" />
                </div>
                <div className="h-6 bg-gray-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {summary && positions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Net DeFi Value',   value: fmt(summary.netValueUSD),    sub: 'after debt' },
            { label: 'Total Supplied',   value: fmt(summary.totalSupplyUSD),  sub: 'collateral + vaults' },
            { label: 'Total Borrowed',   value: fmt(summary.totalDebtUSD),    sub: 'outstanding debt', danger: summary.totalDebtUSD > 0 },
            { label: 'Active Protocols', value: `${summary.activeProtocols.length}`, sub: summary.activeProtocols.join(', ') },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <p className="text-xs text-gray-400 mb-1">{s.label}</p>
              <p className={`font-display text-2xl font-bold ${(s as any).danger ? 'text-red-500' : 'text-violet-700'}`}
                style={{ fontFamily: 'Sora, sans-serif' }}>
                {s.value}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {lendingPositions.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2 text-sm" style={{ fontFamily: 'Sora, sans-serif' }}>
            <Shield size={15} className="text-violet-500" /> Lending & Borrowing
          </h2>
          <div className="space-y-3">
            {lendingPositions.map((pos, i) => <LendingCard key={i} pos={pos} />)}
          </div>
        </div>
      )}

      {vaultPositions.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2 text-sm" style={{ fontFamily: 'Sora, sans-serif' }}>
            <Layers size={15} className="text-violet-500" /> Yield Vaults
          </h2>
          <div className="space-y-3">
            {vaultPositions.map((pos, i) => <VaultCard key={i} pos={pos} />)}
          </div>
        </div>
      )}

      {liquidityPositions.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2 text-sm" style={{ fontFamily: 'Sora, sans-serif' }}>
            <Droplets size={15} className="text-violet-500" /> Liquidity Pools
          </h2>
          <div className="space-y-3">
            {liquidityPositions.map((pos, i) => <LiquidityCard key={i} pos={pos} />)}
          </div>
        </div>
      )}

      {!loading && positions.length === 0 && !error && lastUpdated && (
        <div className="card p-12 text-center">
          <Layers size={48} className="mx-auto text-violet-200 mb-4" />
          <p className="text-gray-500 font-medium">No DeFi positions found</p>
          <p className="text-gray-400 text-sm mt-1">
            No active positions detected in Neverland, Morpho, Curve, Gearbox or Upshift
          </p>
          <div className="flex gap-3 justify-center mt-5 flex-wrap">
            {[
              { name: 'Neverland', url: 'https://app.neverland.money', emoji: '🌙' },
              { name: 'Morpho',    url: 'https://app.morpho.org',      emoji: '🦋' },
              { name: 'Curve',     url: 'https://curve.fi/#/monad',    emoji: '🌊' },
              { name: 'Gearbox',   url: 'https://app.gearbox.fi',      emoji: '⚙️' },
              { name: 'Upshift',   url: 'https://app.upshift.finance', emoji: '🔺' },
            ].map(p => (
              <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 text-sm font-medium transition-colors">
                {p.emoji} {p.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {lastUpdated && (
        <p className="text-xs text-gray-400 text-right">
          Updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
