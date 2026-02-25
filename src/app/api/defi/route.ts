import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 0

const RPC = 'https://rpc.monad.xyz'

// ─── RPC helpers ──────────────────────────────────────────────────────────────
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

function decodeUint(hex: string): bigint {
  if (!hex || hex === '0x') return 0n
  try { return BigInt(hex.startsWith('0x') ? hex : '0x' + hex) } catch { return 0n }
}

function balanceOfData(addr: string): string {
  return '0x70a08231' + addr.slice(2).toLowerCase().padStart(64, '0')
}

// ─── NEVERLAND (Aave V3) ─────────────────────────────────────────────────────
// getUserAccountData → aggregate USD values + health factor
const NEVERLAND_POOL = '0x3c1B89Db834A833D0Cf48Ed8d36C70bFf8f1E1E1'

const NEVERLAND_NTOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0xD0fd2Cf7F6CEff4F96B1161F5E995D5843326154': { symbol: 'WMON',  decimals: 18 },
  '0x34c43684293963c546b0aB6841008A4d3393B9ab': { symbol: 'WBTC',  decimals: 8  },
  '0x31f63Ae5a96566b93477191778606BeBDC4CA66f': { symbol: 'WETH',  decimals: 18 },
  '0x784999fc2Dd132a41D1Cc0F1aE9805854BaD1f2D': { symbol: 'AUSD',  decimals: 18 },
  '0x38648958836eA88b368b4ac23b86Ad44B0fe7508': { symbol: 'USDC',  decimals: 6  },
  '0x39F901c32b2E0d25AE8DEaa1ee115C748f8f6bDf': { symbol: 'USDT0', decimals: 6  },
  '0xdFC14d336aea9E49113b1356333FD374e646Bf85': { symbol: 'sMON',  decimals: 18 },
  '0x7f81779736968836582D31D36274Ed82053aD1AE': { symbol: 'gMON',  decimals: 18 },
  '0xC64d73Bb8748C6fA7487ace2D0d945B6fBb2EcDe': { symbol: 'shMON', decimals: 18 },
}
const NEVERLAND_DEBT_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0x3acA285b9F57832fF55f1e6835966890845c1526': { symbol: 'WMON',  decimals: 18 },
  '0x544a5fF071090F4eE3AD879435f4dC1C1eeC1873': { symbol: 'WBTC',  decimals: 8  },
  '0xdE6C157e43c5d9B713C635f439a93CA3BE2156B6': { symbol: 'WETH',  decimals: 18 },
  '0x54fC077EAe1006FE3C5d01f1614802eAFCbEe57E': { symbol: 'AUSD',  decimals: 18 },
  '0xb26FB5e35f6527d6f878F7784EA71774595B249C': { symbol: 'USDC',  decimals: 6  },
  '0xa2d753458946612376ce6e5704Ab1cc79153d272': { symbol: 'USDT0', decimals: 6  },
}

async function fetchNeverland(user: string): Promise<any[]> {
  const supplyAddrs = Object.keys(NEVERLAND_NTOKENS)
  const debtAddrs   = Object.keys(NEVERLAND_DEBT_TOKENS)
  const allAddrs    = [...supplyAddrs, ...debtAddrs]

  const calls = allAddrs.map((a, i) => ethCall(a, balanceOfData(user), i + 100))
  // getUserAccountData(address) → 0xbf92857c
  calls.push(ethCall(NEVERLAND_POOL,
    '0xbf92857c' + user.slice(2).toLowerCase().padStart(64, '0'), 999))
  // getReservesList() → 0xd1946dbc (to get APYs per reserve via getReserveData)
  // We'll skip per-asset APY for simplicity and rely on account totals

  let results: any[]
  try { results = await rpcBatch(calls) } catch { return [] }

  const acctRes = results.find((r: any) => r.id === 999)
  let totalCollateralUSD = 0, totalDebtUSD = 0, healthFactor = Infinity
  if (acctRes?.result && acctRes.result !== '0x') {
    const hex = acctRes.result.slice(2)
    const w = Array.from({ length: 6 }, (_, i) => hex.slice(i * 64, (i + 1) * 64))
    totalCollateralUSD = Number(BigInt('0x' + w[0])) / 1e8
    totalDebtUSD       = Number(BigInt('0x' + w[1])) / 1e8
    const hfRaw        = BigInt('0x' + w[5])
    healthFactor = hfRaw >= BigInt('0x' + 'f'.repeat(64)) / 2n ? 999 : Number(hfRaw) / 1e18
  }

  const supplyList: any[]  = []
  const borrowList: any[]  = []

  supplyAddrs.forEach((addr, i) => {
    const bal = decodeUint(results.find((r: any) => r.id === i + 100)?.result ?? '0x')
    if (bal === 0n) return
    const info = NEVERLAND_NTOKENS[addr]
    const amount = Number(bal) / Math.pow(10, info.decimals)
    if (amount >= 0.001) supplyList.push({ symbol: info.symbol, amount })
  })
  debtAddrs.forEach((addr, i) => {
    const bal = decodeUint(results.find((r: any) => r.id === (supplyAddrs.length + i) + 100)?.result ?? '0x')
    if (bal === 0n) return
    const info = NEVERLAND_DEBT_TOKENS[addr]
    const amount = Number(bal) / Math.pow(10, info.decimals)
    if (amount >= 0.001) borrowList.push({ symbol: info.symbol, amount })
  })

  if (!supplyList.length && !borrowList.length) return []

  return [{
    protocol: 'Neverland',
    type: 'lending',
    logo: '🌙',
    url: 'https://app.neverland.money',
    chain: 'Monad',
    supply: supplyList,
    borrow: borrowList,
    totalCollateralUSD,
    totalDebtUSD,
    netValueUSD: totalCollateralUSD - totalDebtUSD,
    healthFactor: borrowList.length > 0 ? healthFactor : null,
  }]
}

// ─── MORPHO ───────────────────────────────────────────────────────────────────
async function fetchMorpho(user: string): Promise<any[]> {
  const query = `query($addr:String!,$cid:Int!){userByAddress(address:$addr,chainId:$cid){marketPositions{market{uniqueKey loanAsset{symbol decimals}collateralAsset{symbol decimals}state{supplyApy borrowApy}}supplyAssets supplyAssetsUsd borrowAssets borrowAssetsUsd collateral collateralUsd healthFactor}vaultPositions{vault{address name symbol asset{symbol decimals}state{netApy}}assets assetsUsd}}}`
  try {
    const res = await fetch('https://api.morpho.org/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { addr: user.toLowerCase(), cid: 143 } }),
      signal: AbortSignal.timeout(10_000), cache: 'no-store',
    })
    const data = await res.json()
    const u = data?.data?.userByAddress
    if (!u) return []
    const out: any[] = []

    for (const p of u.marketPositions ?? []) {
      const supUSD = Number(p.supplyAssetsUsd ?? 0)
      const borUSD = Number(p.borrowAssetsUsd ?? 0)
      const colUSD = Number(p.collateralUsd ?? 0)
      if (supUSD < 0.01 && borUSD < 0.01 && colUSD < 0.01) continue
      const loanSym  = p.market?.loanAsset?.symbol ?? '?'
      const collSym  = p.market?.collateralAsset?.symbol
      const supplyApy = p.market?.state?.supplyApy ? Number(p.market.state.supplyApy) * 100 : 0
      const borrowApy = p.market?.state?.borrowApy ? Number(p.market.state.borrowApy) * 100 : 0
      out.push({
        protocol: 'Morpho', type: 'lending', logo: '🦋',
        url: 'https://app.morpho.org', chain: 'Monad',
        label: collSym ? `${collSym}/${loanSym}` : loanSym,
        supply:    supUSD > 0.01 ? [{ symbol: loanSym, amountUSD: supUSD, apy: supplyApy }] : [],
        collateral: colUSD > 0.01 ? [{ symbol: collSym, amountUSD: colUSD }] : [],
        borrow:    borUSD > 0.01 ? [{ symbol: loanSym, amountUSD: borUSD, apr: borrowApy }] : [],
        totalCollateralUSD: colUSD + supUSD,
        totalDebtUSD: borUSD,
        netValueUSD: colUSD + supUSD - borUSD,
        healthFactor: p.healthFactor ? Number(p.healthFactor) : null,
      })
    }
    for (const p of u.vaultPositions ?? []) {
      const usd = Number(p.assetsUsd ?? 0)
      if (usd < 0.01) continue
      out.push({
        protocol: 'Morpho', type: 'vault', logo: '🦋',
        url: 'https://app.morpho.org', chain: 'Monad',
        label: p.vault?.name ?? p.vault?.symbol,
        asset: p.vault?.asset?.symbol,
        amountUSD: usd, apy: p.vault?.state?.netApy ? Number(p.vault.state.netApy) * 100 : 0,
        netValueUSD: usd,
      })
    }
    return out
  } catch { return [] }
}

// ─── UNISWAP V3 ───────────────────────────────────────────────────────────────
// NonfungiblePositionManager: 0x7197e214c0b767cfb76fb734ab638e2c192f4e53
// balanceOf → 0x70a08231, tokenOfOwnerByIndex(addr,i) → 0x2f745c59, positions(tokenId) → 0x99fbab88
const UNI_NFT_PM = '0x7197e214c0b767cfb76fb734ab638e2c192f4e53'
const UNI_FACTORY = '0x204faca1764b154221e35c0d20abb3c525710498'

function tokenOfOwnerByIndex(owner: string, idx: bigint): string {
  return '0x2f745c59' + owner.slice(2).toLowerCase().padStart(64, '0') + idx.toString(16).padStart(64, '0')
}
function positionsData(tokenId: bigint): string {
  return '0x99fbab88' + tokenId.toString(16).padStart(64, '0')
}
// getPool(t0,t1,fee) → 0x1698ee82
function getPoolData(t0: string, t1: string, fee: number): string {
  return '0x1698ee82' + t0.slice(2).toLowerCase().padStart(64, '0') + t1.slice(2).toLowerCase().padStart(64, '0') + fee.toString(16).padStart(64, '0')
}
// slot0() → 0x3850c7bd
const SLOT0_SIG = '0x3850c7bd'

// Known token symbols on Monad
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0x3bd359c1119da7da1d913d1c4d2b7c461115433a': { symbol: 'WMON',  decimals: 18 },
  '0x0555e30da8f98308edb960aa94c0db47230d2b9c': { symbol: 'WBTC',  decimals: 8  },
  '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242': { symbol: 'WETH',  decimals: 18 },
  '0x00000000efe302beaa2b3e6e1b18d08d69a9012a': { symbol: 'AUSD',  decimals: 18 },
  '0x754704bc059f8c67012fed69bc8a327a5aafb603': { symbol: 'USDC',  decimals: 6  },
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': { symbol: 'USDT0', decimals: 6  },
  '0xa3227c5969757783154c60bf0bc1944180ed81b9': { symbol: 'sMON',  decimals: 18 },
  '0x8498312a6b3cbd158bf0c93abdcf29e6e4f55081': { symbol: 'gMON',  decimals: 18 },
  '0x1b68626dca36c7fe922fd2d55e4f631d962de19c': { symbol: 'shMON', decimals: 18 },
}

function decodeAddress(hex: string): string {
  return '0x' + hex.slice(2).slice(-40)
}

async function fetchUniswapV3(user: string): Promise<any[]> {
  try {
    // 1. Get balance of LP NFTs
    const balRes = await rpcBatch([ethCall(UNI_NFT_PM, balanceOfData(user), 1)])
    const nftCount = Number(decodeUint(balRes[0]?.result ?? '0x'))
    if (nftCount === 0) return []

    // 2. Get tokenIds (max 20 to avoid overload)
    const limit = Math.min(nftCount, 20)
    const idCalls = Array.from({ length: limit }, (_, i) =>
      ethCall(UNI_NFT_PM, tokenOfOwnerByIndex(user, BigInt(i)), i + 10))
    const idResults = await rpcBatch(idCalls)
    const tokenIds = idResults.map((r: any) => decodeUint(r?.result ?? '0x')).filter(id => id > 0n)

    // 3. Get position data for each tokenId
    const posCalls = tokenIds.map((id, i) => ethCall(UNI_NFT_PM, positionsData(id), i + 200))
    const posResults = await rpcBatch(posCalls)

    // positions() returns:
    // (uint96 nonce, address operator, address token0, address token1, uint24 fee,
    //  int24 tickLower, int24 tickUpper, uint128 liquidity, ...)
    const positions: any[] = []
    const poolCalls: object[] = []
    const poolCallMap: Record<number, { idx: number; tickLower: number; tickUpper: number; t0sym: string; t1sym: string; fee: number; liquidity: bigint }> = {}
    let pcIdx = 500

    for (let i = 0; i < tokenIds.length; i++) {
      const hex = posResults[i]?.result
      if (!hex || hex === '0x' || hex.length < 10) continue
      const d = hex.slice(2)
      if (d.length < 64 * 8) continue

      const w = Array.from({ length: 12 }, (_, j) => d.slice(j * 64, (j + 1) * 64))
      const token0  = '0x' + w[2].slice(24)
      const token1  = '0x' + w[3].slice(24)
      const fee     = parseInt(w[4], 16)
      const tickLower = parseInt(w[5], 16) > 0x7fffffff ? parseInt(w[5], 16) - 0x100000000 : parseInt(w[5], 16)
      const tickUpper = parseInt(w[6], 16) > 0x7fffffff ? parseInt(w[6], 16) - 0x100000000 : parseInt(w[6], 16)
      const liquidity = BigInt('0x' + w[7])
      if (liquidity === 0n) continue // closed position

      const t0sym = KNOWN_TOKENS[token0.toLowerCase()]?.symbol ?? token0.slice(0, 6)
      const t1sym = KNOWN_TOKENS[token1.toLowerCase()]?.symbol ?? token1.slice(0, 6)

      // Need current tick to check range — query pool slot0
      poolCalls.push(ethCall(UNI_FACTORY, getPoolData(token0, token1, fee), pcIdx))
      poolCallMap[pcIdx] = { idx: i, tickLower, tickUpper, t0sym, t1sym, fee, liquidity }
      pcIdx++
    }

    // 4. Get pool addresses, then slot0
    if (poolCalls.length === 0) return []
    const poolAddrResults = await rpcBatch(poolCalls)

    const slot0Calls: object[] = []
    const slot0Map: Record<number, any> = {}
    let s0Idx = 600

    for (const pcResult of poolAddrResults) {
      const info = poolCallMap[pcResult.id]
      if (!info || !pcResult.result || pcResult.result === '0x') continue
      const poolAddr = decodeAddress(pcResult.result)
      if (!poolAddr || poolAddr === '0x0000000000000000000000000000000000000000') continue
      slot0Calls.push(ethCall(poolAddr, SLOT0_SIG, s0Idx))
      slot0Map[s0Idx] = info
      s0Idx++
    }

    let slot0Results: any[] = []
    if (slot0Calls.length > 0) {
      slot0Results = await rpcBatch(slot0Calls)
    }

    for (const s0 of slot0Results) {
      const info = slot0Map[s0.id]
      if (!info || !s0.result || s0.result === '0x' || s0.result.length < 10) continue
      // slot0 → (uint160 sqrtPriceX96, int24 tick, ...)
      const d = s0.result.slice(2)
      const w = Array.from({ length: 4 }, (_, j) => d.slice(j * 64, (j + 1) * 64))
      const currentTick = parseInt(w[1], 16) > 0x7fffffff
        ? parseInt(w[1], 16) - 0x100000000
        : parseInt(w[1], 16)

      const inRange = currentTick >= info.tickLower && currentTick <= info.tickUpper
      const feeDisplay = info.fee / 10000  // e.g. 3000 → 0.3%

      positions.push({
        protocol: 'Uniswap V3', type: 'liquidity', logo: '🦄',
        url: 'https://app.uniswap.org', chain: 'Monad',
        label: `${info.t0sym}/${info.t1sym} ${feeDisplay}%`,
        tokens: [info.t0sym, info.t1sym],
        inRange,
        tickLower: info.tickLower, tickUpper: info.tickUpper, currentTick,
        feeApr: null, // Uniswap doesn't publish APR directly; leave null
        netValueUSD: 0, // Would need oracle prices; set to 0 for now
        amountUSD: 0,
      })
    }
    return positions
  } catch { return [] }
}

// ─── MORPHO (already handles Monad via API) ───────────────────────────────────
// ─── CURVE (via API) ─────────────────────────────────────────────────────────
async function fetchCurve(user: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.curve.fi/v1/getLiquidityProviderData/${user}/monad`,
      { signal: AbortSignal.timeout(8_000), cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.data?.lpData ?? [])
      .filter((p: any) => Number(p.liquidityUsd ?? 0) > 0.01)
      .map((p: any) => ({
        protocol: 'Curve', type: 'liquidity', logo: '🌊',
        url: `https://curve.fi/#/monad/pools/${p.poolAddress ?? ''}`,
        chain: 'Monad',
        label: p.poolName ?? (p.coins?.map((c: any) => c.symbol) ?? []).join('/'),
        tokens: p.coins?.map((c: any) => c.symbol) ?? [],
        amountUSD: Number(p.liquidityUsd ?? 0),
        apy: Number(p.apy ?? 0),
        netValueUSD: Number(p.liquidityUsd ?? 0),
        inRange: null, // Curve stableswap always "in range"
      }))
  } catch { return [] }
}

// ─── GEARBOX ─────────────────────────────────────────────────────────────────
async function fetchGearbox(user: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.gearbox.fi/v2/accounts/${user}?network=monad`,
      { signal: AbortSignal.timeout(8_000), cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.accounts ?? data?.creditAccounts ?? [])
      .filter((a: any) => Number(a.totalValueUsd ?? 0) > 0.01)
      .map((a: any) => {
        const totalUSD = Number(a.totalValueUsd ?? 0)
        const debtUSD  = Number(a.borrowedAmountUsd ?? 0)
        return {
          protocol: 'Gearbox', type: 'lending', logo: '⚙️',
          url: 'https://app.gearbox.fi', chain: 'Monad',
          label: a.creditManagerName ?? 'Credit Account',
          supply: [{ symbol: 'Portfolio', amountUSD: totalUSD }],
          borrow: debtUSD > 0 ? [{ symbol: a.borrowedToken ?? 'USDC', amountUSD: debtUSD }] : [],
          totalCollateralUSD: totalUSD,
          totalDebtUSD: debtUSD,
          netValueUSD: totalUSD - debtUSD,
          healthFactor: a.healthFactor ? Number(a.healthFactor) : null,
        }
      })
  } catch { return [] }
}

// ─── UPSHIFT (earnAUSD ERC4626 vault) ────────────────────────────────────────
const UPSHIFT_VAULTS = [
  { address: '0x103222f020e98Bba0AD9809A011FDF8e6F067496', name: 'earnAUSD Vault', asset: 'AUSD', decimals: 18 },
]
async function fetchUpshift(user: string): Promise<any[]> {
  try {
    const calls = UPSHIFT_VAULTS.map((v, i) => ethCall(v.address, balanceOfData(user), i + 700))
    const results = await rpcBatch(calls)
    return UPSHIFT_VAULTS
      .map((v, i) => {
        const shares = decodeUint(results[i]?.result ?? '0x')
        const amount = Number(shares) / Math.pow(10, v.decimals)
        if (amount < 0.001) return null
        return {
          protocol: 'Upshift', type: 'vault', logo: '🔺',
          url: 'https://app.upshift.finance', chain: 'Monad',
          label: v.name, asset: v.asset,
          amountUSD: amount, apy: 0,
          netValueUSD: amount,
        }
      })
      .filter(Boolean)
  } catch { return [] }
}

// ─── shMONAD (LST staking via ERC4626) ───────────────────────────────────────
// shMON contract on Monad mainnet (from Neverland docs: 0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c)
// This is the same as listed in Neverland's tokenization table
const SHMONAD_ADDR = '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c'
// previewRedeem(shares) → 0x4cdad506 — how many MON per shares
function previewRedeemData(shares: bigint): string {
  return '0x4cdad506' + shares.toString(16).padStart(64, '0')
}

async function fetchShMonad(user: string, monPrice: number): Promise<any[]> {
  try {
    const balRes = await rpcBatch([ethCall(SHMONAD_ADDR, balanceOfData(user), 800)])
    const shares = decodeUint(balRes[0]?.result ?? '0x')
    if (shares === 0n) return []

    // previewRedeem to get MON value
    const redeemRes = await rpcBatch([ethCall(SHMONAD_ADDR, previewRedeemData(shares), 801)])
    const monAmount = Number(decodeUint(redeemRes[0]?.result ?? '0x')) / 1e18
    const usd = monAmount * monPrice

    const sharesDisplay = Number(shares) / 1e18
    if (sharesDisplay < 0.001) return []

    return [{
      protocol: 'shMonad', type: 'vault', logo: '⚡',
      url: 'https://shmonad.xyz', chain: 'Monad',
      label: 'Staked MON (shMON)',
      asset: 'MON',
      amount: sharesDisplay,
      amountUSD: usd,
      apy: 0, // APY from staking — would need separate call
      netValueUSD: usd,
    }]
  } catch { return [] }
}

// ─── CURVANCE (lending with productive collateral) ────────────────────────────
// Curvance uses market tokens (pTokens/dTokens). Their Reader contract provides positions.
// Protocol Reader: 0x... — need to query the ProtocolReader for user positions
// For now we try their API if available
async function fetchCurvance(user: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.curvance.com/v1/positions?address=${user}&chainId=143`,
      { signal: AbortSignal.timeout(8_000), cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.positions ?? [])
      .filter((p: any) => Number(p.totalValueUsd ?? 0) > 0.01)
      .map((p: any) => ({
        protocol: 'Curvance', type: 'lending', logo: '💎',
        url: 'https://monad.curvance.com', chain: 'Monad',
        label: p.market ?? p.name ?? 'Market',
        supply: (p.collaterals ?? []).map((c: any) => ({ symbol: c.symbol, amountUSD: Number(c.valueUsd ?? 0), apy: Number(c.apy ?? 0) })),
        borrow: (p.debts ?? []).map((d: any) => ({ symbol: d.symbol, amountUSD: Number(d.valueUsd ?? 0), apr: Number(d.apr ?? 0) })),
        totalCollateralUSD: Number(p.collateralValueUsd ?? 0),
        totalDebtUSD: Number(p.debtValueUsd ?? 0),
        netValueUSD: Number(p.totalValueUsd ?? 0) - Number(p.debtValueUsd ?? 0),
        healthFactor: p.healthFactor ? Number(p.healthFactor) : null,
      }))
  } catch { return [] }
}

// ─── EULER V2 (EVC-based lending vaults) ─────────────────────────────────────
// Euler uses EVC for sub-accounts. We query known vault balances via balanceOf.
// Known Euler vaults on Monad (populated as they are deployed)
// EVC address is deterministic: 0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383 (standard deployment)
async function fetchEuler(user: string): Promise<any[]> {
  // Euler vaults are ERC4626 — we'd need a registry. Skip API, try subgraph
  try {
    const res = await fetch(
      `https://euler-api.euler.finance/graphql`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `{userPositions(where:{account:"${user.toLowerCase()}",chainId:143}){vault{address name asset{symbol}}supplyShares supplyAssetsUsd borrowShares borrowAssetsUsd healthScore}}`
        }),
        signal: AbortSignal.timeout(8_000), cache: 'no-store',
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data?.data?.userPositions ?? [])
      .filter((p: any) => Number(p.supplyAssetsUsd ?? 0) > 0.01 || Number(p.borrowAssetsUsd ?? 0) > 0.01)
      .map((p: any) => {
        const supUSD = Number(p.supplyAssetsUsd ?? 0)
        const borUSD = Number(p.borrowAssetsUsd ?? 0)
        return {
          protocol: 'Euler', type: 'lending', logo: '📐',
          url: 'https://app.euler.finance', chain: 'Monad',
          label: p.vault?.name ?? p.vault?.asset?.symbol ?? 'Vault',
          supply: supUSD > 0 ? [{ symbol: p.vault?.asset?.symbol, amountUSD: supUSD }] : [],
          borrow: borUSD > 0 ? [{ symbol: p.vault?.asset?.symbol, amountUSD: borUSD }] : [],
          totalCollateralUSD: supUSD,
          totalDebtUSD: borUSD,
          netValueUSD: supUSD - borUSD,
          healthFactor: p.healthScore ? Number(p.healthScore) : null,
        }
      })
  } catch { return [] }
}

// ─── MIDAS (RWA tokens - ERC20 balance check) ────────────────────────────────
// mTBILL and mBASIS are ERC20 tokens on Monad
const MIDAS_TOKENS: Array<{ address: string; symbol: string; name: string; decimals: number; apy: number }> = [
  { address: '0x0000000000000000000000000000000000000000', symbol: 'mTBILL', name: 'Midas T-Bill', decimals: 18, apy: 4.8 }, // placeholder address
  { address: '0x0000000000000000000000000000000000000000', symbol: 'mBASIS', name: 'Midas Basis', decimals: 18, apy: 7.2 },
]
// We don't have exact addresses yet — skip if zero address
async function fetchMidas(user: string): Promise<any[]> {
  const validVaults = MIDAS_TOKENS.filter(t => t.address !== '0x0000000000000000000000000000000000000000')
  if (!validVaults.length) return []
  try {
    const calls = validVaults.map((t, i) => ethCall(t.address, balanceOfData(user), i + 900))
    const results = await rpcBatch(calls)
    return validVaults
      .map((t, i) => {
        const bal = decodeUint(results[i]?.result ?? '0x')
        const amount = Number(bal) / Math.pow(10, t.decimals)
        if (amount < 0.001) return null
        // mTBILL price ≈ $1 (treasury bill)
        const amountUSD = amount
        return {
          protocol: 'Midas', type: 'vault', logo: '🏛️',
          url: 'https://midas.app', chain: 'Monad',
          label: t.name, asset: t.symbol,
          amount, amountUSD, apy: t.apy,
          netValueUSD: amountUSD,
        }
      })
      .filter(Boolean)
  } catch { return [] }
}

// ─── MON price ───────────────────────────────────────────────────────────────
async function getMonPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd', { next: { revalidate: 60 } })
    const d = await res.json()
    return d?.monad?.usd ?? 0
  } catch { return 0 }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  try {
    const [monPriceR, nevRes, morphoRes, uniRes, curveRes, gearRes, upshiftRes, shmonadRes, curvanceRes, eulerRes, midasRes] =
      await Promise.allSettled([
        getMonPrice(),
        fetchNeverland(address),
        fetchMorpho(address),
        fetchUniswapV3(address),
        fetchCurve(address),
        fetchGearbox(address),
        fetchUpshift(address),
        // shmonad needs monPrice — we'll resolve after
        Promise.resolve([]),
        fetchCurvance(address),
        fetchEuler(address),
        fetchMidas(address),
      ])

    const MON_PRICE = monPriceR.status === 'fulfilled' ? (monPriceR.value as number) : 0

    // Now fetch shMonad with price
    let shmonadPositions: any[] = []
    try { shmonadPositions = await fetchShMonad(address, MON_PRICE) } catch {}

    const allPositions = [
      ...(nevRes.status    === 'fulfilled' ? nevRes.value       : []),
      ...(morphoRes.status === 'fulfilled' ? morphoRes.value    : []),
      ...(uniRes.status    === 'fulfilled' ? uniRes.value       : []),
      ...(curveRes.status  === 'fulfilled' ? curveRes.value     : []),
      ...(gearRes.status   === 'fulfilled' ? gearRes.value      : []),
      ...(upshiftRes.status === 'fulfilled' ? upshiftRes.value  : []),
      ...shmonadPositions,
      ...(curvanceRes.status === 'fulfilled' ? curvanceRes.value : []),
      ...(eulerRes.status  === 'fulfilled' ? eulerRes.value     : []),
      ...(midasRes.status  === 'fulfilled' ? midasRes.value     : []),
    ]

    const totalNetValueUSD  = allPositions.reduce((s, p) => s + (p.netValueUSD ?? 0), 0)
    const totalDebtUSD      = allPositions.reduce((s, p) => s + (p.totalDebtUSD ?? 0), 0)
    const totalSupplyUSD    = allPositions.reduce((s, p) => s + (p.totalCollateralUSD ?? p.amountUSD ?? 0), 0)
    const activeProtocols   = [...new Set(allPositions.map(p => p.protocol))]

    return NextResponse.json({
      positions: allPositions,
      summary: {
        totalNetValueUSD,
        totalDebtUSD,
        totalSupplyUSD,
        netValueUSD: totalNetValueUSD,
        activeProtocols,
        monPrice: MON_PRICE,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed', positions: [], summary: {} }, { status: 500 })
  }
}
