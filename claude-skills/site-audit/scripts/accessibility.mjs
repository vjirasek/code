// axe-core WCAG 2.2 AA scan on the key pages, plus checks axe does not make:
// h1 and heading order, skip link, alt text quality, autoplaying media and carousels,
// reduced-motion support, and reflow at 320 px.
import path from 'path';
import AxeBuilder from '@axe-core/playwright';
import { outDir, writeJson, readJson, launch, newContext, goto, clickConsent } from './lib.mjs';

const dir = outDir();
const { pages } = readJson(dir, 'pages.json');
const browser = await launch();
const ctx = await newContext(browser);
const page = await ctx.newPage();
await goto(page, pages.home);
await clickConsent(page, 'decline');

const result = { axe: {}, home: {}, product: {} };
for (const k of ['home', 'collection', 'product', 'cart', 'privacy']) {
  if (!pages[k]) continue;
  const r = await goto(page, pages[k], 2000);
  if (!r.ok) { result.axe[k] = { url: pages[k], error: r.error }; continue; }
  try {
    const a = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    result.axe[k] = {
      url: pages[k],
      violations: a.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, wcag: v.tags.filter(t => /^wcag\d/.test(t)), count: v.nodes.length,
        examples: v.nodes.slice(0, 4).map(n => ({ target: n.target.join(' '), summary: (n.failureSummary || '').split('\n').slice(1, 2).join(' ').trim().slice(0, 200) })) })),
      incompleteNeedsReview: a.incomplete.map(v => `${v.id} (${v.nodes.length})`),
    };
  } catch (e) { result.axe[k] = { url: pages[k], error: e.message.split('\n')[0] }; }
  if (k === 'home' || k === 'product') result[k] = await staticChecks();
  if (k === 'home') result.home.carouselsMovingOnTheirOwn = await page.evaluate(async () => {
    const roots = [...document.querySelectorAll('.swiper-wrapper, .slick-track, .splide__list, .flickity-slider, .glide__slides, [class*="carousel" i] [class*="track" i]')].filter(e => e.getBoundingClientRect().height > 0);
    const snap = () => roots.map(e => e.style.transform + '|' + e.scrollLeft + '|' + (e.querySelector('.swiper-slide-active, .slick-current, .is-active')?.innerText || '').slice(0, 30));
    const a = snap(); await new Promise(r => setTimeout(r, 7000)); const b = snap();
    return roots.filter((e, i) => a[i] !== b[i]).map(e => `${e.parentElement.className.toString().slice(0, 50)}`);
  });
  if (k === 'home') await page.screenshot({ path: path.join(dir, 'home.png') });
}

async function staticChecks() {
  return page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')].filter(vis).map(h => ({ level: +(h.getAttribute('aria-level') || h.tagName[1]), text: h.innerText.trim().replace(/\s+/g, ' ').slice(0, 70) }));
    const skips = []; for (let i = 1; i < headings.length; i++) if (headings[i].level > headings[i - 1].level + 1) skips.push(`h${headings[i - 1].level} -> h${headings[i].level} at "${headings[i].text}"`);
    const imgs = [...document.querySelectorAll('img')];
    const GENERIC = /^(image|img|photo|picture|display image|banner|logo|graphic|icon|untitled|placeholder|thumbnail)$|\.(jpe?g|png|webp|gif|svg)$|^[\w-]*\d{3,}[\w-]*$|^[a-z0-9]+(-[a-z0-9]+){2,}$/i;
    const altCounts = {}; imgs.forEach(i => { const a = i.getAttribute('alt'); if (a) altCounts[a] = (altCounts[a] || 0) + 1; });
    const links = [...document.querySelectorAll('a[href]')];
    const dupNames = links.filter(a => { const img = a.querySelector('img[alt]'); const alt = img?.getAttribute('alt')?.trim(); const txt = a.innerText.trim(); return alt && txt && txt.toLowerCase().includes(alt.toLowerCase()); }).length;
    const videos = [...document.querySelectorAll('video')];
    const carousels = [...document.querySelectorAll('.swiper, .slick-slider, .splide, .flickity-enabled, .glide, [class*="carousel" i], [class*="slider" i], [data-autoplay], [autoplay]:not(video)')];
    const carouselRoots = carousels.filter(e => !carousels.some(o => o !== e && o.contains(e)) && e.getBoundingClientRect().height > 40);
    let reducedMotion = 0, sheetsBlocked = 0;
    for (const s of document.styleSheets) { try { for (const r of s.cssRules) if (r.media && /prefers-reduced-motion/.test(r.media.mediaText)) reducedMotion++; } catch { sheetsBlocked++; } }
    const vp = document.querySelector('meta[name=viewport]')?.content || null;
    const genericLinks = links.map(a => a.innerText.trim().toLowerCase()).filter(t => /^(click here|here|read more|more|learn more|find out more|link)$/.test(t));
    return {
      lang: document.documentElement.lang || null, title: document.title, viewport: vp,
      zoomBlocked: !!vp && (/user-scalable\s*=\s*(no|0)/i.test(vp) || /maximum-scale\s*=\s*(1(\.0)?|0\.\d+)\b/i.test(vp)),
      h1: headings.filter(h => h.level === 1).map(h => h.text), headings: headings.slice(0, 25), headingSkips: skips,
      landmarks: { main: !!document.querySelector('main,[role=main]'), nav: document.querySelectorAll('nav,[role=navigation]').length, header: !!document.querySelector('header,[role=banner]'), footer: !!document.querySelector('footer,[role=contentinfo]') },
      skipLink: [...document.querySelectorAll('a[href^="#"]')].some(a => /skip/i.test(a.innerText + (a.getAttribute('aria-label') || ''))),
      images: { total: imgs.length, missingAlt: imgs.filter(i => !i.hasAttribute('alt')).map(i => (i.currentSrc || i.src).split('?')[0].split('/').pop()).slice(0, 10), missingAltCount: imgs.filter(i => !i.hasAttribute('alt')).length, emptyAlt: imgs.filter(i => i.getAttribute('alt') === '').length,
        genericAlt: Object.entries(altCounts).filter(([a]) => GENERIC.test(a.trim())).map(([a, n]) => `${a} (${n})`) },
      linksWithAltDuplicatingText: dupNames, genericLinkText: genericLinks,
      media: { videos: videos.length, autoplay: videos.filter(v => v.autoplay).length, autoplayWithControls: videos.filter(v => v.autoplay && v.controls).length, withCaptions: videos.filter(v => v.querySelector('track[kind=captions],track[kind=subtitles]')).length, audioAutoplay: [...document.querySelectorAll('audio[autoplay]')].length },
      carousels: { count: carouselRoots.length, autoAdvancing: [...document.querySelectorAll('[data-autoplay]:not([data-autoplay=false]):not([data-autoplay="0"]),[autoplay]:not(video):not(audio),[data-interval],[data-autoplay-speed]')].filter(vis).map(e => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join('.')} ${[...e.attributes].filter(a => /autoplay|interval|speed/.test(a.name)).map(a => a.name + '=' + a.value).join(' ')}`), pauseButtons: document.querySelectorAll('button[aria-label*="pause" i], button[aria-label*="stop" i], button[title*="pause" i]').length },
      reducedMotionRules: reducedMotion, stylesheetsUnreadable: sheetsBlocked,
      positiveTabindex: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex^="-"])').length,
    };
  });
}

// Reflow at 320 px (WCAG 1.4.10)
const m = await newContext(browser, { viewport: { width: 320, height: 640 } });
const mp = await m.newPage();
await goto(mp, pages.home, 3000);
await clickConsent(mp, 'decline');
await mp.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); });
await mp.waitForTimeout(1500);
result.reflow320 = await mp.evaluate(() => {
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect(); if (r.right <= 322 || r.width === 0) continue;
    const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.position === 'fixed') continue;
    let clipped = false; for (let a = e.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o !== 'visible') { clipped = true; break; } }
    if (!clipped) out.push(`${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 3).join('.')} right=${Math.round(r.right)}`);
  }
  return { scrollWidth: document.documentElement.scrollWidth, horizontalScroll: document.documentElement.scrollWidth > 321, culprits: out.slice(0, 6) };
});
await mp.screenshot({ path: path.join(dir, 'home-320.png') });
await browser.close();
writeJson(dir, 'accessibility.json', result);
console.log('accessibility ok:', Object.entries(result.axe).map(([k, v]) => `${k}=${v.violations ? v.violations.length : 'ERR'}`).join(' '));
