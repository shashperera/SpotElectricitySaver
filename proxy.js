
/**
 * Spot Energy Saver – Only as the Local Proxy Server
 * ─────────────────────────────────────
 * Forwards browser requests to spot-hinta.fi API,
 * bypassing CORS restrictions for local development.
 *
 * Usage:   node proxy.js
 * Default: http://localhost:3001
 *
 * Endpoints:
 *   GET  /health   → proxy health check
 *   GET  /spot     → fetches spot prices from spot-hinta.fi
 */

const https = require('https');
const http  = require('http');

const PORT = 3001;

/* ── helpers ─────────────────────────────────────────────── */

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJSON(res, statusCode, obj) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj, null, 2));
}

/* ── HTTP server ─────────────────────────────────────────── */

const server = http.createServer(async (req, res) => {
  setCors(res);

  /* preflight */
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  /* health check — GET /health */
  if (req.method === 'GET' && req.url === '/health') {
    sendJSON(res, 200, {
      status:    'ok',
      proxy:     'api.spot-hinta.fi',
      timestamp: new Date().toISOString()
    });
    return;
  }



  /* spot price passthrough — GET /spot
     Fetches Finnish hourly spot prices from spot-hinta.fi and returns them
     to the browser, bypassing any network/CORS issues. */
  if (req.method === 'GET' && req.url === '/spot') {
    try {
      const result = await new Promise((resolve, reject) => {
        const r = https.request({
          hostname: 'api.spot-hinta.fi',
          path:     '/TodayAndDayForward',
          method:   'GET',
          headers:  { 'Accept': 'application/json', 'User-Agent': 'smart-energy-proxy/1.0' }
        }, resp => {
          let data = '';
          resp.on('data', c => (data += c));
          resp.on('end',  () => resolve({ status: resp.statusCode, body: data }));
        });
        r.on('error', reject);
        r.setTimeout(10000, () => { r.destroy(); reject(new Error('Timeout')); });
        r.end();
      });

      res.statusCode = result.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(result.body);
      console.log(`[${new Date().toLocaleTimeString()}] ${result.status}  GET  api.spot-hinta.fi/TodayAndDayForward`);
    } catch (err) {
      console.error('Spot price fetch error:', err.message);
      sendJSON(res, 502, { error: 'Spot price fetch failed', detail: err.message });
    }
    return;
  }

  /* catch-all */
  sendJSON(res, 404, { error: 'Not found. Use POST /proxy, GET /spot, or GET /health.' });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ⚡ Spot Energy Saver Proxy');
  console.log(`  ➜   http://localhost:${PORT}/health`);
  console.log(`  ➜   GET  http://localhost:${PORT}/spot`);
  console.log('');
  console.log('  Waiting for requests…');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗  Port ${PORT} is already in use. Stop the existing process first.\n`);
  } else {
    console.error('\n  ✗  Server error:', err.message, '\n');
  }
  process.exit(1);
});
