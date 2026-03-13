import { isToday, isTomorrow, showNotification } from './utils.js';
import { fetchPrices } from './api.js';
import { renderToday, renderTomorrow, renderAppliances, renderSavingsGrid } from './render.js';

const state = {
  allPrices:      [],
  todayPrices:    [],
  tomorrowPrices: [],
  chart:          null,
  tomorrowChart:  null,
};

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  });
}

async function refreshPrices() {
  showNotification('↻ Refreshing prices…');
  const raw = await fetchPrices();

  state.allPrices      = raw;
  state.todayPrices    = raw.filter(p => isToday(p.DateTime));
  state.tomorrowPrices = raw.filter(p => isTomorrow(p.DateTime));

  renderToday(state);
  renderTomorrow(state);
  renderAppliances(state.todayPrices);
  showNotification('✅ Prices updated!');
}

async function init() {
  initTabs();
  renderSavingsGrid();

  const raw = await fetchPrices();
  state.allPrices      = raw;
  state.todayPrices    = raw.filter(p => isToday(p.DateTime));
  state.tomorrowPrices = raw.filter(p => isTomorrow(p.DateTime));

  renderToday(state);
  renderTomorrow(state);
  renderAppliances(state.todayPrices);

  setInterval(refreshPrices, 30 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
window.refreshPrices = refreshPrices;
