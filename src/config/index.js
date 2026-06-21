// Central config: loads .env and validates the essentials.
import 'dotenv/config';

function bool(v, def = false) {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function int(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export const config = {
  appName: process.env.APP_NAME || 'ParkAddis',
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',

  botToken: process.env.BOT_TOKEN || '',
  botUsername: process.env.BOT_USERNAME || '',

  databaseUrl: process.env.DATABASE_URL || 'postgres://parking:parking@localhost:5432/parking',
  pgSsl: bool(process.env.PGSSL, false) ? { rejectUnauthorized: false } : false,

  search: {
    defaultRadiusM: int(process.env.DEFAULT_SEARCH_RADIUS_M, 2000),
    maxResults: int(process.env.MAX_SEARCH_RESULTS, 8),
  },

  business: {
    defaultCommissionPercent: int(process.env.DEFAULT_COMMISSION_PERCENT, 15),
    currency: process.env.CURRENCY || 'ETB',
  },

  jwtSecret: process.env.JWT_SECRET || 'change-me',
  adminBootstrap: {
    email: process.env.ADMIN_BOOTSTRAP_EMAIL || '',
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD || '',
  },

  chapa: {
    secretKey: process.env.CHAPA_SECRET_KEY || '',
    webhookSecret: process.env.CHAPA_WEBHOOK_SECRET || '',
  },
};

// Soft validation: warn instead of crashing so the bot can boot for DB-only tasks.
export function assertBotConfig() {
  if (!config.botToken || config.botToken.includes('replace-me')) {
    throw new Error('BOT_TOKEN is not set. Copy .env.example to .env and set it from @BotFather.');
  }
}
