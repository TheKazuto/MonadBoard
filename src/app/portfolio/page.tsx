'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import {
  TrendingUp, TrendingDown, Coins, Image as ImageIcon,
  RefreshCw, Wallet, ExternalLink, LayoutGrid, List,
} from 'lucide-react'
import PortfolioHistory from '@/components/PortfolioHistory'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Token {
  symbol: string
  name: string
  balance: number
  price: number
  value: number
  color: string
  percentage: number
}

interface NFT {
  id: string
  contract: string
  tokenId: string
  collection: string
  symbol: string
  name: string
  image: string | null
  tokenUri: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatUSD(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(2)}K`
  if (v >= 1)         return `$${v.toFixed(2)}`
  if (v > 0)          return `$${v.toFixed(4)}`
  return '$0.00'
}

function formatBalance(b: number) {
  if (b >= 1_000_000) return `${(b / 1_000_000).toFixed(2)}M`
  if (b >= 1_000)     return `${(b / 1_000).toFixed(2)}K`
  if (b >= 1)         return b.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return b.toFixed(6)
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function StatSkeleton() {
  return <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
}

function TableSkeleton() {
  return (
    <div className="animate-pulse space-y-0">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50">
          <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-gray-100 rounded w-24" />
            <div className="h-2.5 bg-gray-50 rounded w-16" />
          </div>
          <div className="h-3.5 w-20 bg-gray-100 rounded" />
          <div className="h-3.5 w-16 bg-gray-100 rounded hidden md:block" />
          <div className="h-3.5 w-14 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  )
}

function NFTSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-xl overflow-hidden border border-gray-100">
          <div className="aspect-square bg-gray-100" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-gray-100 rounded w-3/4" />
            <div className="h-2.5 bg-gray-50 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Token row ────────────────────────────────────────────────────────────────
function TokenRow({ token, rank }: { token: Token; rank: number }) {
  return (
    <tr className="hover:bg-violet-50/40 transition-colors group">
      <td className="py-3.5 px-5">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
            style={{ background: token.color }}
          >
            {token.symbol.slice(0, 2)}
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">{token.symbol}</p>
            <p className="text-xs text-gray-400">{token.name}</p>
          </div>
        </div>
      </td>
      <td className="py-3.5 px-3 text-right font-mono text-sm text-gray-700">
        {token.price < 0.01 ? `$${token.price.toFixed(6)}`
          : token.price < 1 ? `$${token.price.toFixed(4)}`
          : `$${token.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </td>
      <td className="py-3.5 px-3 text-right text-sm text-gray-600 hidden md:table-cell">
        {formatBalance(token.balance)}
      </td>
      <td className="py-3.5 px-3 text-right font-semibold text-sm text-gray-800">
        {formatUSD(token.value)}
      </td>
      <td className="py-3.5 px-3 hidden lg:table-cell">
        <div className="flex items-center gap-2 justify-end">
          <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(token.percentage, 100)}%`, background: token.color }}
            />
          </div>
          <span className="text-xs text-gray-400 w-10 text-right">{token.percentage.toFixed(1)}%</span>
        </div>
      </td>
    </tr>
  )
}

// ─── NFT Card ─────────────────────────────────────────────────────────────────
function NFTCard({ nft }: { nft: NFT }) {
  const [imgError, setImgError] = useState(false)
  const explorerUrl = `https://monadscan.com/token/${nft.contract}?a=${nft.tokenId}`

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="border border-violet-100 rounded-xl overflow-hidden hover:border-violet-300 hover:shadow-md transition-all group cursor-pointer block"
    >
      {/* Image */}
      <div className="aspect-square bg-gradient-to-br from-violet-100 to-purple-200 flex items-center justify-center overflow-hidden">
        {nft.image && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nft.image}
            alt={nft.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-violet-300">
            <ImageIcon size={32} />
            <span className="text-xs">{nft.symbol || '?'}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-violet-700 transition-colors">
          {nft.name}
        </p>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-gray-400 truncate">{nft.collection}</p>
          <ExternalLink size={10} className="text-gray-300 group-hover:text-violet-400 transition-colors shrink-0 ml-1" />
        </div>
        <p className="text-xs text-gray-300 font-mono mt-1">#{nft.tokenId}</p>
      </div>
    </a>
  )
}


// ─── NFT List Row ─────────────────────────────────────────────────────────────
function NFTListRow({ nft }: { nft: NFT }) {
  const [imgError, setImgError] = useState(false)
  return (
    <a
      href={`https://monadscan.com/token/${nft.contract}?a=${nft.tokenId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 hover:bg-violet-50/40 transition-all group"
    >
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-purple-200 flex items-center justify-center overflow-hidden shrink-0">
        {nft.image && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={nft.image} alt={nft.name} className="w-full h-full object-cover"
            onError={() => setImgError(true)} />
        ) : (
          <ImageIcon size={16} className="text-violet-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-violet-700">{nft.name}</p>
        <p className="text-xs text-gray-400">{nft.collection} · #{nft.tokenId}</p>
      </div>
      <ExternalLink size={13} className="text-gray-300 group-hover:text-violet-400 transition-colors shrink-0" />
    </a>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
      <div className="w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center text-violet-300">
        {icon}
      </div>
      <p className="text-sm text-gray-400 font-medium">{title}</p>
      {subtitle && <p className="text-xs text-gray-300">{subtitle}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { address, isConnected } = useAccount()

  // Tokens
  const [tokens, setTokens] = useState<Token[]>([])
  const [totalValue, setTotalValue] = useState(0)
  const [tokensLoading, setTokensLoading] = useState(false)
  const [tokensError, setTokensError] = useState(false)

  // NFTs
  const [nfts, setNfts] = useState<NFT[]>([])
  const [nftTotal, setNftTotal] = useState(0)
  const [nftsLoading, setNftsLoading] = useState(false)
  const [nftsError, setNftsError] = useState(false)
  const [nftView, setNftView] = useState<'grid' | 'list'>('grid')

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchTokens = useCallback(async (addr: string) => {
    setTokensLoading(true)
    setTokensError(false)
    try {
      const res = await fetch(`/api/token-exposure?address=${addr}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setTokens(data.tokens ?? [])
      setTotalValue(data.totalValue ?? 0)
      setLastUpdated(new Date())
    } catch {
      setTokensError(true)
    } finally {
      setTokensLoading(false)
    }
  }, [])

  const fetchNFTs = useCallback(async (addr: string) => {
    setNftsLoading(true)
    setNftsError(false)
    try {
      const res = await fetch(`/api/nfts?address=${addr}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setNfts(data.nfts ?? [])
      setNftTotal(data.total ?? 0)
    } catch {
      setNftsError(true)
    } finally {
      setNftsLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    if (!address) return
    fetchTokens(address)
    fetchNFTs(address)
  }, [address, fetchTokens, fetchNFTs])

  useEffect(() => {
    if (isConnected && address) {
      fetchTokens(address)
      fetchNFTs(address)
    } else {
      setTokens([])
      setNfts([])
      setTotalValue(0)
      setNftTotal(0)
      setLastUpdated(null)
    }
  }, [isConnected, address, fetchTokens, fetchNFTs])

  // Summary stats
  const tokenCount  = tokens.length
  const nftCount    = nftTotal

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>
            Portfolio
          </h1>
          <p className="text-gray-500 text-sm mt-1">All tokens and NFTs in your wallet</p>
        </div>
        {isConnected && lastUpdated && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Updated {lastUpdated.toLocaleTimeString()}</span>
            <button
              onClick={refresh}
              disabled={tokensLoading || nftsLoading}
              className="p-1.5 rounded-lg hover:bg-violet-50 text-gray-400 hover:text-violet-600 transition-all disabled:opacity-40"
            >
              <RefreshCw size={13} className={(tokensLoading || nftsLoading) ? 'animate-spin' : ''} />
            </button>
          </div>
        )}
      </div>

      {/* ── Not connected ───────────────────────────────────────────────────── */}
      {!isConnected && (
        <div className="card flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-violet-50 flex items-center justify-center">
            <Wallet size={28} className="text-violet-300" />
          </div>
          <div>
            <p className="font-semibold text-gray-600 mb-1">Connect your wallet</p>
            <p className="text-sm text-gray-400">Your portfolio will appear here once connected</p>
          </div>
        </div>
      )}

      {isConnected && (
        <>
          {/* ── Summary stats ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {tokensLoading && tokens.length === 0
              ? [...Array(3)].map((_, i) => <StatSkeleton key={i} />)
              : (
                <>
                  {/* Total Value */}
                  <div className="card p-4 col-span-2 lg:col-span-1">
                    <p className="text-xs text-gray-400 font-medium mb-1">Total Value</p>
                    <p className="font-bold text-2xl text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>
                      {formatUSD(totalValue)}
                    </p>
                  </div>

                  {/* Tokens */}
                  <div className="card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                        <Coins size={14} className="text-violet-600" />
                      </div>
                      <p className="text-xs text-gray-400 font-medium">Tokens</p>
                    </div>
                    <p className="font-bold text-xl text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>
                      {tokenCount}
                    </p>
                  </div>

                  {/* NFTs */}
                  <div className="card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                        <ImageIcon size={14} className="text-blue-500" />
                      </div>
                      <p className="text-xs text-gray-400 font-medium">NFTs</p>
                    </div>
                    <p className="font-bold text-xl text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>
                      {nftsLoading && nftCount === 0 ? '—' : nftCount}
                    </p>
                  </div>
                </>
              )
            }
          </div>

          {/* ── Portfolio History chart ───────────────────────────────────── */}
          <PortfolioHistory />

          {/* ── Tokens table ─────────────────────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Coins size={16} className="text-violet-600" />
                <h2 className="font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>Tokens</h2>
                {tokens.length > 0 && (
                  <span className="text-xs bg-violet-100 text-violet-600 font-semibold px-2 py-0.5 rounded-full">
                    {tokens.length}
                  </span>
                )}
              </div>
              {address && (
                <a
                  href={`https://monadscan.com/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-violet-500 hover:text-violet-700 flex items-center gap-1 transition-colors"
                >
                  View on MonadScan <ExternalLink size={11} />
                </a>
              )}
            </div>

            {tokensLoading && tokens.length === 0 && <TableSkeleton />}

            {!tokensLoading && tokensError && (
              <EmptyState
                icon={<RefreshCw size={22} />}
                title="Failed to load tokens"
                subtitle="Check your connection and try again"
              />
            )}

            {!tokensLoading && !tokensError && tokens.length === 0 && (
              <EmptyState
                icon={<Coins size={22} />}
                title="No tokens found"
                subtitle="Your token balances will appear here"
              />
            )}

            {tokens.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-50">
                      <th className="pb-3 pt-2 px-5 text-left font-medium">Token</th>
                      <th className="pb-3 pt-2 px-3 text-right font-medium">Price</th>
                      <th className="pb-3 pt-2 px-3 text-right font-medium hidden md:table-cell">Balance</th>
                      <th className="pb-3 pt-2 px-3 text-right font-medium">Value</th>
                      <th className="pb-3 pt-2 px-3 text-right font-medium hidden lg:table-cell">Allocation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {tokens.map((token, i) => (
                      <TokenRow key={token.symbol} token={token} rank={i + 1} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── NFTs ─────────────────────────────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <ImageIcon size={16} className="text-blue-500" />
                <h2 className="font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>NFTs</h2>
                {nftTotal > 0 && (
                  <span className="text-xs bg-blue-50 text-blue-500 font-semibold px-2 py-0.5 rounded-full">
                    {nftTotal}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Grid / List toggle */}
                {nfts.length > 0 && (
                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setNftView('grid')}
                      className={`p-1.5 rounded-md transition-all ${nftView === 'grid' ? 'bg-white shadow-sm text-violet-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      <LayoutGrid size={13} />
                    </button>
                    <button
                      onClick={() => setNftView('list')}
                      className={`p-1.5 rounded-md transition-all ${nftView === 'list' ? 'bg-white shadow-sm text-violet-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      <List size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5">
              {nftsLoading && nfts.length === 0 && <NFTSkeleton />}

              {!nftsLoading && nftsError && (
                <EmptyState
                  icon={<RefreshCw size={22} />}
                  title="Failed to load NFTs"
                  subtitle="Check your connection and try again"
                />
              )}

              {!nftsLoading && !nftsError && nfts.length === 0 && (
                <EmptyState
                  icon={<ImageIcon size={22} />}
                  title="No NFTs found"
                  subtitle="NFTs you own on Monad will appear here"
                />
              )}

              {nfts.length > 0 && nftView === 'grid' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {nfts.map(nft => <NFTCard key={nft.id} nft={nft} />)}
                </div>
              )}

              {nfts.length > 0 && nftView === 'list' && (
                <div className="space-y-0 -mx-5 -mb-5">
                  {nfts.map(nft => <NFTListRow key={nft.id} nft={nft} />)}
                </div>
              )}

              {nftTotal > 20 && (
                <p className="text-xs text-gray-400 text-center mt-4">
                  Showing 20 of {nftTotal} NFTs ·{' '}
                  <a
                    href={`https://monadscan.com/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-500 hover:text-violet-700"
                  >
                    View all on MonadScan
                  </a>
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
