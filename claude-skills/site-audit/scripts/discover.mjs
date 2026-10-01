// Finds the pages the other checks use: home, a collection/category, a product, cart,
// privacy policy, cookie policy, terms, accessibility statement. Also detects the platform.
import { outDir, writeJson, readJson, launch, newContext, goto, clickConsent, baseDomain } from './lib.mjs';

const dir = outDir();
const meta = readJson(dir, 'meta.json');
const browser = await launch();
const ctx = await newContext(browser);
const page = await ctx.newPage();
const res = await goto(page, meta.url);
if (!res.ok) { writeJson(dir, 'pages.json', { error: res.error }); await browser.close(); process.exit(1); }
await clickConsent(page, 'decline');

const finalUrl = new URL(page.url());
const base = baseDomain(finalUrl.hostname);
const info = await page.evaluate(() => {
  const html = document.documentElement.outerHTML;
  const platform =
    window.Shopify || /cdn\.shopify\.com|shopifycloud/.test(html) ? 'Shopify' :
    /woocommerce/.test(document.body.className) || /wp-content\/plugins\/woocommerce/.test(html) ? 'WooCommerce' :
    /wp-content|wp-includes/.test(html) ? 'WordPress' :
    /static1\.squarespace\.com|squarespace/.test(html) ? 'Squarespace' :
    /wix\.com|wixstatic/.test(html) ? 'Wix' :
    /bigcommerce/.test(html) ? 'BigCommerce' :
    /webflow/.test(html) ? 'Webflow' : 'unknown';
  const links = [...document.querySelectorAll('a[href]')].map(a => ({ href: a.href, text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 80) }));
  return { platform, title: document.title, links };
});
const same = info.links.filter(l => { try { const u = new URL(l.href); return u.hostname === finalUrl.hostname && /^https?:$/.test(u.protocol); } catch { return false; } });
const pick = (re, textRe) => same.find(l => re.test(new URL(l.href).pathname) || (textRe && textRe.test(l.text)))?.href || null;

const pages = {
  home: finalUrl.href,
  product: pick(/\/products?\/[^/?#]+/i) || pick(/\/p\/[^/?#]+/i) || pick(/\/shop\/[^/?#]+\/[^/?#]+/i),
  collection: pick(/\/collections\/[^/?#]+$/i) || pick(/\/(product-)?categor(y|ies)\//i) || pick(/\/shop\/?$/i),
  cart: pick(/\/(cart|basket|bag)\/?$/i) || (info.platform === 'Shopify' ? new URL('/cart', finalUrl).href : null),
  privacy: pick(/privacy/i, /privacy/i),
  cookies: pick(/cookie/i, /cookie/i),
  terms: pick(/terms|conditions/i, /terms/i),
  accessibility: pick(/accessib/i, /accessib/i),
  contact: pick(/contact/i, /contact/i),
};
if (info.platform === 'Shopify') {
  pages.privacy ||= new URL('/policies/privacy-policy', finalUrl).href;
  pages.terms ||= new URL('/policies/terms-of-service', finalUrl).href;
}
// A product link is often only on a collection page.
if (!pages.product && pages.collection) {
  await goto(page, pages.collection, 1500);
  pages.product = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.href).find(h => /\/products?\/[^/?#]+/i.test(new URL(h).pathname)) || null);
}
// Confirm the statement pages exist rather than assume.
for (const k of ['accessibility', 'cookies']) {
  if (pages[k]) { const r = await ctx.request.get(pages[k]).catch(() => null); if (!r || r.status() >= 400) pages[k] = null; }
}
writeJson(dir, 'pages.json', { requested: meta.url, finalUrl: finalUrl.href, host: finalUrl.hostname, baseDomain: base, platform: info.platform, title: info.title, pages });
console.log(JSON.stringify({ platform: info.platform, pages }, null, 1));
await browser.close();
