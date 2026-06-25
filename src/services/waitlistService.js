import * as waitlistRepo from '../db/repositories/waitlist.js';
import { logger } from '../utils/logger.js';
import { getTranslator } from '../i18n/index.js';

// Notify first user in waitlist when spot becomes available.
export async function notifyNextInWaitlist(bot, spotId, spot) {
  const waitlist = await waitlistRepo.getWaitlistForSpot(spotId);
  
  if (waitlist.length === 0) {
    return null;
  }

  // Get the first person in line who hasn't been notified or whose notification expired
  const nextUser = waitlist.find(w => !w.notified_at || (w.expires_at && new Date(w.expires_at) < new Date()));

  if (!nextUser) {
    return null;
  }

  const t = getTranslator(nextUser.language_pref || 'en');
  
  // Send notification
  const text = t('notification.spot_available', {
    address: spot.address,
    expires_minutes: 15,
  });

  try {
    await bot.api.sendMessage(Number(nextUser.telegram_id), text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('common.book_now'), callback_data: `book:start:${spotId}` }],
          [{ text: t('waitlist.remove_me'), callback_data: `waitlist:remove:${spotId}` }],
        ],
      },
    });

    // Mark as notified with 15-minute expiration
    await waitlistRepo.markNotified(nextUser.id, 15);

    logger.info('Waitlist notification sent', {
      waitlistId: nextUser.id,
      userId: nextUser.user_id,
      spotId,
    });

    return nextUser;
  } catch (err) {
    logger.error('Failed to send waitlist notification', {
      error: err.message,
      userId: nextUser.user_id,
    });
    return null;
  }
}

// Clean up expired waitlist entries.
export async function cleanupExpiredWaitlists() {
  const removed = await waitlistRepo.removeExpired();
  if (removed > 0) {
    logger.info('Cleaned up expired waitlist entries', { count: removed });
  }
  return removed;
}
