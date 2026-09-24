/**
 * Flappy Crypto API — IP-tracked usernames + leaderboard
 *
 * GET  /api/scores     → top 50
 * GET  /api/scores/me  → {name, ip} for requesting IP ("" = new player)
 * POST /api/scores/me  → {name} → register name to IP (one per IP)
 * POST /api/scores     → {name, score} → submit score
 */
const fs = require('fs');
const dbPath = '/tmp/flappy_db.json';

function load() {
  try { if (fs.existsSync(dbPath)) return JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch {}
  return { users: {}, scores: [] };
}
function save(db) { fs.writeFileSync(dbPath, JSON.stringify(db)); }

function ip(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || '0.0.0.0';
}

function cleanName(s) { return String(s).replace(/[<>&"']/g, '').trim().slice(0, 20); }

function route(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const addr = ip(req);
  const url = req.url || '';

  try {
    // ── GET /api/scores/me ──────────────────────────────
    if (req.method === 'GET' && url.includes('/me')) {
      const db = load();
      return res.status(200).json({ name: db.users[addr] || '', ip: addr });
    }

    // ── POST /api/scores/me (register name) ─────────────
    if (req.method === 'POST' && url.includes('/me')) {
      const { name } = req.body || {};
      const clean = cleanName(name || '');
      if (!clean) return res.status(400).json({ error: 'name required' });
      const db = load();
      if (db.users[addr]) {
        // Already registered — only allow re-registering same name
        if (db.users[addr] !== clean) {
          return res.status(403).json({ error: 'name already set', name: db.users[addr], message: `This IP is already registered as "${db.users[addr]}".` });
        }
        return res.status(200).json({ ok: true, name: clean, existing: true });
      }
      db.users[addr] = clean;
      save(db);
      return res.status(200).json({ ok: true, name: clean, existing: false });
    }

    // ── GET /api/scores (leaderboard) ────────────────────
    if (req.method === 'GET') {
      const db = load();
      const entries = Object.entries(db.users).map(([uip, uname]) => ({
        name: uname,
        score: db.scores.filter(s => s.ip === uip).reduce((max, s) => Math.max(max, s.score), 0)
      })).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 50);
      return res.status(200).json({ scores: entries });
    }

    // ── POST /api/scores (submit score) ──────────────────
    if (req.method === 'POST') {
      const { name, score } = req.body || {};
      if (!name || typeof score !== 'number' || score < 0) return res.status(400).json({ error: 'name + score required' });
      const clean = cleanName(name);
      const db = load();
      if (!db.users[addr] || db.users[addr] !== clean) return res.status(403).json({ error: 'register name first via POST /api/scores/me' });
      db.scores.push({ ip: addr, name: clean, score: Math.floor(score), ts: Date.now() });
      if (db.scores.length > 2000) db.scores = db.scores.slice(-2000);
      save(db);
      const best = db.scores.filter(s => s.ip === addr).reduce((max, s) => Math.max(max, s.score), 0);
      const all = Object.entries(db.users).map(([uip]) =>
        db.scores.filter(s => s.ip === uip).reduce((max, s) => Math.max(max, s.score), 0)
      ).sort((a, b) => b - a);
      const rank = all.findIndex(s => s <= best) + 1;
      return res.status(200).json({ ok: true, rank, best });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// Vercel serverless — export as default function
module.exports = (req, res) => {
  // Vercel may route /api/scores/me to this function with url=/api/scores
  // Check the full path from headers
  const p = req.headers['x-vercel-path'] || req.url || '';
  req.url = p;
  return route(req, res);
};