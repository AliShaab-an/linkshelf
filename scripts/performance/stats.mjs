export function statistics(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const n = sorted.length;
  if (!n) return null;
  return { n, medianMs: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    p95Ms: sorted[Math.ceil(n * .95) - 1], minMs: sorted[0], maxMs: sorted[n - 1] };
}
export function eventSummary(events) {
  const groups = {};
  for (const event of events) {
    const item = groups[event.label] ??= { calls: 0, ms: 0 };
    item.calls++; item.ms += event.ms;
  }
  return groups;
}
