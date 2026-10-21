// Cloudflare Worker in front of the static site.
// - Everything is served as-is, except the admin: it needs a login and password.
//   The login/password live in Cloudflare (Settings → Variables and Secrets: ADMIN_USER, ADMIN_PASS),
//   never in these files, so nobody can read them from the site's code.
// - Visit statistics: each page visit and each opened video is counted per day and country
//   in a Cloudflare D1 database (binding DB). No IP addresses or personal data are stored.

const ADMIN_PATH = /^\/admin(\.html)?\/?$|^\/admin\/stats$/;
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|vkshare|headless|lighthouse/i;

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

const text = (body, status, extra = {}) => new Response(body, {
  status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });

// ---------- statistics ----------
let schemaReady = false;
async function ensureSchema(db){
  if (schemaReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS hits (
    day TEXT NOT NULL, country TEXT NOT NULL, kind TEXT NOT NULL, item TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, country, kind, item))`).run();
  schemaReady = true;
}
async function count(env, request, kind, item = ''){
  if (!env.DB || BOT_UA.test(request.headers.get('User-Agent') || '')) return;
  const day = new Date().toISOString().slice(0, 10);
  const country = (request.cf && request.cf.country) || 'XX';
  await ensureSchema(env.DB);
  await env.DB.prepare(`INSERT INTO hits (day, country, kind, item, n) VALUES (?1, ?2, ?3, ?4, 1)
    ON CONFLICT (day, country, kind, item) DO UPDATE SET n = n + 1`).bind(day, country, kind, item).run();
}
async function stats(env){
  if (!env.DB) return { configured: false };
  await ensureSchema(env.DB);
  const since = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    'SELECT day, country, kind, item, n FROM hits WHERE day >= ?1 ORDER BY day').bind(since).all();
  return { configured: true, today: new Date().toISOString().slice(0, 10), rows: results };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // video opened in the player: the site reports it here (navigator.sendBeacon)
    if (url.pathname === '/hit' && request.method === 'POST') {
      const id = (await request.text().catch(() => '')).trim();
      if (/^[a-z0-9-]{1,64}$/.test(id)) ctx.waitUntil(count(env, request, 'video', id).catch(() => {}));
      return new Response(null, { status: 204 });
    }

    if (!ADMIN_PATH.test(url.pathname)) {
      let res = await env.ASSETS.fetch(request);
      // short client links: /qfitness → opens that work (/#p/qfitness); only when no real file has that name
      const short = /^\/([a-z0-9-]{1,64})\/?$/.exec(url.pathname);
      if (short && res.status === 404) return Response.redirect(`${url.origin}/#p/${short[1]}`, 302);
      // a real page visit: the home page loaded as a document (not the admin's preview)
      const isPage = request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')
        && (request.headers.get('Accept') || '').includes('text/html') && !url.searchParams.has('draft') && res.ok;
      if (isPage) ctx.waitUntil(count(env, request, 'visit').catch(() => {}));
      return res;
    }

    // ---------- admin: login + password ----------
    // no password configured yet → keep the admin closed instead of open
    if (!env.ADMIN_USER || !env.ADMIN_PASS)
      return text('Админка закрыта: в Cloudflare не задан ADMIN_USER / ADMIN_PASS.', 503);

    const c = credentials(request.headers.get('Authorization'));
    const ok = c && same(c[0], env.ADMIN_USER) & same(c[1], env.ADMIN_PASS);
    if (!ok) return text('Нужен логин и пароль.', 401, { 'WWW-Authenticate': 'Basic realm="admin", charset="UTF-8"' });

    if (url.pathname === '/admin/stats') {
      try {
        return new Response(JSON.stringify(await stats(env)), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      } catch (e) { return text('Ошибка базы: ' + e.message, 500); }
    }

    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    out.headers.set('Cache-Control', 'no-store');      // don't keep the admin in shared caches
    out.headers.set('X-Robots-Tag', 'noindex');
    return out;
  },
};
