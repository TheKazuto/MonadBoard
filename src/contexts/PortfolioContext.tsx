'use client'

/**
 * PortfolioContext — single source of truth for portfolio totals.
 *
 * Fires 3 API calls in parallel the moment a wallet is connected.
 * Components (WalletSummary, TokenExposure, DeFi page, etc.) can read
 * the cached totals without re-fetching.
 */

import {
  createContext, useContext, useState,
  useEffect, useCallback, useRef, ReactNode,
} from 'react'
import { useWallet } from './WalletContext'

export interface PortfolioTotals {
  tokenValueUSD:       number
  nftValueUSD:         number
  defiNetValueUSD:     number
  totalValueUSD:       number
  defiActiveProtocols: string[]
  defiTotalDebtUSD:    number
  defiTotalSupplyUSD:  number
}

export type LoadStatus = 'idle' | 'loading' | 'partial' | 'done' | 'error'

interface PortfolioContextValue {
  totals:      PortfolioTotals
  status:      LoadStatus
  lastUpdated: Date | null
  refresh:     () => void
}

const ZERO: PortfolioTotals = {
  tokenValueUSD:       0,
  nftValueUSD:         0,
  defiNetValueUSD:     0,
  totalValueUSD:       0,
  defiActiveProtocols: [],
  defiTotalDebtUSD:    0,
  defiTotalSupplyUSD:  0,
}

const PortfolioCtx = createContext<PortfolioContextValue>({
  totals:      ZERO,
  status:      'idle',
  lastUpdated: null,
  refresh:     () => {},
})

export function usePortfolio() {
  return useContext(PortfolioCtx)
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useWallet()

  const [totals,      setTotals]      = useState<PortfolioTotals>(ZERO)
  const [status,      setStatus]      = useState<LoadStatus>('idle')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const tokenRef = useRef(0)
  const nftRef   = useRef(0)
  const defiRef  = useRef<Partial<PortfolioTotals>>({})

  const flush = useCallback(() => {
    const t = tokenRef.current
    const n = nftRef.current
    const d = defiRef.current.defiNetValueUSD ?? 0
    setTotals({
      tokenValueUSD:       t,
      nftValueUSD:         n,
      defiNetValueUSD:     d,
      totalValueUSD:       t + n + d,
      defiActiveProtocols: defiRef.current.defiActiveProtocols ?? [],
      defiTotalDebtUSD:    defiRef.current.defiTotalDebtUSD    ?? 0,
      defiTotalSupplyUSD:  defiRef.current.defiTotalSupplyUSD  ?? 0,
    })
  }, [])

  const load = useCallback(async (addr: string) => {
    tokenRef.current = 0
    nftRef.current   = 0
    defiRef.current  = {}
    setTotals(ZERO)
    setStatus('loading')

    const fetchTokens = async () => {
      try {
        const res  = await fetch(`/api/token-exposure?address=${addr}`)
        if (!res.ok) return
        const data = await res.json()
        tokenRef.current = Number(data.totalValue ?? 0)
        flush()
        setStatus(s => s === 'loading' ? 'partial' : s)
      } catch { /* keeps 0 */ }
    }

    const fetchNFTs = async () => {
      try {
        const res  = await fetch(`/api/nfts?address=${addr}`)
        if (!res.ok) return
        const data = await res.json()
        nftRef.current = Number(data.nftValue ?? 0)
        flush()
        setStatus(s => s === 'loading' ? 'partial' : s)
      } catch { /* keeps 0 */ }
    }

    const fetchDefi = async () => {
      try {
        const res  = await fetch(`/api/defi?address=${addr}`)
        if (!res.ok) return
        const data = await res.json()
        const s    = data.summary ?? {}
        defiRef.current = {
          defiNetValueUSD:     Number(s.netValueUSD     ?? 0),
          defiTotalDebtUSD:    Number(s.totalDebtUSD    ?? 0),
          defiTotalSupplyUSD:  Number(s.totalSupplyUSD  ?? 0),
          defiActiveProtocols: Array.isArray(s.activeProtocols) ? s.activeProtocols : [],
        }
        flush()
        setStatus(s2 => s2 === 'loading' ? 'partial' : s2)
      } catch { /* keeps 0 */ }
    }

    await Promise.allSettled([fetchTokens(), fetchNFTs(), fetchDefi()])
    flush()
    setStatus('done')
    setLastUpdated(new Date())
  }, [flush])

  useEffect(() => {
    if (isConnected && address) {
      load(address)
    } else {
      tokenRef.current = 0
      nftRef.current   = 0
      defiRef.current  = {}
      setTotals(ZERO)
      setStatus('idle')
      setLastUpdated(null)
    }
  }, [address, isConnected, load])

  const refresh = useCallback(() => {
    if (address && isConnected) load(address)
  }, [address, isConnected, load])

  return (
    <PortfolioCtx.Provider value={{ totals, status, lastUpdated, refresh }}>
      {children}
    </PortfolioCtx.Provider>
  )
}
