# Purr

Live trades, liquidations and charts for Hyperliquid, in the browser. Purr is the client for purr.trade.

Source code: https://github.com/matthewrball/purr-trade

## What it does

- Streams live trades from Hyperliquid perps, spot (e.g. `HYPE/USDC`) and HIP-3 markets
- Shows who took large trades: a profile chip with the best known name (HLP, vaults, validators, leaderboard and `.hl` names) and a whale badge, plus a wallet card with account value, positions and 30-day PnL, linked to Hyperdash
- Tags Hyperliquid TWAP fills and known makers (Assistance Fund, HLP, validators)
- HL Markets pane: funding, open interest, premium and open-interest caps across perps, spot and HIP-3
- Price alerts and whale-trade notifications that work while Purr is open in a tab
- Shows liquidations in their own pane when a liquidation feed is configured (`VITE_APP_LIQUIDATIONS_URL`)
- Charts price, volume and custom indicators, with Hyperliquid candle history loaded straight from Hyperliquid
- Can mix in markets from other exchanges (Binance, Bybit, Coinbase, OKX, Bitget and more, see [src/worker/exchanges/](src/worker/exchanges))
- Plays dynamic audio based on trade size

A new workspace opens on the `HYPERLIQUID:HYPE` perp.

## How it works

Purr is a Vue 2 + Vite app. Each exchange connection runs in a Web Worker that listens to the exchange's public WebSocket API, groups trades by time, market and side, and sends the grouped trades to the UI along with market stats (volume, trade counts by side, liquidations).

## Run it locally

Purr is pinned to Node 20.2.0 with [Volta](https://volta.sh) (see `volta` in `package.json`). If you don't have Volta yet, this script installs it:

```bash
./scripts/install-volta.sh
```

Then:

```bash
git clone https://github.com/matthewrball/purr-trade
cd purr-trade
npm install
npm run cors    # CORS proxy on localhost:8070, used for some exchange APIs
npm run serve   # dev server on localhost:8080
```

Production build:

```bash
npm run build       # output in dist/ (prebuild also writes exchange catalogs and public/profiles.json)
npm run serve:dist  # serves dist/ on localhost:8060
```

### Docker

```bash
git clone https://github.com/matthewrball/purr-trade
cd purr-trade
docker-compose -f "docker/docker-compose.yml" up -d --build # prod
```

To use a local purr-trade-server as your data source, load `docker/docker-compose.dev.yml` instead.

## Configuration

The client is configured with `.env` files (Vite). To override a value, create a `.env.local` (or `.env.development` / `.env.production`) file in the root folder.

|key|description|default (`.env`)|
|--|--|--|
|<code>VITE_APP_API_URL</code>|Server instance url, used to fetch chart history for markets outside Hyperliquid.<br>Example: http://localhost:3000/|http://localhost:3000/|
|<code>VITE_APP_PROXY_URL</code>|Redirect HTTP requests from the app through a proxy.<br>If it is set to http://localhost:8070/, the app retrieves Binance's products through http://localhost:8070/https://api.binance.com/api/v3/exchangeInfo|http://localhost:8070/|

## Historical data

Hyperliquid candles are fetched directly from Hyperliquid, so Hyperliquid charts have history without a server.

For other exchanges, run your own [purr-trade-server](https://github.com/matthewrball/purr-trade-server). With a server on port 3000, start the client with `VITE_APP_API_URL=http://localhost:3000/ npm run serve`.

## Disclaimer

If you plan to use real money with this, USE AT YOUR OWN RISK.

## Support this project!

BTC 36ojxqhJLdtR9v1i66fPrz7Y46Skocw9NZ<br>
Hyperliquid 0x33A9CfaFdB96E2145b5b4EB4ba2c96d21ddB6b8B

## License

GPL-3.0, see [LICENSE](LICENSE).

Purr is a modified version of aggr (https://github.com/Tucsky/aggr), licensed under GPL-3.0. Modified 2026-09-21.
