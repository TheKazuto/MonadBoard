// Mock data for prototype - replace with real API calls

export const mockWalletData = {
  address: '0x742d...8f3c',
  totalValueUSD: 12847.53,
  nftValueUSD: 2340.00,
  totalAssets: 15187.53,
  totalDebt: 0,
  change24h: 3.42,
  changeAmount24h: 424.73,
}

export const mockTokens = [
  { symbol: 'MON', name: 'Monad', balance: 5420.5, price: 1.24, value: 6721.42, change24h: 5.2, percentage: 52.3, logo: '🟣', contract: '0x0000...0000' },
  { symbol: 'USDC', name: 'USD Coin', balance: 2100.0, price: 1.00, value: 2100.00, change24h: 0.01, percentage: 16.3, logo: '🔵', contract: '0x1234...5678' },
  { symbol: 'WETH', name: 'Wrapped ETH', balance: 1.02, price: 2480.50, value: 2530.11, change24h: -1.8, percentage: 19.7, logo: '💎', contract: '0xabcd...ef01' },
  { symbol: 'WBTC', name: 'Wrapped BTC', balance: 0.038, price: 67200.00, value: 2553.60, change24h: 2.1, percentage: 19.9, logo: '🟠', contract: '0x2345...6789' },
  { symbol: 'USDT', name: 'Tether', balance: 842.4, price: 1.00, value: 842.40, change24h: 0.0, percentage: 6.6, logo: '🟢', contract: '0x3456...7890' },
]

export const mockNFTs = [
  { id: 1, name: 'MonadPunks #1337', collection: 'MonadPunks', floorPrice: 0.8, valueUSD: 1984.00, image: null },
  { id: 2, name: 'Monad Apes #420', collection: 'Monad Apes', floorPrice: 0.15, valueUSD: 372.00, image: null },
  { id: 3, name: 'NadPets #69', collection: 'NadPets', floorPrice: 0.0, valueUSD: 0, image: null },
]

export const mockTransactions = [
  { id: '1', type: 'receive', hash: '0xabc...123', from: '0x1234...5678', to: '0x742d...8f3c', amount: '500 USDC', valueUSD: 500, timestamp: new Date(Date.now() - 1000 * 60 * 12), status: 'success', protocol: null },
  { id: '2', type: 'swap', hash: '0xdef...456', from: '0x742d...8f3c', to: '0xSwap...pool', amount: '1 WETH → 2480 USDC', valueUSD: 2480, timestamp: new Date(Date.now() - 1000 * 60 * 45), status: 'success', protocol: 'MonadSwap' },
  { id: '3', type: 'send', hash: '0xghi...789', from: '0x742d...8f3c', to: '0x9876...5432', amount: '100 MON', valueUSD: 124, timestamp: new Date(Date.now() - 1000 * 60 * 120), status: 'success', protocol: null },
  { id: '4', type: 'defi', hash: '0xjkl...012', from: '0x742d...8f3c', to: '0xLend...pool', amount: 'Deposit 500 USDC', valueUSD: 500, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), status: 'success', protocol: 'MonadLend' },
  { id: '5', type: 'receive', hash: '0xmno...345', from: '0xReward...pool', to: '0x742d...8f3c', amount: '13.01 USDC', valueUSD: 13.01, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8), status: 'success', protocol: 'MonadLend' },
  { id: '6', type: 'nft', hash: '0xpqr...678', from: '0xME...market', to: '0x742d...8f3c', amount: 'MonadPunks #1337', valueUSD: 1984, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), status: 'success', protocol: 'MagicEden' },
]

export const mockDeFiPositions = [
  { protocol: 'MonadLend', type: 'Lending', position: 'Supply USDC', value: 2100.00, apy: 8.4, percentage: 62.3, logo: '🏦', chain: 'Monad' },
  { protocol: 'MonadSwap', type: 'Liquidity Pool', position: 'MON/USDC LP', value: 840.00, apy: 24.7, percentage: 24.9, logo: '🔄', chain: 'Monad' },
  { protocol: 'NadStake', type: 'Staking', position: 'Stake MON', value: 430.00, apy: 12.1, percentage: 12.8, logo: '⚡', chain: 'Monad' },
]

export const mockPortfolioHistory = (() => {
  const data = []
  const now = Date.now()
  const days = 365
  let value = 8000
  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000)
    const change = (Math.random() - 0.45) * 300
    value = Math.max(5000, value + change)
    data.push({
      date: date.toISOString().split('T')[0],
      value: Math.round(value * 100) / 100,
    })
  }
  // Set final value close to current
  data[data.length - 1].value = 12847.53
  return data
})()

export const mockTopTokens = [
  { rank: 1, symbol: 'MON', name: 'Monad', price: 1.24, marketCap: 1240000000, change24h: 5.2, volume24h: 48000000, logo: '🟣' },
  { rank: 2, symbol: 'WMON', name: 'Wrapped Monad', price: 1.24, marketCap: 480000000, change24h: 5.1, volume24h: 12000000, logo: '🔮' },
  { rank: 3, symbol: 'USDC', name: 'USD Coin', price: 1.00, marketCap: 380000000, change24h: 0.01, volume24h: 95000000, logo: '🔵' },
  { rank: 4, symbol: 'WETH', name: 'Wrapped ETH', price: 2480.50, marketCap: 290000000, change24h: -1.8, volume24h: 28000000, logo: '💎' },
  { rank: 5, symbol: 'NADPETS', name: 'NadPets', price: 0.042, marketCap: 42000000, change24h: 18.3, volume24h: 8400000, logo: '🐾' },
  { rank: 6, symbol: 'SHMON', name: 'SharbiMon', price: 0.00012, marketCap: 38000000, change24h: -3.4, volume24h: 5100000, logo: '🐶' },
  { rank: 7, symbol: 'KMON', name: 'KittyMon', price: 0.0034, marketCap: 24000000, change24h: 7.8, volume24h: 3200000, logo: '🐱' },
  { rank: 8, symbol: 'MSWAP', name: 'MonadSwap', price: 0.87, marketCap: 18700000, change24h: 2.3, volume24h: 2100000, logo: '🔄' },
  { rank: 9, symbol: 'MLEND', name: 'MonadLend', price: 2.14, marketCap: 14300000, change24h: -0.9, volume24h: 1800000, logo: '🏦' },
  { rank: 10, symbol: 'MNFT', name: 'MonadNFT', price: 0.31, marketCap: 9800000, change24h: 11.4, volume24h: 980000, logo: '🖼️' },
]

export const mockFearGreed = {
  value: 72,
  label: 'Greed',
  previousValue: 65,
  weekAgo: 58,
  monthAgo: 42,
}

export const mockMonadPrice = {
  price: 1.24,
  change24h: 5.2,
  changeAmount: 0.062,
}

export const CHART_COLORS = [
  '#836EF9', '#B9AEFC', '#6d28d9', '#a78bfa', '#c4b5fd',
  '#ddd6fe', '#ede9fe', '#8b5cf6', '#7c3aed', '#4c1d95'
]

export const TX_ICONS: Record<string, string> = {
  receive: '↓',
  send: '↑',
  swap: '⇄',
  defi: '⚡',
  nft: '🖼',
  contract: '📋',
}

export const TX_COLORS: Record<string, string> = {
  receive: 'text-emerald-600 bg-emerald-50',
  send: 'text-red-500 bg-red-50',
  swap: 'text-violet-600 bg-violet-50',
  defi: 'text-amber-600 bg-amber-50',
  nft: 'text-blue-600 bg-blue-50',
  contract: 'text-gray-600 bg-gray-50',
}

export function formatCurrency(value: number, decimals = 2): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`
  return `$${value.toFixed(decimals)}`
}

export function formatTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
