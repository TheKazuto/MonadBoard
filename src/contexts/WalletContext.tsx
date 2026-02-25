'use client'

/**
 * WalletContext — persistent wallet connection via localStorage.
 *
 * The user enters their address once; it is saved to localStorage
 * and restored on every page load. No wallet extension required.
 *
 * Drop-in replacement: swap useWallet() → useAccount() from wagmi
 * once RainbowKit providers are wired up.
 */

import {
  createContext, useContext, useState, useCallback,
  useEffect, ReactNode,
} from 'react'

const STORAGE_KEY = 'monadboard_wallet'

interface WalletContextValue {
  address:     string | null
  isConnected: boolean
  connect:     (address: string) => void
  disconnect:  () => void
}

const WalletContext = createContext<WalletContextValue>({
  address:     null,
  isConnected: false,
  connect:     () => {},
  disconnect:  () => {},
})

export function useWallet() {
  return useContext(WalletContext)
}

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && /^0x[a-fA-F0-9]{40}$/.test(saved)) {
        setAddress(saved)
      }
    } catch { /* SSR / private mode */ }
  }, [])

  const connect = useCallback((addr: string) => {
    setAddress(addr)
    try { localStorage.setItem(STORAGE_KEY, addr) } catch { /* ignore */ }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  return (
    <WalletContext.Provider value={{
      address,
      isConnected: !!address,
      connect,
      disconnect,
    }}>
      {children}
    </WalletContext.Provider>
  )
}
