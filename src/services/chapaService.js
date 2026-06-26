import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const CHAPA_BASE_URL = 'https://api.chapa.co/v1';

// Generate a unique transaction reference for Chapa.
function generateTxRef(bookingId) {
  const timestamp = Date.now();
  return `parkaddis_${bookingId}_${timestamp}`;
}

// Initialize a payment with Chapa and get hosted checkout URL.
// Returns: { checkout_url, tx_ref }
export async function initializePayment({
  amount,
  currency = 'ETB',
  bookingId,
  customerEmail,
  customerPhone,
  callbackUrl,
  returnUrl,
}) {
  if (!config.chapa.secretKey) {
    throw new Error('Chapa secret key not configured');
  }

  const txRef = generateTxRef(bookingId);

  // Use a unique email per transaction to avoid Chapa's strict domain validation.
  // Well-known domains like @gmail.com pass; custom domains (@parkaddis.com) fail.
  const safeEmail = customerEmail || `driver_${bookingId}_${Date.now()}@gmail.com`;

  const payload = {
    amount: String(amount),
    currency,
    email: safeEmail,
    tx_ref: txRef,
    callback_url: callbackUrl || `${config.publicUrl}/api/payments/chapa/webhook`,
    return_url: returnUrl || `${config.publicUrl}/payment/success`,
    // Note: paymentService.js overrides returnUrl to redirect to Telegram bot
    customization: {
      title: 'ParkAddis',
      description: `Booking ${bookingId}`,
    },
  };

  if (customerPhone) {
    payload.phone_number = customerPhone;
  }

  try {
    const response = await fetch(`${CHAPA_BASE_URL}/transaction/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.chapa.secretKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || data.status !== 'success') {
      logger.error('Chapa initialization failed', {
        status: response.status,
        data,
        txRef,
      });
      // Chapa may return message as a string or an object — normalize it
      const errorMsg = typeof data.message === 'string'
        ? data.message
        : data.message && typeof data.message === 'object'
          ? JSON.stringify(data.message)
          : 'Chapa payment could not be initiated';
      throw new Error(errorMsg);
    }

    logger.info('Chapa payment initialized', { txRef, checkoutUrl: data.data.checkout_url });

    return {
      checkout_url: data.data.checkout_url,
      tx_ref: txRef,
    };
  } catch (err) {
    logger.error('Chapa initialization error', { error: err.message, txRef });
    throw err;
  }
}

// Verify a payment with Chapa using the transaction reference.
// Returns: { status, data } where status is 'success' or 'failed'
export async function verifyPayment(txRef) {
  if (!config.chapa.secretKey) {
    throw new Error('Chapa secret key not configured');
  }

  try {
    const response = await fetch(`${CHAPA_BASE_URL}/transaction/verify/${txRef}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.chapa.secretKey}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('Chapa verification failed', {
        status: response.status,
        data,
        txRef,
      });
      return { status: 'failed', data };
    }

    logger.info('Chapa payment verified', { txRef, status: data.status });

    return {
      status: data.status, // 'success' or 'failed'
      data: data.data,
    };
  } catch (err) {
    logger.error('Chapa verification error', { error: err.message, txRef });
    throw err;
  }
}

// Handle and validate a Chapa webhook payload.
// Returns: { tx_ref, status, amount } or throws on invalid webhook
export function handleWebhook(payload, webhookSecret) {
  // Chapa sends a signature header, but for now we validate the payload structure
  // In production, verify the webhook signature using webhookSecret
  if (!payload) {
    throw new Error('Invalid webhook payload');
  }

  const { event, tx_ref, status, amount } = payload;

  // Chapa webhook events: 'charge.success', 'charge.failed', etc.
  if (!event || !tx_ref) {
    throw new Error('Missing required webhook fields');
  }

  logger.info('Chapa webhook received', { event, tx_ref, status, amount });

  return {
    event,
    tx_ref,
    status,
    amount: amount ? Number(amount) : null,
    raw: payload,
  };
}
