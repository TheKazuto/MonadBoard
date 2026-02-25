'use client'

import { ReactNode } from 'react'
import { WalletContextProvider } from '@/contexts/WalletContext'
import { PortfolioProvider }     from '@/contexts/PortfolioContext'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletContextProvider>
      <PortfolioProvider>
        {children}
      </PortfolioProvider>
    </WalletContextProvider>
  )
}
