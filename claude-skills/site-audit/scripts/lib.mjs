// Shared helpers for the site-audit scripts. Every check is visitor-level: page loads,
// keyboard presses and clicks a normal visitor would make. Nothing is typed into forms
// except the optional search probe in headers.mjs.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
export const DESKTOP = { width: 1366, height: 850 };
export const MOBILE = { width: 390, height: 844 };

export function outDir() {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) { console.error('usage: node <script> <outdir>'); process.exit(2); }
  return dir;
}
export const writeJson = (dir, name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
export const readJson = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));

export const launch = () => chromium.launch();
export const newContext = (browser, opts = {}) =>
  browser.newContext({ userAgent: UA, locale: 'en-GB', timezoneId: 'Europe/London', viewport: DESKTOP, ...opts });

export async function settle(page, ms = 2500) {
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  await page.waitForTimeout(ms);
}

export async function goto(page, url, ms) {
  try { await page.goto(url, { waitUntil: 'load', timeout: 45000 }); }
  catch (e) { return { ok: false, error: e.message.split('\n')[0] }; }
  await settle(page, ms);
  return { ok: true, url: page.url() };
}

// Registrable-ish base domain, good enough for first/third-party split (handles .co.uk etc.).
export function baseDomain(host) {
  const parts = host.replace(/^www\./, '').split('.');
  const twoLevel = /^(co|org|ac|gov|com|net|ltd|plc|me)$/.test(parts.at(-2) || '') && (parts.at(-1) || '').length === 2;
  return parts.slice(twoLevel ? -3 : -2).join('.');
}
export const isFirstParty = (host, base) => host === base || host.endsWith('.' + base);

// ---- Cookie consent banners -------------------------------------------------
const CMPS = [
  { name: 'Shopify', root: '#shopify-pc__banner', accept: /^accept/i, decline: /^decline/i },
  { name: 'OneTrust', root: '#onetrust-banner-sdk', acceptSel: '#onetrust-accept-btn-handler', declineSel: '#onetrust-reject-all-handler' },
  { name: 'Cookiebot', root: '#CybotCookiebotDialog', acceptSel: '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', declineSel: '#CybotCookiebotDialogBodyButtonDecline' },
  { name: 'CookieYes', root: '.cky-consent-container', acceptSel: '.cky-btn-accept', declineSel: '.cky-btn-reject' },
  { name: 'Complianz', root: '.cmplz-cookiebanner', acceptSel: '.cmplz-accept', declineSel: '.cmplz-deny' },
  { name: 'Osano', root: '.osano-cm-dialog', acceptSel: '.osano-cm-accept-all', declineSel: '.osano-cm-denyAll' },
  { name: 'Didomi', root: '#didomi-host', acceptSel: '#didomi-notice-agree-button', declineSel: '#didomi-notice-disagree-button' },
  { name: 'Quantcast', root: '.qc-cmp2-container', accept: /^(agree|accept)/i, decline: /^(disagree|reject)/i },
];
const GENERIC_ROOT = '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id*="gdpr" i],[class*="gdpr" i],[aria-label*="cookie" i],[aria-label*="consent" i]';
const ACCEPT_RE = /^\s*(accept|allow|agree|i agree|ok|okay|got it|yes)\b/i;
const DECLINE_RE = /^\s*(decline|reject|refuse|deny|disagree|necessary only|only necessary|essential only|use necessary|no,? thanks)\b/i;

async function visible(loc) { try { return await loc.first().isVisible(); } catch { return false; } }

export async function detectConsent(page) {
  for (const c of CMPS) {
    const root = page.locator(c.root);
    if (await visible(root)) {
      const text = (await root.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 600);
      const buttons = await root.first().locator('button, [role=button], a[href="#"]').allInnerTexts().catch(() => []);
      return { found: true, cmp: c.name, text, buttons: buttons.map(b => b.trim()).filter(Boolean).slice(0, 8) };
    }
  }
  const roots = page.locator(GENERIC_ROOT);
  const n = Math.min(await roots.count(), 25);
  for (let i = 0; i < n; i++) {
    const r = roots.nth(i);
    if (!(await r.isVisible().catch(() => false))) continue;
    const buttons = (await r.locator('button, [role=button], a').allInnerTexts().catch(() => [])).map(b => b.trim()).filter(Boolean);
    if (buttons.some(b => ACCEPT_RE.test(b) || DECLINE_RE.test(b))) {
      const text = (await r.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 600);
      return { found: true, cmp: 'generic', text, buttons: buttons.slice(0, 8) };
    }
  }
  return { found: false };
}

// choice: 'accept' | 'decline'. Returns the label clicked, or null when no matching button exists.
export async function clickConsent(page, choice) {
  for (const c of CMPS) {
    const root = page.locator(c.root);
    if (!(await visible(root))) continue;
    const sel = choice === 'accept' ? c.acceptSel : c.declineSel;
    if (sel && await visible(page.locator(sel))) { const t = await page.locator(sel).first().innerText().catch(() => sel); await page.locator(sel).first().click(); await page.waitForTimeout(1200); return `${c.name}: ${t.trim()}`; }
    const re = choice === 'accept' ? c.accept : c.decline;
    if (re) { const b = root.first().getByRole('button', { name: re }); if (await visible(b)) { const t = await b.first().innerText(); await b.first().click(); await page.waitForTimeout(1200); return `${c.name}: ${t.trim()}`; } }
  }
  const re = choice === 'accept' ? ACCEPT_RE : DECLINE_RE;
  const roots = page.locator(GENERIC_ROOT);
  const n = Math.min(await roots.count(), 25);
  for (let i = 0; i < n; i++) {
    const r = roots.nth(i);
    if (!(await r.isVisible().catch(() => false))) continue;
    const cands = r.locator('button, [role=button], a');
    const m = Math.min(await cands.count(), 20);
    for (let j = 0; j < m; j++) {
      const b = cands.nth(j); const t = (await b.innerText().catch(() => '')).trim();
      if (re.test(t) && await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(1200); return `generic: ${t}`; }
    }
  }
  return null;
}

// ---- Focus inspection --------------------------------------------------------
// Describes document.activeElement: name, role, whether it is visible, whether a focus indicator is
// drawn (compared with the element's own unfocused style recorded by markFocusables), and an
// optional container test.
export async function markFocusables(page) {
  await page.evaluate(() => {
    const sel = 'a[href],button,input:not([type=hidden]),select,textarea,summary,iframe,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
    const sig = (s, p) => [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.borderBottomColor, s.borderBottomWidth, s.backgroundColor, s.color, s.textDecorationLine, p ? [p.outlineStyle, p.boxShadow, p.borderTopColor, p.borderTopWidth].join('/') : ''].join('|');
    document.querySelectorAll(sel).forEach(e => { if (!e.dataset.saSig) e.dataset.saSig = sig(getComputedStyle(e), e.parentElement && getComputedStyle(e.parentElement)); });
  });
}

export async function focusInfo(page, insideSelector) {
  return page.evaluate((insideSelector) => {
    const e = document.activeElement;
    if (!e || e === document.body || e === document.documentElement) return { tag: 'body', name: '', body: true };
    const s = getComputedStyle(e);
    const ps = e.parentElement && getComputedStyle(e.parentElement);
    const sig = [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.borderBottomColor, s.borderBottomWidth, s.backgroundColor, s.color, s.textDecorationLine, ps ? [ps.outlineStyle, ps.boxShadow, ps.borderTopColor, ps.borderTopWidth].join('/') : ''].join('|');
    const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    // With a recorded unfocused style, any visible change counts as an indicator; otherwise fall back
    // to outline/box-shadow. The parent's border/outline/shadow is included (focus-within wrappers); rings drawn by ::before/::after are missed.
    const ring = e.dataset.saSig ? e.dataset.saSig !== sig : (outline || s.boxShadow !== 'none');
    const r = e.getBoundingClientRect();
    let hidden = r.width < 2 || r.height < 2 || s.visibility === 'hidden' || parseFloat(s.opacity) === 0;
    for (let a = e.parentElement; a && !hidden; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (as.visibility === 'hidden' || parseFloat(as.opacity) === 0 || as.display === 'none') hidden = true;
    }
    const offscreen = r.right < 0 || r.left > innerWidth || r.bottom < -2000;
    const label = e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.innerText) || (e.labels && e.labels[0]?.innerText) || e.innerText || e.value || e.getAttribute('title') || e.getAttribute('alt') || '';
    return {
      tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || undefined,
      name: label.trim().replace(/\s+/g, ' ').slice(0, 60),
      expanded: e.hasAttribute('aria-expanded') ? e.getAttribute('aria-expanded') : undefined,
      focusRing: ring, hidden, offscreen: offscreen || undefined,
      inside: insideSelector ? !!e.closest(insideSelector) : undefined,
    };
  }, insideSelector);
}
export const fmt = f => f.body ? 'BODY' : `${f.tag}${f.role ? `[${f.role}]` : ''} "${f.name}"${f.expanded !== undefined ? ` expanded=${f.expanded}` : ''}${f.focusRing ? '' : ' NO-FOCUS-RING'}${f.hidden ? ' HIDDEN' : ''}${f.offscreen ? ' OFFSCREEN' : ''}${f.inside === undefined ? '' : f.inside ? ' (inside)' : ' (outside)'}`;
