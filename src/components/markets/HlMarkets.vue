<template>
  <div class="pane-hl-markets">
    <pane-header :paneId="paneId" :show-search="false">
      <input
        v-model="query"
        type="text"
        placeholder="Search..."
        spellcheck="false"
        class="form-control hl-markets__query -no-grab"
        @keydown.esc="query = ''"
      />
      <i
        v-if="error && rows.length"
        class="icon-warning hl-markets__error"
        :title="error"
      ></i>
      <span class="hl-markets__count">{{ rows.length }}</span>
      <button
        v-for="kind of kinds"
        :key="kind.key"
        type="button"
        class="hl-markets__kind -no-grab"
        :class="[paneState[kind.key] && '-active']"
        :title="kind.title"
        @click="$store.commit(paneId + '/TOGGLE_KIND', kind.key)"
      >
        {{ kind.label }}
      </button>
    </pane-header>
    <div class="hl-markets__body">
      <table class="hl-markets__table">
        <thead>
          <tr>
            <th
              v-for="column of visibleColumns"
              :key="column.key"
              :class="[`-${column.key}`, sortBy === column.key && '-sorted']"
              :title="column.title"
              @click="$store.commit(paneId + '/SET_SORT', column.key)"
            >
              {{ column.label
              }}<i
                v-if="sortBy === column.key"
                :class="sortOrder > 0 ? 'icon-up-thin' : 'icon-down-thin'"
              ></i>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row of rows"
            :key="row.id"
            class="hl-markets__row"
            :title="row.id"
            :data-market="row.id"
            v-draggable-market
            @mousedown="onRowPointerDown"
            @click="openMarket(row, $event)"
          >
            <td class="-market">
              {{ row.label
              }}<span
                v-if="capped[row.id]"
                class="hl-markets__cap"
                title="At its open interest cap: orders that add open interest are restricted"
                >cap</span
              >
            </td>
            <td v-if="columns.mark">{{ row.mark || '–' }}</td>
            <td v-if="columns.change" :class="sideClass(row.change)">
              {{ formatPercent(row.change, 2, true) }}
            </td>
            <td v-if="columns.volume">{{ formatUsd(row.volume) }}</td>
            <td v-if="columns.funding" :class="sideClass(row.funding)">
              {{ formatPercent(row.funding, 4)
              }}<span v-if="row.funding !== null" class="hl-markets__apr">{{
                formatPercent(row.funding * 24 * 365, 1)
              }}</span>
            </td>
            <td v-if="columns.oi">{{ formatUsd(row.oi) }}</td>
            <td v-if="columns.premium">{{ formatPercent(row.premium, 4) }}</td>
            <td v-if="columns.basis">{{ formatPercent(row.basis, 3) }}</td>
            <td v-if="columns.leverage">
              {{ row.leverage ? row.leverage + '×' : '–' }}
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="status" class="hl-markets__status">{{ status }}</div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator'

import PaneMixin from '@/mixins/paneMixin'
import PaneHeader from '../panes/PaneHeader.vue'
import { formatAmount } from '@/services/productsService'
import {
  HlMarketRow,
  HlRateLimitError,
  parseCaps,
  parseDexNames,
  parsePerps,
  parseSpot,
  postHlInfo
} from './hlMarkets'
import {
  HlMarketsKindToggle,
  HlMarketsPaneState,
  HlMarketsSortKey
} from './hlMarketsSettings'

// one tick every 15s, each source refreshes on its own period (weights: 20
// per call). Defaults (perps + spot) ≈ 140 weight/min, HIP-3 adds ≈ 210 with
// today's 4 active dexes, out of the visitor's 1200/min
const TICK = 15000
const REFRESH = {
  perps: 15000,
  spot: 30000, // ~300 KB uncompressed per call
  caps: 60000,
  dexs: 600000,
  dex: 30000,
  idleDex: 600000, // dexes without a listed market
  dexCaps: 120000
}
const RATE_LIMIT_BACKOFF = 60000

const COLUMNS: {
  key: HlMarketsSortKey
  label: string
  title: string
  width: number
}[] = [
  {
    key: 'market',
    label: 'Market',
    title: 'Click a row to open it in the chart, drag it onto any pane',
    width: 8.5
  },
  { key: 'mark', label: 'Mark', title: 'Mark price', width: 5 },
  {
    key: 'change',
    label: '24h',
    title: '24h change of the mark price (vs prevDayPx)',
    width: 4.5
  },
  {
    key: 'volume',
    label: 'Volume',
    title: '24h notional volume (USD)',
    width: 4.5
  },
  {
    key: 'funding',
    label: 'Funding',
    title: 'Hourly funding rate, then the same rate annualized (APR)',
    width: 8.5
  },
  {
    key: 'oi',
    label: 'OI',
    title: 'Open interest in USD (at the mark price)',
    width: 4.5
  },
  {
    key: 'premium',
    label: 'Premium',
    title: 'Premium index (input of the funding rate)',
    width: 5.5
  },
  {
    key: 'basis',
    label: 'vs Oracle',
    title: 'Mark price vs oracle price',
    width: 5.5
  },
  { key: 'leverage', label: 'Lev', title: 'Maximum leverage', width: 3 }
]

// narrow panes drop columns in this order
const DROP_ORDER: HlMarketsSortKey[] = [
  'basis',
  'premium',
  'leverage',
  'oi',
  'funding',
  'volume',
  'mark'
]

@Component({
  components: { PaneHeader },
  name: 'HlMarkets'
})
export default class HlMarkets extends Mixins(PaneMixin) {
  query = ''
  perps: HlMarketRow[] = []
  spot: HlMarketRow[] = []
  dexs: string[] = []
  dexRows: { [dex: string]: HlMarketRow[] } = {}
  capsBySource: { [source: string]: string[] } = {}
  isLoading = true
  error: string = null
  availableWidth = Infinity
  kinds: { key: HlMarketsKindToggle; label: string; title: string }[] = [
    { key: 'showPerps', label: 'Perps', title: 'Main Hyperliquid perps' },
    { key: 'showSpot', label: 'Spot', title: 'Spot pairs' },
    {
      key: 'showHip3',
      label: 'HIP-3',
      title: 'Builder-deployed perp dexes (xyz, para, ...)'
    }
  ]

  // non reactive
  private pollTimer: number
  private isPolling: boolean
  private pollAgain: boolean
  private fetchedAt: { [source: string]: number }
  private backoffUntil: number
  private abortController: AbortController
  private lastChartId: string
  private pointerDown: [number, number]

  get paneState(): HlMarketsPaneState {
    return this.$store.state[this.paneId]
  }

  get sortBy() {
    return this.paneState.sortBy
  }

  get sortOrder() {
    return this.paneState.sortOrder
  }

  get showPerps() {
    return this.paneState.showPerps
  }

  get showSpot() {
    return this.paneState.showSpot
  }

  get showHip3() {
    return this.paneState.showHip3
  }

  get columns(): { [key: string]: boolean } {
    const columns = COLUMNS.reduce((acc, column) => {
      acc[column.key] = true
      return acc
    }, {})

    let width = COLUMNS.reduce((sum, column) => sum + column.width, 0)

    for (const key of DROP_ORDER) {
      if (width <= this.availableWidth) {
        break
      }

      columns[key] = false
      width -= COLUMNS.find(column => column.key === key).width
    }

    return columns
  }

  get visibleColumns() {
    return COLUMNS.filter(column => this.columns[column.key])
  }

  get capped(): { [id: string]: boolean } {
    const capped = {}

    for (const source in this.capsBySource) {
      for (const id of this.capsBySource[source]) {
        capped[id] = true
      }
    }

    return capped
  }

  get rows(): HlMarketRow[] {
    let rows: HlMarketRow[] = []

    if (this.showPerps) {
      rows = rows.concat(this.perps)
    }

    if (this.showSpot) {
      rows = rows.concat(this.spot)
    }

    if (this.showHip3) {
      for (const dex of this.dexs) {
        rows = rows.concat(this.dexRows[dex] || [])
      }
    }

    const query = this.query.trim().toLowerCase()

    if (query) {
      rows = rows.filter(
        row =>
          row.label.toLowerCase().indexOf(query) !== -1 ||
          row.pair.toLowerCase().indexOf(query) !== -1
      )
    } else {
      // ~200 spot pairs have not traded in 24h, a search still finds them
      rows = rows.filter(row => row.volume)
    }

    const order = this.sortOrder > 0 ? 1 : -1

    if (this.sortBy === 'market') {
      return rows.sort((a, b) => a.label.localeCompare(b.label) * order)
    }

    const key = this.sortBy === 'mark' ? 'markPx' : this.sortBy

    return rows.sort((a, b) => {
      // markets without the value (spot funding, OI...) stay at the bottom
      if (a[key] === null) {
        return b[key] === null ? 0 : 1
      }

      if (b[key] === null) {
        return -1
      }

      return (a[key] - b[key]) * order
    })
  }

  get status() {
    if (!this.showPerps && !this.showSpot && !this.showHip3) {
      return 'Pick perps, spot or HIP-3'
    }

    if (this.rows.length) {
      return null
    }

    if (this.error) {
      return this.error
    }

    if (this.isLoading) {
      return 'Loading Hyperliquid markets...'
    }

    if (this.query.trim()) {
      return `No market matching "${this.query.trim()}"`
    }

    return 'No market'
  }

  @Watch('showPerps')
  @Watch('showSpot')
  @Watch('showHip3')
  onKindsChange() {
    this.poll()
  }

  @Watch('$store.state.app.focusedPaneId', { immediate: true })
  onFocusedPaneChange(id: string) {
    const pane = id && this.$store.state.panes.panes[id]

    if (pane && pane.type === 'chart') {
      this.lastChartId = id
    }
  }

  @Watch('pane.zoom')
  onZoomChange() {
    this.$nextTick(() => {
      this.onResize(this.$el.clientWidth)
    })
  }

  created() {
    this.fetchedAt = {}
    this.backoffUntil = 0
    this.abortController = new AbortController()
  }

  mounted() {
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.pollTimer = window.setInterval(this.poll, TICK)
    this.poll()
  }

  beforeDestroy() {
    clearInterval(this.pollTimer)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.abortController.abort()
  }

  onResize(width: number) {
    const fontSize = parseFloat(getComputedStyle(this.$el).fontSize) || 14

    // columns widths are in em of the pane font
    this.availableWidth = width / fontSize
  }

  onVisibilityChange() {
    if (!document.hidden) {
      this.poll()
    }
  }

  async poll() {
    if (this.isPolling) {
      this.pollAgain = true
      return
    }

    // poll only while the tab and the pane are visible
    if (
      document.hidden ||
      !this.$el.getClientRects().length ||
      Date.now() < this.backoffUntil
    ) {
      return
    }

    this.isPolling = true

    const now = Date.now()
    const signal = this.abortController.signal
    const errors = []
    const jobs: Promise<void>[] = []

    const isDue = (source: string, period: number) =>
      now - (this.fetchedAt[source] || 0) >= period - 1000

    const request = (source: string, body, handler: (response) => void) => {
      this.fetchedAt[source] = now
      jobs.push(
        postHlInfo(body, signal).then(response => {
          if (!signal.aborted) {
            handler(response)
          }
        })
      )
    }

    if (this.showHip3 && isDue('dexs', REFRESH.dexs)) {
      this.fetchedAt.dexs = now

      try {
        this.dexs = parseDexNames(
          await postHlInfo({ type: 'perpDexs' }, signal)
        )
      } catch (error) {
        errors.push(error)

        if (!this.dexs.length) {
          // retry on the next tick rather than in 10 minutes
          this.fetchedAt.dexs = 0
        }
      }
    }

    if (this.showPerps) {
      if (isDue('perps', REFRESH.perps)) {
        request('perps', { type: 'metaAndAssetCtxs' }, response => {
          this.perps = Object.freeze(parsePerps(response)) as HlMarketRow[]
        })
      }

      if (isDue('caps', REFRESH.caps)) {
        request('caps', { type: 'perpsAtOpenInterestCap' }, response => {
          this.setCaps('', response)
        })
      }
    }

    if (this.showSpot && isDue('spot', REFRESH.spot)) {
      request('spot', { type: 'spotMetaAndAssetCtxs' }, response => {
        this.spot = Object.freeze(parseSpot(response)) as HlMarketRow[]
      })
    }

    if (this.showHip3) {
      for (const dex of this.dexs) {
        const rows = this.dexRows[dex]
        const isIdle = rows && !rows.length

        if (isDue('dex:' + dex, isIdle ? REFRESH.idleDex : REFRESH.dex)) {
          request('dex:' + dex, { type: 'metaAndAssetCtxs', dex }, response => {
            this.dexRows = Object.freeze({
              ...this.dexRows,
              [dex]: Object.freeze(parsePerps(response, dex))
            }) as { [dex: string]: HlMarketRow[] }
          })
        }

        if (rows && rows.length && isDue('caps:' + dex, REFRESH.dexCaps)) {
          request(
            'caps:' + dex,
            { type: 'perpsAtOpenInterestCap', dex },
            response => {
              this.setCaps(dex, response)
            }
          )
        }
      }
    }

    for (const result of await Promise.allSettled(jobs)) {
      if (result.status === 'rejected') {
        errors.push(result.reason)
      }
    }

    if (signal.aborted) {
      return
    }

    if (errors.some(error => error instanceof HlRateLimitError)) {
      this.backoffUntil = Date.now() + RATE_LIMIT_BACKOFF
      this.error = 'Hyperliquid rate limit reached, retrying in a minute'
    } else if (errors.length) {
      console.warn('[hl-markets] refresh failed', errors[0])
      this.error = `Couldn't reach Hyperliquid, retrying...`
    } else {
      this.error = null
    }

    this.isLoading = false
    this.isPolling = false

    if (this.pollAgain) {
      this.pollAgain = false
      this.poll()
    }
  }

  setCaps(source: string, response) {
    this.capsBySource = Object.freeze({
      ...this.capsBySource,
      [source]: Object.freeze(parseCaps(response))
    }) as { [source: string]: string[] }
  }

  onRowPointerDown(event: MouseEvent) {
    this.pointerDown = [event.clientX, event.clientY]
  }

  /**
   * Opens the market in the chart pane: the chart focused last, else the
   * first chart of the workspace, else a new chart pane.
   * Like a drop, it replaces that chart's markets with this single market
   */
  openMarket(row: HlMarketRow, event: MouseEvent) {
    const pointerDown = this.pointerDown
    this.pointerDown = null

    if (
      pointerDown &&
      Math.abs(event.clientX - pointerDown[0]) +
        Math.abs(event.clientY - pointerDown[1]) >
        4
    ) {
      // that was a drag
      return
    }

    const panes = this.$store.state.panes.panes
    let chartId =
      this.lastChartId &&
      panes[this.lastChartId] &&
      panes[this.lastChartId].type === 'chart'
        ? this.lastChartId
        : null

    if (!chartId) {
      chartId = Object.keys(panes).find(id => panes[id].type === 'chart')
    }

    if (!chartId) {
      this.$store.dispatch('panes/addPane', {
        type: 'chart',
        markets: [row.id]
      })
      return
    }

    this.$store.dispatch('panes/setMarketsForPane', {
      id: chartId,
      markets: [row.id]
    })
    this.$store.commit('app/SET_FOCUSED_PANE', chartId)
  }

  sideClass(value: number) {
    if (!value) {
      return null
    }

    return value > 0 ? '-up' : '-down'
  }

  formatPercent(value: number, decimals: number, signed?: boolean) {
    if (value === null || !Number.isFinite(value)) {
      return '–'
    }

    // round half away from zero (0.0000125 x 8760 = 10.95%, not 10.9%)
    const factor = Math.pow(10, decimals)
    value = Math.round(value * factor + Math.sign(value) * 1e-6) / factor

    return (
      (signed && value > 0 ? '+' : '') + (value || 0).toFixed(decimals) + '%'
    )
  }

  formatUsd(value: number) {
    if (value === null || !Number.isFinite(value)) {
      return '–'
    }

    return (
      '$' + String(formatAmount(value, value >= 1e9 ? 2 : 1)).replace(/\s/, '')
    )
  }
}
</script>

<style lang="scss" scoped>
.hl-markets {
  &__query {
    flex-grow: 1;
    min-width: 3em;
    border: 0;
    border-radius: 0;
    padding: 0 0.25em;
    font-size: 0.875em;
  }

  &__count {
    align-self: center;
    margin-right: 0.25em;
    font-family: $font-monospace;
    font-size: 0.75em;
    color: var(--theme-color-50);
  }

  &__error {
    align-self: center;
    margin-right: 0.25em;
    font-size: 0.75em;
    color: var(--theme-sell-base);
  }

  &__kind {
    align-self: center;
    margin-right: 0.125em;
    font-family: $font-condensed;
    text-transform: uppercase;
    font-size: 0.75em;
    line-height: 1;
    padding: 0.25em 0.375em;
    border-radius: 0.25em;
    color: var(--theme-color-50);
    cursor: pointer;

    &:hover {
      color: var(--theme-color-base);
    }

    &.-active {
      color: var(--theme-color-base);
      background-color: var(--theme-background-100);
    }
  }

  &__body {
    flex-grow: 1;
    min-height: 0;
    overflow: auto;

    // the header floats over the pane when headers auto-hide
    #app.-auto-hide-headers & {
      margin-top: 1.375em;
    }
  }

  &__table {
    width: 100%;
    border-collapse: collapse;
    font-family: $font-monospace;
    font-size: 0.875em;
    white-space: nowrap;

    th,
    td {
      text-align: right;
      padding: 0.125em 0.375em;

      &.-market,
      &:first-child {
        text-align: left;
      }
    }

    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background-color: var(--theme-background-base);
      font-family: $font-condensed;
      font-weight: 400;
      text-transform: uppercase;
      color: var(--theme-color-50);
      cursor: pointer;
      user-select: none;

      &:hover,
      &.-sorted {
        color: var(--theme-color-base);
      }

      i {
        font-size: 0.75em;
        margin-left: 0.125em;
      }
    }

    .-up {
      color: var(--theme-buy-base);
    }

    .-down {
      color: var(--theme-sell-base);
    }
  }

  &__row {
    cursor: pointer;

    &:hover {
      background-color: var(--theme-background-100);
    }
  }

  &__apr {
    margin-left: 0.5em;
    opacity: 0.5;
  }

  &__cap {
    margin-left: 0.375em;
    padding: 0.125em 0.25em;
    border-radius: 0.25em;
    font-family: $font-condensed;
    font-size: 0.75em;
    text-transform: uppercase;
    background-color: var(--theme-sell-50);
    color: var(--theme-sell-color);
  }

  &__status {
    padding: 0.5em;
    font-size: 0.875em;
    color: var(--theme-color-50);
  }
}
</style>
