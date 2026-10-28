/* 戊日不上香 · 中国星象模块（v2.0.0；v2.0.0 (1) 改底部「星象」标签页）
 * 星象标签页＝页首今日星象卡（s4，原首页卡整块搬入）＋星官图鉴（s1 首页 / s2 区页 / s3 星官详情）＋《步天歌》典籍页（s5）。
 * 数据懒加载：首次打开星官图鉴才 fetch data/xingguan.json＋data/butiange.json（Promise 缓存）。
 * 数据文本（官名/歌诀/星名）不走 i18n，显示一律过 tx() 简繁转换；固定文案走 sx_* 键。
 * 值日宿显示与首页 zhishen-line 同源：lunar.getXiu()＋XINGSU28 映射全称；
 * 斗柄 monthBranch 传 EightChar 精确月建支（与 getPrevJieQi 口径逐日对照零差，见引擎说明验证）。 */
(function () {
  'use strict';

  var XG = null, BT = null, LNX = null, LINES = null, loadPromise = null;
  var SCHEMA = null;   /* 图式层（data/xingguan-schema.json）：分区图的传统图式呈现。
    与 BSC5 坐标并行——备妥的区（首批仅角宿，几何据《漫步中国星空》文图，
    2026-10-25 用户裁定以书图为准）区页总览图与步天歌浮图改读图式坐标；
    平面星图/今夜可见/相机 AR 仍只读现代坐标，零影响。 */
  var FY = null, fyPromise = null;   /* 分野数据（v2.0.0 (5) 贯通批）：独立轻量加载，
    首页太阳躔宿一行只拉这一份小数据，不惊动图鉴全量懒加载 */
  var secOrder = [];           /* 区序（《步天歌》序）：紫微垣…轸宿 */
  var secInfo = {};            /* section -> {name, region, list:[asterism], lines:[], lineCount} */
  var byKey = {};              /* key -> asterism（key = a.id 或 section|name，同名官跨区不撞） */
  var curSection = null, curKey = null;

  var $ = function (id) { return document.getElementById(id); };
  function T(s) { return window.tx ? window.tx(s == null ? '' : s) : (s == null ? '' : String(s)); }
  function t(k) { return window.t ? window.t(k) : k; }
  function tf() { return window.tf ? window.tf.apply(null, arguments) : String(arguments[0]); }
  /* 星象门控（2026-10-26 用户拍板）：落地页与今日星象卡免费可见，点进任何子功能
   * （区页/星官详情/步天歌，及 sky-chart 的星图/今夜、sky-ar 的相机认星）皆高级版。
   * 本文件的内里入口全部收敛于 openRegion/openDetail/openButiange 三函数
   * （含 __wuri_openStarRegion 跨模块链、值神/太阳躔宿经 openMansionAsterism/
   * openSunRegion/openBeidouDetail 的落点），在此三处落点门控即全覆盖；
   * 神祇详情（openDeity）与红光开关不在门控内。 */
  function starGate() {
    if (window.WuriPro && WuriPro.isPro()) return true;
    if (window.WuriPro) WuriPro.requirePro('stars');
    return false;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function txEsc(s) { return esc(T(s)); }
  var IMG = window.WuriImg || {
    full: function (n) { return 'img/deities/' + n; },
    thumb: function (n) { return 'img/deities/thumbs/' + n; },
    fallback: function () {}
  };

  /* ---------------- 数据 ---------------- */
  function astKey(a) { return a.id || (a.section + '|' + a.name); }
  /* 定本计数口径（2026-10-25）：附格星官（grid_parent，如钩铃附房、神宫附尾）
   * 条目独立保留，但计数按《漫步中国星空》并格口径不另计——全表终数 283 格。 */
  function gridCount(list) {
    var n = 0;
    (list || []).forEach(function (a) { if (!a.grid_parent) n++; });
    return n;
  }

  /* 包内 JSON 双通道加载（v2.1.1 (4)，根因与口径见 sky-engine.js 同名段）：
   * 优先用 WuriSky.loadJSON（与星图/AR 共用同一实现与同一份 starData 结果）；
   * 引擎不在位时用本地同口径实现兜底，保证图鉴不依赖引擎文件也能加载。 */
  function localLoadJSON(url) {
    function viaXHR() {
      return new Promise(function (resolve, reject) {
        var x = new XMLHttpRequest();
        x.open('GET', url, true);
        x.onreadystatechange = function () {
          if (x.readyState !== 4) return;
          if (x.status === 200 || x.status === 0) {
            try { resolve(JSON.parse(x.responseText)); }
            catch (e) { reject(e); }
          } else reject(new Error('xhr http ' + x.status));
        };
        x.onerror = function () { reject(new Error('xhr error')); };
        x.send(null);
      });
    }
    if (typeof location !== 'undefined' && location.protocol === 'file:') return viaXHR();
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).catch(function () { return viaXHR(); });
  }
  function loadJSON(url) {
    return (window.WuriSky && WuriSky.loadJSON) ? WuriSky.loadJSON(url) : localLoadJSON(url);
  }
  /* 星官主数据（xingguan＋lines）：优先 WuriSky.starData 共享承诺，
   * 与 sky-chart / sky-ar 同一份结果、全 App 只拉一次 */
  function starData() {
    if (window.WuriSky && WuriSky.starData) return WuriSky.starData();
    return Promise.all([
      loadJSON('data/xingguan.json'),
      loadJSON('data/xingguan-lines.json').catch(function () { return null; })
    ]).then(function (res) { return { xg: res[0], lines: res[1] }; });
  }

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

  function loadFenye() {
    if (FY) return Promise.resolve(FY);
    if (fyPromise) return fyPromise;
    fyPromise = loadJSON('data/fenye.json')
      .then(function (j) { FY = j; fyPromise = null; return j; })
      .catch(function (e) { fyPromise = null; throw e; });
    return fyPromise;
  }

  function loadData() {
    if (XG && BT) return Promise.resolve(true);
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      starData(),
      loadJSON('data/butiange.json'),
      loadFenye().catch(function () { return null; }),
      loadJSON('data/xingguan-schema.json').catch(function () { return null; })
    ]).then(function (res) {
      XG = res[0].xg; BT = res[1]; LNX = res[0].lines; SCHEMA = res[3];
      indexData(); indexLines(); loadPromise = null;
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

  function indexLines() {
    LINES = {};
    ((LNX && LNX.asterisms) || []).forEach(function (e) { LINES[e.section + '|' + e.name] = e; });
  }
  function lineEntry(a) { return LINES ? (LINES[a.section + '|' + a.name] || null) : null; }

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
  /* 全局层级规矩（v2.1.0 (3) 定版，此后勿再单点改 z-index 打地鼠）：
   * 静态层级只定「同类相叠」的底序：.view 通用 50；图鉴列表/排盘/修行/缘分 60；
   * 神祇详情 61；星象六子视图 62；星图信息条 63；步罡 70；弹窗 80+。
   * 跨模块互链一律走「来源栈收起/恢复」语义，不靠静态层级叠压：
   * ①神祇详情从任一星象子视图打开 → 本函数把当时开着的子视图全部记入来源栈并收起，
   *   详情返回即按栈恢复（deities.js navOrigin）。收起名单必须含全部六视图——
   *   (1)(2) 新增的星图/今夜可见/相机认星曾漏收：AR 开着时点星官详情里的互链神祇卡，
   *   神祇详情（61）开在仍开着的 AR 视图（62）之下，真机表现为「点了没反应」、
   *   按一次返回关掉 AR 才露出详情（2026-10-24 真机报障，本地真点击复现坐实）。
   * ②相机开着时先停相机/姿态再收起（不留后台拍摄）；返回恢复 view-sky-ar 时
   *   由 deities.js 特判走 WuriSkyAR.open() 重开（回开启面板，授权手势链完整）。
   * ③反向（神祇详情内「本宿星官 ›」开区页）不收详情：区页靠 62>61 盖住，
   *   返回收区页即露回详情、详情滚动天然保持（v2.0.0 (7) 口径，不变）。
   * 星象标签页（tab-stars）是普通标签主区、不在此列。 */
  var STAR_SUBVIEWS = ['view-star-region', 'view-butiange', 'view-star-detail', 'view-sky-tonight', 'view-sky-chart', 'view-sky-ar'];
  function openDeity(id) {
    if (!window.__wuri_openDeity) return;
    tourPause(); /* 离开典籍页去神祇详情即停导览播放 */
    var stack = [], scroll = {};
    STAR_SUBVIEWS.forEach(function (vid) {
      var v = $(vid);
      if (v && !v.hidden) { stack.push(vid); scroll[vid] = v.scrollTop; }
    });
    if (stack.indexOf('view-sky-ar') >= 0 && window.WuriSkyAR && typeof window.WuriSkyAR.close === 'function') window.WuriSkyAR.close();
    STAR_SUBVIEWS.forEach(function (vid) { hide(vid); });
    window.__wuri_openDeity(id, stack.length ? { views: stack, scroll: scroll } : null);
  }

  function lordCardHTML(d, subText) {
    if (!d) return '';
    return '<div class="sx-card sx-link" data-sx-deity="' + esc(d.id) + '">' +
      '<img src="' + esc(IMG.full(d.image)) + '" onerror="WuriImg.fallback(this,\'' + esc(d.image) + '\')" alt="' + txEsc(d.name) + '">' +
      '<div><div class="l1">' + txEsc(d.name) + '</div><div class="l2">' + txEsc(subText || d.title) + '</div></div>' +
      '<div class="go">›</div></div>';
  }

  /* ---------------- 视图开关 ---------------- */
  function show(id) { var v = $(id); if (v) v.hidden = false; }
  function hide(id) { var v = $(id); if (v) v.hidden = true; }
  function scrollTopOf(id) { var v = $(id); if (v) v.scrollTop = 0; }

  /* 深链/外部入口：切到星象标签页（app.js 的标签钩子会调 activate） */
  function openHome() {
    var tab = $('tab-stars');
    var btn = document.querySelector('#tabbar button[data-tab="tab-stars"]');
    if (btn && !(tab && tab.classList.contains('active'))) { btn.click(); return; }
    activate();
  }

  /* 星象标签页激活：收起子视图、懒加载并渲染图鉴首页（今日星象卡由 renderTodaySky 常驻渲染） */
  function activate() {
    tourPause(); /* 切回星象标签页即停导览播放（位置保留） */
    regionOrigin = null; /* 切回星象标签即重置子视图栈，陈旧来源不得残留 */
    hide('view-star-region'); hide('view-star-detail'); hide('view-butiange');
    var host = $('sx-home');
    if (XG && BT) { renderHome(); return; }
    if (host) host.innerHTML = loadingHTML();
    loadData().then(function () { renderHome(); })
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

  /* ---------- 区页来源返回（v2.0.0 (6)）：与 deities.js navOrigin 同构——
   * 进入区页时记下来源子视图栈＋各自滚动位置，返回即回来源并恢复滚动；
   * 无来源记录（索引页/其他标签页/神祇详情等无星象子视图打开处进入）时
   * 返回只收区页，落到其下层，与旧行为一致。 ---------- */
  var regionOrigin = null; /* {views:[viewId...], scroll:{viewId: top}} | null */

  function openRegion(section) {
    if (!section) return;
    if (!starGate()) return;
    tourPause(); /* 离开典籍页去区页即停导览播放 */
    if (XG && !secInfo[section] && !lordOfMansion(section)) section = resolveSection(section);
    if (XG && !secInfo[section]) return;
    /* 捕获来处必须在收起其他子视图之前；区页已打开时（失败重试等）保留原来源不覆写 */
    var regionView = $('view-star-region');
    if (regionView && regionView.hidden) {
      var stack = [], scroll = {};
      ['view-butiange', 'view-star-detail'].forEach(function (vid) {
        var v = $(vid);
        if (v && !v.hidden) { stack.push(vid); scroll[vid] = v.scrollTop; }
      });
      regionOrigin = stack.length ? { views: stack, scroll: scroll } : null;
    }
    hide('view-star-detail');
    hide('view-butiange'); /* 典籍页 DOM 在区页之后、层级同高，不收起会整页盖住区页——
      (3) 真机修复：步天歌分架里点「本区图鉴 ›」无反应即此故 */
    show('view-star-region');
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
    if (!starGate()) return;
    tourPause(); /* 离开典籍页去详情即停导览播放 */
    show('view-star-detail');
    var host = $('sx-detail');
    if (XG && BT) { renderDetail(key); scrollTopOf('view-star-detail'); return; }
    if (host) host.innerHTML = loadingHTML();
    loadData().then(function () { renderHome(); renderDetail(key); scrollTopOf('view-star-detail'); })
      .catch(function () { if (host) host.innerHTML = failHTML('detail:' + key); });
  }

  function openButiange(section) {
    if (!starGate()) return;
    hide('view-star-detail'); /* 详情视图 DOM 在典籍页之后，不收起会盖住典籍页 */
    show('view-butiange');
    var host = $('sx-book');
    if (XG && BT) { renderBook(section); return; }
    if (host) host.innerHTML = loadingHTML();
    loadData().then(function () { renderBook(section); })
      .catch(function () { if (host) host.innerHTML = failHTML('book'); });
  }

  /* ---------------- 贯通批（v2.0.0 (5)）：跨模块互链 ---------------- */
  /* 本宿星官：与宿同名的那座星官（28 宿逐宿皆有，数据核对无缺） */
  function mansionAsterism(section) {
    var si = secInfo[section]; if (!si) return null;
    var base = section.replace(/宿$/, '');
    for (var i = 0; i < si.list.length; i++) if (si.list[i].name === base) return si.list[i];
    return null;
  }
  function openMansionAsterism(section) {
    if (!section) return;
    var go = function () {
      var a = mansionAsterism(section);
      if (a) openDetail(astKey(a)); else openRegion(section);
    };
    if (XG && BT) go();
    else loadData().then(go).catch(function () {});
  }
  /* 太阳躔宿（引擎在 today-sky.js，口径见其注释）：只拉 fenye 小数据 */
  function sunMansion(date) {
    return loadFenye().then(function (fy) {
      if (!window.WuriTodaySky) return null;
      var d = date || new Date();
      var jd = WuriTodaySky.jdFromDate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12));
      return WuriTodaySky.sunMansionOf(jd, fy);
    }).catch(function () { return null; });
  }
  /* 月将落点：月将由太阳所在宫（次）定，其落点即太阳今躔之宿——开其区页 */
  function openSunRegion(date) {
    sunMansion(date).then(function (sm) { if (sm) openRegion(sm.mansion); });
  }
  function openBeidouDetail() {
    var go = function () {
      var si = secInfo['紫微垣']; if (!si) return;
      for (var i = 0; i < si.list.length; i++) {
        if (si.list[i].name === '北斗') { openDetail(astKey(si.list[i])); return; }
      }
    };
    if (XG && BT) go();
    else loadData().then(go).catch(function () {});
  }

  /* deities.js 的「本宿星官 ›」签入口：key 为星君 link_key（如 jiaomujiao）或区名。
   * 层级：区页 z-62 盖在神祇详情（z-61）之上（css 注明），详情不收起，
   * 区页返回收起自身即回该星君详情、滚动保持。 */
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
    var total = gridCount(XG.asterisms);
    var det = 0, doubt = 0, dual = 0;
    XG.asterisms.forEach(function (a) {
      if (a.status === '确定') det++; if (a.status === '存疑') doubt++; if (a.qing_variant) dual++;
    });
    var h = '';
    h += '<div class="sx-kicker">' + esc(t('sx_kicker')) + '</div>';
    h += '<div class="sx-title">' + esc(t('sx_home_title')) + '</div>';
    h += '<div class="sx-sub">' + txEsc(tf(t('sx_data_line'), total, secOrder.length, (XG.counts && XG.counts.tradition_star_sum) || 0)) + '<br>' +
      txEsc(tf(t('sx_data_line2'), det, doubt, dual)) + '</div>';

    /* 三垣 */
    h += '<div class="sx-sec">' + esc(t('sx_sanyuan')) + ' <small>' + esc(t('sx_sanyuan_note')) + '</small></div>';
    YUAN.forEach(function (y) {
      var si = secInfo[y]; if (!si) return;
      var first = si.lines.length ? si.lines[0].text : '';
      var reps = si.list.slice(0, 3).map(function (a) { return a.name; }).join(' · ');
      h += '<div class="sx-card sx-yuan" data-sx-region="' + esc(y) + '">' +
        '<div class="sx-yuan-top"><span class="sx-yuan-name">' + txEsc(y) + '</span>' +
        '<span class="sx-yuan-n">' + txEsc(tf(t('sx_asterisms_n'), gridCount(si.list))) + '</span></div>' +
        '<div class="sx-yuan-verse">' + txEsc(first) + '</div>' +
        '<div class="sx-yuan-note">' + txEsc(reps) + '</div></div>';
    });

    /* 二十八宿四象 */
    h += '<div class="sx-sec">' + esc(t('sx_xiu28')) + ' <small>' + esc(t('sx_xiu28_note')) + '</small></div>';
    QUAD.forEach(function (q) {
      var mansions = secOrder.filter(function (s) { return secInfo[s].region === q; });
      var sum = 0; mansions.forEach(function (s) { sum += gridCount(secInfo[s].list); });
      h += '<div class="sx-group"><div class="sx-group-head"><span class="sx-group-name">' + txEsc(q) + '</span>' +
        '<span class="sx-group-n">' + txEsc(tf(t('sx_asterisms_n'), sum)) + '</span></div><div class="sx-chips">';
      mansions.forEach(function (s) {
        h += '<span class="sx-chip" data-sx-region="' + esc(s) + '">' + txEsc(s.replace(/宿$/, '')) + '<i>' + gridCount(secInfo[s].list) + '</i></span>';
      });
      h += '</div></div>';
    });

    /* 底部双入口 */
    var lord0 = lordOfMansion('角宿');
    h += '<div class="sx-duo">' +
      '<div class="sx-card sx-entry sx-entry-book" data-sx-book="1"><div><div class="bk-k">' + esc(t('sx_shelf_kicker')) + '</div><div class="e1">' + esc(t('sx_entry_book')) + '</div>' +
      '<div class="e2">' + txEsc(tf(t('sx_entry_book_sub'), BT.total_lines)) + '</div></div></div>' +
      '<div class="sx-card sx-entry" data-sx-lords="1">' +
      (lord0 ? '<img src="' + esc(IMG.full(lord0.image)) + '" onerror="WuriImg.fallback(this,\'' + esc(lord0.image) + '\')" alt="">' : '') +
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
      h += '<div class="sx-row' + (a.grid_parent ? ' sx-row-sub' : '') + '" data-sx-detail="' + esc(astKey(a)) + '">' +
        '<div class="sx-row-main"><span class="sx-row-name">' + txEsc(a.name) + '</span>' +
        (a.grid_parent ? '<span class="sx-row-subtag">' + txEsc('附' + a.grid_parent + '格') + '</span>' : '') +
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

  /* ---------------- 分野层（v2.0.0 (5) 贯通批，fenye.json） ----------------
   * 呈现界线（备料继承规则）：分野只下沉到宿区页——本卡给本宿的
   * 次/国/州、跨次分段、汉志对校、分歧双轨与现代对应（后人比附）；
   * 不逐星官判度（数据无星官宿内古度坐标，判即无据）。三垣不立
   * 分野条，只注「不入分野」之据。分歧条目按宿/次归属挂接
   * （D1/D2 实沈、D3 娵訾、D4 寿星、D5 女柳氐、D6 胃、D7 斗牛女），
   * 文本逐字取 fenye.json divergences，不改写。 */
  var MANSION_DIVS = {
    '毕宿': ['D1', 'D2'], '觜宿': ['D1', 'D2'], '参宿': ['D1', 'D2'], '井宿': ['D1', 'D2'],
    '危宿': ['D3'], '室宿': ['D3'], '壁宿': ['D3'], '奎宿': ['D3'],
    '轸宿': ['D4'], '角宿': ['D4'], '亢宿': ['D4'], '氐宿': ['D4', 'D5'],
    '女宿': ['D5', 'D7'], '柳宿': ['D5'], '胃宿': ['D6'], '斗宿': ['D7'], '牛宿': ['D7']
  };
  function fenyeOf(section) {
    if (!FY || !FY.mansions) return null;
    for (var i = 0; i < FY.mansions.length; i++) if (FY.mansions[i].mansion === section) return FY.mansions[i];
    return null;
  }
  function ciEntryOf(name) {
    if (!FY || !FY.shierci) return null;
    for (var i = 0; i < FY.shierci.length; i++) if (FY.shierci[i].name === name) return FY.shierci[i];
    return null;
  }
  function fenyeCardHTML(section, isYuan) {
    if (!FY) return '';
    if (isYuan) {
      var ex = FY.sanguan_exception;
      if (!ex) return '';
      return '<div class="sx-note"><b>' + esc(t('sx_fenye')) + '：</b>' + txEsc(ex.rule) + txEsc(ex.basis) + '</div>';
    }
    var m = fenyeOf(section); if (!m) return '';
    var ci = ciEntryOf(m.ci_primary);
    var h = '<div class="sx-card sx-fenye">';
    h += '<div class="sx-fenye-head">' + esc(t('sx_fenye')) + ' · ' + txEsc(tf(t('sx_fenye_ci'), m.ci_primary)) +
      (ci ? '<small>' + txEsc(tf(t('sx_fenye_chen'), ci.chen)) + '</small>' : '') + '</div>';
    h += '<div class="sx-fenye-main">' + txEsc(tf(t('sx_fenye_main'), section, m.ci_primary, m.fenye_guo.join('、'), m.fenye_zhou)) + '</div>';
    if (m.cross_ci && (m.ci_span || []).length > 1) {
      var parts = m.ci_span.map(function (sg) { return tf(t('sx_fenye_seg'), sg.ci, sg.degrees); });
      h += '<div class="sx-fenye-line">' + txEsc(tf(t('sx_fenye_cross'), parts.join('；'))) +
        '<br>' + esc(t('sx_fenye_cross_note')) + '</div>';
    }
    if (m.hanshu_dilizhi && m.hanshu_dilizhi.guo) {
      h += '<div class="sx-fenye-line"><b>' + esc(t('sx_fenye_hanshu')) + '：</b>' +
        txEsc(tf(t('sx_fenye_hanshu_guo'), m.hanshu_dilizhi.guo)) + '</div>';
    } else {
      h += '<div class="sx-fenye-line"><b>' + esc(t('sx_fenye_hanshu')) + '：</b>' +
        esc(t('sx_fenye_hanshu_none')) + '</div>';
    }
    if (m.note) h += '<div class="sx-fenye-line">' + txEsc(m.note) + '</div>';
    (MANSION_DIVS[section] || []).forEach(function (id) {
      var d = null;
      (FY.divergences || []).forEach(function (x) { if (x.id === id) d = x; });
      if (d) h += '<div class="sx-fenye-div"><b>' + esc(t('sx_fenye_div')) + ' · ' + txEsc(d.topic) + '：</b>' + txEsc(d.detail) + '</div>';
    });
    if (m.modern_geo) {
      h += '<div class="sx-fenye-line"><b>' + esc(t('sx_fenye_modern')) + '：</b>' + txEsc(m.modern_geo) + '</div>';
    }
    h += '<div class="sx-fenye-src">' + esc(t('sx_fenye_src')) + '</div>';
    return h + '</div>';
  }

  /* ---------------- s2 区页总览星图（v2.1.1 (3)） ----------------
   * 本区全部可绘星官一图总览，置于区页搜索框正上方（用户 2026-10-25 指定）：
   * 星点按星等定大小、连线取 xingguan-lines 图式（status=doubtful 虚线、
   * 无图式边时按赤经序连——与详情简图同口径）；名牌贪心避让，拥挤时只标
   * 高优先级星官（同名官最优先、余按最亮星/星数），未标名者点星仍可达。
   * 整官一组挂 data-sx-detail 走既有委托进详情；每星另置 r=20 命中圈
   * （viewBox 360 宽在 390 屏约合 43px 触控径），名牌下另垫命中矩形。
   * 投影：赤经环跨（最大空隙法）>180° 或含近极星（dec≥85°）的区（仅
   * 紫微垣，环极且赤经缠绕）以北天极为心作极心立体投影——赤经绕极按
   * 观天手性顺时针递增；其余区以本区星群质心为心作心射（gnomonic）
   * 投影。两式屏幕朝向均与详情简图同手性（以北斗三星三角形向与详情
   * 简图对表验证，见 smoke-v2113）：赤经大者居左、赤纬高者居上。 */
  /* 图式层就绪判定：本区在 schema 数据里有段、且区内每官都有图式条目才启用；
   * 任一不满足整区回落现行投影（分批上线、可随时退）。 */
  function schemaReady(si) {
    if (!SCHEMA || !SCHEMA.sections) return null;
    var sch = SCHEMA.sections[si.name];
    if (!sch || !sch.asterisms) return null;
    for (var i = 0; i < si.list.length; i++) {
      if (!sch.asterisms[si.list[i].name]) return null;
    }
    return sch;
  }

  function regionMapHTML(si, opts) {
    /* opts（浮图样张扩展，区页调用不传＝行为不变）：{pop:true, hl:{key:1}} 时
     * 本句所指星官组挂 sx-hl、余官挂 sx-dim，不挂命中圈/详情委托（浮层内不跳页），
     * 数据层 principal 星另绘金环；图下注记由浮层自备，此处不绘。 */
    var popMode = !!(opts && opts.pop);
    var hlSet = (opts && opts.hl) || null;
    var schSec = schemaReady(si);
    var schemaMode = !!schSec;
    function has(s) { return typeof s.ra_deg === 'number' && typeof s.dec_deg === 'number'; }
    var entries = [], unplotted = 0, all = [];
    if (schemaMode) {
      /* 图式路：点位全从图式层来（含未定星点），x 右增、y 取负成「上增」
       * 与投影路同手性，后段包围盒/缩放/名牌逻辑两路共用。命名星经 ref
       * 对回星官条目（取 principal/vmag 等）；未定星点 s 为占位对象。 */
      var byRef = {};
      si.list.forEach(function (a) {
        (a.stars || []).forEach(function (s) { byRef[a.name + '|' + s.cn_name] = s; });
      });
      si.list.forEach(function (a) {
        var sa = schSec.asterisms[a.name];
        var pts = (sa.stars || []).map(function (sp) {
          var s = sp.ref ? (byRef[a.name + '|' + sp.ref] || null) : null;
          return { s: s || { cn_name: null, unlocated: true }, schPt: sp, x: sp.x, y: -sp.y };
        });
        /* 整官在书图无落点（如太微垣郎将，图式条目 stars 为空）：与投影路
         * 「无定星整官」同口径——不入 entries（否则质心 0/0 成 NaN 炸名牌
         * 布局），计入 unplotted，详情仍走下方名单呈现。 */
        if (!pts.length) { unplotted++; return; }
        entries.push({ a: a, stars: (a.stars || []), pts: pts, schEdges: sa.edges || [] });
        pts.forEach(function (p) { all.push(p.s); });
      });
    } else {
      si.list.forEach(function (a) {
        var st = (a.stars || []).filter(has);
        if (!st.length) { unplotted++; return; }
        entries.push({ a: a, stars: st });
        st.forEach(function (s) { all.push(s); });
      });
    }
    if (!entries.length) return { html: '', unplotted: unplotted };

    /* 赤经环跨（最大空隙法）与质心（单位向量均值）；图式路点位已备妥，整段跳过 */
    var polar = false;
    if (!schemaMode) {
    var ras = all.map(function (s) { return s.ra_deg; }).sort(function (x, y) { return x - y; });
    var maxGap = 0;
    for (var gi = 0; gi < ras.length; gi++) {
      var gap = (ras[(gi + 1) % ras.length] - ras[gi] + 360) % 360;
      if (gap > maxGap) maxGap = gap;
    }
    var raSpan = 360 - maxGap;
    var vx = 0, vy = 0, vz = 0;
    all.forEach(function (s) {
      var ra = s.ra_deg * Math.PI / 180, dec = s.dec_deg * Math.PI / 180;
      vx += Math.cos(dec) * Math.cos(ra); vy += Math.cos(dec) * Math.sin(ra); vz += Math.sin(dec);
    });
    var ra0 = Math.atan2(vy, vx) * 180 / Math.PI; if (ra0 < 0) ra0 += 360;
    var dec0 = Math.atan2(vz, Math.hypot(vx, vy)) * 180 / Math.PI;
    polar = raSpan > 180 || all.some(function (s) { return s.dec_deg >= 85; });

    /* proj(s) -> [right, up]（投影面坐标，未缩放） */
    function proj(s) {
      var ra = s.ra_deg * Math.PI / 180, dec = s.dec_deg * Math.PI / 180;
      if (polar) {
        var r = Math.tan((Math.PI / 2 - dec) / 2), d = ra - ra0 * Math.PI / 180;
        return [r * Math.sin(d), r * Math.cos(d)];
      }
      var d0 = dec0 * Math.PI / 180, dra = ra - ra0 * Math.PI / 180;
      var cosc = Math.sin(d0) * Math.sin(dec) + Math.cos(d0) * Math.cos(dec) * Math.cos(dra);
      if (cosc < 0.05) cosc = 0.05;
      return [-Math.cos(dec) * Math.sin(dra) / cosc,
        (Math.cos(d0) * Math.sin(dec) - Math.sin(d0) * Math.cos(dec) * Math.cos(dra)) / cosc];
    }
    entries.forEach(function (e) {
      e.pts = e.stars.map(function (s) { var p = proj(s); return { s: s, x: p[0], y: p[1] }; });
    });
    }
    var minR = 1e18, maxR = -1e18, minU = 1e18, maxU = -1e18;
    entries.forEach(function (e) {
      e.pts.forEach(function (p) {
        minR = Math.min(minR, p.x); maxR = Math.max(maxR, p.x);
        minU = Math.min(minU, p.y); maxU = Math.max(maxU, p.y);
      });
    });
    var bw = Math.max(maxR - minR, 1e-9), bh = Math.max(maxU - minU, 1e-9);
    var W = 360, PAD = 30;
    var H = Math.round(Math.min(470, Math.max(220, W * bh / bw)));
    var k = Math.min((W - PAD * 2) / bw, (H - PAD * 2) / bh);
    var midR = (minR + maxR) / 2, midU = (minU + maxU) / 2;
    function SX(p) { return W / 2 + (p.x - midR) * k; }
    function SY(p) { return H / 2 - (p.y - midU) * k; }
    function R(mag) { return Math.max(1.6, Math.min(8.6, 6.6 - (typeof mag === 'number' ? mag : 3) * 0.85)); }

    /* 优先级：同名官（宿区与宿同名者）最先，其次最亮星、星多者 */
    var base = si.name.replace(/宿$/, '');
    entries.forEach(function (e) {
      var bright = 99;
      e.stars.forEach(function (s) { if (typeof s.vmag === 'number') bright = Math.min(bright, s.vmag); });
      e.bright = bright;
      e.cx = 0; e.cy = 0;
      e.pts.forEach(function (p) { e.cx += SX(p); e.cy += SY(p); });
      e.cx /= e.pts.length; e.cy /= e.pts.length;
    });
    var byPrio = entries.slice().sort(function (p, q) {
      var pn = p.a.name === base ? 0 : 1, qn = q.a.name === base ? 0 : 1;
      if (pn !== qn) return pn - qn;
      if (p.bright !== q.bright) return p.bright - q.bright;
      return q.stars.length - p.stars.length;
    });
    var labelCap = entries.length <= 16 ? entries.length : 28;
    var labeled = {};
    byPrio.slice(0, labelCap).forEach(function (e) { labeled[astKey(e.a)] = 1; });
    var nLabels = Math.min(labelCap, entries.length);
    var dense = nLabels >= 18;
    var fsT = dense ? 9.5 : 10.5;

    /* 名牌贪心避让（与详情简图同法：多候选位取重叠最小、远置加引线） */
    function textW(txt, fs) {
      var w = 0;
      for (var i = 0; i < txt.length; i++) w += (txt.charCodeAt(i) > 0x2E7F ? fs : fs * 0.58);
      return w;
    }
    var placed = [{ x: 4, y: H - 18, w: 200, h: 14 }]; /* 左下注记行预留 */
    var labelPos = {}; /* key -> {x, y, w, h, lx, ly}（lx/ly 为引线终点侧锚点心） */
    byPrio.forEach(function (e) {
      var key = astKey(e.a);
      if (!labeled[key]) return;
      var name = T(e.a.name);
      var w = textW(name, fsT) + 3, hh = 13;
      var dirs = [];
      [[1, 0], [0.72, -0.72], [0.72, 0.72], [0, -1], [0, 1], [-1, 0], [-0.72, -0.72], [-0.72, 0.72]].forEach(function (u) {
        dirs.push([u[0], u[1], 10]); dirs.push([u[0], u[1], 20]);
        dirs.push([u[0], u[1], 32]); dirs.push([u[0], u[1], 46]);
      });
      var best = null, bestScore = Infinity;
      dirs.forEach(function (d, ci) {
        var bx = e.cx + d[0] * d[2] - (d[0] < -0.1 ? w : (Math.abs(d[0]) <= 0.1 ? w / 2 : 0));
        var by = e.cy + d[1] * d[2] - (d[1] < -0.1 ? hh : (Math.abs(d[1]) <= 0.1 ? hh / 2 : 0));
        var cx = Math.max(2, Math.min(W - 2 - w, bx));
        var cy = Math.max(2, Math.min(H - 2 - hh, by));
        var ov = 0;
        placed.forEach(function (p) {
          var ox = Math.max(0, Math.min(cx + w, p.x + p.w) - Math.max(cx, p.x));
          var oy = Math.max(0, Math.min(cy + hh, p.y + p.h) - Math.max(cy, p.y));
          ov += ox * oy;
        });
        var score = ov * 1000 + ci;
        if (score < bestScore) { bestScore = score; best = { x: cx, y: cy }; }
      });
      placed.push({ x: best.x, y: best.y, w: w, h: hh });
      labelPos[key] = { x: best.x, y: best.y, w: w, h: hh };
    });

    /* 绘制：低优先级先画（垫底），高优先级在上层保命中 */
    var body = '';
    byPrio.slice().reverse().forEach(function (e) {
      var key = astKey(e.a);
      var le = lineEntry(e.a);
      var cls = le && le.status === 'doubtful' ? 'sx-plot-dash' : 'sx-plot-line';
      var byName = {}; e.pts.forEach(function (p) { byName[p.s.cn_name] = p; });
      var g = popMode
        ? '<g class="sx-rmap-g ' + (hlSet && hlSet[key] ? 'sx-hl' : 'sx-dim') + '" data-sx-gkey="' + esc(key) + '">'
        : '<g class="sx-rmap-g" data-sx-detail="' + esc(key) + '">';
      var es = le && le.edges ? le.edges.filter(function (ed) { return byName[ed[0]] && byName[ed[1]]; }) : null;
      if (schemaMode) {
        /* 图式连边：图式层索引对（以书图为准，与 lines 层走向不同处从图，
         * 如库楼菱形闭合、衡上横双竖）；虚实仍从 lines 层 status（柱存疑虚线） */
        (e.schEdges || []).forEach(function (pr) {
          var p = e.pts[pr[0]], q = e.pts[pr[1]];
          if (!p || !q) return;
          g += '<line class="' + cls + '" x1="' + SX(p).toFixed(1) + '" y1="' + SY(p).toFixed(1) +
            '" x2="' + SX(q).toFixed(1) + '" y2="' + SY(q).toFixed(1) + '"/>';
        });
      } else if (es && es.length) {
        es.forEach(function (ed) {
          var p = byName[ed[0]], q = byName[ed[1]];
          g += '<line class="' + cls + '" x1="' + SX(p).toFixed(1) + '" y1="' + SY(p).toFixed(1) +
            '" x2="' + SX(q).toFixed(1) + '" y2="' + SY(q).toFixed(1) + '"/>';
        });
      } else if (!le && e.pts.length > 1) {
        /* 赤经序折线只作「连线数据缺失」时的降级回落；lines 条目存在（含定本
         * scatter 散点、无边条目）即以条目为准，不另画线——与平面星图/AR 同源同规 */
        var pts = e.pts.slice().sort(function (p, q) { return p.s.ra_deg - q.s.ra_deg; })
          .map(function (p) { return SX(p).toFixed(1) + ',' + SY(p).toFixed(1); }).join(' ');
        g += '<polyline class="' + cls + '" points="' + pts + '" fill="none"/>';
      }
      e.pts.forEach(function (p) {
        if (schemaMode) {
          /* 图式星点：统一小径（书图读法，不按星等放大）；实心墨点／空心圈
           * 从书图原样；未定星点同为空心、降透明示「图式复原·未定」。
           * 主星仍只以细金环点明（口径与投影路一致，有据才标）。 */
          var srr = 2.6;
          var scls = 'sx-star ' + (p.schPt.dot === 'filled' ? 'sx-sch-dot' : 'sx-sch-ring') +
            (p.schPt.unlocated ? ' sx-sch-unloc' : '');
          if (popMode && p.s.principal) {
            g += '<circle class="sx-principal-ring" cx="' + SX(p).toFixed(1) + '" cy="' + SY(p).toFixed(1) +
              '" r="' + (srr + 2).toFixed(1) + '"/>';
            scls += ' sx-principal';
          }
          g += '<circle class="' + scls + '" cx="' + SX(p).toFixed(1) +
            '" cy="' + SY(p).toFixed(1) + '" r="' + srr.toFixed(1) + '"/>';
          return;
        }
        var rr = R(p.s.vmag), isPrin = popMode && !!p.s.principal;
        if (isPrin) {
          /* 主星常驻标记（数据层 principal 字段，有据才标）：只以细金环点明身份。
           * 盘径三轮点验定版（2026-10-25）：一等星按星等公式放大的实心盘读成
           * 「大金币」太抢眼——主星盘径以 5.8 等为亮度下限钳制后再 ×1.2（＝进贤
           * 那颗的视觉大小档），与普通星同档，区别只剩金环；非主星星等缩放不动。
           * （进贤 principal 已于同日撤下：独星成官并无文献称其为主星，「有据才标」。） */
          rr = R(Math.max(typeof p.s.vmag === 'number' ? p.s.vmag : 3, 5.8)) * 1.2;
          g += '<circle class="sx-principal-ring" cx="' + SX(p).toFixed(1) + '" cy="' + SY(p).toFixed(1) +
            '" r="' + (rr + 2).toFixed(1) + '"/>';
        }
        g += '<circle class="sx-star' + (isPrin ? ' sx-principal' : '') + '" cx="' + SX(p).toFixed(1) +
          '" cy="' + SY(p).toFixed(1) + '" r="' + rr.toFixed(1) + '"/>';
      });
      var lp = labelPos[key];
      if (lp) {
        var ncx = lp.x + lp.w / 2, ncy = lp.y + lp.h / 2;
        var dist = Math.hypot(ncx - e.cx, ncy - e.cy);
        if (dist > 27) {
          var gx = e.cx + (ncx - e.cx) / dist * Math.max(8, dist - Math.min(lp.w, lp.h) / 2 - 1);
          var gy = e.cy + (ncy - e.cy) / dist * Math.max(8, dist - Math.min(lp.w, lp.h) / 2 - 1);
          g += '<line class="sx-leader" x1="' + (e.cx + (ncx - e.cx) / dist * 6).toFixed(1) +
            '" y1="' + (e.cy + (ncy - e.cy) / dist * 6).toFixed(1) +
            '" x2="' + gx.toFixed(1) + '" y2="' + gy.toFixed(1) + '"/>';
        }
        g += '<text class="sx-plot-t" x="' + (lp.x + 1).toFixed(1) + '" y="' + (lp.y + fsT + 1).toFixed(1) + '">' +
          txEsc(e.a.name) + '</text>';
        if (!popMode) g += '<rect class="sx-rmap-hit" x="' + lp.x.toFixed(1) + '" y="' + lp.y.toFixed(1) +
          '" width="' + lp.w.toFixed(1) + '" height="' + lp.h.toFixed(1) + '"/>';
      }
      if (!popMode) e.pts.forEach(function (p) {
        g += '<circle class="sx-rmap-hit" cx="' + SX(p).toFixed(1) + '" cy="' + SY(p).toFixed(1) + '" r="20"/>';
      });
      body += g + '</g>';
    });

    var note = popMode ? '' : (schemaMode ? t('sx_map_note_schema') : (polar ? t('sx_map_note_polar') : t('sx_map_note')));
    var svg = '<svg class="sx-plot sx-rmap' + (dense ? ' dense' : '') + (popMode ? ' sx-popmap' : '') +
      (schemaMode ? ' sx-schema' : '') +
      '" viewBox="0 0 ' + W + ' ' + H +
      '" role="img" aria-label="' + txEsc(si.name) + '">' + body +
      (note ? '<text class="sx-plot-s" x="8" y="' + (H - 8) + '">' + esc(note) + '</text>' : '') + '</svg>';
    return { html: svg, unplotted: unplotted, polar: polar, schemaMode: schemaMode };
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
    h += '<div class="sx-sub">' + txEsc(tf(t('sx_region_n'), gridCount(si.list), si.lineCount)) + '</div>';

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
    h += fenyeCardHTML(section, isYuan);
    /* 总览星图（v2.1.1 (3)）：用户指定置于搜索框正上方 */
    var rmap = regionMapHTML(si);
    h += rmap.html;
    if (rmap.unplotted) {
      h += '<div class="sx-count-note">' + txEsc(tf(t(rmap.schemaMode ? 'sx_map_unplotted_schema' : 'sx_map_unplotted'), rmap.unplotted)) + '</div>';
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

  /* 简图（v2.0.0 (2) 重做）：
   * 连线改取 xingguan-lines.json（步天歌星序链＋图形官图式手订，doubtful 虚线）——
   * 与旧版「按赤经排序逐星直连」的出入：井/鬼/轸/毕/参/五车/三柱/张等图形官按传统
   * 图式成形、不再是赤经序折线；清表无连线数据、仍按赤经序虚线（旧行为）。
   * 标签只留星名（口径归属见下方双表；图内不再拖「两口径共有」等后缀），
   * 16 候选位贪心取重叠最小、远置加引线，密集图字号自动降一档。
   * 上下文模式：本官可绘星 <2 或跨度 <0.5° 时扩视场纳邻官（灰点＋虚线＋小字官名），
   * 本官居中放大实绘。阈值：CTX_SPAN_MIN=0.5°、视场 14°–30°。 */
  var CTX_SPAN_MIN = 0.5;
  var CTX_FIELD_MIN = 14;
  var CTX_FIELD_MAX = 30;

  function plotSVG(a, qingStars) {
    function has(s) { return typeof s.ra_deg === 'number' && typeof s.dec_deg === 'number'; }
    var main = (a.stars || []).filter(has);
    var qing = (qingStars || []).filter(has);
    var mainByName = {}; main.forEach(function (s) { mainByName[s.cn_name] = s; });
    var qDes = {}; qing.forEach(function (s) { qDes[s.designation] = 1; });
    var focal = main.length ? main : qing;
    if (!focal.length) return '<div class="sx-note">' + esc(t('sx_plot_none')) + '</div>';

    function boundsOf(list) {
      var b = { minRA: 1e18, maxRA: -1e18, minDec: 1e18, maxDec: -1e18 };
      list.forEach(function (s) {
        b.minRA = Math.min(b.minRA, s.ra_deg); b.maxRA = Math.max(b.maxRA, s.ra_deg);
        b.minDec = Math.min(b.minDec, s.dec_deg); b.maxDec = Math.max(b.maxDec, s.dec_deg);
      });
      return b;
    }
    function spansOf(b) {
      var cd = Math.cos((b.minDec + b.maxDec) / 2 * Math.PI / 180);
      return { ra: Math.max((b.maxRA - b.minRA) * cd, 0.001), dec: Math.max(b.maxDec - b.minDec, 0.001), cd: cd };
    }
    var fb = boundsOf(focal), fsp = spansOf(fb);
    var ctxMode = focal.length < 2 || Math.max(fsp.ra, fsp.dec) < CTX_SPAN_MIN;

    var vb;
    if (ctxMode) {
      var cRA = (fb.minRA + fb.maxRA) / 2, cDec = (fb.minDec + fb.maxDec) / 2;
      var span = Math.min(CTX_FIELD_MAX, Math.max(CTX_FIELD_MIN, Math.max(fsp.ra, fsp.dec) * 3));
      vb = { minRA: cRA - span / 2 / Math.max(fsp.cd, 0.2), maxRA: cRA + span / 2 / Math.max(fsp.cd, 0.2),
             minDec: cDec - span / 2, maxDec: cDec + span / 2 };
    } else {
      vb = boundsOf(main.concat(qing));
      var vs = spansOf(vb);
      if (vs.ra < 1) { var m1 = (vb.minRA + vb.maxRA) / 2; vb.minRA = m1 - 0.5 / vs.cd; vb.maxRA = m1 + 0.5 / vs.cd; }
      if (vs.dec < 1) { var m2 = (vb.minDec + vb.maxDec) / 2; vb.minDec = m2 - 0.5; vb.maxDec = m2 + 0.5; }
    }
    var W = 320, H = 228, pL = 14, pR = 14, pT = 18, pB = 30;
    var spanRA = Math.max(vb.maxRA - vb.minRA, 0.01), spanDec = Math.max(vb.maxDec - vb.minDec, 0.01);
    function X(ra) { return pL + (vb.maxRA - ra) / spanRA * (W - pL - pR); }
    function Y(dec) { return pT + (vb.maxDec - dec) / spanDec * (H - pT - pB); }
    function R(mag) { return Math.max(1.6, Math.min(8.6, 6.6 - (typeof mag === 'number' ? mag : 3) * 0.85)); }
    function subOf(s) { return (s.designation || '') + ' · ' + (typeof s.vmag === 'number' ? s.vmag.toFixed(2) : '—'); }

    var le = lineEntry(a);
    var focalCls = le && le.status === 'doubtful' ? 'sx-plot-dash' : 'sx-plot-line';
    function edgesByName(ast, byName) {
      var e0 = lineEntry(ast);
      if (!e0 || !e0.edges) return null;
      var out = [];
      e0.edges.forEach(function (e) { if (byName[e[0]] && byName[e[1]]) out.push([byName[e[0]], byName[e[1]]]); });
      return out;
    }
    function edgeLines(edges, cls) {
      var out = '';
      (edges || []).forEach(function (e) {
        out += '<line class="' + cls + '" x1="' + X(e[0].ra_deg).toFixed(1) + '" y1="' + Y(e[0].dec_deg).toFixed(1) +
          '" x2="' + X(e[1].ra_deg).toFixed(1) + '" y2="' + Y(e[1].dec_deg).toFixed(1) + '"/>';
      });
      return out;
    }
    function raPolyline(list, cls) {
      if (list.length < 2) return '';
      var pts = list.slice().sort(function (x, y) { return x.ra_deg - y.ra_deg; })
        .map(function (s) { return X(s.ra_deg).toFixed(1) + ',' + Y(s.dec_deg).toFixed(1); }).join(' ');
      return '<polyline class="' + cls + '" points="' + pts + '" fill="none"/>';
    }

    var h = '';
    var labels = []; /* {x,y,r,name,sub,cls,pr} */

    if (ctxMode) {
      /* 邻官：成员星落入视场者按官聚合（空间相邻、不限区），最近 10 官 */
      var fc = { x: (fb.minRA + fb.maxRA) / 2, y: (fb.minDec + fb.maxDec) / 2 };
      var neigh = [];
      (XG.asterisms || []).forEach(function (o) {
        if (o.name === a.name && o.section === a.section) return;
        var pts = (o.stars || []).filter(has).filter(function (s) {
          return s.ra_deg >= vb.minRA && s.ra_deg <= vb.maxRA && s.dec_deg >= vb.minDec && s.dec_deg <= vb.maxDec;
        });
        if (!pts.length) return;
        var cx = 0, cy = 0;
        pts.forEach(function (s) { cx += s.ra_deg; cy += s.dec_deg; });
        neigh.push({ ast: o, pts: pts, cx: cx / pts.length, cy: cy / pts.length });
      });
      neigh.sort(function (p, q) { return Math.hypot(p.cx - fc.x, p.cy - fc.y) - Math.hypot(q.cx - fc.x, q.cy - fc.y); });
      neigh = neigh.slice(0, 10);
      neigh.forEach(function (n) {
        var byName = {}; n.pts.forEach(function (s) { byName[s.cn_name] = s; });
        var es = edgesByName(n.ast, byName);
        if (es && es.length) h += edgeLines(es, 'sx-plot-line ctx');
        else if (!lineEntry(n.ast) && n.pts.length > 1) h += raPolyline(n.pts, 'sx-plot-line ctx');
        n.pts.forEach(function (s) {
          h += '<circle class="sx-star ctx" cx="' + X(s.ra_deg).toFixed(1) + '" cy="' + Y(s.dec_deg).toFixed(1) +
            '" r="' + Math.max(1.3, R(s.vmag) * 0.55).toFixed(1) + '"/>';
        });
        labels.push({ x: X(n.cx), y: Y(n.cy), r: 3, name: n.ast.name, sub: '', cls: 'ctx', pr: 2 });
      });
      var fEdges = edgesByName(a, mainByName);
      if (fEdges && fEdges.length) h += edgeLines(fEdges, focalCls);
      focal.forEach(function (s) {
        var rr = Math.max(R(s.vmag) * 1.15, 2.8); /* 暗星本官也须醒目，下限 2.8 */
        h += '<circle class="sx-star focal" cx="' + X(s.ra_deg).toFixed(1) + '" cy="' + Y(s.dec_deg).toFixed(1) + '" r="' + rr.toFixed(1) + '"/>';
        labels.push({ x: X(s.ra_deg), y: Y(s.dec_deg), r: rr, name: s.cn_name, sub: subOf(s), cls: '', pr: 0 });
      });
    } else {
      var fEdges2 = edgesByName(a, mainByName);
      if (fEdges2 && fEdges2.length) h += edgeLines(fEdges2, focalCls);
      else if (!le && main.length > 1) h += raPolyline(main, focalCls);
      h += raPolyline(qing, 'sx-plot-dash');
      var mDes = {}; main.forEach(function (s) { mDes[s.designation] = 1; });
      qing.forEach(function (s) {
        if (mDes[s.designation]) return; /* 共有星在主口径点上标注 */
        h += '<circle class="sx-star ghost" cx="' + X(s.ra_deg).toFixed(1) + '" cy="' + Y(s.dec_deg).toFixed(1) + '" r="' + R(s.vmag).toFixed(1) + '"/>';
        labels.push({ x: X(s.ra_deg), y: Y(s.dec_deg), r: R(s.vmag), name: s.cn_name, sub: subOf(s), cls: 'ghost', pr: 1 });
      });
      main.forEach(function (s) {
        var shared = !!qDes[s.designation];
        if (shared) h += '<circle class="sx-star-ring" cx="' + X(s.ra_deg).toFixed(1) + '" cy="' + Y(s.dec_deg).toFixed(1) + '" r="' + (R(s.vmag) + 3.2).toFixed(1) + '"/>';
        h += '<circle class="sx-star" cx="' + X(s.ra_deg).toFixed(1) + '" cy="' + Y(s.dec_deg).toFixed(1) + '" r="' + R(s.vmag).toFixed(1) + '"/>';
        labels.push({ x: X(s.ra_deg), y: Y(s.dec_deg), r: R(s.vmag), name: s.cn_name, sub: subOf(s), cls: '', pr: 0 });
      });
    }

    /* ---- 标签排版：16 候选位（两圈×八向）贪心取重叠面积最小，同分取近位；
     * 标签盒被钳进图幅；盒心离星点过远时加引线。确定性：同输入同结果。 ---- */
    var dense = labels.length >= 10;
    var fsT = dense ? 10 : 11, fsS = dense ? 7.5 : 8.5;
    function textW(txt, fs) {
      var w = 0;
      for (var i = 0; i < txt.length; i++) w += (txt.charCodeAt(i) > 0x2E7F ? fs : fs * 0.58);
      return w;
    }
    var placed = [{ x: 4, y: H - 18, w: 190, h: 14 }]; /* 左下注记行预留位 */
    labels.sort(function (p, q) { return p.pr - q.pr; });
    var leaderSVG = '', labelSVG = '';
    labels.forEach(function (lb) {
      var nameFs = lb.cls === 'ctx' ? 9 : fsT;
      var w = Math.max(textW(lb.name, nameFs), lb.sub ? textW(lb.sub, fsS) : 0) + 3;
      var hh = lb.sub ? (fsT + fsS + 5) : 13;
      var g = lb.r + 4;
      var dirs = [];
      [[1, 0], [0.72, -0.72], [0.72, 0.72], [0, -1], [0, 1], [-1, 0], [-0.72, -0.72], [-0.72, 0.72]].forEach(function (u) {
        dirs.push([u[0], u[1], g]);
        dirs.push([u[0], u[1], g * 1.9]);
        dirs.push([u[0], u[1], 30]);
        dirs.push([u[0], u[1], 44]);
      });
      var best = null, bestScore = Infinity;
      dirs.forEach(function (d, ci) {
        var bx = lb.x + d[0] * d[2] - (d[0] < -0.1 ? w : (Math.abs(d[0]) <= 0.1 ? w / 2 : 0));
        var by = lb.y + d[1] * d[2] - (d[1] < -0.1 ? hh : (Math.abs(d[1]) <= 0.1 ? hh / 2 : 0));
        var cx = Math.max(2, Math.min(W - 2 - w, bx));
        var cy = Math.max(2, Math.min(H - 2 - hh, by));
        var ov = 0;
        placed.forEach(function (p) {
          var ox = Math.max(0, Math.min(cx + w, p.x + p.w) - Math.max(cx, p.x));
          var oy = Math.max(0, Math.min(cy + hh, p.y + p.h) - Math.max(cy, p.y));
          ov += ox * oy;
        });
        var score = ov * 1000 + ci;
        if (score < bestScore) { bestScore = score; best = { x: cx, y: cy }; }
      });
      placed.push({ x: best.x, y: best.y, w: w, h: hh });
      var ncx = best.x + w / 2, ncy = best.y + hh / 2;
      var dist = Math.hypot(ncx - lb.x, ncy - lb.y);
      if (dist > lb.r + 17) {
        var ex = lb.x + (ncx - lb.x) / dist * (lb.r + 1.5), ey = lb.y + (ncy - lb.y) / dist * (lb.r + 1.5);
        var gx2 = lb.x + (ncx - lb.x) / dist * Math.max(lb.r + 2, dist - Math.min(w, hh) / 2 - 1);
        var gy2 = lb.y + (ncy - lb.y) / dist * Math.max(lb.r + 2, dist - Math.min(w, hh) / 2 - 1);
        leaderSVG += '<line class="sx-leader" x1="' + ex.toFixed(1) + '" y1="' + ey.toFixed(1) + '" x2="' + gx2.toFixed(1) + '" y2="' + gy2.toFixed(1) + '"/>';
      }
      labelSVG += '<g class="sx-label"><text class="sx-plot-t' + (lb.cls === 'ctx' ? ' ctx' : '') +
        '" x="' + (best.x + 1).toFixed(1) + '" y="' + (best.y + (lb.cls === 'ctx' ? 10 : fsT + 1)).toFixed(1) + '">' + txEsc(lb.name) + '</text>';
      if (lb.sub) labelSVG += '<text class="sx-plot-s" x="' + (best.x + 1).toFixed(1) + '" y="' + (best.y + fsT + fsS + 3).toFixed(1) + '">' + esc(lb.sub) + '</text>';
      labelSVG += '</g>';
    });

    var note = (ctxMode ? t('sx_plot_note_ctx') : t('sx_plot_note')) +
      (le && le.status === 'doubtful' && !ctxMode ? ' · ' + t('sx_plot_doubt') : '');
    return '<svg class="sx-plot' + (dense ? ' dense' : '') + '" viewBox="0 0 320 228" role="img" aria-label="' + txEsc(a.name) + '">' +
      h + leaderSVG + labelSVG +
      '<text class="sx-plot-s" x="8" y="' + (H - 8) + '">' + esc(note) + '</text></svg>';
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
      h += '<div class="sx-sec">' + esc(t('sx_siblings')) + ' · ' + txEsc(a.section) +
        ' <small>' + esc(t('sx_tap_go')) + '</small></div>';
      h += '<div class="sx-sec-note">' + esc(tf(t('sx_siblings_note'), a.section)) + '</div>';
      h += '<div class="sx-chips">';
      others.forEach(function (x) {
        h += '<span class="sx-chip" data-sx-detail="' + esc(astKey(x)) + '">' + txEsc((isYuan ? '' : '同' + a.section.replace(/宿$/, '') + ' · ') + x.name) + '</span>';
      });
      h += '</div>';
    }
    $('sx-detail').innerHTML = h;
  }

  /* ---------------- s5 《步天歌》典籍页 ---------------- */
  var bookOpen = {}; /* section -> 是否展开 */
  var POP_SECTIONS = ['角宿', '亢宿', '氐宿', '房宿', '心宿', '尾宿', '箕宿', '斗宿', '牛宿', '女宿', '虚宿', '危宿', '室宿', '壁宿', '奎宿', '娄宿', '胃宿', '昴宿', '毕宿', '觜宿', '参宿', '井宿', '鬼宿', '柳宿', '星宿', '张宿', '翼宿', '轸宿', '紫微垣', '太微垣', '天市垣']; /* 点句浮图作用域（v2.3.0 图式推广，31 区全量）：已落图式层的段歌诀句可点开浮图 */

  function renderBook(focusSection) {
    var host = $('sx-book'); if (!host || !BT) return;
    if (tourState) tourPause(); /* 重渲染即停播：定时器与旧 DOM 钮脱钩，位置保留、手动续行 */
    closeVersePop(); /* 重渲染（展开他段/切语言）先收浮层，打开状态不残留 */
    if (focusSection) bookOpen[focusSection] = true;
    else if (!Object.keys(bookOpen).length && secOrder.length) bookOpen[secOrder[0]] = true;
    var auth = (BT.authorship || '').split('（')[0];
    var h = '';
    h += '<div class="sx-band"><div class="sx-kicker">' + esc(t('sx_book_kicker')) + '</div>' +
      '<div class="sx-title">' + txEsc(BT.title || '步天歌') + '</div>' +
      '<div class="sx-sub">' + txEsc(auth + ' · ' + (BT.version || '')) + '<br>' +
      txEsc(tf(t('sx_book_sub'), BT.total_lines, secOrder.length)) + '</div></div>';

    if (tourState) h += tourPanelHTML();
    else h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px">' +
      '<button class="btn primary" data-sx-tour="enter">' + txEsc('导览 · 逐句看图') + '</button>' +
      '<span style="font-family:var(--sans);font-size:.8rem;color:var(--muted)">' +
      txEsc('按区逐句步进，歌诀与示意图同步高亮 · 全歌 ' + BT.total_lines + ' 句') + '</span></div>';

    h += '<div class="sx-sec">' + esc(t('sx_toc')) + ' <small>' + esc(t('sx_toc_note')) + '</small></div><div class="sx-toc">';
    secOrder.forEach(function (s) {
      h += '<span data-sx-toc="' + esc(s) + '">' + txEsc(s) + '<i>' + (secInfo[s] ? secInfo[s].lineCount : 0) + '</i></span>';
    });
    h += '</div>';

    var tourG = 0; /* 导览全歌序号：与 tourFlat() 同序（secOrder × 区内行序），导览模式全区展开故逐行对齐 */
    secOrder.forEach(function (s) {
      var si = secInfo[s]; if (!si) return;
      var open = tourState ? true : !!bookOpen[s];
      h += '<div class="sx-booksec" id="sx-sec-' + esc(s) + '">' +
        '<div class="sx-sec" data-sx-toc="' + esc(s) + '">' + txEsc(s) + ' <small>' + txEsc(tf(t('sx_section_lines'), si.lineCount)) + '</small>' +
        '<span class="sx-toregion" data-sx-region="' + esc(s) + '">' + esc(t('sx_to_region')) + '</span></div>';
      if (open) {
        si.lines.forEach(function (l, li) {
          var g = tourG++;
          var isStar = l.kind === '星官句' && l.asterism;
          var isPop = !tourState && isStar && POP_SECTIONS.indexOf(s) >= 0;
          var isCur = !!tourState && g === tourState.pos;
          h += '<div class="sx-verse' + (isStar ? '' : ' dim') + (isPop ? ' pop' : '') + (isCur ? ' on' : '') + '"' +
            (isPop ? ' data-sx-pop="' + esc(s) + ':' + li + '"' : '') +
            (tourState ? ' data-sx-tour-g="' + g + '"' + (isCur ? ' data-sx-tour-cur="1" style="background:var(--cinnabar-wash);box-shadow:inset 4px 0 0 var(--cinnabar)"' : '') : '') +
            '><span class="sx-verse-t">' + txEsc(l.text) + '</span>';
          if (isStar) {
            h += '<span class="sx-verse-tags">';
            l.asterism.split('、').forEach(function (nm) {
              var target = si.list.filter(function (x) { return x.name === nm; })[0];
              if (target) h += '<span class="sx-verse-tag" data-sx-detail="' + esc(astKey(target)) + '">' + txEsc(nm) + '</span>';
              else h += '<span class="sx-verse-tag off">' + txEsc(nm) + '</span>';
            });
            if (isPop) h += '<span class="sx-verse-pop-hint">' + esc(t('sx_pop_hint')) + '</span>';
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
    if (tourState) { tourState.chartKey = ''; tourSync(false); }
    if (focusSection) {
      var el = $('sx-sec-' + focusSection);
      if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 30);
    }
  }

  /* ---------------- s5++ 《步天歌》导览模式 ----------------
   * 典籍页内逐句步进：全歌按《步天歌》序（secOrder＝31 区）拉平为 361 句，
   * 当前句整行高亮（既有 .sx-verse.on＋var(--cinnabar) 内联描边，走变量链、
   * 红光三态随 body.sky-red 变量重映射）并自动滚动居中；同句星官在示意图上
   * 同步高亮——图直接复用 regionMapHTML 的 pop 模式（图式坐标/描点与区页
   * 总览图、点句浮图同源，不新造坐标、不动遗留待裁三处连线层），高亮着色
   * 按浮图 .sx-pop .sx-hl/.sx-dim 同款规则以 var() 内联落到 SVG 子元素上
   * （CSS 文件本批不动，正式作用域样式列入回执清单请协调补）。
   * 句→星官映射只用 butiange.json 的 asterism 字段（kind＝星官句才有）：
   * 352 句星官句全部可解出至少一座本区星官（404 个官名、44 句多官）；
   * kind 非星官句的 9 句（天市垣结构句 4＋张宿/轸宿回指句 5，无 asterism
   * 字段）诚实降级：只高亮句子，图不高亮单官、整区以高亮呈现作语境，
   * 面板注文言明；回指句所指虽在 kind 文案里写明属太微垣，亦不跨区编造
   * 映射。星官句中整官未绘于书图者（太微垣郎将）随浮图同口径注出。
   * 播放：setInterval 自动步进，间隔三档（快 1.5s／常 2.4s／慢 4.5s，默认常档，3 秒内必步进一句）；
   * 跨区自动续行，末句自动停。切视图/关页/重渲染/页面隐藏皆停播（tourPause
   * 挂在 openRegion/openDetail/openDeity/activate/返回钮/visibilitychange/
   * renderBook 入口）。门控不变：入口在本页内，本页经 openButiange 的
   * starGate 才可达，导览不另开口子。 */
  var tourState = null; /* {flat:[{section,secIdx,idx,line}], pos, playing, timer, speed, chartKey} */

  function tourFlat() {
    var flat = [];
    secOrder.forEach(function (s, si2) {
      var si = secInfo[s]; if (!si) return;
      si.lines.forEach(function (l, li) { flat.push({ section: s, secIdx: si2, idx: li, line: l }); });
    });
    return flat;
  }
  function tourTargets(entry) {
    if (!entry || !entry.line || entry.line.kind !== '星官句' || !entry.line.asterism) return [];
    var si = secInfo[entry.section]; if (!si) return [];
    var out = [];
    entry.line.asterism.split('、').forEach(function (nm) {
      var a = si.list.filter(function (x) { return x.name === nm; })[0];
      if (a) out.push(a);
    });
    return out;
  }
  function tourPanelHTML() {
    var btn = 'style="font-family:var(--sans)"';
    return '<div id="sx-tour" style="position:sticky;top:8px;z-index:6;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:12px;margin:0 0 14px;box-shadow:0 8px 24px rgba(0,0,0,.14)">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">' +
      '<span style="font-family:var(--serif);font-weight:700;font-size:1.05rem;color:var(--ink)">' + txEsc('步天歌导览') + '</span>' +
      '<span id="sx-tour-progress" style="font-family:var(--sans);font-size:.74rem;color:var(--muted)"></span></div>' +
      '<div id="sx-tour-verse" style="font-family:var(--serif);font-size:1.3rem;letter-spacing:.08em;color:var(--cinnabar-deep);margin-top:6px;line-height:1.5"></div>' +
      '<div id="sx-tour-note" style="font-family:var(--sans);font-size:.76rem;color:var(--muted);margin-top:2px;line-height:1.6"></div>' +
      '<div id="sx-tour-chart"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">' +
      '<button class="btn" ' + btn + ' data-sx-tour="prev">' + txEsc('上一句') + '</button>' +
      '<button class="btn primary" ' + btn + ' id="sx-tour-play" data-sx-tour="play">' + txEsc('播放') + '</button>' +
      '<button class="btn" ' + btn + ' data-sx-tour="next">' + txEsc('下一句') + '</button>' +
      '<span style="font-family:var(--sans);font-size:.74rem;color:var(--muted)">' + txEsc('间隔') + '</span>' +
      '<button class="btn" ' + btn + ' data-sx-tour="speed:1500" data-sx-tour-speed="1500">' + txEsc('快') + '</button>' +
      '<button class="btn" ' + btn + ' data-sx-tour="speed:2400" data-sx-tour-speed="2400">' + txEsc('常') + '</button>' +
      '<button class="btn" ' + btn + ' data-sx-tour="speed:4500" data-sx-tour-speed="4500">' + txEsc('慢') + '</button>' +
      '<button class="btn" data-sx-tour="exit" style="font-family:var(--sans);margin-left:auto">' + txEsc('退出导览') + '</button>' +
      '</div></div>';
  }
  /* 浮图高亮规则的内联复刻（.sx-pop .sx-hl/.sx-dim 同值，全走 var() 变量链） */
  function tourPaintChart(box) {
    if (!box) return;
    function paint(sel, props) {
      box.querySelectorAll(sel).forEach(function (el) {
        Object.keys(props).forEach(function (k) { el.style.setProperty(k, props[k]); });
      });
    }
    paint('.sx-dim .sx-star', { 'fill': 'var(--ink-2)', 'stroke': 'none', 'opacity': '.45' });
    paint('.sx-dim .sx-plot-line,.sx-dim .sx-plot-dash', { 'stroke': 'var(--muted)', 'opacity': '.32' });
    paint('.sx-dim .sx-plot-t', { 'fill': 'var(--muted)', 'opacity': '.8' });
    paint('.sx-dim .sx-leader', { 'stroke': 'var(--muted)', 'opacity': '.35' });
    paint('.sx-dim .sx-star.sx-sch-ring', { 'fill': 'var(--paper)', 'stroke': 'var(--muted)', 'stroke-width': '1.1', 'opacity': '.6' });
    paint('.sx-hl .sx-star', { 'fill': 'var(--cinnabar)', 'stroke': 'var(--cinnabar-deep)', 'stroke-width': '.8' });
    paint('.sx-hl .sx-plot-line', { 'stroke': 'var(--cinnabar)', 'stroke-width': '1.9' });
    paint('.sx-hl .sx-plot-dash', { 'stroke': 'var(--cinnabar)', 'stroke-width': '1.5' });
    paint('.sx-hl .sx-plot-t', { 'fill': 'var(--cinnabar-deep)', 'font-weight': '700' });
    paint('.sx-hl .sx-leader', { 'stroke': 'var(--cinnabar)', 'opacity': '.65' });
  }
  function tourSync(scroll) {
    if (!tourState) return;
    var st = tourState, e = st.flat[st.pos]; if (!e) return;
    var si = secInfo[e.section]; if (!si) return;
    var targets = tourTargets(e);
    var whole = !targets.length; /* 无映射降级：整区高亮呈现，不指单官 */
    var prog = $('sx-tour-progress');
    if (prog) prog.textContent = T('第 ' + (e.secIdx + 1) + ' 区 · ' + e.section +
      ' · 本区第 ' + (e.idx + 1) + '/' + si.lineCount + ' 句 · 全歌第 ' + (st.pos + 1) + '/' + st.flat.length + ' 句');
    var verse = $('sx-tour-verse');
    if (verse) verse.textContent = T(e.line.text);
    var note = $('sx-tour-note');
    if (note) {
      if (whole) {
        note.textContent = T('本句为' + (String(e.line.kind || '').indexOf('回指') === 0 ? '回指句' : '结构句') +
          '，不指单一星官：图中整区呈现作语境，不作单官高亮。');
      } else {
        var nt = T('本句星官：') + targets.map(function (a) { return T(a.name); }).join(' · ');
        var sch = schemaReady(si);
        targets.forEach(function (a) {
          var sa = sch ? sch.asterisms[a.name] : null;
          if (sa && !(sa.stars || []).length) nt += ' ' + tf(t('sx_pop_notplotted'), T(a.name));
        });
        note.textContent = nt;
      }
    }
    var hl = {};
    if (whole) si.list.forEach(function (a) { hl[astKey(a)] = 1; });
    else targets.forEach(function (a) { hl[astKey(a)] = 1; });
    var key = e.section + '|' + (whole ? '__whole__' : targets.map(function (a) { return astKey(a); }).join(','));
    var box = $('sx-tour-chart');
    if (box && st.chartKey !== key) {
      box.innerHTML = regionMapHTML(si, { pop: true, hl: hl }).html;
      tourPaintChart(box);
      st.chartKey = key;
    }
    var prev = document.querySelector('[data-sx-tour-cur]');
    if (prev && prev.getAttribute('data-sx-tour-g') !== String(st.pos)) {
      prev.removeAttribute('data-sx-tour-cur'); prev.classList.remove('on');
      prev.style.background = ''; prev.style.boxShadow = '';
    }
    var row = document.querySelector('[data-sx-tour-g="' + st.pos + '"]');
    if (row) {
      row.setAttribute('data-sx-tour-cur', '1'); row.classList.add('on');
      row.style.background = 'var(--cinnabar-wash)'; row.style.boxShadow = 'inset 4px 0 0 var(--cinnabar)';
      if (scroll) {
        row.scrollIntoView({ block: 'center' });
        /* 导览面板 sticky 置顶且较高：居中滚动会把当前句压到面板之下，
         * 再按面板下沿回补滚动量，让当前句落在面板正下方完整可见 */
        var panel = $('sx-tour'), view = $('view-butiange');
        if (panel && view) {
          var pr = panel.getBoundingClientRect(), rr = row.getBoundingClientRect();
          if (rr.top < pr.bottom + 8) view.scrollTop -= (pr.bottom + 8 - rr.top);
          rr = row.getBoundingClientRect();
          if (rr.bottom > window.innerHeight - 8) view.scrollTop += (rr.bottom - (window.innerHeight - 8));
        }
      }
    }
    var pb = $('sx-tour-play');
    if (pb) pb.textContent = T(st.playing ? '暂停' : '播放');
    document.querySelectorAll('[data-sx-tour-speed]').forEach(function (b) {
      var on = parseInt(b.getAttribute('data-sx-tour-speed'), 10) === st.speed;
      b.style.borderColor = on ? 'var(--cinnabar)' : '';
      b.style.color = on ? 'var(--cinnabar-deep)' : '';
      b.style.fontWeight = on ? '700' : '';
    });
  }
  function tourPause() {
    if (!tourState) return;
    tourState.playing = false;
    if (tourState.timer) { clearInterval(tourState.timer); tourState.timer = null; }
    var pb = $('sx-tour-play');
    if (pb) pb.textContent = T('播放');
  }
  function tourStartTimer() {
    if (!tourState) return;
    if (tourState.timer) clearInterval(tourState.timer);
    tourState.timer = setInterval(function () {
      if (!tourState || !tourState.playing) return;
      if (tourState.pos >= tourState.flat.length - 1) { tourPause(); return; }
      tourState.pos++;
      tourSync(true);
    }, tourState.speed);
  }
  function tourPlayToggle() {
    if (!tourState) return;
    if (tourState.playing) { tourPause(); return; }
    if (tourState.pos >= tourState.flat.length - 1) tourState.pos = 0; /* 末句按播放＝从头重播 */
    tourState.playing = true;
    tourStartTimer();
    tourSync(false);
  }
  function tourSetSpeed(ms) {
    if (!tourState || !ms) return;
    tourState.speed = ms;
    if (tourState.playing) tourStartTimer();
    tourSync(false);
  }
  function tourGo(delta) {
    if (!tourState) return;
    var n = tourState.pos + delta;
    if (n < 0) n = 0;
    if (n > tourState.flat.length - 1) n = tourState.flat.length - 1;
    tourState.pos = n;
    tourSync(true);
  }
  function tourJump(pos) {
    if (!tourState || typeof pos !== 'number' || pos < 0 || pos >= tourState.flat.length) return;
    tourState.pos = pos;
    tourSync(true);
  }
  function enterTour() {
    if (!BT || !secOrder.length) return;
    closeVersePop();
    tourState = { flat: tourFlat(), pos: 0, playing: false, timer: null, speed: 2400, chartKey: '' };
    if (!tourState.flat.length) { tourState = null; return; }
    renderBook();
    tourSync(true);
  }
  function exitTour() {
    tourPause();
    tourState = null;
    renderBook(); /* 回普通典籍页：展开状态复归 bookOpen 原状，导览面板与全量展开一并撤下 */
  }

  /* ---------------- s5+ 点句浮图（v2.3.0，作用域：POP_SECTIONS 已落图式层的段） ----------------
   * 点本段歌诀句不跳页：当前页悬浮全区示意图（regionMapHTML pop 模式＝与区页
   * 总览图同源同渲染），本句所指星官朱砂高亮、余官中性色；主星（数据层
   * principal 字段）细金环常驻（盘径钳至普通档）。浮层内保留「看详情」入口（原签点击
   * 进详情的能力不丢）。关闭：✕／点图外空白／Esc；关闭后恢复打开前滚动
   * 位置。样张段内句身与其星官签的点击均开浮图；其余各段维持原行为。 */
  var popState = null; /* {scroll} 打开前 view-butiange 的滚动位置 */
  function openVersePop(section, idx) {
    var si = secInfo[section]; if (!si) return;
    var line = si.lines[idx]; if (!line || !line.asterism) return;
    var pop = $('sx-pop'); if (!pop) return;
    var targets = [];
    line.asterism.split('、').forEach(function (nm) {
      var a = si.list.filter(function (x) { return x.name === nm; })[0];
      if (a) targets.push(a);
    });
    if (!targets.length) return;
    var hl = {}; targets.forEach(function (a) { hl[astKey(a)] = 1; });
    var chart = regionMapHTML(si, { pop: true, hl: hl });
    $('sx-pop-verse').innerHTML = txEsc(line.text) + '<small>' +
      targets.map(function (a) { return txEsc(a.name); }).join(' · ') + '</small>';
    $('sx-pop-chart').innerHTML = chart.html;
    var notes = [t('sx_pop_legend')];
    var schPop = schemaReady(si);
    if (schPop) notes.push(t('sx_pop_schema_note'));
    targets.forEach(function (a) {
      /* 整官未绘于书图（如太微垣郎将）：图中无点可高亮，注里如实说明 */
      var sa = schPop ? schPop.asterisms[a.name] : null;
      if (sa && !(sa.stars || []).length) notes.push(tf(t('sx_pop_notplotted'), T(a.name)));
    });
    targets.forEach(function (a) {
      var plotted = (a.stars || []).filter(function (st) {
        return typeof st.ra_deg === 'number' && typeof st.dec_deg === 'number';
      }).length;
      var miss = (a.star_count_tradition || 0) - plotted;
      if (miss > 0) notes.push(tf(t('sx_pop_missing'), T(a.name), miss));
    });
    $('sx-pop-note').textContent = notes.join(' ');
    $('sx-pop-links').innerHTML = targets.map(function (a) {
      return '<span class="sx-pop-link" data-sx-pop-detail="' + esc(astKey(a)) + '">' +
        txEsc(a.name) + ' · ' + esc(t('sx_pop_detail')) + ' ›</span>';
    }).join('');
    var view = $('view-butiange');
    popState = { scroll: view ? view.scrollTop : 0 };
    pop.hidden = false;
    document.querySelectorAll('.sx-verse.on').forEach(function (el) { el.classList.remove('on'); });
    var row = document.querySelector('[data-sx-pop="' + section + ':' + idx + '"]');
    if (row) row.classList.add('on');
  }
  function closeVersePop() {
    var pop = $('sx-pop');
    if (!pop || pop.hidden) { popState = null; return; }
    pop.hidden = true;
    document.querySelectorAll('.sx-verse.on').forEach(function (el) { el.classList.remove('on'); });
    if (popState) {
      var view = $('view-butiange');
      if (view) view.scrollTop = popState.scroll;
      popState = null;
    }
  }

  /* ---------------- 首页今日星空卡（s4） ---------------- */
  var SEASON_QUOTE = { '春': '斗柄东指，天下皆春', '夏': '斗柄南指，天下皆夏', '秋': '斗柄西指，天下皆秋', '冬': '斗柄北指，天下皆冬' };
  var DIR8_POS = [ /* [名, 角度(子=0顺时针)] */
    ['北', 0], ['东北', 45], ['东', 90], ['东南', 135], ['南', 180], ['西南', 225], ['西', 270], ['西北', 315]
  ];

  /* 北斗七星小图（v2.1.0 (4)：替代原红色楔形指针）：坐标与图鉴北斗条、
   * 步罡 STARS 同源（BSC5/J2000）；切平面投影——赤经向左（观天习惯，同
   * bugang 步位图）、赤纬向上；以七星形心为原点归一化，最远星（摇光）
   * 落在 r=44（圆盘 180 坐标系）。DIPPER_DIR＝本地投影中「斗身四星形心→
   * 摇光」的罗盘角（北起顺时针）；渲染时整组旋转 pointing − DIPPER_DIR，
   * 使斗柄指向角与原楔形尖端角（pointingIndex×30）严格一致、读数不变。 */
  var DIPPER_STARS = [
    { n: '天枢', ra: 165.93208, dec: 61.75083 },
    { n: '天璇', ra: 165.46042, dec: 56.38250 },
    { n: '天玑', ra: 178.45750, dec: 53.69472 },
    { n: '天权', ra: 183.85667, dec: 57.03250 },
    { n: '玉衡', ra: 193.50708, dec: 55.95972 },
    { n: '开阳', ra: 200.98125, dec: 54.92528 },
    { n: '摇光', ra: 206.88500, dec: 49.31333 }
  ];
  var DIPPER_PTS = (function () {
    var raC = 0, decC = 0, i;
    for (i = 0; i < 7; i++) { raC += DIPPER_STARS[i].ra; decC += DIPPER_STARS[i].dec; }
    raC /= 7; decC /= 7;
    var cd = Math.cos(decC * Math.PI / 180);
    var pts = DIPPER_STARS.map(function (s) {
      return { u: -(s.ra - raC) * cd, v: s.dec - decC };
    });
    var maxR = 0;
    pts.forEach(function (p) { var r = Math.sqrt(p.u * p.u + p.v * p.v); if (r > maxR) maxR = r; });
    var k = 44 / maxR;
    pts.forEach(function (p) { p.u *= k; p.v *= k; });
    return pts;
  })();
  var DIPPER_DIR = (function () {
    var bu = 0, bv = 0, i;
    for (i = 0; i < 4; i++) { bu += DIPPER_PTS[i].u; bv += DIPPER_PTS[i].v; }
    var du = DIPPER_PTS[6].u - bu / 4, dv = DIPPER_PTS[6].v - bv / 4;
    return Math.atan2(du, dv) * 180 / Math.PI;
  })();

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
    var rot = (dip.pointingIndex * 30 - DIPPER_DIR).toFixed(2);
    var lp = DIPPER_PTS.map(function (p) {
      return (cx + p.u).toFixed(1) + ',' + (cy - p.v).toFixed(1);
    });
    h += '<g class="sx-dipper" data-point-deg="' + (dip.pointingIndex * 30) + '" transform="rotate(' + rot + ' 90 90)">';
    h += '<polyline class="sx-dipper-line" points="' + lp.join(' ') + '"/>';
    h += '<line class="sx-dipper-line" x1="' + lp[3].split(',')[0] + '" y1="' + lp[3].split(',')[1] +
      '" x2="' + lp[0].split(',')[0] + '" y2="' + lp[0].split(',')[1] + '"/>';
    DIPPER_PTS.forEach(function (p, i) {
      h += '<circle class="sx-dipper-star' + (i === 6 ? ' tip' : '') + '" cx="' + (cx + p.u).toFixed(1) +
        '" cy="' + (cy - p.v).toFixed(1) + '" r="' + (i === 6 ? '3.4' : '2.7') + '"/>';
    });
    h += '</g>';
    h += '<circle class="sx-comp-c" cx="90" cy="90" r="1.6"/></svg>';
    return h;
  }

  function moonSVG(moon) {
    var illum = moon.illumination, waxing = moon.elongationDeg <= 180;
    var r = 40, rx = Math.max(0.5, Math.abs(2 * illum - 1) * r);
    var sweep = (2 * illum - 1) > 0 ? 1 : 0;
    var dark = 'M 50 10 A 40 40 0 0 0 50 90 A ' + rx.toFixed(1) + ' 40 0 0 ' + sweep + ' 50 10 Z';
    var inner = '<circle class="sx-moon-lit" cx="50" cy="50" r="40"/><path class="sx-moon-dark" d="' + dark + '"/>' +
      '<circle class="sx-moon-rim" cx="50" cy="50" r="39.3"/>';
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

  var curSkySection = null;   /* 今日值日宿所在区（如「角宿」），供「本宿星官」链 */

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
        if (tx1.lord) {
          img.removeAttribute('data-wuri-fb');
          img.onerror = function () { IMG.fallback(img, tx1.lord.image); };
          img.src = IMG.full(tx1.lord.image);
          img.hidden = false;
        }
        else img.hidden = true;
      }
      if (nameEl) nameEl.textContent = T(tx1.full);
      if (subEl) subEl.textContent = T(tf(t('sx_sky_xiu_sub'), tx1.group, tx1.xiu + '宿'));
      card.setAttribute('data-sx-lord', tx1.lord ? tx1.lord.id : '');
      /* 贯通批互链：本宿星官（同名星官详情）／本宿星君（神祇详情，与点头像卡同落点） */
      curSkySection = tx1.xiu + '宿';
      var toAst = $('sx-sky-to-ast'), toLord = $('sx-sky-to-lord');
      if (toAst) { toAst.hidden = false; toAst.textContent = T(tf(t('sx_sky_to_ast'), tx1.xiu)) + ' ›'; }
      if (toLord) {
        if (tx1.lord) { toLord.hidden = false; toLord.textContent = T(tf(t('sx_sky_to_lord'), tx1.lord.name)) + ' ›'; }
        else toLord.hidden = true;
      }
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

  /* 经文库侧《步天歌》分架已按用户 2026-10-26 指示撤下：步天歌只留星象侧入口，
     其深蓝鎏金横幅设计已移植到星象页入口卡（.sx-entry-book）。 */

  /* ---------------- 全局点击委托 ---------------- */
  document.addEventListener('click', function (e) {
    /* 《步天歌》导览控件/句行跳转优先：控件钮与导览句行不落入下方通用委托 */
    var tourBtn = e.target && e.target.closest ? e.target.closest('[data-sx-tour]') : null;
    if (tourBtn) {
      var act = tourBtn.getAttribute('data-sx-tour');
      if (act === 'enter') enterTour();
      else if (act === 'exit') exitTour();
      else if (act === 'prev') tourGo(-1);
      else if (act === 'next') tourGo(1);
      else if (act === 'play') tourPlayToggle();
      else if (act.indexOf('speed:') === 0) tourSetSpeed(parseInt(act.slice(6), 10));
      return;
    }
    var tourRow = e.target && e.target.closest ? e.target.closest('[data-sx-tour-g]') : null;
    if (tourRow && !(e.target.closest && e.target.closest('[data-sx-detail],[data-sx-region]'))) {
      tourJump(parseInt(tourRow.getAttribute('data-sx-tour-g'), 10));
      return;
    }
    /* 点句浮图（POP_SECTIONS 段）优先于通用委托：浮层内「看详情」先收浮层再进详情；
     * 作用域段句行（含行内星官签）整行开浮图，不走签的详情跳转 */
    var popLink = e.target && e.target.closest ? e.target.closest('[data-sx-pop-detail]') : null;
    if (popLink) { var pk = popLink.getAttribute('data-sx-pop-detail'); closeVersePop(); openDetail(pk); return; }
    var popRow = e.target && e.target.closest ? e.target.closest('[data-sx-pop]') : null;
    if (popRow) {
      var pv = popRow.getAttribute('data-sx-pop').split(':');
      openVersePop(pv[0], parseInt(pv[1], 10));
      return;
    }
    var el = e.target && e.target.closest ? e.target.closest('[data-sx-region],[data-sx-detail],[data-sx-deity],[data-sx-book],[data-sx-booksec],[data-sx-lords],[data-sx-more],[data-sx-toc],[data-sx-retry]') : null;
    if (!el) return;
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
    if (el.hasAttribute('data-sx-deity')) { openDeity(el.getAttribute('data-sx-deity')); return; }
    if (el.hasAttribute('data-sx-detail')) { openDetail(el.getAttribute('data-sx-detail')); return; }
    if (el.hasAttribute('data-sx-region')) { openRegion(el.getAttribute('data-sx-region')); return; }
  });

  /* ---------------- 绑定 ---------------- */
  function bind() {
    var b;
    if ((b = $('star-region-back'))) b.addEventListener('click', function () {
      hide('view-star-region'); hide('view-star-detail');
      var o = regionOrigin;
      regionOrigin = null;
      if (o && o.views && o.views.length) {
        o.views.forEach(function (vid) { show(vid); });
        requestAnimationFrame(function () {
          o.views.forEach(function (vid) {
            var v = $(vid);
            if (v && o.scroll && typeof o.scroll[vid] === 'number') v.scrollTop = o.scroll[vid];
          });
        });
      }
    });
    if ((b = $('star-detail-back'))) b.addEventListener('click', function () { hide('view-star-detail'); });
    if ((b = $('butiange-back'))) b.addEventListener('click', function () { tourPause(); closeVersePop(); hide('view-butiange'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) tourPause(); }); /* 导览播放中页面隐藏即停 */
    /* 点句浮图关闭路径：✕ 钮／点浮层外空白／Esc；返回手势走上面的 back（已先收浮层） */
    if ((b = $('sx-pop-x'))) b.addEventListener('click', function () { closeVersePop(); });
    var popEl = $('sx-pop');
    if (popEl) popEl.addEventListener('click', function (e) { if (e.target === popEl) closeVersePop(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeVersePop(); });
    var skyHead = $('sx-sky-head');
    if (skyHead) skyHead.addEventListener('click', function () {
      var id = $('today-sky-card').getAttribute('data-sx-lord');
      if (id) openDeity(id);
    });
    /* 贯通批互链绑定：本宿星官/本宿星君链、罗盘与北斗链、斗姆链 */
    var toAstB = $('sx-sky-to-ast');
    if (toAstB) toAstB.addEventListener('click', function () { if (curSkySection) openMansionAsterism(curSkySection); });
    var toLordB = $('sx-sky-to-lord');
    if (toLordB) toLordB.addEventListener('click', function () {
      var id = $('today-sky-card').getAttribute('data-sx-lord');
      if (id) openDeity(id);
    });
    var compB = $('sx-sky-compass');
    if (compB) compB.addEventListener('click', function () { openBeidouDetail(); });
    var bdB = $('sx-sky-beidou');
    if (bdB) bdB.addEventListener('click', function () { openBeidouDetail(); });
    var dmB = $('sx-sky-doumu');
    if (dmB) dmB.addEventListener('click', function () { openDeity('doumu'); });
    renderTodaySky();
    setInterval(renderTodaySky, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) renderTodaySky(); });
    /* 语言切换时重绘动态面（app.js 的 __wuri_rerender 链式追加，不覆盖原回调） */
    var prev = window.__wuri_rerender;
    window.__wuri_rerender = function () {
      if (prev) prev();
      renderTodaySky();
      if (XG && BT) {
        var tsTab = $('tab-stars');
        if (tsTab && tsTab.classList.contains('active')) renderHome();
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

  /* ===== 红光模式·全 App 全局开关（v2.1.0 (9) 起，2026-10-25 改全局）=====
   * 一个总开关、两个入口（星象页页首 #sky-red-toggle＋设置页 #sky-red-toggle-me）、AR 页红光钮共用同一状态；
   * 状态存 localStorage wuri_sky_redlight_v1；呈现走 body.sky-red 的全局 CSS（body 级变量重映射＋
   * 图/svg 全域红处理＋theme-color 联动 #080201，见 redThemeColor）；全 App 一致生效/恢复，与日/夜主题正交。 */
  var RED_KEY = 'wuri_sky_redlight_v1';
  function redOn() { try { return localStorage.getItem(RED_KEY) === '1'; } catch (e) { return false; } }
  function redSyncUI(v) {
    ['sky-red-toggle', 'sky-red-toggle-me'].forEach(function (id) { var el = $(id); if (el) el.checked = !!v; });
  }
  /* theme-color 联动（2026-10-25 用户报障：红光下系统状态栏一带仍白底）：
   * 开红光→ #080201（即 tabbar 红光底 rgba(8,2,1) 的实色）；关红光→按当前
   * 日/夜主题恢复（与 app.js applyTheme 同口径：夜 #060608／日 #F5F1E6，不写死单一值）。
   * applyTheme 侧亦有同口径回压（系统主题切换时不把红盖掉）。 */
  function redThemeColor(v) {
    try {
      var mc = document.querySelector('meta[name=theme-color]');
      if (!mc) return;
      if (v) mc.setAttribute('content', '#080201');
      else mc.setAttribute('content', document.documentElement.getAttribute('data-theme') === 'night' ? '#060608' : '#F5F1E6');
    } catch (e) {}
  }
  function redSet(v) {
    v = !!v;
    try { localStorage.setItem(RED_KEY, v ? '1' : '0'); } catch (e) {}
    document.body.classList.toggle('sky-red', v);
    redThemeColor(v);
    redSyncUI(v);
    if (window.WuriSkyAR && WuriSkyAR.setRed) WuriSkyAR.setRed(v);
  }
  window.WuriRedlight = { on: redOn, set: redSet };
  (function redBoot() {
    var v = redOn();
    document.body.classList.toggle('sky-red', v);
    redThemeColor(v);
    redSyncUI(v);
    ['sky-red-toggle', 'sky-red-toggle-me'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', function () { redSet(el.checked); });
    });
  })();

  window.Stars = { openHome: openHome, activate: activate, openRegion: openRegion, openDetail: openDetail, openButiange: openButiange, renderTodaySky: renderTodaySky,
    openMansionAsterism: openMansionAsterism, openSunRegion: openSunRegion, sunMansion: sunMansion, openBeidouDetail: openBeidouDetail, loadFenye: loadFenye };
})();
