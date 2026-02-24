'use client'

import { useState, useEffect, useCallback } from 'react'

interface MonadPrice {
  price: number
  change24h: number
  loading: boolean
  error: boolean
  lastUpdated: Date | null
}

export function useMonadPrice(refreshInterval = 30000): MonadPrice {
  const [data, setData] = useState<MonadPrice>({
    price: 0,
    change24h: 0,
    loading: true,
    error: false,
    lastUpdated: null,
  })

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd&include_24hr_change=true',
        { cache: 'no-store' }
      )
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      const token = json['monad']
      if (!token) throw new Error('not found')
      setData({
        price: token.usd,
        change24h: token.usd_24h_change,
        loading: false,
        error: false,
        lastUpdated: new Date(),
      })
    } catch {
      setData(prev => ({ ...prev, loading: false, error: true }))
    }
  }, [])

  useEffect(() => {
    fetchPrice()
    const interval = setInterval(fetchPrice, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchPrice, refreshInterval])

  return data
}
