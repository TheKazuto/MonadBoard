'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Wallet, BarChart3, History, User, Menu, X, Zap } from 'lucide-react'

const navLinks = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/defi', label: 'DeFi Positions', icon: BarChart3 },
  { href: '/transactions', label: 'Transactions', icon: History },
  { href: '/account', label: 'Account', icon: User },
]

export default function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [connected, setConnected] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 glass border-b border-violet-100/60 h-16">
      <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-200">
            <Zap size={16} className="text-white" fill="white" />
          </div>
          <span className="font-display font-700 text-lg" style={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, color: '#200052' }}>
            Monad<span style={{ color: '#836EF9' }}>Board</span>
          </span>
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-violet-100 text-violet-700'
                    : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50'
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            )
          })}
        </div>

        {/* Connect Wallet Button */}
        <div className="flex items-center gap-3">
          {connected ? (
            <button
              onClick={() => setConnected(false)}
              className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100 transition-all"
            >
              <div className="status-dot" />
              0x742d...8f3c
            </button>
          ) : (
            <button
              onClick={() => setConnected(true)}
              className="hidden md:block btn-primary text-sm"
            >
              Connect Wallet
            </button>
          )}

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-violet-50 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 glass border-b border-violet-100/60 py-3 px-4 flex flex-col gap-1 shadow-xl">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-violet-100 text-violet-700' : 'text-gray-600'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
          <div className="mt-2 pt-2 border-t border-violet-100">
            {connected ? (
              <button
                onClick={() => setConnected(false)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-medium"
              >
                <div className="status-dot" />
                0x742d...8f3c
              </button>
            ) : (
              <button
                onClick={() => setConnected(true)}
                className="w-full btn-primary text-sm"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
