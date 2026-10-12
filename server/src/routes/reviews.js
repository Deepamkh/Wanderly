// Community reviews stored in a local JSON file (zero-cost; swap for SQLite/Postgres when you scale).
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const router = Router();
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/reviews.json');

let db = {};
try {
  db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  db = {};
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(db, null, 2));
    fs.renameSync(`${FILE}.tmp`, FILE);
  }, 200);
}

// naive per-IP rate limit for writes
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 10;
}

const keyOk = (k) => /^[a-z0-9-]{2,120}$/.test(k);
const clean = (s, max) => String(s || '').replace(/[<>]/g, '').trim().slice(0, max);

function payload(key) {
  const list = db[key] || [];
  const sorted = [...list].sort((a, b) => b.helpful - a.helpful || b.rating - a.rating || b.createdAt.localeCompare(a.createdAt));
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : null;
  return { key, count: list.length, average: avg && Math.round(avg * 10) / 10, reviews: sorted };
}

router.get('/:key', (req, res) => {
  if (!keyOk(req.params.key)) return res.status(400).json({ error: 'Bad key' });
  res.json(payload(req.params.key));
});

router.post('/:key', (req, res) => {
  const { key } = req.params;
  if (!keyOk(key)) return res.status(400).json({ error: 'Bad key' });
  if (limited(req.ip)) return res.status(429).json({ error: 'Too many reviews – try again in a minute.' });
  const rating = Math.round(Number(req.body.rating));
  const text = clean(req.body.text, 1500);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Rating must be 1–5.' });
  if (text.length < 10) return res.status(400).json({ error: 'Please write at least 10 characters.' });
  const review = {
    id: crypto.randomUUID(),
    author: clean(req.body.author, 40) || 'Anonymous traveller',
    title: clean(req.body.title, 80),
    text,
    rating,
    visited: clean(req.body.visited, 7) || null, // YYYY-MM
    helpful: 0,
    createdAt: new Date().toISOString(),
  };
  (db[key] ||= []).push(review);
  save();
  res.status(201).json(payload(key));
});

router.post('/:key/:id/helpful', (req, res) => {
  const r = (db[req.params.key] || []).find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (limited(req.ip)) return res.status(429).json({ error: 'Slow down a little.' });
  r.helpful += 1;
  save();
  res.json(payload(req.params.key));
});

export default router;
