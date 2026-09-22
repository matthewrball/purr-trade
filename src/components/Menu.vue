<template>
  <div id="menu" class="menu" :class="{ '-open': open }">
    <button
      type="button"
      class="menu__button btn"
      aria-label="Menu"
      aria-haspopup="menu"
      :aria-expanded="open ? 'true' : 'false'"
      @click="toggleMenuDropdown"
    >
      <svg
        class="menu__logo"
        viewBox="233 225 790 790"
        shape-rendering="crispEdges"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M338 283h68v38h-68zM847 283h69v38h-69zM338 321h106v33h-106zM807 321h109v33h-109zM338 354h141v34h-141zM774 354h142v34h-142zM338 388h176v10h-176zM739 388h177v10h-177zM338 398h38v24h-38zM418 398h96v24h-96zM739 398h96v24h-96zM877 398h39v24h-39zM338 422h38v13h-38zM418 422h130v13h-130zM706 422h129v13h-129zM877 422h39v13h-39zM338 435h38v18h-38zM456 435h92v18h-92zM706 435h92v18h-92zM877 435h39v18h-39zM338 453h38v22h-38zM456 453h342v22h-342zM877 453h39v22h-39zM338 475h38v37h-38zM418 475h417v37h-417zM877 475h39v37h-39zM338 512h578v22h-578zM305 534h644v25h-644zM305 559h174v30h-174zM514 559h225v30h-225zM774 559h175v30h-175zM305 589h151v37h-151zM536 589h181v37h-181zM798 589h151v37h-151zM267 626h189v43h-189zM536 626h181v43h-181zM798 626h189v43h-189zM267 669h52v14h-52zM406 669h50v14h-50zM536 669h181v14h-181zM798 669h49v14h-49zM935 669h52v14h-52zM267 683h52v28h-52zM406 683h73v28h-73zM514 683h225v28h-225zM774 683h73v28h-73zM935 683h52v28h-52zM267 711h139v39h-139zM456 711h92v39h-92zM706 711h101v39h-101zM847 711h140v39h-140zM305 750h33v39h-33zM406 750h203v39h-203zM645 750h202v39h-202zM916 750h33v39h-33zM305 789h209v26h-209zM548 789h61v26h-61zM645 789h61v26h-61zM739 789h210v26h-210zM305 815h209v12h-209zM609 815h36v12h-36zM739 815h210v12h-210zM338 827h210v25h-210zM609 827h36v25h-36zM706 827h210v25h-210zM338 852h578v10h-578zM376 862h501v32h-501zM406 894h441v32h-441zM444 926h363v30h-363z"
        />
      </svg>
      <i class="menu__chevron icon-down-thin" aria-hidden="true"></i>
    </button>
    <dropdown ref="menuDropdown" @closed="open = false">
      <button
        type="button"
        class="dropdown-item dropdown-item--space-between"
        @click="$store.dispatch('app/showSearch')"
      >
        <span class="mr4">Search</span>
        <i class="icon-search"></i>
      </button>
      <button
        type="button"
        class="dropdown-item"
        @click.stop="$refs.panesDropdown.toggle($event.currentTarget)"
      >
        <i class="icon-dashboard -center mr8"></i>
        <span class="mr4">Pane</span>
        <i class="icon-plus mlauto"></i>
      </button>
      <dropdown
        ref="panesDropdown"
        @mousedown.native.stop
        @touchstart.native.stop
      >
        <button
          class="dropdown-item dropdown-item--space-between"
          @click="addPane('chart')"
        >
          <div>
            <div>Chart</div>
            <div class="dropdown-item__subtitle">Live Chart</div>
          </div>
          <i class="icon-plus" />
        </button>
        <button
          class="dropdown-item dropdown-item--space-between"
          @click="addPane('trades')"
        >
          <div>
            <div>Trades</div>
            <div class="dropdown-item__subtitle">Legacy trades feed</div>
          </div>
          <i class="icon-plus" />
        </button>
        <button
          class="dropdown-item dropdown-item--space-between"
          @click="addPane('trades-lite')"
        >
          <div>
            <div>Trades <span>LITE ⚡️</span></div>
            <div class="dropdown-item__subtitle">Minimal but faster</div>
          </div>
          <i class="icon-plus" />
        </button>
        <button
          class="dropdown-item dropdown-item--space-between"
          @click="addPane('prices')"
        >
          <div>
            <div>Watchlist</div>
            <div class="dropdown-item__subtitle">% change & volume</div>
          </div>
          <i class="icon-plus" />
        </button>
        <button
          class="dropdown-item dropdown-item--space-between"
          @click="addPane('hl-markets')"
        >
          <div>
            <div>HL Markets</div>
            <div class="dropdown-item__subtitle">24h, funding & OI</div>
          </div>
          <i class="icon-plus" />
        </button>
        <button
          class="dropdown-item dropdown-item--space-between"
          @click="addPane('website')"
        >
          <div>
            <div>Website</div>
            <div class="dropdown-item__subtitle">Embed website</div>
          </div>
          <i class="icon-plus" />
        </button>
        <button
          class="dropdown-item dropdown-item--space-between"
          @click="addPane('stats')"
        >
          <div>
            <div>Stats</div>
            <div class="dropdown-item__subtitle">Custom rolling metrics</div>
          </div>
          <i class="icon-plus" />
        </button>
        <button
          class="dropdown-item dropdown-item--space-between"
          @click="addPane('counters')"
        >
          <div>
            <div>Counters</div>
            <div class="dropdown-item__subtitle">Buys/sells by intervals</div>
          </div>
          <i class="icon-plus" />
        </button>
        <button
          v-if="alertsEnabled"
          class="dropdown-item dropdown-item--space-between"
          @click="addPane('alerts')"
        >
          <div>
            <div>Alerts</div>
            <div class="dropdown-item__subtitle">Manage alerts</div>
          </div>
          <i class="icon-plus" />
        </button>
      </dropdown>

      <dropdown
        v-model="volumeSliderOpened"
        v-on="volumeSliderEvents"
        @mousedown.native.stop
        @touchstart.native.stop
        @mouseleave.native="volumeSliderTriggerEvents.mouseleave"
        ref="volumeSlider"
        class="volume-slider"
        interactive
        no-scroll
        transparent
        on-sides
      >
        <slider
          style="width: 100px"
          :min="0"
          :max="3"
          :step="0.01"
          :label="true"
          :value="audioVolume"
          @input="$store.dispatch('settings/setAudioVolume', $event)"
          @reset="$store.dispatch('settings/setAudioVolume', 1)"
          log
        />
      </dropdown>

      <button
        type="button"
        class="dropdown-item dropdown-item--space-between"
        ref="volumeSliderTrigger"
        v-on="volumeSliderTriggerEvents"
        @click="toggleAudio"
      >
        <span class="mr4">Audio</span>
        <i v-if="!useAudio" class="icon-volume-off"></i>
        <i
          v-else
          class="icon-volume-medium"
          :class="{ 'icon-volume-high': audioVolume > 1 }"
        ></i>
      </button>
      <button
        type="button"
        class="dropdown-item dropdown-item--space-between"
        @click="toggleFullscreen"
      >
        <span class="mr4">{{
          isFullscreen ? 'Exit\xa0fullscreen' : 'Go\xa0fullscreen'
        }}</span>
        <i class="icon-enlarge"></i>
      </button>
      <button
        type="button"
        class="dropdown-item dropdown-item--space-between"
        @click="showSettings"
      >
        <span class="mr4">Settings</span>
        <i class="icon-cog"></i>
      </button>
    </dropdown>
  </div>
</template>

<script lang="ts">
import dialogService from '@/services/dialogService'
import { PaneType } from '@/store/panes'
import { Component, Vue } from 'vue-property-decorator'
import { isTouchSupported } from '../utils/touchevent'
import { ALERTS_ENABLED } from '../utils/constants'
import Slider from './framework/picker/Slider.vue'
import SettingsDialog from './settings/SettingsDialog.vue'

@Component({
  name: 'Menu',
  components: {
    Slider
  }
})
export default class Menu extends Vue {
  volumeSliderOpened = false
  isFullscreen = false
  open = false
  alertsEnabled = ALERTS_ENABLED

  $refs!: {
    volumeSlider: any
    volumeSliderTrigger: HTMLElement
  }
  mounted() {
    document.addEventListener(
      'webkitfullscreenchange',
      this.handleFullScreenChange
    )
    document.addEventListener('fullscreenchange', this.handleFullScreenChange)
  }

  get useAudio() {
    return this.$store.state.settings.useAudio
  }

  get audioVolume() {
    return this.$store.state.settings.audioVolume
  }

  get volumeSliderEvents() {
    if (!this.volumeSliderOpened) {
      return null
    }

    return {
      [isTouchSupported() ? 'touchstart' : 'mousedown']: event => {
        event.stopPropagation()
      },
      mouseleave: event => {
        if (
          event.toElement === this.$refs.volumeSliderTrigger ||
          this.$refs.volumeSliderTrigger.contains(event.toElement)
        ) {
          return
        }

        this.volumeSliderOpened = null
      }
    }
  }

  get volumeSliderTriggerEvents() {
    if (this.volumeSliderOpened) {
      return {
        mouseleave: event => {
          if (
            event.toElement === this.$refs.volumeSlider.$el ||
            this.$refs.volumeSlider.$el.contains(event.toElement)
          ) {
            return
          }

          this.volumeSliderOpened = null
        }
      }
    } else {
      return {
        mouseenter: event => {
          this.volumeSliderOpened = event.currentTarget
        }
      }
    }
  }

  showSettings() {
    dialogService.open(SettingsDialog)
  }

  async toggleFullscreen() {
    const doc = document as any
    const body = doc.body

    body.requestFullscreen =
      body.requestFullscreen ||
      body.webkitRequestFullscreen ||
      function () {
        return false
      }
    doc.cancelFullscreen =
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.cancelFullScreen ||
      doc.webkitCancelFullScreen ||
      doc.mozCancelFullScreen ||
      function () {
        return false
      }

    if (this.isFullscreen) {
      doc.cancelFullscreen()
      this.isFullscreen = false
    } else {
      body.requestFullscreen()
      this.isFullscreen = true
    }
  }

  handleFullScreenChange() {
    if (
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement
    ) {
      this.isFullscreen = true
    } else {
      this.isFullscreen = false
    }
  }

  // open state flips on click (the dropdown only reports "opened" after its transition)
  toggleMenuDropdown(event: MouseEvent) {
    this.open = !this.open
    ;(this.$refs.menuDropdown as any).toggle(event.currentTarget)
  }

  toggleMenu() {
    this.open = !this.open

    if (this.open) {
      this.isFullscreen =
        (document as any).webkitIsFullScreen || (document as any).mozFullScreen
          ? true
          : false
    }
  }

  addPane(type: PaneType) {
    this.$store.dispatch('panes/addPane', { type })
  }

  toggleAudio() {
    this.$store.commit('settings/TOGGLE_AUDIO', !this.useAudio)
  }
}
</script>

<style lang="scss">
.menu {
  $self: &;
  $brand: #fbb111;
  position: fixed;
  top: 0.25rem;
  left: 0.25rem;
  z-index: 10;

  .menu__button {
    height: 1.5rem;
    padding: 0 0.375rem 0 0.3125rem;
    gap: 0.25rem;
    border-radius: 0.375rem;
    justify-content: center;
    color: $brand;
    z-index: 1;
    position: relative;
    background-color: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba($brand, 0.45);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(6px);
    transition:
      background-color 0.15s,
      border-color 0.15s,
      box-shadow 0.15s,
      transform 0.1s;

    &:hover,
    &:focus,
    &:active {
      color: $brand;
    }

    &:hover {
      background-color: rgba($brand, 0.14);
      border-color: $brand;
      box-shadow: 0 0 0 3px rgba($brand, 0.12);
    }

    &:active {
      transform: scale(0.96);
    }

    &:focus-visible {
      outline: 2px solid $brand;
      outline-offset: 2px;
    }
  }

  .menu__logo {
    display: block;
    width: 1rem;
    height: 1rem;
  }

  .menu__chevron {
    font-size: 0.625rem;
    opacity: 0.8;
    transition: transform 0.15s;
  }

  &.-open {
    #{$self}__button {
      color: $brand;
      background-color: rgba($brand, 0.2);
      border-color: $brand;
    }

    #{$self}__chevron {
      transform: rotate(180deg);
    }
  }
}

.volume-slider {
  padding: 1rem;
}
</style>
