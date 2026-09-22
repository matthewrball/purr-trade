// ponytail: static map, move to server API if labels need frequent updates
import vaults from '@/assets/hl-vaults.json'
import aggregatorService from '@/services/aggregatorService'

// protocol system addresses, ahead of every other label
const PROTOCOL: { [address: string]: { name: string; badge: string } } = {
  // https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees
  '0xfefefefefefefefefefefefefefefefefefefefe': {
    name: 'Assistance Fund',
    badge: 'AF'
  }
}

export type ProfileSource =
  | 'protocol'
  | 'label'
  | 'leaderboard'
  | 'validator'
  | 'vault'
  | 'hl'

export interface Profile {
  name: string | null
  source: ProfileSource | null
  whale: boolean
}

export interface Wallet extends Profile {
  address: string
  text: string
}

export interface MakerEntity {
  name: string
  badge: string
  source: ProfileSource
}

export const PROFILE_SOURCES: { [source in ProfileSource]: string } = {
  protocol: 'protocol address',
  label: 'known vault',
  leaderboard: 'leaderboard name',
  validator: 'validator',
  vault: 'vault',
  hl: '.hl name'
}

// public/profiles.json lookup order, written by scripts/build-profiles.mjs
const FILE_SOURCES: ProfileSource[] = [
  'leaderboard',
  'validator',
  'vault',
  'hl'
]

let profiles: {
  names: { [address: string]: string }[]
  whales: Set<string>
} = null
let profilesRequest: Promise<boolean> = null

/**
 * fetch public/profiles.json once, resolves true when names became available
 */
export function loadProfiles() {
  if (!profilesRequest) {
    profilesRequest = fetch(import.meta.env.BASE_URL + 'profiles.json')
      .then(async response => {
        // a missing file gets the SPA fallback: index.html with a 200
        if (
          !response.ok ||
          !(response.headers.get('content-type') || '').includes('json')
        ) {
          return false
        }

        const data = await response.json()

        profiles = {
          names: FILE_SOURCES.map(source => data[source] || {}),
          // 64-bit address prefixes
          whales: new Set(data.whales || [])
        }

        return true
      })
      .catch(() => false)

    // the worker keeps a known maker when it merges one taker's fills
    profilesRequest.then(() =>
      aggregatorService.dispatch({
        op: 'configureAggregator',
        data: { key: 'makerEntities', value: makerEntities() }
      })
    )
  }

  return profilesRequest
}

/**
 * best known name of an address (lowercase or checksummed)
 */
export function profileFor(address: string): Profile {
  const key = address.toLowerCase()
  const whale = !!profiles && profiles.whales.has(key.slice(2, 18))

  if (PROTOCOL[key]) {
    return { name: PROTOCOL[key].name, source: 'protocol', whale }
  }

  if (vaults[key]) {
    return { name: vaults[key], source: 'label', whale }
  }

  if (profiles) {
    for (let i = 0; i < FILE_SOURCES.length; i++) {
      if (profiles.names[i][key]) {
        return { name: profiles.names[i][key], source: FILE_SOURCES[i], whale }
      }
    }
  }

  return { name: null, source: null, whale }
}

function validatorNames(): { [address: string]: string } {
  return profiles ? profiles.names[FILE_SOURCES.indexOf('validator')] : {}
}

/**
 * known entity behind a trade's maker (Assistance Fund, HLP, validators),
 * null for everyone else
 */
export function makerEntity(address: string | undefined): MakerEntity {
  if (!address) {
    return null
  }

  const key = address.toLowerCase()

  if (PROTOCOL[key]) {
    return { ...PROTOCOL[key], source: 'protocol' }
  }

  if (vaults[key]) {
    return {
      name: vaults[key],
      badge: vaults[key].split(' ')[0],
      source: 'label'
    }
  }

  const validator = validatorNames()[key]

  if (validator) {
    return { name: validator, badge: 'VAL', source: 'validator' }
  }

  return null
}

function makerEntities() {
  const entities: { [address: string]: boolean } = {}

  for (const address of [
    ...Object.keys(PROTOCOL),
    ...Object.keys(vaults),
    ...Object.keys(validatorNames())
  ]) {
    entities[address] = true
  }

  return entities
}

// accessible name of a maker badge
export function makerTitle(entity: MakerEntity) {
  return `Maker: ${entity.name} (${PROFILE_SOURCES[entity.source]})`
}

export function walletAddress(
  user: string | undefined,
  amount: number,
  threshold: number
): Wallet {
  if (
    !user ||
    !Number.isFinite(amount) ||
    amount < threshold ||
    !/^0x[a-f0-9]{40}$/i.test(user)
  ) {
    return null
  }

  const profile = profileFor(user)

  return {
    address: user,
    ...profile,
    text: profile.name || `${user.slice(2, 4)}…${user.slice(-3)}`
  }
}

// accessible name of a chip (the wallet card shows the details)
export function walletTitle(wallet: Wallet, liquidation?: boolean) {
  return (
    `${liquidation ? 'Liquidated wallet' : 'Taker wallet'}: ${wallet.address}` +
    (wallet.name
      ? `, ${wallet.name} (${PROFILE_SOURCES[wallet.source]})`
      : '') +
    (wallet.whale ? ', whale, account value ≥ $1M' : '') +
    '. Space for wallet details'
  )
}

/**
 * deterministic avatar: two hues from the address (already a hash),
 * split top-left / bottom-right in both the DOM and the canvas feed
 */
export function avatarColors(address: string) {
  const hue = (start: number) =>
    parseInt(address.slice(start, start + 3), 16) % 360

  return [`hsl(${hue(2)}, 70%, 62%)`, `hsl(${hue(39)}, 65%, 42%)`]
}

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

export function escapeHtml(text: string) {
  return String(text).replace(/[&<>"']/g, char => HTML_ESCAPES[char])
}

export function walletUrl(address: string) {
  return `https://hyperdash.com/address/${address}`
}

export function openWallet(address: string) {
  window.open(walletUrl(address), '_blank', 'noopener,noreferrer')
}

// wallet card data, straight from the visitor's browser (CORS *, per-IP budget)
const INFO_URL = 'https://api.hyperliquid.xyz/info'
const INFO_CACHE_MS = 30000
const INFO_MAX_IN_FLIGHT = 2
const INFO_TIMEOUT_MS = 10000

const infoCache: { [body: string]: { time: number; request: Promise<any> } } =
  {}
const infoQueue: (() => void)[] = []
let infoInFlight = 0

/**
 * POST /info {type, user, dex?} on demand, cached ~30 s per request,
 * at most 2 in flight (clearinghouseState weighs 2, portfolio 20)
 */
export function fetchWalletInfo(type: string, user: string, dex?: string) {
  const body = JSON.stringify(dex ? { type, user, dex } : { type, user })
  const now = Date.now()

  for (const key in infoCache) {
    if (now - infoCache[key].time > INFO_CACHE_MS) {
      delete infoCache[key]
    }
  }

  if (!infoCache[body]) {
    const request = new Promise<any>((resolve, reject) => {
      const run = () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), INFO_TIMEOUT_MS)

        infoInFlight++

        fetch(INFO_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal
        })
          .then(response => {
            if (!response.ok) {
              throw new Error(`Hyperliquid ${type}: HTTP ${response.status}`)
            }

            return response.json()
          })
          .then(resolve, reject)
          .finally(() => {
            clearTimeout(timeout)
            infoInFlight--

            const next = infoQueue.shift()

            if (next) {
              next()
            }
          })
      }

      if (infoInFlight < INFO_MAX_IN_FLIGHT) {
        run()
      } else {
        infoQueue.push(run)
      }
    })

    // failures are not cached
    request.catch(() => {
      if (infoCache[body] && infoCache[body].request === request) {
        delete infoCache[body]
      }
    })

    infoCache[body] = { time: now, request }
  }

  return infoCache[body].request
}
