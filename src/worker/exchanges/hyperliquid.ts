import { ProductsData, Trade } from '@/types/types'
import Exchange from '../exchange'

export default class HYPERLIQUID extends Exchange {
  id = 'HYPERLIQUID'
  private spotCoins: { [pair: string]: string } = {}
  private spotPairs: { [coin: string]: string } = {}
  private liquidationApi: WebSocket
  private liquidationTimer: ReturnType<typeof setTimeout>
  private liquidationDelay = 1000
  protected endpoints: { [id: string]: any } = {
    PRODUCTS: ['meta', 'spotMeta', 'perpDexs'].map(type => ({
      url: 'https://api.hyperliquid.xyz/info',
      method: 'POST',
      data: JSON.stringify({ type }),
      proxy: false
    }))
  }

  async getUrl() {
    return 'wss://api.hyperliquid.xyz/ws'
  }

  formatProducts([perps, spot, , ...dexProducts]) {
    const products = []
    const spotCoins = {}
    const spotPairs = {}
    const tokens = new Map(spot.tokens.map(token => [token.index, token.name]))

    for (const meta of [perps, ...dexProducts]) {
      for (const product of meta.universe) {
        if (!product.isDelisted) {
          products.push(product.name)
        }
      }
    }

    for (const product of spot.universe) {
      const [base, quote] = product.tokens.map(index => tokens.get(index))
      if (!base || !quote) {
        continue
      }
      const pair = `${base}/${quote}`
      const coin =
        product.name === 'PURR/USDC' ? product.name : `@${product.index}`
      products.push(pair)
      spotCoins[pair] = coin
      spotPairs[coin] = pair
    }

    return { products, spotCoins, spotPairs }
  }

  validateProducts(data) {
    return !!(data.products && data.spotCoins && data.spotPairs)
  }

  setProducts(data: ProductsData) {
    const previousCoins = this.spotCoins
    const result = super.setProducts(data)
    if (result) {
      for (const api of this.apis) {
        if (api.readyState !== WebSocket.OPEN) {
          continue
        }
        for (const pair of api._connected) {
          if (
            previousCoins[pair] &&
            previousCoins[pair] !== this.spotCoins[pair]
          ) {
            api.send(
              JSON.stringify({
                method: 'unsubscribe',
                subscription: { type: 'trades', coin: previousCoins[pair] }
              })
            )
            if (this.spotCoins[pair]) {
              api.send(
                JSON.stringify({
                  method: 'subscribe',
                  subscription: { type: 'trades', coin: this.spotCoins[pair] }
                })
              )
            }
          }
        }
      }
    }
    return result
  }

  /**
   * Sub
   * @param {WebSocket} api
   * @param {string} pair
   */
  async subscribe(api, pair) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        method: 'subscribe',
        subscription: {
          type: 'trades',
          coin: this.spotCoins[pair] || pair
        }
      })
    )

    this.openLiquidationApi()

    return true
  }

  /**
   * Sub
   * @param {WebSocket} api
   * @param {string} pair
   */
  async unsubscribe(api, pair) {
    const connected = await super.unsubscribe(api, pair)
    if (!this.apis.some(api => api._connected.length)) {
      this.closeLiquidationApi()
    }
    if (!connected) {
      return
    }

    api.send(
      JSON.stringify({
        method: 'unsubscribe',
        subscription: {
          type: 'trades',
          coin: this.spotCoins[pair] || pair
        }
      })
    )

    return true
  }

  onOpen(event, pairs) {
    super.onOpen(event, pairs)
    this.startKeepAlive(event.target, { method: 'ping' })
  }

  onClose(event, pairs) {
    this.stopKeepAlive(event.target)
    if (!this.apis.some(api => api.readyState === WebSocket.OPEN)) {
      this.closeLiquidationApi()
    }
    super.onClose(event, pairs)
  }

  openLiquidationApi() {
    const url = import.meta.env.VITE_APP_API_URL
    if (
      !url ||
      this.liquidationApi ||
      this.liquidationTimer ||
      !this.apis.some(
        api => api._connected.length && api.readyState === WebSocket.OPEN
      )
    ) {
      return
    }

    const api = new WebSocket(
      url.replace(/^http/, 'ws').replace(/\/$/, '') + '/liquidations'
    )
    this.liquidationApi = api
    let openedAt = 0
    api.onopen = () => {
      openedAt = Date.now()
    }
    api.onmessage = event => {
      if (event.data === 'ping') {
        return
      }
      let trades
      try {
        trades = JSON.parse(event.data)
      } catch {
        return
      }
      if (!Array.isArray(trades)) {
        return
      }
      this.emitLiquidations(
        'liquidations',
        trades
          .filter(
            trade =>
              trade &&
              this.apis.some(api => api._connected.includes(trade.pair)) &&
              Number.isFinite(trade.timestamp) &&
              trade.timestamp > 0 &&
              Number.isFinite(trade.price) &&
              trade.price > 0 &&
              Number.isFinite(trade.size) &&
              trade.size > 0 &&
              (trade.side === 'buy' || trade.side === 'sell')
          )
          .map(trade => ({
            exchange: this.id,
            pair: trade.pair,
            timestamp: trade.timestamp,
            price: trade.price,
            size: trade.size,
            side: trade.side,
            user: typeof trade.user === 'string' ? trade.user : undefined,
            liquidation: true
          }))
      )
    }
    // The optional relay must not report exchange errors or interrupt trades.
    api.onerror = () => undefined
    api.onclose = () => {
      if (this.liquidationApi !== api) {
        return
      }
      this.liquidationApi = null
      if (openedAt && Date.now() - openedAt > 30000) {
        this.liquidationDelay = 1000
      }
      this.liquidationTimer = setTimeout(() => {
        this.liquidationTimer = null
        this.openLiquidationApi()
      }, this.liquidationDelay)
      this.liquidationDelay = Math.min(this.liquidationDelay * 2, 30000)
    }
  }

  closeLiquidationApi() {
    clearTimeout(this.liquidationTimer)
    this.liquidationTimer = null
    const api = this.liquidationApi
    this.liquidationApi = null
    if (api) {
      api.close()
    }
  }

  onMessage(event, api) {
    const json = JSON.parse(event.data)

    if (json && json.channel === 'trades') {
      return this.emitTrades(
        api._id,
        json.data
          .map(t => this.formatResponse(t))
          .filter(trade => trade.pair && api._connected.includes(trade.pair))
      )
    }
  }

  formatResponse(t): Trade {
    return {
      exchange: this.id,
      pair: this.spotPairs[t.coin] || (t.coin[0] === '@' ? undefined : t.coin),
      timestamp: +new Date(t.time),
      price: +t.px,
      size: +t.sz,
      side: t.side === 'B' ? 'buy' : 'sell',
      // Aggregation retains this first fill's user when subsequent fills merge.
      user: t.users?.[t.side === 'B' ? 0 : 1]
    }
  }
}
