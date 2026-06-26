/**
 * Central config: loads .env and validates all required env vars at startup
 * using Zod. Fail-fast on missing/invalid configuration.
 *
 * All runtime config lives here — never access `process.env` directly elsewhere.
 *
 * @module config
 *
 * @property {string} config.appName - Application name (default: "ParkAddis")
 * @property {string} config.env - Node environment (development|production|test)
 * @property {number} config.port - HTTP server port
 * @property {string} config.publicUrl - Public-facing URL
 * @property {string} config.botToken - Telegram bot token (empty for DB-only tasks)
 * @property {string} config.botUsername - Telegram bot username
 * @property {string} config.databaseUrl - PostgreSQL connection string
 * @property {object|boolean} config.pgSsl - SSL config or false
 * @property {object} config.search - Search settings (radius, max results)
 * @property {object} config.business - Business settings (commission, currency)
 * @property {string} config.jwtSecret - JWT signing secret (min 8 chars)
 * @property {string} config.jwtExpiry - JWT expiry duration
 * @property {object} config.adminBootstrap - First admin credentials
 * @property {object} config.chapa - Chapa payment gateway settings
 * @property {object} config.notifications - Notification scheduler settings
 * @property {object} config.telegram - Telegram mode & webhook URL
 * @property {object} config.security - CORS & rate limiting
 * @property {object} config.logging - Log level & format
 */

import 'dotenv/config';
import { z } from 'zod';

// ── Zod schema for the full config ────────────────────────────────────────

const envSchema = z.object({
  // App
  APP_NAME: z.string().default('ParkAddis'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: z.string().default('http://localhost:3000'),

  // Bot (required for bot functionality; assertBotConfig() enforces this at boot)
  BOT_TOKEN: z.string().default(''),
  BOT_USERNAME: z.string().default(''),

  // Database
  DATABASE_URL: z.string().default('postgres://parking:parking@localhost:5432/parking'),
  PGSSL: z
    .string()
    .transform((v) => ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()))
    .default('false'),

  // Search
  DEFAULT_SEARCH_RADIUS_M: z.coerce.number().int().positive().default(15000),
  MAX_SEARCH_RESULTS: z.coerce.number().int().positive().default(20),

  // Business
  DEFAULT_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(15),
  CURRENCY: z.string().default('ETB'),

  // Auth
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
  JWT_EXPIRY: z.string().default('24h'),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional().default(''),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional().default(''),

  // Chapa (payment gateway)
  CHAPA_SECRET_KEY: z.string().default(''),
  CHAPA_WEBHOOK_SECRET: z.string().default(''),

  // Notifications
  ENABLE_NOTIFICATIONS: z
    .string()
    .transform((v) => ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()))
    .default('true'),
  NOTIFICATION_CHECK_INTERVAL: z.coerce.number().int().positive().default(5),

  // Telegram
  TELEGRAM_MODE: z.enum(['polling', 'webhook']).default('polling'),
  TELEGRAM_WEBHOOK_URL: z.string().default(''),
  TELEGRAM_WEBHOOK_PATH: z.string().default('/webhook/telegram'),

  // Security
  CORS_ORIGINS: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('pretty'),
});

// ── Parse & validate ──────────────────────────────────────────────────────

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error('❌ Invalid environment configuration:\n' + issues);
  console.error('\nCopy .env.example to .env and fill in the required values.');
  process.exit(1);
}

const env = parsed.data;

// ── Build config object ───────────────────────────────────────────────────

export const config = {
  appName: env.APP_NAME,
  env: env.NODE_ENV,
  port: env.PORT,
  publicUrl: env.PUBLIC_URL,

  botToken: env.BOT_TOKEN,
  botUsername: env.BOT_USERNAME,

  databaseUrl: env.DATABASE_URL,
  pgSsl: env.PGSSL ? { rejectUnauthorized: false } : false,

  search: {
    defaultRadiusM: env.DEFAULT_SEARCH_RADIUS_M,
    maxResults: env.MAX_SEARCH_RESULTS,
  },

  business: {
    defaultCommissionPercent: env.DEFAULT_COMMISSION_PERCENT,
    currency: env.CURRENCY,
  },

  jwtSecret: env.JWT_SECRET,
  jwtExpiry: env.JWT_EXPIRY,
  adminBootstrap: {
    email: env.ADMIN_BOOTSTRAP_EMAIL,
    password: env.ADMIN_BOOTSTRAP_PASSWORD,
  },

  chapa: {
    secretKey: env.CHAPA_SECRET_KEY,
    webhookSecret: env.CHAPA_WEBHOOK_SECRET,
  },

  notifications: {
    enabled: env.ENABLE_NOTIFICATIONS,
    checkIntervalMinutes: env.NOTIFICATION_CHECK_INTERVAL,
  },

  telegram: {
    mode: env.TELEGRAM_MODE,
    webhookUrl: env.TELEGRAM_WEBHOOK_URL,
    webhookPath: env.TELEGRAM_WEBHOOK_PATH,
  },

  security: {
    corsOrigins: env.CORS_ORIGINS,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },

  logging: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
  },
};

/**
 * Validate bot-specific config at startup (called by bot/index.js).
 * Separated so the server can boot for DB-only tasks without a bot token.
 */
export function assertBotConfig() {
  if (!config.botToken) {
    throw new Error(
      'BOT_TOKEN is not set. Copy .env.example to .env and set it from @BotFather.'
    );
  }
}
