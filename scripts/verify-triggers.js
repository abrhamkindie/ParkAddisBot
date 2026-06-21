#!/usr/bin/env node
// Regression test for the reply-keyboard menu buttons.
//
// Bug: handlers were registered with `bot.hears((ctx) => ...)` — a function
// predicate. grammY's hears() only accepts string | RegExp | array; a function
// is coerced to `new RegExp(fn.toString())` and never matches a button label,
// so every menu tap was silently dropped ("the bot doesn't respond").
//
// This test exercises grammY's real matcher (Context.has.text, the same code
// path hears() uses) to prove menu labels route correctly in every language.
import { Context } from 'grammy';
import { allTranslations, translate, SUPPORTED_LANGS } from '../src/i18n/index.js';

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
  console.log('  ✓ ' + msg);
}

const me = { id: 1, is_bot: true, first_name: 'Test', username: 'test_bot' };
const api = {}; // has.text never touches the API

function ctxWithText(text) {
  const update = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: 1, is_bot: false, first_name: 'A' },
      text,
    },
  };
  return new Context(update, api, me);
}

const MENU_KEYS = [
  'menu.find_parking',
  'menu.my_bookings',
  'menu.become_host',
  'menu.language',
  'menu.help',
  'common.cancel',
];

console.log('\n[1] Each menu key matches its button label in every language:');
for (const key of MENU_KEYS) {
  const predicate = Context.has.text(allTranslations(key));
  for (const lang of SUPPORTED_LANGS) {
    const label = translate(key, lang);
    assert(predicate(ctxWithText(label)) === true, `${key} matches "${label}" (${lang})`);
  }
}

console.log('\n[2] The old function-predicate approach does NOT match (the bug):');
const label = translate('menu.find_parking', 'en');
const broken = Context.has.text((ctx) => ctx.msg?.text === label);
assert(broken(ctxWithText(label)) === false, 'function predicate never matches a button label');

console.log('\n[3] Unrelated text does not match a menu trigger:');
const findParking = Context.has.text(allTranslations('menu.find_parking'));
assert(findParking(ctxWithText('hello world')) === false, 'random text is not routed to a menu handler');

console.log('\nALL TRIGGER CHECKS PASSED ✅\n');
