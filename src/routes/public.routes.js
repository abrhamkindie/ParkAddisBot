/**
 * Public routes — no authentication required.
 *
 * Mounts:
 *   GET  /health          - Health check (lightweight)
 *   GET  /ready           - Readiness check (tests DB connectivity)
 *   GET  /api/spots/nearby - Nearby parking spots (lat/lng query)
 *   GET  /miniapp/*       - Mini App static files (Leaflet map UI)
 *   POST /api/payments/chapa/webhook - Chapa payment callback
 *
 * @module routes/public
 */
import express, { Router } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../config/index.js';
import { healthcheck } from '../db/index.js';
import * as spotsRepo from '../db/repositories/spots.js';
import { handleWebhook } from '../services/chapaService.js';
import { confirmChapaPayment, sendPaymentReceipt } from '../services/paymentService.js';
import { success } from '../utils/apiResponse.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { validate } from '../middlewares/validate.js';
import { logger } from '../utils/logger.js';
import * as schemas from '../utils/schemas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const miniappDir = join(__dirname, '../miniapp');

/**
 * Creates the public router.
 * @param {import('grammy').Bot} [bot] - Bot instance for sending payment receipts via Telegram
 * @returns {import('express').Router}
 */
export function createPublicRouter(bot) {
  const router = Router();

  // Health check
  router.get('/health', (req, res) => {
    res.json({ ok: true, app: config.appName, env: config.env });
  });

  // Readiness check (DB health)
  router.get('/ready', async (req, res) => {
    try {
      const dbOk = await healthcheck();
      res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk });
    } catch (err) {
      logger.error('readiness check failed', { error: err.message });
      res.status(503).json({ ok: false, db: false });
    }
  });

  // Nearby spots for the Mini App map
  router.get('/api/spots/nearby',
    validate({ query: schemas.nearbySpots }),
    asyncHandler(async (req, res) => {
    const { lat, lng, radius: radiusM } = req.query;
    const effectiveRadius = radiusM || config.search.defaultRadiusM;
    let spots = await spotsRepo.findNearby({ lat, lng, radiusM: effectiveRadius, limit: config.search.maxResults });
    let fallback = false;
    if (!spots.length) {
      spots = await spotsRepo.findNearestAny({ lat, lng, limit: config.search.maxResults });
      fallback = true;
    }
    success(res, {
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
  }));

  // Mini App static files
  router.use('/miniapp', express.static(miniappDir));

  // Chapa payment webhook
  router.post('/api/payments/chapa/webhook', async (req, res) => {
    try {
      logger.info('Chapa webhook received', { body: req.body });

      const webhookEvent = handleWebhook(req.body, config.chapa.webhookSecret);

      if (webhookEvent.event === 'charge.success') {
        try {
          const { booking, payment } = await confirmChapaPayment(webhookEvent.tx_ref);

          if (bot && booking.driver_telegram_id) {
            const ctx = {
              reply: async (text, extra) => {
                await bot.api.sendMessage(Number(booking.driver_telegram_id), text, extra);
              },
              replyWithPhoto: async (photo, extra) => {
                await bot.api.sendPhoto(Number(booking.driver_telegram_id), photo, extra);
              },
              dbUser: {
                language_pref: booking.driver_language_pref || 'en',
              },
            };
            await sendPaymentReceipt(ctx, booking, payment);
          }

          logger.info('Chapa payment confirmed and receipt sent', {
            bookingId: booking.id,
            confirmationCode: booking.confirmation_code,
          });
        } catch (err) {
          logger.error('Failed to confirm Chapa payment', {
            error: err.message,
            txRef: webhookEvent.tx_ref,
          });
        }
      }

      success(res, { processed: true });
    } catch (err) {
      logger.error('Chapa webhook error', { error: err.message });
      success(res, { processed: false });
    }
  });

  return router;
}
