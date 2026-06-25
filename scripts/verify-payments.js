// Payment system verification script
// Tests Chapa integration, webhook handling, and payment flows
import 'dotenv/config';
import { config } from '../src/config/index.js';
import { initializePayment, verifyPayment, handleWebhook } from '../src/services/chapaService.js';
import { logger } from '../src/utils/logger.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
  log(colors.green, `✓ ${message}`);
}

function error(message) {
  log(colors.red, `✗ ${message}`);
}

function info(message) {
  log(colors.blue, `ℹ ${message}`);
}

function warn(message) {
  log(colors.yellow, `⚠ ${message}`);
}

async function testChapaConfig() {
  log(colors.blue, '\n=== Testing Chapa Configuration ===\n');

  if (!config.chapa.secretKey) {
    warn('CHAPA_SECRET_KEY is not set');
    info('Set it in your .env file to test Chapa integration');
    info('For sandbox testing, get keys from https://dashboard.chapa.co/aqa/settings');
    return false;
  }

  success('Chapa secret key is configured');

  if (!config.chapa.webhookSecret) {
    warn('CHAPA_WEBHOOK_SECRET is not set');
    info('Webhook validation will be skipped in development');
  } else {
    success('Chapa webhook secret is configured');
  }

  return true;
}

async function testWebhookHandling() {
  log(colors.blue, '\n=== Testing Webhook Handling ===\n');

  // Test valid webhook payload
  const validPayload = {
    event: 'charge.success',
    tx_ref: 'parkaddis_test_123456',
    status: 'success',
    amount: 100,
  };

  try {
    const result = handleWebhook(validPayload, config.chapa.webhookSecret);
    success('Webhook payload validated successfully');
    info(`Event: ${result.event}`);
    info(`TxRef: ${result.tx_ref}`);
    info(`Status: ${result.status}`);
  } catch (err) {
    error(`Webhook validation failed: ${err.message}`);
    return false;
  }

  // Test invalid payload
  try {
    handleWebhook(null, config.chapa.webhookSecret);
    error('Should have thrown on null payload');
    return false;
  } catch (err) {
    success('Correctly rejected null payload');
  }

  // Test missing fields
  try {
    handleWebhook({ event: 'charge.success' }, config.chapa.webhookSecret);
    error('Should have thrown on missing tx_ref');
    return false;
  } catch (err) {
    success('Correctly rejected payload with missing fields');
  }

  return true;
}

async function testChapaInitialization() {
  log(colors.blue, '\n=== Testing Chapa Payment Initialization ===\n');

  if (!config.chapa.secretKey) {
    warn('Skipping - Chapa not configured');
    return true;
  }

  try {
    info('Attempting to initialize test payment with Chapa...');
    
    const result = await initializePayment({
      amount: 100,
      currency: 'ETB',
      bookingId: 999999, // Test booking ID
      customerEmail: 'test@parkaddis.com',
      callbackUrl: `${config.publicUrl}/api/payments/chapa/webhook`,
      returnUrl: `${config.publicUrl}/payment/success`,
    });

    success('Payment initialized successfully');
    info(`TxRef: ${result.tx_ref}`);
    info(`Checkout URL: ${result.checkout_url}`);

    return true;
  } catch (err) {
    if (err.message.includes('fetch') || err.message.includes('network')) {
      error(`Network error: ${err.message}`);
      info('Check your internet connection and Chapa API status');
    } else {
      error(`Initialization failed: ${err.message}`);
      info('This may be due to invalid credentials or sandbox mode');
    }
    return false;
  }
}

async function testPaymentServiceImports() {
  log(colors.blue, '\n=== Testing Payment Service Imports ===\n');

  try {
    const paymentRepo = await import('../src/db/repositories/payments.js');
    success('Payment repository imported');

    const chapaService = await import('../src/services/chapaService.js');
    success('Chapa service imported');

    const paymentService = await import('../src/services/paymentService.js');
    success('Payment service imported');

    const paymentHandler = await import('../src/bot/handlers/payment.js');
    success('Payment handler imported');

    return true;
  } catch (err) {
    error(`Import failed: ${err.message}`);
    return false;
  }
}

async function runTests() {
  log(colors.blue, '╔══════════════════════════════════════════════════╗');
  log(colors.blue, '║     ParkAddis Payment System Verification        ║');
  log(colors.blue, '╚══════════════════════════════════════════════════╝\n');

  const results = {
    config: await testChapaConfig(),
    imports: await testPaymentServiceImports(),
    webhook: await testWebhookHandling(),
    chapa: await testChapaInitialization(),
  };

  log(colors.blue, '\n=== Test Summary ===\n');

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;

  if (passed === total) {
    success(`All ${total} tests passed!`);
    info('Payment system is ready for use');
  } else {
    warn(`${passed}/${total} tests passed`);
    info('Some features may not work until all tests pass');
  }

  console.log('\nNext steps:');
  console.log('1. Set CHAPA_SECRET_KEY in .env for live testing');
  console.log('2. Set PUBLIC_URL to your production/staging URL');
  console.log('3. Configure Chapa webhook URL: {PUBLIC_URL}/api/payments/chapa/webhook');
  console.log('4. Test the full booking + payment flow in Telegram\n');
}

runTests().catch((err) => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
