export function byId(id) {
  return document.getElementById(id);
}

export function showNotification(msg) {
  const el = byId('notification');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showNotification._t);
  showNotification._t = setTimeout(() => el.classList.remove('show'), 2600);
}

export function fmt2(n)     { return n == null ? '–' : n.toFixed(2); }
export function fmtEuro(e)  { return e < 0.005 ? '<0.01 €' : `${e.toFixed(2)} €`; }
export function fmtHour(h)  { return `${String(h % 24).padStart(2, '0')}:00`; }
export function hourOf(iso) { return new Date(iso).getHours(); }

export function isToday(iso) {
  const d = new Date(iso), n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth()    === n.getMonth()    &&
    d.getDate()     === n.getDate()
  );
}

export function isTomorrow(iso) {
  const d = new Date(iso), t = new Date();
  t.setDate(t.getDate() + 1);
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth()    === t.getMonth()    &&
    d.getDate()     === t.getDate()
  );
}
