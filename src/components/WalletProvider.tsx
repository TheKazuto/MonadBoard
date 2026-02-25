'use client'

import { ReactNode, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { defineChain } from 'viem'
import { RainbowKitProvider, getDefaultConfig, lightTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletContextProvider } from '@/contexts/WalletContext'
import { PortfolioProvider }     from '@/contexts/PortfolioContext'
import { TransactionProvider }   from '@/contexts/TransactionContext'
import { PreferencesProvider }   from '@/contexts/PreferencesContext'

import '@rainbow-me/rainbowkit/styles.css'

export const monadMainnet = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadExplorer', url: 'https://monadexplorer.com' },
  },
})

const wagmiConfig = getDefaultConfig({
  appName: 'MonBoard',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'monboard',
  chains: [monadMainnet],
  ssr: false,
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
  }))

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: '#836EF9',
            accentColorForeground: 'white',
            borderRadius: 'large',
            fontStack: 'system',
          })}
          locale="en-US"
        >
          <PreferencesProvider>
            <WalletContextProvider>
              <PortfolioProvider>
                <TransactionProvider>
                  {children}
                </TransactionProvider>
              </PortfolioProvider>
            </WalletContextProvider>
          </PreferencesProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
