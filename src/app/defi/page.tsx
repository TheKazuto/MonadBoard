'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { RefreshCw, TrendingUp, TrendingDown, Zap, ExternalLink, AlertCircle } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtUSD(n: number): string {
  if (!n && n !== 0) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(2)}K`
  if (abs >= 0.01)      return `${sign}$${abs.toFixed(2)}`
  return `${sign}$${abs.toFixed(4)}`
}
function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}
function fmtApy(n: number | null): string {
  if (!n || n <= 0) return ''
  return `${n.toFixed(2)}%`
}

// Health factor styling
function hfConfig(hf: number | null) {
  if (hf === null || hf === undefined) return null
  if (hf >= 999) return { label: 'Safe', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', display: '∞' }
  if (hf >= 3)   return { label: 'Safe',    color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200', display: hf.toFixed(2) }
  if (hf >= 1.5) return { label: 'Healthy', color: 'text-green-600',   bg: 'bg-green-50',    border: 'border-green-200',   display: hf.toFixed(2) }
  if (hf >= 1.1) return { label: 'Caution', color: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-200',   display: hf.toFixed(2) }
  return          { label: 'Risk',    color: 'text-red-600',    bg: 'bg-red-50',      border: 'border-red-200',     display: hf.toFixed(2) }
}

// PNL badge
function PnlBadge({ pnl, pnlPct }: { pnl: number | null; pnlPct?: number | null }) {
  if (pnl === null || pnl === undefined) return null
  const isPos = pnl >= 0
  return (
    <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${isPos ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
      {isPos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      <span>{isPos ? '+' : ''}{fmtUSD(pnl)}</span>
      {pnlPct !== null && pnlPct !== undefined && (
        <span className="opacity-75">{fmtPct(pnlPct)}</span>
      )}
    </div>
  )
}

// APY badge
function ApyBadge({ apy, label = 'APY' }: { apy: number | null; label?: string }) {
  const pct = fmtApy(apy)
  if (!pct) return null
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
      {label} {pct}
    </span>
  )
}

// In-range badge for LP positions
function RangeBadge({ inRange }: { inRange: boolean | null | undefined }) {
  if (inRange === null || inRange === undefined) return null
  return inRange
    ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">✓ In Range</span>
    : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">✗ Out of Range</span>
}

// ─── Type badge ───────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const cfg: Record<string, string> = {
    lending:   'bg-blue-50 text-blue-600 border-blue-200',
    vault:     'bg-violet-50 text-violet-700 border-violet-200',
    liquidity: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  }
  const labels: Record<string, string> = { lending: 'Lending', vault: 'Vault', liquidity: 'LP' }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg[type] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {labels[type] ?? type}
    </span>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />
}
function CardSkeleton() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2"><Skeleton className="w-24 h-4" /><Skeleton className="w-16 h-3" /></div>
        </div>
        <Skeleton className="w-16 h-6 rounded-full" />
      </div>
      <Skeleton className="w-full h-20 mb-3" />
      <Skeleton className="w-full h-12" />
    </div>
  )
}

// ─── LENDING CARD ─────────────────────────────────────────────────────────────
function LendingCard({ pos }: { pos: any }) {
  const hf = hfConfig(pos.healthFactor)
  const supplyItems = [...(pos.supply ?? []), ...(pos.collateral ?? [])]
  const borrowItems = pos.borrow ?? []
  const hasDebt = pos.totalDebtUSD > 0.01
  const hasCollateral = pos.totalCollateralUSD > 0.01

  return (
    <div className="card p-5 hover:shadow-lg transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-xl">
            {pos.logo}
          </div>
          <div>
            <div className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
              {pos.protocol}
              <ExternalLink size={11} className="text-gray-300" />
            </div>
            {pos.label && <div className="text-xs text-gray-400 mt-0.5">{pos.label}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <TypeBadge type="lending" />
          {hf && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${hf.bg} ${hf.color} ${hf.border}`}>
              HF {hf.display}
            </span>
          )}
        </div>
      </div>

      {/* Supplied */}
      {hasCollateral && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Supplied</span>
            <span className="text-sm font-bold text-emerald-700">{fmtUSD(pos.totalCollateralUSD)}</span>
          </div>
          <div className="space-y-1">
            {supplyItems.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-gray-700">{s.symbol}</span>
                  {s.apy > 0 && <ApyBadge apy={s.apy} />}
                </div>
                <span className="text-gray-500">
                  {s.amountUSD ? fmtUSD(s.amountUSD) : s.amount ? s.amount.toFixed(4) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Borrowed */}
      {hasDebt && (
        <div className="rounded-xl bg-red-50 border border-red-100 p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Borrowed</span>
            <span className="text-sm font-bold text-red-600">{fmtUSD(pos.totalDebtUSD)}</span>
          </div>
          <div className="space-y-1">
            {borrowItems.map((b: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-gray-700">{b.symbol}</span>
                  {b.apr > 0 && <ApyBadge apy={b.apr} label="APR" />}
                </div>
                <span className="text-gray-500">
                  {b.amountUSD ? fmtUSD(b.amountUSD) : b.amount ? b.amount.toFixed(4) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Net + PNL */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Net Value</span>
          <PnlBadge pnl={pos.pnl ?? null} pnlPct={pos.pnlPct ?? null} />
        </div>
        <span className={`font-bold text-sm ${pos.netValueUSD >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
          {fmtUSD(pos.netValueUSD)}
        </span>
      </div>
    </div>
  )
}

// ─── VAULT CARD ───────────────────────────────────────────────────────────────
function VaultCard({ pos }: { pos: any }) {
  return (
    <div className="card p-5 hover:shadow-lg transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-xl">
            {pos.logo}
          </div>
          <div>
            <div className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
              {pos.protocol}
              <ExternalLink size={11} className="text-gray-300" />
            </div>
            {pos.label && <div className="text-xs text-gray-400 mt-0.5">{pos.label}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <TypeBadge type="vault" />
          {pos.apy > 0 && <ApyBadge apy={pos.apy} />}
        </div>
      </div>

      <div className="rounded-xl bg-violet-50 border border-violet-100 p-3">
        <div className="text-xs text-violet-600 font-medium mb-1">{pos.asset ?? 'Deposited'}</div>
        <div className="text-2xl font-bold text-gray-800">{fmtUSD(pos.amountUSD)}</div>
        {pos.amount && (
          <div className="text-xs text-gray-400 mt-1">{pos.amount.toFixed(4)} {pos.asset}</div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-50 mt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Value</span>
          <PnlBadge pnl={pos.pnl ?? null} pnlPct={pos.pnlPct ?? null} />
        </div>
        <span className="font-bold text-sm text-gray-800">{fmtUSD(pos.netValueUSD)}</span>
      </div>
    </div>
  )
}

// ─── LIQUIDITY CARD ───────────────────────────────────────────────────────────
function LiquidityCard({ pos }: { pos: any }) {
  return (
    <div className="card p-5 hover:shadow-lg transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-xl">
            {pos.logo}
          </div>
          <div>
            <div className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
              {pos.protocol}
              <ExternalLink size={11} className="text-gray-300" />
            </div>
            {pos.label && <div className="text-xs text-gray-400 mt-0.5">{pos.label}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <TypeBadge type="liquidity" />
          <RangeBadge inRange={pos.inRange} />
        </div>
      </div>

      <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3 mb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1">
            {(pos.tokens ?? []).map((t: string, i: number) => (
              <span key={i} className="text-xs font-medium px-2 py-0.5 rounded-full bg-white border border-cyan-200 text-cyan-700">
                {t}
              </span>
            ))}
          </div>
          {pos.apy > 0 && <ApyBadge apy={pos.apy} />}
        </div>
        <div className="text-2xl font-bold text-gray-800">
          {pos.amountUSD > 0 ? fmtUSD(pos.amountUSD) : <span className="text-gray-400 text-base font-medium">No USD data</span>}
        </div>

        {/* Tick range for V3 */}
        {pos.tickLower !== undefined && pos.currentTick !== undefined && (
          <div className="mt-2 pt-2 border-t border-cyan-100">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Range: {pos.tickLower.toLocaleString()} → {pos.tickUpper.toLocaleString()}</span>
              <span className={pos.inRange ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                Tick: {pos.currentTick.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Liquidity</span>
          <PnlBadge pnl={pos.pnl ?? null} pnlPct={pos.pnlPct ?? null} />
        </div>
        <span className="font-bold text-sm text-gray-800">
          {pos.amountUSD > 0 ? fmtUSD(pos.netValueUSD) : '—'}
        </span>
      </div>
    </div>
  )
}

// ─── SUMMARY BANNER ───────────────────────────────────────────────────────────
function SummaryBanner({ summary, loading }: { summary: any; loading: boolean }) {
  if (loading) {
    return (
      <div className="card p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    )
  }
  const items = [
    { label: 'Total Supplied',  value: fmtUSD(summary.totalSupplyUSD ?? 0),   color: 'text-emerald-600' },
    { label: 'Total Borrowed',  value: fmtUSD(summary.totalDebtUSD ?? 0),     color: 'text-red-500' },
    { label: 'Net DeFi Value',  value: fmtUSD(summary.netValueUSD ?? 0),      color: 'text-violet-700 font-bold text-xl' },
    { label: 'Active Protocols',value: String(summary.activeProtocols?.length ?? 0), color: 'text-gray-800' },
  ]
  return (
    <div className="card overflow-hidden">
      {/* Purple gradient header */}
      <div className="px-6 pt-5 pb-4" style={{ background: 'linear-gradient(135deg, #836EF9 0%, #6d28d9 100%)' }}>
        <p className="text-violet-200 text-xs font-medium uppercase tracking-wide mb-1">Total DeFi Value</p>
        <div className="flex items-end gap-3">
          <p className="font-display text-4xl font-bold text-white" style={{ fontFamily: 'Sora, sans-serif' }}>
            {fmtUSD(summary.netValueUSD ?? 0)}
          </p>
          {summary.totalDebtUSD > 0 && (
            <p className="text-violet-300 text-sm pb-1">after {fmtUSD(summary.totalDebtUSD)} debt</p>
          )}
        </div>
        {summary.activeProtocols?.length > 0 && (
          <p className="text-violet-300 text-xs mt-1">
            {summary.activeProtocols.join(' · ')}
          </p>
        )}
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100">
        {items.map((item, i) => (
          <div key={i} className="px-5 py-4">
            <p className="text-xs text-gray-400 mb-1">{item.label}</p>
            <p className={`font-bold text-base ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PROTOCOLS FOOTER ────────────────────────────────────────────────────────
const PROTOCOLS = [
  { name: 'Neverland',      url: 'https://app.neverland.money',      logo: '🌙' },
  { name: 'Morpho',         url: 'https://app.morpho.org',           logo: '🦋' },
  { name: 'Uniswap V3',     url: 'https://app.uniswap.org',          logo: '🦄' },
  { name: 'PancakeSwap V3', url: 'https://pancakeswap.finance',      logo: '🥞' },
  { name: 'Curve',          url: 'https://curve.fi/#/monad',         logo: '🌊' },
  { name: 'Gearbox',        url: 'https://app.gearbox.fi',           logo: '⚙️' },
  { name: 'Upshift',        url: 'https://app.upshift.finance',      logo: '🔺' },
  { name: 'Kintsu',         url: 'https://kintsu.xyz',               logo: '🔵' },
  { name: 'Magma',          url: 'https://magmastaking.xyz',         logo: '🐲' },
  { name: 'shMonad',        url: 'https://shmonad.xyz',              logo: '⚡' },
  { name: 'Lagoon',         url: 'https://app.lagoon.finance',       logo: '🏝️' },
  { name: 'Renzo',          url: 'https://app.renzoprotocol.com',    logo: '🔴' },
  { name: 'Kuru',           url: 'https://app.kuru.io',              logo: '🌀' },
  { name: 'Curvance',       url: 'https://monad.curvance.com',       logo: '💎' },
  { name: 'Euler V2',       url: 'https://app.euler.finance',        logo: '📐' },
  { name: 'Midas',          url: 'https://midas.app',                logo: '🏛️' },
]

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function DefiPage() {
  const { address, isConnected } = useAccount()
  const [data, setData]         = useState<any>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    if (!address) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/defi?address=${address}`)
      if (!res.ok) throw new Error('Failed to load positions')
      const json = await res.json()
      setData(json)
      setUpdatedAt(new Date())
    } catch (e: any) {
      setError(e.message ?? 'Unknown error')
    } finally { setLoading(false) }
  }, [address])

  useEffect(() => { if (isConnected && address) load() }, [isConnected, address, load])

  const positions  = data?.positions ?? []
  const summary    = data?.summary   ?? {}
  const lending    = positions.filter((p: any) => p.type === 'lending')
  const vaults     = positions.filter((p: any) => p.type === 'vault')
  const liquidity  = positions.filter((p: any) => p.type === 'liquidity')

  // ── Not connected ──
  if (!isConnected) {
    return (
      <div className="page-content max-w-4xl mx-auto px-4 py-8">
        <div className="card p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-4">
            <Zap className="text-violet-500" size={28} />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Connect your wallet</h2>
          <p className="text-gray-400 text-sm">Connect to view your DeFi positions across Monad protocols.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content max-w-6xl mx-auto px-4 py-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>
            DeFi Positions
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            16 protocols monitored on Monad
          </p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && !loading && (
            <span className="text-xs text-gray-400">
              {updatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="btn-primary flex items-center gap-2 text-sm py-2 px-4 disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* ── Summary banner ── */}
      {(data || loading) && (
        <div className="mb-6">
          <SummaryBanner summary={summary} loading={loading && !data} />
        </div>
      )}

      {/* ── Loading skeletons ── */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <CardSkeleton key={i} />)}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && data && positions.length === 0 && (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🌐</div>
          <h2 className="text-base font-bold text-gray-800 mb-1">No positions found</h2>
          <p className="text-gray-400 text-sm mb-6">
            Start using the protocols below to see your positions here.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {PROTOCOLS.map(p => (
              <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-100 bg-white hover:border-violet-300 hover:bg-violet-50 text-xs text-gray-600 hover:text-violet-700 transition-colors">
                {p.logo} {p.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ══ LENDING POSITIONS ══ */}
      {lending.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🏦</span>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Lending
            </h2>
            <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">
              {lending.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lending.map((pos: any, i: number) => <LendingCard key={i} pos={pos} />)}
          </div>
        </section>
      )}

      {/* ══ VAULT POSITIONS ══ */}
      {vaults.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🏺</span>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Vaults & Staking
            </h2>
            <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">
              {vaults.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {vaults.map((pos: any, i: number) => <VaultCard key={i} pos={pos} />)}
          </div>
        </section>
      )}

      {/* ══ LIQUIDITY POSITIONS ══ */}
      {liquidity.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">💧</span>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Liquidity Pools
            </h2>
            <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">
              {liquidity.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liquidity.map((pos: any, i: number) => <LiquidityCard key={i} pos={pos} />)}
          </div>
        </section>
      )}

      {/* ── Protocols footer ── */}
      {positions.length > 0 && (
        <div className="card p-4 mt-2">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">
            Supported Protocols
          </p>
          <div className="flex flex-wrap gap-2">
            {PROTOCOLS.map(p => (
              <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-100 bg-white hover:border-violet-300 hover:bg-violet-50 text-xs text-gray-500 hover:text-violet-700 transition-colors">
                {p.logo} {p.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
