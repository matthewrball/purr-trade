<template>
  <dropdown
    ref="dropdown"
    class="wallet-card-dropdown"
    :value="anchor"
    :margin="8"
    interactive
    @input="onDropdownInput"
    @opened="refit"
  >
    <div
      v-if="address"
      ref="card"
      class="wallet-card"
      role="dialog"
      :aria-label="'Wallet ' + (profile.name || address)"
      @mouseenter="cancelHide"
      @mouseleave="leave"
      @focusout="onFocusOut"
    >
      <div class="wallet-card__header">
        <span
          class="wallet-card__avatar"
          :style="avatarStyle"
          aria-hidden="true"
        ></span>
        <div class="wallet-card__identity">
          <div class="wallet-card__name">
            {{ profile.name || shortAddress }}
          </div>
          <div class="wallet-card__label">{{ sourceLabel }}</div>
        </div>
        <span
          v-if="profile.whale"
          class="wallet-card__whale"
          role="img"
          aria-label="Whale: account value at least $1M"
          title="Account value ≥ $1M"
          >🐋</span
        >
      </div>
      <div class="wallet-card__address">
        <code>{{ address }}</code>
        <button
          type="button"
          class="btn -text -small wallet-card__copy"
          :aria-label="copied ? 'Address copied' : 'Copy address'"
          :title="copied ? 'Copied' : 'Copy address'"
          @click="copyAddress"
        >
          <i
            :class="copied ? 'icon-check' : 'icon-copy-paste'"
            aria-hidden="true"
          ></i>
        </button>
        <span class="wallet-card__copied" role="status">{{
          copied ? 'Copied' : ''
        }}</span>
      </div>
      <dl class="wallet-card__stats">
        <div>
          <dt class="wallet-card__label">Account value</dt>
          <dd>{{ accountValue }}</dd>
        </div>
        <div>
          <dt class="wallet-card__label">Perp equity</dt>
          <dd>{{ perpEquity }}</dd>
        </div>
        <div>
          <dt class="wallet-card__label">30d PnL</dt>
          <dd :class="monthPnlClass">{{ monthPnl }}</dd>
        </div>
      </dl>
      <table v-if="visiblePositions.length" class="wallet-card__positions">
        <caption class="wallet-card__label">
          Perp positions ({{
            perp.positions.length
          }})
        </caption>
        <thead>
          <tr class="wallet-card__label">
            <th scope="col">Coin</th>
            <th scope="col">Size</th>
            <th scope="col">Entry</th>
            <th scope="col">Liq.</th>
            <th scope="col">uPnL</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="position of visiblePositions"
            :key="position.coin"
            :class="position.current && '-current'"
          >
            <th scope="row" :title="position.leverageType">
              {{ position.coin }} <small>{{ position.leverage }}</small>
            </th>
            <td :class="position.long ? 'text-success' : 'text-danger'">
              {{ position.long ? 'Long' : 'Short' }} {{ position.size }}
            </td>
            <td>{{ position.entry }}</td>
            <td>{{ position.liquidation }}</td>
            <td :class="position.pnlClass">{{ position.pnl }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="wallet-card__status">{{ positionsStatus }}</p>
      <p v-if="hiddenPositions" class="wallet-card__status">
        +{{ hiddenPositions }} more on Hyperdash
      </p>
      <p class="wallet-card__spot">
        <span class="wallet-card__label">Spot</span> {{ spotSummary }}
      </p>
      <a
        class="btn -theme -small -block -cases wallet-card__open"
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open on Hyperdash
        <i class="icon-external-link-square-alt ml4" aria-hidden="true"></i>
      </a>
    </div>
  </dropdown>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import { formatAmount, parseMarket } from '@/services/productsService'
import { copyTextToClipboard } from '@/utils/helpers'
import {
  avatarColors,
  fetchWalletInfo,
  profileFor,
  PROFILE_SOURCES,
  walletUrl
} from './wallet'

const SHOW_DELAY = 300
const HIDE_DELAY = 250
const MAX_POSITIONS = 6
const CHIP_EVENTS = [
  'pointermove',
  'pointerout',
  'pointerdown',
  'click',
  'focusin',
  'focusout',
  'keydown'
]

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface Position {
  coin: string
  long: boolean
  size: string
  entry: string
  leverage: string
  leverageType: string
  liquidation: string
  pnl: string
  pnlClass: string
  value: number
  current: boolean
}

function formatNumber(value: number) {
  return String(
    Math.abs(value) >= 1000 ? formatAmount(value) : +value.toPrecision(4)
  )
}

function formatUsd(value: number, signed?: boolean) {
  return (
    (value < 0 ? '-' : signed && value > 0 ? '+' : '') +
    '$' +
    formatAmount(Math.abs(value))
  )
}

function formatPx(price: string) {
  return +price ? String(+(+price).toPrecision(6)) : '—'
}

function pnlClass(value: number) {
  return value > 0 ? 'text-success' : value < 0 ? 'text-danger' : ''
}

// clearinghouseState of the first perp dex (+ the row's HIP-3 dex)
function parsePerp(states: any[], coin: string) {
  const positions: Position[] = []
  let equity = 0

  for (const state of states) {
    if (
      !state ||
      !state.marginSummary ||
      !Array.isArray(state.assetPositions)
    ) {
      throw new Error('Invalid clearinghouseState')
    }

    equity += +state.marginSummary.accountValue || 0

    for (const { position } of state.assetPositions) {
      const size = position ? +position.szi : 0

      if (!size) {
        continue
      }

      const pnl = +position.unrealizedPnl || 0
      const leverage = position.leverage || {}

      positions.push({
        coin: String(position.coin),
        long: size > 0,
        size: formatNumber(Math.abs(size)),
        entry: formatPx(position.entryPx),
        leverage: leverage.value ? leverage.value + '×' : '',
        leverageType: leverage.type || '',
        liquidation: formatPx(position.liquidationPx),
        pnl: formatUsd(pnl, true),
        pnlClass: pnlClass(pnl),
        value: +position.positionValue || 0,
        current: position.coin === coin
      })
    }
  }

  // the coin of the hovered row first, then the biggest
  positions.sort((a, b) => +b.current - +a.current || b.value - a.value)

  return { equity, positions }
}

// portfolio "month" = perp + spot over the last 30 days
function parsePortfolio(data: any) {
  const month = Array.isArray(data) && data.find(entry => entry[0] === 'month')

  if (!month || !month[1]) {
    throw new Error('Invalid portfolio')
  }

  const values = month[1].accountValueHistory || []
  const pnls = month[1].pnlHistory || []

  return {
    value: values.length ? +values[values.length - 1][1] : null,
    pnl: pnls.length ? +pnls[pnls.length - 1][1] - +pnls[0][1] : null
  }
}

// token amounts only (pricing them needs spotMeta), USDC then biggest cost
function parseSpot(data: any) {
  if (!data || !Array.isArray(data.balances)) {
    throw new Error('Invalid spotClearinghouseState')
  }

  const balances = data.balances
    .filter(balance => +balance.total > 0)
    .sort(
      (a, b) =>
        +(b.coin === 'USDC') - +(a.coin === 'USDC') || +b.entryNtl - +a.entryNtl
    )

  if (!balances.length) {
    return 'none'
  }

  return (
    balances
      .slice(0, 3)
      .map(balance => `${balance.coin} ${formatNumber(+balance.total)}`)
      .join(' · ') + (balances.length > 3 ? ` +${balances.length - 3}` : '')
  )
}

/**
 * Purr wallet card: hover (300 ms) or tap a profile chip.
 * Data from the HL info API on demand, rendered with text interpolation only
 */
@Component({
  name: 'WalletCard'
})
export default class WalletCard extends Vue {
  anchor: Rect = null
  address: string = null
  market: string = null
  // null while loading, false when the request failed
  perp: { equity: number; positions: Position[] } | false = null
  portfolio: { value: number; pnl: number } | false = null
  spot: string | false = null
  copied = false

  private returnFocus: HTMLElement
  private refocusing: HTMLElement
  private pending: string
  private pointerX: number
  private pointerY: number
  private showTimeout: number
  private hideTimeout: number
  private copiedTimeout: number
  private loadId: number
  private chips: HTMLElement
  private pointerType: string
  private listening: boolean

  $refs!: {
    dropdown: any
    card: HTMLElement
  }

  get profile() {
    return profileFor(this.address)
  }

  get shortAddress() {
    return `${this.address.slice(0, 6)}…${this.address.slice(-4)}`
  }

  get sourceLabel() {
    return this.profile.source
      ? PROFILE_SOURCES[this.profile.source]
      : 'no known name'
  }

  get avatarStyle() {
    const [top, bottom] = avatarColors(this.address)

    return {
      background: `linear-gradient(135deg, ${top} 50%, ${bottom} 50%)`
    }
  }

  get url() {
    return walletUrl(this.address)
  }

  get accountValue() {
    return this.portfolio
      ? this.portfolio.value === null
        ? '—'
        : formatUsd(this.portfolio.value)
      : this.portfolio === false
        ? '—'
        : '…'
  }

  get perpEquity() {
    return this.perp
      ? formatUsd(this.perp.equity)
      : this.perp === false
        ? '—'
        : '…'
  }

  get monthPnl() {
    return this.portfolio
      ? this.portfolio.pnl === null
        ? '—'
        : formatUsd(this.portfolio.pnl, true)
      : this.portfolio === false
        ? '—'
        : '…'
  }

  get monthPnlClass() {
    return this.portfolio ? pnlClass(this.portfolio.pnl) : ''
  }

  get visiblePositions() {
    return this.perp ? this.perp.positions.slice(0, MAX_POSITIONS) : []
  }

  get hiddenPositions() {
    return this.perp
      ? Math.max(0, this.perp.positions.length - MAX_POSITIONS)
      : 0
  }

  get positionsStatus() {
    return this.perp
      ? 'No open perp positions'
      : this.perp === false
        ? 'Positions unavailable'
        : 'Loading positions…'
  }

  get spotSummary() {
    return this.spot || (this.spot === false ? 'unavailable' : '…')
  }

  beforeDestroy() {
    this.close()

    if (this.chips) {
      for (const type of CHIP_EVENTS) {
        this.chips.removeEventListener(type, this.onChipEvent)
      }
    }

    clearTimeout(this.copiedTimeout)
  }

  /**
   * show after a short delay (mouse hover or keyboard focus)
   */
  hover(
    target: Rect | HTMLElement,
    address: string,
    market: string,
    returnFocus?: HTMLElement
  ) {
    clearTimeout(this.hideTimeout)

    if (this.pending === address) {
      return
    }

    clearTimeout(this.showTimeout)
    this.pending = null

    // back on the open card's chip
    if (this.anchor && this.address === address) {
      return
    }

    this.pending = address
    this.showTimeout = setTimeout(
      () => this.open(target, address, market, returnFocus),
      SHOW_DELAY
    ) as unknown as number
  }

  leave() {
    clearTimeout(this.showTimeout)
    clearTimeout(this.hideTimeout)
    this.pending = null

    if (this.anchor) {
      this.hideTimeout = setTimeout(
        () => this.close(),
        HIDE_DELAY
      ) as unknown as number
    }
  }

  cancelHide() {
    clearTimeout(this.hideTimeout)
  }

  /**
   * show now (tap, Space), under a chip element or a rect in viewport pixels
   */
  open(
    target: Rect | HTMLElement,
    address: string,
    market: string,
    returnFocus?: HTMLElement,
    focusCard?: boolean
  ) {
    clearTimeout(this.showTimeout)
    clearTimeout(this.hideTimeout)
    this.pending = null

    // a DOM chip trimmed from the feed during the delay
    if (target instanceof HTMLElement && !target.isConnected) {
      return
    }

    this.returnFocus = returnFocus || null

    if (!this.anchor || this.address !== address || this.market !== market) {
      const rect =
        target instanceof HTMLElement ? target.getBoundingClientRect() : target

      this.address = address
      this.market = market
      this.load()

      // a copy, the chip row may move or leave the DOM while the card is open
      this.anchor = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    }

    if (!this.listening) {
      this.listening = true
      document.addEventListener('keydown', this.onKeydown)
      window.addEventListener('blur', this.onWindowBlur)
    }

    if (focusCard) {
      // dropdown renders its slot on the next flush
      this.$nextTick(() =>
        this.$nextTick(() => {
          const button =
            this.$refs.card && this.$refs.card.querySelector('button')

          if (button) {
            button.focus()
          }
        })
      )
    }
  }

  close(restoreFocus?: boolean) {
    clearTimeout(this.showTimeout)
    clearTimeout(this.hideTimeout)
    this.pending = null

    if (this.listening) {
      this.listening = false
      document.removeEventListener('keydown', this.onKeydown)
      window.removeEventListener('blur', this.onWindowBlur)
    }

    if (!this.anchor) {
      return
    }

    const refocus =
      restoreFocus &&
      this.returnFocus &&
      this.returnFocus.isConnected &&
      this.$refs.card &&
      this.$refs.card.contains(document.activeElement)

    // keep address and data for the leave transition
    this.anchor = null

    if (refocus) {
      this.refocusing = this.returnFocus
      this.returnFocus.focus()
      this.refocusing = null
    }
  }

  load() {
    const id = (this.loadId = (this.loadId || 0) + 1)
    const address = this.address
    const [exchange, pair] =
      this.market && this.market.includes(':')
        ? parseMarket(this.market)
        : ['', '']
    const dex =
      exchange === 'HYPERLIQUID' && pair.includes(':')
        ? pair.split(':')[0]
        : null
    const done = (key: 'perp' | 'portfolio' | 'spot', value) => {
      if (id === this.loadId) {
        this[key] = value
        this.$nextTick(this.refit)
      }
    }

    this.perp = this.portfolio = this.spot = null

    Promise.all(
      [fetchWalletInfo('clearinghouseState', address)].concat(
        dex ? [fetchWalletInfo('clearinghouseState', address, dex)] : []
      )
    )
      .then(states => done('perp', parsePerp(states, pair)))
      .catch(() => done('perp', false))

    fetchWalletInfo('portfolio', address)
      .then(data => done('portfolio', parsePortfolio(data)))
      .catch(() => done('portfolio', false))

    fetchWalletInfo('spotClearinghouseState', address)
      .then(data => done('spot', parseSpot(data)))
      .catch(() => done('spot', false))
  }

  // the card grew, keep it on screen
  refit() {
    if (this.anchor && this.$refs.dropdown) {
      this.$refs.dropdown.fitScreen()
    }
  }

  copyAddress() {
    copyTextToClipboard(this.address)
      .then(() => {
        this.copied = true
        clearTimeout(this.copiedTimeout)
        this.copiedTimeout = setTimeout(
          () => (this.copied = false),
          1500
        ) as unknown as number
      })
      .catch(() => (this.copied = false))
  }

  onDropdownInput(value) {
    // click outside
    if (!value) {
      this.close()
    }
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.close(true)
    }
  }

  onWindowBlur() {
    this.close()
  }

  // focus moved to something else than the card or its chip
  onFocusOut(event: FocusEvent) {
    const target = event.relatedTarget as HTMLElement

    if (
      target &&
      target !== this.returnFocus &&
      !(this.$refs.card && this.$refs.card.contains(target))
    ) {
      this.close()
    }
  }

  /**
   * DOM feed: delegated events on the rows container,
   * chips are the .trade__wallet links rendered by tradesFeed.ts
   */
  bindChips(container: HTMLElement) {
    this.chips = container

    for (const type of CHIP_EVENTS) {
      container.addEventListener(type, this.onChipEvent)
    }
  }

  onChipEvent(event: any) {
    if (event.type === 'pointerdown') {
      this.pointerType = event.pointerType
      return
    }

    if (event.type === 'pointermove' || event.type === 'pointerout') {
      // new rows slide chips under a still mouse, only a real move hovers
      const moved =
        event.clientX !== this.pointerX || event.clientY !== this.pointerY

      if (event.type === 'pointermove') {
        this.pointerX = event.clientX
        this.pointerY = event.clientY
      }

      if (!moved || event.pointerType !== 'mouse') {
        return
      }
    }

    // the row under a still mouse may have changed, so leave from any element
    if (event.type === 'pointerout') {
      if (
        !(
          event.relatedTarget instanceof Element &&
          event.relatedTarget.closest('.trade__wallet')
        )
      ) {
        this.leave()
      }

      return
    }

    const chip =
      event.target instanceof Element &&
      (event.target.closest('.trade__wallet') as HTMLElement)
    const row = chip && chip.closest('.trade')
    const address = row && row.getAttribute('data-user')

    if (!address) {
      if (event.type === 'pointermove') {
        this.leave()
      }

      return
    }

    const market = row.getAttribute('title')

    switch (event.type) {
      case 'pointermove':
        this.hover(chip, address, market, chip)
        break
      case 'focusin':
        if (chip !== this.refocusing) {
          this.hover(chip, address, market, chip)
        }
        break
      case 'focusout':
        if (
          event.relatedTarget &&
          !(this.$refs.card && this.$refs.card.contains(event.relatedTarget))
        ) {
          this.leave()
        }
        break
      case 'click':
        // touch: a tap shows the card, which links to Hyperdash
        if (event.detail && this.pointerType && this.pointerType !== 'mouse') {
          event.preventDefault()
          this.open(chip, address, market, chip)
        }
        this.pointerType = null
        break
      case 'keydown':
        if (event.key === ' ') {
          event.preventDefault()
          this.open(chip, address, market, chip, true)
        }
        break
    }
  }
}
</script>

<style lang="scss" scoped>
.dropdown.wallet-card-dropdown {
  max-width: none;

  // fade only: fitScreen measures the card while it enters, a scale skews it
  &.dropdown-enter {
    transform: none;
  }
}

.wallet-card {
  box-sizing: border-box;
  width: min(22rem, calc(100vw - 1rem));
  padding: 0.75rem;
  font-size: 0.875rem;
  line-height: 1.4;
  color: var(--theme-color-base);

  p {
    margin: 0.5rem 0 0;
  }

  &__label {
    font-size: 0.75rem;
    color: var(--theme-color-200);
    font-weight: 400;
  }

  &__header {
    display: flex;
    align-items: center;
  }

  &__avatar {
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    margin-right: 0.5rem;
    border-radius: 50%;
  }

  &__identity {
    flex-grow: 1;
    min-width: 0;
  }

  &__name {
    font-size: 1rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__whale {
    flex-shrink: 0;
    margin-left: 0.5rem;
    font-size: 1.25rem;
  }

  &__address {
    display: flex;
    align-items: center;
    margin-top: 0.5rem;

    code {
      font-family: $font-monospace;
      font-size: 0.6875rem;
      word-break: break-all;
      color: var(--theme-color-100);
    }
  }

  &__copy {
    margin-left: 0.25rem;
  }

  &__copied {
    font-size: 0.75rem;
    color: var(--theme-buy-100);
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin: 0.75rem 0 0;

    dd {
      margin: 0;
      font-family: $font-monospace;
      font-weight: 600;
      white-space: nowrap;
    }
  }

  &__positions {
    width: 100%;
    margin-top: 0.75rem;
    border-spacing: 0;
    font-family: $font-monospace;
    font-size: 0.6875rem;

    caption {
      text-align: left;
      font-family: $font-base;
      margin-bottom: 0.25rem;
    }

    th,
    td {
      padding: 0.125rem 0 0.125rem 0.5rem;
      text-align: right;
      white-space: nowrap;
      font-weight: 400;

      &:first-child {
        padding-left: 0;
        text-align: left;
      }
    }

    thead th {
      font-family: $font-base;
    }

    small {
      color: var(--theme-color-200);
    }

    .-current {
      th,
      td {
        font-weight: 600;
      }
    }
  }

  &__status {
    font-size: 0.75rem;
    color: var(--theme-color-200);
  }

  &__spot {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__open {
    box-sizing: border-box;
    justify-content: center;
    margin-top: 0.75rem;
  }
}
</style>
