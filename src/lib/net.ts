// Every byte the app sends must go through here, so the badge can show the truth.
// Local modes never call it, and the build's Content-Security-Policy blocks any other origin.
let sent = 0; const subs = new Set<() => void>();
export const net = {
  sent: () => sent,
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  count(bytes: number) { sent += bytes; subs.forEach(f => f()); },
  reset() { sent = 0; subs.forEach(f => f()); },
};
