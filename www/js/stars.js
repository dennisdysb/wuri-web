/* 戊日不上香 · 中国星象模块（v2.0.0）
 * 星官图鉴（s1 首页 / s2 区页 / s3 星官详情）＋《步天歌》典籍页（s5）＋首页今日星空卡（s4）。
 * 数据懒加载：首次打开星官图鉴才 fetch data/xingguan.json＋data/butiange.json（Promise 缓存）。
 * 数据文本（官名/歌诀/星名）不走 i18n，显示一律过 tx() 简繁转换；固定文案走 sx_* 键。
 * 值日宿显示与首页 zhishen-line 同源：lunar.getXiu()＋XINGSU28 映射全称；
 * 斗柄 monthBranch 传 EightChar 精确月建支（与 getPrevJieQi 口径逐日对照零差，见引擎说明验证）。 */
(function () {
  'use strict';

  var XG = null, BT = null, loadPromise = null;
  var secOrder = [];           /* 区序（《步天歌》序）：紫微垣…轸宿 */
  var secInfo = {};            /* section -> {name, region, list:[asterism], lines:[], lineCount} */
  var byKey = {};              /* key -> asterism（key = a.id 或 section|name，同名官跨区不撞） */
  var curSection = null, curKey = null;

  var $ = function (id) { return document.getElementById(id); };
  function T(s) { return window.tx ? window.tx(s == null ? '' : s) : (s == null ? '' : String(s)); }
  function t(k) { return window.t ? window.t(k) : k; }
  function tf() { return window.tf ? window.tf.apply(null, arguments) : String(arguments[0]); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function txEsc(s) { return esc(T(s)); }

  /* ---------------- 数据 ---------------- */
  function astKey(a) { return a.id || (a.section + '|' + a.name); }

  function indexData() {
    byKey = {}; secInfo = {}; secOrder = [];
    (BT.sections || []).forEach(function (s) {
      secInfo[s.section] = { name: s.section, region: '', list: [], lines: s.lines || [], lineCount: s.line_count || (s.lines || []).length };
      secOrder.push(s.section);
    });
    (XG.asterisms || []).forEach(function (a) {
      byKey[astKey(a)] = a;
      var si = secInfo[a.section];
      if (!si) { si = secInfo[a.section] = { name: a.section, region: '', list: [], lines: [], lineCount: 0 }; secOrder.push(a.section); }
      si.list.push(a);
      if (!si.region) si.region = a.region || '';
    });
  }

  function loadData() {
    if (XG && BT) return Promise.resolve(true);
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      fetch('data/xingguan.json').then(function (r) { if (!r.ok) throw new Error('xg'); return r.json(); }),
      fetch('data/butiange.json').then(function (r) { if (!r.ok) throw new Error('bt'); return r.json(); })
    ]).then(function (res) {
      XG = res[0]; BT = res[1]; indexData(); loadPromise = null;
      return true;
    }).catch(function (e) { loadPromise = null; throw e; });
    return loadPromise;
  }

  function loadingHTML() {
    return '<div class="sx-loading">' + esc(t('sx_loading')) + '</div>';
  }
  function failHTML(retryFnName) {
    return '<div class="sx-loading">' + esc(t('sx_load_fail')) +
      '<div style="margin-top:12px"><button class="btn primary" data-sx-retry="' + retryFnName + '">' + esc(t('sx_retry')) + '</button></div></div>';
  }

  /* ---------------- 神祇图鉴互链 ---------------- */
  function deityById(id) {
    var D = window.DEITIES_DATA; if (!D || !D.deities) return null;
    for (var i = 0; i < D.deities.length; i++) if (D.deities[i].id === id) return D.deities[i];
    return null;
  }
  function lordOfMansion(section) { /* section 形如「角宿」 */
    var D = window.DEITIES_DATA; if (!D || !D.deities) return null;
    for (var i = 0; i < D.deities.length; i++) if (D.deities[i].mansion === section) return D.deities[i];
    return null;
  }
  function openDeity(id) {
    if (!window.__wuri_openDeity) return;
    /* 神祇详情视图在 DOM 中位于星象视图之前（同 z-index 下星象视图会盖住详情），
     * 故先收起星象四视图、亮出图鉴列表垫底，详情返回即落回神祇图鉴。 */
    hide('view-stars'); hide('view-star-region'); hide('view-star-detail'); hide('view-butiange');
    show('view-deities');
    window.__wuri_openDeity(id);
  }

  function lordCardHTML(d, subText) {
    if (!d) return '';
    return '<div class="sx-card sx-link" data-sx-deity="' + esc(d.id) + '">' +
      '<img src="img/deities/' + esc(d.image) + '" alt="' + txEsc(d.name) + '">' +
      '<div><div class="l1">' + txEsc(d.name) + '</div><div class="l2">' + txEsc(subText || d.title) + '</div></div>' +
      '<div class="go">›</div></div>';
  }

  /* ---------------- 视图开关 ---------------- */
  function show(id) { var v = $(id); if (v) v.hidden = false; }
  function hide(id) { var v = $(id); if (v) v.hidden = true; }
  function scrollTopOf(id) { var v = $(id); if (v) v.scrollTop = 0; }

  function openHome() {
    hide('view-star-region'); hide('view-star-detail'); hide('view-butiange');
    show('view-stars');
    var host = $('sx-home');
    if (XG && BT) { renderHome(); scrollTopOf('view-stars'); return; }
    if (host) host.innerHTML = loadingHTML();
    loadData().then(function () { renderHome(); scrollTopOf('view-stars'); })
      .catch(function () { if (host) host.innerHTML = failHTML('home'); });
  }

  function resolveSection(key) { /* 区名直达；星君 link_key 经图鉴条目 mansion 转区名 */
    if (secInfo[key]) return key;
    var D = window.DEITIES_DATA;
    if (D && D.deities) for (var i = 0; i < D.deities.length; i++) {
      if (D.deities[i].link_key === key || D.deities[i].id === key) return D.deities[i].mansion;
    }
    return key;
  }

  function openRegion(section) {
    if (!section) return;
    if (XG && !secInfo[section] && !lordOfMansion(section)) section = resolveSection(section);
    if (XG && !secInfo[section]) return;
    hide('view-star-detail');
    show('view-stars'); show('view-star-region');
    var host = $('sx-region');
    if (XG && BT) { renderRegion(section); scrollTopOf('view-star-region'); return; }
    if (host) host.innerHTML = loadingHTML();
    loadData().then(function () {
      section = resolveSection(section);
      renderHome();
      if (secInfo[section]) { renderRegion(section); scrollTopOf('view-star-region'); }
    }).catch(function () { if (host) host.innerHTML = failHTML('region:' + section); });
  }

  function openDetail(key) {
    show('view-stars'); show('view-star-detail');
    var host = $('sx-detail');
    if (XG && BT) { renderDetail(key); scrollTopOf('view-star-detail'); return; }
    if (host) host.innerHTML = loadingHTML();
    loadData().then(function () { renderHome(); renderDetail(key); scrollTopOf('view-star-detail'); })
      .catch(function () { if (host) host.innerHTML = failHTML('detail:' + key); });
  }

  function openButiange(section) {
    hide('view-star-detail'); /* 详情视图 DOM 在典籍页之后，不收起会盖住典籍页 */
    show('view-butiange');
    var host = $('sx-book');
    if (XG && BT) { renderBook(section); return; }
    if (host) host.innerHTML = loadingHTML();
    loadData().then(function () { renderBook(section); })
      .catch(function () { if (host) host.innerHTML = failHTML('book'); });
  }

  /* deities.js 的「本宿星官 ›」签入口：key 为星君 link_key（如 jiaomujiao）或区名 */
  window.__wuri_openStarRegion = function (key) {
    if (!key) return;
    if (secInfo[key] || !XG) { openRegion(key); return; }
    var D = window.DEITIES_DATA, mansion = null;
    if (D && D.deities) for (var i = 0; i < D.deities.length; i++) {
      if (D.deities[i].link_key === key || D.deities[i].id === key) { mansion = D.deities[i].mansion; break; }
    }
    if (mansion) openRegion(mansion);
  };
  window.__wuri_openStarDetail = openDetail;
  window.__wuri_openButiange = openButiange;

  /* ---------------- 今日值日宿（与首页同源） ---------------- */
  function todayXiu() {
    try {
      var lunar = Solar.fromDate(new Date()).getLunar();
      var xiu = lunar.getXiu();
      var xs = (typeof XINGSU28 !== 'undefined' && XINGSU28[xiu]) || { group: '', desc: '' };
      var full = xs.desc ? xs.desc.split('，')[0] : (xiu + '宿');
      return { xiu: xiu, full: full, group: xs.group, lord: lordOfMansion(xiu + '宿') };
    } catch (e) { return null; }
  }

  /* ---------------- s1 星官图鉴首页 ---------------- */
  var YUAN = ['紫微垣', '太微垣', '天市垣'];
  var QUAD = ['东方苍龙', '北方玄武', '西方白虎', '南方朱雀'];

  function badgesHTML(a) {
    var h = '';
    if (a.qing_variant) h += '<span class="sx-badge dual">' + esc(t('sx_dual')) + '</span>';
    if (a.status === '存疑') h += '<span class="sx-badge doubt">' + esc(t('sx_doubt')) + '</span>';
    return h;
  }

  function renderHome() {
    var host = $('sx-home'); if (!host || !XG) return;
    var total = XG.asterisms.length;
    var det = 0, doubt = 0, dual = 0;
    XG.asterisms.forEach(function (a) {
      if (a.status === '确定') det++; if (a.status === '存疑') doubt++; if (a.qing_variant) dual++;
    });
    var tx1 = todayXiu();
    var h = '';
    h += '<div class="sx-kicker">' + esc(t('sx_kicker')) + '</div>';
    h += '<div class="sx-title">' + esc(t('sx_home_title')) + '</div>';
    h += '<div class="sx-sub">' + txEsc(tf(t('sx_data_line'), total, secOrder.length)) + '<br>' +
      txEsc(tf(t('sx_data_line2'), det, doubt, dual)) + '</div>';

    /* 今日值日宿条 */
    if (tx1) {
      h += '<div class="sx-card sx-today" data-sx-todaylord="' + (tx1.lord ? esc(tx1.lord.id) : '') + '">';
      if (tx1.lord) h += '<img src="img/deities/' + esc(tx1.lord.image) + '" alt="' + txEsc(tx1.full) + '">';
      h += '<div><div class="t1">' + esc(t('sx_today_xiu')) + '</div>' +
        '<div class="t2">' + txEsc(tx1.full) + '</div>' +
        '<div class="t3">' + txEsc(tx1.group + ' · ' + tx1.xiu + '宿 · 值日') + '</div></div>' +
        '<div class="go" data-sx-gosky="1">' + esc(t('sx_today_sky')) + '</div></div>';
    }

    /* 三垣 */
    h += '<div class="sx-sec">' + esc(t('sx_sanyuan')) + ' <small>' + esc(t('sx_sanyuan_note')) + '</small></div>';
    YUAN.forEach(function (y) {
      var si = secInfo[y]; if (!si) return;
      var first = si.lines.length ? si.lines[0].text : '';
      var reps = si.list.slice(0, 3).map(function (a) { return a.name; }).join(' · ');
      h += '<div class="sx-card sx-yuan" data-sx-region="' + esc(y) + '">' +
        '<div class="sx-yuan-top"><span class="sx-yuan-name">' + txEsc(y) + '</span>' +
        '<span class="sx-yuan-n">' + txEsc(tf(t('sx_asterisms_n'), si.list.length)) + '</span></div>' +
        '<div class="sx-yuan-verse">' + txEsc(first) + '</div>' +
        '<div class="sx-yuan-note">' + txEsc(reps) + '</div></div>';
    });

    /* 二十八宿四象 */
    h += '<div class="sx-sec">' + esc(t('sx_xiu28')) + ' <small>' + esc(t('sx_xiu28_note')) + '</small></div>';
    QUAD.forEach(function (q) {
      var mansions = secOrder.filter(function (s) { return secInfo[s].region === q; });
      var sum = 0; mansions.forEach(function (s) { sum += secInfo[s].list.length; });
      h += '<div class="sx-group"><div class="sx-group-head"><span class="sx-group-name">' + txEsc(q) + '</span>' +
        '<span class="sx-group-n">' + txEsc(tf(t('sx_asterisms_n'), sum)) + '</span></div><div class="sx-chips">';
      mansions.forEach(function (s) {
        h += '<span class="sx-chip" data-sx-region="' + esc(s) + '">' + txEsc(s.replace(/宿$/, '')) + '<i>' + secInfo[s].list.length + '</i></span>';
      });
      h += '</div></div>';
    });

    /* 底部双入口 */
    var lord0 = lordOfMansion('角宿');
    h += '<div class="sx-duo">' +
      '<div class="sx-card sx-entry" data-sx-book="1"><div><div class="e1">' + esc(t('sx_entry_book')) + '</div>' +
      '<div class="e2">' + txEsc(tf(t('sx_entry_book_sub'), BT.total_lines)) + '</div></div></div>' +
      '<div class="sx-card sx-entry" data-sx-lords="1">' +
      (lord0 ? '<img src="img/deities/' + esc(lord0.image) + '" alt="">' : '') +
      '<div><div class="e1">' + esc(t('sx_entry_lords')) + '</div><div class="e2">' + esc(t('sx_entry_lords_sub')) + '</div></div></div>' +
      '</div>';
    host.innerHTML = h;
  }

  /* ---------------- s2 区页 ---------------- */
  var regionState = { section: null, expanded: false, query: '' };

  function regionRowsHTML(si) {
    var q = regionState.query.trim();
    var list = si.list;
    if (q) {
      list = list.filter(function (a) {
        if (a.name.indexOf(q) >= 0) return true;
        return (a.verses || []).join(' ').indexOf(q) >= 0;
      });
    }
    var shown = (q || regionState.expanded) ? list : list.slice(0, 13);
    var h = '';
    if (!list.length) h += '<div class="sx-loading">' + esc(t('sx_no_result')) + '</div>';
    shown.forEach(function (a) {
      h += '<div class="sx-row" data-sx-detail="' + esc(astKey(a)) + '">' +
        '<div class="sx-row-main"><span class="sx-row-name">' + txEsc(a.name) + '</span>' +
        '<span class="sx-row-verse">' + txEsc((a.verses || [])[0] || '') + '</span></div>' +
        '<div class="sx-row-side">' + badgesHTML(a) +
        '<span class="sx-row-n">' + txEsc(tf(t('sx_stars_n'), a.star_count_tradition)) + '</span></div></div>';
    });
    if (!q && list.length > 13) {
      h += '<div class="sx-more" data-sx-more="1">' +
        (regionState.expanded ? esc(t('sx_less')) : txEsc(tf(t('sx_more'), list.length - 13))) + '</div>';
    }
    return h;
  }

  function renderRegion(section) {
    var si = secInfo[section]; if (!si) return;
    curSection = section;
    regionState = { section: section, expanded: false, query: '' };
    var isYuan = YUAN.indexOf(section) >= 0;
    var lead = si.lines.slice(0, 2).map(function (l) { return l.text; }).join('，');
    var h = '';
    h += '<div class="sx-crumb">' + esc(t('sx_crumb_home')) + ' › ' + txEsc(isYuan ? t('sx_sanyuan') : si.region) + '</div>';
    h += '<div class="sx-title" style="margin-top:8px">' + txEsc(section) + '</div>';
    h += '<div class="sx-sub">' + txEsc(tf(t('sx_region_n'), si.list.length, si.lineCount)) + '</div>';

    if (!isYuan) {
      var lord = lordOfMansion(section);
      if (lord) h += '<div style="margin-top:12px">' + lordCardHTML(lord, lord.title + ' · ' + t('sx_lord_card')) + '</div>';
    }
    if (section === '紫微垣') {
      var zw = deityById('ziwei');
      if (zw) h += '<div style="margin-top:12px">' + lordCardHTML(zw, t('sx_deity_link') + ' · ' + zw.title) + '</div>';
    }

    if (lead) {
      h += '<div class="sx-card sx-lead" data-sx-booksec="' + esc(section) + '">' + txEsc(lead) + '。' +
        '<small>' + txEsc(tf(t('sx_lead_hint'), section)) + '</small></div>';
    }
    h += '<div class="sx-search"><input id="sx-region-q" type="search" placeholder="' + esc(t('sx_search_ph')) + '" aria-label="' + esc(t('sx_search_ph')) + '"></div>';
    h += '<div id="sx-region-rows">' + regionRowsHTML(si) + '</div>';
    $('sx-region').innerHTML = h;
    var q = $('sx-region-q');
    if (q) q.addEventListener('input', function () {
      regionState.query = q.value;
      var rows = $('sx-region-rows');
      if (rows) rows.innerHTML = regionRowsHTML(si);
    });
  }

  /* ---------------- s3 星官详情 ---------------- */
  var QING_RE = /([一-鿿]{2,5})＝(.{1,24}?)（HR\s*(\d+)[，,]\s*RA\s*(-?[\d.]+)°[，,]\s*Dec\s*(-?[\d.]+)°[，,]\s*V\s*(-?[\d.]+)）/g;
  function parseQing(a) {
    var q = a.qing_variant || '', out = [], m;
    QING_RE.lastIndex = 0;
    while ((m = QING_RE.exec(q))) {
      out.push({ cn_name: m[1], designation: m[2].replace(/\s+$/, ''), HR: +m[3], ra_deg: +m[4], dec_deg: +m[5], vmag: +m[6], note: '' });
    }
    return out;
  }
  function qingTitle(a) {
    return (a.qing_variant || '').indexOf('續編') >= 0 || (a.qing_variant || '').indexOf('续编') >= 0
      ? t('sx_qing_caliber2') : t('sx_qing_caliber');
  }

  function starTableHTML(title, note, stars) {
    var h = '<div class="sx-card sx-calib"><div class="sx-calib-head">' + esc(title) +
      (note ? '<small>' + esc(note) + '</small>' : '') + '</div>';
    h += '<div class="sx-ct-head"><span>' + esc(t('sx_col_star')) + '</span><span>' + esc(t('sx_col_west')) + '</span><span>' + esc(t('sx_col_mag')) + '</span></div>';
    (stars || []).forEach(function (s) {
      h += '<div class="sx-ct-row"><span>' + txEsc(s.cn_name) +
        (s.note ? '<small class="sx-ct-note">' + txEsc(s.note) + '</small>' : '') +
        '</span><span class="sx-ct-d">' + esc(s.designation || '') + '</span><span>' +
        (typeof s.vmag === 'number' ? s.vmag.toFixed(2) : '—') + '</span></div>';
    });
    if (!stars || !stars.length) h += '<div class="sx-ct-row"><span>—</span><span></span><span></span></div>';
    return h + '</div>';
  }

  function plotSVG(a, qingStars) {
    function has(s) { return typeof s.ra_deg === 'number' && typeof s.dec_deg === 'number'; }
    var main = (a.stars || []).filter(has);
    var qing = (qingStars || []).filter(has);
    var all = main.concat(qing);
    if (!all.length) return '<div class="sx-note">' + esc(t('sx_plot_none')) + '</div>';
    var W = 320, H = 228, pL = 14, pR = 14, pT = 18, pB = 30;
    var minRA = 1e9, maxRA = -1e9, minDec = 1e9, maxDec = -1e9;
    all.forEach(function (s) {
      minRA = Math.min(minRA, s.ra_deg); maxRA = Math.max(maxRA, s.ra_deg);
      minDec = Math.min(minDec, s.dec_deg); maxDec = Math.max(maxDec, s.dec_deg);
    });
    var spanRA = Math.max(maxRA - minRA, 1), spanDec = Math.max(maxDec - minDec, 1);
    function X(ra) { return pL + (maxRA - ra) / spanRA * (W - pL - pR); }   /* 赤经向左递增 */
    function Y(dec) { return pT + (maxDec - dec) / spanDec * (H - pT - pB); }
    function R(mag) { return Math.max(1.6, Math.min(8.6, 6.6 - (typeof mag === 'number' ? mag : 3) * 0.85)); }
    var qDes = {}; qing.forEach(function (s) { qDes[s.designation] = 1; });
    var mDes = {}; main.forEach(function (s) { mDes[s.designation] = 1; });
    function lineFor(list, cls) {
      if (list.length < 2) return '';
      var pts = list.slice().sort(function (x, y) { return x.ra_deg - y.ra_deg; })
        .map(function (s) { return X(s.ra_deg).toFixed(1) + ',' + Y(s.dec_deg).toFixed(1); }).join(' ');
      return '<polyline class="' + cls + '" points="' + pts + '" fill="none"/>';
    }
    function labelFor(s, extra, ghost, idx) {
      var x = X(s.ra_deg), y = Y(s.dec_deg), r = R(s.vmag);
      var right = x > W * 0.52;
      var txp = right ? x - r - 5 : x + r + 5;
      var anchor = right ? 'end' : 'start';
      var dy = (idx % 2 === 0) ? -4 : 14;
      var yy = Math.max(11, Math.min(H - pB - 14, y + dy));
      var name = s.cn_name + (extra || '');
      return '<text class="sx-plot-t" text-anchor="' + anchor + '" x="' + txp.toFixed(1) + '" y="' + yy.toFixed(1) + '">' + txEsc(name) + '</text>' +
        '<text class="sx-plot-s" text-anchor="' + anchor + '" x="' + txp.toFixed(1) + '" y="' + (yy + 13).toFixed(1) + '">' +
        esc((s.designation || '') + ' · ' + (typeof s.vmag === 'number' ? s.vmag.toFixed(2) : '—')) + '</text>';
    }
    var h = '<svg class="sx-plot" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + txEsc(a.name) + '">';
    h += lineFor(main, 'sx-plot-line') + lineFor(qing, 'sx-plot-dash');
    qing.forEach(function (s, i) {
      if (mDes[s.designation]) return; /* 共有星在主口径点上标注 */
      var x = X(s.ra_deg), y = Y(s.dec_deg), r = R(s.vmag);
      h += '<circle class="sx-star ghost" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '"/>';
      h += labelFor(s, '（' + t('sx_qing_short') + '）', true, i);
    });
    main.forEach(function (s, i) {
      var x = X(s.ra_deg), y = Y(s.dec_deg), r = R(s.vmag);
      var shared = !!qDes[s.designation];
      if (shared) h += '<circle class="sx-star-ring" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r + 3.2).toFixed(1) + '"/>';
      h += '<circle class="sx-star" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '"/>';
      h += labelFor(s, shared ? ' · ' + t('sx_plot_shared') : '', false, i);
    });
    h += '<text class="sx-plot-s" x="8" y="' + (H - 8) + '">' + esc(t('sx_plot_note')) + '</text>';
    return h + '</svg>';
  }

  function countingNote(a) {
    if (a.counting_note) return a.counting_note;
    var si = secInfo[a.section]; if (!si) return '';
    for (var i = 0; i < si.lines.length; i++) {
      var l = si.lines[i];
      if (!l.asterism || l.asterism.indexOf(a.name) < 0 || l.asterism.indexOf('、') < 0) continue;
      var m = /([一二三四五六七八九十百廿卅]+)星/.exec(l.text);
      if (m) return tf(t('sx_count_note_cosung'), l.text, l.asterism, m[1], a.star_count_tradition);
    }
    return '';
  }

  var STRONG_LINKS = { '北斗': ['beidou', 'doumu'], '南斗': ['nandou'], '日': ['taiyang'], '月': ['taiyin'] };

  function renderDetail(key) {
    var a = byKey[key]; if (!a) return;
    curKey = key;
    var si = secInfo[a.section] || { list: [] };
    var isYuan = YUAN.indexOf(a.section) >= 0;
    var qingStars = parseQing(a);
    var h = '';
    h += '<div class="sx-crumb">' + esc(t('sx_crumb_home')) + ' › ' + txEsc(isYuan ? t('sx_sanyuan') : a.region) + ' › ' + txEsc(a.section) + '</div>';
    h += '<div class="sx-title" style="margin-top:8px">' + txEsc(a.name) +
      '<span class="sx-badges">' + badgesHTML(a) + '</span></div>';
    h += '<div class="sx-sub">' + txEsc(a.section + '区 · ' + tf(t('sx_stars_n'), a.star_count_tradition)) + '</div>';

    /* 歌诀卡 */
    h += '<div class="sx-card sx-lead">' + (a.verses || []).map(function (v) { return txEsc(v); }).join('<br>') +
      '<small>' + txEsc(tf(t('sx_verse_from'), a.section)) + '</small>';
    var cn = countingNote(a);
    if (cn) h += '<div class="sx-count-note">' + txEsc(cn) + '</div>';
    h += '</div>';

    h += plotSVG(a, qingStars);
    h += starTableHTML(t('sx_main_caliber'), t('sx_main_caliber_note'), a.stars);
    if (a.qing_variant) {
      if (qingStars.length) {
        h += starTableHTML(qingTitle(a), '', qingStars);
        h += '<div class="sx-qing-prose">' + txEsc(a.qing_variant) + '</div>';
      } else {
        h += '<div class="sx-card sx-calib qing"><div class="sx-calib-head">' + esc(qingTitle(a)) + '</div>' +
          '<div class="sx-qing-prose in">' + txEsc(a.qing_variant) + '</div></div>';
      }
    }
    if (a.dispute) {
      h += '<div class="sx-note"><b>' + esc(a.qing_variant ? t('sx_dispute_dual') : t('sx_dispute')) + '：</b>' + txEsc(a.dispute) +
        (a.basis ? '<br><b>' + esc(t('sx_basis')) + '：</b>' + txEsc(a.basis) : '') + '</div>';
    } else if (a.basis) {
      h += '<div class="sx-note"><b>' + esc(t('sx_basis')) + '：</b>' + txEsc(a.basis) + '</div>';
    }

    /* 互链 */
    var links = '';
    if (!isYuan) {
      var lord = lordOfMansion(a.section);
      if (lord) links += lordCardHTML(lord, a.section + ' · ' + t('sx_lord_card'));
    }
    (STRONG_LINKS[a.name] || []).forEach(function (id) {
      var d = deityById(id);
      if (d) links += lordCardHTML(d, t('sx_deity_link') + ' · ' + d.title);
    });
    if (links) h += '<div class="sx-sec">' + esc(t('sx_links')) + '</div>' + links;

    var others = si.list.filter(function (x) { return astKey(x) !== key; });
    if (others.length) {
      h += '<div class="sx-chips" style="margin-top:14px">';
      others.forEach(function (x) {
        h += '<span class="sx-chip" data-sx-detail="' + esc(astKey(x)) + '">' + txEsc((isYuan ? '' : '同' + a.section.replace(/宿$/, '') + ' · ') + x.name) + '</span>';
      });
      h += '</div>';
    }
    $('sx-detail').innerHTML = h;
  }

  /* ---------------- s5 《步天歌》典籍页 ---------------- */
  var bookOpen = {}; /* section -> 是否展开 */

  function renderBook(focusSection) {
    var host = $('sx-book'); if (!host || !BT) return;
    if (focusSection) bookOpen[focusSection] = true;
    else if (!Object.keys(bookOpen).length && secOrder.length) bookOpen[secOrder[0]] = true;
    var auth = (BT.authorship || '').split('（')[0];
    var h = '';
    h += '<div class="sx-band"><div class="sx-kicker">' + esc(t('sx_book_kicker')) + '</div>' +
      '<div class="sx-title">' + txEsc(BT.title || '步天歌') + '</div>' +
      '<div class="sx-sub">' + txEsc(auth + ' · ' + (BT.version || '')) + '<br>' +
      txEsc(tf(t('sx_book_sub'), BT.total_lines, secOrder.length)) + '</div></div>';

    h += '<div class="sx-sec">' + esc(t('sx_toc')) + ' <small>' + esc(t('sx_toc_note')) + '</small></div><div class="sx-toc">';
    secOrder.forEach(function (s) {
      h += '<span data-sx-toc="' + esc(s) + '">' + txEsc(s) + '<i>' + (secInfo[s] ? secInfo[s].lineCount : 0) + '</i></span>';
    });
    h += '</div>';

    secOrder.forEach(function (s) {
      var si = secInfo[s]; if (!si) return;
      var open = !!bookOpen[s];
      h += '<div class="sx-booksec" id="sx-sec-' + esc(s) + '">' +
        '<div class="sx-sec" data-sx-toc="' + esc(s) + '">' + txEsc(s) + ' <small>' + txEsc(tf(t('sx_section_lines'), si.lineCount)) + '</small>' +
        '<span class="sx-toregion" data-sx-region="' + esc(s) + '">' + esc(t('sx_to_region')) + '</span></div>';
      if (open) {
        si.lines.forEach(function (l) {
          var isStar = l.kind === '星官句' && l.asterism;
          h += '<div class="sx-verse' + (isStar ? '' : ' dim') + '"><span class="sx-verse-t">' + txEsc(l.text) + '</span>';
          if (isStar) {
            h += '<span class="sx-verse-tags">';
            l.asterism.split('、').forEach(function (nm) {
              var target = si.list.filter(function (x) { return x.name === nm; })[0];
              if (target) h += '<span class="sx-verse-tag" data-sx-detail="' + esc(astKey(target)) + '">' + txEsc(nm) + '</span>';
              else h += '<span class="sx-verse-tag off">' + txEsc(nm) + '</span>';
            });
            h += '</span>';
          } else if (l.kind) {
            h += '<span class="sx-verse-kind">' + txEsc(l.kind.indexOf('回指') === 0 ? t('sx_kind_ref') : t('sx_kind_struct')) + '</span>';
          }
          h += '</div>';
        });
      } else {
        h += '<div class="sx-verse more" data-sx-toc="' + esc(s) + '">' + txEsc(tf(t('sx_section_lines'), si.lineCount)) + ' · ' + esc(t('sx_expand')) + '</div>';
      }
      h += '</div>';
    });

    h += '<div class="sx-foot">' + txEsc(BT.collation_note || '') + '</div>';
    host.innerHTML = h;
    if (focusSection) {
      var el = $('sx-sec-' + focusSection);
      if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 30);
    }
  }

  /* ---------------- 首页今日星空卡（s4） ---------------- */
  var SEASON_QUOTE = { '春': '斗柄东指，天下皆春', '夏': '斗柄南指，天下皆夏', '秋': '斗柄西指，天下皆秋', '冬': '斗柄北指，天下皆冬' };
  var DIR8_POS = [ /* [名, 角度(子=0顺时针)] */
    ['北', 0], ['东北', 45], ['东', 90], ['东南', 135], ['南', 180], ['西南', 225], ['西', 270], ['西北', 315]
  ];

  function compassSVG(dip) {
    var cx = 90, cy = 90;
    function pt(r, deg) {
      var a = deg * Math.PI / 180;
      return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    }
    var h = '<svg class="sx-compass" viewBox="0 0 180 180" role="img" aria-label="' + esc(t('sx_dipper')) + '">';
    h += '<circle class="sx-comp-ring" cx="90" cy="90" r="80"/><circle class="sx-comp-ring2" cx="90" cy="90" r="50"/>';
    DIR8_POS.forEach(function (d) {
      var p = pt(68, d[1]);
      var main = (d[1] % 90 === 0);
      h += '<text class="sx-comp-d' + (main ? ' main' : '') + '" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 4).toFixed(1) + '" text-anchor="middle">' + esc(d[0]) + '</text>';
    });
    var DZ = (window.WuriTodaySky && WuriTodaySky.DIZHI) || ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    DZ.forEach(function (z, i) {
      var p = pt(40, i * 30);
      var hot = (z === dip.monthBranch);
      h += '<text class="sx-comp-b' + (hot ? ' hot' : '') + '" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 3).toFixed(1) + '" text-anchor="middle">' + esc(z) + '</text>';
    });
    var tip = pt(58, dip.pointingIndex * 30);
    var back = pt(-14, dip.pointingIndex * 30);
    var perp = (dip.pointingIndex * 30 + 90) * Math.PI / 180;
    var b1 = [back[0] + 7 * Math.sin(perp), back[1] - 7 * Math.cos(perp)];
    var b2 = [back[0] - 7 * Math.sin(perp), back[1] + 7 * Math.cos(perp)];
    h += '<polygon class="sx-needle" points="' + tip[0].toFixed(1) + ',' + tip[1].toFixed(1) + ' ' +
      b1[0].toFixed(1) + ',' + b1[1].toFixed(1) + ' ' + b2[0].toFixed(1) + ',' + b2[1].toFixed(1) + '"/>';
    h += '<circle class="sx-comp-c" cx="90" cy="90" r="3.5"/></svg>';
    return h;
  }

  function moonSVG(moon) {
    var illum = moon.illumination, waxing = moon.elongationDeg <= 180;
    var r = 40, rx = Math.max(0.5, Math.abs(2 * illum - 1) * r);
    var sweep = (2 * illum - 1) > 0 ? 1 : 0;
    var dark = 'M 50 10 A 40 40 0 0 0 50 90 A ' + rx.toFixed(1) + ' 40 0 0 ' + sweep + ' 50 10 Z';
    var inner = '<circle class="sx-moon-lit" cx="50" cy="50" r="40"/><path class="sx-moon-dark" d="' + dark + '"/>';
    if (!waxing) inner = '<g transform="translate(100,0) scale(-1,1)">' + inner + '</g>';
    return '<svg class="sx-moon" viewBox="0 0 100 100" role="img" aria-label="' + txEsc(moon.phaseName) + '">' + inner + '</svg>';
  }

  function exactMonthBranch(sn) {
    try {
      var m = Solar.fromDate(sn).getLunar().getEightChar().getMonth();
      var zhi = m.charAt(m.length - 1);
      var DZ = (window.WuriTodaySky && WuriTodaySky.DIZHI) || [];
      var idx = DZ.indexOf(zhi);
      return idx >= 0 ? idx : undefined;
    } catch (e) { return undefined; }
  }

  function renderTodaySky() {
    var card = $('today-sky-card'); if (!card) return;
    if (!window.WuriTodaySky || typeof Solar === 'undefined') return;
    var sn = (typeof solarNow === 'function') ? solarNow() : new Date();
    var tx1 = todayXiu();
    var dip = WuriTodaySky.dipperOf(sn, { monthBranch: exactMonthBranch(sn) });
    var moon = WuriTodaySky.moonPhaseOf(sn);
    var img = $('sx-sky-img'), nameEl = $('sx-sky-xiu'), subEl = $('sx-sky-xiu-sub');
    if (tx1) {
      if (img) {
        if (tx1.lord) { img.src = 'img/deities/' + tx1.lord.image; img.hidden = false; }
        else img.hidden = true;
      }
      if (nameEl) nameEl.textContent = T(tx1.full);
      if (subEl) subEl.textContent = T(tf(t('sx_sky_xiu_sub'), tx1.group, tx1.xiu + '宿'));
      card.setAttribute('data-sx-lord', tx1.lord ? tx1.lord.id : '');
    }
    var comp = $('sx-sky-compass'); if (comp) comp.innerHTML = compassSVG(dip);
    var dBig = $('sx-sky-dipper-big');
    if (dBig) dBig.textContent = T(dip.direction8 + ' · ' + dip.pointingBranch);
    var dSub = $('sx-sky-dipper-sub');
    if (dSub) dSub.innerHTML = esc(T(tf(t('sx_hour_month'), dip.hourBranch, dip.monthBranch))) +
      '<br>「' + esc(T(SEASON_QUOTE[dip.season] || dip.quote || '')) + '」';
    var mSvg = $('sx-sky-moon'); if (mSvg) mSvg.innerHTML = moonSVG(moon);
    var mBig = $('sx-sky-moon-big'); if (mBig) mBig.textContent = T(moon.phaseName);
    var mSub = $('sx-sky-moon-sub');
    if (mSub) mSub.textContent = T(tf(t('sx_moon_age'), moon.ageDays) + ' · ' + tf(t('sx_moon_illum'), moon.illuminationPct));
  }

  /* ---------------- 经文库「典籍 · 天文」分架 ---------------- */
  function injectShelf() {
    var list = $('jing-list'); if (!list) return;
    if ($('sx-jing-shelf')) return;
    var div = document.createElement('div');
    div.id = 'sx-jing-shelf';
    div.className = 'sx-shelf';
    div.innerHTML = '<div class="sx-shelf-in"><div class="sx-shelf-k">' + esc(t('sx_shelf_kicker')) + '</div>' +
      '<div class="sx-shelf-t">' + esc(t('sx_shelf_title')) + '</div>' +
      '<div class="sx-shelf-n">' + esc(t('sx_shelf_note')) + '</div></div><div class="sx-shelf-go">›</div>';
    div.addEventListener('click', function () { openButiange(); });
    list.appendChild(div);
  }
  function watchShelf() {
    var list = $('jing-list'); if (!list || !window.MutationObserver) { injectShelf(); return; }
    injectShelf();
    new MutationObserver(function () { injectShelf(); }).observe(list, { childList: true });
  }

  /* ---------------- 全局点击委托 ---------------- */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-sx-region],[data-sx-detail],[data-sx-deity],[data-sx-book],[data-sx-booksec],[data-sx-lords],[data-sx-todaylord],[data-sx-more],[data-sx-toc],[data-sx-retry],[data-sx-gosky]') : null;
    if (!el) return;
    if (el.hasAttribute('data-sx-gosky')) {
      e.stopPropagation();
      var tabBtn = document.querySelector('#tabbar button[data-tab="tab-home"]');
      if (tabBtn) tabBtn.click();
      setTimeout(function () {
        var c = $('today-sky-card');
        if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
      return;
    }
    if (el.hasAttribute('data-sx-retry')) {
      var what = el.getAttribute('data-sx-retry');
      if (what === 'home') openHome();
      else if (what.indexOf('region:') === 0) openRegion(what.slice(7));
      else if (what.indexOf('detail:') === 0) openDetail(what.slice(7));
      else if (what === 'book') openButiange();
      return;
    }
    if (el.hasAttribute('data-sx-more')) {
      regionState.expanded = !regionState.expanded;
      var si = secInfo[regionState.section];
      var rows = $('sx-region-rows');
      if (si && rows) rows.innerHTML = regionRowsHTML(si);
      return;
    }
    if (el.hasAttribute('data-sx-toc')) {
      var sec = el.getAttribute('data-sx-toc');
      bookOpen[sec] = true;
      renderBook(sec);
      return;
    }
    if (el.hasAttribute('data-sx-booksec')) { openButiange(el.getAttribute('data-sx-booksec')); return; }
    if (el.hasAttribute('data-sx-book')) { openButiange(); return; }
    if (el.hasAttribute('data-sx-lords')) {
      var enter = $('deities-enter'); if (enter) enter.click();
      setTimeout(function () {
        var titles = document.querySelectorAll('.deity-group-title');
        for (var i = 0; i < titles.length; i++) {
          var tx = (titles[i].textContent || '').replace(/\s/g, '');
          if (tx === '二十八宿星君' || tx === T('二十八宿星君')) { titles[i].scrollIntoView({ block: 'start' }); break; }
        }
      }, 60);
      return;
    }
    if (el.hasAttribute('data-sx-todaylord')) {
      var lid = el.getAttribute('data-sx-todaylord');
      if (lid) openDeity(lid);
      return;
    }
    if (el.hasAttribute('data-sx-deity')) { openDeity(el.getAttribute('data-sx-deity')); return; }
    if (el.hasAttribute('data-sx-detail')) { openDetail(el.getAttribute('data-sx-detail')); return; }
    if (el.hasAttribute('data-sx-region')) { openRegion(el.getAttribute('data-sx-region')); return; }
  });

  /* ---------------- 绑定 ---------------- */
  function bind() {
    var enter = $('stars-enter');
    if (enter) enter.addEventListener('click', openHome);
    var b;
    if ((b = $('stars-back'))) b.addEventListener('click', function () {
      hide('view-stars'); hide('view-star-region'); hide('view-star-detail'); hide('view-butiange');
    });
    if ((b = $('star-region-back'))) b.addEventListener('click', function () { hide('view-star-region'); hide('view-star-detail'); });
    if ((b = $('star-detail-back'))) b.addEventListener('click', function () { hide('view-star-detail'); });
    if ((b = $('butiange-back'))) b.addEventListener('click', function () { hide('view-butiange'); });
    var skyHead = $('sx-sky-head');
    if (skyHead) skyHead.addEventListener('click', function () {
      var id = $('today-sky-card').getAttribute('data-sx-lord');
      if (id) openDeity(id);
    });
    renderTodaySky();
    setInterval(renderTodaySky, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) renderTodaySky(); });
    watchShelf();
    /* 语言切换时重绘动态面（app.js 的 __wuri_rerender 链式追加，不覆盖原回调） */
    var prev = window.__wuri_rerender;
    window.__wuri_rerender = function () {
      if (prev) prev();
      renderTodaySky();
      var sh = $('sx-jing-shelf'); if (sh) sh.remove();
      injectShelf();
      if (XG && BT) {
        if (!$('view-stars').hidden) renderHome();
        if (!$('view-star-region').hidden && curSection) {
          var q = regionState.query, ex = regionState.expanded;
          renderRegion(curSection); regionState.query = q; regionState.expanded = ex;
          var rows = $('sx-region-rows'); var si = secInfo[curSection];
          if (rows && si) rows.innerHTML = regionRowsHTML(si);
        }
        if (!$('view-star-detail').hidden && curKey) renderDetail(curKey);
        if (!$('view-butiange').hidden) renderBook();
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.Stars = { openHome: openHome, openRegion: openRegion, openDetail: openDetail, openButiange: openButiange, renderTodaySky: renderTodaySky };
})();
