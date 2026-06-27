import { describe, it, expect, vi } from 'vitest';
import { sendPaymentReceipt } from './paymentService.js';

vi.mock('../db/repositories/payments.js', () => ({}));

vi.mock('../db/repositories/bookings.js', () => ({}));

vi.mock('../db/index.js', () => ({
  query: vi.fn(),
}));

vi.mock('./chapaService.js', () => ({
  initializePayment: vi.fn(),
  verifyPayment: vi.fn(),
}));

vi.mock('./bookingService.js', () => ({
  confirmPayment: vi.fn(),
}));

vi.mock('./pricing.js', () => ({
  calcSplit: vi.fn(),
}));

vi.mock('../utils/qr.js', () => ({
  checkinQrPng: vi.fn(),
}));

describe('sendPaymentReceipt', () => {
  it('sends a Markdown-safe receipt message', async () => {
    const ctx = {
      dbUser: { language_pref: 'en' },
      reply: vi.fn().mockResolvedValue(undefined),
      replyWithPhoto: vi.fn().mockResolvedValue(undefined),
      api: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    };

    const booking = {
      confirmation_code: 'ABC_123',
      address: 'Bole_Road [Gate] *A*',
      start_time: '2026-06-27T09:00:00.000Z',
      end_time: '2026-06-27T11:00:00.000Z',
      total_price: 100,
      checkin_token: null,
      owner_telegram_id: null,
    };
    const payment = {
      method: 'chapa',
      reference: 'parkaddis_1_1782543424274',
      amount: 100,
    };

    await sendPaymentReceipt(ctx, booking, payment);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text, extra] = ctx.reply.mock.calls[0];
    expect(extra).toEqual({ parse_mode: 'Markdown' });
    expect(text).toContain('Your check-in QR code will be sent next.');
    expect(text).not.toContain('payment.qr_instruction');
    expect(text).toContain('parkaddis\\_1\\_1782543424274');
    expect(text).toContain('Bole\\_Road \\[Gate] \\*A\\*');
  });
});
