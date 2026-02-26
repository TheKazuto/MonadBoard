'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeftRight, ChevronDown, RefreshCw, Info, CheckCircle, XCircle, Loader, ExternalLink, Search, X } from 'lucide-react'
import { useWallet } from '@/contexts/WalletContext'
import { useSendTransaction } from 'wagmi'
import { encodeFunctionData } from 'viem'

// ─── INTEGRATOR CONFIG ────────────────────────────────────────────────────────
const FEE_RECEIVER = '0xYOUR_WALLET_ADDRESS_HERE'
const FEE_PERCENT  = 0.2
const REFERRER     = 'monboard.xyz'

// ─── LOGO HELPERS ─────────────────────────────────────────────────────────────
// TrustWallet Assets CDN — free, no API key, reliable
const TW = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains'
const CG = 'https://assets.coingecko.com/coins/images'

// Chain logo URLs (TrustWallet blockchains folder)
const CHAIN_LOGOS: Record<string, string> = {
  ETH:       `${TW}/ethereum/info/logo.png`,
  MONAD:     `${CG}/35756/small/monad.jpg`, // CoinGecko (monad ID 35756)
  ARBITRUM:  `${TW}/arbitrum/info/logo.png`,
  POLYGON:   `${TW}/polygon/info/logo.png`,
  BSC:       `${TW}/smartchain/info/logo.png`,
  OPTIMISM:  `${TW}/optimism/info/logo.png`,
  BASE:      `${TW}/base/info/logo.png`,
  AVALANCHE: `${TW}/avalanche/info/logo.png`,
  SOLANA:    `${TW}/solana/info/logo.png`,
}

// Token logo URLs — TrustWallet assets by contract address (checksum), or CoinGecko by coin ID
// Pattern: TW/{chain}/assets/{checksumAddress}/logo.png
function twToken(chain: string, address: string) {
  // TrustWallet uses checksum addresses
  return `${TW}/${chain}/assets/${address}/logo.png`
}

// Hardcoded CoinGecko image URLs for popular tokens (stable, known IDs)
const CG_TOKEN_LOGOS: Record<string, string> = {
  ETH:  `${CG}/279/small/ethereum.png`,
  USDC: `${CG}/6319/small/usdc.png`,
  USDT: `${CG}/325/small/tether.png`,
  WBTC: `${CG}/7598/small/wrapped_bitcoin_new.png`,
  BNB:  `${CG}/825/small/bnb-icon2_2x.png`,
  POL:  `${CG}/4713/small/polygon-ecosystem-token.png`,
  AVAX: `${CG}/12559/small/Avalanche_Circle_RedWhite_Trans.png`,
  SOL:  `${CG}/4128/small/solana.png`,
  MON:  `${CG}/35756/small/monad.jpg`,
  WMON: `${CG}/35756/small/monad.jpg`,
  ARB:  `${CG}/16547/small/arb.jpg`,
  OP:   `${CG}/25244/small/Optimism.png`,
}

// ─── IMAGE COMPONENT WITH FALLBACK ───────────────────────────────────────────
function TokenImage({ src, symbol, size = 28 }: { src: string; symbol: string; size?: number }) {
  const [errored, setErrored] = useState(false)
  const bg = stringToColor(symbol)

  if (errored || !src) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
        style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}
      >
        {symbol.slice(0, 2)}
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={symbol}
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
      onError={() => setErrored(true)}
    />
  )
}

// Deterministic color from string
function stringToColor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const hue = ((hash % 360) + 360) % 360
  return `hsl(${hue}, 65%, 50%)`
}

// ─── CHAINS ───────────────────────────────────────────────────────────────────
interface Chain { id: string; name: string; symbol: string }

const CHAINS: Chain[] = [
  { id: 'ETH',       name: 'Ethereum',  symbol: 'ETH'  },
  { id: 'MONAD',     name: 'Monad',     symbol: 'MON'  },
  { id: 'ARBITRUM',  name: 'Arbitrum',  symbol: 'ETH'  },
  { id: 'POLYGON',   name: 'Polygon',   symbol: 'POL'  },
  { id: 'BSC',       name: 'BNB Chain', symbol: 'BNB'  },
  { id: 'OPTIMISM',  name: 'Optimism',  symbol: 'ETH'  },
  { id: 'BASE',      name: 'Base',      symbol: 'ETH'  },
  { id: 'AVALANCHE', name: 'Avalanche', symbol: 'AVAX' },
  { id: 'SOLANA',    name: 'Solana',    symbol: 'SOL'  },
]

// ─── TOKENS ───────────────────────────────────────────────────────────────────
const NATIVE = '0x0000000000000000000000000000000000000000'

interface Token {
  symbol:   string
  name:     string
  address:  string
  decimals: number
  logoUrl:  string
}

// TrustWallet chain slug mapping
const TW_CHAIN: Record<string, string> = {
  ETH: 'ethereum', BSC: 'smartchain', POLYGON: 'polygon',
  AVALANCHE: 'avalanche', ARBITRUM: 'arbitrum', OPTIMISM: 'optimism',
  BASE: 'base', SOLANA: 'solana',
}

function t(symbol: string, name: string, address: string, decimals: number, chain: string): Token {
  // Use CoinGecko logo if known, else TrustWallet by address
  const cgLogo = CG_TOKEN_LOGOS[symbol]
  const twChain = TW_CHAIN[chain]
  const logoUrl = cgLogo ??
    (address !== NATIVE && twChain ? twToken(twChain, address) : '')
  return { symbol, name, address, decimals, logoUrl }
}

const POPULAR_TOKENS: Record<string, Token[]> = {
  ETH: [
    t('ETH',  'Ethereum',    NATIVE,                                       18, 'ETH'),
    t('USDC', 'USD Coin',    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6,  'ETH'),
    t('USDT', 'Tether USD',  '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6,  'ETH'),
    t('WBTC', 'Wrapped BTC', '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 8,  'ETH'),
  ],
  MONAD: [
    t('MON',  'Monad',       NATIVE,                                       18, 'MONAD'),
    t('WMON', 'Wrapped MON', '0x760AfE86e5de5fa0Ee542fc7B7B713e1B5A52b0a', 18, 'MONAD'),
    t('USDC', 'USD Coin',    '0xf817257fed379853cDe0fa4F97AB987181B0AB5',  6,  'MONAD'),
    t('USDT', 'Tether',      '0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D', 6,  'MONAD'),
  ],
  ARBITRUM: [
    t('ETH',  'Ethereum',    NATIVE,                                       18, 'ARBITRUM'),
    t('USDC', 'USD Coin',    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 6,  'ARBITRUM'),
    t('USDT', 'Tether',      '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 6,  'ARBITRUM'),
    t('ARB',  'Arbitrum',    '0x912CE59144191C1204E64559FE8253a0e49E6548', 18, 'ARBITRUM'),
  ],
  BSC: [
    t('BNB',  'BNB',         NATIVE,                                       18, 'BSC'),
    t('USDC', 'USD Coin',    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 18, 'BSC'),
    t('USDT', 'Tether',      '0x55d398326f99059fF775485246999027B3197955', 18, 'BSC'),
  ],
  POLYGON: [
    t('POL',  'Polygon',     NATIVE,                                       18, 'POLYGON'),
    t('USDC', 'USD Coin',    '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', 6,  'POLYGON'),
    t('USDT', 'Tether',      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 6,  'POLYGON'),
  ],
  BASE: [
    t('ETH',  'Ethereum',    NATIVE,                                       18, 'BASE'),
    t('USDC', 'USD Coin',    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 6,  'BASE'),
  ],
  OPTIMISM: [
    t('ETH',  'Ethereum',    NATIVE,                                       18, 'OPTIMISM'),
    t('USDC', 'USD Coin',    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', 6,  'OPTIMISM'),
    t('OP',   'Optimism',    '0x4200000000000000000000000000000000000042', 18, 'OPTIMISM'),
  ],
  AVALANCHE: [
    t('AVAX', 'Avalanche',   NATIVE,                                       18, 'AVALANCHE'),
    t('USDC', 'USD Coin',    '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', 6,  'AVALANCHE'),
  ],
  SOLANA: [
    t('SOL',  'Solana',      NATIVE,                                       9,  'SOLANA'),
    t('USDC', 'USD Coin',    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6, 'SOLANA'),
  ],
}

// ─── API ──────────────────────────────────────────────────────────────────────
interface Quote {
  id: string
  estimate: {
    destinationTokenAmount: string
    destinationUsdAmount: number
    durationInMinutes: number
    priceImpact: number | null
  }
  fees: { gasTokenFees: { protocol: { fixedUsdAmount: number } } }
  provider: string
}

async function fetchQuote(
  srcChain: string, srcToken: Token, srcAmount: string,
  dstChain: string, dstToken: Token,
): Promise<Quote> {
  const res = await fetch('https://api-v2.rubic.exchange/api/routes/quoteBest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      srcTokenAddress: srcToken.address,
      srcTokenBlockchain: srcChain,
      srcTokenAmount: srcAmount,
      dstTokenAddress: dstToken.address,
      dstTokenBlockchain: dstChain,
      referrer: REFERRER,
      fee: FEE_PERCENT,
      feeTarget: FEE_RECEIVER,
    }),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

async function fetchSwapTx(
  srcChain: string, srcToken: Token, srcAmount: string,
  dstChain: string, dstToken: Token,
  fromAddress: string, quoteId: string, receiver: string,
): Promise<{ transaction: { to: string; data: string; value: string; approvalAddress?: string } }> {
  const res = await fetch('https://api-v2.rubic.exchange/api/routes/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      srcTokenAddress: srcToken.address,
      srcTokenBlockchain: srcChain,
      srcTokenAmount: srcAmount,
      dstTokenAddress: dstToken.address,
      dstTokenBlockchain: dstChain,
      referrer: REFERRER,
      fee: FEE_PERCENT,
      feeTarget: FEE_RECEIVER,
      fromAddress,
      id: quoteId,
      receiver,
    }),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

const ERC20_APPROVE_ABI = [{
  name: 'approve', type: 'function',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

type TxStatus = 'idle' | 'approving' | 'swapping' | 'pending' | 'success' | 'error'

// ─── MODALS ───────────────────────────────────────────────────────────────────
function TokenModal({ chain, onSelect, onClose }: {
  chain: string; onSelect: (t: Token) => void; onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const tokens = POPULAR_TOKENS[chain] ?? []
  const filtered = tokens.filter(t =>
    t.symbol.toLowerCase().includes(query.toLowerCase()) ||
    t.name.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>Select Token</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
            <Search size={14} className="text-gray-400" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search token…"
              className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400" />
          </div>
        </div>
        <div className="overflow-y-auto max-h-64 px-3 pb-4">
          {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No tokens found</p>}
          {filtered.map(token => (
            <button key={token.address} onClick={() => { onSelect(token); onClose() }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-violet-50 transition-colors text-left">
              <TokenImage src={token.logoUrl} symbol={token.symbol} size={36} />
              <div>
                <p className="text-sm font-semibold text-gray-800">{token.symbol}</p>
                <p className="text-xs text-gray-400">{token.name}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChainModal({ onSelect, onClose }: { onSelect: (c: Chain) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>Select Chain</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto max-h-80 px-3 pb-4">
          {CHAINS.map(chain => (
            <button key={chain.id} onClick={() => { onSelect(chain); onClose() }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-violet-50 transition-colors text-left">
              <TokenImage src={CHAIN_LOGOS[chain.id] ?? ''} symbol={chain.name} size={36} />
              <div>
                <p className="text-sm font-semibold text-gray-800">{chain.name}</p>
                <p className="text-xs text-gray-400">{chain.symbol}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── CHAIN BADGE ──────────────────────────────────────────────────────────────
function ChainBadge({ chain, onClick }: { chain: Chain; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-colors text-xs font-medium text-gray-700">
      <TokenImage src={CHAIN_LOGOS[chain.id] ?? ''} symbol={chain.name} size={16} />
      {chain.name}
      <ChevronDown size={11} className="text-gray-400" />
    </button>
  )
}

// ─── TOKEN BUTTON ─────────────────────────────────────────────────────────────
function TokenButton({ token, onClick }: { token: Token; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-colors shrink-0">
      <TokenImage src={token.logoUrl} symbol={token.symbol} size={24} />
      <span className="font-semibold text-gray-800 text-sm">{token.symbol}</span>
      <ChevronDown size={13} className="text-gray-400" />
    </button>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function SwapPage() {
  const { address, isConnected } = useWallet()

  const [fromChain, setFromChain] = useState(CHAINS[0])
  const [toChain,   setToChain]   = useState(CHAINS[1])
  const [fromToken, setFromToken] = useState(POPULAR_TOKENS.ETH[0])
  const [toToken,   setToToken]   = useState(POPULAR_TOKENS.MONAD[0])
  const [amount,    setAmount]    = useState('')
  const [receiver,  setReceiver]  = useState('')

  const [quote,        setQuote]        = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError,   setQuoteError]   = useState<string | null>(null)

  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txHash,   setTxHash]   = useState<string | null>(null)
  const [txError,  setTxError]  = useState<string | null>(null)

  const [modal, setModal] = useState<'fromToken' | 'toToken' | 'fromChain' | 'toChain' | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { sendTransactionAsync } = useSendTransaction()

  // Quote with debounce
  const getQuote = useCallback(async (amt: string) => {
    if (!amt || isNaN(Number(amt)) || Number(amt) <= 0) { setQuote(null); return }
    setQuoteLoading(true); setQuoteError(null)
    try {
      setQuote(await fetchQuote(fromChain.id, fromToken, amt, toChain.id, toToken))
    } catch {
      setQuoteError('No route found for this pair')
      setQuote(null)
    } finally { setQuoteLoading(false) }
  }, [fromChain, fromToken, toChain, toToken])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => getQuote(amount), 700)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [amount, getQuote])

  function flipDirection() {
    setFromChain(toChain); setToChain(fromChain)
    setFromToken(toToken); setToToken(fromToken)
    setAmount(''); setQuote(null)
  }

  async function executeSwap() {
    if (!address || !quote || !amount) return
    setTxStatus('swapping'); setTxError(null)
    try {
      const recv = receiver.trim() || address
      const { transaction } = await fetchSwapTx(
        fromChain.id, fromToken, amount,
        toChain.id, toToken,
        address, quote.id, recv,
      )
      if (transaction.approvalAddress && fromToken.address !== NATIVE) {
        setTxStatus('approving')
        await sendTransactionAsync({
          to: fromToken.address as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_APPROVE_ABI, functionName: 'approve',
            args: [transaction.approvalAddress as `0x${string}`, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
          }),
        })
        setTxStatus('swapping')
      }
      const hash = await sendTransactionAsync({
        to:    transaction.to as `0x${string}`,
        data:  transaction.data as `0x${string}`,
        value: transaction.value ? BigInt(transaction.value) : 0n,
      })
      setTxHash(hash); setTxStatus('pending')
      let attempts = 0
      const poll = async () => {
        try {
          const r = await fetch(`https://api-v2.rubic.exchange/api/info/status?srcTxHash=${hash}`)
          const d = await r.json()
          if (d.status === 'SUCCESS') { setTxStatus('success'); return }
          if (['FAIL','REVERT','REVERTED'].includes(d.status)) { setTxStatus('error'); setTxError('Transaction reverted'); return }
        } catch {}
        if (attempts++ < 40) setTimeout(poll, 5000)
      }
      poll()
    } catch (e: any) {
      setTxError(e.shortMessage ?? e.message ?? 'Transaction failed')
      setTxStatus('error')
    }
  }

  const dstAmount = quote
    ? (Number(quote.estimate.destinationTokenAmount) / Math.pow(10, toToken.decimals)).toFixed(6)
    : ''
  const protocolFeeUSD = quote?.fees?.gasTokenFees?.protocol?.fixedUsdAmount ?? 0
  const durationMin    = quote?.estimate?.durationInMinutes ?? null
  const priceImpact    = quote?.estimate?.priceImpact ?? null
  const isCrossChain   = fromChain.id !== toChain.id
  const canSwap        = isConnected && !!quote && !!amount && txStatus === 'idle'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-200">
            <ArrowLeftRight size={17} className="text-white" />
          </div>
          <h1 className="font-bold text-2xl text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>Swap</h1>
        </div>
        <p className="text-sm text-gray-500 ml-12">Cross-chain swaps · Best rate from 360+ DEXes &amp; bridges</p>
      </div>

      <div className="card p-5 space-y-3">

        {/* FROM */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">From</span>
            <ChainBadge chain={fromChain} onClick={() => setModal('fromChain')} />
          </div>
          <div className="flex items-center gap-3">
            <TokenButton token={fromToken} onClick={() => setModal('fromToken')} />
            <input
              type="number" min="0" placeholder="0.00" value={amount}
              onChange={e => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-right text-2xl font-semibold text-gray-800 outline-none placeholder-gray-300 min-w-0"
            />
          </div>
        </div>

        {/* Flip */}
        <div className="flex justify-center -my-1">
          <button onClick={flipDirection}
            className="w-9 h-9 rounded-xl bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 flex items-center justify-center transition-all hover:rotate-180 duration-300 shadow-sm">
            <ArrowLeftRight size={15} className="text-violet-500" />
          </button>
        </div>

        {/* TO */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">To</span>
            <ChainBadge chain={toChain} onClick={() => setModal('toChain')} />
          </div>
          <div className="flex items-center gap-3">
            <TokenButton token={toToken} onClick={() => setModal('toToken')} />
            <div className="flex-1 text-right">
              {quoteLoading ? (
                <div className="flex items-center justify-end gap-1.5 text-gray-400">
                  <RefreshCw size={13} className="animate-spin" />
                  <span className="text-sm">Finding route…</span>
                </div>
              ) : dstAmount ? (
                <>
                  <span className="text-2xl font-semibold text-gray-800">{dstAmount}</span>
                  {quote && <p className="text-xs text-gray-400 mt-0.5">≈ ${quote.estimate.destinationUsdAmount.toFixed(2)}</p>}
                </>
              ) : (
                <span className="text-2xl font-semibold text-gray-300">0.00</span>
              )}
            </div>
          </div>
        </div>

        {/* Receiver (cross-chain) */}
        {isCrossChain && (
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wide block mb-1.5">
              Receiver <span className="normal-case text-gray-300">(optional)</span>
            </label>
            <input type="text" value={receiver} onChange={e => setReceiver(e.target.value)}
              placeholder={address ?? '0x…'}
              className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder-gray-300 font-mono" />
          </div>
        )}

        {/* Route info */}
        {quote && !quoteLoading && (
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 divide-y divide-violet-100/60 text-sm">
            {durationMin && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">Estimated time</span>
                <span className="font-medium text-gray-700">~{durationMin} min</span>
              </div>
            )}
            {priceImpact !== null && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">Price impact</span>
                <span className={`font-medium ${Math.abs(priceImpact) > 3 ? 'text-red-500' : 'text-gray-700'}`}>
                  {priceImpact.toFixed(2)}%
                </span>
              </div>
            )}
            {protocolFeeUSD > 0 && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">Protocol fee</span>
                <span className="font-medium text-gray-700">${protocolFeeUSD.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-gray-500">Route</span>
              <span className="font-medium text-violet-600 capitalize">
                {quote.provider?.replace(/_/g, ' ').toLowerCase()}
              </span>
            </div>
          </div>
        )}

        {/* Quote error */}
        {quoteError && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100 text-sm text-red-500">
            <XCircle size={14} /> {quoteError}
          </div>
        )}

        {/* CTA */}
        {!isConnected ? (
          <div className="text-center py-2">
            <p className="text-sm text-gray-400">Connect your wallet to swap</p>
          </div>
        ) : txStatus === 'success' ? (
          <div className="flex flex-col items-center gap-2 py-3">
            <div className="flex items-center gap-2 text-emerald-600 font-medium">
              <CheckCircle size={18} /> Swap successful!
            </div>
            {txHash && (
              <a href={`https://monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-violet-500 hover:text-violet-700 flex items-center gap-1">
                View on explorer <ExternalLink size={11} />
              </a>
            )}
            <button onClick={() => { setTxStatus('idle'); setTxHash(null); setAmount(''); setQuote(null) }}
              className="mt-1 text-sm text-gray-500 hover:text-gray-700 underline">
              New swap
            </button>
          </div>
        ) : txStatus === 'error' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100 text-sm text-red-500">
              <XCircle size={14} /> {txError ?? 'Transaction failed'}
            </div>
            <button onClick={() => { setTxStatus('idle'); setTxError(null) }}
              className="w-full py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Try again
            </button>
          </div>
        ) : (
          <button onClick={executeSwap} disabled={!canSwap || txStatus !== 'idle'}
            className="w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              background: canSwap ? 'linear-gradient(135deg, #836EF9 0%, #6d28d9 100%)' : '#e5e7eb',
              color: canSwap ? 'white' : '#9ca3af',
              boxShadow: canSwap ? '0 4px 16px rgba(131,110,249,0.35)' : 'none',
            }}>
            {txStatus === 'approving' && <><Loader size={16} className="animate-spin" /> Approving…</>}
            {txStatus === 'swapping'  && <><Loader size={16} className="animate-spin" /> Sending…</>}
            {txStatus === 'pending'   && <><Loader size={16} className="animate-spin" /> Confirming…</>}
            {txStatus === 'idle'      && (quoteLoading ? 'Finding best route…' : !amount ? 'Enter an amount' : !quote ? 'No route found' : 'Swap')}
          </button>
        )}
      </div>

      {/* Footer note */}
      <div className="mt-4 flex items-start gap-2 text-xs text-gray-400">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          Swaps execute directly on-chain via{' '}
          <a href="https://rubic.exchange" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-600">Rubic</a>
          {' '}— MonBoard never holds your funds.
        </span>
      </div>

      {/* Modals */}
      {modal === 'fromToken' && (
        <TokenModal chain={fromChain.id} onSelect={t => { setFromToken(t); setQuote(null) }} onClose={() => setModal(null)} />
      )}
      {modal === 'toToken' && (
        <TokenModal chain={toChain.id} onSelect={t => { setToToken(t); setQuote(null) }} onClose={() => setModal(null)} />
      )}
      {modal === 'fromChain' && (
        <ChainModal onSelect={c => { setFromChain(c); setFromToken(POPULAR_TOKENS[c.id]?.[0] ?? POPULAR_TOKENS.ETH[0]); setQuote(null) }} onClose={() => setModal(null)} />
      )}
      {modal === 'toChain' && (
        <ChainModal onSelect={c => { setToChain(c); setToToken(POPULAR_TOKENS[c.id]?.[0] ?? POPULAR_TOKENS.ETH[0]); setQuote(null) }} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
