/**
 * Nordea Investment Learner – Local Proxy Server
 * ───────────────────────────────────────────────
 * Forwards browser requests to the Nordea Open Banking sandbox API,
 * bypassing CORS restrictions that block direct browser calls.
 *
 * Usage:   node proxy.js
 * Default: http://localhost:3001
 *
 * Endpoints:
 *   GET  /health          → proxy health check (used by the UI status badge)
 *   POST /proxy           → forward a GET request to Nordea API
 *
 * POST /proxy body (JSON):
 *   {
 *     "path":         "/rates-instruments/v1/status",
 *     "clientId":     "<X-IBM-Client-Id>",
 *     "clientSecret": "<X-IBM-Client-Secret>",
 *     "apiKey":       "TEST_USER1"
 *   }
 */

const https = require('https');
const http  = require('http');

const PORT         = 3001;
const NORDEA_HOST  = 'api.nordeaopenbanking.com';

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end',  () => resolve(raw));
    req.on('error', reject);
  });
}

/* ── proxy request ───────────────────────────────────────── */

function forwardToNordea(path, headers) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: NORDEA_HOST,
      path,
      method:  'GET',
      headers: {
        ...headers,
        'Accept':     'application/json',
        'User-Agent': 'nordea-investment-learner-proxy/1.0'
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data',  chunk => (data += chunk));
      res.on('end',   () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timed out after 10 s'));
    });
    req.end();
  });
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
      proxy:     `${NORDEA_HOST}`,
      timestamp: new Date().toISOString()
    });
    return;
  }

  /* proxy call — POST /proxy */
  if (req.method === 'POST' && req.url === '/proxy') {
    let payload;
    try {
      const raw = await readBody(req);
      payload = JSON.parse(raw);
    } catch {
      sendJSON(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    const { path, clientId, clientSecret, apiKey } = payload;

    if (!path || !clientId || !clientSecret || !apiKey) {
      sendJSON(res, 400, {
        error: 'Missing required fields',
        required: ['path', 'clientId', 'clientSecret', 'apiKey']
      });
      return;
    }

    /* only allow known API paths */
    if (!path.startsWith('/rates-instruments/')) {
      sendJSON(res, 400, { error: 'Only /rates-instruments/ paths are allowed' });
      return;
    }

    try {
      const { status, body } = await forwardToNordea(path, {
        'X-IBM-Client-Id':     clientId,
        'X-IBM-Client-Secret': clientSecret,
        'API-KEY':             apiKey
      });

      let pretty;
      try   { pretty = JSON.stringify(JSON.parse(body), null, 2); }
      catch { pretty = body; }

      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(pretty);

      const ts = new Date().toLocaleTimeString();
      console.log(`[${ts}] ${status}  GET  https://${NORDEA_HOST}${path}`);

    } catch (err) {
      console.error('Upstream error:', err.message);
      sendJSON(res, 502, {
        error:  'Upstream request failed',
        detail: err.message
      });
    }
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
  console.log('  🔀  Nordea API Proxy');
  console.log(`  ➜   http://localhost:${PORT}/health`);
  console.log(`  ➜   POST http://localhost:${PORT}/proxy`);
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
