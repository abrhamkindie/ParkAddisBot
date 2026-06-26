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

  // Payment success page — Chapa redirects here after successful payment
  router.get('/payment/success', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Successful - ParkAddis</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 48px 40px;
            max-width: 420px;
            width: 100%;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          }
          .checkmark {
            width: 72px;
            height: 72px;
            background: linear-gradient(135deg, #22c55e, #16a34a);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 36px;
            color: white;
            box-shadow: 0 8px 24px rgba(34, 197, 94, 0.3);
          }
          h1 {
            color: #f1f5f9;
            font-size: 24px;
            margin-bottom: 8px;
          }
          p {
            color: #94a3b8;
            font-size: 15px;
            line-height: 1.6;
            margin-bottom: 28px;
          }
          .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            color: white;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 10px;
            font-size: 15px;
            font-weight: 600;
            transition: all 0.2s;
            box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
          }
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
          }
          .telegram-icon { width: 20px; height: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="checkmark">✓</div>
          <h1>Payment Successful!</h1>
          <p>
            Your payment has been processed successfully.<br>
            Go back to Telegram to see your booking receipt<br>
            and QR code for check-in.
          </p>
          <a class="btn" href="https://t.me/${config.botUsername}">
            <svg class="telegram-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            Open Telegram
          </a>
        </div>
      </body>
      </html>
    `);
  });

  // Chapa payment webhook — POST (server-to-server event notification)
  // Also handle GET (browser redirect callback with query params)
  router.get('/api/payments/chapa/webhook', async (req, res) => {
    try {
      logger.info('Chapa webhook GET received', { query: req.query });

      // Chapa redirects the browser here after payment with query params:
      //   trx_ref / tx_ref / ref_id — the transaction reference
      //   status — 'success' or 'failed'
      const txRef = req.query.trx_ref || req.query.tx_ref;
      const status = req.query.status;

      if (txRef && status === 'success') {
        // Confirm payment silently (don't block the redirect on errors)
        confirmChapaPayment(txRef).catch((err) => {
          logger.error('Chapa GET webhook confirm failed', { error: err.message, txRef });
        });
      }

      // Redirect user back to the Telegram bot regardless
      return res.redirect(`https://t.me/${config.botUsername}`);
    } catch (err) {
      logger.error('Chapa webhook GET error', { error: err.message });
      return res.redirect(`https://t.me/${config.botUsername}`);
    }
  });

  // Chapa payment webhook — POST (server-to-server event notification)
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
