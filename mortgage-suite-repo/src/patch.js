/* =====================================================================
   LOS PATCH LAYER  —  behaviour
   Additive only. Both engines keep their own calculations, their own
   state and their own exports; this layer wraps entry points, it does
   not replace them.
   ===================================================================== */
(function(){
"use strict";

var LOS = window.LOS = {};
var $ = function(s,r){ return (r||document).querySelector(s); };
var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };

/* Both engines declare their globals with const/let, which do not become
   properties of window. Anything reaching for them has to resolve through
   the scope chain, so these accessors do it once, safely. */
function G(name){
  try { return (0, eval)(name); } catch(e){ return undefined; }
}
var shell   = function(){ var v = G('SHELL'); return (v && typeof v.go === 'function') ? v : null; };
var calcS   = function(){ return G('S') || null; };
var suite = function(){ try { return window.mortgageSuite && window.mortgageSuite.store ? window.mortgageSuite.store : null; } catch(e){ return null; } };
var num = function(v,d){ v = parseFloat(v); return isFinite(v) ? v : (d||0); };

function usd(v, dp){
  if (v === null || v === undefined || !isFinite(v)) return '—';
  return '$' + Number(v).toLocaleString('en-US',{minimumFractionDigits:dp===undefined?0:dp, maximumFractionDigits:dp===undefined?0:dp});
}
function pct(v, dp){
  if (v === null || v === undefined || !isFinite(v)) return '—';
  return (Number(v)*100).toFixed(dp===undefined?3:dp) + '%';
}
/* Read the first path that actually resolves, so a rename inside either
   engine degrades to a dash instead of throwing. */
function pick(obj, paths){
  for (var i=0;i<paths.length;i++){
    var parts = paths[i].split('.'), cur = obj, ok = true;
    for (var j=0;j<parts.length;j++){
      if (cur === null || cur === undefined || !(parts[j] in cur)) { ok = false; break; }
      cur = cur[parts[j]];
    }
    if (ok && cur !== null && cur !== undefined) return cur;
  }
  return null;
}

/* ---------------------------------------------------------------- toast */
function toastEl(){
  var t = $('#losToast');
  if (!t){ t = document.createElement('div'); t.id = 'losToast'; document.body.appendChild(t); }
  return t;
}
LOS.say = function(title, body, kind, ms){
  var el = document.createElement('div');
  el.className = 't' + (kind ? ' '+kind : '');
  el.innerHTML = '<b>' + title + '</b>' + (body ? '<span class="fig">'+body+'</span>' : '');
  toastEl().appendChild(el);
  setTimeout(function(){ el.style.opacity = '0'; setTimeout(function(){ el.remove(); }, 260); }, ms || 4200);
};

/* ================================================================== 1
   THREE THEMES — light, dark, navy
   Navy rides on data-theme="dark" so every existing dark rule still
   applies; only data-skin changes the token values. Both engines write
   data-theme on their own schedule, so the skin is re-asserted whenever
   they do.
   ================================================================== */
var SKIN_KEY = 'losSkin.v1';
LOS.skin = function(){ try { return localStorage.getItem(SKIN_KEY) || 'light'; } catch(e){ return 'light'; } };
LOS.setSkin = function(skin){
  try { localStorage.setItem(SKIN_KEY, skin); } catch(e){}
  document.documentElement.setAttribute('data-skin', skin);
  var wantDark = (skin !== 'light');
  if (typeof window.applyTheme === 'function') window.applyTheme(wantDark ? 'dark' : 'light');
  else document.documentElement.setAttribute('data-theme', wantDark ? 'dark' : 'light');
  $$('#losnav .seg button').forEach(function(b){ b.classList.toggle('on', b.dataset.skin === skin); });
};
function guardSkin(){
  document.documentElement.setAttribute('data-skin', LOS.skin());
  new MutationObserver(function(){
    var want = LOS.skin();
    if (document.documentElement.getAttribute('data-skin') !== want)
      document.documentElement.setAttribute('data-skin', want);
    /* If either engine flipped the theme on its own, keep the skin honest. */
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark && want === 'light') { try { localStorage.setItem(SKIN_KEY,'dark'); } catch(e){}
      document.documentElement.setAttribute('data-skin','dark'); paintSeg(); }
    if (!isDark && want !== 'light') { try { localStorage.setItem(SKIN_KEY,'light'); } catch(e){}
      document.documentElement.setAttribute('data-skin','light'); paintSeg(); }
  }).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme','data-skin'] });
}
function paintSeg(){
  var s = LOS.skin();
  $$('#losnav .seg button').forEach(function(b){ b.classList.toggle('on', b.dataset.skin === s); });
}

/* ================================================================== 2
   NAVIGATION — named titles, grouped, with subtabs
   ================================================================== */
var CALC_TABS = [
  ['w2','W-2 & Salary'], ['schc','Schedule C'], ['corp','1065 / 1120-S / 1120'],
  ['sche','Schedule E'], ['other','Other Income'], ['assets','Assets'],
  ['dti','PITIA & DTI'], ['docs','Documents'], ['aus','AUS Findings'],
  ['summary','UW Summary & Guidelines']
];
var SUITE_TABS = [
  ['quote','Quote'], ['setup','Setup'], ['renovation','Renovation'],
  ['maxmortgage','Max Mortgage'], ['closing','Closing'], ['escrow','Escrow'],
  ['qualify','Qualify'], ['rental','Rental'], ['advanced','Advanced'],
  ['scenarios','Scenarios'], ['summary','Summary']
];
/* Subtabs that map to structure the file already has. Everything else is
   discovered from the cards actually on the page. */
var FIXED_SUBS = {
  'c:w2':      [['records','Employment records'], ['combined','Combined income']],
  'c:docs':    [['import','Document import'], ['paystub','Pay stub generator']],
  'c:summary': [['sum','Underwriting summary'], ['guides','Guideline library']]
};

LOS.tab = 'c:w2';
LOS.sub = {};

function navHTML(){
  function items(prefix, list){
    return list.map(function(t){
      var key = prefix + ':' + t[0];
      return '<button class="los-item" data-key="'+key+'">'+t[1]+'<span class="fig" data-fig="'+key+'"></span></button>'
           + '<div class="los-subs" data-subs="'+key+'"></div>';
    }).join('');
  }
  return ''
  + '<div class="los-brand"><span class="m">MS</span><div><b>Mortgage Suite</b><small>UNDERWRITING</small></div></div>'
  + '<div class="los-scroll">'
    + '<div class="los-grp"><span class="hd">Income calculator</span>' + items('c', CALC_TABS) + '</div>'
    + '<div class="los-grp"><span class="hd">Renovation suite</span>' + items('s', SUITE_TABS) + '</div>'
    + '<div class="los-grp"><span class="hd">Scenarios &amp; transfer</span>'
      + '<button class="los-item" data-act="scen">Scenario workbench</button>'
      + '<button class="los-item" data-act="toSuite">Send income to suite</button>'
      + '<button class="los-item" data-act="toCalc">Pull loan setup back</button>'
    + '</div>'
  + '</div>'
  + '<div class="los-foot">'
    + '<span class="los-lab">Appearance</span>'
    + '<div class="seg">'
      + '<button data-skin="light">Light</button>'
      + '<button data-skin="dark">Dark</button>'
      + '<button data-skin="navy">Navy</button>'
    + '</div>'
    + '<label class="los-sw"><span>Sync income to suite</span>'
      + '<input type="checkbox" id="losSyncTgl"></label>'
    + '<label class="los-sw"><span>Autosave on big changes</span>'
      + '<input type="checkbox" id="losAutoTgl"></label>'
    + '<div class="los-state" id="losState"></div>'
  + '</div>';
}

function buildNav(){
  if ($('#losnav')) return;
  var n = document.createElement('aside');
  n.id = 'losnav';
  n.innerHTML = navHTML();
  document.body.appendChild(n);

  var burger = document.createElement('button');
  burger.id = 'losBurger'; burger.type = 'button'; burger.textContent = '≡';
  burger.setAttribute('aria-label','Show navigation');
  burger.onclick = function(){ n.classList.toggle('open'); };
  document.body.appendChild(burger);

  n.addEventListener('click', function(e){
    var seg = e.target.closest('.seg button');
    if (seg){ LOS.setSkin(seg.dataset.skin); return; }
    var sub = e.target.closest('.los-sub');
    if (sub){ applySub(sub.dataset.key, sub.dataset.sub); return; }
    var item = e.target.closest('.los-item');
    if (!item) return;
    if (item.dataset.act === 'scen'){ SCEN.open(); return; }
    if (item.dataset.act === 'toSuite'){ var s1 = shell(); if (s1) s1.toSuite(); return; }
    if (item.dataset.act === 'toCalc'){ var s2 = shell(); if (s2) s2.toCalc(); return; }
    if (item.dataset.key) LOS.go(item.dataset.key);
  });

  $('#losSyncTgl').checked = LOS.syncOn();
  $('#losSyncTgl').onchange = function(){ LOS.setSync(this.checked); };
  $('#losAutoTgl').checked = AUTO.on();
  $('#losAutoTgl').onchange = function(){ AUTO.set(this.checked); };
  paintSeg();
}

/* Route to a tab. Committing the pending autosave happens here, and only
   here: the brief was to write on leaving a tab, not on every keystroke. */
LOS.go = function(key){
  if (key === LOS.tab) { renderSubs(key); return; }
  AUTO.commitIfDirty('tab change');
  LOS.tab = key;
  var parts = key.split(':'), side = parts[0], id = parts[1];
  if (side === 'c'){
    var sh1 = shell(); if (sh1 && sh1.mode !== 'calc') sh1.go('calc');
    if (typeof window.switchTab === 'function') window.switchTab(id);
  } else {
    var sh2 = shell(); if (sh2 && sh2.mode !== 'suite') sh2.go('suite');
    var st = suite();
    if (st) { try { st.setMode(id); } catch(e){} }
  }
  paintNav();
  setTimeout(function(){ renderSubs(key); }, 60);
};

function paintNav(){
  $$('#losnav .los-item[data-key]').forEach(function(b){
    b.classList.toggle('on', b.dataset.key === LOS.tab);
  });
  $$('#losnav .los-subs').forEach(function(d){
    d.classList.toggle('on', d.dataset.subs === LOS.tab);
  });
  paintFigures();
}

/* ------------------------------------------------- live figures in nav */
function paintFigures(){
  function set(key, txt){
    var el = $('#losnav [data-fig="'+key+'"]'); if (el) el.textContent = txt || '';
  }
  try {
    if (typeof window.calcTotals === 'function'){
      var t = window.calcTotals();
      set('c:w2', t.b1 ? usd(t.b1) : '');
      set('c:dti', isFinite(t.back) ? (t.back*100).toFixed(1)+'%' : '');
      set('c:summary', t.income ? usd(t.income) : '');
    }
  } catch(e){}
  try {
    var st = suite();
    if (st){
      var o = st.outputs, i = st.activeInputs;
      set('s:renovation', usd(pick(o,['renovationOut.finalRenovationAmount'])));
      set('s:maxmortgage', usd(pick(o,['loan.maximumBaseLoan'])));
      set('s:closing', usd(pick(o,['closing.buyerClosingCosts'])));
      set('s:escrow', usd(pick(o,['escrowOut.escrowMonthlyDeposit'])));
      set('s:qualify', pct(pick(o,['aus.backEndRatio','qualify.backRatio']),1));
      set('s:quote', usd(pick(o,['payment.totalMonthlyPayment'])));
      set('s:setup', i ? i.loanProgram : '');
      set('s:scenarios', String(Object.keys(st.snapshot.scenarios||{}).length));
    }
  } catch(e){}
}

/* ================================================================== 3
   SUBTABS — derived from the sections that are genuinely on the page
   ================================================================== */
function labelOf(card){
  /* A suite card heading is a row of parts — chevron, title, running total,
     programme badge. Only the title names the section. */
  var ttl = card.querySelector(':scope > h3 > .ttl, :scope > summary > .ttl');
  if (ttl && ttl.textContent.trim()) return ttl.textContent.trim().slice(0,30);
  var n = card.querySelector('.card-top .name-input');
  if (n && n.value) return n.value.slice(0,30);
  var ct = card.querySelector(':scope > .coltitle');
  if (ct && ct.textContent.trim()) return ct.textContent.trim().slice(0,30);
  var d = card.querySelector('.card-top .doc-name, .card-top h3, .card-top h2, .card-top b, .card-top strong');
  if (d && d.textContent.trim()) return d.textContent.trim().slice(0,30);
  var h = card.querySelector('h2,h3,h4,.ttl,.hd');
  if (h && h.textContent.trim()) return h.textContent.trim().slice(0,30);
  var t = card.querySelector('.card-top');
  if (t && t.textContent.trim()) return t.textContent.trim().slice(0,30);
  return 'Section';
}
/* The sections of a screen are the shallowest run of two or more sibling
   cards, ignoring the sticky rail — which is one card of its own and would
   otherwise be mistaken for a section list. */
function isCard(el){
  if (el.nodeType !== 1 || !el.classList) return false;
  /* A screen is built from cards; a single-card screen is built from the
     suite's own column boxes, which carry their own titles. Both are real
     divisions of the page, so both can back a subtab. */
  return el.classList.contains('card') || el.classList.contains('section')
      || el.classList.contains('colbox');
}
function depthOf(el, root){ var d = 0; while (el && el !== root){ el = el.parentElement; d++; } return d; }
function sectionsIn(host){
  if (!host) return [];
  var best = null, bestDepth = Infinity;
  var candidates = [host].concat(Array.prototype.slice.call(host.querySelectorAll('*')));
  for (var i = 0; i < candidates.length; i++){
    var h = candidates[i];
    if (!h.children || !h.children.length) continue;
    if (h.closest && h.closest('.rail, .tabs, .toolbar, .topbar, .legend')) continue;
    var cards = Array.prototype.filter.call(h.children, isCard)
      .filter(function(el){ return !el.classList.contains('los-strip'); });
    if (cards.length < 2) continue;
    var d = depthOf(h, host);
    if (d < bestDepth || (d === bestDepth && best && cards.length > best.length)){
      best = cards; bestDepth = d;
    }
  }
  return best ? best.map(function(c){ return { el:c, label:labelOf(c) }; }) : [];
}
function hostFor(key){
  var parts = key.split(':');
  if (parts[0] === 'c') return document.getElementById('panel-' + parts[1]);
  var sr = document.getElementById('suite-root');
  if (!sr) return null;
  /* Prefer the main column so the sticky rail is never treated as sections. */
  return sr.querySelector('.screen, .cols, .split > *:first-child, main') || sr;
}

function renderSubs(key){
  var box = $('#losnav .los-subs[data-subs="'+key+'"]');
  if (!box) return;
  var fixed = FIXED_SUBS[key];
  var html = '';
  if (fixed){
    html = fixed.map(function(f){
      return '<button class="los-sub'+(LOS.sub[key]===f[0]?' on':'')+'" data-key="'+key+'" data-sub="'+f[0]+'">'+f[1]+'</button>';
    }).join('');
  } else {
    var secs = sectionsIn(hostFor(key));
    LOS._secs = LOS._secs || {}; LOS._secs[key] = secs;
    if (secs.length >= 2){
      html = '<button class="los-sub'+(!LOS.sub[key]||LOS.sub[key]==='all'?' on':'')+'" data-key="'+key+'" data-sub="all">All sections</button>'
        + secs.map(function(s,ix){
            return '<button class="los-sub'+(LOS.sub[key]===String(ix)?' on':'')+'" data-key="'+key+'" data-sub="'+ix+'">'+s.label+'</button>';
          }).join('');
    }
  }
  box.innerHTML = html;
  box.classList.toggle('on', key === LOS.tab && !!html);
  if (key === LOS.tab) renderStrip(key);
  /* Re-assert an active filter after a re-render replaced the DOM. */
  if (LOS.sub[key] && !fixed) applyFilter(key, LOS.sub[key], true);
}

function applySub(key, sub){
  LOS.sub[key] = sub;
  var fixed = FIXED_SUBS[key];
  if (fixed){
    if (key === 'c:docs' && typeof window.subTab === 'function') window.subTab('docs', sub);
    if (key === 'c:w2'){
      var wl = $('#w2List'), cb = $('#combineBox');
      if (wl) wl.classList.toggle('los-hidden', sub !== 'records');
      if (cb) cb.classList.toggle('los-hidden', sub !== 'combined');
    }
    if (key === 'c:summary'){
      var body = $('#summaryBody'), gh = $('#guideHead'), gb = $('#guideBody');
      [body].forEach(function(el){ if (el) el.classList.toggle('los-hidden', sub !== 'sum'); });
      [gh,gb].forEach(function(el){ if (el) el.classList.toggle('los-hidden', sub !== 'guides'); });
    }
  } else {
    applyFilter(key, sub, false);
  }
  renderSubs(key);
  renderStrip(key);
  var host = hostFor(key);
  if (host) host.scrollIntoView({ behavior:'smooth', block:'start' });
}
function applyFilter(key, sub, quiet){
  var secs = (LOS._secs || {})[key];
  if (!secs || !secs.length) return;
  secs.forEach(function(s, ix){
    if (!s.el || !s.el.isConnected) return;
    if (s.el.classList.contains('los-strip')) return;
    s.el.classList.toggle('los-hidden', sub !== 'all' && String(ix) !== String(sub));
  });
}
LOS.clearFilters = function(){
  $$('.los-hidden').forEach(function(el){ el.classList.remove('los-hidden'); });
  LOS.sub = {};
};


/* ================================================================== 3b
   IN-PAGE TAB STRIP
   The left nav says where you are in the file; this strip says which
   sections the current tab is made of, in the page itself, sticky at the
   top of the scroll. The renovation screens are long by design — the
   strip is how you move down them without collapsing anything.
   ================================================================== */
function stripHost(key){
  if (key.charAt(0) === 'c'){
    var p = document.getElementById('panel-' + key.slice(2));
    return p || null;
  }
  var sr = document.getElementById('suite-root');
  if (!sr) return null;
  var cm = sr.querySelector('.cols-main');
  return cm ? cm.firstElementChild : null;
}
function renderStrip(key){
  var host = stripHost(key);
  if (!host) return;
  var existing = host.querySelector(':scope > .los-strip');
  var fixed = FIXED_SUBS[key];
  var secs = fixed ? null : ((LOS._secs || {})[key] || []);
  var items = [];
  if (fixed){
    items = fixed.map(function(f){ return { sub:f[0], label:f[1] }; });
  } else if (secs.length >= 2){
    items = [{ sub:'all', label:'All sections' }].concat(secs.map(function(s, ix){
      return { sub:String(ix), label:s.label };
    }));
  }
  if (!items.length){ if (existing) existing.remove(); return; }

  var cur = LOS.sub[key] || (fixed ? fixed[0][0] : 'all');
  var html = items.map(function(it){
    return '<button type="button" class="st' + (String(cur) === String(it.sub) ? ' on' : '') +
      '" data-key="' + key + '" data-sub="' + it.sub + '">' + it.label + '</button>';
  }).join('') + '<span class="spacer"></span>' +
    '<button type="button" class="st wide" data-expand="' + key + '">Expand all</button>';

  if (!existing){
    existing = document.createElement('div');
    existing.className = 'los-strip no-print';
    host.insertBefore(existing, host.firstChild);
    existing.addEventListener('click', function(e){
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.expand){ expandAll(b.dataset.expand); return; }
      applySub(b.dataset.key, b.dataset.sub);
    });
  }
  existing.innerHTML = html;
}
/* Open every collapsed section through the suite's own heading handler,
   so a manual collapse afterwards still behaves the way it always did. */
function expandAll(key){
  var host = stripHost(key); if (!host) return;
  var closed = host.querySelectorAll('.card.collapsible.closed > h3, details.sec:not([open]) > summary');
  Array.prototype.forEach.call(closed, function(h){ try { h.click(); } catch(e){} });
  LOS.say('Expanded', closed.length + ' section(s) opened on this tab.', 'good', 2400);
}

/* ================================================================== 4
   INCOME  ->  SUITE, continuously
   The calculator stays the authority on qualifying income. Every settled
   recalculation is pushed into the active suite scenario through the same
   importer the manual button uses, so there is no second mapping to keep
   in step.
   ================================================================== */
var SYNC_KEY = 'losSync.v1';
var lastPush = '', pushTimer = null, pushing = false;
LOS.syncOn = function(){ try { return localStorage.getItem(SYNC_KEY) !== '0'; } catch(e){ return true; } };
LOS.setSync = function(on){
  try { localStorage.setItem(SYNC_KEY, on ? '1' : '0'); } catch(e){}
  state('Income sync ' + (on ? 'on' : 'off'));
  if (on) pushIncome(true);
};
function state(msg){
  var el = $('#losState');
  if (!el) return;
  var cls = LOS.syncOn() ? (LOS._stale ? 'stale' : '') : 'off';
  el.innerHTML = '<span class="dotlive '+cls+'"></span>' + msg;
}
function pushIncome(force){
  if (!LOS.syncOn() || pushing) return;
  var st = suite();
  if (!st || typeof window.renoPatch !== 'function') return;
  var patch;
  try { patch = window.renoPatch(); } catch(e){ return; }
  var text = JSON.stringify(patch);
  if (!force && text === lastPush) return;
  pushing = true;
  try {
    st.importIncomeText(text, 'RenovationSuite_Income_live.json');
    lastPush = text;
    LOS._stale = false;
    var t = window.calcTotals ? window.calcTotals() : null;
    state('Income synced ' + new Date().toLocaleTimeString() + (t ? '<br><b>'+usd(t.income,2)+'</b> / mo' : ''));
    var s3 = shell(); if (s3 && s3.say) s3.say('Income synced ' + new Date().toLocaleTimeString(), false);
  } catch(e){
    LOS._stale = true;
    state('Sync failed — use the manual send');
  } finally { pushing = false; }
}
function wrapRecalc(){
  if (typeof window.RECALC !== 'function' || window.RECALC.__los) return false;
  var inner = window.RECALC;
  var wrapped = function(){
    var r = inner.apply(this, arguments);
    paintFigures();
    AUTO.observe();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function(){ pushIncome(false); }, 700);
    return r;
  };
  wrapped.__los = true;
  window.RECALC = wrapped;
  return true;
}

/* ================================================================== 5
   PROGRAM SWITCH  —  carry the mortgage insurance difference across
   FHA and Conventional never both apply, so leaving a stale override
   behind quietly changes the payment when the program flips back. The
   opposite programme's override is cleared, a credit score is required
   before PMI can be looked up, and the change in MI is reported.
   ================================================================== */
function miReading(st){
  try {
    var o = st.outputs;
    return {
      program: st.activeInputs.loanProgram,
      fha: num(pick(o,['payment.monthlyFhaMip'])),
      pmi: num(pick(o,['payment.monthlyPmi'])),
      fhaRate: num(pick(o,['payment.fhaMipRateUsed'])),
      pmiRate: num(pick(o,['payment.pmiRateUsed'])),
      upfront: num(pick(o,['loan.ufmip'])),
      pay: num(pick(o,['payment.totalMonthlyPayment'])),
      rate: num(st.activeInputs.interestRate)
    };
  } catch(e){ return null; }
}
function wrapProgram(st){
  if (!st || st.switchProgram.__los) return;
  var inner = st.switchProgram.bind(st);
  var wrapped = function(to){
    var before = miReading(st);
    var i = st.activeInputs;
    if (to === 'Conventional'){
      i.fhaMipOverrideRate = 0;                       // FHA figure must not follow
      if (!num(i.creditScore)) i.creditScore = 740;   // PMI is priced off the tier
    } else {
      i.pmiOverrideRate = 0;                          // PMI figure must not follow
      if (!num(i.fhaAnnualMipRate)) i.fhaAnnualMipRate = 0.0055;
      if (!num(i.ufmipRate)) i.ufmipRate = 0.0175;
    }
    var r = inner(to);
    var after = miReading(st);
    if (before && after){
      var wasMI = before.fha + before.pmi, nowMI = after.fha + after.pmi;
      var d = nowMI - wasMI, dPay = after.pay - before.pay;
      LOS.say(
        'Switched to ' + to,
        'Monthly MI ' + usd(wasMI,2) + ' → ' + usd(nowMI,2)
          + ' (' + (d>=0?'+':'') + usd(d,2) + ')<br>'
          + (to === 'Conventional'
              ? 'PMI at ' + pct(after.pmiRate) + ' from the credit tier · upfront MIP removed'
              : 'Annual MIP at ' + pct(after.fhaRate) + ' · upfront MIP ' + usd(after.upfront) + '')
          + '<br>Rate ' + pct(before.rate,3) + ' → ' + pct(after.rate,3)
          + ' · payment ' + (dPay>=0?'+':'') + usd(dPay,2),
        Math.abs(d) > 1 ? 'warn' : 'good', 9000);
    }
    AUTO.mark('program switch');
    return r;
  };
  wrapped.__los = true;
  st.switchProgram = wrapped;
}

/* ================================================================== 6
   AUTOSAVE  —  only when something material moved, only on leaving a tab
   Watched: note rate, loan amount, purchase price, down payment and the
   renovation budget. Typing inside a worksheet does not qualify.
   ================================================================== */
var AUTO = LOS.AUTO = (function(){
  var KEY = 'losAutosave.v1', ONKEY = 'losAutosaveOn.v1';
  var last = null, dirty = false, reason = '';
  var TOL = { rate:0.000125, money:500, pctDown:0.00125 };

  function on(){ try { return localStorage.getItem(ONKEY) !== '0'; } catch(e){ return true; } }
  function set(v){ try { localStorage.setItem(ONKEY, v ? '1':'0'); } catch(e){} state(v ? 'Autosave on' : 'Autosave off'); }

  function reading(){
    var r = { rate:0, price:0, loan:0, downPct:0, reno:0, program:'' };
    try {
      var CS = calcS(); var L = (CS && (CS.loan || CS.dti)) || null;
      if (L){
        r.rate = num(L.rate)/100 || num(L.rate);
        r.price = num(L.price);
        r.loan = num(L.base || L.baseLoan || L.loan);
        r.downPct = num(L.downPct)/100 || num(L.downPct);
      }
    } catch(e){}
    try {
      var st = suite();
      if (st){
        var i = st.activeInputs;
        r.rate = num(i.interestRate) || r.rate;
        r.price = num(i.basePurchasePrice) || r.price;
        r.downPct = num(i.finalDownPaymentPct) || r.downPct;
        r.reno = num(i.reno && i.reno.baseCost);
        r.program = i.loanProgram || '';
        r.loan = num(pick(st.outputs,['loan.maximumBaseLoan'])) || r.loan;
      }
    } catch(e){}
    return r;
  }
  function material(a, b){
    if (!a) return null;
    if (a.program !== b.program) return 'loan program';
    if (Math.abs(a.rate - b.rate) >= TOL.rate) return 'note rate';
    if (Math.abs(a.price - b.price) >= TOL.money) return 'purchase price';
    if (Math.abs(a.loan - b.loan) >= TOL.money) return 'loan amount';
    if (Math.abs(a.downPct - b.downPct) >= TOL.pctDown) return 'down payment';
    if (Math.abs(a.reno - b.reno) >= TOL.money) return 'renovation budget';
    return null;
  }
  function observe(){
    var now = reading();
    if (!last){ last = now; return; }
    var why = material(last, now);
    if (why){ dirty = true; reason = why; last = now; state('Unsaved: ' + why); }
  }
  function mark(why){ dirty = true; reason = why || 'change'; last = reading(); }

  function commitIfDirty(trigger){
    if (!on() || !dirty) return;
    dirty = false;
    var entry = { ts:new Date().toISOString(), reason:reason, trigger:trigger, name:SCEN.autoName() };
    try { entry.calc = JSON.parse(JSON.stringify(calcS() || {})); } catch(e){}
    try { var st = suite(); if (st) entry.suite = JSON.parse(JSON.stringify(st.snapshot)); } catch(e){}
    try {
      var all = JSON.parse(localStorage.getItem(KEY) || '[]');
      all.unshift(entry);
      localStorage.setItem(KEY, JSON.stringify(all.slice(0,10)));
      state('Autosaved — ' + reason + '<br><b>' + new Date().toLocaleTimeString() + '</b>');
      LOS.say('Autosaved', 'The ' + reason + ' changed, so the file was written on leaving the tab.', 'good', 3200);
    } catch(e){ state('Autosave failed — storage full'); }
  }
  function list(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e){ return []; } }
  function restore(ix){
    var all = list(), e = all[ix];
    if (!e) return;
    if (!confirm('Restore the autosave from ' + new Date(e.ts).toLocaleString() + '?\n\nReason: ' + e.reason + '\n\nThis overwrites the scenario currently open.')) return;
    try {
      if (e.suite){ var st = suite(); if (st){ st.state = e.suite; st.emit(); } }
      var CS2 = calcS();
      if (e.calc && CS2){ Object.keys(e.calc).forEach(function(k){ CS2[k] = e.calc[k]; }); if (window.RECALC) window.RECALC(); }
      LOS.say('Restored', new Date(e.ts).toLocaleString(), 'good');
    } catch(err){ alert('Could not restore that autosave: ' + err.message); }
  }
  return { on:on, set:set, observe:observe, mark:mark, commitIfDirty:commitIfDirty, list:list, restore:restore };
})();

/* ================================================================== 7
   SCENARIO WORKBENCH
   Naming, saving, duplicating and a real side-by-side comparison. The
   store already owns scenarios; this is a front end for it with a naming
   convention that makes a saved file identifiable a month later.
   ================================================================== */
var SCEN = LOS.SCEN = (function(){

  var PROGRAM_SHORT = { 'FHA':'FHA', 'Conventional':'Conv' };

  /* Convention:  Lastname · FHA 203(k) · 3.50% down · 6.375% · 08-29
     Every part is something you would say on the phone, in the order you
     would say it, so the list sorts and scans by borrower first. */
  function autoName(){
    var st = suite();
    if (!st) return 'Scenario';
    var i = st.activeInputs;
    var CS3 = calcS();
    var who = (i.borrowerName || (CS3 && CS3.b1) || '').trim();
    var last = who ? who.split(/\s+/).pop() : 'Unnamed';
    var prog = (PROGRAM_SHORT[i.loanProgram] || i.loanProgram || '');
    if (i.renovation) prog += (i.loanProgram === 'FHA' ? ' 203(k)' : ' HomeStyle');
    var d = new Date();
    var stamp = String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    return [last, prog, pct(i.finalDownPaymentPct,2) + ' down', pct(i.interestRate,3), stamp].join(' · ');
  }
  /* A duplicate keeps the stem and takes the next free letter. */
  function variantName(base){
    var st = suite(); if (!st) return base + ' (B)';
    var names = Object.values(st.snapshot.scenarios).map(function(s){ return s.inputs.name || ''; });
    var stem = base.replace(/\s*\([A-Z]\)\s*$/, '');
    for (var c = 66; c < 91; c++){
      var candidate = stem + ' (' + String.fromCharCode(c) + ')';
      if (names.indexOf(candidate) === -1) return candidate;
    }
    return stem + ' (' + Date.now().toString().slice(-4) + ')';
  }

  var METRICS = [
    ['Program',            function(o,i){ return i.loanProgram + (i.renovation ? ' · reno' : ''); }, 'txt'],
    ['Purchase price',     function(o,i){ return pick(o,['purchase.finalPurchasePrice']) || i.basePurchasePrice; }, 'usd0'],
    ['Renovation',         function(o){ return pick(o,['renovationOut.finalRenovationAmount']); }, 'usd0'],
    ['After-repair value', function(o){ return pick(o,['value.afterRepairValue']); }, 'usd0'],
    ['Maximum base loan',  function(o){ return pick(o,['loan.maximumBaseLoan']); }, 'usd0', 'lo'],
    ['Total loan',         function(o){ return pick(o,['loan.totalLoan']); }, 'usd0'],
    ['Note rate',          function(o,i){ return i.interestRate; }, 'pct3', 'lo'],
    ['Down payment',       function(o,i){ return i.finalDownPaymentPct; }, 'pct2'],
    ['Monthly MI',         function(o){ return num(pick(o,['payment.monthlyFhaMip'])) + num(pick(o,['payment.monthlyPmi'])); }, 'usd2', 'lo'],
    ['Upfront MIP',        function(o){ return pick(o,['loan.ufmip']); }, 'usd0', 'lo'],
    ['Principal & interest',function(o){ return pick(o,['payment.principalAndInterest']); }, 'usd2'],
    ['Total payment',      function(o){ return pick(o,['payment.totalMonthlyPayment']); }, 'usd2', 'lo'],
    ['Cash to close',      function(o){ return pick(o,['cash.cashToClose']); }, 'usd0', 'lo'],
    ['Closing costs',      function(o){ return pick(o,['closing.buyerClosingCosts']); }, 'usd0', 'lo'],
    ['Value cushion',      function(o){ return pick(o,['value.valueCushion']); }, 'usd0']
  ];
  function fmt(v, kind){
    if (kind === 'txt') return v == null ? '—' : String(v);
    if (v == null || !isFinite(v)) return '—';
    if (kind === 'usd0') return usd(v,0);
    if (kind === 'usd2') return usd(v,2);
    if (kind === 'pct3') return pct(v,3);
    if (kind === 'pct2') return pct(v,2);
    return String(v);
  }

  function compareHTML(){
    var st = suite(); if (!st) return '<p>The suite has not finished loading.</p>';
    var ids = (st.snapshot.compareIds && st.snapshot.compareIds.length)
      ? st.snapshot.compareIds.slice(0,4)
      : Object.keys(st.snapshot.scenarios).slice(0,4);
    if (ids.length < 2) return '<p style="color:var(--text-muted);font-size:12px">Tick two or more scenarios above to compare them.</p>';
    var cols = ids.map(function(id){
      var s = st.snapshot.scenarios[id];
      return { id:id, name:s.inputs.name, i:s.inputs, o:st.outputsFor(id) };
    }).filter(function(c){ return c.o; });

    var head = '<thead><tr><th>Line</th>' + cols.map(function(c){
      return '<th>' + esc(c.name) + '</th>';
    }).join('') + '</tr></thead>';

    var rows = METRICS.map(function(m){
      var vals = cols.map(function(c){ try { return m[1](c.o, c.i); } catch(e){ return null; } });
      var best = -1;
      if (m[3] === 'lo'){
        var nums = vals.map(function(v){ return (v==null||!isFinite(v)) ? Infinity : Number(v); });
        best = nums.indexOf(Math.min.apply(null, nums));
        if (!isFinite(nums[best])) best = -1;
      }
      return '<tr><td>' + m[0] + '</td>' + vals.map(function(v,ix){
        return '<td' + (ix === best ? ' style="color:var(--emerald);font-weight:700"' : '') + '>' + fmt(v, m[2]) + '</td>';
      }).join('') + '</tr>';
    }).join('');

    /* One delta row so the comparison answers "and what does that cost me". */
    var pays = cols.map(function(c){ return num(pick(c.o,['payment.totalMonthlyPayment'])); });
    var baseP = pays[0];
    var delta = '<tr class="delta"><td>vs. ' + esc(cols[0].name.split(' · ')[0]) + '</td>' + pays.map(function(p,ix){
      if (ix === 0) return '<td>—</td>';
      var d = p - baseP;
      return '<td>' + (d>=0?'+':'') + usd(d,2) + ' / mo</td>';
    }).join('') + '</tr>';

    return '<table class="scn-cmp">' + head + '<tbody>' + rows + delta + '</tbody></table>';
  }

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  function listHTML(){
    var st = suite(); if (!st) return '';
    var activeId = st.snapshot.activeScenarioId;
    var cmp = st.snapshot.compareIds || [];
    return Object.values(st.snapshot.scenarios).map(function(s){
      var id = s.inputs.id, o = null;
      try { o = st.outputsFor(id); } catch(e){}
      var pay = o ? usd(pick(o,['payment.totalMonthlyPayment']),2) : '—';
      var loan = o ? usd(pick(o,['loan.maximumBaseLoan']),0) : '—';
      return '<div class="scn-row' + (id === activeId ? ' active' : '') + '">'
        + '<div class="t">'
          + '<input type="checkbox" data-cmp="'+id+'"' + (cmp.indexOf(id) >= 0 ? ' checked' : '') + ' title="Include in the comparison">'
          + '<b>' + esc(s.inputs.name) + '</b>'
          + (id === activeId ? '<span style="font-size:10px;color:var(--accent);font-weight:800">OPEN</span>' : '')
        + '</div>'
        + '<div class="meta">' + esc(s.inputs.loanProgram) + ' · loan ' + loan + ' · payment ' + pay
          + ' · ' + (s.versions ? s.versions.length : 0) + ' saved version(s)'
          + ' · updated ' + new Date(s.updatedAt || Date.now()).toLocaleString() + '</div>'
        + '<div class="acts">'
          + (id === activeId ? '' : '<button class="scn-btn pri" data-open="'+id+'">Open</button>')
          + '<button class="scn-btn" data-dup="'+id+'">Duplicate</button>'
          + '<button class="scn-btn" data-ren="'+id+'">Rename</button>'
          + (Object.keys(st.snapshot.scenarios).length > 1 ? '<button class="scn-btn dang" data-del="'+id+'">Delete</button>' : '')
        + '</div></div>';
    }).join('');
  }

  function versionsHTML(){
    var st = suite(); if (!st) return '';
    var vs = (st.active && st.active.versions) || [];
    if (!vs.length) return '<p style="color:var(--text-muted);font-size:12px">No saved versions of the open scenario yet.</p>';
    return vs.slice(0,8).map(function(v){
      return '<div class="scn-row"><div class="t"><b>' + esc(v.label) + '</b></div>'
        + '<div class="meta">v' + v.version + ' · ' + new Date(v.timestamp).toLocaleString() + '</div>'
        + '<div class="acts"><button class="scn-btn" data-ver="'+v.version+'">Restore this version</button></div></div>';
    }).join('');
  }

  function autosaveHTML(){
    var all = AUTO.list();
    if (!all.length) return '<p style="color:var(--text-muted);font-size:12px">Nothing autosaved yet. A save is written when the rate, loan amount, purchase price, down payment or renovation budget moves — and only once you leave the tab.</p>';
    return all.map(function(e, ix){
      return '<div class="scn-row"><div class="t"><b>' + esc(e.name || 'File') + '</b></div>'
        + '<div class="meta">' + esc(e.reason) + ' changed · ' + new Date(e.ts).toLocaleString() + '</div>'
        + '<div class="acts"><button class="scn-btn" data-auto="'+ix+'">Restore</button></div></div>';
    }).join('');
  }

  function render(){
    var b = $('#scenBody'); if (!b) return;
    b.innerHTML =
        '<div style="margin-bottom:8px"><span class="los-lab" style="display:block;margin-bottom:6px">Name of the open scenario</span>'
      + '<input class="scn-name-in" id="scenName" value="' + esc(suite() ? suite().activeInputs.name : '') + '">'
      + '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">'
        + '<button class="scn-btn" id="scenAuto">Use the naming convention</button>'
        + '<button class="scn-btn pri" id="scenApplyName">Rename</button></div>'
      + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">'
        + 'Convention — <span class="fig">Lastname · Program · down % · rate · MM-DD</span>. Duplicates take the next letter.</div></div>'
      + '<h4 style="margin:16px 0 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)">Saved scenarios</h4>'
      + listHTML()
      + '<h4 style="margin:16px 0 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)">Comparison</h4>'
      + compareHTML()
      + '<h4 style="margin:16px 0 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)">Versions of the open scenario</h4>'
      + versionsHTML()
      + '<h4 style="margin:16px 0 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)">Autosaves</h4>'
      + autosaveHTML();
  }

  function build(){
    if ($('#scenWrap')) return;
    var scrim = document.createElement('div'); scrim.id = 'scenScrim';
    scrim.onclick = close;
    var w = document.createElement('div');
    w.id = 'scenWrap';
    w.innerHTML =
        '<div class="hd"><h3>Scenario workbench</h3>'
      + '<button class="scn-btn" id="scenClose">Close</button></div>'
      + '<div class="bd" id="scenBody"></div>'
      + '<div class="ft">'
        + '<button class="scn-btn pri" id="scenSave">Save a version</button>'
        + '<button class="scn-btn" id="scenNew">New scenario</button>'
        + '<button class="scn-btn" id="scenDupActive">Duplicate open</button>'
        + '<button class="scn-btn" id="scenFlip">Duplicate &amp; flip program</button>'
      + '</div>';
    document.body.appendChild(scrim);
    document.body.appendChild(w);

    w.addEventListener('click', function(e){
      var st = suite(); if (!st) return;
      var t = e.target;
      if (t.id === 'scenClose') return close();
      if (t.id === 'scenAuto'){ $('#scenName').value = autoName(); return; }
      if (t.id === 'scenApplyName'){ st.renameScenario($('#scenName').value.trim() || autoName()); render(); return; }
      if (t.id === 'scenSave'){
        var lbl = prompt('Label this version:', autoName());
        if (lbl === null) return;
        st.saveVersion(lbl || autoName()); AUTO.mark('version saved'); render();
        LOS.say('Version saved', esc(lbl || autoName()), 'good'); return;
      }
      if (t.id === 'scenNew'){ st.newScenario(); st.renameScenario(autoName()); render(); return; }
      if (t.id === 'scenDupActive'){
        var base = st.activeInputs.name;
        st.duplicateScenario(); st.renameScenario(variantName(base)); render(); return;
      }
      if (t.id === 'scenFlip'){
        var b2 = st.activeInputs.name;
        st.compareProgramScenario(); st.renameScenario(variantName(b2)); render(); return;
      }
      if (t.dataset.open){ st.selectScenario(t.dataset.open); render(); return; }
      if (t.dataset.dup){
        st.selectScenario(t.dataset.dup);
        var b3 = st.activeInputs.name;
        st.duplicateScenario(); st.renameScenario(variantName(b3)); render(); return;
      }
      if (t.dataset.ren){
        st.selectScenario(t.dataset.ren);
        var nm = prompt('Rename this scenario:', st.activeInputs.name);
        if (nm !== null) st.renameScenario(nm.trim() || autoName());
        render(); return;
      }
      if (t.dataset.del){
        if (confirm('Delete this scenario? It cannot be undone.')) st.deleteScenario(t.dataset.del);
        render(); return;
      }
      if (t.dataset.ver){ st.restoreVersion(Number(t.dataset.ver)); render(); return; }
      if (t.dataset.auto !== undefined && t.dataset.auto !== ''){ AUTO.restore(Number(t.dataset.auto)); render(); return; }
    });
    w.addEventListener('change', function(e){
      var st = suite(); if (!st) return;
      if (e.target.dataset.cmp){ st.toggleCompare(e.target.dataset.cmp); render(); }
    });
  }
  function open(){ build(); render(); $('#scenWrap').classList.add('on'); $('#scenScrim').classList.add('on'); }
  function close(){ var w = $('#scenWrap'); if (w) w.classList.remove('on'); var s = $('#scenScrim'); if (s) s.classList.remove('on'); }

  return { open:open, close:close, render:render, autoName:autoName, variantName:variantName };
})();

/* ================================================================== 8
   BOOT
   ================================================================== */
function boot(){
  buildNav();
  guardSkin();
  LOS.setSkin(LOS.skin());
  wrapRecalc();

  /* Keep the nav in step when either engine changes tab on its own —
     a dropped document routes to Documents, a warning opens Advanced. */
  if (typeof window.switchTab === 'function' && !window.switchTab.__losNav){
    var innerTab = window.switchTab;
    var wrapTab = function(t){
      var r = innerTab.apply(this, arguments);
      var key = 'c:' + (t === 'guide' ? 'summary' : t === 'paystub' ? 'docs' : t);
      if (key !== LOS.tab){ AUTO.commitIfDirty('tab change'); LOS.tab = key; paintNav(); setTimeout(function(){ renderSubs(key); }, 60); }
      return r;
    };
    wrapTab.__losNav = true;
    window.switchTab = wrapTab;
  }

  state('Starting…');
  hookSuite(0);
}

var suiteHooked = false;
function hookSuite(tries){
  var st = suite();
  if (!st){ if (tries < 300) setTimeout(function(){ hookSuite(tries+1); }, 50); return; }
  if (suiteHooked) return;
  suiteHooked = true;

  wrapProgram(st);

  /* setMode is the suite's tab switch. Same rule as the calculator: the
     pending autosave is written on the way out, never mid-edit. */
  if (!st.setMode.__los){
    var innerMode = st.setMode.bind(st);
    var wrapMode = function(id){
      var key = 's:' + id;
      if (key !== LOS.tab) AUTO.commitIfDirty('tab change');
      var r = innerMode(id);
      LOS.tab = key; paintNav(); setTimeout(function(){ renderSubs(key); }, 80);
      return r;
    };
    wrapMode.__los = true;
    st.setMode = wrapMode;
  }

  var rafPending = false;
  st.subscribe(function(){
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function(){
      rafPending = false;
      paintFigures();
      AUTO.observe();
      if (LOS.tab.charAt(0) === 's') renderSubs(LOS.tab);
      if ($('#scenWrap') && $('#scenWrap').classList.contains('on')) SCEN.render();
    });
  });

  /* Name a still-default scenario the moment there is enough to name it. */
  try {
    if (/^(Default scenario|New scenario|Scenario \d+)$/.test(st.activeInputs.name)) st.renameScenario(SCEN.autoName());
  } catch(e){}

  wrapRecalc();
  paintNav();
  renderSubs(LOS.tab);
  pushIncome(true);
  state('Ready');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* A late-arriving RECALC (the calculator defines it inside a later script
   block on some builds) still gets wrapped. */
var wrapTries = 0;
var wrapPoll = setInterval(function(){
  if (wrapRecalc() || ++wrapTries > 100) clearInterval(wrapPoll);
}, 100);

window.addEventListener('beforeunload', function(){ AUTO.commitIfDirty('closing the file'); });
})();
