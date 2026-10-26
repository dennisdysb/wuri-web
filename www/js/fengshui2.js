/* 风水模块 · 第二批（2026-10-26）：八宅＋玄空飞星排盘
 *
 * 引擎：window.WuriSoulFs（@soul-atelier/bazhai 0.2.1 + xuankong 0.3.0 +
 * core 0.6.1，MIT，vendored 于 js/vendor/soul-fengshui.js，逻辑未改）。
 * 本文件只做输入/呈现：坐向默认取罗盘档案 wuri_fs_house_v1（与第一批同键），
 * 页内可手选 24 山；进页时若用户未手改过坐向，则按当前档案重同步。
 * 引擎产出的繁体字串（星名/等第）经呈现层 txPoem 口径转换显示（简体模式
 * 走 t2s、繁体原样），引擎数据本身不动。
 * 门控：两页均 Pro——专页卡点击已过 WuriPro.requirePro('fengshui')，
 * 本文件 open 函数内再查一次（防直达）。
 */
(function () {
  'use strict';
  var F = window.WuriSoulFs;
  if (!F) return;
  function $(id) { return document.getElementById(id); }
  function T(k) { return window.t ? window.t(k) : k; }
  function TF(fmt) {
    var a = [fmt], i;
    for (i = 1; i < arguments.length; i++) a.push(arguments[i]);
    return window.tf ? window.tf.apply(null, a) : fmt;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function tx(s) { return window.txPoem ? window.txPoem(s) : s; }
  function toastMsg(m) {
    var t = document.getElementById('wuri-ai-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'wuri-ai-toast';
      t.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;z-index:10000;max-width:80%;text-align:center;';
      document.body.appendChild(t);
    }
    t.textContent = m;
    t.style.display = 'block';
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.style.display = 'none'; }, 3000);
  }

  var MT = window.FS24 || [];
  var MTN_NAMES = MT.map(function (m) { return m.name; });
  function facingOf(sitting) {
    var i = MTN_NAMES.indexOf(sitting);
    return i < 0 ? '' : MTN_NAMES[(i + 12) % 24];
  }
  function fillSittingSelect(sel, cur) {
    if (!sel || sel.options.length) { if (sel) sel.value = cur; return; }
    MTN_NAMES.forEach(function (n) {
      var o = document.createElement('option');
      o.value = n;
      o.textContent = n + '山' + facingOf(n) + '向';
      sel.appendChild(o);
    });
    sel.value = cur;
  }

  var ARCH_KEY = 'wuri_fs_house_v1';
  function loadArch() {
    try {
      var j = JSON.parse(localStorage.getItem(ARCH_KEY) || 'null');
      if (j && j.sitting && MTN_NAMES.indexOf(j.sitting) >= 0) return j;
    } catch (e) {}
    return null;
  }
  function store(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {} }
  function readStore(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }

  function gated() { return !window.WuriPro || WuriPro.isPro(); }
  function segSet(seg, val, attr) {
    if (!seg) return;
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.getAttribute(attr) === val);
    });
  }
  function gridCells(palaces, cellFn) {
    var sorted = palaces.slice().sort(function (a, b) {
      return (a.row - b.row) || (a.col - b.col);
    });
    return sorted.map(cellFn).join('');
  }
  function dirLine(p) { return esc(tx(p.direction)) + ' · ' + esc(tx(p.name)); }

  /* ================= 八宅 ================= */
  var BZ_KEY = 'wuri_fs_bazhai_v1';
  var BZ = { year: 1990, gender: 'male', sitting: '子', sittingDirty: false, view: 'house' };
  (function () {
    var s = readStore(BZ_KEY);
    if (s) {
      if (isFinite(s.year)) BZ.year = Math.min(2100, Math.max(1900, s.year | 0));
      if (s.gender === 'female' || s.gender === 'male') BZ.gender = s.gender;
      if (s.sitting && MTN_NAMES.indexOf(s.sitting) >= 0) { BZ.sitting = s.sitting; BZ.sittingDirty = true; }
      if (s.view === 'life' || s.view === 'house') BZ.view = s.view;
    }
  })();
  function bzSave() { store(BZ_KEY, { year: BZ.year, gender: BZ.gender, sitting: BZ.sittingDirty ? BZ.sitting : undefined, view: BZ.view }); }
  function bzSyncArch() {
    var a = loadArch();
    var hint = $('fs2-bz-noarch');
    if (hint) hint.hidden = !!a;
    if (a && !BZ.sittingDirty && BZ.sitting !== a.sitting) BZ.sitting = a.sitting;
    var sel = $('fs2-bz-sitting');
    if (sel) { fillSittingSelect(sel, BZ.sitting); sel.value = BZ.sitting; }
  }
  function renderBazhai() {
    var life = F.lifeGua(BZ.year, BZ.gender);
    var house = F.houseGua(BZ.sitting);
    var match = F.zhaiMingMatch(life, house);
    var grp = function (g) { return g === 'east' ? T('fs2_east') : T('fs2_west'); };
    var sum = $('fs2-bz-summary');
    if (sum) {
      sum.innerHTML =
        '<div class="fs2-sum-line"><span>' + esc(T('fs2_lifegua')) + '</span><b>' +
          esc(tx(life.name)) + ' · ' + esc(grp(life.group)) + esc(T('fs2_life_suffix')) + '</b></div>' +
        '<div class="fs2-sum-line"><span>' + esc(T('fs2_housegua')) + '</span><b>' +
          esc(tx(house.name)) + ' · ' + esc(grp(house.group)) + esc(T('fs2_house_suffix')) +
          '（' + esc(BZ.sitting) + '山' + esc(facingOf(BZ.sitting)) + '向）</b></div>' +
        '<div class="fs2-sum-line"><span></span><b class="' + (match.match ? 'fs2-ok' : 'fs2-warn') + '">' +
          esc(match.match ? T('fs2_match_ok') : T('fs2_match_no')) + '</b></div>' +
        '<p class="fs2-note">' + esc(TF(T('fs2_match_line'), grp(life.group) + T('fs2_life_suffix'), grp(house.group) + T('fs2_house_suffix'))) + '</p>';
    }
    var gua = BZ.view === 'house' ? house : life;
    var palaces = F.palacesFor(gua);
    var grid = $('fs2-bz-grid');
    if (grid) {
      var title = TF(T(BZ.view === 'house' ? 'fs2_grid_house' : 'fs2_grid_life'), tx(gua.name));
      /* 引擎只回 8 宫（伏位在主卦本宫）；中宫以主卦名填充，九宫方位靠显式定格 */
      grid.innerHTML = '<div class="fs2-grid-title">' + esc(title) + '</div>' + gridCells(palaces, function (p) {
        var good = p.star.kind === 'auspicious';
        return '<div class="fs2-cell ' + (good ? 'good' : 'bad') + '" style="grid-row:' + (p.row + 2) +
          ';grid-column:' + (p.col + 1) + '">' +
          '<div class="fs2-cell-dir">' + dirLine(p) + '</div>' +
          '<div class="fs2-cell-star">' + esc(tx(p.star.name)) + '</div>' +
          '<div class="fs2-cell-sub">' + esc(tx(p.star.grade)) + ' · ' + esc(tx(p.star.star)) + '</div></div>';
      }) + '<div class="fs2-cell fs2-center-cell" style="grid-row:3;grid-column:2">' +
        '<div class="fs2-cell-star">' + esc(tx(gua.name)) + '</div>' +
        '<div class="fs2-cell-sub">' + esc(grp(gua.group)) + '</div></div>';
    }
    var list = $('fs2-bz-list');
    if (list) {
      var byStar = {};
      palaces.forEach(function (p) { byStar[p.star.key] = p; });
      list.innerHTML = F.WANDERING_STARS.map(function (s) {
        var p = byStar[s.key];
        if (!p) return '';
        return '<div class="fs2-li"><b class="' + (s.kind === 'auspicious' ? 'fs2-ok' : 'fs2-warn') + '">' +
          esc(tx(s.name)) + '</b><span>' + esc(T('fs2_beidou')) + ' ' + esc(tx(s.star)) + ' · ' +
          esc(tx(s.effect)) + '</span><em>' + esc(tx(p.direction)) + '（' + esc(tx(p.name)) + '）</em></div>';
      }).join('');
    }
  }
  function openBazhai() {
    if (!gated()) { if (window.WuriPro) WuriPro.requirePro('fengshui'); return; }
    var v = $('view-bazhai');
    if (!v) return;
    bzSyncArch();
    var yi = $('fs2-bz-year'); if (yi) yi.value = BZ.year;
    segSet($('fs2-bz-gender'), BZ.gender, 'data-g');
    segSet($('fs2-bz-viewseg'), BZ.view, 'data-v');
    renderBazhai();
    v.hidden = false;
    window.scrollTo(0, 0);
  }
  function closeBazhai() { var v = $('view-bazhai'); if (v) v.hidden = true; }

  /* ================= 玄空飞星 ================= */
  var XK_KEY = 'wuri_fs_xk_v1';
  var XK = { sitting: '子', sittingDirty: false, year: new Date().getFullYear(), periodOv: 0, tab: 'natal' };
  (function () {
    var s = readStore(XK_KEY);
    if (s) {
      if (s.sitting && MTN_NAMES.indexOf(s.sitting) >= 0) { XK.sitting = s.sitting; XK.sittingDirty = true; }
      if (isFinite(s.year)) XK.year = Math.min(2100, Math.max(1864, s.year | 0));
      if (s.periodOv >= 1 && s.periodOv <= 9) XK.periodOv = s.periodOv | 0;
      if (s.tab === 'annual' || s.tab === 'monthly' || s.tab === 'natal') XK.tab = s.tab;
    }
  })();
  function xkSave() { store(XK_KEY, { sitting: XK.sittingDirty ? XK.sitting : undefined, year: XK.year, periodOv: XK.periodOv, tab: XK.tab }); }
  function xkSyncArch() {
    var a = loadArch();
    var hint = $('fs2-xk-noarch');
    if (hint) hint.hidden = !!a;
    if (a && !XK.sittingDirty && XK.sitting !== a.sitting) XK.sitting = a.sitting;
    var sel = $('fs2-xk-sitting');
    if (sel) { fillSittingSelect(sel, XK.sitting); sel.value = XK.sitting; }
  }
  function effPeriod() { return XK.periodOv || F.periodFromYear(XK.year); }
  function repYear(p) { return 1864 + (p - 1) * 20 + 10; }
  var STEMS = '甲乙丙丁戊己庚辛壬癸', BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
  function solarCtx() {
    var now = new Date();
    var out = { solarYear: now.getFullYear(), gzYear: '', yBranch: '', mBranch: '' };
    try {
      var ec = window.Solar.fromDate(now).getLunar().getEightChar();
      out.gzYear = ec.getYear();
      out.mBranch = ec.getMonth().charAt(1);
      out.yBranch = out.gzYear.charAt(1);
      for (var y = out.solarYear - 1; y <= out.solarYear + 1; y++) {
        if (STEMS.charAt(((y - 4) % 10 + 10) % 10) + BRANCHES.charAt(((y - 4) % 12 + 12) % 12) === out.gzYear) {
          out.solarYear = y; break;
        }
      }
    } catch (e) {}
    return out;
  }
  function starGrid(palacesNums, centerNum) {
    /* palacesNums: Chart 的 palaces（带 row/col）取 period 位，或 temporal 的 Record<key,number> */
    var cells = F.PALACES.map(function (pd) {
      var n = palacesNums[pd.key];
      var p = null;
      return { key: pd.key, name: pd.name, direction: pd.direction, row: pd.row, col: pd.col, n: n, p: p };
    });
    return gridCells(cells, function (c) {
      var isC = c.key === 'center';
      return '<div class="fs2-cell fs2-tcell' + (isC ? ' center' : '') + '" style="grid-row:' + (c.row + 1) +
        ';grid-column:' + (c.col + 1) + '">' +
        '<div class="fs2-cell-dir">' + (isC ? esc(T('fs2_center')) : dirLine(c)) + '</div>' +
        '<div class="fs2-cell-big">' + c.n + '</div></div>';
    });
  }
  function renderXuankong() {
    var p = effPeriod();
    var range = F.periodYearRange(repYear(p));
    var pNames = String(T('fs2_period_name')).split('|');
    var eff = $('fs2-xk-eff');
    if (eff) eff.textContent = TF(T('fs2_eff_line'), pNames[p - 1] || (p + ''), range[0], range[1]);
    var head = $('fs2-xk-head'), grid = $('fs2-xk-grid'), combos = $('fs2-xk-combos');
    if (!grid) return;
    if (XK.tab === 'natal') {
      var chart = F.buildChart(repYear(p), XK.sitting);
      if (head) head.innerHTML = '<b>' + esc(chart.label) + '</b><span>' + esc(pNames[p - 1] || '') +
        ' · ' + esc(tx(chart.formation)) + '</span>';
      grid.innerHTML = gridCells(chart.palaces, function (pl) {
        var isC = pl.key === 'center';
        return '<div class="fs2-cell fs2-xcell' + (isC ? ' center' : '') + '" style="grid-row:' + (pl.row + 1) +
          ';grid-column:' + (pl.col + 1) + '">' +
          '<div class="fs2-cell-dir">' + (isC ? esc(T('fs2_center')) : dirLine(pl)) + '</div>' +
          '<div class="fs2-xrow"><span class="fs2-xs"><i>' + esc(T('fs2_mtn')) + '</i>' + pl.mountain + '</span>' +
          '<span class="fs2-xs w"><i>' + esc(T('fs2_water')) + '</i>' + pl.water + '</span></div>' +
          '<div class="fs2-xperiod"><i>' + esc(T('fs2_period_star')) + '</i>' + pl.period + '</div></div>';
      });
      if (combos) {
        var html = '';
        if (chart.combinations && chart.combinations.length) {
          html = '<div class="fs2-combo-title">' + esc(T('fs2_combos')) + '</div>' + chart.combinations.map(function (cb) {
            return '<div class="fs2-combo"><b class="' + (cb.kind === 'auspicious' ? 'fs2-ok' : 'fs2-warn') + '">' +
              esc(tx(cb.name)) + '</b><span>' + esc(tx(cb.note)) + '</span></div>';
          }).join('');
        }
        combos.innerHTML = html;
      }
    } else {
      var ctx = solarCtx();
      var tc = XK.tab === 'annual' ? F.annualFlyingStars(ctx.solarYear)
        : F.monthlyFlyingStars(ctx.solarYear, ctx.yBranch, ctx.mBranch);
      if (head) {
        head.innerHTML = '<b>' + esc(XK.tab === 'annual'
          ? TF(T('fs2_annual_title'), ctx.solarYear, ctx.gzYear, tc.center)
          : TF(T('fs2_monthly_title'), ctx.solarYear, ctx.mBranch, tc.center)) + '</b>';
      }
      grid.innerHTML = starGrid(tc.palaces, tc.center);
      if (combos) combos.innerHTML = '';
    }
  }
  function openXuankong() {
    if (!gated()) { if (window.WuriPro) WuriPro.requirePro('fengshui'); return; }
    var v = $('view-xuankong');
    if (!v) return;
    xkSyncArch();
    var yi = $('fs2-xk-year'); if (yi) yi.value = XK.year;
    var ps = $('fs2-xk-period');
    if (ps) {
      if (!ps.options.length) {
        var pNames = String(T('fs2_period_name')).split('|');
        var o0 = document.createElement('option');
        o0.value = '0'; o0.textContent = T('fs2_period_auto');
        ps.appendChild(o0);
        for (var i = 1; i <= 9; i++) {
          var o = document.createElement('option');
          o.value = String(i); o.textContent = pNames[i - 1] || (i + '');
          ps.appendChild(o);
        }
      }
      ps.value = String(XK.periodOv || 0);
    }
    segSet($('fs2-xk-tabs'), XK.tab, 'data-v');
    renderXuankong();
    v.hidden = false;
    window.scrollTo(0, 0);
  }
  function closeXuankong() { var v = $('view-xuankong'); if (v) v.hidden = true; }

  /* ================= 接线 ================= */
  function bindSeg(id, attr, fn) {
    var seg = $(id);
    if (!seg) return;
    seg.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      segSet(seg, b.getAttribute(attr), attr);
      fn(b.getAttribute(attr));
    });
  }
  function gotoCompass() {
    /* 关本页回专页，再由专页档案卡进罗盘（与第一批路径一致） */
    closeBazhai(); closeXuankong();
    var hub = $('view-fengshui');
    if (hub) { hub.hidden = false; window.scrollTo(0, 0); }
    var go = $('fs-arch-go');
    if (go) go.click();
  }
  function init() {
    var bb = $('fs-bazhai-back'); if (bb) bb.addEventListener('click', closeBazhai);
    var xb = $('fs-xuankong-back'); if (xb) xb.addEventListener('click', closeXuankong);

    var yi = $('fs2-bz-year');
    if (yi) yi.addEventListener('change', function () {
      var v2 = parseInt(yi.value, 10);
      BZ.year = isFinite(v2) ? Math.min(2100, Math.max(1900, v2)) : BZ.year;
      yi.value = BZ.year; bzSave(); renderBazhai();
    });
    bindSeg('fs2-bz-gender', 'data-g', function (g) { BZ.gender = g; bzSave(); renderBazhai(); });
    bindSeg('fs2-bz-viewseg', 'data-v', function (v2) { BZ.view = v2; bzSave(); renderBazhai(); });
    var bs = $('fs2-bz-sitting');
    if (bs) bs.addEventListener('change', function () { BZ.sitting = bs.value; BZ.sittingDirty = true; bzSave(); renderBazhai(); });
    var bm = $('fs2-bz-measure'); if (bm) bm.addEventListener('click', gotoCompass);

    var xs = $('fs2-xk-sitting');
    if (xs) xs.addEventListener('change', function () { XK.sitting = xs.value; XK.sittingDirty = true; xkSave(); renderXuankong(); });
    var xm = $('fs2-xk-measure'); if (xm) xm.addEventListener('click', gotoCompass);
    var xy = $('fs2-xk-year');
    if (xy) xy.addEventListener('change', function () {
      var v2 = parseInt(xy.value, 10);
      XK.year = isFinite(v2) ? Math.min(2100, Math.max(1864, v2)) : XK.year;
      xy.value = XK.year; xkSave(); renderXuankong();
    });
    var xp = $('fs2-xk-period');
    if (xp) xp.addEventListener('change', function () { XK.periodOv = parseInt(xp.value, 10) || 0; xkSave(); renderXuankong(); });
    bindSeg('fs2-xk-tabs', 'data-v', function (v2) { XK.tab = v2; xkSave(); renderXuankong(); });

    if (window.__wuri_rerender) {
      var prev = window.__wuri_rerender;
      window.__wuri_rerender = function () {
        prev();
        var bv = $('view-bazhai'), xv = $('view-xuankong');
        if (bv && !bv.hidden) { bzSyncArch(); renderBazhai(); }
        if (xv && !xv.hidden) { xkSyncArch(); renderXuankong(); }
      };
    }
  }
  init();

  window.__wuriFs2 = {
    openBazhai: openBazhai,
    openXuankong: openXuankong,
    state: function () { return { bz: BZ, xk: XK, period: effPeriod() }; }
  };
})();
