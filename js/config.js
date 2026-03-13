export const PROXY_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
export const SPOT_URL  = 'https://api.spot-hinta.fi/TodayAndDayForward';

export const THRESHOLDS = { veryCheap: 3, cheap: 7, medium: 15, expensive: 25 };

export const APPLIANCES = [
  { id: 'airfryer',   name: 'Air Fryer',       icon: '🍳', watts: 1500, minutes: 25,  color: '#f97316' },
  { id: 'kettle',     name: 'Kettle',           icon: '☕', watts: 2000, minutes: 4,   color: '#0ea5e9' },
  { id: 'vacuum',     name: 'Vacuum Cleaner',   icon: '🌀', watts: 1000, minutes: 30,  color: '#8b5cf6' },
  { id: 'tv',         name: 'TV (55")',          icon: '📺', watts: 120,  minutes: 180, color: '#ec4899' },
  { id: 'washer',     name: 'Washing Machine',  icon: '🫧', watts: 2000, minutes: 90,  color: '#14b8a6' },
  { id: 'dishwasher', name: 'Dishwasher',       icon: '🍽️', watts: 1500, minutes: 90,  color: '#84cc16' },
  { id: 'sauna',      name: 'Sauna (Electric)', icon: '🧖', watts: 8000, minutes: 90,  color: '#ef4444' },
  { id: 'microwave',  name: 'Microwave',        icon: '📡', watts: 1000, minutes: 8,   color: '#6366f1' },
];
