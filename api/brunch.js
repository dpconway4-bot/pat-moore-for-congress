/**
 * /api/brunch
 *
 * Backend for /brunch (brunch/index.html), the Moore for Women Brunch sign-in.
 * Writes one row per guest to the campaign's existing Google Sheet
 * ("Get Involved — Response Log"; same GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY,
 * GOOGLE_SHEET_ID env vars as /api/get-involved and /api/photo-consent), on a
 * tab named "Moore for Women Brunch". The tab and its header row are created on
 * the first submission. Does not touch any other endpoint.
 */

const crypto = require('crypto');

let cachedToken = null; // { accessToken, expiresAt } — reused across warm invocations

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30000) {
    return cachedToken.accessToken;
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error(
      'Missing GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY environment variables.'
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope:
      'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const unsigned = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claim));
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  const jwt = unsigned + '.' + signature;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(
      'Google auth failed: ' + (tokenJson.error_description || tokenJson.error || tokenRes.status)
    );
  }

  cachedToken = {
    accessToken: tokenJson.access_token,
    expiresAt: Date.now() + (tokenJson.expires_in || 3600) * 1000,
  };
  return cachedToken.accessToken;
}

const TAB = 'Moore for Women Brunch';
const HEADER = [
  'Signed in (UTC)', 'Event', 'First name', 'Last name', 'Phone', 'Address', 'Text updates OK',
  'Consent text', 'Consent text version', 'Source', 'IP', 'Device', 'Follow-up (staff)',
];

async function ensureTab(accessToken) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('Missing GOOGLE_SHEET_ID.');
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const meta = await metaRes.json();
  if (!metaRes.ok) throw new Error('Sheet lookup failed: ' + (meta.error?.message || metaRes.status));
  const exists = (meta.sheets || []).some((s) => s.properties && s.properties.title === TAB);
  if (exists) return;
  const addRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB } } }] }),
  });
  if (!addRes.ok) {
    const j = await addRes.json().catch(() => ({}));
    // Another submission may have created it a moment ago; only fail on other errors.
    if (!/already exists/i.test(j.error?.message || '')) {
      throw new Error('Could not create tab: ' + (j.error?.message || addRes.status));
    }
    return;
  }
  await appendRow(accessToken, TAB, HEADER);
}

async function appendRow(accessToken, tabName, row) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('Missing GOOGLE_SHEET_ID.');

  const range = encodeURIComponent(`'${tabName}'!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `Sheets append to "${tabName}" failed: ` + (json.error?.message || res.status)
    );
  }
}

// Strip a leading = + - @ so a typed value can never run as a spreadsheet formula.
function clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 300).replace(/^[=+\-@]+/, '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }
  let f = req.body;
  if (typeof f === 'string') {
    try { f = JSON.parse(f); } catch (e) { f = {}; }
  }
  f = f || {};

  // Honeypot: bots fill the hidden field. Pretend success, save nothing.
  if (f.website) { res.status(200).json({ ok: true }); return; }

  const missing = [];
  if (!clean(f.first_name)) missing.push('first_name');
  if (!clean(f.last_name)) missing.push('last_name');
  if (String(f.phone || '').replace(/\D/g, '').length < 10) missing.push('phone');
  if (missing.length) {
    res.status(400).json({ ok: false, error: 'Missing required field(s): ' + missing.join(', ') });
    return;
  }

  const consent = f.sms_consent === 'yes';
  const row = [
    new Date().toISOString(),
    clean(f.event, 120) || 'Moore for Women Brunch',
    clean(f.first_name, 80),
    clean(f.last_name, 80),
    clean(f.phone, 40),
    clean(f.address),
    consent ? 'yes' : 'no',
    consent ? clean(f.consent_text, 600) : '',
    consent ? clean(f.consent_version, 40) : '',
    clean(f.source),
    clean((req.headers['x-forwarded-for'] || '').split(',')[0], 60),
    clean(req.headers['user-agent'], 200),
    '',
  ];

  try {
    const accessToken = await getAccessToken();
    await ensureTab(accessToken);
    await appendRow(accessToken, TAB, row);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('brunch submit error:', err);
    res.status(500).json({ ok: false, error: 'Server error. Please try again shortly.' });
  }
};
