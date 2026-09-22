import store from '@/store'
import { TradesPaneState } from '@/store/panesSettings/trades'
import { Trade } from '@/types/types'
import { LOCAL_ALERTS } from '@/utils/constants'
import { getApiUrl, handleFetchError } from '@/utils/helpers'
import aggregatorService from './aggregatorService'
import audioService from './audioService'
import dialogService from './dialogService'
import {
  formatAmount,
  formatMarketPrice,
  getMarketLabel,
  stripStablePair
} from './productsService'
import workspacesService from './workspacesService'

interface AlertResponse {
  error?: string
  markets?: string[]
  alert?: any
  priceOffset?: number
}

export interface MarketAlerts {
  market: string
  alerts: MarketAlert[]
}

export interface MarketAlert {
  price: number
  market: string
  message?: string
  active?: boolean
  timestamp?: number
  triggered?: boolean
}

export interface AlertEvent {
  type: AlertEventType
  price: number
  market: string
  message?: string
  timestamp?: number
  newPrice?: number
}

export enum AlertEventType {
  CREATED,
  ACTIVATED,
  DELETED,
  STATUS,
  DEACTIVATED,
  TRIGGERED,
  UPDATED
}

class AlertService {
  alerts: { [market: string]: MarketAlert[] } = {}

  private publicVapidKey = import.meta.env.VITE_APP_PUBLIC_VAPID_KEY
  private pushSubscription: PushSubscription
  private url: string
  private _promiseOfSync: Promise<void>

  // local (in-tab) alerts
  private tickerPrices: { [marketKey: string]: number } = {}
  private indexPrices: { [index: string]: number } = {}
  private notificationsOffered = false

  constructor() {
    this.url = getApiUrl('alert')
  }

  formatPrice(price) {
    return +price.toFixed(8)
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  /**
   * Query database alerts for given markets
   * Wait for sync to complete before query
   * @param market
   * @returns
   */
  async getAlerts(market) {
    if (this.alerts[market]) {
      return this.alerts[market]
    }

    if (this._promiseOfSync) {
      await this._promiseOfSync
    }

    const alerts = await workspacesService.getAlerts(market)

    this.alerts[market] = alerts

    return this.alerts[market]
  }

  async getAlert(market, price) {
    if (!this.alerts[market]) {
      await this.getAlerts(market)
    }

    const alert = this.alerts[market].find(alert => alert.price === price)

    return alert
  }

  /**
   * Update alerts triggered status using pending notifications
   */
  async syncTriggeredAlerts() {
    // trades panes "Notify on trades >= $X" (in-tab, push or local mode)
    aggregatorService.on('trades', this.onTrades.bind(this))

    if (LOCAL_ALERTS) {
      // no alert server: this tab evaluates the stored alerts on live prices
      this._promiseOfSync = this.loadAllAlerts()
      aggregatorService.on('tickers', this.onTickers.bind(this))
      return
    }

    this._promiseOfSync = new Promise<void>(resolve => {
      // recover recent triggers
      navigator.serviceWorker.ready.then(async registration => {
        const notifications = (await registration.getNotifications()).map(
          notification => ({
            price: notification.data.price,
            direction: notification.data.direction,
            message: notification.data.message,
            market: notification.data.market
          })
        )
        await this.markAlertsAsTriggered(notifications)

        resolve()
      })
    }).then(() => {
      // subscribe to triggers
      navigator.serviceWorker.addEventListener('message', event => {
        this.markAlertsAsTriggered([event.data])

        aggregatorService.emit('alert', {
          ...event.data,
          type: AlertEventType.TRIGGERED
        })
      })
    })
  }

  async markAlertsAsTriggered(alerts: { price: number; market: string }[]) {
    const markets = alerts.reduce((acc, { price, market }) => {
      if (!market || typeof price !== 'number') {
        return acc
      }

      if (!acc[market]) {
        acc[market] = []
      }

      acc[market].push(price)

      return acc
    }, {})

    for (const market in markets) {
      if (!this.alerts[market]) {
        this.alerts[market] = await workspacesService.getAlerts(market)
      }

      if (!this.alerts[market].length) {
        continue
      }

      let mutation = false

      for (const price of markets[market]) {
        const alert = this.alerts[market].find(a => a.price === price)

        if (alert && !alert.triggered) {
          alert.triggered = true
          mutation = true
        } else {
          console.error(
            `[alertService] couldn't set alert as triggered (alert not found @${price})`
          )
        }
      }

      if (mutation) {
        await workspacesService.saveAlerts({
          market,
          alerts: this.alerts[market]
        })
      }
    }
  }

  async getPushSubscription() {
    if (!this.publicVapidKey) {
      return
    }

    if (this.pushSubscription) {
      return this.pushSubscription
    }

    if ('serviceWorker' in navigator) {
      const base_url = import.meta.env.VITE_APP_BASE_PATH || '/'
      const register = await navigator.serviceWorker.getRegistration(
        `${base_url}sw.js`
      )

      this.pushSubscription = JSON.parse(
        JSON.stringify(
          await register.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: this.urlBase64ToUint8Array(
              this.publicVapidKey
            )
          })
        )
      )
    }

    return this.pushSubscription
  }

  async subscribe(
    market: string,
    price: number,
    currentPrice?: number,
    message?: string
  ) {
    const data = await this.toggleAlert(
      market,
      price,
      currentPrice,
      false,
      false,
      message
    )

    if (!data.error) {
      store.dispatch('app/showNotice', {
        title: `Added ${market} ${this.getNoticeLabel(
          market,
          price,
          data.priceOffset
        )}`,
        type: 'success'
      })
    }

    return data
  }

  async unsubscribe(market: string, price: number) {
    const data = await this.toggleAlert(market, price, null, true)

    if (data.alert) {
      const { alert } = data

      store.dispatch('app/showNotice', {
        title: `Removed ${alert.market} ${this.getNoticeLabel(market, price)}`,
        type: 'success'
      })
    }

    return data
  }

  async toggleAlert(
    market: string,
    price: number,
    currentPrice?: number,
    unsubscribe?: boolean,
    status?: boolean,
    message?: string
  ): Promise<AlertResponse> {
    if (LOCAL_ALERTS) {
      // nothing to register: the tab evaluates stored alerts (see onTickers)
      return unsubscribe ? { alert: { market, price } } : {}
    }

    const subscription = await this.getPushSubscription()

    if (!subscription) {
      return
    }

    const origin = location.href.replace(/#.*/, '')

    return fetch(this.url, {
      method: 'POST',
      body: JSON.stringify({
        ...subscription,
        origin,
        market,
        price,
        currentPrice,
        unsubscribe,
        message,
        status
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          throw new Error(data.error)
        }

        return data
      })
      .catch(err => {
        handleFetchError(err)

        return { error: err.message }
      })
  }

  async createAlert(
    createdAlert: MarketAlert,
    referencePrice?: number,
    askMessage?: boolean
  ) {
    if (!this.alerts[createdAlert.market]) {
      await this.getAlerts(createdAlert.market)
    }

    aggregatorService.emit('alert', {
      price: createdAlert.price,
      market: createdAlert.market,
      timestamp: createdAlert.timestamp,
      type: AlertEventType.CREATED
    })

    if (askMessage) {
      createdAlert.message = await dialogService.openAsPromise(
        (await import('@/components/alerts/CreateAlertDialog.vue')).default,
        {
          price: +formatMarketPrice(createdAlert.price, createdAlert.market)
        }
      )

      if (typeof createdAlert.message !== 'string') {
        aggregatorService.emit('alert', {
          price: createdAlert.price,
          market: createdAlert.market,
          type: AlertEventType.DELETED
        })
        return
      }
    }

    this.alerts[createdAlert.market].push(createdAlert)

    await this.subscribe(
      createdAlert.market,
      createdAlert.price,
      referencePrice,
      createdAlert.message
    )
      .then(data => {
        createdAlert.active = !data.error
      })
      .catch(err => {
        store.dispatch('app/showNotice', {
          id: 'alert-registration-failure',
          title: `${err.message}\nYou need to make sure your browser is set to allow push notifications.`,
          type: 'error'
        })
      })

    if (createdAlert.active) {
      aggregatorService.emit('alert', {
        price: createdAlert.price,
        market: createdAlert.market,
        timestamp: createdAlert.timestamp,
        message: createdAlert.message,
        type: AlertEventType.ACTIVATED
      })

      if (LOCAL_ALERTS) {
        this.offerNotifications()
      }
    }

    workspacesService.saveAlerts({
      market: createdAlert.market,
      alerts: this.alerts[createdAlert.market]
    })
  }

  async moveAlert(
    market,
    price,
    newAlert: MarketAlert,
    currentPrice: number
  ): Promise<void> {
    const subscription = await this.getPushSubscription()

    if (subscription) {
      const origin = location.href

      newAlert.triggered = false

      newAlert.active = await fetch(this.url, {
        method: 'POST',
        body: JSON.stringify({
          ...subscription,
          origin,
          market,
          price,
          newPrice: newAlert.price,
          message: newAlert.message,
          currentPrice
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })
        .then(response => response.json())
        .then(json => {
          if (json.error) {
            throw new Error(json.error)
          }

          store.dispatch('app/showNotice', {
            title: `Moved ${market} ${this.getNoticeLabel(
              market,
              price,
              json.priceOffset
            )}`,
            type: 'success'
          })

          return true
        })
        .catch(err => {
          handleFetchError(err)

          return false
        })
    } else if (LOCAL_ALERTS) {
      // moved or edited: armed again for this tab
      newAlert.triggered = false
      newAlert.active = true

      store.dispatch('app/showNotice', {
        title: `${newAlert.price !== price ? 'Moved' : 'Updated'} ${market} ${this.getNoticeLabel(market, newAlert.price)}`,
        type: 'success'
      })
    }

    const alert = await this.getAlert(market, price)

    if (alert) {
      this.alerts[market][this.alerts[market].indexOf(alert)] = {
        ...alert,
        ...newAlert
      }
      await workspacesService.saveAlerts({
        market: market,
        alerts: this.alerts[market]
      })
    } else {
      console.error(
        `[alertService] couldn't update alert (alert not found @${price})`,
        this.alerts[market]
      )
    }

    aggregatorService.emit('alert', {
      price,
      market,
      newPrice: newAlert.price,
      type: AlertEventType.UPDATED
    })

    if (newAlert.active) {
      aggregatorService.emit('alert', {
        price: newAlert.price,
        market,
        message: newAlert.message,
        type: AlertEventType.ACTIVATED
      })
    }
  }

  async deactivateAlert({ market, price }: { market: string; price: number }) {
    const alert = await this.getAlert(market, price)

    if (alert) {
      alert.active = false

      await workspacesService.saveAlerts({
        market,
        alerts: this.alerts[market]
      })
    }

    aggregatorService.emit('alert', {
      price,
      market,
      type: AlertEventType.DEACTIVATED
    })
  }

  async removeAlert(removedAlert: MarketAlert) {
    aggregatorService.emit('alert', {
      price: removedAlert.price,
      market: removedAlert.market,
      type: AlertEventType.DELETED
    })

    if (!removedAlert.triggered) {
      try {
        await this.unsubscribe(removedAlert.market, removedAlert.price)
      } catch (err) {
        if (alert && removedAlert.active) {
          store.dispatch('app/showNotice', {
            id: 'alert-registration-failure',
            title: `${err.message}\nYou need to make sure your browser is set to allow push notifications.`,
            type: 'error'
          })
        }
      }
    }

    if (!this.alerts[removedAlert.market]) {
      await this.getAlerts(removedAlert.market)
    }

    if (this.alerts[removedAlert.market].length) {
      const removedAlertIndex = this.alerts[removedAlert.market].findIndex(
        alert => alert.price === removedAlert.price
      )

      if (removedAlertIndex !== -1) {
        this.alerts[removedAlert.market].splice(removedAlertIndex, 1)

        await workspacesService.saveAlerts({
          market: removedAlert.market,
          alerts: this.alerts[removedAlert.market]
        })
      } else {
        console.error(
          `[alertService] couldn't splice alert (no alerts with price @${removedAlert.price})`,
          this.alerts[removedAlert.market]
        )
      }
    } else {
      console.error(
        `[alertService] couldn't update alert (no alerts data for market ${removedAlert.price})`
      )
    }
  }

  getNoticeLabel(market: string, price: number, offset?: number) {
    const priceLabel = `@${formatMarketPrice(price, market)}`

    let offsetLabel = ''

    if (offset) {
      const percent = Math.abs((1 - (price + offset) / price) * -1 * 100)
      offsetLabel = ` (± ${formatMarketPrice(offset, market)}${
        percent > 0.5 ? ` ⚠️` : ''
      })`
    }

    return priceLabel + offsetLabel
  }

  /**
   * Local alerts: cache every stored alert so the tab can evaluate them
   */
  private async loadAllAlerts() {
    const groups: MarketAlerts[] = await workspacesService.getAllAlerts()

    for (const group of groups) {
      if (!this.alerts[group.market]) {
        this.alerts[group.market] = group.alerts
      }
    }
  }

  /**
   * Local alerts: average price of each coin (grouped like the chart does,
   * "Uses average price of the coin") checked against its alerts on every tickers update
   */
  private onTickers(tickers: { [marketKey: string]: { price: number } }) {
    for (const marketKey in tickers) {
      this.tickerPrices[marketKey] = tickers[marketKey].price
    }

    const totals: { [index: string]: { sum: number; count: number } } = {}

    for (const marketKey in this.tickerPrices) {
      const product = store.state.panes.marketsListeners[marketKey]

      if (!product || !product.local) {
        delete this.tickerPrices[marketKey]
        continue
      }

      const index = stripStablePair(product.local)

      if (!totals[index]) {
        totals[index] = { sum: 0, count: 0 }
      }

      totals[index].sum += this.tickerPrices[marketKey]
      totals[index].count++
    }

    for (const index in totals) {
      const price = totals[index].sum / totals[index].count
      const previousPrice = this.indexPrices[index]

      this.indexPrices[index] = price

      if (
        previousPrice &&
        store.state.settings.alerts &&
        this.alerts[index] &&
        this.alerts[index].length
      ) {
        this.checkAlerts(index, previousPrice, price)
      }
    }
  }

  private checkAlerts(index: string, previousPrice: number, price: number) {
    for (const alert of this.alerts[index]) {
      if (!alert.active || alert.triggered) {
        continue
      }

      const crossedUp = previousPrice < alert.price && price >= alert.price
      const crossedDown = previousPrice > alert.price && price <= alert.price

      if (crossedUp || crossedDown) {
        this.triggerLocalAlert(alert, price, crossedUp)
      }
    }
  }

  private triggerLocalAlert(alert: MarketAlert, price: number, up: boolean) {
    alert.triggered = true

    workspacesService.saveAlerts({
      market: alert.market,
      alerts: this.alerts[alert.market]
    })

    aggregatorService.emit('alert', {
      price: alert.price,
      market: alert.market,
      message: alert.message,
      type: AlertEventType.TRIGGERED
    })

    const alertPrice = formatMarketPrice(alert.price, alert.market)

    store.dispatch('app/showNotice', {
      id: `alert-${alert.market}-${alert.price}`,
      type: 'info',
      icon: up ? 'icon-up' : 'icon-down',
      title:
        `${alert.market} crossed ${alertPrice}` +
        (alert.message ? `\n${alert.message}` : ''),
      timeout: 0
    })

    this.playAlertSound()

    this.showBrowserNotification(
      `${alert.market} ${up ? '↑' : '↓'} ${alertPrice}`,
      (alert.message ? alert.message + '\n' : '') +
        `Price crossed ${alertPrice} (now ${formatMarketPrice(
          price,
          alert.market
        )})`,
      `purr-alert-${alert.market}-${alert.price}`
    )
  }

  private playAlertSound() {
    const alertSound = store.state.settings.alertSound

    if (alertSound) {
      audioService.playOnce(alertSound).catch(err => {
        console.error(`[alertService] failed to play ${alertSound}`, err)
      })
    } else {
      audioService.playChime()
    }
  }

  getNotificationsPermission(): NotificationPermission | 'unsupported' {
    return 'Notification' in window ? Notification.permission : 'unsupported'
  }

  /**
   * Ask for browser notifications. Only call it from a click handler
   */
  requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
    if (!('Notification' in window)) {
      return Promise.resolve('unsupported')
    }

    return new Promise<NotificationPermission>(resolve => {
      // older Safari only supports the callback form
      const promise = Notification.requestPermission(resolve)

      if (promise) {
        promise.then(resolve, () => resolve(Notification.permission))
      }
    }).then(permission => {
      store.dispatch('app/showNotice', {
        id: 'alert-notifications-result',
        type: permission === 'granted' ? 'success' : 'info',
        title:
          permission === 'granted'
            ? 'Browser notifications are on'
            : 'Browser notifications are off.\nAlerts still show here while Purr is open.'
      })

      return permission
    })
  }

  /**
   * After a local alert is created: offer browser notifications (the click on the notice is the user gesture)
   */
  private offerNotifications() {
    if (
      this.notificationsOffered ||
      this.getNotificationsPermission() !== 'default'
    ) {
      return
    }

    this.notificationsOffered = true

    store.dispatch('app/showNotice', {
      id: 'alert-notifications',
      type: 'info',
      timeout: 15000,
      title:
        'Alerts work while Purr is open in a tab.\nClick here to also get browser notifications.',
      action: () => {
        this.requestNotifications()
      }
    })
  }

  private async showBrowserNotification(
    title: string,
    body: string,
    tag: string
  ) {
    if (this.getNotificationsPermission() !== 'granted') {
      return
    }

    const base_url = import.meta.env.VITE_APP_BASE_PATH || '/'
    const options = {
      body,
      tag,
      icon: `${base_url}android-chrome-192x192.png`,
      data: { url: location.href }
    }

    try {
      const registration =
        'serviceWorker' in navigator &&
        (await navigator.serviceWorker.getRegistration(`${base_url}sw.js`))

      if (registration) {
        // sw.js focuses the tab on click
        await registration.showNotification(title, options)
        return
      }
    } catch (error) {
      console.error('[alertService] service worker notification failed', error)
    }

    try {
      const notification = new Notification(title, options)

      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    } catch (error) {
      console.error('[alertService] notification failed', error)
    }
  }

  /**
   * Trades panes "Notify on trades >= $X": large prints while the tab is hidden
   */
  private onTrades(trades: Trade[]) {
    if (!document.hidden) {
      return
    }

    const thresholds = this.getTradePrintThresholds()

    if (!thresholds) {
      return
    }

    let print: Trade
    let printValue = 0
    let count = 0

    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i]

      if (trade.liquidation || !trade.size || !trade.price) {
        continue
      }

      const threshold = thresholds[trade.exchange + ':' + trade.pair]

      if (!threshold) {
        continue
      }

      const value = (trade.avgPrice || trade.price) * trade.size

      if (value < threshold) {
        continue
      }

      count++

      if (value > printValue) {
        print = trade
        printValue = value
      }
    }

    if (print) {
      this.notifyTradePrint(print, printValue, count)
    }
  }

  private getTradePrintThresholds() {
    let thresholds: { [marketKey: string]: number }

    for (const paneId in store.state.panes.panes) {
      const pane = store.state.panes.panes[paneId]

      if (pane.type !== 'trades' && pane.type !== 'trades-lite') {
        continue
      }

      const threshold = (store.state[paneId] as TradesPaneState)
        ?.notifyThreshold

      if (!(threshold > 0) || !pane.markets) {
        continue
      }

      for (const marketKey of pane.markets) {
        if (!thresholds) {
          thresholds = {}
        }

        if (!thresholds[marketKey] || threshold < thresholds[marketKey]) {
          thresholds[marketKey] = threshold
        }
      }
    }

    return thresholds
  }

  private notifyTradePrint(trade: Trade, value: number, count: number) {
    const marketKey = trade.exchange + ':' + trade.pair
    const product = store.state.panes.marketsListeners[marketKey]
    const label = product ? getMarketLabel(product) : trade.pair
    const title = `${label} ${trade.side} $${formatAmount(value)}`
    const body =
      `@ ${formatMarketPrice(trade.price, marketKey)}` +
      (count > 1 ? ` (+${count - 1} more)` : '')

    store.dispatch('app/showNotice', {
      id: 'trade-print',
      update: true,
      type: 'info',
      icon: trade.side === 'buy' ? 'icon-up' : 'icon-down',
      title: `${title} ${body}`,
      timeout: 0
    })

    this.showBrowserNotification(title, body, 'purr-trade-print')
  }
}

export default new AlertService()
