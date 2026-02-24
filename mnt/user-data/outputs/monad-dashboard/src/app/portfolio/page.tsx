'use client'

import { mockTokens, mockNFTs, mockWalletData, formatCurrency, CHART_COLORS } from '@/lib/mockData'
import { TrendingUp, TrendingDown, Image, Coins } from 'lucide-react'

export default function PortfolioPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-gray-900" style={{ fontFamily: 'Sora, sans-serif' }}>
          Portfolio
        </h1>
        <p className="text-gray-500 text-sm mt-1">All tokens and NFTs in your wallet</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Token Value', value: formatCurrency(mockWalletData.totalValueUSD - mockWalletData.nftValueUSD), icon: '🪙', color: 'from-violet-500 to-purple-700' },
          { label: 'NFT Value', value: formatCurrency(mockWalletData.nftValueUSD), icon: '🖼️', color: 'from-blue-500 to-indigo-700' },
          { label: 'Total Assets', value: formatCurrency(mockWalletData.totalAssets), icon: '💼', color: 'from-emerald-500 to-teal-700' },
          { label: '24h Change', value: `+${mockWalletData.change24h.toFixed(2)}%`, icon: '📈', color: 'from-amber-500 to-orange-600' },
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center text-sm`}>
                {stat.icon}
              </div>
              <p className="text-xs text-gray-400 font-medium">{stat.label}</p>
            </div>
            <p className="font-display font-bold text-xl text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Token Table */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Coins size={18} className="text-violet-600" />
          <h2 className="font-display font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>Tokens</h2>
          <span className="nft-badge">{mockTokens.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-3 text-left font-medium">Token</th>
                <th className="pb-3 text-right font-medium">Price</th>
                <th className="pb-3 text-right font-medium hidden md:table-cell">Balance</th>
                <th className="pb-3 text-right font-medium">Value</th>
                <th className="pb-3 text-right font-medium">24h</th>
                <th className="pb-3 text-right font-medium hidden lg:table-cell">Allocation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mockTokens.map((token, i) => {
                const isPositive = token.change24h >= 0
                return (
                  <tr key={token.symbol} className="hover:bg-violet-50/40 transition-colors">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg" style={{ background: `${CHART_COLORS[i]}22` }}>
                          {token.logo}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{token.symbol}</p>
                          <p className="text-xs text-gray-400 hidden sm:block">{token.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-right font-mono text-gray-700 text-sm">
                      {token.price < 1 ? `$${token.price.toFixed(4)}` : `$${token.price.toFixed(2)}`}
                    </td>
                    <td className="py-3 text-right text-gray-600 hidden md:table-cell">
                      {token.balance.toLocaleString()}
                    </td>
                    <td className="py-3 text-right font-semibold text-gray-800">
                      {formatCurrency(token.value)}
                    </td>
                    <td className={`py-3 text-right font-semibold text-sm ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                      {isPositive ? '+' : ''}{token.change24h.toFixed(1)}%
                    </td>
                    <td className="py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-20 progress-bar">
                          <div className="progress-fill" style={{ width: `${token.percentage}%`, background: CHART_COLORS[i] }} />
                        </div>
                        <span className="text-xs text-gray-400 w-8 text-right">{token.percentage.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* NFT Grid */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Image size={18} className="text-violet-600" />
          <h2 className="font-display font-semibold text-gray-800" style={{ fontFamily: 'Sora, sans-serif' }}>NFTs</h2>
          <span className="nft-badge">{mockNFTs.length}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {mockNFTs.map((nft) => (
            <div key={nft.id} className="border border-violet-100 rounded-xl overflow-hidden hover:border-violet-300 hover:shadow-md transition-all cursor-pointer group">
              <div className="aspect-square bg-gradient-to-br from-violet-100 to-purple-200 flex items-center justify-center text-5xl group-hover:scale-105 transition-transform">
                🖼️
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold text-gray-800 truncate">{nft.name}</p>
                <p className="text-xs text-gray-400 mb-1">{nft.collection}</p>
                {nft.valueUSD > 0 ? (
                  <p className="text-sm font-bold text-violet-700">{formatCurrency(nft.valueUSD)}</p>
                ) : (
                  <p className="text-xs text-gray-400">No floor price</p>
                )}
              </div>
            </div>
          ))}
          {/* Add NFT placeholder */}
          <div className="border-2 border-dashed border-violet-200 rounded-xl flex flex-col items-center justify-center p-6 text-center hover:border-violet-400 transition-colors cursor-pointer">
            <span className="text-3xl mb-2">✨</span>
            <p className="text-xs text-violet-400 font-medium">More NFTs</p>
            <p className="text-xs text-gray-400">coming soon</p>
          </div>
        </div>
      </div>
    </div>
  )
}
