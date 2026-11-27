export function retryDelay(value?: string | null, now = Date.now()) {
  if (!value) return undefined;
  const result = /^\d+$/.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - now;
  return Number.isFinite(result) ? Math.max(0, result) : undefined;
}
