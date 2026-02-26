'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeftRight, ChevronDown, RefreshCw, Info,
  CheckCircle, XCircle, Loader, ExternalLink, Search, X
} from 'lucide-react'
import { useWallet } from '@/contexts/WalletContext'
import { useSendTransaction } from 'wagmi'
import { encodeFunctionData } from 'viem'

// ─── INTEGRATOR CONFIG ────────────────────────────────────────────────────────
const FEE_RECEIVER = '0xYOUR_WALLET_ADDRESS_HERE'
const FEE_PERCENT  = 0.2
const REFERRER     = 'monboard.xyz'
const NATIVE       = '0x0000000000000000000000000000000000000000'

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Chain {
  id:   number
  name: string       // "ETH", "MONAD", etc — used in Rubic API
  type: string       // "EVM", "SOLANA", etc
}

interface Token {
  symbol:   string
  name:     string
  address:  string
  decimals: number
  logoURI:  string
  chainId?: number
}

// ─── CHAIN DISPLAY HELPERS ───────────────────────────────────────────────────
// Map Rubic chain name → CoinGecko token list platform slug
// tokens.coingecko.com/{platform}/all.json — free, no API key, logos included
const COINGECKO_PLATFORM: Record<string, string> = {
  ETH:       'ethereum',
  BSC:       'binance-smart-chain',
  POLYGON:   'polygon-pos',
  AVALANCHE: 'avalanche',
  ARBITRUM:  'arbitrum-one',
  OPTIMISM:  'optimistic-ethereum',
  BASE:      'base',
  SOLANA:    'solana',
  FANTOM:    'fantom',
  AURORA:    'aurora',
  CELO:      'celo',
  HARMONY:   'harmony-shard-0',
  MOONBEAM:  'moonbeam',
  MOONRIVER: 'moonriver',
  CRONOS:    'cronos',
  GNOSIS:    'xdai',
  KLAYTN:    'klay-token',
  BOBA:      'boba',
  OKT:       'okex-chain',
  TELOS:     'telos',
  FUSE:      'fuse',
  IOTEX:     'iotex',
  TRON:      'tron',
  NEAR:      'near-protocol',
  LINEA:     'linea',
  ZKSYNC:    'zksync',
  SCROLL:    'scroll',
  MANTLE:    'mantle',
  BLAST:     'blast',
  METIS:     'metis-andromeda',
  ZK_FAIR:   'zkfair',
  MONAD:     'monad',   // served via GeckoTerminal (not CoinGecko token list)
}

// TrustWallet blockchain slug for chain logo
const TW_BASE = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains'
const TW_CHAIN_SLUG: Record<string, string> = {
  ETH: 'ethereum', BSC: 'smartchain', POLYGON: 'polygon',
  AVALANCHE: 'avalanche', ARBITRUM: 'arbitrum', OPTIMISM: 'optimism',
  BASE: 'base', SOLANA: 'solana', FANTOM: 'fantom', CRONOS: 'cronos',
  GNOSIS: 'xdai', CELO: 'celo', HARMONY: 'harmony', MOONBEAM: 'moonbeam',
  MOONRIVER: 'moonriver', AURORA: 'aurora', BOBA: 'boba', METIS: 'metis',
  LINEA: 'linea', ZKSYNC: 'zksync', SCROLL: 'scroll', MANTLE: 'mantle',
}

// CoinGecko CDN for special tokens
const CG = 'https://assets.coingecko.com/coins/images'
const OVERRIDE_LOGOS: Record<string, string> = {
  ETH:  `${CG}/279/small/ethereum.png`,
  USDC: `${CG}/6319/small/usdc.png`,
  USDT: `${CG}/325/small/tether.png`,
  WBTC: `${CG}/7598/small/wrapped_bitcoin_new.png`,
  BNB:  `${CG}/825/small/bnb-icon2_2x.png`,
  POL:  `${CG}/4713/small/polygon-ecosystem-token.png`,
  MATIC:`${CG}/4713/small/polygon-ecosystem-token.png`,
  AVAX: `${CG}/12559/small/Avalanche_Circle_RedWhite_Trans.png`,
  SOL:  `${CG}/4128/small/solana.png`,
  MON:  `${CG}/35756/small/monad.jpg`,
  WMON: `${CG}/35756/small/monad.jpg`,
  ARB:  `${CG}/16547/small/arb.jpg`,
  OP:   `${CG}/25244/small/Optimism.png`,
  FTM:  `${CG}/4001/small/fantom.png`,
  NEAR: `${CG}/10365/small/near.jpg`,
  ATOM: `${CG}/1481/small/cosmos_hub.png`,
}

// Native tokens per chain
const NATIVE_TOKENS: Record<string, Token> = {
  ETH:       { symbol: 'ETH',  name: 'Ethereum',  address: NATIVE, decimals: 18, logoURI: OVERRIDE_LOGOS.ETH },
  BSC:       { symbol: 'BNB',  name: 'BNB',       address: NATIVE, decimals: 18, logoURI: OVERRIDE_LOGOS.BNB },
  POLYGON:   { symbol: 'POL',  name: 'Polygon',   address: NATIVE, decimals: 18, logoURI: OVERRIDE_LOGOS.POL },
  AVALANCHE: { symbol: 'AVAX', name: 'Avalanche', address: NATIVE, decimals: 18, logoURI: OVERRIDE_LOGOS.AVAX },
  ARBITRUM:  { symbol: 'ETH',  name: 'Ethereum',  address: NATIVE, decimals: 18, logoURI: OVERRIDE_LOGOS.ETH },
  OPTIMISM:  { symbol: 'ETH',  name: 'Ethereum',  address: NATIVE, decimals: 18, logoURI: OVERRIDE_LOGOS.ETH },
  BASE:      { symbol: 'ETH',  name: 'Ethereum',  address: NATIVE, decimals: 18, logoURI: OVERRIDE_LOGOS.ETH },
  SOLANA:    { symbol: 'SOL',  name: 'Solana',    address: NATIVE, decimals: 9,  logoURI: OVERRIDE_LOGOS.SOL },
  MONAD:     { symbol: 'MON',  name: 'Monad',     address: NATIVE, decimals: 18, logoURI: OVERRIDE_LOGOS.MON },
  FANTOM:    { symbol: 'FTM',  name: 'Fantom',    address: NATIVE, decimals: 18, logoURI: OVERRIDE_LOGOS.FTM },
}

function chainLogoUrl(chainName: string): string {
  const slug = TW_CHAIN_SLUG[chainName]
  if (slug) return `${TW_BASE}/${slug}/info/logo.png`
  if (chainName === 'MONAD') return OVERRIDE_LOGOS.MON
  return ''
}

// ─── IMAGE WITH FALLBACK ─────────────────────────────────────────────────────
function TokenImage({ src, symbol, size = 28 }: { src: string; symbol: string; size?: number }) {
  const [err, setErr] = useState(false)
  if (err || !src) {
    const hue = [...symbol].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)
    const bg = `hsl(${((hue % 360) + 360) % 360}, 60%, 50%)`
    return (
      <div className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
        style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}>
        {symbol.slice(0, 2)}
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={symbol} width={size} height={size}
    className="rounded-full object-cover shrink-0" style={{ width: size, height: size }}
    onError={() => setErr(true)} />
}

// ─── API HELPERS ──────────────────────────────────────────────────────────────
// Cache for token lists — avoid re-fetching same chain
const tokenListCache: Record<string, Token[]> = {}

async function loadTokensForChain(chainName: string): Promise<Token[]> {
  if (tokenListCache[chainName]) return tokenListCache[chainName]

  const native = NATIVE_TOKENS[chainName]
  const platform = COINGECKO_PLATFORM[chainName]

  if (!platform) {
    // Chain not mapped yet — return just native token
    const result = native ? [native] : []
    tokenListCache[chainName] = result
    return result
  }

  try {
    const res = await fetch(`/api/token-list?platform=${platform}`)
    if (!res.ok) throw new Error('failed')
    const data: { tokens: Token[] } = await res.json()

    // Apply logo overrides for known tokens, add native first
    const tokens = data.tokens.map(t => ({
      ...t,
      logoURI: OVERRIDE_LOGOS[t.symbol.toUpperCase()] ?? t.logoURI,
    }))

    const result = native ? [native, ...tokens] : tokens
    tokenListCache[chainName] = result
    return result
  } catch {
    const result = native ? [native] : []
    tokenListCache[chainName] = result
    return result
  }
}

// Fetch all supported chains from Rubic
async function loadChains(): Promise<Chain[]> {
  try {
    const res = await fetch('https://api-v2.rubic.exchange/api/info/chains?includeTestnets=false')
    if (!res.ok) throw new Error('failed')
    const data: Chain[] = await res.json()
    // Filter to EVM + Solana, exclude testnets, sort by familiarity
    const priority = ['ETH','BSC','POLYGON','ARBITRUM','OPTIMISM','BASE','AVALANCHE','MONAD','SOLANA','FANTOM']
    return data
      .filter(c => !c.name.includes('TEST') && ['EVM','SOLANA','TON','BITCOIN'].includes(c.type))
      .sort((a, b) => {
        const ai = priority.indexOf(a.name)
        const bi = priority.indexOf(b.name)
        if (ai !== -1 && bi !== -1) return ai - bi
        if (ai !== -1) return -1
        if (bi !== -1) return 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    // Fallback to minimal list
    return [
      { id: 1, name: 'ETH', type: 'EVM' },
      { id: 56, name: 'BSC', type: 'EVM' },
      { id: 137, name: 'POLYGON', type: 'EVM' },
      { id: 42161, name: 'ARBITRUM', type: 'EVM' },
      { id: 10, name: 'OPTIMISM', type: 'EVM' },
      { id: 8453, name: 'BASE', type: 'EVM' },
      { id: 43114, name: 'AVALANCHE', type: 'EVM' },
      { id: 143, name: 'MONAD', type: 'EVM' },
    ]
  }
}

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
      srcTokenAddress: srcToken.address, srcTokenBlockchain: srcChain,
      srcTokenAmount: srcAmount,
      dstTokenAddress: dstToken.address, dstTokenBlockchain: dstChain,
      referrer: REFERRER, fee: FEE_PERCENT, feeTarget: FEE_RECEIVER,
    }),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

async function fetchSwapTx(
  srcChain: string, srcToken: Token, srcAmount: string,
  dstChain: string, dstToken: Token,
  fromAddress: string, quoteId: string, receiver: string,
) {
  const res = await fetch('https://api-v2.rubic.exchange/api/routes/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      srcTokenAddress: srcToken.address, srcTokenBlockchain: srcChain,
      srcTokenAmount: srcAmount,
      dstTokenAddress: dstToken.address, dstTokenBlockchain: dstChain,
      referrer: REFERRER, fee: FEE_PERCENT, feeTarget: FEE_RECEIVER,
      fromAddress, id: quoteId, receiver,
    }),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json() as Promise<{ transaction: { to: string; data: string; value: string; approvalAddress?: string } }>
}

const ERC20_APPROVE_ABI = [{
  name: 'approve', type: 'function',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

type TxStatus = 'idle' | 'approving' | 'swapping' | 'pending' | 'success' | 'error'

// ─── CHAIN SELECTOR MODAL ─────────────────────────────────────────────────────
function ChainModal({ chains, onSelect, onClose }: {
  chains: Chain[]; onSelect: (c: Chain) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const filtered = chains.filter(c => c.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>Select Network</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
            <Search size={14} className="text-gray-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search network…"
              className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400" />
          </div>
        </div>
        <div className="overflow-y-auto max-h-72 px-3 pb-4">
          {filtered.map(c => (
            <button key={c.name} onClick={() => { onSelect(c); onClose() }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-violet-50 transition-colors text-left">
              <TokenImage src={chainLogoUrl(c.name)} symbol={c.name} size={32} />
              <div>
                <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                <p className="text-xs text-gray-400">{c.type}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── TOKEN SELECTOR MODAL ─────────────────────────────────────────────────────
function TokenModal({ chainName, onSelect, onClose }: {
  chainName: string; onSelect: (t: Token) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTokensForChain(chainName).then(t => { setTokens(t); setLoading(false) })
  }, [chainName])

  const filtered = tokens.filter(t =>
    t.symbol.toLowerCase().includes(q.toLowerCase()) ||
    t.name.toLowerCase().includes(q.toLowerCase()) ||
    t.address.toLowerCase() === q.toLowerCase()
  ).slice(0, 80) // cap for performance

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h3 className="font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>Select Token</h3>
            <p className="text-xs text-gray-400">{chainName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
            <Search size={14} className="text-gray-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search by name, symbol or address…"
              className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400" />
          </div>
        </div>
        <div className="overflow-y-auto max-h-72 px-3 pb-4">
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
              <Loader size={14} className="animate-spin" /> Loading tokens…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No tokens found</p>
          )}
          {!loading && filtered.map(token => (
            <button key={token.address} onClick={() => { onSelect(token); onClose() }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-violet-50 transition-colors text-left">
              <TokenImage src={token.logoURI} symbol={token.symbol} size={36} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">{token.symbol}</p>
                <p className="text-xs text-gray-400 truncate">{token.name}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
const ETH_CHAIN: Chain = { id: 1, name: 'ETH', type: 'EVM' }
const MONAD_CHAIN: Chain = { id: 143, name: 'MONAD', type: 'EVM' }

export default function SwapPage() {
  const { address, isConnected } = useWallet()

  const [chains, setChains] = useState<Chain[]>([])
  const [fromChain, setFromChain] = useState<Chain>(ETH_CHAIN)
  const [toChain,   setToChain]   = useState<Chain>(MONAD_CHAIN)
  const [fromToken, setFromToken] = useState<Token>(NATIVE_TOKENS.ETH)
  const [toToken,   setToToken]   = useState<Token>(NATIVE_TOKENS.MONAD)
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

  // Load chain list on mount
  useEffect(() => { loadChains().then(setChains) }, [])

  // Quote with debounce
  const getQuote = useCallback(async (amt: string) => {
    if (!amt || isNaN(Number(amt)) || Number(amt) <= 0) { setQuote(null); return }
    setQuoteLoading(true); setQuoteError(null)
    try {
      setQuote(await fetchQuote(fromChain.name, fromToken, amt, toChain.name, toToken))
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
        fromChain.name, fromToken, amount,
        toChain.name, toToken,
        address, quote.id, recv,
      )
      if (transaction.approvalAddress && fromToken.address !== NATIVE) {
        setTxStatus('approving')
        await sendTransactionAsync({
          to: fromToken.address as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_APPROVE_ABI, functionName: 'approve',
            args: [transaction.approvalAddress as `0x${string}`,
              BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
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
          if (['FAIL','REVERT','REVERTED'].includes(d.status)) {
            setTxStatus('error'); setTxError('Transaction reverted on-chain'); return
          }
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
  const isCrossChain = fromChain.name !== toChain.name
  const canSwap = isConnected && !!quote && !!amount && txStatus === 'idle'

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
        <p className="text-sm text-gray-500 ml-12">
          Cross-chain swaps across {chains.length > 0 ? `${chains.length}+` : '70+'} chains · Best rate from 360+ DEXes &amp; bridges
        </p>
      </div>

      <div className="card p-5 space-y-3">

        {/* FROM */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">From</span>
            <button onClick={() => setModal('fromChain')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-colors text-xs font-medium text-gray-700">
              <TokenImage src={chainLogoUrl(fromChain.name)} symbol={fromChain.name} size={16} />
              {fromChain.name}
              <ChevronDown size={11} className="text-gray-400" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setModal('fromToken')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-colors shrink-0">
              <TokenImage src={fromToken.logoURI} symbol={fromToken.symbol} size={24} />
              <span className="font-semibold text-gray-800 text-sm">{fromToken.symbol}</span>
              <ChevronDown size={13} className="text-gray-400" />
            </button>
            <input type="number" min="0" placeholder="0.00" value={amount}
              onChange={e => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-right text-2xl font-semibold text-gray-800 outline-none placeholder-gray-300 min-w-0" />
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
            <button onClick={() => setModal('toChain')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-colors text-xs font-medium text-gray-700">
              <TokenImage src={chainLogoUrl(toChain.name)} symbol={toChain.name} size={16} />
              {toChain.name}
              <ChevronDown size={11} className="text-gray-400" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setModal('toToken')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-colors shrink-0">
              <TokenImage src={toToken.logoURI} symbol={toToken.symbol} size={24} />
              <span className="font-semibold text-gray-800 text-sm">{toToken.symbol}</span>
              <ChevronDown size={13} className="text-gray-400" />
            </button>
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
              Receiver <span className="normal-case text-gray-300">(optional, defaults to your wallet)</span>
            </label>
            <input type="text" value={receiver} onChange={e => setReceiver(e.target.value)}
              placeholder={address ?? '0x…'}
              className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder-gray-300 font-mono" />
          </div>
        )}

        {/* Route details */}
        {quote && !quoteLoading && (
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 divide-y divide-violet-100/60 text-sm">
            {quote.estimate.durationInMinutes && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">Estimated time</span>
                <span className="font-medium text-gray-700">~{quote.estimate.durationInMinutes} min</span>
              </div>
            )}
            {quote.estimate.priceImpact !== null && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">Price impact</span>
                <span className={`font-medium ${Math.abs(quote.estimate.priceImpact) > 3 ? 'text-red-500' : 'text-gray-700'}`}>
                  {quote.estimate.priceImpact.toFixed(2)}%
                </span>
              </div>
            )}
            {(quote.fees?.gasTokenFees?.protocol?.fixedUsdAmount ?? 0) > 0 && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-gray-500">Protocol fee</span>
                <span className="font-medium text-gray-700">${quote.fees.gasTokenFees.protocol.fixedUsdAmount.toFixed(2)}</span>
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
          <div className="text-center py-2"><p className="text-sm text-gray-400">Connect your wallet to swap</p></div>
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
              className="mt-1 text-sm text-gray-500 hover:text-gray-700 underline">New swap</button>
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
            {txStatus === 'idle' && (quoteLoading ? 'Finding best route…' : !amount ? 'Enter an amount' : !quote ? 'No route found' : 'Swap')}
          </button>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 text-xs text-gray-400">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          Swaps execute directly on-chain via{' '}
          <a href="https://rubic.exchange" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-600">Rubic</a>
          {' '}— MonBoard never holds your funds.
        </span>
      </div>

      {/* Modals */}
      {modal === 'fromChain' && (
        <ChainModal chains={chains} onSelect={c => {
          setFromChain(c)
          setFromToken(NATIVE_TOKENS[c.name] ?? { symbol: c.name, name: c.name, address: NATIVE, decimals: 18, logoURI: chainLogoUrl(c.name) })
          setQuote(null)
        }} onClose={() => setModal(null)} />
      )}
      {modal === 'toChain' && (
        <ChainModal chains={chains} onSelect={c => {
          setToChain(c)
          setToToken(NATIVE_TOKENS[c.name] ?? { symbol: c.name, name: c.name, address: NATIVE, decimals: 18, logoURI: chainLogoUrl(c.name) })
          setQuote(null)
        }} onClose={() => setModal(null)} />
      )}
      {modal === 'fromToken' && (
        <TokenModal chainName={fromChain.name} onSelect={t => { setFromToken(t); setQuote(null) }} onClose={() => setModal(null)} />
      )}
      {modal === 'toToken' && (
        <TokenModal chainName={toChain.name} onSelect={t => { setToToken(t); setQuote(null) }} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
