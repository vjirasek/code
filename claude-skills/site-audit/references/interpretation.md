# Interpreting the results

Severity scale used in every table: **High** (blocks a group of users or creates real legal or security
exposure), **Medium** (fails a standard and is noticeable), **Low** (best practice, cosmetic, or platform-owned).
Always say who can fix each item: the site owner, their theme developer, or the platform (Shopify, Wix and so on).

## TLS (`tls-summary.json`)

- Lead with `grade` and `score`; `gradeCaps` explains why the grade isn't higher.
- `problems`: MEDIUM+ are worth a line each; LOW items are grouped. Usual platform-owned items on hosted
  platforms: HSTS lifetime, BREACH (compression), LUCKY13 (CBC ciphers), SHA-1 signature algorithms
  advertised, OCSP stapling missing (Let's Encrypt retired OCSP, so this is not an issue). The owner's only
  usual lever is the **CAA record** (`caaRecords` empty, so recommend one, after checking which CAs the
  platform needs).
- Note good news worth stating: TLS 1.3, no TLS 1.0/1.1, forward secrecy, `postQuantum` (X25519MLKEM768), clean
  `vulnerabilities`.

## Security headers and XSS (`headers.json`)

- `csp[*].restrictsScripts=false` means the CSP has no `script-src`/`default-src`, so it does nothing against XSS
  even if a scanner marks it present. List `missing` and `deprecated`.
- `xXssProtection` present: a dead header (Chrome 78+ ignores it); Low.
- `hsts.maxAgeDays` < 180: Medium on the grading scheme, usually platform-owned.
- `home.thirdPartyScriptHosts`: scripts with full page access; `withIntegrity: 0` means no SRI pinning. Name the
  apps (Klaviyo, Reviews.io and so on); the owner controls these by choosing apps.
- Cookie flags: only flag cookies that look custom (not the platform's own) when Secure/HttpOnly are missing.
- `searchProbe`: `reflectedRaw: true` is a probable XSS, so report it as High and advise the owner privately,
  with no further probing. `reflectedEscaped` means it was handled correctly. Skipped means say "not tested".
- Shopify, Wix and Squarespace merchants cannot set response headers; frame recommendations as "raise with the
  platform" plus the meta-CSP caveat (it can't run report-only, and inline-script-heavy themes break).

## Privacy (`privacy.json`, `privacy-policy.txt`)

- `none` session: any `trackersContacted` or non-essential cookies before consent is a **PECR breach**, High.
  Distinguish trackers that set cookies (breach) from scripts that load but set none (Low: IP disclosure,
  disclose in the policy).
- `decline` session must match `none`. Anything extra after Decline is High.
- `accept`: list the cookies and tracker hosts. These are the recipients the policy must name.
- Banner: Accept and Decline at equal prominence on the first layer (ICO guidance). `banner.found=false` with
  trackers firing is High; with no trackers it is fine (no banner needed).
- Policy: check against `uk-privacy-checklist.md`. `policyHints` are pointers only; read the text.
- `cookiePolicy` null means no cookie list: Medium.

## Accessibility (`accessibility.json`)

- axe `violations`: map each to a row. Common ones: `color-contrast` (give ratio and colours from `summary`),
  `image-alt`, `target-size` (WCAG 2.2, 24×24 px), `label`, `link-name`, `button-name`, `aria-*`.
- Static checks: `h1` empty means High (no main heading); `skipLink` false means High; `media.autoplay` > 0, `carousels.autoAdvancing` (configured to auto-advance) or
  `carouselsMovingOnTheirOwn` (seen moving within 7 s) non-empty with `pauseButtons` 0 means High (WCAG 2.2.2).
  Report the real number of moving elements; `carousels.count` is all sliders, not moving ones; `images.genericAlt` and
  `linksWithAltDuplicatingText` (read twice by screen readers) are Medium/Low; `reflow320.horizontalScroll`
  is Medium (WCAG 1.4.10; confirm with `home-320.png` since scroll-reveal animations can cause false
  positives); `zoomBlocked` is High.
- `reducedMotionRules` > 0 is good news; state it.
- Always add: automated tools catch roughly a third of issues.

## Keyboard and screen reader (`keyboard.json`)

- `homeTabOrder`: `skipLinkFirst`; `noFocusRing` (heuristic; confirm visually before calling it a failure; the
  checkout fields and footer links often false-positive); `focusOnHiddenElement` (focus lands on invisible
  controls, Medium to High, rechecked after 1 s for scroll-reveal animations).
- `consentBanner.stops`: focus ring on each button, and where focus goes after Decline (BODY means a Low
  issue, owned by the platform if the banner is the platform's).
- `desktopMenus[]`: `tabsToFirstPanelLink` > 1 means the panel's links aren't next in tab order (Medium);
  `escapeCloses`; `panelStillOpenAfterFocusLeaves`; `panelSnapshot` showing names like "Shop Blends Shop
  Blends" means the image alt duplicates the link text. `hoverOnlySubmenus` > 0 with `hoverSubmenuOpensOnFocus`
  false means submenus are unreachable by keyboard (High).
- `mobileMenu`: focus not moved into the menu, `tabsToFirstMenuItem`, `escapeCloses`, `focusReturnedToButton`,
  `container.role` (should be dialog or nav with focus management).
- `cart`: the most important block. `focusInsideDrawerAfterAdd` false means High (users never reach the cart);
  `drawer.role` null and `ariaModal` null mean not exposed as a dialog; `focusContained` false or
  `shiftTabFromFirstStaysInside` false means focus escapes (High); `escapeCloses` false is Medium;
  `focusReturnedToTrigger` false is Medium; `liveRegionAnnouncement` empty means nothing announced (Medium);
  `headerCartControl.ariaExpanded` null on a button that opens a drawer is Low. `behaviour` "navigated to …" means
  a cart page, not a drawer, which is fine. Look at `cart-drawer.png`.
- `checkout`: on hosted platforms the checkout belongs to the platform, so report problems to it. Check
  `skipLink`, `h1`, `unlabelledFields` (ignore hidden technical fields such as `shop_pay_approval_id`),
  `payButtonReachable`.
- State plainly that no screen reader was listened to; the checks read the accessibility tree.
