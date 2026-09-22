<template>
  <div class="alerts-notifications">
    <p class="help-text text-color-50 mt0 mb0">
      <i class="icon-info mr4"></i> Alerts work while Purr is open in a tab.
    </p>
    <button
      v-if="permission === 'default'"
      type="button"
      class="btn -text -small -cases alerts-notifications__enable"
      title="Also show alerts as browser notifications"
      v-tippy
      @click="requestNotifications"
    >
      <i class="icon-plus mr4"></i> Enable browser notifications
    </button>
    <p
      v-else-if="permission === 'denied'"
      class="help-text text-color-50 mt0 mb0"
      title="Allow notifications for this site in your browser settings"
      v-tippy
    >
      <i class="icon-warning mr4"></i> Browser notifications are blocked.
    </p>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import alertService from '@/services/alertService'

@Component({
  name: 'AlertsNotifications'
})
export default class AlertsNotifications extends Vue {
  permission = alertService.getNotificationsPermission()

  async requestNotifications() {
    // the click is the user gesture browsers require
    this.permission = await alertService.requestNotifications()
  }
}
</script>

<style lang="scss" scoped>
.alerts-notifications {
  &__enable {
    padding-left: 0;
    padding-right: 0;
  }
}
</style>
