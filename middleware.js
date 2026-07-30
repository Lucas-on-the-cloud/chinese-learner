export default function middleware(request) {
  const { pathname } = new URL(request.url);

  // Pass through: login page + auth API endpoints
  if (pathname === '/admin/login.html' || pathname.startsWith('/api/admin/')) {
    return;
  }

  const cookie = request.headers.get('cookie') || '';
  const match  = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  const token  = match ? decodeURIComponent(match[1]) : null;
  const valid  = !!process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;

  if (!valid) {
    return Response.redirect(new URL('/admin/login.html', request.url), 302);
  }
}

export const config = {
  matcher: ['/admin', '/admin/:path*']
};
