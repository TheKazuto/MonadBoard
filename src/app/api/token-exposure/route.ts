import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

// ─── Known Monad Mainnet token contracts ─────────────────────────────────────
const KNOWN_TOKENS = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    contract: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
    decimals: 6,
    coingeckoId: 'usd-coin',
    color: '#2775CA',
  },
  {
    symbol: 'WETH',
    name: 'Wrapped ETH',
    contract: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242',
    decimals: 18,
    coingeckoId: 'weth',
    color: '#627EEA',
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    contract: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D',
    decimals: 6,
    coingeckoId: 'tether',
    color: '#26A17B',
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped BTC',
    contract: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
    decimals: 8,
    coingeckoId: 'wrapped-bitcoin',
    color: '#F7931A',
  },
  {
    symbol: 'WMON',
    name: 'Wrapped MON',
    contract: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
    decimals: 18,
    coingeckoId: 'monad',
    color: '#836EF9',
  },
  {
    symbol: 'AUSD',
    name: 'Agora USD',
    contract: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
    decimals: 6,
    coingeckoId: 'agora-dollar',
    color: '#FF6B35',
  },
]

const RPC = 'https://rpc.monad.xyz'

// ERC-20 balanceOf(address) selector = 0x70a08231
function buildBalanceOfCall(tokenContract: string, walletAddress: string) {
  const paddedAddress = walletAddress.slice(2).toLowerCase().padStart(64, '0')
  return {
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [
      {
        to: tokenContract,
        data: '0x70a08231' + paddedAddress,
      },
      'latest',
    ],
    id: tokenContract,
  }
}

async function rpcBatch(calls: object[]): Promise<any[]> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calls),
    cache: 'no-store',
  })
  return res.json()
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  try {
    // ── 1. Fetch MON native balance + all ERC-20 balances in parallel ──────────
    const erc20Calls = KNOWN_TOKENS.map((t) =>
      buildBalanceOfCall(t.contract, address)
    )
    const nativeCall = {
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [address, 'latest'],
      id: 'native',
    }

    const [nativeRes, ...erc20Responses] = await Promise.all([
      fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nativeCall),
        cache: 'no-store',
      }).then((r) => r.json()),
      ...(await rpcBatch(erc20Calls)),
    ])

    // ── 2. Parse raw balances ──────────────────────────────────────────────────
    const rawMON = nativeRes?.result
      ? Number(BigInt(nativeRes.result)) / 1e18
      : 0

    const tokenBalances = KNOWN_TOKENS.map((token, i) => {
      const raw = erc20Responses[i]?.result
      if (!raw || raw === '0x' || raw === '0x0') return { ...token, balance: 0 }
      const balance = Number(BigInt(raw)) / Math.pow(10, token.decimals)
      return { ...token, balance }
    })

    // ── 3. Fetch prices from CoinGecko (free, no key) ─────────────────────────
    const coinIds = [
      'monad', // MON native
      ...KNOWN_TOKENS.map((t) => t.coingeckoId),
    ].join(',')

    let prices: Record<string, number> = {}
    try {
      const priceRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`,
        { next: { revalidate: 60 } }
      )
      const priceData = await priceRes.json()
      for (const [id, val] of Object.entries(priceData)) {
        prices[id] = (val as any).usd ?? 0
      }
    } catch {
      // fallback prices if CoinGecko fails
      prices = {
        monad: 0.02,
        'usd-coin': 1.0,
        weth: 2300,
        tether: 1.0,
        'wrapped-bitcoin': 85000,
        'agora-dollar': 1.0,
      }
    }

    // ── 4. Calculate USD values ────────────────────────────────────────────────
    const monPrice = prices['monad'] ?? 0.02
    const monValue = rawMON * monPrice

    const tokens: {
      symbol: string
      name: string
      balance: number
      price: number
      value: number
      color: string
    }[] = []

    // Add MON native
    if (rawMON > 0.0001) {
      tokens.push({
        symbol: 'MON',
        name: 'Monad',
        balance: rawMON,
        price: monPrice,
        value: monValue,
        color: '#836EF9',
      })
    }

    // Add ERC-20 tokens with balance > dust
    for (const token of tokenBalances) {
      const price = prices[token.coingeckoId] ?? 0
      const value = token.balance * price
      if (token.balance > 0.0001 || value > 0.01) {
        tokens.push({
          symbol: token.symbol,
          name: token.name,
          balance: token.balance,
          price,
          value,
          color: token.color,
        })
      }
    }

    // ── 5. Sort by value desc + compute percentages ───────────────────────────
    tokens.sort((a, b) => b.value - a.value)
    const totalValue = tokens.reduce((sum, t) => sum + t.value, 0)

    const result = tokens.map((t) => ({
      ...t,
      percentage: totalValue > 0 ? (t.value / totalValue) * 100 : 0,
    }))

    return NextResponse.json({
      tokens: result,
      totalValue,
      address,
    })
  } catch (err) {
    console.error('[token-exposure] error:', err)
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 })
  }
}
