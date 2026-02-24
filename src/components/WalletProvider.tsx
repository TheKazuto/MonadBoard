'use client'

import { ReactNode, useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { defineChain } from 'viem'
import { RainbowKitProvider, getDefaultConfig, lightTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

// Config criado fora do render mas com ssr: true para Next.js
const wagmiConfig = getDefaultConfig({
  appName: 'MonadBoard',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'monadboard-placeholder',
  chains: [monadMainnet],
  ssr: true, // essencial para Next.js — evita hydration mismatch
})

export function WalletProvider({ children }: { children: ReactNode }) {
  // QueryClient criado com useState para que cada sessão tenha a sua instância
  // Isso evita o estado compartilhado entre requisições no servidor
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 60s
        retry: 1,
      },
    },
  }))

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: '#836EF9',
            accentColorForeground: 'white',
            borderRadius: 'large',
            fontStack: 'system',
          })}
          locale="en-US"
          coolMode
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
