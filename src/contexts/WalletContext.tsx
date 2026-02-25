'use client'

/**
 * WalletContext — thin bridge over wagmi useAccount.
 * All components use useWallet() — never import useAccount directly.
 */

import { createContext, useContext, ReactNode } from 'react'
import { useAccount, useDisconnect } from 'wagmi'

interface WalletContextValue {
  address:     string | null
  isConnected: boolean
  disconnect:  () => void
}

const WalletContext = createContext<WalletContextValue>({
  address:     null,
  isConnected: false,
  disconnect:  () => {},
})

export function useWallet() {
  return useContext(WalletContext)
}

export function WalletContextProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  return (
    <WalletContext.Provider value={{
      address:     address ?? null,
      isConnected: isConnected && !!address,
      disconnect,
    }}>
      {children}
    </WalletContext.Provider>
  )
}
