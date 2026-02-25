import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

const RPC = 'https://rpc.monad.xyz'

// ─── RPC helpers ──────────────────────────────────────────────────────────────
async function rpcCall(method: string, params: any[]): Promise<any> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })
  const data = await res.json()
  return data.result
}

async function rpcBatch(calls: object[]): Promise<any[]> {
  if (!calls.length) return []
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(calls),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const data = await res.json()
  return Array.isArray(data) ? data : [data]
}

function ethCall(to: string, data: string, id: number) {
  return { jsonrpc: '2.0', id, method: 'eth_call', params: [{ to, data }, 'latest'] }
}

// Decode uint256 from hex result
function decodeUint(hex: string): bigint {
  if (!hex || hex === '0x') return 0n
  return BigInt(hex.slice(0, 2) === '0x' ? hex : '0x' + hex)
}

// Decode int256 from hex (for health factor which can be max uint)
function decodeInt256(hex: string): bigint {
  if (!hex || hex === '0x') return 0n
  const val = BigInt(hex)
  // If > max int128, it's effectively "infinity" (no borrow)
  const MAX_SAFE = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
  return val === MAX_SAFE ? BigInt('999999999999999999') : val
}

// ─── Neverland (Aave V3 fork) ─────────────────────────────────────────────────
// Pool contract on Monad mainnet (Aave V3 interface)
// We use getUserAccountData which returns aggregate position data
const NEVERLAND_POOL = '0x3c1B89Db834A833D0Cf48Ed8d36C70bfF8f1E1E1' // Pool proxy

// nToken addresses → token info (from docs)
const NEVERLAND_TOKENS: Record<string, { symbol: string; decimals: number; isDebt: boolean }> = {
  // n-tokens (supply)
  '0xD0fd2Cf7F6CEff4F96B1161F5E995D5843326154': { symbol: 'WMON',    decimals: 18, isDebt: false },
  '0x34c43684293963c546b0aB6841008A4d3393B9ab': { symbol: 'WBTC',    decimals: 8,  isDebt: false },
  '0x31f63Ae5a96566b93477191778606BeBDC4CA66f': { symbol: 'WETH',    decimals: 18, isDebt: false },
  '0x784999fc2Dd132a41D1Cc0F1aE9805854BaD1f2D': { symbol: 'AUSD',    decimals: 18, isDebt: false },
  '0x38648958836eA88b368b4ac23b86Ad44B0fe7508': { symbol: 'USDC',    decimals: 6,  isDebt: false },
  '0x39F901c32b2E0d25AE8DEaa1ee115C748f8f6bDf': { symbol: 'USDT0',   decimals: 6,  isDebt: false },
  '0xdFC14d336aea9E49113b1356333FD374e646Bf85': { symbol: 'sMON',    decimals: 18, isDebt: false },
  '0x7f81779736968836582D31D36274Ed82053aD1AE': { symbol: 'gMON',    decimals: 18, isDebt: false },
  '0xC64d73Bb8748C6fA7487ace2D0d945B6fBb2EcDe': { symbol: 'shMON',   decimals: 18, isDebt: false },
  // variableDebt tokens
  '0x3acA285b9F57832fF55f1e6835966890845c1526': { symbol: 'WMON',    decimals: 18, isDebt: true  },
  '0x544a5fF071090F4eE3AD879435f4dC1C1eeC1873': { symbol: 'WBTC',    decimals: 8,  isDebt: true  },
  '0xdE6C157e43c5d9B713C635f439a93CA3BE2156B6': { symbol: 'WETH',    decimals: 18, isDebt: true  },
  '0x54fC077EAe1006FE3C5d01f1614802eAFCbEe57E': { symbol: 'AUSD',    decimals: 18, isDebt: true  },
  '0xb26FB5e35f6527d6f878F7784EA71774595B249C': { symbol: 'USDC',    decimals: 6,  isDebt: true  },
  '0xa2d753458946612376ce6e5704Ab1cc79153d272': { symbol: 'USDT0',   decimals: 6,  isDebt: true  },
}

// ERC20 balanceOf(address) → selector 0x70a08231
function balanceOfData(addr: string): string {
  return '0x70a08231' + addr.slice(2).toLowerCase().padStart(64, '0')
}

async function fetchNeverland(userAddress: string): Promise<any[]> {
  const tokenAddrs = Object.keys(NEVERLAND_TOKENS)
  const userLower = userAddress.toLowerCase()

  // Batch balanceOf calls for all n-tokens and debt tokens
  const calls = tokenAddrs.map((addr, i) =>
    ethCall(addr, balanceOfData(userAddress), i + 100)
  )

  // Also fetch getUserAccountData(user) from Pool
  // selector: 0xbf92857c = getUserAccountData(address)
  calls.push(ethCall(
    NEVERLAND_POOL,
    '0xbf92857c' + userAddress.slice(2).toLowerCase().padStart(64, '0'),
    999
  ))

  const results = await rpcBatch(calls)
  const balanceResults = results.filter((r: any) => r.id >= 100 && r.id < 999)
  const accountDataResult = results.find((r: any) => r.id === 999)

  // Parse balances
  const balances: Record<string, bigint> = {}
  balanceResults.forEach((r: any, i: number) => {
    balances[tokenAddrs[i]] = decodeUint(r?.result ?? '0x')
  })

  // Parse getUserAccountData:
  // returns (totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor)
  // all in 8 decimal base currency (USD-pegged)
  let totalCollateralUSD = 0
  let totalDebtUSD = 0
  let healthFactor = 0
  if (accountDataResult?.result && accountDataResult.result !== '0x') {
    const hex = accountDataResult.result.slice(2)
    const words = []
    for (let i = 0; i < hex.length; i += 64) words.push(hex.slice(i, i + 64))
    if (words.length >= 6) {
      totalCollateralUSD = Number(BigInt('0x' + words[0])) / 1e8
      totalDebtUSD       = Number(BigInt('0x' + words[1])) / 1e8
      const hfRaw        = BigInt('0x' + words[5])
      // Health factor is in 1e18. Max uint = no borrows
      if (hfRaw === BigInt('0x' + 'f'.repeat(64))) {
        healthFactor = 999
      } else {
        healthFactor = Number(hfRaw) / 1e18
      }
    }
  }

  const supplyPositions: any[] = []
  const borrowPositions: any[] = []

  for (const [addr, info] of Object.entries(NEVERLAND_TOKENS)) {
    const bal = balances[addr] ?? 0n
    if (bal === 0n) continue
    const value = Number(bal) / Math.pow(10, info.decimals)
    if (value < 0.001) continue

    if (info.isDebt) {
      borrowPositions.push({ symbol: info.symbol, amount: value, decimals: info.decimals })
    } else {
      supplyPositions.push({ symbol: info.symbol, amount: value, decimals: info.decimals })
    }
  }

  if (supplyPositions.length === 0 && borrowPositions.length === 0) return []

  return [{
    protocol: 'Neverland',
    type: 'lending',
    logo: '🌙',
    url: 'https://app.neverland.money',
    chain: 'Monad',
    supply: supplyPositions,
    borrow: borrowPositions,
    totalCollateralUSD,
    totalDebtUSD,
    netValueUSD: totalCollateralUSD - totalDebtUSD,
    healthFactor: borrowPositions.length > 0 ? healthFactor : null,
  }]
}

// ─── Morpho (GraphQL API, chainId 143) ────────────────────────────────────────
async function fetchMorpho(userAddress: string): Promise<any[]> {
  const query = `
    query UserPositions($address: String!, $chainId: Int!) {
      userByAddress(address: $address, chainId: $chainId) {
        marketPositions {
          market {
            uniqueKey
            loanAsset { symbol decimals address }
            collateralAsset { symbol decimals address }
            lltv
            state { supplyApy borrowApy }
          }
          supplyAssets
          supplyAssetsUsd
          borrowAssets
          borrowAssetsUsd
          collateral
          collateralUsd
          healthFactor
        }
        vaultPositions {
          vault {
            address
            name
            symbol
            asset { symbol decimals }
            state { apy netApy }
          }
          assets
          assetsUsd
        }
      }
    }
  `
  try {
    const res = await fetch('https://api.morpho.org/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { address: userAddress.toLowerCase(), chainId: 143 }
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    const user = data?.data?.userByAddress
    if (!user) return []

    const positions: any[] = []

    // Market positions (lending/borrowing in isolated markets)
    for (const pos of user.marketPositions ?? []) {
      const hasSupply = Number(pos.supplyAssetsUsd ?? 0) > 0.01
      const hasBorrow = Number(pos.borrowAssetsUsd ?? 0) > 0.01
      const hasCollateral = Number(pos.collateralUsd ?? 0) > 0.01
      if (!hasSupply && !hasBorrow && !hasCollateral) continue

      const loanSymbol = pos.market?.loanAsset?.symbol ?? '?'
      const collSymbol = pos.market?.collateralAsset?.symbol ?? null
      const name = collSymbol ? `${collSymbol}/${loanSymbol}` : loanSymbol

      positions.push({
        protocol: 'Morpho',
        type: 'lending',
        logo: '🦋',
        url: 'https://app.morpho.org',
        chain: 'Monad',
        label: name,
        supply: hasSupply ? [{
          symbol: loanSymbol,
          amountUSD: Number(pos.supplyAssetsUsd),
          apy: pos.market?.state?.supplyApy ? Number(pos.market.state.supplyApy) * 100 : 0,
        }] : [],
        borrow: hasBorrow ? [{
          symbol: loanSymbol,
          amountUSD: Number(pos.borrowAssetsUsd),
          apy: pos.market?.state?.borrowApy ? Number(pos.market.state.borrowApy) * 100 : 0,
        }] : [],
        collateral: hasCollateral ? [{
          symbol: collSymbol,
          amountUSD: Number(pos.collateralUsd),
        }] : [],
        totalCollateralUSD: Number(pos.collateralUsd ?? 0),
        totalDebtUSD: Number(pos.borrowAssetsUsd ?? 0),
        netValueUSD: Number(pos.collateralUsd ?? 0) + Number(pos.supplyAssetsUsd ?? 0) - Number(pos.borrowAssetsUsd ?? 0),
        healthFactor: pos.healthFactor ? Number(pos.healthFactor) : null,
      })
    }

    // Vault positions (earn/yield vaults)
    for (const pos of user.vaultPositions ?? []) {
      const usd = Number(pos.assetsUsd ?? 0)
      if (usd < 0.01) continue
      positions.push({
        protocol: 'Morpho',
        type: 'vault',
        logo: '🦋',
        url: 'https://app.morpho.org',
        chain: 'Monad',
        label: pos.vault?.name ?? pos.vault?.symbol ?? 'Vault',
        asset: pos.vault?.asset?.symbol ?? '?',
        amountUSD: usd,
        apy: pos.vault?.state?.netApy ? Number(pos.vault.state.netApy) * 100 : 0,
        netValueUSD: usd,
      })
    }

    return positions
  } catch {
    return []
  }
}

// ─── Curve Finance on Monad ───────────────────────────────────────────────────
// Curve deploys via factories. We check known LP token balances via ERC20.
// Curve on Monad: factory address derived from docs + known pools
// We use balanceOf on LP tokens to detect LP positions
// The main Curve factory on Monad (same address as other chains after genesis deployment)
const CURVE_FACTORY = '0x6A8cbed756804B16E05E741eDaBb5B3A4e9f4cB'
// Known LP token addresses on Monad (stableswap pools)
const CURVE_LP_TOKENS: Record<string, { name: string; tokens: string[] }> = {
  // These will be populated as pools launch; for now we query the factory
  // Placeholder - we'll dynamically detect via transfer events / factory
}

async function fetchCurve(userAddress: string): Promise<any[]> {
  // Query Curve's API for Monad pools (curve has a REST API)
  try {
    const res = await fetch(
      `https://api.curve.fi/v1/getLiquidityProviderData/${userAddress}/monad`,
      { signal: AbortSignal.timeout(8_000), cache: 'no-store' }
    )
    if (!res.ok) return []
    const data = await res.json()
    const positions: any[] = []

    for (const pool of data?.data?.lpData ?? []) {
      const usd = Number(pool.liquidityUsd ?? pool.lpTokensValueUsd ?? 0)
      if (usd < 0.01) continue

      const tokens: string[] = pool.coins?.map((c: any) => c.symbol) ?? []
      positions.push({
        protocol: 'Curve',
        type: 'liquidity',
        logo: '🌊',
        url: `https://curve.fi/#/monad/pools/${pool.poolAddress ?? ''}`,
        chain: 'Monad',
        label: pool.poolName ?? tokens.join('/'),
        tokens,
        amountUSD: usd,
        apy: Number(pool.apy ?? pool.gaugeApy ?? 0),
        netValueUSD: usd,
      })
    }

    return positions
  } catch {
    return []
  }
}

// ─── Gearbox on Monad ─────────────────────────────────────────────────────────
// Gearbox uses Credit Accounts (credit manager pattern)
// Their API: gearbox.finance API or subgraph
async function fetchGearbox(userAddress: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.gearbox.fi/v2/accounts/${userAddress}?network=monad`,
      { signal: AbortSignal.timeout(8_000), cache: 'no-store' }
    )
    if (!res.ok) return []
    const data = await res.json()
    const positions: any[] = []

    for (const account of data?.accounts ?? data?.creditAccounts ?? []) {
      const totalUSD  = Number(account.totalValueUsd ?? account.totalValue ?? 0)
      const debtUSD   = Number(account.borrowedAmountUsd ?? account.debt ?? 0)
      const healthFactor = account.healthFactor ? Number(account.healthFactor) : null

      if (totalUSD < 0.01) continue

      positions.push({
        protocol: 'Gearbox',
        type: 'lending',
        logo: '⚙️',
        url: 'https://app.gearbox.fi',
        chain: 'Monad',
        label: account.creditManagerName ?? account.manager ?? 'Credit Account',
        totalCollateralUSD: totalUSD,
        totalDebtUSD: debtUSD,
        netValueUSD: totalUSD - debtUSD,
        healthFactor,
        supply: [],
        borrow: debtUSD > 0 ? [{ symbol: account.borrowedToken ?? 'USDC', amountUSD: debtUSD }] : [],
      })
    }

    return positions
  } catch {
    return []
  }
}

// ─── Upshift (ERC4626 vaults) ─────────────────────────────────────────────────
// Upshift uses vault tokens (ERC4626). We check known vault addresses on Monad.
// The earnAUSD vault is live: AUSD → earnAUSD
const UPSHIFT_VAULTS: Array<{ address: string; name: string; asset: string; decimals: number }> = [
  {
    address: '0x103222f020e98Bba0AD9809A011FDF8e6F067496', // earnAUSD (also listed in Neverland docs)
    name: 'earnAUSD Vault',
    asset: 'AUSD',
    decimals: 18,
  },
]

// ERC4626 functions:
// balanceOf(address) → 0x70a08231
// convertToAssets(shares) → 0x07a2d13a
async function fetchUpshift(userAddress: string): Promise<any[]> {
  const calls = UPSHIFT_VAULTS.flatMap((vault, i) => [
    ethCall(vault.address, balanceOfData(userAddress), i * 2 + 200),
  ])

  try {
    const results = await rpcBatch(calls)
    const positions: any[] = []

    for (let i = 0; i < UPSHIFT_VAULTS.length; i++) {
      const vault = UPSHIFT_VAULTS[i]
      const sharesResult = results.find((r: any) => r.id === i * 2 + 200)
      const shares = decodeUint(sharesResult?.result ?? '0x')
      if (shares === 0n) continue

      // For simplicity, treat shares ≈ assets (earnAUSD ≈ 1:1 with AUSD ≈ $1)
      const amount = Number(shares) / Math.pow(10, vault.decimals)
      if (amount < 0.001) continue

      positions.push({
        protocol: 'Upshift',
        type: 'vault',
        logo: '🔺',
        url: 'https://app.upshift.finance',
        chain: 'Monad',
        label: vault.name,
        asset: vault.asset,
        amountUSD: amount, // AUSD ≈ $1
        apy: 0, // Would need separate API call
        netValueUSD: amount,
      })
    }

    return positions
  } catch {
    return []
  }
}

// ─── Price helper (CoinGecko or MON price for valuation) ──────────────────────
async function getMonPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd',
      { next: { revalidate: 60 } }
    )
    const data = await res.json()
    return data?.monad?.usd ?? 0
  } catch { return 0 }
}

// ─── Main Route ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  try {
    const [monPrice, neverlandPositions, morphoPositions, curvePositions, gearboxPositions, upshiftPositions] =
      await Promise.allSettled([
        getMonPrice(),
        fetchNeverland(address),
        fetchMorpho(address),
        fetchCurve(address),
        fetchGearbox(address),
        fetchUpshift(address),
      ])

    const MON_PRICE = (monPrice.status === 'fulfilled' ? monPrice.value : 0) as number

    const allPositions = [
      ...(neverlandPositions.status === 'fulfilled' ? neverlandPositions.value : []),
      ...(morphoPositions.status === 'fulfilled' ? morphoPositions.value : []),
      ...(curvePositions.status === 'fulfilled' ? curvePositions.value : []),
      ...(gearboxPositions.status === 'fulfilled' ? gearboxPositions.value : []),
      ...(upshiftPositions.status === 'fulfilled' ? upshiftPositions.value : []),
    ]

    // Apply MON price to Neverland positions that have MON-denominated values
    // (getUserAccountData returns USD-base via oracle, so we're already in USD)

    const totalValueUSD = allPositions.reduce((s, p) => s + (p.netValueUSD ?? 0), 0)
    const totalDebtUSD  = allPositions.reduce((s, p) => s + (p.totalDebtUSD ?? 0), 0)
    const totalSupplyUSD = allPositions.reduce((s, p) => s + (p.totalCollateralUSD ?? p.amountUSD ?? 0), 0)
    const activeProtocols = [...new Set(allPositions.map(p => p.protocol))]

    return NextResponse.json({
      positions: allPositions,
      summary: {
        totalValueUSD,
        totalDebtUSD,
        totalSupplyUSD,
        netValueUSD: totalValueUSD,
        activeProtocols,
        monPrice: MON_PRICE,
      },
    })
  } catch (err: any) {
    console.error('[defi]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Failed', positions: [], summary: {} }, { status: 500 })
  }
}
