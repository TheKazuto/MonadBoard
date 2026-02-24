'use client'

import dynamic from 'next/dynamic'
import { ReactNode, useState, useEffect } from 'react'

// Carrega WalletProvider, Navbar e BottomBar APENAS no client
// Isso evita completamente o erro #425 (useLayoutEffect no servidor)
// que é causado internamente pelo RainbowKit e Wagmi
const WalletProviderDynamic = dynamic(
  () => import('@/components/WalletProvider').then(m => m.WalletProvider),
  { ssr: false }
)

const NavbarDynamic = dynamic(
  () => import('@/components/Navbar'),
  {
    ssr: false,
    loading: () => (
      <nav className="fixed top-0 left-0 right-0 z-40 h-16 border-b border-violet-100/60"
           style={{ background: 'rgba(251,250,255,0.85)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700" />
            <div className="w-28 h-5 rounded bg-violet-100 animate-pulse hidden sm:block" />
          </div>
          <div className="w-36 h-10 rounded-xl bg-violet-100 animate-pulse" />
        </div>
      </nav>
    ),
  }
)

const BottomBarDynamic = dynamic(
  () => import('@/components/BottomBar'),
  { ssr: false }
)

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <WalletProviderDynamic>
      <NavbarDynamic />
      <main className="page-content pt-16">
        {children}
      </main>
      <BottomBarDynamic />
    </WalletProviderDynamic>
  )
}
