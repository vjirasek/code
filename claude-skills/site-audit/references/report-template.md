# Report template (Claude Doc)

One tab. Title `<Site name> — Website check`. Byline: as-of date chip · author mention (the user).
Outline at birth = these pending blocks, in this order (intent text in brackets):

1. Executive summary (overall verdict, area table and priorities, written last)
2. Scope (basis for the check and its limits)
3. Encryption (TLS) (testssl.sh grade and findings)
4. Security headers and XSS (CSP, headers, third-party scripts)
5. Privacy (cookie consent sessions and privacy policy review)
6. Accessibility (axe WCAG 2.2 AA results and page checks)
7. Keyboard and screen-reader checks (menus, cart drawer, checkout)

## Section shapes

Every findings section (3–7) has the same shape:

```
## <Heading>

**<One-sentence verdict with the key number.>** <One sentence on how it was checked.>

| Severity | Issue | Where / who fixes |
| --- | --- | --- |
| High | … | … |

Already right: <one paragraph of things that pass, so the owner sees what not to touch>.
```

Sort rows High → Medium → Low. Rows say what is wrong, with a number, and the fix in a few words.
The Privacy section adds a consent table before the issues table:

```
| Banner state | Cookies set | Tracking hosts contacted |
| No answer | … | … |
| Decline | … | … |
| Accept | … | … |
```

## Executive summary

```
## Executive summary

**<Two-clause verdict: what is solid, and the most serious problem.>** <One sentence on urgency.>

<Scope paragraph goes in its own section; do not repeat it here.>

| Area | Verdict | Biggest issue |
| --- | --- | --- |
| Encryption (TLS) | <grade, score> | … |
| Security headers and XSS | … | … |
| Privacy | … | … |
| Accessibility | … | … |
| Keyboard and screen reader | … | … |

**Priorities**

1. **<Action>** (<owner>). <Why, in one sentence.>
…(5–6 items, most impactful first; legal exposure and blocked users first)

<One sentence listing platform-owned items to raise with the platform.>
```

Writing rules: British English, plain words, sentences under 25 words, no emoji, exact numbers and names,
no claims about checks that did not run (say "not tested: <reason>").
