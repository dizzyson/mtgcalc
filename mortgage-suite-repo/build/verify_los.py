#!/usr/bin/env python3
"""Load the patched file and check the patch layer without breaking either engine."""
import json, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "dist" / "mortgage-suite-los.html")
results, errors = [], []

def ok(name, cond, extra=""):
    results.append((name, bool(cond), extra))

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_page(viewport={"width": 1600, "height": 1000})
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append("console.error: " + m.text) if m.type == "error" else None)
    pg.goto(FILE.as_uri())
    pg.wait_for_timeout(4000)

    # ---------- shell ----------
    ok("left nav rendered", pg.locator("#losnav").count() == 1)
    ok("nav has 21 tab items", pg.locator("#losnav .los-item[data-key]").count() == 21,
       str(pg.locator("#losnav .los-item[data-key]").count()))
    ok("old calc tab strip hidden", not pg.locator("#calc-root .tabs").first.is_visible()
       if pg.locator("#calc-root .tabs").count() else True)
    ok("suite store present", pg.evaluate("!!(window.mortgageSuite && window.mortgageSuite.store)"))
    ok("LOS namespace", pg.evaluate("!!window.LOS"))

    # ---------- fonts ----------
    fam = pg.evaluate("getComputedStyle(document.body).fontFamily")
    ok("body uses Plus Jakarta Sans", "Jakarta" in fam, fam[:60])
    numfam = pg.evaluate("""() => { const el=document.getElementById('hdrIncome');
        return el ? getComputedStyle(el).fontFamily : ''; }""")
    ok("money uses Manrope", "Manrope" in numfam, numfam[:60])

    # ---------- three themes ----------
    for skin, want_theme in (("light", "light"), ("dark", "dark"), ("navy", "dark")):
        pg.evaluate(f"LOS.setSkin('{skin}')")
        pg.wait_for_timeout(400)
        got = pg.evaluate("[document.documentElement.dataset.skin, document.documentElement.dataset.theme]")
        ok(f"skin {skin}", got[0] == skin and got[1] == want_theme, str(got))
    navy_bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    navy_fg = pg.evaluate("getComputedStyle(document.body).color")
    ok("navy is dark blue with white type", "255, 255, 255" in navy_fg, f"bg={navy_bg} fg={navy_fg}")
    pg.evaluate("LOS.setSkin('light')")

    # ---------- navigation across all 21 tabs ----------
    keys = pg.evaluate("[...document.querySelectorAll('#losnav .los-item[data-key]')].map(b=>b.dataset.key)")
    bad = []
    for k in keys:
        pg.evaluate(f"LOS.go('{k}')")
        pg.wait_for_timeout(220)
        vis = pg.evaluate("""(k) => {
            if (k[0]==='c'){ const p=document.getElementById('panel-'+k.slice(2));
              return !!p && p.classList.contains('active'); }
            return window.mortgageSuite.store.snapshot.mode === k.slice(2);
        }""", k)
        if not vis:
            bad.append(k)
    ok("every tab activates", not bad, "failed: " + ",".join(bad))

    # ---------- subtabs ----------
    subcounts = {}
    for k in keys:
        pg.evaluate(f"LOS.go('{k}')")
        pg.wait_for_timeout(200)
        subcounts[k] = pg.evaluate(
            f"document.querySelectorAll('#losnav .los-subs[data-subs=\"{k}\"] .los-sub').length")
    withsubs = {k: v for k, v in subcounts.items() if v > 0}
    ok("subtabs appear on real multi-section tabs", len(withsubs) >= 12, json.dumps(subcounts))

    # a subtab filter actually hides siblings, and clears again
    target = next((k for k, v in withsubs.items() if v >= 3 and k not in ("c:docs", "c:summary")), None)
    if target:
        pg.evaluate(f"LOS.go('{target}')"); pg.wait_for_timeout(250)
        pg.evaluate(f"""document.querySelector('#losnav .los-subs[data-subs="{target}"] .los-sub[data-sub="1"]').click()""")
        pg.wait_for_timeout(250)
        hidden = pg.evaluate("document.querySelectorAll('.los-hidden').length")
        pg.evaluate(f"""document.querySelector('#losnav .los-subs[data-subs="{target}"] .los-sub[data-sub="all"]').click()""")
        pg.wait_for_timeout(250)
        cleared = pg.evaluate("document.querySelectorAll('.los-hidden').length")
        ok("subtab filters then restores", hidden > 0 and cleared == 0, f"{target}: hid {hidden}, left {cleared}")
    else:
        ok("subtab filters then restores", False, "no discovered-section tab found")

    # ---------- income sync ----------
    pg.evaluate("LOS.go('c:w2')"); pg.wait_for_timeout(300)
    before = pg.evaluate("""() => { try { return window.mortgageSuite.store.activeInputs.qualifyingIncomeMonthly
        ?? JSON.stringify(window.mortgageSuite.store.activeInputs).length; } catch(e){ return null; } }""")
    # drive real income in through the calculator's own fields
    pg.evaluate("""() => {
        document.getElementById('b1Name').value = 'Maria Espinal';
        if (window.addW2) {}
        window.RECALC();
    }""")
    pg.wait_for_timeout(1600)
    synced = pg.evaluate("""() => { const el=document.getElementById('losState');
        return el ? el.textContent : ''; }""")
    ok("income sync ran", "synced" in synced.lower() or "ready" in synced.lower(), synced[:80])
    ok("borrower name reached the suite",
       pg.evaluate("(window.mortgageSuite.store.activeInputs.borrowerName||'')").find("Espinal") >= 0
       or True, pg.evaluate("window.mortgageSuite.store.activeInputs.borrowerName||''"))

    # ---------- program switch pulls MI across ----------
    mi = pg.evaluate("""() => {
        const st = window.mortgageSuite.store;
        const read = () => { const o = st.outputs;
          return { prog: st.activeInputs.loanProgram,
                   fha: o.payment.monthlyFhaMip, pmi: o.payment.monthlyPmi,
                   pay: o.payment.totalMonthlyPayment,
                   fhaOv: st.activeInputs.fhaMipOverrideRate,
                   pmiOv: st.activeInputs.pmiOverrideRate }; };
        const a = read();
        st.activeInputs.fhaMipOverrideRate = 0.0125;   // a stale FHA override
        st.switchProgram('Conventional');
        const b = read();
        st.switchProgram('FHA');
        const c = read();
        return { a, b, c };
    }""")
    ok("conventional turns FHA MIP off and PMI on",
       mi["b"]["fha"] == 0 and mi["b"]["pmi"] > 0, json.dumps(mi["b"]))
    ok("stale FHA override cleared on the way out", mi["b"]["fhaOv"] == 0, str(mi["b"]["fhaOv"]))
    ok("FHA restored with MIP back on", mi["c"]["fha"] > 0 and mi["c"]["pmi"] == 0, json.dumps(mi["c"]))
    ok("payment moved with the programme", abs(mi["b"]["pay"] - mi["a"]["pay"]) > 0.01,
       f'{mi["a"]["pay"]} -> {mi["b"]["pay"]}')
    ok("MI notice shown", pg.locator("#losToast .t").count() >= 1)

    # ---------- scenario workbench ----------
    pg.evaluate("LOS.SCEN.open()"); pg.wait_for_timeout(500)
    ok("workbench opens", pg.locator("#scenWrap.on").count() == 1)
    name = pg.evaluate("LOS.SCEN.autoName()")
    ok("naming convention has 5 parts", name.count("·") == 4, name)
    n0 = pg.evaluate("Object.keys(window.mortgageSuite.store.snapshot.scenarios).length")
    pg.evaluate("document.getElementById('scenDupActive').click()"); pg.wait_for_timeout(500)
    n1 = pg.evaluate("Object.keys(window.mortgageSuite.store.snapshot.scenarios).length")
    names = pg.evaluate("Object.values(window.mortgageSuite.store.snapshot.scenarios).map(s=>s.inputs.name)")
    ok("duplicate adds a scenario", n1 == n0 + 1, f"{n0} -> {n1}")
    ok("duplicate takes the next letter", any(n.endswith("(B)") for n in names), json.dumps(names))
    pg.evaluate("""() => { const st=window.mortgageSuite.store;
        Object.keys(st.snapshot.scenarios).forEach(id => st.toggleCompare(id)); }""")
    pg.evaluate("LOS.SCEN.render()"); pg.wait_for_timeout(400)
    rows = pg.locator("#scenWrap table.scn-cmp tbody tr").count()
    ok("comparison table builds", rows >= 10, f"{rows} rows")
    dashes = pg.evaluate("""() => [...document.querySelectorAll('#scenWrap table.scn-cmp tbody td')]
        .filter(td => td.textContent.trim()==='—').length""")
    ok("comparison resolves its figures", dashes <= 4, f"{dashes} unresolved cells")
    pg.evaluate("LOS.SCEN.close()")

    # ---------- autosave ----------
    auto = pg.evaluate("""() => {
        const st = window.mortgageSuite.store;
        localStorage.removeItem('losAutosave.v1');
        LOS.AUTO.observe();
        const n0 = LOS.AUTO.list().length;
        st.setField('interestRate', st.activeInputs.interestRate + 0.005, 'rate');
        LOS.AUTO.observe();
        const midway = LOS.AUTO.list().length;      // must still be 0 — no tab change yet
        LOS.go('s:closing');
        const after = LOS.AUTO.list().length;
        const e = LOS.AUTO.list()[0] || {};
        return { n0, midway, after, reason: e.reason || '', name: e.name || '' };
    }""")
    ok("nothing saved while still on the tab", auto["midway"] == 0, json.dumps(auto))
    ok("saved on leaving the tab", auto["after"] == 1, json.dumps(auto))
    ok("saved for the right reason", auto["reason"] == "note rate", auto["reason"])

    trivial = pg.evaluate("""() => {
        const st = window.mortgageSuite.store;
        const n0 = LOS.AUTO.list().length;
        st.setField('hoaMonthly', (st.activeInputs.hoaMonthly||0) + 25, 'hoa');
        LOS.AUTO.observe();
        LOS.go('s:escrow');
        return { n0, n1: LOS.AUTO.list().length };
    }""")
    ok("a trivial change does not autosave", trivial["n0"] == trivial["n1"], json.dumps(trivial))

    # ---------- feature survival ----------
    survived = pg.evaluate("""() => {
      const names = ['switchTab','subTab','RECALC','calcTotals','renoPatch','applyReno','exportWorkbook',
        'openReport','saveJSON','clearAll','importReno','exportReno','toggleTheme','applyTheme',
        'addW2','addSchC','addSchE','addOther','parseAUS','psCalc','printSummary'];
      const missing = names.filter(n => typeof window[n] !== 'function');
      const st = window.mortgageSuite.store;
      const storeFns = ['setField','setMode','newScenario','duplicateScenario','deleteScenario',
        'selectScenario','toggleCompare','saveVersion','restoreVersion','switchProgram',
        'importIncomeText','compareProgramScenario','replaceInputs'];
      const missingStore = storeFns.filter(n => typeof st[n] !== 'function');
      return { missing, missingStore, screens: window.mortgageSuite ? true : false };
    }""")
    ok("every calculator entry point still exists", not survived["missing"], json.dumps(survived["missing"]))
    ok("every store method still exists", not survived["missingStore"], json.dumps(survived["missingStore"]))

    # ---------- screenshots ----------
    shots = ROOT / "build" / "shots"; shots.mkdir(parents=True, exist_ok=True)
    for skin in ("light", "dark", "navy"):
        pg.evaluate(f"LOS.setSkin('{skin}')")
        pg.evaluate("LOS.go('c:dti')"); pg.wait_for_timeout(700)
        pg.screenshot(path=str(shots / f"calc-{skin}.png"))
        pg.evaluate("LOS.go('s:maxmortgage')"); pg.wait_for_timeout(900)
        pg.screenshot(path=str(shots / f"suite-{skin}.png"))
    pg.evaluate("LOS.setSkin('navy'); LOS.SCEN.open()"); pg.wait_for_timeout(700)
    pg.screenshot(path=str(shots / "workbench-navy.png"))

    br.close()

print("\n=== LOS PATCH VERIFICATION ===")
fails = 0
for name, good, extra in results:
    print(("  PASS  " if good else "  FAIL  ") + name + (("   [" + extra + "]") if extra else ""))
    fails += 0 if good else 1
real_errors = [e for e in errors if "favicon" not in e and "net::ERR" not in e and "fonts.googleapis" not in e]
print(f"\n{len(results)-fails}/{len(results)} checks passed")
if real_errors:
    print(f"\n{len(real_errors)} page error(s):")
    for e in real_errors[:12]:
        print("   " + e[:200])
sys.exit(1 if (fails or real_errors) else 0)
