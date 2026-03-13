import { APPLIANCES, THRESHOLDS } from './config.js';
import { byId, fmt2, fmtEuro, fmtHour, hourOf } from './utils.js';
import {
  priceColor, priceBadge, priceClass,
  calcCost, bestHour, worstHour,
  currentHourPrice, uniqueByHour,
} from './processing.js';

const T = THRESHOLDS;

export function renderHeader(cur) {
  const el = byId('currentPriceDisplay');
  if (!el) return;
  if (!cur) { el.textContent = '–'; return; }
  el.textContent = `${fmt2(cur.PriceWithTax)} c`;
  el.style.color = priceColor(cur.PriceWithTax);
}

export function renderHeroCard(cur) {
  const card = byId('heroCard');
  if (!card) return;

  if (!cur) {
    byId('heroTitle').textContent = 'Could not load prices';
    byId('heroSub').textContent   = 'Check your connection or try refreshing.';
    byId('heroPrice').textContent = '–';
    return;
  }

  const p = cur.PriceWithTax;
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

  card.className                = `hero-card ${cls}`;
  byId('heroIcon').textContent  = icon;
  byId('heroTitle').textContent = title;
  byId('heroSub').textContent   = sub;
  byId('heroPrice').textContent = fmt2(p);
}

export function renderKpiRow(prices) {
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

export function drawPriceChart(prices, canvasId, state, stateKey) {
  if (typeof Chart === 'undefined' || !prices.length) return;
  const canvas = byId(canvasId);
  if (!canvas) return;

  const ctx  = canvas.getContext('2d');
  const nowH = new Date().getHours();

  const labels  = prices.map(p => fmtHour(hourOf(p.DateTime)));
  const data    = prices.map(p => p.PriceWithTax);
  const colors  = prices.map(p => {
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
        borderColor:     bColors,
        borderWidth:     bWidths,
        borderRadius:    4,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend:  { display: false },
        tooltip: {
          callbacks: {
            title: ctx => `${ctx[0].label} – ${fmtHour(parseInt(ctx[0].label) + 1)}`,
            label: ctx => {
              const p   = ctx.raw;
              const tag = p < T.veryCheap ? '🟢 Very Cheap'   :
                          p < T.cheap     ? '🟢 Cheap'         :
                          p < T.medium    ? '🟡 Medium'        :
                          p < T.expensive ? '🟠 Expensive'     : '🔴 Very Expensive';
              return ` ${p.toFixed(2)} c/kWh — ${tag}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'c/kWh (incl. 24% VAT)' },
          grid:  { color: 'rgba(0,0,0,0.05)' },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

export function renderBestWorstHours(prices, bestId, worstId) {
  const sorted = [...prices].sort((a, b) => a.PriceWithTax - b.PriceWithTax);
  const best5  = uniqueByHour(sorted.slice(0, 5));
  const worst5 = uniqueByHour(sorted.slice(-5).reverse());

  const makeRow = (p, cls) => {
    const h = hourOf(p.DateTime);
    return `
      <div class="hour-item ${cls}">
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

export function renderAppliances(prices) {
  const grid = byId('applianceGrid');
  if (!grid) return;

  const cur  = currentHourPrice(prices);
  const best = bestHour(prices);
  const wrst = worstHour(prices);

  grid.innerHTML = APPLIANCES.map(a => {
    const kWh      = (a.watts * a.minutes) / 60 / 1000;
    const costNow  = cur  ? calcCost(a.watts, a.minutes, cur.PriceWithTax)  : null;
    const costBest = best ? calcCost(a.watts, a.minutes, best.PriceWithTax) : null;
    const costWrst = wrst ? calcCost(a.watts, a.minutes, wrst.PriceWithTax) : null;
    const saving   = costNow != null && costBest != null ? costNow - costBest : null;
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

export function renderSavingsGrid() {
  const grid = byId('savingsGrid');
  if (!grid) return;

  const CHEAP     = 4;
  const EXPENSIVE = 18;

  grid.innerHTML = APPLIANCES.map(a => {
    const saving  = calcCost(a.watts, a.minutes, EXPENSIVE) - calcCost(a.watts, a.minutes, CHEAP);
    const monthly = saving * 20;
    return `
      <div class="savings-item">
        <div class="savings-appliance">${a.icon} ${a.name}</div>
        <div class="savings-amount">~${fmtEuro(monthly)}</div>
        <div class="savings-sub">per month (20 uses, cheap vs expensive hours)</div>
      </div>`;
  }).join('');
}

export function renderToday(state) {
  const prices = state.todayPrices;
  const now    = new Date();

  byId('todayDate').textContent = now.toLocaleDateString('fi-FI', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const cur = currentHourPrice(prices);
  renderHeader(cur);
  renderHeroCard(cur);
  renderKpiRow(prices);
  drawPriceChart(prices, 'priceChart', state, 'chart');
  renderBestWorstHours(prices, 'bestHours', 'worstHours');
  byId('chartUpdated').textContent = `Updated ${now.toLocaleTimeString('fi-FI')}`;
}

export function renderTomorrow(state) {
  const prices    = state.tomorrowPrices;
  const container = byId('tomorrowContent');
  if (!container) return;

  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  const dateStr = tom.toLocaleDateString('fi-FI', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
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
      <div class="kpi-card">
        <div class="kpi-label">Tomorrow's Average</div>
        <div class="kpi-value">${fmt2(avg)} <small style="font-size:13px">c</small></div>
        <div class="kpi-sub">c/kWh</div>
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
      </div>
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
    drawPriceChart(prices, 'tomorrowChart', state, 'tomorrowChart');
    renderBestWorstHours(prices, 'tBest', 'tWorst');
  }, 30);
}
