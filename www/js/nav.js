export const go = (hash) => { location.hash = hash; };
export function back(fallback = '#chat') {
  if (history.length > 1) history.back(); else go(fallback);
}
