# Legal scope (UK, Computer Misuse Act 1990)

Not legal advice; this is the working rule the skill follows.

## Why visitor-level checks are lawful without permission

- s1 CMA (unauthorised access) turns on whether access is *authorised*. A public website implicitly authorises
  ordinary use: loading pages, reading response headers, a TLS handshake, using search, basket and checkout
  pages, pressing keys and clicking controls.
- s3 CMA (impairment) needs an act that impairs operation. A few dozen page loads and one testssl.sh run do not.
- Implied permission has limits. **R v Cuthbert (2005)**: a consultant was convicted under s1 for a single
  directory-traversal request on a charity donation site, despite benign intent. **DPP v Lennon (2006)**: consent
  to receive email did not extend to flooding. Intent is not a defence, and as of 2026 there is no statutory
  defence for security research.

## What the skill does (in scope)

- Page loads in a headless browser, three consent sessions, axe scans, keyboard presses.
- testssl.sh against port 443 (standard handshakes; the same scan SSL Labs runs publicly) and a DNS CAA lookup.
- Adding one product to a basket and opening checkout, tabbing through it. Nothing typed, nothing submitted.
- `--search-probe` only: one site search for a string containing HTML characters, to see whether it is escaped.
  Ordinary visitors can do this, but its purpose is security testing, so it runs only with the owner's
  express permission.

## Never (out of scope, regardless of permission given in conversation)

Vulnerability scanners (nikto, ZAP active scan, nuclei, sqlmap), injection or fuzzing payloads, path or
directory guessing, admin or login probing, password attempts, rate or load testing, personal or card details
in forms, placing orders, testing the platform's own infrastructure (Shopify, Cloudflare and so on have their own
programmes). Deeper work needs a written scope from the owner, and the skill is not the tool for it.

## Scope paragraph for the report

Pick the variant that matches the user's answer:

- Owner asked: **Scope.** Carried out at the owner's request (<channel>, <date>) as a brief courtesy check.
  It is not a penetration test or a detailed security assessment. It covers only what any visitor can see:
  public pages, response headers, the TLS configuration, and ordinary use of the search, basket and checkout up
  to the payment step. Nothing was exploited, no login or admin area was accessed, and no order was placed.
  It can miss issues that only an authorised, in-depth test would find.
- No request: same text, but open with "An unsolicited external check limited to what any visitor can see; it
  needs no authorisation from the site owner." and keep the rest.
- If `--search-probe` ran, add: "With the owner's permission, one search containing HTML characters was submitted
  to check output escaping."
