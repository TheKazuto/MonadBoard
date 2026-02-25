'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtUSD(n: number): string {
  if (n === 0) return '$0.00'
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}
function fmtPct(n: number): string {
  return n !== null && n !== undefined ? `${n.toFixed(2)}%` : '—'
}
function hfColor(hf: number | null): string {
  if (hf === null || hf === undefined) return 'text-slate-400'
  if (hf >= 3)   return 'text-emerald-400'
  if (hf >= 1.5) return 'text-green-400'
  if (hf >= 1.1) return 'text-yellow-400'
  return 'text-red-400'
}
function hfLabel(hf: number | null): string {
  if (hf === null || hf === undefined) return ''
  if (hf >= 999) return 'Safe ∞'
  if (hf >= 3)   return `${hf.toFixed(2)} Safe`
  if (hf >= 1.5) return `${hf.toFixed(2)} Healthy`
  if (hf >= 1.1) return `${hf.toFixed(2)} Caution`
  return `${hf.toFixed(2)} At Risk`
}
function hfBg(hf: number | null): string {
  if (hf === null || hf === undefined) return 'bg-slate-800 border-slate-700'
  if (hf >= 3)   return 'bg-emerald-900/30 border-emerald-600'
  if (hf >= 1.5) return 'bg-green-900/30 border-green-600'
  if (hf >= 1.1) return 'bg-yellow-900/30 border-yellow-600'
  return 'bg-red-900/30 border-red-600'
}

// ─── Components ───────────────────────────────────────────────────────────────

function ApyBadge({ apy, label }: { apy: number | null; label?: string }) {
  if (!apy || apy <= 0) return null
  return (
    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-violet-900/40 text-violet-300 border border-violet-700 font-medium">
      {label ?? 'APY'} {fmtPct(apy)}
    </span>
  )
}

function AprBadge({ apr }: { apr: number | null }) {
  if (!apr || apr <= 0) return null
  return (
    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-orange-900/40 text-orange-300 border border-orange-700 font-medium">
      APR {fmtPct(apr)}
    </span>
  )
}

function RangeBadge({ inRange }: { inRange: boolean | null }) {
  if (inRange === null || inRange === undefined) return null
  return inRange ? (
    <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-700 font-medium">
      ✓ In Range
    </span>
  ) : (
    <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/40 text-red-300 border border-red-700 font-medium">
      ✗ Out of Range
    </span>
  )
}

// ─── Card: Lending (supply + borrow) ─────────────────────────────────────────
function LendingCard({ pos }: { pos: any }) {
  const hasDebt = pos.totalDebtUSD > 0.01
  const hasCollateral = pos.totalCollateralUSD > 0.01
  const supplyItems = [...(pos.supply ?? []), ...(pos.collateral ?? [])]

  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-2xl overflow-hidden shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#2a2a4a]">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{pos.logo}</span>
          <div>
            <div className="font-bold text-white text-base">{pos.protocol}</div>
            {pos.label && <div className="text-slate-400 text-xs">{pos.label}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pos.healthFactor !== null && pos.healthFactor !== undefined && (
            <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${hfBg(pos.healthFactor)} ${hfColor(pos.healthFactor)}`}>
              {hfLabel(pos.healthFactor)}
            </span>
          )}
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-900/40 text-blue-300 border border-blue-700">
            Lending
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Supply / Collateral */}
        {hasCollateral && (
          <div className="rounded-xl bg-emerald-950/30 border border-emerald-800/50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wide">Supplied / Collateral</span>
              <span className="text-emerald-300 font-bold text-sm">{fmtUSD(pos.totalCollateralUSD)}</span>
            </div>
            {supplyItems.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm py-0.5">
                <div className="flex items-center gap-1">
                  <span className="text-emerald-200 font-medium">{s.symbol}</span>
                  {s.apy > 0 && <ApyBadge apy={s.apy} />}
                </div>
                <span className="text-slate-300">
                  {s.amountUSD ? fmtUSD(s.amountUSD) : s.amount ? s.amount.toFixed(4) : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Borrow */}
        {hasDebt && (
          <div className="rounded-xl bg-red-950/30 border border-red-800/50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-red-400 font-semibold uppercase tracking-wide">Borrowed</span>
              <span className="text-red-300 font-bold text-sm">{fmtUSD(pos.totalDebtUSD)}</span>
            </div>
            {(pos.borrow ?? []).map((b: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm py-0.5">
                <div className="flex items-center gap-1">
                  <span className="text-red-200 font-medium">{b.symbol}</span>
                  {b.apr > 0 && <AprBadge apr={b.apr} />}
                </div>
                <span className="text-slate-300">
                  {b.amountUSD ? fmtUSD(b.amountUSD) : b.amount ? b.amount.toFixed(4) : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Net */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-slate-400 text-sm">Net Value</span>
          <span className={`font-bold text-base ${pos.netValueUSD >= 0 ? 'text-white' : 'text-red-400'}`}>
            {fmtUSD(pos.netValueUSD)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Card: Vault ─────────────────────────────────────────────────────────────
function VaultCard({ pos }: { pos: any }) {
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-2xl overflow-hidden shadow-xl">
      <div className="flex items-center justify-between p-4 border-b border-[#2a2a4a]">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{pos.logo}</span>
          <div>
            <div className="font-bold text-white text-base">{pos.protocol}</div>
            <div className="text-slate-400 text-xs">{pos.label}</div>
          </div>
        </div>
        <span className="px-2 py-0.5 text-xs rounded-full bg-violet-900/40 text-violet-300 border border-violet-700">
          Vault
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-slate-400 text-xs mb-1">{pos.asset ?? ''}</div>
            <div className="text-2xl font-bold text-white">{fmtUSD(pos.amountUSD ?? 0)}</div>
          </div>
          <ApyBadge apy={pos.apy} />
        </div>
        {pos.amount && (
          <div className="mt-2 text-slate-400 text-sm">{pos.amount.toFixed(4)} {pos.asset}</div>
        )}
      </div>
    </div>
  )
}

// ─── Card: Liquidity (LP) ─────────────────────────────────────────────────────
function LiquidityCard({ pos }: { pos: any }) {
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-2xl overflow-hidden shadow-xl">
      <div className="flex items-center justify-between p-4 border-b border-[#2a2a4a]">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{pos.logo}</span>
          <div>
            <div className="font-bold text-white text-base">{pos.protocol}</div>
            <div className="text-slate-400 text-xs">{pos.label}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RangeBadge inRange={pos.inRange} />
          <span className="px-2 py-0.5 text-xs rounded-full bg-cyan-900/40 text-cyan-300 border border-cyan-700">
            Liquidity
          </span>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-white">
              {pos.amountUSD > 0 ? fmtUSD(pos.amountUSD) : '—'}
            </div>
            {pos.tokens && pos.tokens.length > 0 && (
              <div className="flex gap-1 mt-2">
                {pos.tokens.map((t: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <ApyBadge apy={pos.apy ?? pos.feeApr} label={pos.feeApr ? 'Fee APR' : 'APY'} />
        </div>
        {/* Range ticks for Uniswap V3 */}
        {pos.tickLower !== undefined && pos.currentTick !== undefined && (
          <div className="mt-3 text-xs text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Tick Range</span>
              <span>{pos.tickLower.toLocaleString()} → {pos.tickUpper.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Current Tick</span>
              <span className={pos.inRange ? 'text-emerald-400' : 'text-red-400'}>{pos.currentTick.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-2xl p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-slate-700" />
        <div className="space-y-2">
          <div className="h-4 w-24 rounded bg-slate-700" />
          <div className="h-3 w-16 rounded bg-slate-800" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-20 rounded-xl bg-slate-800" />
        <div className="h-12 rounded-xl bg-slate-800" />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DefiPage() {
  const { address, isConnected } = useAccount()
  const [data, setData]   = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]  = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    if (!address) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/defi?address=${address}`)
      if (!res.ok) throw new Error('API error')
      const json = await res.json()
      setData(json)
      setUpdatedAt(new Date())
    } catch (e: any) {
      setError(e.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => { if (isConnected && address) load() }, [isConnected, address, load])

  const positions: any[] = data?.positions ?? []
  const summary: any = data?.summary ?? {}

  const lendingPos   = positions.filter(p => p.type === 'lending')
  const vaultPos     = positions.filter(p => p.type === 'vault')
  const liquidityPos = positions.filter(p => p.type === 'liquidity')

  const protocols = [
    { name: 'Neverland',   url: 'https://app.neverland.money',    logo: '🌙' },
    { name: 'Morpho',      url: 'https://app.morpho.org',         logo: '🦋' },
    { name: 'Uniswap V3',  url: 'https://app.uniswap.org',        logo: '🦄' },
    { name: 'Curve',       url: 'https://curve.fi/#/monad',       logo: '🌊' },
    { name: 'Gearbox',     url: 'https://app.gearbox.fi',         logo: '⚙️' },
    { name: 'Upshift',     url: 'https://app.upshift.finance',    logo: '🔺' },
    { name: 'shMonad',     url: 'https://shmonad.xyz',            logo: '⚡' },
    { name: 'Curvance',    url: 'https://monad.curvance.com',     logo: '💎' },
    { name: 'Euler',       url: 'https://app.euler.finance',      logo: '📐' },
    { name: 'Midas',       url: 'https://midas.app',              logo: '🏛️' },
  ]

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">DeFi Positions</h1>
            <p className="text-slate-400 text-sm mt-1">
              All your positions across 10 Monad protocols
            </p>
          </div>
          <div className="flex items-center gap-3">
            {updatedAt && !loading && (
              <span className="text-slate-500 text-xs">
                Updated {updatedAt.toLocaleTimeString()}
              </span>
            )}
            {isConnected && (
              <button
                onClick={load} disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                )}
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            )}
          </div>
        </div>

        {/* ── Not Connected ─────────────────────────────────────────────── */}
        {!isConnected && (
          <div className="rounded-2xl bg-[#1a1a2e] border border-[#2a2a4a] p-12 text-center">
            <div className="text-5xl mb-4">🔗</div>
            <h2 className="text-xl font-bold text-white mb-2">Connect your wallet</h2>
            <p className="text-slate-400">Connect to see your DeFi positions across Monad protocols.</p>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-xl bg-red-900/20 border border-red-700 p-4 text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* ══ TOTAL VALUE BANNER ══════════════════════════════════════════ */}
        {isConnected && (data || loading) && (
          <div className="rounded-2xl bg-gradient-to-br from-[#1a1a3e] to-[#0d0d2e] border border-violet-800/50 p-6 shadow-2xl">
            {loading && !data ? (
              <div className="animate-pulse space-y-3">
                <div className="h-6 w-32 bg-slate-700 rounded" />
                <div className="h-12 w-48 bg-slate-700 rounded" />
                <div className="grid grid-cols-3 gap-4 mt-4">
                  {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-800 rounded-xl" />)}
                </div>
              </div>
            ) : data && (
              <>
                <div className="text-slate-400 text-sm font-medium mb-1 uppercase tracking-wide">Total DeFi Value</div>
                <div className="flex items-end gap-4 mb-6">
                  <div className={`text-5xl font-bold ${summary.netValueUSD >= 0 ? 'text-white' : 'text-red-400'}`}>
                    {fmtUSD(summary.netValueUSD ?? 0)}
                  </div>
                  {summary.totalDebtUSD > 0 && (
                    <div className="text-slate-500 text-sm pb-2">
                      after {fmtUSD(summary.totalDebtUSD)} debt
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-[#1a1a2e]/80 border border-[#2a2a4a] p-4">
                    <div className="text-slate-400 text-xs mb-1">Total Supplied</div>
                    <div className="text-emerald-300 font-bold text-lg">{fmtUSD(summary.totalSupplyUSD ?? 0)}</div>
                  </div>
                  <div className="rounded-xl bg-[#1a1a2e]/80 border border-[#2a2a4a] p-4">
                    <div className="text-slate-400 text-xs mb-1">Total Borrowed</div>
                    <div className={`font-bold text-lg ${summary.totalDebtUSD > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                      {fmtUSD(summary.totalDebtUSD ?? 0)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#1a1a2e]/80 border border-[#2a2a4a] p-4">
                    <div className="text-slate-400 text-xs mb-1">Net Value</div>
                    <div className="text-white font-bold text-lg">{fmtUSD(summary.netValueUSD ?? 0)}</div>
                  </div>
                  <div className="rounded-xl bg-[#1a1a2e]/80 border border-[#2a2a4a] p-4">
                    <div className="text-slate-400 text-xs mb-1">Active Protocols</div>
                    <div className="text-violet-300 font-bold text-lg">{summary.activeProtocols?.length ?? 0}</div>
                    {summary.activeProtocols?.length > 0 && (
                      <div className="text-slate-500 text-xs mt-1 truncate">
                        {summary.activeProtocols.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Loading skeletons ─────────────────────────────────────────── */}
        {loading && !data && isConnected && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {isConnected && !loading && data && positions.length === 0 && (
          <div className="rounded-2xl bg-[#1a1a2e] border border-[#2a2a4a] p-10 text-center">
            <div className="text-4xl mb-4">🌐</div>
            <h2 className="text-lg font-bold text-white mb-2">No DeFi positions found</h2>
            <p className="text-slate-400 text-sm mb-6">Start using these protocols to see your positions here.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              {protocols.map(p => (
                <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d0d1a] border border-[#2a2a4a] hover:border-violet-600 text-sm text-slate-300 hover:text-white transition-colors">
                  {p.logo} {p.name}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ══ LENDING POSITIONS ══════════════════════════════════════════ */}
        {lendingPos.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span>🏦</span> Lending Positions
              <span className="text-slate-500 font-normal text-sm">({lendingPos.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lendingPos.map((pos, i) => <LendingCard key={i} pos={pos} />)}
            </div>
          </section>
        )}

        {/* ══ VAULT POSITIONS ════════════════════════════════════════════ */}
        {vaultPos.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span>🏺</span> Vault Positions
              <span className="text-slate-500 font-normal text-sm">({vaultPos.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {vaultPos.map((pos, i) => <VaultCard key={i} pos={pos} />)}
            </div>
          </section>
        )}

        {/* ══ LIQUIDITY POSITIONS ════════════════════════════════════════ */}
        {liquidityPos.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span>💧</span> Liquidity Positions
              <span className="text-slate-500 font-normal text-sm">({liquidityPos.length})</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liquidityPos.map((pos, i) => <LiquidityCard key={i} pos={pos} />)}
            </div>
          </section>
        )}

        {/* ── Supported Protocols footer ────────────────────────────────── */}
        {isConnected && (
          <div className="rounded-2xl bg-[#1a1a2e]/50 border border-[#2a2a4a]/50 p-4">
            <div className="text-slate-500 text-xs mb-3 font-medium uppercase tracking-wide">Supported Protocols on Monad</div>
            <div className="flex flex-wrap gap-2">
              {protocols.map(p => (
                <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d0d1a] border border-[#2a2a4a] hover:border-violet-600 text-xs text-slate-400 hover:text-white transition-colors">
                  {p.logo} {p.name}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
