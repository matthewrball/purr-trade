<template>
  <dropdown-button
    :options="donationMenu"
    :placeholder="label"
    class="-text -arrow"
    @input="onSelect"
  >
    <template v-slot:option="{ value }">
      <i :class="value.icon" style="width: 16px; text-align: center"></i>

      <span>{{ value.label }}</span>
    </template>
  </dropdown-button>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import DropdownButton from '@/components/framework/DropdownButton.vue'
import { copyTextToClipboard } from '@/utils/helpers'

@Component({
  components: {
    DropdownButton
  },
  props: {
    label: {
      default: 'donate'
    }
  }
})
export default class DonoDropdown extends Vue {
  donationMenu = [
    {
      label: 'with Bitcoin',
      icon: 'icon-bitcoin',
      click: () => this.copyAddress('36ojxqhJLdtR9v1i66fPrz7Y46Skocw9NZ', 'Bitcoin')
    },
    {
      label: 'on Hyperliquid',
      icon: 'icon-HYPERLIQUID',
      click: () =>
        this.copyAddress(
          '0x33A9CfaFdB96E2145b5b4EB4ba2c96d21ddB6b8B',
          'Hyperliquid'
        )
    }
  ]

  onSelect(option) {
    if (typeof option.click === 'function') {
      option.click()
    }
  }

  async copyAddress(text, name) {
    await copyTextToClipboard(text)

    this.$store.dispatch('app/showNotice', {
      id: 'copy-address',
      type: 'info',
      title: `${name} address added to clipboard`
    })
  }
}
</script>
