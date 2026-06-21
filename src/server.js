import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config/index.js';
import { healthcheck } from './db/index.js';
import * as spotsRepo from './db/repositories/spots.js';
import { logger } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const miniappDir = join(__dirname, 'miniapp');

// Express app: health/readiness, the Mini App (static), and a read-only spots API
// the Mini App map calls. Admin REST + payments are added in later steps.
export function createServer() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ ok: true, app: config.appName, env: config.env });
  });

  app.get('/ready', async (req, res) => {
    try {
      const dbOk = await healthcheck();
      res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk });
    } catch (err) {
      logger.error('readiness check failed', { error: err.message });
      res.status(503).json({ ok: false, db: false });
    }
  });

  // Read-only nearby spots for the Mini App map. Public (parking data is public);
  // same-origin as the static app, so no CORS/auth needed in this phase.
  app.get('/api/spots/nearby', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusM = Number(req.query.radius) || config.search.defaultRadiusM;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng are required numbers' });
    }
    try {
      let spots = await spotsRepo.findNearby({ lat, lng, radiusM, limit: config.search.maxResults });
      let fallback = false;
      if (!spots.length) {
        spots = await spotsRepo.findNearestAny({ lat, lng, limit: config.search.maxResults });
        fallback = true;
      }
      res.json({
        fallback,
        spots: spots.map((s) => ({
          id: Number(s.id),
          address: s.address,
          price_per_hour: Number(s.price_per_hour),
          lat: Number(s.lat),
          lng: Number(s.lng),
          distance_m: s.distance_m != null ? Math.round(Number(s.distance_m)) : null,
          rating_avg: Number(s.rating_avg),
          rating_count: Number(s.rating_count),
          covered: s.covered,
          guarded: s.guarded,
          ev_charging: s.ev_charging,
        })),
      });
    } catch (err) {
      logger.error('api nearby failed', { error: err.message });
      res.status(500).json({ error: 'server error' });
    }
  });

  // Telegram Mini App (map). Served at /miniapp/.
  app.use('/miniapp', express.static(miniappDir));

  return app;
}
