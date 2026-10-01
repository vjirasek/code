// Security headers, CSP analysis, cookie flags, third-party script inventory and mixed content.
// Optional --search-probe (only with the owner's express permission): submits HTML characters to
// the site search once and checks they come back escaped.
import { outDir, writeJson, readJson, UA, baseDomain, isFirstParty } from './lib.mjs';

const dir = outDir();
const probe = process.argv.includes('--search-probe');
const { pages, finalUrl, platform } = readJson(dir, 'pages.json');
const base = baseDomain(new URL(finalUrl).hostname);
const targets = {
  home: pages.home, collection: pages.collection, product: pages.product, cart: pages.cart,
  notFound: new URL(`/site-audit-missing-${Date.now()}`, finalUrl).href,
};

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en-GB' }, redirect: 'follow' });
  const body = await r.text();
  const headers = Object.fromEntries([...r.headers.entries()].filter(([k]) => k !== 'set-cookie'));
  return { status: r.status, finalUrl: r.url, headers, setCookies: r.headers.getSetCookie?.() || [], body };
}

function parseCsp(v) {
  if (!v) return null;
  const d = Object.fromEntries(v.split(';').map(s => s.trim()).filter(Boolean).map(s => { const [k, ...rest] = s.split(/\s+/); return [k.toLowerCase(), rest.join(' ')]; }));
  const scriptSrc = d['script-src'] ?? d['default-src'];
  return {
    raw: v, directives: Object.keys(d),
    restrictsScripts: scriptSrc !== undefined,
    unsafeInline: /'unsafe-inline'/.test(scriptSrc || '') && !/'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(scriptSrc || ''),
    unsafeEval: /'unsafe-eval'/.test(scriptSrc || ''),
    missing: ['default-src', 'script-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors'].filter(k => !(k in d)),
    deprecated: ['block-all-mixed-content', 'report-uri', 'plugin-types', 'referrer'].filter(k => k in d),
  };
}

function parseCookie(sc) {
  const [nv, ...attrs] = sc.split(';').map(s => s.trim());
  const a = attrs.map(x => x.toLowerCase());
  return { name: nv.split('=')[0], secure: a.includes('secure'), httpOnly: a.includes('httponly'), sameSite: (a.find(x => x.startsWith('samesite=')) || '').split('=')[1] || null, maxAge: (attrs.find(x => /^max-age=/i.test(x)) || '').split('=')[1] || null, expires: (attrs.find(x => /^expires=/i.test(x)) || '').slice(8) || null };
}

const result = { platform, pages: {}, cookies: {}, csp: {}, home: {} };
for (const [k, url] of Object.entries(targets)) {
  if (!url) continue;
  try {
    const r = await get(url);
    const h = r.headers;
    const hsts = h['strict-transport-security'];
    result.pages[k] = {
      url, status: r.status,
      hsts: hsts ? { raw: hsts, maxAgeDays: Math.round((+(/max-age=(\d+)/i.exec(hsts)?.[1] || 0)) / 86400), includeSubDomains: /includesubdomains/i.test(hsts), preload: /preload/i.test(hsts) } : null,
      csp: h['content-security-policy'] || null,
      cspReportOnly: h['content-security-policy-report-only'] || null,
      xFrameOptions: h['x-frame-options'] || null,
      xContentTypeOptions: h['x-content-type-options'] || null,
      referrerPolicy: h['referrer-policy'] || null,
      permissionsPolicy: h['permissions-policy'] || null,
      coop: h['cross-origin-opener-policy'] || null,
      xXssProtection: h['x-xss-protection'] || null,
      disclosure: Object.fromEntries(Object.entries(h).filter(([n]) => /^(server|x-powered-by|powered-by|x-aspnet-version|x-generator)$/i.test(n))),
    };
    for (const c of r.setCookies.map(parseCookie)) result.cookies[c.name] = { ...c, seenOn: k };
    if (r.headers['content-security-policy']) result.csp[k] = parseCsp(r.headers['content-security-policy']);
    if (k === 'home') {
      const html = r.body;
      const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map(m => m[1]);
      const ext = scripts.map(a => ({ src: /src=["']([^"']+)/i.exec(a)?.[1], integrity: /integrity=/i.test(a) })).filter(s => s.src);
      const hostOf = s => { try { return new URL(s, finalUrl).hostname; } catch { return null; } };
      const third = {};
      for (const s of ext) { const host = hostOf(s.src); if (host && !isFirstParty(host, base)) { third[host] ??= { count: 0, withIntegrity: 0 }; third[host].count++; if (s.integrity) third[host].withIntegrity++; } }
      result.home = {
        inlineScripts: scripts.filter(a => !/src=/i.test(a)).length,
        externalScripts: ext.length,
        thirdPartyScriptHosts: third,
        mixedContent: [...new Set([...html.matchAll(/(?:src|href)=["'](http:\/\/[^"']+)/gi)].map(m => m[1]))].slice(0, 20),
        metaCsp: /<meta[^>]+http-equiv=["']content-security-policy/i.test(html),
      };
    }
  } catch (e) { result.pages[k] = { url, error: e.message }; }
}

// HTTP -> HTTPS redirect
try {
  const r = await fetch(new URL(finalUrl).href.replace(/^https:/, 'http:'), { redirect: 'manual', headers: { 'user-agent': UA } });
  result.httpRedirect = { status: r.status, location: r.headers.get('location') };
} catch (e) { result.httpRedirect = { error: e.message }; }

if (probe) {
  const marker = 'sa' + Math.random().toString(36).slice(2, 7);
  const q = `"'><b>${marker}</b>`;
  const searchUrl = platform === 'Shopify' ? new URL(`/search?q=${encodeURIComponent(q)}`, finalUrl).href
    : platform === 'WooCommerce' || platform === 'WordPress' ? new URL(`/?s=${encodeURIComponent(q)}`, finalUrl).href : null;
  if (searchUrl) {
    const r = await get(searchUrl);
    result.searchProbe = { url: searchUrl, status: r.status, reflectedRaw: r.body.includes(`<b>${marker}</b>`), reflectedEscaped: r.body.includes(`&lt;b&gt;${marker}`) || r.body.includes(`\\u003cb\\u003e${marker}`) || r.body.includes(`\\u003Cb\\u003E${marker}`), markerSeen: r.body.includes(marker) };
  } else result.searchProbe = { skipped: 'search URL pattern unknown for this platform' };
} else result.searchProbe = { skipped: 'not run (needs owner permission: --search-probe)' };

writeJson(dir, 'headers.json', result);
console.log('headers ok:', Object.keys(result.pages).join(', '));
