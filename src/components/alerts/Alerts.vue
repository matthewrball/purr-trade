<template>
  <div class="pane-alerts">
    <pane-header
      class="pane-alerts__header"
      :paneId="paneId"
      :settings="() => import('@/components/alerts/AlertsDialog.vue')"
      :show-search="false"
      :show-name="false"
    >
      <hr />
      <Btn type="button" class="-text" @click="$refs.list.getAlerts()">
        <i class="icon-refresh"></i>
      </Btn>
    </pane-header>
    <input
      ref="query"
      type="text"
      placeholder="Search..."
      class="form-control pane-alerts__query pane-overlay"
      v-model="query"
    />
    <alerts-list ref="list" :query="query" persist-sections />
    <alerts-notifications
      v-if="localAlerts"
      class="pane-alerts__notifications"
    />
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import ToggableSection from '@/components/framework/ToggableSection.vue'

import PaneMixin from '@/mixins/paneMixin'
import PaneHeader from '../panes/PaneHeader.vue'
import Btn from '@/components/framework/Btn.vue'
import AlertsList from '@/components/alerts/AlertsList.vue'
import AlertsNotifications from '@/components/alerts/AlertsNotifications.vue'
import { LOCAL_ALERTS } from '@/utils/constants'

@Component({
  components: {
    PaneHeader,
    ToggableSection,
    AlertsList,
    AlertsNotifications,
    Btn
  },
  name: 'Alerts'
})
export default class Alerts extends Mixins(PaneMixin) {
  query = ''
  localAlerts = LOCAL_ALERTS
}
</script>

<style lang="scss" scoped>
.pane-alerts {
  $self: &;

  ::v-deep .alerts-list__table {
    width: 100%;
  }

  &__query {
    border: 0;
    width: 100%;
    position: absolute;
    z-index: 1;
    border-radius: 0;
    padding: 0;
    font-size: 1.125em;
  }

  &__header {
    background: 0;
  }

  &__notifications {
    flex-shrink: 0;
    padding: 0.5rem 1rem;
  }
}
</style>
