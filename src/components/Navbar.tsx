'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Wallet, BarChart3, History,
  User, Menu, X, Zap, LogOut, Copy, Check,
} from 'lucide-react'
import { useWallet } from '@/contexts/WalletContext'

const navLinks = [
  { href: '/',             label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/portfolio',    label: 'Portfolio',      icon: Wallet },
  { href: '/defi',         label: 'DeFi Positions', icon: BarChart3 },
  { href: '/transactions', label: 'Transactions',   icon: History },
  { href: '/account',      label: 'Account',        icon: User },
]

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function Navbar() {
  const pathname   = usePathname()
  const inputRef   = useRef<HTMLInputElement>(null)
  const dropRef    = useRef<HTMLDivElement>(null)

  const [mobileOpen, setMobileOpen] = useState(false)
  const [showDrop,   setShowDrop]   = useState(false)  // address input dropdown
  const [inputVal,   setInputVal]   = useState('')
  const [inputError, setInputError] = useState('')
  const [copied,     setCopied]     = useState(false)

  const { address, isConnected, connect, disconnect } = useWallet()

  // Auto-focus input when dropdown opens
  useEffect(() => {
    if (showDrop) setTimeout(() => inputRef.current?.focus(), 50)
  }, [showDrop])

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDrop(false)
        setInputVal('')
        setInputError('')
      }
    }
    if (showDrop) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showDrop])

  function handleConnect() {
    const trimmed = inputVal.trim()
    if (!trimmed) { setInputError('Enter a wallet address'); return }
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setInputError('Invalid address — must start with 0x and be 42 chars')
      return
    }
    connect(trimmed)
    setShowDrop(false)
    setInputVal('')
    setInputError('')
  }

  function handleDisconnect() {
    disconnect()
    setMobileOpen(false)
  }

  function handleCopy() {
    if (!address) return
    navigator.clipboard.writeText(address).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 glass border-b border-violet-100/60 h-16">
      <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-200">
            <Zap size={16} className="text-white" fill="white" />
          </div>
          <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, color: '#200052', fontSize: '1.125rem' }}>
            Monad<span style={{ color: '#836EF9' }}>Board</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive ? 'bg-violet-100 text-violet-700' : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50'
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            )
          })}
        </div>

        {/* Desktop wallet area */}
        <div className="hidden md:flex items-center gap-3">
          {isConnected && address ? (
            /* Connected: show address chip with copy + disconnect */
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-violet-200 bg-violet-50">
              <div className="status-dot" />
              <span className="text-violet-700 text-sm font-mono font-medium select-none">
                {shortenAddr(address)}
              </span>
              <button onClick={handleCopy}
                className="text-violet-400 hover:text-violet-700 transition-colors p-0.5 ml-0.5"
                title={copied ? 'Copied!' : 'Copy address'}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
              <div className="w-px h-4 bg-violet-200 mx-0.5" />
              <button onClick={handleDisconnect}
                className="text-violet-300 hover:text-red-500 transition-colors p-0.5"
                title="Disconnect">
                <LogOut size={12} />
              </button>
            </div>
          ) : (
            /* Not connected: button + dropdown input */
            <div className="relative" ref={dropRef}>
              <button
                onClick={() => setShowDrop(v => !v)}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <Wallet size={14} />
                Connect Wallet
              </button>

              {showDrop && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-violet-100 shadow-2xl shadow-violet-100/50 p-4 z-50">
                  <p className="text-sm font-semibold text-gray-800 mb-1">Enter your wallet address</p>
                  <p className="text-xs text-gray-400 mb-3">
                    Your address is saved locally — no need to re-enter it.
                  </p>
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputVal}
                    onChange={e => { setInputVal(e.target.value); setInputError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleConnect()}
                    placeholder="0x…"
                    className={`w-full text-xs px-3 py-2.5 rounded-xl border outline-none font-mono transition-colors ${
                      inputError
                        ? 'border-red-300 bg-red-50 text-red-700 placeholder-red-300'
                        : 'border-violet-200 text-gray-700 focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
                    }`}
                  />
                  {inputError && (
                    <p className="text-xs text-red-500 mt-1.5">{inputError}</p>
                  )}
                  <button
                    onClick={handleConnect}
                    className="w-full btn-primary text-sm mt-3"
                  >
                    Connect
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-violet-50 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 glass border-b border-violet-100/60 py-3 px-4 flex flex-col gap-1 shadow-xl z-50">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href
            return (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-violet-100 text-violet-700' : 'text-gray-600'
                }`}>
                <Icon size={16} />
                {label}
              </Link>
            )
          })}

          {/* Mobile wallet section */}
          <div className="mt-2 pt-2 border-t border-violet-100">
            {isConnected && address ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-violet-50 border border-violet-100">
                  <div className="flex items-center gap-2">
                    <div className="status-dot" />
                    <span className="text-violet-700 text-sm font-mono">{shortenAddr(address)}</span>
                  </div>
                  <button onClick={handleCopy} className="text-violet-400 hover:text-violet-700 p-1">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <button onClick={handleDisconnect}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-medium">
                  <LogOut size={14} />
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 px-1">Enter your wallet address</p>
                <input
                  type="text"
                  value={inputVal}
                  onChange={e => { setInputVal(e.target.value); setInputError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleConnect()}
                  placeholder="0x…"
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-violet-200 bg-white text-gray-700 font-mono outline-none focus:border-violet-400"
                />
                {inputError && <p className="text-xs text-red-500 px-1">{inputError}</p>}
                <button onClick={handleConnect} className="w-full btn-primary text-sm">
                  Connect Wallet
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
