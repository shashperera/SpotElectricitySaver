import { THRESHOLDS } from './config.js';
import { hourOf } from './utils.js';

const T = THRESHOLDS;

export function priceColor(p) {
  if (p < T.veryCheap) return '#22c55e';
  if (p < T.cheap)     return '#84cc16';
  if (p < T.medium)    return '#eab308';
  if (p < T.expensive) return '#f97316';
  return '#ef4444';
}

export function priceBadge(p) {
  const map = [
    [T.veryCheap, 'badge-green',  'Very Cheap'],
    [T.cheap,     'badge-lime',   'Cheap'],
    [T.medium,    'badge-yellow', 'Medium'],
    [T.expensive, 'badge-orange', 'Expensive'],
    [Infinity,    'badge-red',    'Very Expensive'],
  ];
  const [, cls, label] = map.find(([limit]) => p < limit);
  return `<span class="badge ${cls}">${label}</span>`;
}

export function priceClass(p) {
  if (p < T.cheap)  return 'good';
  if (p < T.medium) return 'medium';
  return 'bad';
}

export function calcCost(watts, minutes, priceC) {
  return (watts * minutes) / 60 / 1000 * priceC / 100;
}

export function bestHour(prices) {
  return prices.reduce((b, p) => (!b || p.PriceWithTax < b.PriceWithTax) ? p : b, null);
}

export function worstHour(prices) {
  return prices.reduce((w, p) => (!w || p.PriceWithTax > w.PriceWithTax) ? p : w, null);
}

export function currentHourPrice(prices) {
  const h = new Date().getHours();
  return prices.find(p => hourOf(p.DateTime) === h) || null;
}

export function uniqueByHour(arr) {
  const seen = new Set();
  return arr.filter(item => {
    const hour = hourOf(item.DateTime);
    if (seen.has(hour)) return false;
    seen.add(hour);
    return true;
  });
}
