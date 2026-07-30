export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { username, password } = req.body || {};
  const { ADMIN_USER, ADMIN_PASS, ADMIN_TOKEN } = process.env;

  if (!ADMIN_USER || !ADMIN_PASS || !ADMIN_TOKEN) {
    return res.status(500).json({ error: 'Server chưa cấu hình env vars' });
  }

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.setHeader(
      'Set-Cookie',
      `admin_session=${encodeURIComponent(ADMIN_TOKEN)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
}
