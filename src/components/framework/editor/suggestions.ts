export default [
  {
    label: 'interpolate',
    detail: '[PURR] get color gradient value',
    insertText: `
colorA = option(type=color,default=yellow)
colorB = option(type=color,default=red)
interpolate(ratio, colorA, colorB)
`
  },
  {
    label: 'avg_ohlc',
    detail: '[PURR] avg OHLC (open = prev. close)',
    insertText: `avg_ohlc(bar)`
  },
  {
    label: 'avg_ohlc_with_gaps',
    detail: '[PURR] avg OHLC',
    insertText: `avg_ohlc_with_gaps(bar)`
  },
  {
    label: 'avg_heikinashi',
    detail: '[PURR] avg HEIKINASHI',
    insertText: `avg_heikinashi(bar)`
  },
  {
    label: 'cum',
    detail: '[PURR] cumulative',
    insertText: `cum(value)`
  },
  {
    label: 'pivot_high',
    detail: '[PURR] find pivot HIGH',
    insertText: `pivot_high(14, 14)`
  },
  {
    label: 'pivot_low',
    detail: '[PURR] find pivot LOW',
    insertText: `pivot_low(14, 14)`
  },
  {
    label: 'highest',
    detail: '[PURR] highest of the last n (ex: 14) bars',
    insertText: `highest(value, 14)`
  },
  {
    label: 'lowest',
    detail: '[PURR] lowest of the last n (ex: 14) bars',
    insertText: `lowest(value, 14)`
  },
  {
    label: 'linreg',
    detail: '[PURR] linreg of the last n (ex: 14) bars',
    insertText: `linreg(value, 14)`
  },
  {
    label: 'sum',
    detail: '[PURR] sum of the last n (ex: 14) bars',
    insertText: `sum(value, 14)`
  },
  {
    label: 'cma',
    detail: '[PURR] bad sma',
    insertText: `cma(value, 14)`
  },
  {
    label: 'sma',
    detail: '[PURR] sma',
    insertText: `sma(value, 14)`
  },
  {
    label: 'ema',
    detail: '[PURR] ema',
    insertText: `ema(value, 14)`
  },
  {
    label: 'last',
    detail: '[PURR] equivalent of n[14] (but dynamic)',
    insertText: `last(value, options.offset)`
  },
  {
    label: 'rma',
    detail: '[PURR] rma',
    insertText: `rma(value, 14)`
  },
  {
    label: 'stoch',
    detail: '[PURR] stoch',
    insertText: `stoch(value, 14)`
  },
  {
    label: 'na',
    detail: '[PURR] 0 if falsy',
    insertText: `na(value)`
  },
  {
    label: 'number',
    detail: '[PURR] number option',
    insertText: `MyNumber = option(
  default=123, // default value
  label="Number value", // text above input
  placeholder="Type something" // text within empty input
)`
  },
  {
    label: 'text',
    detail: '[PURR] text option',
    insertText: `MyText = option(
  type=text,
  label="Text value",
  placeholder="Fill me",
  description="Small description to help understand the option"
)`
  },
  {
    label: 'threshold',
    detail: '[PURR] threshold option',
    insertText: `threshold = option(type=number, min=0, max=10, step=0.1)`
  },
  {
    label: 'range',
    detail: '[PURR] range option',
    insertText: `MyRange = option(
  type=range,
  label="My range",
  min=0,
  max=1
)`
  },
  {
    label: 'rangecolor',
    detail: '[PURR] range w/ gradient color',
    insertText: `MyRangeColor = option(
  type=range,
  label="Big range",
  gradient=["red", "limegreen"], // colorize slider
  min=0,
  max=1000000,
  log=true // slider will ajust displayed value logarithmic scale
)`
  },
  {
    label: 'list',
    detail: '[PURR] list option',
    insertText: `quote = option(
  type=list,
  options=[null, "USD", "USDT", "TUSD", "USDC", "FDUSD"],
  rebuild=true // not specifc to list but will trigger a full indi rebuild when change
)`
  },
  {
    label: 'option',
    detail: '[PURR] simple option',
    insertText: `option(default=14,step=1)`
  },
  {
    label: 'option (range)',
    detail: '[PURR] simple option (range)',
    insertText: `option(default=14,type=range,step=1,min=0,max=200)`
  },
  {
    label: 'listname',
    detail: '[PURR] named list option',
    insertText: `quote = option(
  type=list,
  options={
    "": "Pick something",
    "USD": "United State Dollar",
    "USDT": "Tether",
    "USDC": "Coinbase USD",
    "TUSD": "TrueUSD"
  },
  default=USD,
  rebuild=true
)`
  },
  {
    label: 'color',
    detail: '[PURR] color option',
    insertText: `color = option(type=color,default="red")`
  },
  {
    label: 'color rgba',
    detail: '[PURR] color rgba option',
    insertText: `color = option(type=color,default="rgba(0, 255, 0, 0.5)")`
  },
  {
    label: 'sourced candlestick',
    detail: '[PURR] sourced candlestick',
    insertText: `// let user choose spot, perp or both in indicator's settings
type = option(type=list, options=[null, "spot", "perp"], rebuild=true)

// get list of markets matching given type 
src = source(type=type)

// aggregate ohlc from markets & print into candlestick serie
candlestick(avg_ohlc(src))`
  },
  {
    label: 'multicolor histogram',
    detail: '[PURR] multicolor histogram',
    insertText: `histogram({
  time: time,
  value: vbuy + vsell,
  color: vbuy > vsell ? upColor : downColor
})`
  },
  {
    label: 'plotbrokenarea',
    detail: '[PURR] draw horizontal area',
    insertText: `brokenarea({
  time: time, 
  lowerValue: 10,
  higherValue: 20,
  extendRight: true,
  color: 'yellow'
})`
  },
  {
    label: 'plotline',
    detail: '[PURR] draw simple line',
    insertText: `line($price.close)`
  },
  {
    label: 'plothistogram',
    detail: '[PURR] draw simple columns',
    insertText: `histogram(vbuy + vsell)`
  },
  {
    label: 'plotbaseline',
    detail: '[PURR] draw simple baseline',
    insertText: `baseline($price.close)`
  },
  {
    label: 'plotcloudarea',
    detail: '[PURR] draw simple cloud',
    insertText: `cloudarea($price.low, $price.high)`
  },
  {
    label: 'markers',
    detail: '[PURR] markers example',
    insertText: `// <STARTUP SCRIPT> 
if (!pendingMarkers) {
  // runs only once
  markers = []
  pendingMarkers = []
  lastIndex = null
}
// </STARTUP SCRIPT> 

// <MARKERS.UTILS> 
if (pendingMarkers.length) {
  markers = markers.concat(pendingMarkers)
  if (series[0].setMarkers) {
    series[0].setMarkers(markers)
  }
  pendingMarkers = []
}
// </MARKERS.UTILS>

// process only on new candle
if (bar.length === lastIndex) {
  return
}

line($price.close, color="transparent") // ghost price for markers

// script goes here

// we add a marker as an example :
pendingMarkers.push({
  time: time,
  position: 'belowBar',
  color: 'red',
  text: '🔺',
})

// set reference to bar index : only process first bar of tick
lastIndex = bar.length`
  },
  {
    label: 'rebuild',
    detail:
      '[PURR] force a rebuild when that option change option(..., rebuild=true)',
    insertText: `rebuild=true`
  },
  {
    label: 'cvd',
    detail: '[PURR] cumulative volume delta',
    insertText: `spotColor = option(type=color,default="rgb(102,187,106)")
perpColor = option(type=color,default="rgb(49,121,245)")

line(
  cum(source(vbuy, type=spot) - source(vsell, type=spot)),
  title=SPOT,
  color=spotColor,
  priceScaleId=overlay
)
line(
  cum(source(vbuy, type=perp) - source(vsell, type=perp)), 
  title=PERP,
  color=perpColor
)`
  }
]
