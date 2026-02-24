import type { Metadata } from 'next'
import './globals.css'
import { ClientProviders } from '@/components/ClientProviders'

export const metadata: Metadata = {
  title: 'MonadBoard — Your Monad Portfolio Dashboard',
  description: 'The ultimate dashboard for Monad ecosystem. Track your portfolio, DeFi positions, NFTs and get real-time alerts.',
  keywords: ['monad', 'blockchain', 'portfolio', 'defi', 'nft', 'dashboard'],
  openGraph: {
    title: 'MonadBoard',
    description: 'Your Monad Portfolio Dashboard',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning style={{ background: 'var(--monad-bg)' }}>
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  )
}
