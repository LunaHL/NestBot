import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { DB, gstore, ustore, add, save } from '../store.js';
import { setWordle, setShop, cfg } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = Number(process.env.DASHBOARD_PORT || 3210);
const HOST = process.env.DASHBOARD_HOST || '0.0.0.0';
const TOKEN = process.env.DASHBOARD_TOKEN || '';

app.use(express.json());
app.use((req, res, next) => {
  const auth = req.headers['authorization'] || '';
  if (!TOKEN || auth === `Bearer ${TOKEN}`) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

/* ---- Static admin UI ---- */
app.use('/', express.static(path.join(__dirname, 'public')));

/* ---- API ---- */

// Quick status
app.get('/api/status', (req, res) => {
  res.json({ ok: true, guilds: Object.keys(DB.guilds || {}) });
});

// Wordle
app.get('/api/wordle/:gid', (req, res) => {
  const c = cfg(req.params.gid);
  res.json({ date: c.wordle.date, answerSet: !!c.wordle.answer, bonus: c.wordle.bonus, solvedBy: c.wordle.solvedBy?.length || 0 });
});
app.post('/api/wordle/:gid', (req, res) => {
  const { answer, bonus, date } = req.body || {};
  const w = setWordle(req.params.gid, { answer, bonus, date });
  res.json({ ok: true, wordle: { ...w, answerPreview: w.answer ? w.answer.replace(/./g,'•') : null } });
});

// Shop
app.get('/api/shop/:gid', (req, res) => {
  const c = cfg(req.params.gid);
  res.json({ items: c.shop.items || [] });
});
app.post('/api/shop/:gid', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const out = setShop(req.params.gid, items);
  res.json({ ok: true, items: out });
});

// Users
app.get('/api/user/:gid/:uid', (req, res) => {
  const u = ustore(req.params.gid, req.params.uid);
  res.json({ user: u });
});
app.post('/api/grant/:gid', (req, res) => {
  const { uid, currency, amount } = req.body || {};
  const val = add(req.params.gid, uid, currency, Number(amount || 0));
  res.json({ ok: true, value: val });
});

export function startWebServer() {
  app.listen(PORT, HOST, () => {
    console.log(`Dashboard running at http://${HOST}:${PORT} (auth: Bearer ${TOKEN ? '[set]' : '[disabled]'})`);
  });
}
