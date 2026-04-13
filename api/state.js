// api/state.js — Böötle shared state via Upstash Redis
// GET  /api/state              → returns the full shared state object
// POST /api/state {key, value} → merges {key:value} into shared state, returns {ok:true}
//
// Single Redis key 'boetle:state' holds the entire app state as one JSON blob.
// Simple, atomic per request, one round-trip per read.

import { Redis } from '@upstash/redis';

// Upstash for Vercel injects KV_REST_API_URL / KV_REST_API_TOKEN (legacy names from Vercel KV).
// We pass them explicitly instead of using Redis.fromEnv() which expects UPSTASH_REDIS_*.
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const STATE_KEY = 'boetle:state';

export default async function handler(req, res) {
  // CORS headers — same-origin in production but harmless and useful for local testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const state = await redis.get(STATE_KEY);
      // Upstash auto-deserializes JSON; null on first run
      return res.status(200).json(state || {});
    }

    if (req.method === 'POST') {
      // Vercel may pass body as already-parsed object or as raw string
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { key, value } = body || {};

      if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: 'missing or invalid key' });
      }

      const current = (await redis.get(STATE_KEY)) || {};
      const merged = { ...current, [key]: value };
      await redis.set(STATE_KEY, merged);

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('[api/state] error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
