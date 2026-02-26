'use client'

import { useEffect, useState } from 'react'
import { ArrowLeftRight, Info, ExternalLink } from 'lucide-react'

// ─── INTEGRATOR CONFIG ────────────────────────────────────────────────────────
// Replace with your own EVM wallet to receive swap fees automatically.
// Contact https://t.me/RubicPartnership to register crossChainIntegratorAddress.
const FEE_RECEIVER_ADDRESS = '0xYOUR_WALLET_ADDRESS_HERE'
const FEE_PERCENT = 0.5

declare global {
  interface Window {
    rubicWidget: { init: (config: object) => void }
  }
}

const WIDGET_CONFIG = {
  from:      'ETH',
  to:        'MON',
  fromChain: 'ETH',
  toChain:   'MONAD',
  amount:    0.01,
  iframe:    'true',
  theme:     'light',
  language:  'en',
  slippagePercent: { instantTrades: 1, crossChain: 2 },
  fee:       FEE_PERCENT,
  feeTarget: FEE_RECEIVER_ADDRESS,
  crossChainIntegratorAddress: FEE_RECEIVER_ADDRESS,
  onChainIntegratorAddress:    FEE_RECEIVER_ADDRESS,
}

const RUBIC_SCRIPT_URL = 'https://new-widgets.rubic.exchange/iframe/bundle.new-app.min.js'
const SCRIPT_ID = 'rubic-widget-script'

export default function SwapPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    // If script already loaded from a previous visit, just re-init
    if (window.rubicWidget) {
      window.rubicWidget.init(WIDGET_CONFIG)
      setStatus('ready')
      return
    }

    // Remove any stale script tag
    const existing = document.getElementById(SCRIPT_ID)
    if (existing) existing.remove()

    const script = document.createElement('script')
    script.id   = SCRIPT_ID
    script.src  = RUBIC_SCRIPT_URL
    script.type = 'text/javascript'

    script.onload = () => {
      // Poll until rubicWidget is available on window
      const tryInit = (attempts = 0) => {
        if (window.rubicWidget) {
          window.rubicWidget.init(WIDGET_CONFIG)
          setStatus('ready')
        } else if (attempts < 20) {
          setTimeout(() => tryInit(attempts + 1), 150)
        } else {
          setStatus('error')
        }
      }
      tryInit()
    }

    script.onerror = () => setStatus('error')
    document.head.appendChild(script)
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-200">
            <ArrowLeftRight size={17} className="text-white" />
          </div>
          <h1 className="font-bold text-2xl text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>
            Swap
          </h1>
        </div>
        <p className="text-sm text-gray-500 ml-12">
          Cross-chain swaps across 100+ blockchains · Best rate from 360+ DEXes &amp; bridges
        </p>
      </div>

      {/* Info banner */}
      <div className="mb-5 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-violet-50 border border-violet-100 text-sm text-violet-700">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span>
          Swaps execute directly on-chain — MonBoard never holds your funds.
          Rates are aggregated in real time from the best available routes.
        </span>
      </div>

      {/* Widget area */}
      <div className="card overflow-hidden relative">
        {/* Rubic injects into this div — must always be present in the DOM */}
        <div id="rubic-widget-root" style={{ minHeight: 560 }} />

        {/* Loading overlay */}
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/80 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin" />
            <span className="text-sm text-gray-400">Loading swap widget…</span>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-gray-500">Could not load the swap widget.</p>
            <a
              href="https://app.rubic.exchange"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              Open Rubic directly <ExternalLink size={13} />
            </a>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
        <span>
          Powered by{' '}
          <a href="https://rubic.exchange" target="_blank" rel="noopener noreferrer"
            className="text-violet-500 hover:text-violet-700 inline-flex items-center gap-0.5">
            Rubic Exchange <ExternalLink size={10} />
          </a>
        </span>
        <span>100+ chains · 360+ DEXes &amp; bridges</span>
      </div>
    </div>
  )
}
