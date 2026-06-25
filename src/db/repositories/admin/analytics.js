import { query } from '../../index.js';

// Get platform-wide statistics.
export async function getPlatformStats() {
  const { rows } = await query(
    `SELECT
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM spots WHERE status = 'active') AS active_spots,
      (SELECT COUNT(*) FROM spots WHERE status = 'pending_approval') AS pending_spots,
      (SELECT COUNT(*) FROM bookings) AS total_bookings,
      (SELECT COUNT(*) FROM bookings WHERE status IN ('reserved', 'confirmed', 'active')) AS active_bookings,
      (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'paid') AS total_revenue,
      (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE status = 'pending') AS pending_payouts`
  );
  return rows[0];
}

// Get revenue statistics grouped by period (day/week/month).
export async function getRevenueStats({ period = 'day' } = {}) {
  let dateFormat;
  switch (period) {
    case 'month':
      dateFormat = 'YYYY-MM';
      break;
    case 'week':
      dateFormat = 'IYYY-IW';
      break;
    default:
      dateFormat = 'YYYY-MM-DD';
  }

  const { rows } = await query(
    `SELECT 
      TO_CHAR(p.created_at, $1) AS period,
      COUNT(*) AS payment_count,
      COALESCE(SUM(p.amount), 0) AS total_amount,
      COALESCE(SUM(p.commission_amount), 0) AS commission
    FROM payments p
    WHERE p.status = 'paid'
    GROUP BY period
    ORDER BY period DESC
    LIMIT 30`,
    [dateFormat]
  );
  return rows;
}

// Get booking statistics by status.
export async function getBookingStats() {
  const { rows } = await query(
    `SELECT status, COUNT(*) AS count
     FROM bookings
     GROUP BY status
     ORDER BY count DESC`
  );
  return rows;
}

// Get payment method breakdown.
export async function getPaymentMethodStats() {
  const { rows } = await query(
    `SELECT method, status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total_amount
     FROM payments
     GROUP BY method, status
     ORDER BY count DESC`
  );
  return rows;
}

// Get top spots by booking count.
export async function getTopSpots(limit = 10) {
  const { rows } = await query(
    `SELECT s.id, s.address, s.price_per_hour, s.rating_avg, s.rating_count,
            COUNT(b.id) AS booking_count,
            COALESCE(SUM(p.amount), 0) AS total_revenue
     FROM spots s
     LEFT JOIN bookings b ON b.spot_id = s.id
     LEFT JOIN payments p ON p.booking_id = b.id AND p.status = 'paid'
     WHERE s.status = 'active'
     GROUP BY s.id
     ORDER BY booking_count DESC, total_revenue DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// Get recent activity feed (latest bookings, payments, disputes).
export async function getRecentActivity(limit = 20) {
  const { rows } = await query(
    `SELECT 'booking' AS type, b.id, b.created_at, b.status,
            b.confirmation_code AS reference, s.address AS details
     FROM bookings b
     JOIN spots s ON s.id = b.spot_id
     UNION ALL
     SELECT 'payment' AS type, p.id, p.created_at, p.status,
            p.reference, b.confirmation_code AS details
     FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     UNION ALL
     SELECT 'dispute' AS type, d.id, d.created_at, d.status,
            d.reason, b.confirmation_code AS details
     FROM disputes d
     JOIN bookings b ON b.id = d.booking_id
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}
