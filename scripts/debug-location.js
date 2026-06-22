#!/usr/bin/env node
// Repro harness: feed a synthetic "shared location" update through the REAL bot
// pipeline (middleware + handlers + DB + map render), stubbing only the outgoing
// Telegram API so we can see exactly which calls happen, in what order, and where
// it stalls or throws.
process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:stub-token';
import { close } from '../src/db/index.js';
import { createBot } from '../src/bot/index.js';

const t0 = Date.now();
const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;

const bot = createBot();
// Avoid getMe() network call.
bot.botInfo = { id: 1, is_bot: true, first_name: 'ParkAddis', username: 'ParkAddisBot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };

// Stub every outgoing API call.
bot.api.config.use(async (_prev, method, payload) => {
  let detail = '';
  if (method === 'sendMessage') detail = JSON.stringify(payload.text);
  else if (method === 'sendPhoto') detail = `caption=${JSON.stringify(String(payload.caption).slice(0, 50))}`;
  else if (method === 'sendVenue') detail = `${payload.title} @ ${payload.latitude},${payload.longitude}`;
  else if (method === 'sendLocation') detail = `${payload.latitude},${payload.longitude}`;
  else detail = Object.keys(payload).join(',');
  console.log(`${ts()}  → ${method}  ${detail}`);
  return { ok: true, result: { message_id: 1, date: 0, chat: { id: payload.chat_id, type: 'private' } } };
});

const update = {
  update_id: 1,
  message: {
    message_id: 10,
    date: Math.floor(t0 / 1000),
    chat: { id: 555001, type: 'private' },
    from: { id: 555001, is_bot: false, first_name: 'Debug', last_name: 'User' },
    location: { latitude: 8.995, longitude: 38.799 }, // Bole Medhanialem (seed area)
  },
};

console.log(`${ts()}  feeding message:location (lat=8.995 lng=38.799)`);
try {
  await bot.handleUpdate(update);
  console.log(`${ts()}  handleUpdate resolved`);
} catch (err) {
  console.log(`${ts()}  handleUpdate THREW: ${err.stack}`);
}
await close();
console.log(`${ts()}  done`);
