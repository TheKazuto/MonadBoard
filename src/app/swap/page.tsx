'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Info, ExternalLink } from 'lucide-react'

// ─── INTEGRATOR CONFIG ────────────────────────────────────────────────────────
// IMPORTANT: Replace FEE_RECEIVER_ADDRESS with your own EVM wallet address.
// This is where your swap fees will be sent automatically.
//
// FEE: 0.5% charged on every swap (on-chain and cross-chain).
// To register as official cross-chain integrator and unlock higher fee share,
// contact Rubic BD: https://t.me/RubicPartnership
//
const FEE_RECEIVER_ADDRESS = '0xYOUR_WALLET_ADDRESS_HERE'  // ← replace this
const FEE_PERCENT          = 0.5  // 0.5% per swap

declare global {
  interface Window {
    rubicWidget: { init: (config: object) => void }
  }
}

export default function SwapPage() {
  const scriptRef   = useRef<HTMLScriptElement | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Load Rubic widget script once
    if (scriptRef.current) return

    const script = document.createElement('script')
    script.src   = 'https://widgets.rubic.exchange/rubic-widget.js'
    script.defer = true
    script.onload = () => {
      initWidget()
      setReady(true)
    }
    document.head.appendChild(script)
    scriptRef.current = script

    return () => {
      // cleanup on unmount
      if (scriptRef.current) {
        document.head.removeChild(scriptRef.current)
        scriptRef.current = null
      }
    }
  }, [])

  function initWidget() {
    if (!window.rubicWidget) return

    const config = {
      // Default: cross-chain from ETH to MON on Monad
      from:      'ETH',
      to:        'MON',
      fromChain: 'ETH',
      toChain:   'MONAD',
      amount:    0.01,

      // Widget layout
      iframe:        'flex',   // responsive: vertical < 1180px, horizontal otherwise
      useLargeIframe: false,

      // Theme matching MonBoard violet palette
      theme:      'light',
      background: 'linear-gradient(135deg, #FBFAFF 0%, #F3F0FF 100%)',

      // Slippage defaults
      slippagePercent: {
        instantTrades: 1,
        crossChain:    2,
      },

      // ── FEE CONFIG ──────────────────────────────────────────────────────────
      // fee: percentage taken from each swap (sent to feeTarget)
      // feeTarget: your wallet that receives the fees
      // crossChainIntegratorAddress / onChainIntegratorAddress:
      //   register with Rubic BD (https://t.me/RubicPartnership) to unlock
      //   cross-chain fee sharing — until registered, fees only work on-chain
      fee:       FEE_PERCENT,
      feeTarget: FEE_RECEIVER_ADDRESS,
      crossChainIntegratorAddress: FEE_RECEIVER_ADDRESS,
      onChainIntegratorAddress:    FEE_RECEIVER_ADDRESS,

      // Language
      language: 'en',
    }

    Object.freeze(config)
    window.rubicWidget.init(config)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-200">
            <ArrowLeftRight size={17} className="text-white" />
          </div>
          <h1 className="font-display font-bold text-2xl text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>
            Swap
          </h1>
        </div>
        <p className="text-sm text-gray-500 ml-12">
          Cross-chain swaps across 100+ blockchains via Rubic — best rate from 360+ DEXes &amp; bridges
        </p>
      </div>

      {/* Info banner */}
      <div className="mb-5 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-violet-50 border border-violet-100 text-sm text-violet-700">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span>
          Swaps are executed directly on-chain — MonBoard never holds your funds.
          Rates are aggregated in real time from the best available routes.
        </span>
      </div>

      {/* Rubic Widget container */}
      <div className="card overflow-hidden">
        <div
          id="rubic-widget-root"
          className={`min-h-[520px] transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* Loading skeleton shown while script loads */}
        {!ready && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
            <div className="w-10 h-10 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin" />
            <span className="text-sm">Loading swap widget…</span>
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
        <span>Powered by <a href="https://rubic.exchange" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:text-violet-700 inline-flex items-center gap-0.5">Rubic Exchange <ExternalLink size={10} /></a></span>
        <span>100+ chains · 360+ DEXes &amp; bridges</span>
      </div>

    </div>
  )
}
