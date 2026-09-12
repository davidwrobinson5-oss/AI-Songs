export function billingTiming(start: number, end: number, now: number) {
  if (![start, end, now].every(Number.isFinite) || start <= 0 || end <= start || now < start) return null;
  const day = 86400;
  return {
    daysElapsed: Math.max(1, Math.ceil((Math.min(now, end) - start) / day)),
    daysRemaining: Math.max(0, Math.ceil((end - now) / day)),
    resetAt: new Date(end * 1000).toISOString(),
  };
}
