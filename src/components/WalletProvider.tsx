'use client'

import { ReactNode, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { defineChain } from 'viem'
import { RainbowKitProvider, getDefaultConfig, lightTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TransactionProvider } from '@/contexts/TransactionContext'

import '@rainbow-me/rainbowkit/styles.css'

export const monadMainnet = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://monadvision.com' },
  },
})

const wagmiConfig = getDefaultConfig({
  appName: 'MonadBoard',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'monadboard-placeholder',
  chains: [monadMainnet],
  ssr: false,
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: 1 },
    },
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
          {/* TransactionProvider inside so it has access to useAccount from Wagmi */}
          <TransactionProvider>
            {children}
          </TransactionProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
