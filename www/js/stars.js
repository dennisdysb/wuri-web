/* 戊日不上香 · 中国星象模块（v2.0.0；v2.0.0 (1) 改底部「星象」标签页）
 * 星象标签页＝页首今日星象卡（s4，原首页卡整块搬入）＋星官图鉴（s1 首页 / s2 区页 / s3 星官详情）＋《步天歌》典籍页（s5）。
 * 数据懒加载：首次打开星官图鉴才 fetch data/xingguan.json＋data/butiange.json（Promise 缓存）。
 * 数据文本（官名/歌诀/星名）不走 i18n，显示一律过 tx() 简繁转换；固定文案走 sx_* 键。
 * 值日宿显示与首页 zhishen-line 同源：lunar.getXiu()＋XINGSU28 映射全称；
 * 斗柄 monthBranch 传 EightChar 精确月建支（与 getPrevJieQi 口径逐日对照零差，见引擎说明验证）。 */
(function () {
  'use strict';

  var XG = null, BT = null, LNX = null, LINES = null, loadPromise = null;
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
    fyPromise = fetch('data/fenye.json').then(function (r) { if (!r.ok) throw new Error('fy'); return r.json(); })
      .then(function (j) { FY = j; fyPromise = null; return j; })
      .catch(function (e) { fyPromise = null; throw e; });
    return fyPromise;
  }

  function loadData() {
    if (XG && BT) return Promise.resolve(true);
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      fetch('data/xingguan.json').then(function (r) { if (!r.ok) throw new Error('xg'); return r.json(); }),
      fetch('data/butiange.json').then(function (r) { if (!r.ok) throw new Error('bt'); return r.json(); }),
      fetch('data/xingguan-lines.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      loadFenye().catch(function () { return null; })
    ]).then(function (res) {
      XG = res[0]; BT = res[1]; LNX = res[2]; indexData(); indexLines(); loadPromise = null;
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
  function openDeity(id) {
    if (!window.__wuri_openDeity) return;
    /* 神祇详情 z-61 高于星象子视图原始层级，此处收起子视图是为来源返回语义
     * （详情关闭后来源视图要原样露出，不靠层级叠压）；把「当时开着的子视图栈＋各自滚动位置」作为来源
     * 递给图鉴（v2.0.0 (2)），详情返回即回来源（区页/星官详情/步天歌），
     * 不再写死落到神祇图鉴主页。星象标签页（tab-stars）是普通标签主区、不在此列。 */
    var stack = [], scroll = {};
    ['view-star-region', 'view-butiange', 'view-star-detail'].forEach(function (vid) {
      var v = $(vid);
      if (v && !v.hidden) { stack.push(vid); scroll[vid] = v.scrollTop; }
    });
    hide('view-star-region'); hide('view-star-detail'); hide('view-butiange');
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
    show('view-star-detail');
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
    var total = XG.asterisms.length;
    var det = 0, doubt = 0, dual = 0;
    XG.asterisms.forEach(function (a) {
      if (a.status === '确定') det++; if (a.status === '存疑') doubt++; if (a.qing_variant) dual++;
    });
    var h = '';
    h += '<div class="sx-kicker">' + esc(t('sx_kicker')) + '</div>';
    h += '<div class="sx-title">' + esc(t('sx_home_title')) + '</div>';
    h += '<div class="sx-sub">' + txEsc(tf(t('sx_data_line'), total, secOrder.length)) + '<br>' +
      txEsc(tf(t('sx_data_line2'), det, doubt, dual)) + '</div>';

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
    h += fenyeCardHTML(section, isYuan);
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
        else if (n.pts.length > 1) h += raPolyline(n.pts, 'sx-plot-line ctx');
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
      else if (main.length > 1) h += raPolyline(main, focalCls);
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
    if ((b = $('butiange-back'))) b.addEventListener('click', function () { hide('view-butiange'); });
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
    watchShelf();
    /* 语言切换时重绘动态面（app.js 的 __wuri_rerender 链式追加，不覆盖原回调） */
    var prev = window.__wuri_rerender;
    window.__wuri_rerender = function () {
      if (prev) prev();
      renderTodaySky();
      var sh = $('sx-jing-shelf'); if (sh) sh.remove();
      injectShelf();
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

  window.Stars = { openHome: openHome, activate: activate, openRegion: openRegion, openDetail: openDetail, openButiange: openButiange, renderTodaySky: renderTodaySky,
    openMansionAsterism: openMansionAsterism, openSunRegion: openSunRegion, sunMansion: sunMansion, openBeidouDetail: openBeidouDetail, loadFenye: loadFenye };
})();
