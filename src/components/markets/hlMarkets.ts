import { getMarketLabel } from '@/services/productsService'

/**
 * HL Markets board data, fetched browser-direct from the public info API
 * (CORS *, weighed against the visitor's own IP budget of 1200/min)
 */

const INFO_URL = 'https://api.hyperliquid.xyz/info'

// market ids flow into pane markets and into renderers that build HTML
// strings, so the board only exposes names made of these characters
// (every HL perp, HIP-3 and spot name matched it on 2026-09-21)
const SAFE_PAIR_REGEX = /^[A-Za-z0-9_.:/-]+$/

export type HlMarketKind = 'perp' | 'spot' | 'hip3'

export interface HlMarketRow {
  id: string
  pair: string
  label: string
  kind: HlMarketKind
  mark: string
  markPx: number
  change: number
  volume: number
  funding: number
  oi: number
  premium: number
  basis: number
  leverage: number
}

export class HlRateLimitError extends Error {}

export async function postHlInfo(body: any, signal?: AbortSignal) {
  const response = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })

  if (response.status === 429) {
    throw new HlRateLimitError('Hyperliquid rate limit')
  }

  if (!response.ok) {
    throw new Error(`Hyperliquid info ${body.type}: HTTP ${response.status}`)
  }

  return response.json()
}

function toNumber(value): number {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = +value

  return Number.isFinite(number) ? number : null
}

// keep HL's own price formatting, minus a trailing ".0"
function formatPx(value): string {
  if (typeof value !== 'string' || !value) {
    return null
  }

  return value.indexOf('.') !== -1 ? value.replace(/\.?0+$/, '') : value
}

function buildRow(
  pair: string,
  kind: HlMarketKind,
  ctx,
  maxLeverage?
): HlMarketRow {
  const isPerp = kind !== 'spot'
  const markPx = toNumber(ctx.markPx)
  const prevDayPx = toNumber(ctx.prevDayPx)
  const oraclePx = toNumber(ctx.oraclePx)
  const openInterest = toNumber(ctx.openInterest)
  const funding = toNumber(ctx.funding)
  const premium = toNumber(ctx.premium)

  return Object.freeze({
    id: 'HYPERLIQUID:' + pair,
    pair,
    label: getMarketLabel({
      exchange: 'HYPERLIQUID',
      type: isPerp ? 'perp' : 'spot',
      pair
    }),
    kind,
    mark: formatPx(ctx.markPx),
    markPx,
    change:
      markPx !== null && prevDayPx
        ? ((markPx - prevDayPx) / prevDayPx) * 100
        : null,
    volume: toNumber(ctx.dayNtlVlm),
    // hourly rate, in %
    funding: isPerp && funding !== null ? funding * 100 : null,
    // notional, valued at the mark price
    oi:
      isPerp && openInterest !== null && markPx !== null
        ? openInterest * markPx
        : null,
    premium: isPerp && premium !== null ? premium * 100 : null,
    basis:
      isPerp && markPx !== null && oraclePx
        ? ((markPx - oraclePx) / oraclePx) * 100
        : null,
    leverage: isPerp ? toNumber(maxLeverage) : null
  })
}

/**
 * metaAndAssetCtxs (main dex, or a HIP-3 dex when `dex` is set)
 * response: [{ universe: [{ name, maxLeverage, isDelisted? }] }, ctxs[]],
 * ctxs are aligned with the universe by index
 */
export function parsePerps(response, dex?: string): HlMarketRow[] {
  const [meta, ctxs] = Array.isArray(response) ? response : []

  if (!meta || !Array.isArray(meta.universe) || !Array.isArray(ctxs)) {
    return []
  }

  const rows: HlMarketRow[] = []

  meta.universe.forEach((asset, index) => {
    const ctx = ctxs[index]

    if (
      !asset ||
      !ctx ||
      asset.isDelisted ||
      typeof asset.name !== 'string' ||
      !SAFE_PAIR_REGEX.test(asset.name)
    ) {
      return
    }

    rows.push(
      buildRow(asset.name, dex ? 'hip3' : 'perp', ctx, asset.maxLeverage)
    )
  })

  return rows
}

/**
 * spotMetaAndAssetCtxs
 * response: [{ universe: [{ name: '@107', tokens: [base, quote] }], tokens }, ctxs[]]
 * ctxs are NOT aligned with the universe: they are matched by ctx.coin,
 * pairs are named BASE/QUOTE like the connector names them
 */
export function parseSpot(response): HlMarketRow[] {
  const [meta, ctxs] = Array.isArray(response) ? response : []

  if (
    !meta ||
    !Array.isArray(meta.universe) ||
    !Array.isArray(meta.tokens) ||
    !Array.isArray(ctxs)
  ) {
    return []
  }

  const tokens = new Map(meta.tokens.map(token => [token.index, token.name]))
  const ctxsByCoin = new Map(ctxs.filter(Boolean).map(ctx => [ctx.coin, ctx]))
  const rows: HlMarketRow[] = []

  for (const product of meta.universe) {
    if (!product || !Array.isArray(product.tokens)) {
      continue
    }

    const [base, quote] = product.tokens.map(index => tokens.get(index))
    const ctx = ctxsByCoin.get(product.name)
    const pair = `${base}/${quote}`

    if (!base || !quote || !ctx || !SAFE_PAIR_REGEX.test(pair)) {
      continue
    }

    rows.push(buildRow(pair, 'spot', ctx))
  }

  return rows
}

/**
 * perpDexs: [null (main dex), { name: 'xyz', ... }, ...]
 */
export function parseDexNames(response): string[] {
  if (!Array.isArray(response)) {
    return []
  }

  return response
    .filter(
      dex =>
        dex && typeof dex.name === 'string' && /^[a-z0-9]+$/i.test(dex.name)
    )
    .map(dex => dex.name)
}

/**
 * perpsAtOpenInterestCap: ['CANTO', 'xyz:AVGO', ...] → market ids
 */
export function parseCaps(response): string[] {
  if (!Array.isArray(response)) {
    return []
  }

  return response
    .filter(name => typeof name === 'string')
    .map(name => 'HYPERLIQUID:' + name)
}
