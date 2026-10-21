// Cloudflare Worker in front of the static site.
// Everything is served as-is, except the admin page: it needs a login and password.
// The login/password live in Cloudflare (Settings → Variables and Secrets: ADMIN_USER, ADMIN_PASS),
// never in these files, so nobody can read them from the site's code.

const ADMIN_PATH = /^\/admin(\.html)?\/?$/;

// compare without leaking how many characters matched
function same(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// "Basic base64(login:password)" → [login, password]; UTF-8 so Cyrillic passwords work too
function credentials(header){
  const m = /^Basic\s+(.+)$/i.exec(header || '');
  if (!m) return null;
  try {
    const bytes = Uint8Array.from(atob(m[1]), c => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const i = text.indexOf(':');
    return i < 0 ? null : [text.slice(0, i), text.slice(i + 1)];
  } catch { return null; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!ADMIN_PATH.test(url.pathname)) return env.ASSETS.fetch(request);

    // no password configured yet → keep the admin closed instead of open
    if (!env.ADMIN_USER || !env.ADMIN_PASS)
      return new Response('Админка закрыта: в Cloudflare не задан ADMIN_USER / ADMIN_PASS.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

    const c = credentials(request.headers.get('Authorization'));
    const ok = c && same(c[0], env.ADMIN_USER) & same(c[1], env.ADMIN_PASS);
    if (!ok)
      return new Response('Нужен логин и пароль.', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="admin", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'no-store');      // don't keep the admin in shared caches
    out.headers.set('X-Robots-Tag', 'noindex');
    return out;
  },
};
