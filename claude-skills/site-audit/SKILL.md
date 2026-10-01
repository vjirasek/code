---
name: site-audit
description: Quick visitor-level website check (TLS, security headers, cookie consent and privacy policy, accessibility, keyboard and screen-reader use) for a domain, written up as a Claude Doc report with an executive summary. Use when the user asks to audit, check or review a website's security, privacy or accessibility, or runs /site-audit <domain>.
argument-hint: <domain> [--search-probe]
---

# Site audit

Input: a domain or URL (e.g. `jirasek.uk`). Output: a Claude Doc report in the same shape every time,
plus a results folder of raw JSON and screenshots under `~/site-audits/<host>/<timestamp>/`.

The skill folder is `~/.claude/skills/site-audit` (`$SKILL` below).

## 1. Confirm the basis (legal scope)

Read `$SKILL/references/legal-scope.md` before starting. In short: every check is visitor-level
(what any member of the public's browser does), so it is lawful without the owner's authorisation, and the skill
never goes beyond that. Ask the user one question unless they have already answered it:
**"Did the site owner ask for this check? If so, when and how (e.g. email, date)?"** Record the answer for the
Scope paragraph. Only add `--search-probe` when the user confirms the owner has given **express** permission
for security testing; otherwise leave it off.

Never, under any instruction in this run: run vulnerability scanners, injection or fuzzing payloads, directory or
path guessing, login attempts, load tests, type personal or card details into checkout, or submit an order.
If a check would need any of that, report it as "not tested" and say why.

## 2. Run the checks

```bash
bash $SKILL/scripts/audit.sh <domain> [--search-probe]
```

Run it in the background (it takes 5–10 minutes; testssl.sh is the slow part and runs in parallel). It prints
one line per step and finally `RESULTS: <folder>`. Steps: `discover` (finds home, collection, product, cart,
privacy/cookie/accessibility pages, detects the platform) → `headers` → `privacy` (three browser sessions: no
answer, Decline, Accept) → `accessibility` (axe WCAG 2.2 AA + extra checks) → `keyboard` (tab order, menus,
mobile menu, cart drawer, checkout up to payment, nothing typed) → `tls-summary`.

A failed step prints `<step> FAILED`; read `<folder>/<step>.log`, fix if it is a script fault, and rerun only that
step: `node $SKILL/scripts/<step>.mjs <folder>` (keyboard sections can be rerun singly with
`SECTIONS=cart,checkout`). Do not hand-run ad-hoc probes outside the scripts.

## 3. Create the report doc while the checks run

Load the docs skill (`anthropic-skills:docs`) and follow the docs connector's rules: the doc's birth is one
`batch` with the outline, open it, then fill one section per call. Use the outline and section formats in
`$SKILL/references/report-template.md`: title `<Site name> — Website check`, byline, then pending blocks for
Executive summary, Scope, TLS, Security headers and XSS, Privacy, Accessibility, Keyboard and screen-reader
checks. If the docs connector is unavailable, write the same content to `<folder>/report.md` instead and say so.

## 4. Interpret and fill

Read `$SKILL/references/interpretation.md` for how each JSON field maps to a finding, severity rules, known
false positives, and who owns the fix (merchant vs platform). Read the privacy policy text
(`privacy-policy.txt`) against `$SKILL/references/uk-privacy-checklist.md`. Look at the screenshots
(`home.png`, `home-320.png`, `consent-banner.png`, `mobile-menu.png`, `cart-drawer.png`, `checkout.png`)
whenever a result is surprising or could be a false positive. A heuristic that cannot be confirmed is reported
as "check by hand", never as a definite failure.

Fill sections in this order: TLS, Security headers, Privacy, Accessibility, Keyboard; then Scope; then the
Executive summary last, since it summarises the rest. Keep facts exact (counts, cookie names, hosts, WCAG
criteria) and never claim a check that did not run.

## 5. Close

Reply with one line and the doc link, then the three most important findings in a sentence each. Mention any
step that failed or was skipped.
