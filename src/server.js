import express from 'express';
import { config } from './config/index.js';
import { healthcheck } from './db/index.js';
import { logger } from './utils/logger.js';

// Express app. For now: health + readiness. Admin REST API and Mini App static
// hosting are added in later steps.
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

  return app;
}
