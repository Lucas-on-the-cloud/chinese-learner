export default function handler(req, res) {
  res.setHeader(
    'Set-Cookie',
    'admin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  );
  res.redirect(302, '/admin/login.html');
}
