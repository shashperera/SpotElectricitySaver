import { PROXY_URL, SPOT_URL } from './config.js';
import { showNotification, hourOf } from './utils.js';

function getMockPrices() {
  const PATTERN = [
    3.2,  2.8,  2.5,  2.4,  2.6,  3.8,   // 00–05 night
    7.2,  12.4, 14.1, 11.8, 8.2,  7.4,   // 06–11 morning peak
    6.8,  6.2,  7.1,  8.3,  11.2, 16.4,  // 12–17 daytime
    19.8, 18.2, 15.1, 11.2, 8.4,  6.1,   // 18–23 evening peak → drop
  ];

  const prices = [];
  for (let d = 0; d < 2; d++) {
    for (let h = 0; h < 24; h++) {
      const date = new Date();
      date.setDate(date.getDate() + d);
      date.setHours(h, 0, 0, 0);
      const raw = Math.max(0.1, PATTERN[h] + (Math.random() - 0.5) * 1.0);
      prices.push({
        DateTime:     date.toISOString(),
        PriceNoTax:   +(raw / 1.24).toFixed(4),
        PriceWithTax: +raw.toFixed(4),
        Rank:         h + 1,
      });
    }
  }
  return prices;
}

export async function fetchPrices() {
  try {
    const res = await fetch(SPOT_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return data;
    throw new Error('Empty response');
  } catch {
    // Direct fetch failed, try proxy
  }

  try {
    const res = await fetch(`${PROXY_URL}/spot`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return data;
    throw new Error('Empty proxy response');
  } catch {
    // Proxy also failed, fall back to mock data
  }

  showNotification('⚡ Using simulated prices (live API unavailable)');
  return getMockPrices();
}
