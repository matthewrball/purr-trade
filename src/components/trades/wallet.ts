// ponytail: static map, move to server API if labels need frequent updates
import vaults from '@/assets/hl-vaults.json'

export function walletAddress(
  user: string | undefined,
  amount: number,
  threshold: number
) {
  if (
    !user ||
    !Number.isFinite(amount) ||
    amount < threshold ||
    !/^0x[a-f0-9]{40}$/i.test(user)
  ) {
    return null
  }

  const label = vaults[user.toLowerCase()]
  return {
    address: user,
    text: label
      ? `${label} ${user.slice(0, 6)}…${user.slice(-4)}`
      : `${user.slice(0, 6)}…${user.slice(-4)}`
  }
}

export function walletUrl(address: string) {
  return `https://hyperdash.com/address/${address}`
}

export function openWallet(address: string) {
  window.open(walletUrl(address), '_blank', 'noopener,noreferrer')
}
