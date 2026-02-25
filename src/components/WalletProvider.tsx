'use client'

import { ReactNode } from 'react'
import { WalletContextProvider } from '@/contexts/WalletContext'
import { PortfolioProvider }     from '@/contexts/PortfolioContext'
import { TransactionProvider }   from '@/contexts/TransactionContext'

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WalletContextProvider>
      <PortfolioProvider>
        <TransactionProvider>
          {children}
        </TransactionProvider>
      </PortfolioProvider>
    </WalletContextProvider>
  )
}
