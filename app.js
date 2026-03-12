// ═══════════════════════════════════════════════════════════
//  Smart Energy Planner – Kontula, Helsinki
//  Fetches Finnish hourly spot prices from Nord Pool
//  via spot-hinta.fi (free, CORS-enabled, Finnish VAT included)
// ═══════════════════════════════════════════════════════════

// When running locally with proxy.js, set this to 'http://localhost:3001'.
// When deployed to GitHub Pages (or any static host), leave as empty string —
// the app will fetch directly from spot-hinta.fi which supports CORS.
const PROXY_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
const SPOT_URL  = 'https://api.spot-hinta.fi/TodayAndDayForward';

// Price thresholds in c/kWh (spot price incl. 24% Finnish VAT)
const T = { veryCheap: 3, cheap: 7, medium: 15, expensive: 25 };

const state = {
  allPrices:      [],
  todayPrices:    [],
  tomorrowPrices: [],
  chart:          null,
  tomorrowChart:  null
};

// Appliances with typical power (W) and duration (minutes)
const APPLIANCES = [
  { id: 'airfryer',   name: 'Air Fryer',        icon: '🍳', watts: 1500, minutes: 25,  color: '#f97316' },
  { id: 'kettle',     name: 'Kettle',            icon: '☕', watts: 2000, minutes: 4,   color: '#0ea5e9' },
  { id: 'vacuum',     name: 'Vacuum Cleaner',    icon: '🌀', watts: 1000, minutes: 30,  color: '#8b5cf6' },
  { id: 'tv',         name: 'TV (55")',           icon: '📺', watts: 120,  minutes: 180, color: '#ec4899' },
  { id: 'washer',     name: 'Washing Machine',   icon: '🫧', watts: 2000, minutes: 90,  color: '#14b8a6' },
  { id: 'dishwasher', name: 'Dishwasher',        icon: '🍽️', watts: 1500, minutes: 90,  color: '#84cc16' },
  { id: 'sauna',      name: 'Sauna (Electric)',  icon: '🧖', watts: 8000, minutes: 90,  color: '#ef4444' },
  { id: 'microwave',  name: 'Microwave',         icon: '📡', watts: 1000, minutes: 8,   color: '#6366f1' }
];

// ── Utility helpers ──────────────────────────────────────────

function byId(id) { return document.getElementById(id); }

function showNotification(msg) {
  const el = byId('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showNotification._t);
  showNotification._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function fmt2(n)      { return n == null ? '–' : n.toFixed(2); }
function fmtEuro(e)   { return e < 0.005 ? '<0.01 €' : `${e.toFixed(2)} €`; }
function fmtHour(h)   { return `${String(h % 24).padStart(2, '0')}:00`; }
function hourOf(iso)  { return new Date(iso).getHours(); }

function isToday(iso) {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function isTomorrow(iso) {
  const d = new Date(iso), t = new Date();
  t.setDate(t.getDate() + 1);
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

// Price colour & badge helpers
function priceColor(p) {
  if (p < T.veryCheap) return '#22c55e';
  if (p < T.cheap)     return '#84cc16';
  if (p < T.medium)    return '#eab308';
  if (p < T.expensive) return '#f97316';
  return '#ef4444';
}

function priceBadge(p) {
  const map = [
    [T.veryCheap, 'badge-green',  'Very Cheap'],
    [T.cheap,     'badge-lime',   'Cheap'],
    [T.medium,    'badge-yellow', 'Medium'],
    [T.expensive, 'badge-orange', 'Expensive'],
    [Infinity,    'badge-red',    'Very Expensive']
  ];
  const [, cls, label] = map.find(([limit]) => p < limit);
  return `<span class="badge ${cls}">${label}</span>`;
}

function priceClass(p) {
  if (p < T.cheap)  return 'good';
  if (p < T.medium) return 'medium';
  return 'bad';
}

// Cost calculation
function calcCost(watts, minutes, priceC) {
  return (watts * minutes) / 60 / 1000 * priceC / 100; // → euros
}

function bestHour(prices)  { return prices.reduce((b, p) => (!b || p.PriceWithTax < b.PriceWithTax) ? p : b, null); }
function worstHour(prices) { return prices.reduce((w, p) => (!w || p.PriceWithTax > w.PriceWithTax) ? p : w, null); }

function currentHourPrice(prices) {
  const h = new Date().getHours();
  return prices.find(p => hourOf(p.DateTime) === h) || null;
}

// ── Mock data (48h realistic Finnish pattern) ────────────────

function getMockPrices() {
  const PATTERN = [
    3.2, 2.8, 2.5, 2.4, 2.6, 3.8,   // 00-05 night
    7.2, 12.4, 14.1, 11.8, 8.2, 7.4, // 06-11 morning peak
    6.8, 6.2, 7.1, 8.3, 11.2, 16.4,  // 12-17 daytime → evening rise
    19.8, 18.2, 15.1, 11.2, 8.4, 6.1 // 18-23 evening peak → drop
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
        Rank: h + 1
      });
    }
  }
  return prices;
}

// ── Data fetching ────────────────────────────────────────────

async function fetchPrices() {
  // 1. Try direct (spot-hinta.fi has CORS enabled)
  try {
    const res = await fetch(SPOT_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log('✅ Prices from spot-hinta.fi (direct)');
      return data;
    }
    throw new Error('Empty response');
  } catch (e) {
    console.warn('Direct fetch failed:', e.message);
  }

  // 2. Try via local proxy (/spot endpoint)
  try {
    const res = await fetch(`${PROXY_URL}/spot`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log('✅ Prices via proxy');
      return data;
    }
    throw new Error('Empty proxy response');
  } catch (e2) {
    console.warn('Proxy fetch failed:', e2.message);
  }

  // 3. Fallback: mock data
  showNotification('⚡ Using simulated prices (live API unavailable)');
  return getMockPrices();
}

// ── Render: Header ───────────────────────────────────────────

function renderHeader(cur) {
  const el = byId('currentPriceDisplay');
  if (!el) return;
  if (!cur) { el.textContent = '–'; return; }
  const p = cur.PriceWithTax;
  el.textContent = `${fmt2(p)} c`;
  el.style.color = priceColor(p);
}

// ── Render: Hero card ────────────────────────────────────────

function renderHeroCard(cur) {
  const card = byId('heroCard');
  if (!card) return;

  if (!cur) {
    byId('heroTitle').textContent = 'Could not load prices';
    byId('heroSub').textContent   = 'Check your connection or try refreshing.';
    byId('heroPrice').textContent = '–';
    return;
  }

  const p = cur.PriceWithTax;
  const h = hourOf(cur.DateTime);

  let icon, title, sub, cls;

  if (p < T.veryCheap) {
    icon = '🟢'; cls = 'state-cheap';
    title = 'Great time — use whatever you like!';
    sub   = `At ${fmt2(p)} c/kWh this is one of the cheapest hours. Run the washing machine, dishwasher, sauna, or vacuum now!`;
  } else if (p < T.cheap) {
    icon = '🟢'; cls = 'state-cheap';
    title = 'Good time — prices are low';
    sub   = `At ${fmt2(p)} c/kWh, now is a good hour. Air fryer, kettle, and TV are fine. Consider starting the dishwasher too.`;
  } else if (p < T.medium) {
    icon = '🟡'; cls = '';
    title = 'Moderate — light appliances only';
    sub   = `At ${fmt2(p)} c/kWh, avoid heavy appliances like the sauna or washing machine. Use the chart to find cheaper hours.`;
  } else if (p < T.expensive) {
    icon = '🟠'; cls = 'state-expensive';
    title = 'Expensive now — avoid heavy appliances';
    sub   = `At ${fmt2(p)} c/kWh, skip the sauna, washing machine, and dishwasher. Kettle and TV are still manageable.`;
  } else {
    icon = '🔴'; cls = 'state-expensive';
    title = 'Very expensive — essentials only!';
    sub   = `At ${fmt2(p)} c/kWh, this is peak pricing. Only use lights and essentials. Find a cheaper hour on the chart below.`;
  }

  card.className = `hero-card ${cls}`;
  byId('heroIcon').textContent  = icon;
  byId('heroTitle').textContent = title;
  byId('heroSub').textContent   = sub;
  byId('heroPrice').textContent = fmt2(p);
}

// ── Render: KPI row ──────────────────────────────────────────

function renderKpiRow(prices) {
  const cur  = currentHourPrice(prices);
  const best = bestHour(prices);
  const wrst = worstHour(prices);
  const avg  = prices.reduce((s, p) => s + p.PriceWithTax, 0) / (prices.length || 1);

  byId('kpiRow').innerHTML = `
    <div class="kpi-card ${cur ? priceClass(cur.PriceWithTax) : ''}">
      <div class="kpi-label">Current Hour</div>
      <div class="kpi-value">${cur ? fmt2(cur.PriceWithTax) : '–'} <small style="font-size:13px">c</small></div>
      <div class="kpi-sub">${cur ? priceBadge(cur.PriceWithTax) : ''}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Today's Average</div>
      <div class="kpi-value">${fmt2(avg)} <small style="font-size:13px">c</small></div>
      <div class="kpi-sub">c/kWh (incl. VAT)</div>
    </div>
    <div class="kpi-card good">
      <div class="kpi-label">Cheapest Hour</div>
      <div class="kpi-value">${best ? fmt2(best.PriceWithTax) : '–'} <small style="font-size:13px">c</small></div>
      <div class="kpi-sub">${best ? fmtHour(hourOf(best.DateTime)) : ''}</div>
    </div>
    <div class="kpi-card expensive">
      <div class="kpi-label">Most Expensive</div>
      <div class="kpi-value">${wrst ? fmt2(wrst.PriceWithTax) : '–'} <small style="font-size:13px">c</small></div>
      <div class="kpi-sub">${wrst ? fmtHour(hourOf(wrst.DateTime)) : ''}</div>
    </div>`;
}

// ── Render: 24h bar chart ────────────────────────────────────

function drawPriceChart(prices, canvasId, stateKey) {
  if (typeof Chart === 'undefined' || !prices.length) return;
  const canvas = byId(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const nowH = new Date().getHours();

  const labels = prices.map(p => fmtHour(hourOf(p.DateTime)));
  const data   = prices.map(p => p.PriceWithTax);
  const colors = prices.map(p => {
    const c = priceColor(p.PriceWithTax);
    return hourOf(p.DateTime) === nowH ? c : c + 'bb';
  });
  const bWidths = prices.map(p => hourOf(p.DateTime) === nowH ? 2 : 0);
  const bColors = prices.map(p => hourOf(p.DateTime) === nowH ? '#fff' : 'transparent');

  if (state[stateKey]) state[stateKey].destroy();

  state[stateKey] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'c/kWh',
        data,
        backgroundColor: colors,
        borderColor: bColors,
        borderWidth: bWidths,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => `${ctx[0].label} – ${fmtHour(parseInt(ctx[0].label) + 1)}`,
            label: ctx => {
              const p = ctx.raw;
              const tag = p < T.veryCheap ? '🟢 Very Cheap' :
                          p < T.cheap     ? '🟢 Cheap' :
                          p < T.medium    ? '🟡 Medium' :
                          p < T.expensive ? '🟠 Expensive' : '🔴 Very Expensive';
              return ` ${p.toFixed(2)} c/kWh — ${tag}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'c/kWh (incl. 24% VAT)' },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

// ── Render: Best / worst hours lists ────────────────────────

function renderBestWorstHours(prices, bestId, worstId) {
  const sorted = [...prices].sort((a, b) => a.PriceWithTax - b.PriceWithTax);
  const best5  = sorted.slice(0, 5);
  const worst5 = sorted.slice(-5).reverse();

  const makeRow = (p, cls) => {
    const h = hourOf(p.DateTime);
    return `<div class="hour-item ${cls}">
      <span class="hour-time">${fmtHour(h)}</span>
      <span class="hour-price" style="color:${priceColor(p.PriceWithTax)}">${fmt2(p.PriceWithTax)} c</span>
      <span class="hour-desc">${priceBadge(p.PriceWithTax)}</span>
    </div>`;
  };

  const bEl = byId(bestId);
  const wEl = byId(worstId);
  if (bEl) bEl.innerHTML = `<div class="hour-list">${best5.map(p => makeRow(p, 'good')).join('')}</div>`;
  if (wEl) wEl.innerHTML = `<div class="hour-list">${worst5.map(p => makeRow(p, 'bad')).join('')}</div>`;
}

// ── Render: Today tab ────────────────────────────────────────

function renderToday() {
  const prices = state.todayPrices;
  const now    = new Date();

  byId('todayDate').textContent = now.toLocaleDateString('fi-FI', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const cur = currentHourPrice(prices);
  renderHeader(cur);
  renderHeroCard(cur);
  renderKpiRow(prices);
  drawPriceChart(prices, 'priceChart', 'chart');
  renderBestWorstHours(prices, 'bestHours', 'worstHours');

  byId('chartUpdated').textContent = `Updated ${now.toLocaleTimeString('fi-FI')}`;
}

// ── Render: Tomorrow tab ─────────────────────────────────────

function renderTomorrow() {
  const prices = state.tomorrowPrices;
  const container = byId('tomorrowContent');
  if (!container) return;

  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  const dateStr = tom.toLocaleDateString('fi-FI', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  if (!prices || prices.length === 0) {
    const hour = new Date().getHours();
    const hint = hour < 14
      ? `Nord Pool publishes tomorrow's prices around <strong>14:00 Finnish time</strong>. Check back after 14:00!`
      : `Tomorrow's prices are not yet available. Please try refreshing in a few minutes.`;
    container.innerHTML = `
      <div class="card text-center" style="padding:48px 24px">
        <div style="font-size:48px;margin-bottom:14px">🕐</div>
        <div class="card-title">Prices not yet available for ${dateStr}</div>
        <p class="text-muted mt-2" style="font-size:14px">${hint}</p>
        <button class="btn btn-primary mt-2" onclick="refreshPrices()" style="margin-top:16px">↻ Try again</button>
      </div>`;
    return;
  }

  const best = bestHour(prices);
  const wrst = worstHour(prices);
  const avg  = prices.reduce((s, p) => s + p.PriceWithTax, 0) / prices.length;

  container.innerHTML = `
    <div class="kpi-row" style="margin-bottom:16px">
      <div class="kpi-card"><div class="kpi-label">Tomorrow's Average</div><div class="kpi-value">${fmt2(avg)} <small style="font-size:13px">c</small></div><div class="kpi-sub">c/kWh</div></div>
      <div class="kpi-card good"><div class="kpi-label">Cheapest Hour</div><div class="kpi-value">${best ? fmt2(best.PriceWithTax) : '–'} <small style="font-size:13px">c</small></div><div class="kpi-sub">${best ? fmtHour(hourOf(best.DateTime)) : ''}</div></div>
      <div class="kpi-card expensive"><div class="kpi-label">Most Expensive</div><div class="kpi-value">${wrst ? fmt2(wrst.PriceWithTax) : '–'} <small style="font-size:13px">c</small></div><div class="kpi-sub">${wrst ? fmtHour(hourOf(wrst.DateTime)) : ''}</div></div>
    </div>
    <div class="card">
      <div class="card-header">
        <div class="card-title">24-Hour Price Forecast – ${dateStr}</div>
      </div>
      <div class="chart-wrap"><canvas id="tomorrowChart"></canvas></div>
      <div class="price-legend">
        <span class="legend-dot" style="background:#22c55e"></span> Very cheap (&lt;3c)
        <span class="legend-dot ml" style="background:#84cc16"></span> Cheap (3–7c)
        <span class="legend-dot ml" style="background:#eab308"></span> Medium (7–15c)
        <span class="legend-dot ml" style="background:#f97316"></span> Expensive (15–25c)
        <span class="legend-dot ml" style="background:#ef4444"></span> Very expensive (&gt;25c)
      </div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-title mb-2">✅ Best Hours Tomorrow</div><div id="tBest"></div></div>
      <div class="card"><div class="card-title mb-2">❌ Avoid These Hours</div><div id="tWorst"></div></div>
    </div>`;

  setTimeout(() => {
    drawPriceChart(prices, 'tomorrowChart', 'tomorrowChart');
    renderBestWorstHours(prices, 'tBest', 'tWorst');
  }, 30);
}

// ── Render: Appliances tab ───────────────────────────────────

function renderAppliances() {
  const prices = state.todayPrices;
  const grid   = byId('applianceGrid');
  if (!grid) return;

  const cur  = currentHourPrice(prices);
  const best = bestHour(prices);
  const wrst = worstHour(prices);

  grid.innerHTML = APPLIANCES.map(a => {
    const kWh      = (a.watts * a.minutes) / 60 / 1000;
    const costNow  = cur  ? calcCost(a.watts, a.minutes, cur.PriceWithTax)  : null;
    const costBest = best ? calcCost(a.watts, a.minutes, best.PriceWithTax) : null;
    const costWrst = wrst ? calcCost(a.watts, a.minutes, wrst.PriceWithTax) : null;
    const saving   = (costNow != null && costBest != null) ? costNow - costBest : null;

    const nowColor = cur ? priceColor(cur.PriceWithTax) : '#888';

    const savingBanner = saving != null && saving > 0.002
      ? `<div class="saving-banner">💰 Save <strong>${fmtEuro(saving)}</strong> by waiting until ${best ? fmtHour(hourOf(best.DateTime)) : '–'}</div>`
      : saving != null && saving <= 0
      ? `<div class="saving-banner" style="color:#166534">✅ You're already in the best hour!</div>`
      : '';

    return `
    <div class="appliance-card" style="border-top-color:${a.color}">
      <div class="appliance-header">
        <div class="appliance-icon">${a.icon}</div>
        <div>
          <div class="appliance-name">${a.name}</div>
          <div class="appliance-specs">${a.watts} W · ~${a.minutes} min · ${kWh.toFixed(3)} kWh/use</div>
        </div>
      </div>
      <div class="appliance-cost-now">
        <div>
          <div class="appliance-cost-label">Cost if you use it NOW</div>
          <div class="appliance-cost-value" style="color:${nowColor}">${costNow != null ? fmtEuro(costNow) : '–'}</div>
        </div>
        ${cur ? priceBadge(cur.PriceWithTax) : ''}
      </div>
      <div class="appliance-times">
        <div class="time-box best">
          <div class="time-box-label">✅ Best time today</div>
          <div class="time-box-value">${best ? fmtHour(hourOf(best.DateTime)) : '–'}</div>
          <div class="time-box-cost" style="color:#166534">${costBest != null ? fmtEuro(costBest) : ''}</div>
        </div>
        <div class="time-box worst">
          <div class="time-box-label">❌ Most expensive</div>
          <div class="time-box-value">${wrst ? fmtHour(hourOf(wrst.DateTime)) : '–'}</div>
          <div class="time-box-cost" style="color:#991b1b">${costWrst != null ? fmtEuro(costWrst) : ''}</div>
        </div>
      </div>
      ${savingBanner}
    </div>`;
  }).join('');
}

// ── Render: Savings grid (Tips tab) ─────────────────────────

function renderSavingsGrid() {
  const grid = byId('savingsGrid');
  if (!grid) return;
  const CHEAP = 4, EXPENSIVE = 18; // typical c/kWh

  grid.innerHTML = APPLIANCES.map(a => {
    const saving  = calcCost(a.watts, a.minutes, EXPENSIVE) - calcCost(a.watts, a.minutes, CHEAP);
    const monthly = saving * 20; // 20 uses/month

    return `<div class="savings-item">
      <div class="savings-appliance">${a.icon} ${a.name}</div>
      <div class="savings-amount">~${fmtEuro(monthly)}</div>
      <div class="savings-sub">per month (20 uses, cheap vs expensive hours)</div>
    </div>`;
  }).join('');
}

// ── Tab switching ────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      byId(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  });
}

// ── Refresh ──────────────────────────────────────────────────

async function refreshPrices() {
  showNotification('↻ Refreshing prices…');
  const raw = await fetchPrices();
  state.allPrices      = raw;
  state.todayPrices    = raw.filter(p => isToday(p.DateTime));
  state.tomorrowPrices = raw.filter(p => isTomorrow(p.DateTime));
  renderToday();
  renderTomorrow();
  renderAppliances();
  showNotification('✅ Prices updated!');
}

// ── Init ─────────────────────────────────────────────────────

async function init() {
  initTabs();
  renderSavingsGrid();

  const raw = await fetchPrices();
  state.allPrices      = raw;
  state.todayPrices    = raw.filter(p => isToday(p.DateTime));
  state.tomorrowPrices = raw.filter(p => isTomorrow(p.DateTime));

  renderToday();
  renderTomorrow();
  renderAppliances();

  // Auto-refresh every 30 minutes
  setInterval(refreshPrices, 30 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
window.refreshPrices = refreshPrices;
