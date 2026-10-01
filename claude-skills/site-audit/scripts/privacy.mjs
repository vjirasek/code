// Cookie consent behaviour in three fresh browser sessions: no answer, Decline, Accept.
// Records cookies, browser storage and third-party hosts contacted, and saves the privacy and
// cookie policy text for review.
import fs from 'fs';
import path from 'path';
import { outDir, writeJson, readJson, launch, newContext, goto, detectConsent, clickConsent, isFirstParty } from './lib.mjs';

const dir = outDir();
const { pages, baseDomain: base } = readJson(dir, 'pages.json');
const TRACKERS = /google-analytics|googletagmanager|doubleclick|googleadservices|google\.com\/(ccm|pagead)|analytics\.google|merchant-center-analytics|facebook\.(com|net)|fbcdn|tiktok|hotjar|clarity\.ms|bing\.com|bat\.bing|linkedin|licdn|pinterest|pinimg|snapchat|sc-static|twitter|x\.com\/i|ads-twitter|criteo|taboola|outbrain|adroll|quantserve|scorecardresearch|segment\.(io|com)|mixpanel|amplitude|heap(analytics)?|fullstory|mouseflow|crazyegg|luckyorange|klaviyo|omnisend|attentive|yotpo|trustpilot|tiqcdn|adnxs|rubiconproject|pubmatic|amazon-adsystem|reddit|redditstatic/i;

async function session(choice) {
  const browser = await launch();
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const hosts = {};
  page.on('request', r => { try { const h = new URL(r.url()).hostname; if (!isFirstParty(h, base)) hosts[h] = (hosts[h] || 0) + 1; } catch {} });
  await goto(page, pages.home, 4000);
  const banner = await detectConsent(page);
  let clicked = null;
  if (choice !== 'none') {
    clicked = await clickConsent(page, choice);
    const next = pages.collection || pages.product || pages.home;
    await goto(page, next, 5000);
  }
  const cookies = (await ctx.cookies()).map(c => ({ name: c.name, domain: c.domain, firstParty: isFirstParty(c.domain.replace(/^\./, ''), base), secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, days: c.expires > 0 ? Math.round((c.expires * 1000 - Date.now()) / 864e5) : 'session' }));
  const storage = await page.evaluate(() => { try { return { local: Object.keys(localStorage), session: Object.keys(sessionStorage) }; } catch { return null; } });
  if (choice === 'none') await page.screenshot({ path: path.join(dir, 'consent-banner.png') });
  await browser.close();
  const thirdParty = Object.entries(hosts).map(([host, n]) => ({ host, requests: n, tracker: TRACKERS.test(host) })).sort((a, b) => b.tracker - a.tracker || b.requests - a.requests);
  return { choice, banner, clicked, cookies, storage, thirdParty, trackersContacted: thirdParty.filter(t => t.tracker).map(t => t.host) };
}

async function policyText(url, name) {
  if (!url) return null;
  const browser = await launch();
  const page = await (await newContext(browser)).newPage();
  const r = await goto(page, url, 1500);
  let text = null;
  if (r.ok) text = await page.evaluate(() => (document.querySelector('main, [role=main], article') || document.body).innerText);
  await browser.close();
  if (text) fs.writeFileSync(path.join(dir, name), text);
  return text ? { url, file: name, words: text.split(/\s+/).length } : { url, error: r.error || 'no text' };
}

const result = {
  none: await session('none'),
  decline: await session('decline'),
  accept: await session('accept'),
  privacyPolicy: await policyText(pages.privacy, 'privacy-policy.txt'),
  cookiePolicy: await policyText(pages.cookies, 'cookie-policy.txt'),
};
// Quick hints for the policy review; the full text still needs reading.
if (result.privacyPolicy?.file) {
  const t = fs.readFileSync(path.join(dir, 'privacy-policy.txt'), 'utf8');
  const vendors = [...new Set(result.accept.thirdParty.map(x => x.host))];
  result.policyHints = {
    mentionsICO: /\bICO\b|Information Commissioner/i.test(t),
    mentionsLawfulBasis: /lawful basis|legal basis|legitimate interest/i.test(t),
    mentionsRetentionPeriod: /\b\d+\s*(day|month|year)s?\b/i.test(t),
    usOnlyWording: /\bsell\b.*personal information|authori[sz]ed agent|California|CCPA/i.test(t),
    lastUpdated: (/last updated:?\s*([^\n]+)/i.exec(t) || [])[1] || null,
    emails: [...new Set(t.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [])],
    thirdPartyHostsAfterAccept: vendors,
    vendorNamesMentioned: ['Google', 'Meta', 'Facebook', 'Klaviyo', 'Hotjar', 'TikTok', 'Pinterest', 'Microsoft', 'Shopify', 'PayPal', 'Stripe', 'Trustpilot', 'Reviews.io', 'Yotpo', 'Appstle', 'Mailchimp'].filter(v => new RegExp(v.replace('.', '\\.'), 'i').test(t)),
  };
}
writeJson(dir, 'privacy.json', result);
console.log('privacy ok: banner', result.none.banner.found ? result.none.banner.cmp : 'NOT FOUND', '| trackers before consent:', result.none.trackersContacted.length, '| after decline:', result.decline.trackersContacted.length, '| after accept:', result.accept.trackersContacted.length);
