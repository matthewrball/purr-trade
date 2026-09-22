/* eslint-disable no-console */
// Prebuild: snapshot Hyperliquid trader names into a compact public/profiles.json
// for the trades profile chip (components/trades/wallet.ts). The sources are too
// big for browsers (leaderboard ~39 MB, vaults ~14 MB). Never fails the build.
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = path.join(ROOT, 'public/profiles.json')
const TIMEOUT_MS = Number(process.env.PROFILES_TIMEOUT_MS) || 60000
const WHALE_ACCOUNT_VALUE = 1000000
const VAULT_MIN_TVL = 10000
const MAX_NAME_LENGTH = 32
const HLN_URL = 'https://api.hlnames.xyz/api/utils/all_primary_names'
const HLN_PAGE_SIZE = 1000
const HLN_MAX_PAGES = 50
// Hyperliquid Names' published public key (github.com/HLnames/use-hln-api),
// HLN_API_KEY overrides it
const HLN_API_KEY = process.env.HLN_API_KEY || 'NILB2EY-R4LUDOA-WN5G5JQ-KHAQOLA'

const ADDRESS_REGEX = /^0x[0-9a-f]{40}$/

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json', ...options.headers }
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

// names are user-controlled: drop control/format characters (bidi overrides,
// zero-width), collapse whitespace, cap the length. The client still escapes them.
function cleanName(name) {
  if (typeof name !== 'string') {
    return ''
  }
  const text = name
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = [...text]
  return chars.length > MAX_NAME_LENGTH
    ? chars
        .slice(0, MAX_NAME_LENGTH - 1)
        .join('')
        .trim() + '…'
    : text
}

function cleanAddress(address) {
  const value = typeof address === 'string' ? address.toLowerCase() : ''
  return ADDRESS_REGEX.test(value) ? value : null
}

async function leaderboard() {
  const data = await fetchJson(
    'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard'
  )
  const names = {}
  const whales = []
  const accounts = new Set()
  for (const row of data.leaderboardRows) {
    const address = cleanAddress(row.ethAddress)
    if (!address) continue
    accounts.add(address)
    const name = cleanName(row.displayName)
    if (name) {
      names[address] = name
    }
    if (Number(row.accountValue) >= WHALE_ACCOUNT_VALUE) {
      // 64-bit address prefix: a third of the size, collisions are negligible
      whales.push(address.slice(2, 18))
    }
  }
  return { names, whales, accounts }
}

async function validators() {
  const data = await fetchJson('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'validatorSummaries' })
  })
  const names = {}
  for (const validator of data) {
    const address = cleanAddress(validator.validator)
    const name = cleanName(validator.name)
    if (address && name) {
      names[address] = name
    }
  }
  return names
}

async function vaults() {
  const data = await fetchJson(
    'https://stats-data.hyperliquid.xyz/Mainnet/vaults'
  )
  const names = {}
  for (const { summary } of data) {
    const address = cleanAddress(summary && summary.vaultAddress)
    const name = cleanName(summary && summary.name)
    if (
      address &&
      name &&
      !summary.isClosed &&
      Number(summary.tvl) >= VAULT_MIN_TVL
    ) {
      names[address] = name
    }
  }
  return names
}

// every .hl primary name, paged (~3k names in 2026-09)
async function hlNames() {
  const names = {}
  for (let page = 0; page < HLN_MAX_PAGES; page++) {
    const begin = page * HLN_PAGE_SIZE
    const rows = await fetchJson(
      `${HLN_URL}?begin=${begin}&end=${begin + HLN_PAGE_SIZE - 1}`,
      { headers: { 'X-API-Key': HLN_API_KEY } }
    )
    for (const row of rows) {
      const address = cleanAddress(row.address)
      const name = cleanName(row.primaryName)
      if (address && name) {
        names[address] = name
      }
    }
    if (rows.length < HLN_PAGE_SIZE) break
  }
  return names
}

function warn(source, error) {
  const cause = error.cause
    ? `: ${error.cause.code || error.cause.message}`
    : ''
  console.warn(`[profiles] skipped ${source} (${error.message}${cause})`)
}

async function main() {
  const [board, validatorNames, vaultNames, hl] = await Promise.all(
    [leaderboard(), validators(), vaults(), hlNames()].map((promise, index) =>
      promise.catch(error => {
        warn(['leaderboard', 'validators', 'vaults', '.hl names'][index], error)
        return null
      })
    )
  )

  if (!board && !validatorNames && !vaultNames && !hl) {
    console.warn('[profiles] every source failed, profiles.json not written')
    return
  }

  // wallet.ts picks leaderboard > validator > vault > .hl, so a lower source
  // only keeps addresses a higher one did not name
  const named = new Set()
  const unnamed = names => {
    const output = {}
    for (const address in names || {}) {
      if (!named.has(address)) {
        output[address] = names[address]
        named.add(address)
      }
    }
    return output
  }

  const profiles = {
    generatedAt: Date.now(),
    leaderboard: unnamed(board && board.names),
    // every validator (~35): the maker badge needs them even when named above
    validator: { ...unnamed(validatorNames), ...validatorNames },
    vault: unnamed(vaultNames),
    // .hl names of leaderboard accounts only, all of them would double the file
    hl: unnamed(
      board && hl
        ? Object.fromEntries(
            Object.entries(hl).filter(([address]) =>
              board.accounts.has(address)
            )
          )
        : null
    ),
    whales: board ? board.whales : []
  }

  const json = JSON.stringify(profiles)
  await mkdir(path.dirname(OUT_FILE), { recursive: true })
  await writeFile(OUT_FILE, json)

  const count = key => Object.keys(profiles[key]).length
  console.log(
    `[profiles] ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB: leaderboard ${count(
      'leaderboard'
    )}, validators ${count('validator')}, vaults ${count(
      'vault'
    )}, .hl ${count('hl')}, whales ${profiles.whales.length}`
  )
}

main()
  .catch(error => {
    console.warn('[profiles] failed, continuing without profiles', error)
  })
  .finally(() => {
    process.exitCode = 0
  })
