# Mortgage Suite — LOS layer

The income calculator and the renovation suite in one file, with a loan-origination
style shell over the top: named left navigation, subtabs, three themes, continuous
income sync, a scenario workbench and material-change autosave.

**The two calculation engines are not modified.** Everything in this repository adds a
presentation and coordination layer on top of them, so the engines can be rebuilt from
their own sources at any time and the layer re-applied.

## Layout

```
src/
  mortgage-suite-allinone.html   the merged engines — treat as generated, do not hand-edit
  patch.css                      shell: fonts, money numerals, navy theme, left nav
  patch-reno.css                 renovation suite skin
  patch.js                       navigation, subtabs, sync, scenarios, MI, autosave
build/
  inject.py                      applies the layer to src/ and writes dist/
  verify_los.py                  Playwright harness, 33 behavioural checks
dist/
  mortgage-suite-los.html        the file you open — self-contained, works from file://
```

## Build

```bash
python3 build/inject.py                       # src/ -> dist/
python3 build/verify_los.py                   # 33 checks, writes build/shots/
```

`inject.py` is idempotent: it strips any layer already present before applying a fresh
one, so it can be re-run against its own output without doubling up.

If either engine changes, regenerate `src/mortgage-suite-allinone.html` through the
merge assembler first, then re-run `inject.py`. Never hand-edit the merged file.

## What the layer does

**Navigation** — 21 named nav items grouped into Income calculator, Renovation suite and
Scenarios & transfer, each carrying its live figure. Both engines' horizontal tab strips
are hidden. Each tab also gets an in-page sticky strip listing the sections genuinely
rendered on that screen, plus *Expand all*, so the renovation tabs read as long scrolling
pages. Subtabs are discovered from the DOM rather than declared, so a screen that gains a
section gains a subtab without any change here.

**Themes** — light, dark and navy. Navy rides on `data-theme="dark"` so every existing
dark rule still applies and only the token values change. A `MutationObserver`
re-asserts the skin whenever either engine writes `data-theme` on its own schedule.

**Income sync** — every settled `RECALC` is pushed into the active suite scenario through
`store.importIncomeText`, the same importer the manual button uses, so there is no second
mapping to keep in step. Debounced, and can be turned off.

**Program switch** — FHA and Conventional mortgage insurance never both apply, so leaving
a stale override behind quietly changes the payment when the program flips back. The
opposite program's override is cleared, a credit score is ensured before PMI can be
priced, and the change in MI, rate and payment is reported.

**Scenarios** — naming convention `Lastname · Program · down % · rate · MM-DD`, with
duplicates taking the next free letter. The workbench does open, duplicate, rename,
delete, versions, autosaves, and a comparison across up to four scenarios with
best-value highlighting and a payment delta row.

**Autosave** — triggers only on note rate, loan amount, purchase price, down payment,
renovation budget or loan program, and writes only when you leave the tab. Last ten
saves are kept in `localStorage`.

## Notes

- Fonts load from Google Fonts. For a fully offline `file://` deployment they need
  embedding, or the fallback stack in `patch.css` takes over.
- `verify_los.py` needs `playwright` and a Chromium build:
  `pip install playwright && playwright install chromium`.
- The engines declare their globals with `const`, which never become properties of
  `window`. `patch.js` resolves them through the scope chain instead — see `G()`.
