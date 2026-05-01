// Google Cloud Vision API proxy — DOCUMENT_TEXT_DETECTION for scanned images
import crypto from 'crypto';

let _tokenCache = { token: null, expiry: 0 };

async function getAccessToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiry) return _tokenCache.token;

  const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON || '{}');
  if (!creds.client_email || !creds.private_key) throw new Error('GOOGLE_CREDENTIALS_JSON missing');

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss:   creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  const hdr = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const pld = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const msg = `${hdr}.${pld}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(msg);
  const sig  = sign.sign(creds.private_key, 'base64url');
  const jwt  = `${msg}.${sig}`;

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('GCP auth failed: ' + (data.error_description || JSON.stringify(data)));

  _tokenCache = { token: data.access_token, expiry: Date.now() + 3500 * 1000 };
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'Missing imageBase64' });

  try {
    const token  = await getAccessToken();
    const vRes   = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        requests: [{
          image:    { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        }],
      }),
    });
    const data = await vRes.json();
    if (data.error) return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
