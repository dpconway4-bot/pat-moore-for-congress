/**
 * /api/get-involved/:action
 *
 * Backend for the Get Involved page's five forms. No npm
 * dependencies — everything below is Node's built-in `crypto`
 * plus the global `fetch`, so nothing needs `npm install` on
 * deploy. Requires four environment variables set in the Vercel
 * project (Project Settings -> Environment Variables), copied
 * from the campaign's existing Google service account — never
 * commit these to the repo:
 *
 *   GOOGLE_CLIENT_EMAIL       the service account's "client_email"
 *   GOOGLE_PRIVATE_KEY        the service account's "private_key"
 *                             (paste it with real newlines, or with
 *                             \n escapes — both are handled below)
 *   GOOGLE_SHEET_ID           the "Get Involved — Response Log"
 *                             spreadsheet's ID (from its URL)
 *   GOOGLE_DRIVE_FOLDER_ID    a Drive folder the service account
 *                             can write to, for We Can Do This photos
 *                             (optional — photo capture just no-ops
 *                             without it)
 *
 * The service account must be shared as an Editor on both the
 * spreadsheet and the Drive folder, and the spreadsheet must
 * already have five tabs named exactly:
 *   Endorsements | Volunteers | Press List | Rally Speakers | We Can Do This
 */

const crypto = require('crypto');

const SHEET_TABS = {
  endorse: 'Endorsements',
  volunteer: 'Volunteers',
  press: 'Press List',
  'rally-speaker': 'Rally Speakers',
  'we-can-do-this': 'We Can Do This',
};

const REQUIRED_FIELDS = {
  endorse: ['full_name', 'elected_office', 'jurisdiction', 'work_email_or_phone'],
  volunteer: ['primary_interest', 'full_name', 'email'],
  press: ['name', 'outlet', 'email', 'request_type'],
  'rally-speaker': ['name', 'city_parish', 'phone', 'email', 'what_theyd_share'],
  'we-can-do-this': ['quote_text'],
};

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

async function uploadPhoto(accessToken, dataUrl, filenameHint) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID.');

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Photo was not a valid image upload.');
  const mimeType = match[1];
  const base64Body = match[2];
  const ext = mimeType.split('/')[1] || 'jpg';
  const metadata = {
    name: `we-can-do-this-${Date.now()}-${filenameHint}.${ext}`,
    parents: [folderId],
  };

  const boundary = 'giv_boundary_' + Date.now();
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${base64Body}\r\n` +
    `--${boundary}--`;

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );
  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok || !uploadJson.id) {
    throw new Error('Drive upload failed: ' + (uploadJson.error?.message || uploadRes.status));
  }

  // Campaign's own Drive folder — make the file viewable to anyone with the link
  // (read-only) so the photo can be pulled into a social card later.
  await fetch(`https://www.googleapis.com/drive/v3/files/${uploadJson.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  return uploadJson.webViewLink || `https://drive.google.com/file/d/${uploadJson.id}/view`;
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

function buildRow(action, f) {
  const now = new Date().toISOString();
  switch (action) {
    case 'endorse':
      return [
        now,
        f.full_name,
        f.elected_office,
        f.jurisdiction,
        f.work_email_or_phone,
        f.recognition_preference || '',
        f.publish_permission || 'no',
        'Pending', // verification_status — Lottie confirms within 24 hours
        f.source || '',
      ];
    case 'volunteer':
      return [
        now,
        f.full_name || '',
        f.street_address || '',
        f.city || '',
        f.parish || '',
        f.state || '',
        f.zip || '',
        f.email || '',
        f.cell_phone || '',
        f.primary_interest || '',
        f.followup_answers || '',
        f.source || '',
      ];
    case 'press':
      return [now, f.name, f.outlet, f.email, f.phone || '', f.request_type, f.event_or_date || '', f.source || ''];
    case 'rally-speaker':
      return [now, f.name, f.city_parish, f.phone, f.email, f.what_theyd_share, f.preferred_day || '', f.source || ''];
    case 'we-can-do-this':
      return [
        now,
        f.display_name || '',
        f.city_parish || '',
        f.quote_text,
        f.photo_url || '',
        f.contact_email_or_phone || '',
        f.reuse_permission || 'no', // visitor's own checkbox — no staff sign-off gate
        '', // used_in — filled in by staff after the fact, not at submission
        f.source || '',
      ];
    default:
      throw new Error('Unknown action.');
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  const action = (req.query && req.query.action) || '';
  const tabName = SHEET_TABS[action];
  if (!tabName) {
    res.status(404).json({ ok: false, error: 'Unknown form.' });
    return;
  }

  let fields = req.body;
  if (typeof fields === 'string') {
    try {
      fields = JSON.parse(fields);
    } catch (e) {
      fields = {};
    }
  }
  fields = fields || {};

  const required = REQUIRED_FIELDS[action] || [];
  const missing = required.filter((key) => !fields[key] || !String(fields[key]).trim());
  if (missing.length) {
    res.status(400).json({ ok: false, error: 'Missing required field(s): ' + missing.join(', ') });
    return;
  }

  try {
    const accessToken = await getAccessToken();

    if (action === 'we-can-do-this' && fields.photo_data_url) {
      try {
        fields.photo_url = await uploadPhoto(
          accessToken,
          fields.photo_data_url,
          (fields.display_name || 'anon').replace(/[^a-z0-9]/gi, '-').toLowerCase()
        );
      } catch (photoErr) {
        // A photo problem shouldn't sink the whole submission — the quote still matters.
        console.error('Photo upload failed, continuing without it:', photoErr);
        fields.photo_url = '';
      }
    }

    const row = buildRow(action, fields);
    await appendRow(accessToken, tabName, row);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('get-involved submit error:', err);
    res.status(500).json({ ok: false, error: 'Server error. Please try again shortly.' });
  }
};
