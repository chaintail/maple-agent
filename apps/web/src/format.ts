export function formatUnits(baseUnits?: string | bigint): string {
  if (!baseUnits) return '0.00';
  const value = typeof baseUnits === 'bigint' ? baseUnits : BigInt(baseUnits);
  const divisor = 1_000_000n;
  const whole = value / divisor;
  const fraction = value % divisor;
  const cents = (fraction / 10_000n).toString().padStart(2, '0');
  return `${whole}.${cents}`;
}

export function shortAddress(value?: string): string {
  if (!value) return '—';
  if (value.length < 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-5)}`;
}

export function formatTime(value?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

export function timeLeft(expiresAt?: string): string {
  if (!expiresAt) return '—';
  const diff = Date.parse(expiresAt) - Date.now();
  if (diff <= 0) return 'expired';
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
