import chart from './chart'
import stats from './stats'
import trades from './trades'
import prices from './prices'
import counters from './counters'
import website from './website'
import alerts from './alerts'
import hlMarkets from '@/components/markets/hlMarketsSettings'

export default {
  chart,
  stats,
  trades,
  prices,
  counters,
  website,
  alerts,
  'trades-lite': trades,
  'hl-markets': hlMarkets
}
