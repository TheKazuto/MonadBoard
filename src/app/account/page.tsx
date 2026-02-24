'use client'

import { useState } from 'react'
import { mockWalletData, mockNFTs, formatCurrency, shortenAddress } from '@/lib/mockData'
import { User, Copy, ExternalLink, Shield, Bell, Wallet, CheckCircle, Lock } from 'lucide-react'

export default function AccountPage() {
  const [copied, setCopied] = useState(false)
  const hasNFT = false // Toggle to true when user holds NFT

  const handleCopy = () => {
    navigator.clipboard.writeText('0x742d35cc6634c0532925a3b844bc454e4438f44e')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>
          Account
        </h1>
        <p className="text-gray-500 text-sm mt-1">Manage your profile and preferences</p>
      </div>

      {/* Wallet Card */}
      <div className="card p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #836EF9 0%, #6d28d9 100%)' }}>
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, white, transparent)', transform: 'translate(30%, -40%)' }} />
        <div className="flex items-start gap-4 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
            <User size={28} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-white font-display font-bold text-lg" style={{ fontFamily: 'Sora, sans-serif' }}>My Wallet</p>
              {hasNFT && (
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold">
                  ⭐ NFT Holder
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-violet-200 text-sm font-mono">0x742d35cc...f44e</p>
              <button onClick={handleCopy} className="text-violet-200 hover:text-white transition-colors">
                {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
              </button>
              <a href="https://monad.xyz/address/0x742d..." target="_blank" rel="noopener noreferrer" className="text-violet-200 hover:text-white transition-colors">
                <ExternalLink size={14} />
              </a>
            </div>
            <p className="text-violet-200 text-sm mt-2">Portfolio: <span className="text-white font-bold">{formatCurrency(mockWalletData.totalValueUSD)}</span></p>
          </div>
        </div>
      </div>

      {/* NFT Access Status */}
      <div className={`card p-5 border-2 ${hasNFT ? 'border-emerald-200 bg-emerald-50/30' : 'border-violet-200'}`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${hasNFT ? 'bg-emerald-100' : 'bg-violet-100'}`}>
            {hasNFT ? <Shield size={22} className="text-emerald-600" /> : <Lock size={22} className="text-violet-500" />}
          </div>
          <div className="flex-1">
            <h3 className="font-display font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>
              {hasNFT ? '✅ Premium Access Unlocked' : 'MonadBoard NFT Access'}
            </h3>
            {hasNFT ? (
              <p className="text-sm text-emerald-700 mt-1">You hold a MonadBoard NFT and have access to all premium features including Telegram alerts and wallet monitoring.</p>
            ) : (
              <>
                <p className="text-sm text-gray-500 mt-1 mb-3">Hold a MonadBoard NFT to unlock premium features:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                  {[
                    { icon: '🔔', text: 'Real-time Telegram alerts' },
                    { icon: '👁️', text: 'Monitor other wallets' },
                    { icon: '📊', text: 'Advanced analytics' },
                    { icon: '⚡', text: 'Priority support' },
                  ].map(f => (
                    <div key={f.text} className="flex items-center gap-2 text-sm text-gray-600">
                      <span>{f.icon}</span>
                      {f.text}
                    </div>
                  ))}
                </div>
                <button className="btn-primary text-sm px-5">
                  Get MonadBoard NFT — Coming Soon
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="card p-5">
        <h2 className="font-display font-semibold text-gray-800 mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>Preferences</h2>
        <div className="space-y-4">
          {[
            { label: 'Currency Display', desc: 'Show values in USD', value: 'USD', type: 'select', options: ['USD', 'EUR', 'BRL'] },
            { label: 'Default Time Range', desc: 'Chart history default', value: '30d', type: 'select', options: ['7d', '30d', '90d', '1y'] },
          ].map(pref => (
            <div key={pref.label} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">{pref.label}</p>
                <p className="text-xs text-gray-400">{pref.desc}</p>
              </div>
              <select className="text-sm border border-violet-100 rounded-lg px-3 py-1.5 text-gray-700 bg-violet-50/30 focus:outline-none focus:border-violet-300">
                {pref.options.map(opt => (
                  <option key={opt} value={opt} selected={opt === pref.value}>{opt}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* About */}
      <div className="card p-5">
        <h2 className="font-display font-semibold text-gray-800 mb-3" style={{ fontFamily: 'Sora, sans-serif' }}>About MonadBoard</h2>
        <p className="text-sm text-gray-500 mb-3">
          MonadBoard is the premier portfolio dashboard for the Monad ecosystem. Track your assets, DeFi positions, and NFTs in one place.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Version', value: '0.1.0 (Beta)' },
            { label: 'Network', value: 'Monad Mainnet' },
            { label: 'RPC', value: 'monad.xyz' },
          ].map(info => (
            <div key={info.label} className="flex-1 min-w-[100px] bg-violet-50 rounded-lg p-3">
              <p className="text-xs text-gray-400">{info.label}</p>
              <p className="text-sm font-semibold text-gray-700">{info.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Disconnect */}
      <button className="w-full py-3 rounded-xl border-2 border-red-100 text-red-500 text-sm font-medium hover:bg-red-50 transition-colors">
        Disconnect Wallet
      </button>
    </div>
  )
}
