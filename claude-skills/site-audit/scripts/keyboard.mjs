// Keyboard-only and screen-reader-semantics checks: tab order and focus visibility, desktop
// menus, mobile menu, add-to-cart and cart drawer, and checkout up to the payment step.
// Checkout is only tabbed through: nothing is typed and nothing is submitted.
import path from 'path';
import { outDir, writeJson, readJson, launch, newContext, goto, clickConsent, detectConsent, markFocusables, focusInfo, fmt, MOBILE, isFirstParty } from './lib.mjs';

const dir = outDir();
const { pages, baseDomain: base, platform } = readJson(dir, 'pages.json');
const browser = await launch();
const result = { platform };
const press = async (page, key, n = 1, wait = 60) => { for (let i = 0; i < n; i++) { await page.keyboard.press(key); await page.waitForTimeout(wait); } };
const blur = page => page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
const ONLY = process.env.SECTIONS ? process.env.SECTIONS.split(',') : null;
async function section(name, fn) {
  if (ONLY && !ONLY.includes(name)) return;
  try { result[name] = await fn(); } catch (e) { result[name] = { error: e.message.split('\n')[0] }; }
  console.log(`keyboard: ${name} done`);
}

// Marks links/buttons that are currently visible; used to spot what a control reveals.
const markVisible = (page, attr) => page.evaluate(attr => {
  document.querySelectorAll('a[href],button,input,select,[tabindex]').forEach(e => {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    if (r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && r.right > 0 && r.left < innerWidth) e.setAttribute(attr, '1');
  });
}, attr);
const markNewlyVisible = (page, beforeAttr, newAttr) => page.evaluate(([b, n]) => {
  let c = 0;
  document.querySelectorAll('a[href],button,input,select').forEach(e => {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    let hidden = s.visibility === 'hidden' || parseFloat(s.opacity) === 0;
    for (let a = e.parentElement; a && !hidden; a = a.parentElement) { const as = getComputedStyle(a); if (as.visibility === 'hidden' || parseFloat(as.opacity) === 0) hidden = true; }
    if (!e.hasAttribute(b) && r.width > 0 && r.height > 0 && !hidden && r.right > 0 && r.left < innerWidth) { e.setAttribute(n, '1'); c++; }
  });
  return c;
}, [beforeAttr, newAttr]);
async function tabsUntil(page, selector, max = 40) {
  for (let i = 1; i <= max; i++) {
    await press(page, 'Tab', 1, 40);
    if (await page.evaluate(s => !!document.activeElement?.closest(s), selector)) return { tabs: i, at: fmt(await focusInfo(page)) };
  }
  return { tabs: null, at: fmt(await focusInfo(page)) };
}

// ---- A. Tab order and focus visibility on the home page -------------------------------------
await section('homeTabOrder', async () => {
  const ctx = await newContext(browser); const page = await ctx.newPage();
  await goto(page, pages.home);
  const banner = await detectConsent(page);
  let bannerStops = [];
  if (banner.found) {
    await markFocusables(page); await blur(page);
    for (let i = 0; i < 4; i++) { await press(page, 'Tab'); bannerStops.push(fmt(await focusInfo(page))); }
    await clickConsent(page, 'decline');
    bannerStops.push('after decline -> ' + fmt(await focusInfo(page)));
  }
  await page.waitForTimeout(800); await markFocusables(page); await blur(page);
  const stops = []; const seen = new Set();
  for (let i = 0; i < 150; i++) {
    await press(page, 'Tab', 1, 35);
    let f = await focusInfo(page);
    if (f.hidden || !f.focusRing) { await page.waitForTimeout(1000); f = await focusInfo(page); } // scroll-reveal animations
    const key = await page.evaluate(() => { const e = document.activeElement; if (!e.dataset.saIdx) e.dataset.saIdx = Math.random().toString(36).slice(2); return e.dataset.saIdx; });
    if (f.body || seen.has(key)) break;
    seen.add(key); stops.push(f);
  }
  await ctx.close();
  return {
    consentBanner: banner.found ? { cmp: banner.cmp, stops: bannerStops } : 'no banner detected',
    firstStops: stops.slice(0, 12).map(fmt),
    skipLinkFirst: stops.slice(0, 2).some(s => /skip/i.test(s.name)),
    totalStops: stops.length,
    noFocusRing: stops.filter(s => !s.focusRing).map(fmt).slice(0, 15),
    noFocusRingCount: stops.filter(s => !s.focusRing).length,
    focusOnHiddenElement: stops.filter(s => s.hidden).map(fmt).slice(0, 15),
    focusOnHiddenCount: stops.filter(s => s.hidden).length,
    unnamed: stops.filter(s => !s.name).map(fmt).slice(0, 10),
  };
});

// ---- B. Desktop menus ------------------------------------------------------------------------
await section('desktopMenus', async () => {
  const ctx = await newContext(browser); const page = await ctx.newPage();
  await goto(page, pages.home); await clickConsent(page, 'decline');
  const triggers = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('header [aria-expanded], nav [aria-expanded], [role=banner] [aria-expanded]').forEach(e => {
      const r = e.getBoundingClientRect();
      const label = (e.getAttribute('aria-label') || e.innerText || '').trim();
      if (r.width > 0 && r.height > 0 && !/search|cart|basket|bag|account|menu$/i.test(label) && out.length < 4) { e.dataset.saTrigger = String(out.length); out.push(label.slice(0, 40)); }
    });
    return out;
  });
  const menus = [];
  for (let i = 0; i < triggers.length; i++) {
    await goto(page, pages.home, 1200);
    await page.evaluate(i => { let n = 0; document.querySelectorAll('header [aria-expanded], nav [aria-expanded], [role=banner] [aria-expanded]').forEach(e => { const r = e.getBoundingClientRect(); const l = (e.getAttribute('aria-label') || e.innerText || '').trim(); if (r.width > 0 && r.height > 0 && !/search|cart|basket|bag|account|menu$/i.test(l)) { if (n === i) e.dataset.saT = '1'; n++; } }); }, i);
    const t = page.locator('[data-sa-t]').first();
    await markVisible(page, 'data-sa-before');
    await t.focus(); await press(page, 'Enter', 1, 700);
    const revealed = await markNewlyVisible(page, 'data-sa-before', 'data-sa-panel');
    const m = { trigger: triggers[i], expandedAfterEnter: await t.getAttribute('aria-expanded'), controls: await t.getAttribute('aria-controls'), linksRevealed: revealed };
    if (revealed) {
      const reach = await tabsUntil(page, '[data-sa-panel]', 30);
      m.tabsToFirstPanelLink = reach.tabs; m.firstPanelStop = reach.at;
      m.panelSnapshot = (await page.locator('[data-sa-panel]').first().locator('xpath=..').ariaSnapshot().catch(() => '')).slice(0, 400);
      await press(page, 'Tab', 15, 30);
      m.panelStillOpenAfterFocusLeaves = await page.locator('[data-sa-panel]').first().isVisible().catch(() => false) && !(await page.evaluate(() => !!document.activeElement.closest('[data-sa-panel]')));
    }
    await t.focus(); if ((await t.getAttribute('aria-expanded')) !== 'true') await press(page, 'Enter', 1, 500);
    await press(page, 'Escape', 1, 500);
    m.escapeCloses = (await t.getAttribute('aria-expanded')) === 'false';
    m.focusAfterEscape = fmt(await focusInfo(page));
    menus.push(m);
  }
  // Menus with hidden sub-links but no aria-expanded control (hover-only menus)
  await goto(page, pages.home, 1000);
  const hoverOnly = await page.evaluate(() => {
    const items = [...document.querySelectorAll('header nav li, nav li')].filter(li => !li.querySelector('[aria-expanded]') && li.querySelector(':scope > ul, :scope > div'));
    const hiddenSub = items.filter(li => [...li.querySelectorAll(':scope > ul a, :scope > div a')].some(a => { const r = a.getBoundingClientRect(); return r.width === 0 || getComputedStyle(a).visibility === 'hidden'; }));
    hiddenSub.slice(0, 1).forEach(li => li.querySelector('a')?.setAttribute('data-sa-hover', '1'));
    return hiddenSub.length;
  });
  let hoverOpensOnFocus = null;
  if (hoverOnly) { await page.locator('[data-sa-hover]').focus(); await page.waitForTimeout(400); hoverOpensOnFocus = await page.evaluate(() => { const li = document.querySelector('[data-sa-hover]').closest('li'); return [...li.querySelectorAll(':scope > ul a, :scope > div a')].some(a => a.getBoundingClientRect().width > 0 && getComputedStyle(a).visibility !== 'hidden'); }); }
  await ctx.close();
  return { menus, hoverOnlySubmenus: hoverOnly, hoverSubmenuOpensOnFocus: hoverOpensOnFocus };
});

// ---- C. Mobile menu --------------------------------------------------------------------------
await section('mobileMenu', async () => {
  const ctx = await newContext(browser, { viewport: MOBILE, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
  await goto(page, pages.home); await clickConsent(page, 'decline');
  const found = await page.evaluate(() => {
    const c = [...document.querySelectorAll('button, [role=button], a[href="#"], summary')].find(e => {
      const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.top > 200) return false;
      const s = `${e.getAttribute('aria-label') || ''} ${e.innerText || ''} ${e.className} ${e.getAttribute('aria-controls') || ''}`;
      return /menu|burger|hamburger|nav-?toggle|navigation|drawer/i.test(s) && !/cart|search|account/i.test(s);
    });
    if (c) c.dataset.saBurger = '1';
    return c ? { tag: c.tagName.toLowerCase(), name: (c.getAttribute('aria-label') || c.innerText || '').trim(), expanded: c.getAttribute('aria-expanded'), controls: c.getAttribute('aria-controls') } : null;
  });
  if (!found) { await ctx.close(); return { tested: false, reason: 'no menu button found at 390 px' }; }
  const b = page.locator('[data-sa-burger]');
  await markVisible(page, 'data-sa-before');
  await b.focus(); await press(page, 'Enter', 1, 900);
  const revealed = await markNewlyVisible(page, 'data-sa-before', 'data-sa-panel');
  const r = { button: found, expandedAfterOpen: await b.getAttribute('aria-expanded'), focusAfterOpen: fmt(await focusInfo(page)), linksRevealed: revealed };
  r.container = await page.evaluate(() => {
    const ctl = document.querySelector('[data-sa-burger]').getAttribute('aria-controls');
    const el = (ctl && document.getElementById(ctl)) || document.querySelector('[data-sa-panel]')?.closest('[role=dialog], dialog, nav, [class*=drawer], [class*=menu]');
    return el ? { tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), ariaModal: el.getAttribute('aria-modal'), name: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') } : null;
  });
  await page.screenshot({ path: path.join(dir, 'mobile-menu.png') });
  if (revealed) { const reach = await tabsUntil(page, '[data-sa-panel]', 40); r.tabsToFirstMenuItem = reach.tabs; r.firstMenuStop = reach.at; }
  await press(page, 'Escape', 1, 700);
  r.escapeCloses = (await b.getAttribute('aria-expanded')) === 'false' || !(await page.locator('[data-sa-panel]').first().isVisible().catch(() => false));
  r.focusAfterEscape = fmt(await focusInfo(page));
  r.focusReturnedToButton = await page.evaluate(() => document.activeElement?.hasAttribute('data-sa-burger'));
  await ctx.close();
  return r;
});

// ---- D. Add to cart and cart drawer, then E. checkout ----------------------------------------
const cartCtx = await newContext(browser);
await section('cart', async () => {
  if (!pages.product) return { tested: false, reason: 'no product page found' };
  const page = await cartCtx.newPage();
  await goto(page, pages.product); await clickConsent(page, 'decline');
  const add = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('form[action*="/cart/add"] [type=submit], button[name=add], .single_add_to_cart_button, button, input[type=submit]')];
    const label = e => (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
    // The main product button: visible, labelled "add to …", not a quick-add/upsell copy; largest wins.
    const b = cands.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled && /add to (cart|bag|basket)|buy now/i.test(label(e)) && !e.closest('[class*="quick" i],[class*="upsell" i],[class*="recommend" i],[class*="related" i]'); })
      .sort((x, y) => y.getBoundingClientRect().width * y.getBoundingClientRect().height - x.getBoundingClientRect().width * x.getBoundingClientRect().height)[0];
    if (b) b.dataset.saAdd = '1';
    return b ? label(b) || '(unlabelled button)' : null;
  });
  if (!add) return { tested: false, reason: 'no add-to-cart button found on product page' };
  const r = { product: pages.product, addButton: add };
  await markFocusables(page);
  // Snapshot live regions and large fixed panels before adding.
  const liveBefore = await page.evaluate(() => [...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map(e => e.innerText.trim()));
  await page.evaluate(() => document.querySelectorAll('body *').forEach(e => { const s = getComputedStyle(e); const rc = e.getBoundingClientRect(); if ((s.position === 'fixed' || e.matches('dialog[open]')) && rc.width > 250 && rc.height > 300 && s.visibility !== 'hidden' && rc.left < innerWidth && rc.right > 0) e.dataset.saPre = '1'; }));
  const urlBefore = page.url();
  await page.locator('[data-sa-add]').focus(); await press(page, 'Enter', 1, 3000);
  r.focusAfterAdd = fmt(await focusInfo(page));
  const liveAfter = await page.evaluate(() => [...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map(e => e.innerText.trim()));
  // Ignore rotating announcement bars and carousels; keep messages about the cart.
  r.liveRegionAnnouncement = liveAfter.filter(t => t && !liveBefore.includes(t) && /added|cart|bag|basket|item/i.test(t) && !/free (shipping|delivery)|dispatch/i.test(t)).map(t => t.slice(0, 80));
  if (page.url() !== urlBefore) { r.behaviour = `navigated to ${page.url()}`; return r; }
  const drawer = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('body *')].filter(e => { if (e.dataset.saPre || e.closest('[data-sa-pre]')) return false; const s = getComputedStyle(e); const rc = e.getBoundingClientRect(); return (s.position === 'fixed' || e.matches('dialog[open],[role=dialog],[aria-modal=true]')) && rc.width > 250 && rc.height > 300 && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0 && rc.left < innerWidth && rc.right > 0 && e.querySelector('a,button'); });
    const pref = cands.find(e => /cart|drawer|basket|bag|minicart|modal|dialog/i.test(`${e.id} ${e.className} ${e.getAttribute('role')}`)) || cands[0];
    if (!pref) return null;
    pref.dataset.saDrawer = '1';
    const named = pref.closest('[role=dialog],dialog,[aria-modal]') || pref;
    return { element: `${pref.tagName.toLowerCase()}#${pref.id}.${[...pref.classList].slice(0, 3).join('.')}`, role: named.getAttribute('role') || (named.tagName === 'DIALOG' ? 'dialog (element)' : null), ariaModal: named.getAttribute('aria-modal'), name: named.getAttribute('aria-label') || named.getAttribute('aria-labelledby'), inertBackground: !!document.querySelector('[inert]') };
  });
  if (!drawer) { r.behaviour = 'no drawer or page change detected (check screenshot cart-after-add.png)'; await page.screenshot({ path: path.join(dir, 'cart-after-add.png') }); return r; }
  r.behaviour = 'drawer opened'; r.drawer = drawer;
  await page.screenshot({ path: path.join(dir, 'cart-drawer.png') });
  const D = '[data-sa-drawer]';
  r.focusInsideDrawerAfterAdd = await page.evaluate(D => !!document.activeElement?.closest(D), D);
  r.drawerSnapshot = (await page.locator(D).ariaSnapshot().catch(() => '')).slice(0, 1500);
  // Containment: start on the first control in the drawer and Tab forward, then Shift+Tab back.
  const first = page.locator(`${D} a[href], ${D} button, ${D} input, ${D} select`).first();
  await first.focus();
  let leftAfter = null;
  for (let i = 1; i <= 60; i++) { await press(page, 'Tab', 1, 30); if (!(await page.evaluate(D => !!document.activeElement?.closest(D), D))) { leftAfter = i; break; } }
  r.tabLeavesDrawerAfter = leftAfter; r.focusContained = leftAfter === null;
  await first.focus(); await press(page, 'Shift+Tab', 1, 100);
  r.shiftTabFromFirstStaysInside = await page.evaluate(D => !!document.activeElement?.closest(D), D);
  await first.focus(); await press(page, 'Escape', 1, 800);
  const open = () => page.evaluate(D => { const e = document.querySelector(D); if (!e) return false; const rc = e.getBoundingClientRect(); const s = getComputedStyle(e); return rc.left < innerWidth - 40 && rc.right > 40 && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0; }, D);
  r.escapeCloses = !(await open());
  if (await open()) {
    const close = page.locator(`${D} button, ${D} [role=button], ${D} a`).filter({ hasText: /close|×|✕/i }).or(page.locator(`${D} [aria-label*="close" i]`)).first();
    if (await close.count()) {
      r.closeButton = (await close.getAttribute('aria-label')) || (await close.innerText());
      await close.focus(); await press(page, 'Enter', 1, 900);
      r.closedByButton = !(await open());
      r.focusAfterClose = fmt(await focusInfo(page));
      r.focusReturnedToTrigger = await page.evaluate(() => !!document.activeElement?.hasAttribute('data-sa-add'));
    } else r.closeButton = null;
  } else { r.focusAfterClose = fmt(await focusInfo(page)); r.focusReturnedToTrigger = await page.evaluate(() => !!document.activeElement?.hasAttribute('data-sa-add')); }
  // Header cart button
  const cartBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('header button, header [role=button], header a')].find(e => /cart|basket|bag/i.test(`${e.getAttribute('aria-label') || ''} ${e.innerText} ${e.className}`) && e.getBoundingClientRect().width > 0);
    if (b) b.dataset.saCartBtn = '1';
    return b ? { tag: b.tagName.toLowerCase(), name: (b.getAttribute('aria-label') || b.innerText).trim(), ariaExpanded: b.getAttribute('aria-expanded'), ariaControls: b.getAttribute('aria-controls'), href: b.getAttribute('href') } : null;
  });
  r.headerCartControl = cartBtn;
  if (cartBtn && cartBtn.tag !== 'a') {
    await page.locator('[data-sa-cart-btn]').focus(); await press(page, 'Enter', 1, 1500);
    r.headerCartOpensDrawer = await open();
    r.focusAfterHeaderCartOpen = fmt(await focusInfo(page, D));
    await press(page, 'Escape', 1, 600);
  }
  await page.close();
  return r;
});

await section('checkout', async () => {
  if (!pages.cart) return { tested: false, reason: 'no cart page found' };
  const page = await cartCtx.newPage();
  await goto(page, pages.cart);
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[name=checkout], input[name=checkout], a[href*="checkout"], button, [role=button]')].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && /check ?out/i.test(e.innerText || e.value || e.getAttribute('aria-label') || ''); });
    if (b) b.dataset.saCheckout = '1';
    return b ? (b.innerText || b.value).trim() : null;
  });
  if (!btn) return { tested: false, reason: 'cart empty or no checkout button (add-to-cart may have failed)' };
  await page.locator('[data-sa-checkout]').focus(); await page.keyboard.press('Enter');
  await page.waitForLoadState('load').catch(() => {}); await page.waitForTimeout(8000);
  const url = new URL(page.url());
  const r = { button: btn, url: url.origin + url.pathname.slice(0, 40), sameSite: isFirstParty(url.hostname, base) };
  if (/login|signin|authentication/i.test(url.pathname)) { r.note = 'checkout requires sign-in; stopped'; return r; }
  await page.screenshot({ path: path.join(dir, 'checkout.png') });
  Object.assign(r, await page.evaluate(() => ({
    title: document.title, lang: document.documentElement.lang,
    h1: [...document.querySelectorAll('h1')].filter(h => h.getBoundingClientRect().height > 0).map(h => h.innerText.trim()),
    main: !!document.querySelector('main,[role=main]'),
    skipLink: [...document.querySelectorAll('a')].some(a => /skip/i.test(a.innerText)),
    fields: [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(e => e.offsetParent).map(e => {
      const label = (e.labels?.[0]?.innerText || e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.innerText) || '').trim();
      return { name: e.name || e.id, label: label.slice(0, 40) || null, autocomplete: e.getAttribute('autocomplete'), placeholderOnly: !label && !!e.placeholder };
    }).slice(0, 30),
  })));
  r.unlabelledFields = r.fields.filter(f => !f.label).map(f => f.name);
  await markFocusables(page); await blur(page);
  const stops = [];
  for (let i = 0; i < 60; i++) { await press(page, 'Tab', 1, 50); const f = await focusInfo(page); if (f.body && stops.length) break; stops.push(f); } // Tab only; nothing typed.
  r.tabStops = stops.map(fmt);
  r.payButtonReachable = stops.some(s => /pay now|place order|complete order|pay £|buy now/i.test(s.name));
  r.noFocusRing = stops.filter(s => !s.focusRing && s.tag !== 'iframe').map(fmt);
  await page.close();
  return r;
});
await browser.close();
writeJson(dir, 'keyboard.json', result);
console.log('keyboard ok');
