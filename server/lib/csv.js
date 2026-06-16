// Minimal, dependency-free CSV parser tuned for lead lists.
// Handles quoted fields, embedded commas, and CRLF. Maps common header
// aliases (Name/Business, Phone/Tel, City/Location, etc.) to a normalized
// business record consumed by the compile engine.
const HEADER_ALIASES = {
  name: 'name',
  business: 'name',
  business_name: 'name',
  'business name': 'name',
  company: 'name',
  short: 'business_name_short',
  business_name_short: 'business_name_short',
  owner: 'owner',
  contact: 'owner',
  phone: 'phone',
  tel: 'phone',
  telephone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  city: 'city',
  'city name': 'city',
  town: 'city',
  location: 'city',
  'city/state': 'city',
  state: 'state',
  niche: 'niche',
  category: 'niche',
  industry: 'niche',
  email: 'email',
  address: 'address',
  street: 'address',
  years: 'years_in_business',
  years_in_business: 'years_in_business',
  instagram: 'instagram_handle',
  instagram_handle: 'instagram_handle',
  ig: 'instagram_handle',
  facebook: 'facebook_url',
  facebook_url: 'facebook_url',
  rating: 'rating',
  google_rating: 'rating',
  reviews: 'reviews',
  review_count: 'reviews',
  google_review_count: 'reviews',
};

function parseLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const rawHeaders = parseLine(lines[0]).map((h) => h.toLowerCase());
  const headers = rawHeaders.map((h) => HEADER_ALIASES[h] || h.replace(/\s+/g, '_'));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const rec = {};
    headers.forEach((h, idx) => {
      if (cells[idx] !== undefined && cells[idx] !== '') rec[h] = cells[idx];
    });
    if (rec.name) rows.push(rec);
  }
  return rows;
}

// Count digits in a phone string (ignores +, spaces, dashes, parentheses).
function digitCount(value) {
  return (String(value || '').match(/\d/g) || []).length;
}

const REQUIRED_FIELDS = [
  { key: 'name', label: 'Business Name' },
  { key: 'city', label: 'City Name' },
  { key: 'phone', label: 'Phone Number' },
];

// God-level CSV validator (no LLM). Confirms the sheet has the three required
// columns and that every row carries a usable business name, city and phone.
// Returns a structured report the UI renders into brand-consistent messages.
export function validateCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const report = {
    ok: false,
    detectedColumns: [],
    missingColumns: REQUIRED_FIELDS.map((f) => f.label),
    totalRows: 0,
    validCount: 0,
    invalidCount: 0,
    leads: [],
    invalidRows: [],
    message: '',
  };

  if (lines.length === 0) {
    report.message = 'This file is empty. Upload a CSV with a header row and at least one lead.';
    return report;
  }
  if (lines.length < 2) {
    report.message = 'No data rows found. Add a header row plus at least one lead below it.';
    return report;
  }

  const rawHeaders = parseLine(lines[0]).map((h) => h.toLowerCase());
  const headers = rawHeaders.map((h) => HEADER_ALIASES[h] || h.replace(/\s+/g, '_'));
  report.detectedColumns = headers;

  // Which required columns are present?
  const present = new Set(headers);
  const missing = REQUIRED_FIELDS.filter((f) => !present.has(f.key));
  report.missingColumns = missing.map((f) => f.label);

  if (missing.length > 0) {
    report.message =
      `Your CSV is missing the required column${missing.length > 1 ? 's' : ''}: ` +
      `${missing.map((f) => f.label).join(', ')}. ` +
      'Add a header row with Business Name, City Name and Phone Number.';
    return report;
  }

  // Validate every data row.
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const rec = {};
    headers.forEach((h, idx) => {
      if (cells[idx] !== undefined && cells[idx] !== '') rec[h] = cells[idx];
    });

    // Skip fully blank lines silently.
    if (Object.keys(rec).length === 0) continue;

    report.totalRows += 1;
    const issues = [];
    if (!rec.name || !String(rec.name).trim()) issues.push('Missing business name');
    if (!rec.city || !String(rec.city).trim()) issues.push('Missing city name');
    if (!rec.phone || !String(rec.phone).trim()) {
      issues.push('Missing phone number');
    } else if (digitCount(rec.phone) < 7) {
      issues.push('Phone number looks invalid (needs at least 7 digits)');
    }

    if (issues.length === 0) {
      report.leads.push(rec);
      report.validCount += 1;
    } else {
      report.invalidCount += 1;
      report.invalidRows.push({
        line: i + 1,
        name: rec.name || '(blank)',
        issues,
      });
    }
  }

  if (report.totalRows === 0) {
    report.message = 'No data rows found below the header. Add at least one lead.';
    return report;
  }
  if (report.validCount === 0) {
    report.message =
      'None of your rows are valid. Every row needs a Business Name, City Name and a Phone Number.';
    return report;
  }

  report.ok = true;
  report.message =
    report.invalidCount > 0
      ? `${report.validCount} of ${report.totalRows} rows are ready. ${report.invalidCount} row(s) were skipped — fix them to include everyone.`
      : `All ${report.validCount} rows validated successfully.`;
  return report;
}
