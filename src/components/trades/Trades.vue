<template>
  <div class="pane-trades">
    <pane-header
      :paneId="paneId"
      ref="paneHeader"
      :settings="() => import('@/components/trades/TradesDialog.vue')"
    >
      <template v-slot:menu>
        <button
          type="button"
          class="dropdown-item"
          @click="upgradeToLite"
          title="✨ Upgrade to the canvas based feed for better performance ✨"
          v-tippy="{
            placement: 'left',
            boundary: 'window',
            followCursor: true,
            distance: 32
          }"
        >
          🚀
          <span class="ml8">Upgrade</span>
        </button>
      </template>
      <hr />
      <dropdown v-model="sliderDropdownTrigger" interactive no-scroll>
        <slider
          style="width: 100px"
          :min="0"
          :max="10"
          :step="0.01"
          label
          :show-completion="false"
          :gradient="gradient"
          :value="thresholdsMultipler"
          @input="
            $store.commit(paneId + '/SET_THRESHOLDS_MULTIPLER', {
              value: $event,
              market: market
            })
          "
          @reset="
            $store.commit(paneId + '/SET_THRESHOLDS_MULTIPLER', {
              value: 1,
              market: market
            })
          "
          log
        >
          <template v-slot:tooltip>
            {{ formatAmount(thresholdsMultipler * minAmount) }}
          </template>
        </slider>
      </dropdown>
      <button
        class="btn"
        @click="
          sliderDropdownTrigger = sliderDropdownTrigger
            ? null
            : $event.currentTarget
        "
      >
        <i class="icon-gauge"></i>
      </button>
    </pane-header>
    <ul
      ref="tradesContainer"
      class="trades-list"
      :class="[
        'hide-scrollbar',
        this.showLogos && '-logos',
        !this.monochromeLogos && '-logos-colors'
      ]"
    ></ul>
    <trades-placeholder
      v-if="showPlaceholder"
      :paneId="paneId"
    ></trades-placeholder>
    <wallet-card ref="walletCard" />
  </div>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator'

import { Trade } from '@/types/types'

import aggregatorService from '@/services/aggregatorService'
import gifsService from '@/services/gifsService'
import PaneMixin from '@/mixins/paneMixin'
import PaneHeader from '@/components/panes/PaneHeader.vue'
import TradesPlaceholder from '@/components/trades/TradesPlaceholder.vue'
import { formatAmount, parseMarket } from '@/services/productsService'
import TradesFeed from '@/components/trades/tradesFeed'
import Slider from '@/components/framework/picker/Slider.vue'
import { TradesPaneState } from '@/store/panesSettings/trades'
import { loadProfiles } from '@/components/trades/wallet'
import WalletCard from '@/components/trades/WalletCard.vue'

@Component({
  components: { PaneHeader, TradesPlaceholder, Slider, WalletCard },
  name: 'Trades'
})
export default class Trades extends Mixins(PaneMixin) {
  showPlaceholder = true
  sliderDropdownTrigger = null

  private feed: TradesFeed

  get market() {
    return this.pane.markets[0]
  }

  get showLogos() {
    return this.$store.state[this.paneId].showLogos
  }

  get monochromeLogos() {
    return this.$store.state[this.paneId].monochromeLogos
  }

  get thresholdsMultipler() {
    return this.$store.state[this.paneId].thresholdsMultipler
  }

  get walletThreshold() {
    return (this.$store.state[this.paneId] as TradesPaneState).walletThreshold
  }

  @Watch('walletThreshold')
  onWalletThresholdChange() {
    if (this.feed) {
      this.feed.cachePreferences()
      this.refreshList()
    }
  }

  get minAmount() {
    return (this.$store.state[this.paneId] as TradesPaneState).thresholds[0].amount
  }

  get gradient() {
    return [
      this.$store.state[this.paneId].thresholds[0].buyColor,
      this.$store.state[this.paneId].thresholds[
        this.$store.state[this.paneId].thresholds.length - 1
      ].buyColor
    ]
  }

  $refs!: {
    tradesContainer: HTMLElement
    walletCard: any
  }

  formatAmount(v) {
    return formatAmount(v)
  }

  created() {
    aggregatorService.on('trades', this.onTrades)

    this._onStoreMutation = this.$store.subscribe(mutation => {
      switch (mutation.type) {
        case 'app/EXCHANGE_UPDATED':
        case 'settings/TOGGLE_SLIPPAGE':
        case this.paneId + '/TOGGLE_PREFERENCE':
          this.feed.cachePreferences()
          this.refreshList()
          break
        case this.paneId + '/SET_MAX_ROWS':
          this.feed.setMaxCount(mutation.payload)
          break
        case 'panes/SET_PANE_MARKETS':
        case this.paneId + '/SET_THRESHOLD_MULTIPLIER':
          if (
            mutation.type !== 'panes/SET_PANE_MARKETS' ||
            mutation.payload.id === this.paneId
          ) {
            this.feed.cachePaneMarkets()
            this.refreshList()
          }
          break
        case this.paneId + '/SET_THRESHOLD_GIF':
          gifsService.getGifs(mutation.payload.value, true)
          this.feed.prepareColors()
          this.refreshList()
          break
        case this.paneId + '/SET_THRESHOLD_AUDIO':
        case this.paneId + '/SET_AUDIO_VOLUME':
        case this.paneId + '/SET_AUDIO_PITCH':
        case 'settings/SET_AUDIO_VOLUME':
        case 'settings/TOGGLE_AUDIO':
          this.feed.cacheAudio()
          break
        case this.paneId + '/SET_AUDIO_THRESHOLD':
        case this.paneId + '/TOGGLE_MUTED':
          this.feed.cacheAudio(false)
          break
        case 'settings/SET_BACKGROUND_COLOR':
        case this.paneId + '/SET_THRESHOLD_COLOR':
        case this.paneId + '/SET_THRESHOLD_AMOUNT':
        case this.paneId + '/SET_THRESHOLDS_MULTIPLER':
        case this.paneId + '/TOGGLE_THRESHOLD_MAX':
        case this.paneId + '/DELETE_THRESHOLD':
        case this.paneId + '/ADD_THRESHOLD':
          this.feed.prepareColors()
          this.refreshList()

          if (
            mutation.type === this.paneId + '/DELETE_THRESHOLD' ||
            this.paneId + '/ADD_THRESHOLD'
          ) {
            this.feed.cacheAudio()
          }
          break
      }
    })
  }

  mounted() {
    this.feed = new TradesFeed(
      this.paneId,
      this.$refs.tradesContainer,
      this.$store.state[this.paneId].maxRows
    )

    // rows drawn before the names arrived
    loadProfiles().then(loaded => loaded && this.feed && this.refreshList())

    // hover / focus / tap a chip for the wallet card
    this.$refs.walletCard.bindChips(this.$refs.tradesContainer)
  }

  beforeDestroy() {
    aggregatorService.off('trades', this.onTrades)

    if (this.feed) {
      this.feed.destroy()
    }
  }

  onTrades(trades: Trade[]) {
    if (this.feed.processTrades(trades) === this.showPlaceholder) {
      this.showPlaceholder = false
    }
  }

  refreshList() {
    const elements = this.$el.getElementsByClassName('trade')

    const trades: Trade[] = []

    for (const element of elements) {
      const [exchange, pair] = parseMarket(element.getAttribute('title'))

      const timestamp = element
        .querySelector('.trade__time')
        .getAttribute('data-timestamp')
      const price = Number(element.getAttribute('data-price')) || 0
      const size =
        parseFloat(
          (element.querySelector('.trade__amount__base') as HTMLElement)
            .innerText
        ) || 0
      const side: 'buy' | 'sell' = element.classList.contains('-buy')
        ? 'buy'
        : 'sell'
      const amount =
        size * (this.$store.state.settings.preferQuoteCurrencySize ? price : 1)
      const trade: Trade = {
        timestamp: timestamp as unknown as number,
        exchange,
        pair,
        price,
        avgPrice: price,
        amount,
        size,
        side,
        user: element.getAttribute('data-user') || undefined,
        maker: element.getAttribute('data-maker') || undefined
      }

      if (element.classList.contains('-liquidation')) {
        trade.liquidation = true
      }

      if (element.classList.contains('-twap')) {
        trade.twap = true
      }

      trades.push(trade)
    }

    this.feed.clear()
    this.feed.processTradesSilent(trades)
  }

  upgradeToLite() {
    this.$store.dispatch(`${this.paneId}/upgradeToLite`)
  }
}
</script>

<style lang="scss">
.pane-trades {
  &.-extra-small .trade {
    padding: 0 1rem 0 1rem;

    &.-level-0 {
      line-height: 1.25em !important;
    }
    &.-level-1 {
      line-height: 1.66em !important;
    }
    &.-level-2 {
      line-height: 1.75em !important;
    }

    .trade__wallet,
    .trade__tags:nth-last-child(2) {
      margin-right: calc(2.4em - 0.5rem);
    }
  }
}

.trades-list {
  margin: 0;
  padding: 0;
  overflow: auto;
  max-height: 100%;
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
  scrollbar-width: none;

  &:not(.-logos) {
    .trade__side + div {
      padding-left: 1em;
    }

    .trade__exchange,
    .trade__pair {
      font-size: 75%;
    }
  }

  &.-logos {
    .trade__exchange {
      overflow: visible;
      text-align: center;
      flex-grow: 0.5;

      &:before {
        font-family: 'icon';
        font-weight: 400;
        font-size: 1em;
        line-height: 0;
        position: relative;
        top: 0.1em;
      }
    }

    @each $exchange, $icon in $exchange-list {
      .-#{$exchange} .trade__exchange:before {
        content: $icon;
      }
    }

    &.-logos-colors {
      .trade__exchange {
        background-repeat: no-repeat;
        background-position: center;
        background-size: 1em;

        &:before {
          display: none;
        }
      }

      @each $exchange, $icon in $exchange-list {
        .-#{$exchange} .trade__exchange {
          background-image: url('../../assets/exchanges/#{$exchange}.svg');
        }
      }
    }
  }
}

.trades-placeholder {
  text-align: center;
  overflow: auto;
  max-height: 100%;

  &__market {
    color: var(--theme-color-200);
  }
}

.trade {
  display: flex;
  background-position: center center;
  background-size: cover;
  background-blend-mode: overlay;
  position: relative;
  padding: 0 2rem 0 1.25rem;

  &:after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 0;
    background-color: white;
    animation: 1s $ease-out-expo highlight;
    pointer-events: none;
  }

  &.-liquidation {
    .icon-side {
      font-size: inherit;

      &:after {
        margin-left: 1rem;
      }
    }

    &.-buy .icon-side:before {
      content: $icon-bear;
    }

    &.-sell .icon-side:before {
      content: $icon-bull;
    }
  }

  &.-sell {
    background-color: lighten($red, 35%);
    color: $red;

    .icon-side:before {
      content: $icon-down;
    }
  }

  &.-buy {
    background-color: lighten($green, 50%);
    color: $green;

    .icon-side:before {
      content: $icon-up;
    }
  }

  &.-level-0 {
    line-height: 1.875em;
    font-size: 0.875em;
  }

  &.-level-1 {
    line-height: 1.875em;
    font-size: 1em;
  }

  &.-level-2 {
    line-height: 1.75em;
    font-size: 1.125em;
    font-weight: 600;
    padding-bottom: 1px;
  }

  &.-level-3 {
    line-height: 2em;
    box-shadow: 0 0 20px rgba(black, 0.5);
    z-index: 1;
    font-size: 1.25em;
    padding-bottom: 2px;
    font-weight: 600;
  }

  // Hyperliquid TWAP slice fills
  &.-twap {
    opacity: 0.55;
  }

  > div {
    flex-grow: 1;
    flex-basis: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trade__side {
    position: absolute;
    left: 0.5rem;
    line-height: inherit;
  }

  .icon-side {
    font-size: 75%;
  }

  .icon-quote,
  .icon-base {
    line-height: 0;
    font-size: 0.875em;
  }

  .trade__pair {
    font-size: 87.5%;
  }

  .trade__exchange {
    text-align: left;
  }

  .trade__price {
    min-width: min-content;

    small {
      font-size: 0.75em;
      font-weight: 400;
      line-height: 1em;
      display: inline-block;
      vertical-align: top;
      padding: 0.2em 0.25em;
    }
  }

  .trade__amount {
    flex-grow: 1.25;
    min-width: min-content;
    .trade__amount__base {
      display: none;
      padding: 0 0.5em;
    }

    &:hover {
      > .trade__amount__base {
        display: block;
      }

      > .trade__amount__quote {
        display: none;
      }
    }
  }

  .trade__wallet {
    display: flex;
    align-items: center;
    color: inherit;
    text-decoration: none;
    white-space: nowrap;
    // price and amount keep min-content, the chip shrinks after the tags
    min-width: 0;
    overflow: hidden;
    margin-left: 0.5em;
    // stop where .trade__time starts, it overhangs the 2rem gutter on big rows
    margin-right: calc(2.4em - 1.5rem);
    font-size: 0.8em;

    &:hover .trade__name {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 1px solid currentColor;
      outline-offset: -1px;
    }

    &.-unnamed .trade__name {
      opacity: 0.6;
    }
  }

  .trade__tags {
    display: flex;
    // a tag that no longer fits wraps out of sight (one line high): who
    // traded comes first, and it never runs over .trade__time
    flex-wrap: wrap;
    align-self: center;
    height: calc(1.12em + 2px);
    // ~infinite: every tag wraps away before the chip gives up any width,
    // not even the sub-pixel that would ellipsize the name
    flex-shrink: 1000000;
    min-width: 0;
    overflow: hidden;
    font-size: 0.8em;

    // empty first item: even the first tag wraps away instead of clipping,
    // 1px last item: the slack that wraps before a tag on a sub-pixel shrink
    &:before,
    &:after {
      content: '';
      height: 100%;
    }

    &:after {
      width: 1px;
    }

    // stop where .trade__time starts when no chip follows
    &:nth-last-child(2) {
      margin-right: calc(2.4em - 1.5rem);
    }
  }

  .trade__tag {
    flex-shrink: 0;
    // the 0.5em gap of the chip, gone with the tag when it wraps away
    margin-left: 0.625em;
    padding: 0 0.3em;
    border: 1px solid currentColor;
    border-radius: 2px;
    font-size: 0.8em;
    font-weight: 600;
    line-height: 1.4;
    text-decoration: none;

    + .trade__tag {
      margin-left: 0.25em;
    }

    &.-maker {
      border-style: dashed;
    }
  }

  .trade__avatar {
    flex-shrink: 0;
    width: 1em;
    height: 1em;
    margin-right: 0.35em;
    border-radius: 50%;
  }

  .trade__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  // atomic: a shrunk short address ellipsizes to "f5…", never "f5……"
  .trade__tail {
    display: inline-block;
  }

  .trade__whale {
    flex-shrink: 0;
    margin-left: 0.25em;
  }

  .trade__time {
    position: absolute;
    right: 0.5rem;
    text-align: right;
    overflow: visible;

    &.-fixed {
      font-size: 87.5%;
    }
  }
}

#app[data-prefered-sizing-currency='base'] .trade .trade__amount {
  .trade__amount__quote {
    display: none;
  }

  .trade__amount__base {
    display: block;
  }

  &:hover {
    > span.trade__amount__base {
      display: none;
    }

    > span.trade__amount__quote {
      display: block;
    }
  }
}

#app.-light .trade.-level-3 {
  box-shadow: 0 0 20px rgba(white, 0.5);
}
</style>
