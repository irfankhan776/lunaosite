// Booking data access. Thin, validated wrappers over the bookings table.
import { db } from './db.js';

const VALID_STATUS = new Set(['new', 'confirmed', 'cancelled']);
const VALID_SOURCE = new Set(['form', 'chatbot']);

const insertStmt = db.prepare(`
  INSERT INTO bookings
    (slug, business_name, customer_name, phone, email, service, date, time, notes, source, status, created_at)
  VALUES
    (@slug, @business_name, @customer_name, @phone, @email, @service, @date, @time, @notes, @source, @status, @created_at)
`);

function rowToBooking(r) {
  return {
    id: r.id,
    slug: r.slug,
    businessName: r.business_name,
    customerName: r.customer_name,
    phone: r.phone,
    email: r.email,
    service: r.service,
    date: r.date,
    time: r.time,
    notes: r.notes,
    source: r.source,
    status: r.status,
    createdAt: r.created_at,
  };
}

const str = (v) => (v == null ? '' : String(v)).trim();

// Insert a booking from either the form or the chatbot. Requires at minimum a
// customer name OR phone so empty noise can't pollute the dashboard.
export function createBooking(input = {}) {
  const customer_name = str(input.customerName || input.name);
  const phone = str(input.phone);
  if (!customer_name && !phone) {
    const err = new Error('A name or phone number is required to book.');
    err.status = 400;
    throw err;
  }
  const source = VALID_SOURCE.has(input.source) ? input.source : 'form';
  const record = {
    slug: str(input.slug),
    business_name: str(input.businessName),
    customer_name,
    phone,
    email: str(input.email),
    service: str(input.service),
    date: str(input.date),
    time: str(input.time),
    notes: str(input.notes),
    source,
    status: 'new',
    created_at: Date.now(),
  };
  if (!record.slug) {
    const err = new Error('slug is required.');
    err.status = 400;
    throw err;
  }
  const info = insertStmt.run(record);
  return getBooking(info.lastInsertRowid);
}

export function getBooking(id) {
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  return row ? rowToBooking(row) : null;
}

export function listBookings(slug) {
  const rows = slug
    ? db.prepare('SELECT * FROM bookings WHERE slug = ? ORDER BY created_at DESC').all(slug)
    : db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
  return rows.map(rowToBooking);
}

export function updateBookingStatus(id, status) {
  if (!VALID_STATUS.has(status)) {
    const err = new Error('Invalid status.');
    err.status = 400;
    throw err;
  }
  const info = db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
  if (info.changes === 0) {
    const err = new Error('Booking not found.');
    err.status = 404;
    throw err;
  }
  return getBooking(id);
}
