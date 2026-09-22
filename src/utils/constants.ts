export const APPLICATION_START_TIME = Date.now()
export const INFRAME = window !== window.top
export const MAX_BARS_PER_CHUNKS = 10000
export const GRID_COLS = 24
export const PRODUCTS_EXPIRES_AFTER = 1000 * 60 * 60 * 24 * 7
// web push alerts need a VAPID key (+ alert server); without one, alerts run locally in the open tab
export const PUSH_ALERTS_ENABLED = !!import.meta.env.VITE_APP_PUBLIC_VAPID_KEY
export const LOCAL_ALERTS = !PUSH_ALERTS_ENABLED
// alerts UI (push or local)
export const ALERTS_ENABLED = true
