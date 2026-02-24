import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import BottomBar from '@/components/BottomBar'

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: 'var(--monad-bg)' }}>
        <Navbar />
        <main className="page-content pt-16">
          {children}
        </main>
        <BottomBar />
      </body>
    </html>
  )
}
