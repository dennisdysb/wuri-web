/* 戊日不上香 · 经文库阅读器（Pro）
 * 目录 / 全文检索 / 读诵（ruby 拼音注音，可开关）/ TTS 诵读 / 字号。
 * 经文数据 www/jing/sXX.js 按需懒加载（本地 <script> 注入）。
 */
var JingWen = (function () {
  'use strict';
  /* 三派排序（用户指定顺序） */
  var JING_ORDER = {
    all: ['s02','s01','s12','s13','s14','s10','s07','s11','s03','s04','s05','s09','s30','s31','s32','s15','s16','s17','s26','s27','s29','s28'],
    quanzhen: ['s02','s12','s13','s10','s07','s11','s03','s04'],
    zhengyi: ['s01','s14','s10','s07','s11','s03','s04','s05','s09','s15','s16','s17']
  };
  /* 内丹书籍（单独折叠分类，不用背诵模式） */
  var NEIDAN_IDS = ['s18','s19','s20','s21','s22','s23','s24','s25',
    's40','s41','s42','s43','s44','s45','s46','s47','s48',
    /* 书架扩容（2026-10-28 用户批准）：KR 指针挂架 16 部，正文/标点共用
       道藏全集 feed 分片（content/daozang/texts[-punct]/<KR>.json），零新增存储；
       开卷走 daozang.js openWork，门控/注音/背诵与既有内丹同口径 */
    'KR5a0250','KR5a0247','KR5d0113','KR5g0117','KR5e0055','KR5a0242',
    'KR5d0111','KR5a0014','KR5c0022','KR5d0097','KR5a0265','KR5g0067',
    'KR5d0080','KR5d0078','KR5i0064','KR5c0350'];
  var NEIDAN_TITLES = {
    s18: '黄庭内景经', s19: '周易参同契', s20: '太乙金华宗旨', s21: '太清元道真经',
    s22: '钟吕传道集', s23: '性命圭旨', s24: '伍柳仙宗', s25: '乐育堂语录',
    s40: '悟真篇', s41: '入药镜', s42: '金丹四百字', s43: '灵宝毕法',
    s44: '规中指南', s45: '金丹大要', s46: '还源篇', s47: '天仙正理', s48: '坐忘论',
    KR5a0250: '中和集', KR5a0247: '西山群仙会真记', KR5d0113: '翠虚篇',
    KR5g0117: '海琼问道集', KR5e0055: '重阳全真集', KR5a0242: '碧虚子亲传直指',
    KR5d0111: '还丹复命篇', KR5a0014: '高上玉皇胎息经', KR5c0022: '太上老君内观经',
    KR5d0097: '还真集', KR5a0265: '修真十书金丹大成集', KR5g0067: '诸真内丹集要',
    KR5d0080: '丹阳真人语录', KR5d0078: '纯阳真人浑成集',
    KR5i0064: '孙不二元君传述丹道秘书', KR5c0350: '上洞心丹经诀',
  };
  function isNeidan(id) { return NEIDAN_IDS.indexOf(id) >= 0; }
  /* 书架扩容·常见经文 KR 指针 10 部（2026-10-28 用户批准）：挂在常见经文架、
     按常见经文口径免费——是道藏全集 Pro 门控的例外名单，daozang.js 的
     dzGate 与本文件 openReader/openReaderAt 的 KR 门控共用此表 */
  var SHELF_FREE_KR = {
    KR5c0005: 1, KR5c0002: 1, KR5a0027: 1, KR5a0194: 1, KR5b0242: 1,
    KR5c0030: 1, KR5i0087: 1, KR5i0088: 1, KR5c0181: 1, KR5a0171: 1
  };
  window.__wuriShelfFreeKR = SHELF_FREE_KR;
  var jingFilter = 'all';
  /* 「常见经文」区收起状态：仅内存，不持久化——每次进经文页默认展开
     （resetToCatalog 复位 false；2026-10-27 用户定） */
  var commonCollapsed = false;
  /* 经文别名：搜简称也能命中 */
  var JING_ALIAS = {
    s01: ['正一功课经', '功课经', '正一早晚功课', '早晚功课经'],
    s02: ['全真功课经', '全真早晚功课'],
    s03: ['三官经', '三官', '三元经', '三元赐福经'],
    s04: ['北斗经', '北斗', '北斗本命经'],
    s05: ['真武经', '真武', '真武本传经'],
    s07: ['道德经', '老子', '道德真经'],
    s09: ['度人经', '度人', '灵宝度人经'],
    s10: ['感应篇', '感应', '太上感应'],
    s11: ['庄子', '南华真经', '南华'],
    s12: ['邱祖垂训', '垂训文'],
    s13: ['十五论', '立教'],
    s14: ['十规', '道门十规'],
    s15: ['五斗经', '受生经', '五斗金章经'],
    s16: ['禄库经', '禄库受生经'],
    s17: ['开库经', '钥匙经', '开库钥匙经'],
    s28: ['临水夫人', '顺天圣母', '陈靖姑', '陈仙姑', '临水宝诰'],
    s18: ['黄庭经', '黄庭', '内景经'],
    s19: ['参同契', '周易参同契'],
    s20: ['金华宗旨', '太乙金华'],
    s21: ['元道真经', '太清元道'],
    s23: ['性命圭旨', '圭旨'],
    s22: ['钟吕传道', '传道集', '鍾呂傳道集'],
    s40: ['悟真篇', '紫阳真人', '张伯端'],
    s41: ['入药镜', '崔公入药镜', '崔希范'],
    s42: ['金丹四百字', '四百字'],
    s43: ['灵宝毕法', '毕法'],
    s44: ['规中指南', '陈虚白'],
    s45: ['金丹大要', '上阳子', '陈致虚'],
    s46: ['还源篇', '石泰'],
    s47: ['天仙正理', '天仙正理直论', '伍守阳'],
    s48: ['坐忘论', '司马承祯'],
    s26: ['清静经', '清靜經', '常清静经'],
    s27: ['心印经', '心印妙经', '玉皇心印'],
    /* 书架扩容 KR 指针条目别名（2026-10-28） */
    KR5a0250: ['中和集', '李道纯'],
    KR5a0247: ['会真记', '西山会真记', '施肩吾'],
    KR5d0113: ['翠虚篇', '陈楠'],
    KR5g0117: ['海琼问道集', '白玉蟾', '海琼'],
    KR5e0055: ['重阳全真集', '王重阳', '重阳集'],
    KR5a0242: ['碧虚子', '亲传直指', '陈景元'],
    KR5d0111: ['还丹复命篇', '薛道光', '复命篇'],
    KR5a0014: ['胎息经', '玉皇胎息经'],
    KR5c0022: ['内观经', '老君内观经'],
    KR5d0097: ['还真集', '王吉昌'],
    KR5a0265: ['金丹大成集', '修真十书'],
    KR5g0067: ['内丹集要', '诸真内丹'],
    KR5d0080: ['丹阳真人语录', '马钰', '马丹阳'],
    KR5d0078: ['浑成集', '纯阳真人', '吕洞宾'],
    KR5i0064: ['孙不二', '丹道秘书', '清静派'],
    KR5c0350: ['心丹经诀', '上洞心丹'],
    KR5c0005: ['南斗经', '南斗', '南斗六司'],
    KR5c0002: ['斗姆心经', '斗姆', '斗姥心经'],
    KR5a0027: ['真武妙经', '北方真武'],
    KR5a0194: ['玉皇宝忏', '玉皇忏'],
    KR5b0242: ['救苦宝忏', '青玄宝忏'],
    KR5c0030: ['天妃经', '妈祖经', '天妃救苦'],
    KR5i0087: ['阴骘文', '文昌阴骘文'],
    KR5i0088: ['关帝真经', '觉世真经', '关圣帝君', '忠孝忠义真经'],
    KR5c0181: ['老君戒经', '戒经'],
    KR5a0171: ['文昌化书', '梓潼化书', '化书']
  };

  var loaded = {};
  var currentId = null;
  var pyOn = true;
  var fontPx = 17;
  var fontFam = 'song'; /* 字体（批一）：song 宋体（默认栈）｜kai 楷体｜hei 黑体 */
  var lhMode = 'mid'; /* 行距（批一）：tight 紧｜mid 中（默认 2.1）｜wide 宽 */
  var reciteMode = false; /* 背诵模式：只显示每句首字，点句显示全文 */
  var followMode = false; /* 跟读模式：点段落从该处开始播，播放时高亮跟随 */
  var followMap = null; /* tsIdx -> {el, start} */
  var followElToTs = null; /* element -> tsIdx */
  var _followTimer = null;
  var _followCurEl = null;

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function isPro() { return window.WuriPro && WuriPro.isPro(); }
  /* 经文简繁转换（显示层，底本数据一字不动；2026-10-29 定版「简繁跟随系统语言」）：
   * 简体模式一律繁→简（window.t2s）；繁体模式下按底本分流——底本繁体的书直出底本
   * 原字，底本简体的书走简→繁（window.s2t）。两向转换均等长（已全语料审计 0 违例），
   * 注音下标、划线/书签 char 锚点天然不移。底本判定按书扫描简/繁标志字计数
   * （bookSimpBase，KR 来源与道藏索引恒繁体底本）；无书上下文的短串（书名/例句）
   * 走串级判定 fragLooksSimp。 */
  var SCRIPT_TRAD_MARK = '靈麼爾眾廣國聖寶讓鑒範讚應門開關頭時說讀寫現長樂處觀來個們這為無師壇點聲氣萬與書經將實義禮體發陰陽龍鳳龜齊齋淨濟煉燈爐籙誦課講';
  var SCRIPT_SIMP_MARK = '灵么尔众广国圣宝让鉴范赞应门开关头时说读写现长乐处观来个们这为无师坛点声气万与书经将实义礼体发阴阳龙凤龟齐斋净济炼灯炉箓诵课讲';
  var _bookSimpCache = {};
  function bookSimpBase(id) {
    if (!id) return null;
    if (Object.prototype.hasOwnProperty.call(_bookSimpCache, id)) return _bookSimpCache[id];
    var r = null;
    if (id.indexOf('KR') === 0 || (typeof JING_PUNCT_SRC !== 'undefined' && JING_PUNCT_SRC[id])) r = false;
    else {
      var it = null, _idx = window.JINGWEN_INDEX || [];
      for (var _i = 0; _i < _idx.length; _i++) if (_idx[_i].id === id) { it = _idx[_i]; break; }
      if (it && it.daozang) r = false;
      else {
        var d = window.JINGWEN && window.JINGWEN[id];
        if (d && d.sections) {
          var tc = 0, sc = 0;
          for (var i = 0; i < d.sections.length; i++) {
            var ps = d.sections[i].paras || [];
            for (var j = 0; j < ps.length; j++) {
              var t = typeof ps[j] === 'string' ? ps[j] : (ps[j].t || '');
              for (var k = 0; k < t.length; k++) {
                var ch = t.charAt(k);
                if (SCRIPT_TRAD_MARK.indexOf(ch) >= 0) tc++;
                else if (SCRIPT_SIMP_MARK.indexOf(ch) >= 0) sc++;
              }
            }
            if (tc + sc >= 60) break;
          }
          r = (sc >= 3 && sc > tc);
        }
      }
    }
    if (r !== null) _bookSimpCache[id] = r;
    return r;
  }
  /* 串级判定：含简体标志字且不含繁体标志字才判底本为简体 */
  function fragLooksSimp(s) {
    var hasS = false;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (SCRIPT_TRAD_MARK.indexOf(ch) >= 0) return false;
      if (SCRIPT_SIMP_MARK.indexOf(ch) >= 0) hasS = true;
    }
    return hasS;
  }
  function txFor(s, id) {
    if (!s) return s;
    var lang = 'zh-CN';
    try {
      if (window.I18N && typeof window.curLang === 'function') lang = window.curLang();
      else if (document.documentElement.getAttribute('lang') === 'zh-TW') lang = 'zh-TW';
    } catch (e) {}
    if (lang !== 'zh-TW') {
      if (window.t2s && typeof window.t2s === 'function') return window.t2s(s);
      return s;
    }
    var b = bookSimpBase(id || currentId || null);
    if (b === false) return s;
    if (b === null && !fragLooksSimp(s)) return s;
    if (window.s2t && typeof window.s2t === 'function') return window.s2t(s);
    return s;
  }
  function txScript(s) { return txFor(s, null); }
  /* 无当前书上下文的片段（列表书名、跨书条目）专用 */
  function txFrag(s) { return txFor(s, '__frag__'); }
  window.wuriTxFrag = txFrag;
  window.wuriTxFor = txFor;
  window.wuriBookSimpBase = bookSimpBase;
  /* 当前是否为简体显示模式（与 txScript 同口径） */
  function isSimpMode() {
    try {
      if (window.I18N && typeof window.curLang === 'function') return window.curLang() !== 'zh-TW';
      return document.documentElement.getAttribute('lang') !== 'zh-TW';
    } catch (e) { return true; }
  }
  /* UI 文案简繁（i18n 的 tx 仅繁体模式动手，简体原样） */
  function txUi(s) { try { return window.tx ? window.tx(s) : s; } catch (e) { return s; } }

  function ensureLoaded(id, cb) {
    if (window.JINGWEN && JINGWEN[id]) { cb && cb(); return; }
    /* KR 条目正文不走 jing/<id>.js 脚本通道（由 daozang.js openWork 取文建 entry）：
       全文检索的 ensureAll 扫到时直接跳过，避免无谓 404 */
    if (/^KR5/.test(id || '')) { cb && cb(); return; }
    if (loaded[id] === 'loading') {
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (window.JINGWEN && JINGWEN[id]) { clearInterval(iv); cb && cb(); return; }
        // 6秒还没加载出来：放弃等待，重置状态让下次点击重新加载
        if (tries > 30 || loaded[id] === 'error') {
          clearInterval(iv);
          if (loaded[id] !== 'done') loaded[id] = null;
          cb && cb();
        }
      }, 200);
      return;
    }
    loaded[id] = 'loading';
    var feedBase = window.WURI_JING_BASE || null;
    var sc = document.createElement('script');
    sc.src = (feedBase || 'jing/') + id + '.js';
    sc.onload = function () { loaded[id] = 'done'; cb && cb(); };
    sc.onerror = function () {
      /* 远程数据源的经文文件拉不到：回落包内 jing/ 再试一次，仍失败才报错 */
      if (feedBase && feedBase !== 'jing/') {
        var sc2 = document.createElement('script');
        sc2.src = 'jing/' + id + '.js';
        sc2.onload = function () { loaded[id] = 'done'; cb && cb(); };
        sc2.onerror = function () { loaded[id] = 'error'; cb && cb(); };
        document.head.appendChild(sc2);
        return;
      }
      loaded[id] = 'error'; cb && cb();
    };
    // 保险：10秒还没 onload/onerror，强制重置
    setTimeout(function () {
      if (loaded[id] === 'loading') loaded[id] = null;
    }, 10000);
    document.head.appendChild(sc);
  }

  function ensureAll(cb) {
    var ids = (window.JINGWEN_INDEX || []).map(function (x) { return x.id; });
    var i = 0;
    (function next() {
      if (i >= ids.length) { cb && cb(); return; }
      ensureLoaded(ids[i++], next);
    })();
  }

  /* ---------- 目录 ---------- */
  function renderCatalog() {
    var host = $('#jing-list');
    var idx = window.JINGWEN_INDEX || [];
    var order = JING_ORDER[jingFilter] || JING_ORDER.all;
    // 按指定顺序排列，已收录的才显示
    var sorted = [];
    order.forEach(function (id) {
      var f = idx.filter(function (x) { return x.id === id; })[0];
      if (f) sorted.push(f);
    });
    // 未在排序表中的追加在末尾（排除内丹书，内丹单独折叠区）
    idx.forEach(function (it) {
      if (order.indexOf(it.id) < 0 && !isNeidan(it.id)) sorted.push(it);
    });
    /* 第一层「常见经文」：置顶、默认展开，可整区收起（不持久化，进页复位展开）；
       全部/全真/正一筛选自页面顶部移入本区标题下方，随区一同收起（2026-10-27 用户定） */
    function filterBtn(k, label) {
      return '<button class="btn small' + (jingFilter === k ? ' active' : '') + '" data-jing-filter="' + k + '">' + label + '</button>';
    }
    var html = '<div class="jing-sec' + (commonCollapsed ? ' collapsed' : '') + '" data-common-sec>'
      + '<h3 class="jing-sec-h" data-common-toggle>' + esc(t('jing_sec_common')) + '<span class="dz-count">（' + sorted.length + '）</span><span class="jing-go jing-sec-arrow">›</span></h3>'
      + '<div class="jing-common-body"' + (commonCollapsed ? ' hidden' : '') + '>'
      + '<div class="jing-filter jing-filter-insec">'
      + filterBtn('all', '全部') + filterBtn('quanzhen', '全真') + filterBtn('zhengyi', '正一')
      + '</div>'
      + sorted.map(function (it) {
        return '<div class="jing-item" data-jing="' + it.id + '">'
          + '<span class="jing-book">' + esc(it.cat || '經') + '</span>'
          + '<span class="jing-twrap"><span class="jing-title">' + esc(txFrag(it.title)) + '</span><span class="jing-sub"></span></span>'
          + '<span class="jing-go">›</span></div>';
      }).join('')
      + '</div></div>';
    // 内丹书籍折叠区
    var neidanItems = [];
    NEIDAN_IDS.forEach(function (id) {
      var f = idx.filter(function (x) { return x.id === id; })[0];
      if (f) neidanItems.push(f);
    });
    if (neidanItems.length && !window.IS_FREE_BUILD) {
      var ndPro = isPro();
      html += '<div class="jing-sec" data-neidan-fold>'
        + '<h3 class="jing-sec-h" data-neidan-toggle>' + esc(t('jing_sec_neidan')) + '<span class="dz-count">（' + neidanItems.length + '）</span><span class="jing-go">›</span></h3>'
        + '<div class="jing-neidan-body"' + (libViewLoad().nd ? '' : ' hidden') + '>'
        + neidanItems.map(function (it) {
          return '<div class="jing-item" data-jing="' + it.id + '">'
            + '<span class="jing-book">丹</span>'
            + '<span class="jing-twrap"><span class="jing-title">' + esc(txFrag(it.title)) + '</span><span class="jing-sub"></span></span>'
            + (ndPro ? '' : '<span class="jing-locktag">高级版</span>')
            + '<span class="jing-go">›</span></div>';
        }).join('')
        + '</div></div>';
    }
    host.innerHTML = html;
    /* 道藏全藏入口（daozang.js 挂钩，纯增量；无该脚本时目录不变） */
    if (window.__wuri_dzCatalog) { try { window.__wuri_dzCatalog(host); } catch (e) {} }
    decorateReadProgress();
  }

  /* ---------- 阅读器 ---------- */
  /* 道藏图版段（daozang.js 预切分出的 {img} 段）：渲染为图片块而非文字段。
     src 在清单里相对 content/daozang/（FEED_DIR），此处拼全；
     不带 data-sec/data-para、不进 .jing-para 集合——注音/高亮选区/
     内容字偏移（paraAtContentOff 按 p.jing-para 计）天然跳过图段。 */
  function dzFigHtml(p) {
    var im = p.img || {};
    var cap = im.caption || '原書圖版';
    return '<figure class="dz-fig"><img src="' + esc('content/daozang/' + (im.src || ''))
      + '" alt="' + esc(txScript(cap)) + '" loading="lazy" data-dz-fig'
      + (im.w && im.h ? ' width="' + (+im.w) + '" height="' + (+im.h) + '"' : '')
      + '><figcaption>' + esc(txScript(cap)) + '</figcaption></figure>';
  }
  /* 图版点击放大：App 内无通用灯箱（#hd-viewer 是勘宅照片专用、带删除钮），
     故自带最简全屏 overlay——点图打开、点任意处关闭、深色底；
     overlay 内 img 同受 body.sky-red 全局图片滤镜链接管（见 style.css）。 */
  function dzFigZoom(src, cap) {
    var ov = document.getElementById('dz-lightbox');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'dz-lightbox';
      ov.innerHTML = '<img alt=""><div class="dz-lightbox-cap"></div>';
      ov.addEventListener('click', function () { ov.hidden = true; });
      document.body.appendChild(ov);
    }
    var img = ov.querySelector('img');
    img.src = src; img.alt = cap || '';
    ov.querySelector('.dz-lightbox-cap').textContent = cap || '';
    ov.hidden = false;
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-dz-fig]') : null;
    if (t) dzFigZoom(t.getAttribute('src'), t.getAttribute('alt'));
  });

  function rubyPara(p, secIdx, paraIdx) {
    if (!p || p.img || p.t == null) return '';
    var t = p.t, py = p.py || [], out = '';
    /* 整段一次转换（短语保护/短语表需上下文）：转换器等长替换，等长才采信，
       保证下标与拼音 py[]、高亮偏移严格对齐；不等长回落逐字转换（旧行为） */
    var dt = txScript(t);
    if (!dt || dt.length !== t.length) dt = null;
    
    // 高亮范围
    var hlKey = (secIdx != null ? secIdx : '_') + '_' + (paraIdx != null ? paraIdx : '_');
    var ranges = (window._jingHlRanges && window._jingHlRanges[hlKey]) || [];
    function hlAt(i) {
      for (var k = 0; k < ranges.length; k++) {
        var r = ranges[k];
        var s = (r.start != null ? r.start : r[0]);
        var e = (r.end != null ? r.end : r[1]);
        if (i >= s && i < e) return r;
      }
      return null;
    }
    for (var i = 0; i < t.length; i++) {
      var ch = t[i], r = py[i] || '';
      ch = dt ? dt[i] : txScript(ch);
      var cell = r ? '<ruby>' + esc(ch) + '<rt>' + esc(r) + '</rt></ruby>' : esc(ch);
      var hr = hlAt(i);
      if (hr) {
        var hcolor = hr.color || 'yellow';
        var hid = hr.id || '';
        cell = '<span class="hl hl-' + hcolor + '" data-hl-id="' + hid + '">' + cell + '</span>';
      }
      out += cell;
    }
    return out;
  }
  /* 背诵模式：按句切分，每句只显示首字，点击展开全文 */
  function recitePara(p) {
    if (!p || p.img || p.t == null) return '';
    var t = p.t, py = p.py || []; /* 未注音段 py 缺席时防抛错（统一底栏后全藏亦可背诵） */
    
    // 按 。！？；切句，保留标点
    var sens = t.match(/[^。！？；]+[。！？；]?/g) || [t];
    var out = '', pos = 0;
    sens.forEach(function (sen) {
      if (!sen) return;
      /* 整句一次转换：词组级转换须整段命中（如 干支/斗姥 的保护形），逐字转会
       * 只剩字表默认而误形；等长不变式下转换后下标与原文/py 仍逐字对齐，
       * 万一不等长回落整句原字——宁可不转、不可错位 */
      var senD = txScript(sen);
      if (!senD || senD.length !== sen.length) senD = sen;
      var dispCh = senD.charAt(0);
      // 找首字拼音
      var pyIdx = t.indexOf(sen, pos);
      var r = (pyIdx >= 0 && py[pyIdx]) ? py[pyIdx] : '';
      var firstHtml = r ? '<ruby>' + esc(dispCh) + '<rt>' + esc(r) + '</rt></ruby>' : esc(dispCh);
      // 全文其余部分（隐藏，点击显示）
      // rest：去掉首字后的剩余部分
      var restHtml = '';
      for (var j = 1; j < sen.length; j++) {
        var ch2 = senD[j], rr2 = (pyIdx >= 0) ? (py[pyIdx + j] || '') : '';
        restHtml += rr2 ? '<ruby>' + esc(ch2) + '<rt>' + esc(rr2) + '</rt></ruby>' : esc(ch2);
      }
      out += '<span class="recite-sen">'
        + '<span class="recite-first">' + firstHtml + '</span>'
        + '<span class="recite-rest" hidden>' + restHtml + '</span>'
        + '</span>';
      pos = pyIdx + sen.length;
    });
    return out;
  }

  /* ---------- 内丹标点版（2026-10-26 内丹优先批） ----------
   * 精选内丹新 10 部正文与 KR 底本逐字全等（离线核对：字流＋段界全同），
   * 标点分片与道藏全集共用 content/daozang/texts-punct/<KR 编号>.json。
   * 接入口径同全藏：有标点版一律标点版呈现（2026-10-26 用户定，不设切换钮、
   * 旧偏好键 wuri_dz_punct 留尸不读）、标点版标「机器标点 · 未经校订」、
   * 排版走 .dz-punct。高亮字序投影复用 daozang.js（其入口查找已按 JINGWEN 兜底）。 */
  var JING_PUNCT_SRC = {
    s22: 'KR5a0266', s40: 'KR5a0268', s41: 'KR5i0039', s42: 'KR5d0104',
    s43: 'KR5f0025', s44: 'KR5a0244', s45: 'KR5d0090', s46: 'KR5d0114',
    s47: 'KR5i0067', s48: 'KR5d0059'
  };
  /* 道藏来源判定（2026-10-29 用户定：凡底本出自道藏的书，阅读页书头不显示
     底本/note 整框；feed 数据与关于页 Kanripo 署名不动，仅撤展示）：
     全藏条目带 daozang 标记；精选 KR 转录书以 JING_PUNCT_SRC 映射或其自带
     note 内的 KR 编号为据——数据判定，不按书名硬编码清单。 */
  function isKrSourced(d) {
    if (!d) return false;
    if (d.daozang) return true;
    if (d.id && JING_PUNCT_SRC[d.id]) return true;
    if (d.note && /KR5[a-z]\d{4}/.test(d.note)) return true;
    return false;
  }
  /* 常见经文区判定（2026-10-29 用户定扩围，承 v352）：精选架非内丹、
     非全藏条目即常见经文区；该区书头/页首一律不显示来源·底本标注
     （#jing-srcnote 整框含其后缀），与道藏来源书口径一致。仅撤阅读页
     显示层：feed 数据 note、关于页署名、列表页归属标注一律不动；
     判定走数据（daozang 标记＋内丹名单），不按书名硬编码。 */
  function isCommonShelf(d) {
    return !!d && !d.daozang && !isNeidan(d.id);
  }
  var JP_PUNCT_CHARS = '。，、；：？！·…—「」『』﹝﹞（）《》〈〉“”‘’％';
  function jpIsPunct(ch) { return JP_PUNCT_CHARS.indexOf(ch) >= 0 || /\s/.test(ch); }
  function jpStrip(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) if (!jpIsPunct(s[i])) o += s[i];
    return o;
  }
  /* 标点版段落排版分类：与 daozang.js punctParaCls 同口径（spec v1.1 §9–12） */
  function jpParaCls(t, isFirst) {
    var s = jpStrip(t), L = s.length;
    if (!L) return '';
    if (L <= 18 && /第[一二三四五六七八九十百廿卅\d]+$/.test(s) && !/[，。；：？]/.test(t)) return 'dz-cht';
    if (/^[^，。；？！]{1,14}曰：/.test(t)) return 'dz-dlg';
    if (isFirst && L <= 20) return 'dz-verse';
    var nEnd = (t.match(/[，。；]/g) || []).length;
    if (L <= 17 && /[，。]$/.test(t) && nEnd <= 2) return 'dz-verse';
    return '';
  }
  /* 标点版 sections：逐节对位——标点段流去标点后必须与精选正文逐字相等，
     任一节不符整部回落原文（保真铁律，运行时自检，与离线校验双保险） */
  function buildJingPunctSections(d, pw) {
    if (!pw || !pw.volumes || pw.volumes.length !== d.sections.length) return null;
    var out = [];
    for (var si = 0; si < d.sections.length; si++) {
      var sec = d.sections[si], pv = pw.volumes[si];
      if (!pv || !pv.paras) return null;
      var oJoin = sec.paras.map(function (p) { return p.t; }).join('');
      var pJoin = pv.paras.join('');
      /* 两侧同口径剥除后比对：精选原文底本含清洗残留制表符（入药镜 2、天仙正理 22，
         标点分片未保留），单侧剥除会误判不对位整部回落（2026-10-26 冒烟实证） */
      if (jpStrip(pJoin) !== jpStrip(oJoin)) return null;
      out.push({
        h: sec.h, _punct: true,
        paras: pv.paras.map(function (t, pi) {
          var o = { t: t };
          var cls = jpParaCls(t, pi === 0);
          if (cls) o.cls = cls;
          return o;
        })
      });
    }
    return out;
  }
  function applyJingPunctMode(d) {
    d.punctMode = !!d.hasPunct;
    d.sections = d.punctMode ? d.sectionsPunct : d.sectionsOrig;
  }
  /* 开卷渲染前备好标点版：仅映射内经文触发；拉取/对位失败静默回落原文。
     只建一次（_punctInit） */
  function prepJingPunct(d, done) {
    var kr = JING_PUNCT_SRC[d.id];
    if (!kr || d._punctInit) { done(); return; }
    d._punctInit = true;
    d.sectionsOrig = d.sections;
    fetch('content/daozang/texts-punct/' + kr + '.json')
      .then(function (r) { return r.json(); })
      .then(function (pw) {
        var sp = buildJingPunctSections(d, pw);
        if (sp) { d.hasPunct = true; d.sectionsPunct = sp; applyJingPunctMode(d); }
        done();
      })
      .catch(function () { done(); });
  }

  function openReader(id, _retry) {
    /* 内丹书籍为高级版（2026-10-14 用户定）：目录、搜索、每日推荐所有入口都经此函数，未解锁弹付费墙 */
    if (isNeidan(id) && !isPro()) { if (window.WuriPro) WuriPro.requirePro('jingwen'); return; }
    /* 道藏全集为高级版（2026-10-26 用户定）：正文开卷在 daozang.js openWork 已拦，
       此处兜底书签/高亮/心得列表跳转等直达路径（KR5* 条目），与内丹同口径；
       书架扩容挂入常见经文架的 10 部 KR 指针（SHELF_FREE_KR）按常见经文口径免费，为例外 */
    if (/^KR5/.test(id || '')) {
      if (!isPro() && !SHELF_FREE_KR[id]) { if (window.WuriPro) WuriPro.requirePro('jingwen'); return; }
      /* entry 未建时走 daozang.js 取文开卷（建好后其回调本函数渲染）；
         entry 已建（openWork 回调/缓存命中）则落到下面正常渲染 */
      if (!(window.JINGWEN && JINGWEN[id]) && typeof window.__wuri_dzOpenWork === 'function') {
        window.__wuri_dzOpenWork(id);
        return;
      }
    }
    ensureLoaded(id, function () {
      var d = window.JINGWEN && JINGWEN[id];
      if (!d) {
        // 数据没加载出来：重置后重试一次，避免点击无反应
        if (!_retry) {
          loaded[id] = null;
          setTimeout(function () { openReader(id, true); }, 300);
        }
        return;
      }
      prepJingPunct(d, function () { renderReaderBody(id, d); });
    });
  }

  /* 打开阅读器并定位到指定节（每日一经直达卷/章锚点）：门控与 openReader 同口径，
   * 渲染后展开目标节并滚到节首。secIdx 为底本节序（与池内 n、书签 data-sec 同一坐标）。 */
  /* 内容字计数（与 daozang.js 高亮投影同口径：剥标点与空白后的字数）。
   * 标点版/原文版内容字逐字同序，故段锚偏移跨模式恒定。 */
  var DZ_STRIP_RE = /[\s。，、；：？！·…—「」『』﹝﹞（）《》〈〉“”‘’％\/().,;:?!%]/g;
  function dzContentLen(el) {
    var c = el.cloneNode(true);
    var kill = c.querySelectorAll('rt, rp');
    for (var i = 0; i < kill.length; i++) kill[i].remove();
    return c.textContent.replace(DZ_STRIP_RE, '').length;
  }
  /* 在某节正文内按内容字偏移找目标段（卷内分段单位的段锚） */
  function paraAtContentOff(body, off) {
    var ps = body.querySelectorAll('p.jing-para');
    var acc = 0, target = null;
    for (var i = 0; i < ps.length; i++) {
      target = ps[i];
      acc += dzContentLen(ps[i]);
      if (acc > off) break;
    }
    return target;
  }
  /* 跳转坚持（F，2026-10-28）：书已打开时直达别卷，旧实现只跳一次——随后
     的异步重渲（jing-rerender→openReader）与懒填充改高会把落点冲掉、落回
     原卷。现行口径：每次 jumpToSec 武装一个 6 秒意图，轮询核对落点是否
     仍在目标卷，不在就重跳；用户手动滚动/触摸视为改意、立即作废 */
  function armJumpInsist(secIdx, charOff) {
    var gen = ++_jumpGen;
    _jumpInsist = { id: currentId, sec: secIdx, off: charOff || 0, ts: Date.now(), until: Date.now() + 12000, gen: gen };
    setTimeout(function () { jumpInsistTick(gen); }, 700);
  }
  function jumpInsistTick(gen) {
    var J = _jumpInsist;
    if (!J || J.gen !== gen || J.id !== currentId) return;
    if (Date.now() > J.until) { _jumpInsist = null; return; }
    var landed = false;
    var sec = document.querySelector('#jing-content .jing-sec[data-sec="' + J.sec + '"]');
    if (sec) {
      var r = sec.getBoundingClientRect();
      landed = (r.top <= 140 && r.bottom > 0) ||
        (r.bottom > 0 && r.top < window.innerHeight &&
         window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4);
    }
    if (landed) { _jumpInsist = null; return; }
    var keep = J; _jumpInsist = null; /* 防重入：doJump 内不再武装 */
    doJumpToSec(keep.sec, keep.off);
    _jumpInsist = keep;
    setTimeout(function () { jumpInsistTick(gen); }, 700);
  }
  function doJumpToSec(secIdx, charOff) {
    var sec = document.querySelector('#jing-content .jing-sec[data-sec="' + secIdx + '"]');
    if (!sec) return;
    var body = sec.querySelector('.jing-sec-body');
    if (body) {
      if (body.hasAttribute('data-lazy') && window.__wuri_dzFill) { try { window.__wuri_dzFill(secIdx); } catch (e) {} }
      if (body.hidden) toggleSection(secIdx);
    }
    setTimeout(function () {
      var target = sec;
      if (charOff > 0 && body) target = paraAtContentOff(body, charOff) || sec;
      target.scrollIntoView({ block: 'start' });
    }, 120);
  }
  /* 跳到第 secIdx 节并展开（懒填充卷先填后展）；charOff>0 时再定位到节内对应段 */
  function jumpToSec(secIdx, charOff) {
    if (secIdx == null) return;
    doJumpToSec(secIdx, charOff);
    if (currentId) armJumpInsist(secIdx, charOff);
  }
  /* 全藏开卷是异步取文：轮询等阅读器就绪后跳锚 */
  function dzPollJump(id, secIdx, charOff, tries) {
    if (window._jingCurrentId === id &&
        document.querySelector('#jing-content .jing-sec[data-sec="' + secIdx + '"]')) {
      jumpToSec(secIdx, charOff);
      return;
    }
    if (tries > 0) setTimeout(function () { dzPollJump(id, secIdx, charOff, tries - 1); }, 200);
  }
  /* ---------- 阅读落点：自动位置记忆＋落点轮询（2026-10-27 跳顶修复） ----------
   * 旧实现两处坏死：renderReaderBody 尾部把并不滚动的 #jing-reader 当容器赋
   * scrollTop（页面实为 window 滚动、赋值无效），且尾随无条件 scrollTo(0,0)，
   * 每次重渲必跳顶；落色后的回位又只靠 400ms 一次性定时器，与异步渲染/展开/
   * 注音赛跑、页高未稳时被钳制，真机必败（实测目标 25678 落成 18451）。
   * 现行口径：落点优先级＝重渲锚点（落色/改色/删高亮前的位置）＞书签＞自动
   * 位置记忆（closeReader 退出时存，独立键不污染用户书签）；openReaderAt
   * 直达锚点在时限内压制后两级。落位一律走 insistReaderPos 轮询坚持到稳定。 */
  var _posSuppressUntil = 0;
  var AUTOPOS_KEY = 'wuri_jing_autopos';
  function loadAutoPos(id) {
    try { var m = JSON.parse(localStorage.getItem(AUTOPOS_KEY) || '{}'); return m[id] || null; }
    catch (e) { return null; }
  }
  function saveAutoPos(id, y, expanded) {
    if (!id) return;
    try {
      var m = JSON.parse(localStorage.getItem(AUTOPOS_KEY) || '{}');
      var prev = m[id] || {};
      m[id] = { y: Math.round(y || 0), expanded: expanded || [], ts: Date.now() };
      if (prev.frac != null) m[id].frac = prev.frac;
      if (prev.done) { m[id].done = true; if (prev.doneTs) m[id].doneTs = prev.doneTs; }
      if (prev.cov) m[id].cov = prev.cov;
      if (prev.covFrac != null) m[id].covFrac = prev.covFrac;
      if (prev.covSec) m[id].covSec = prev.covSec;
      if (prev.legacyFrac !== undefined) m[id].legacyFrac = prev.legacyFrac;
      if (prev.legacyDone) { m[id].legacyDone = true; if (prev.legacyDoneTs) m[id].legacyDoneTs = prev.legacyDoneTs; }
      try { m[id].off = currentContentOffset(); } catch (e) {}
      var keys = Object.keys(m);
      if (keys.length > 40) {
        keys.sort(function (a, b) { return (m[a].ts || 0) - (m[b].ts || 0); });
        keys.slice(0, keys.length - 40).forEach(function (k) { delete m[k]; });
      }
      localStorage.setItem(AUTOPOS_KEY, JSON.stringify(m));
    } catch (e) {}
  }
  function collectExpandedSecs() {
    var out = [];
    document.querySelectorAll('#jing-content .jing-sec-body').forEach(function (b) {
      if (!b.hidden) {
        var sec = b.closest('.jing-sec');
        if (sec) out.push(+sec.getAttribute('data-sec'));
      }
    });
    return out;
  }
  /* 落点轮询：每拍先补展开（懒填充卷先填后展），再 scrollTo 目标；连续两拍
     命中（±2px）才收工，最多 25 拍（约 3 秒）。已命中后视图被外部稳定拖离
     >48px（用户接管/直达跳转）即停手不抢；命中前若已有稳定的外来落点
     （>200 且偏离 >48px）同样停手。当前书已切换则立即作废。 */
  var _insistGen = 0;
  function insistReaderPos(sid, y, expanded) {
    var gen = ++_insistGen; /* 代际：新落位一起，旧轮询立即作废，杜绝两套轮询交替落位 */
    var tries = 0, hits = 0, lastCur = -1, stableTicks = 0, t0 = Date.now();
    var iv = setInterval(function () {
      tries++;
      if (gen !== _insistGen) { clearInterval(iv); return; }
      if (window._jingCurrentId !== sid) { clearInterval(iv); return; }
      var reader = $('#jing-reader');
      if (!reader || reader.hidden) { if (tries >= 30) clearInterval(iv); return; }
      if (expanded && expanded.length) {
        expanded.forEach(function (secIdx) {
          if (window.__wuri_dzFill) { try { window.__wuri_dzFill(+secIdx); } catch (e) {} }
          var body = document.querySelector('#jing-content .jing-sec[data-sec="' + secIdx + '"] .jing-sec-body');
          if (body && body.hidden) body.hidden = false;
        });
      }
      var cur = window.scrollY || window.pageYOffset || 0;
      if (Math.abs(cur - lastCur) <= 2) stableTicks++; else stableTicks = 0;
      /* 放弃条件：重渲后浏览器滚动锚定会把视图短暂泊在错误偏移且看似稳定，
       * 2.8s 内不因「稳定外来落点」收手（多半是锚定风暴，不是用户接管）；
       * 已命中后被稳定拖离 >48px 则立即放手给用户。 */
      if (Math.abs(cur - y) > 48 && stableTicks >= 3 && hits > 0) { clearInterval(iv); return; }
      if (Math.abs(cur - y) > 48 && stableTicks >= 10 && cur > 200 && (Date.now() - t0) > 2800) { clearInterval(iv); return; }
      window.scrollTo(0, y);
      cur = window.scrollY || window.pageYOffset || 0;
      if (Math.abs(cur - y) <= 2) { hits++; if (hits >= 2) { clearInterval(iv); return; } }
      lastCur = cur;
      if (tries >= 30) clearInterval(iv);
    }, 120);
  }
  window.__wuriInsistPos = insistReaderPos;

  /* ---------- 阅读进度/目录抽屉/查字（稳态第一批，2026-10-28） ----------
   * 进度口径：内容字坐标（DZ_STRIP_RE 剥标点空白，与高亮投影/段锚同口径），
   * 按「视口顶线以上已读内容字数 ÷ 全书内容字数」计，与展开/折叠状态无关、
   * 跨设备一致；存入既有 autopos 条目（frac/done 字段），不另建存储。
   * 剩余分钟：按本人实测速度（会话内采样 EMA，存 wuri_jing_speed）估算，
   * 无样本回落 300 字/分钟。 */
  var _metrics = null; /* {secLens:[], paraLens:[[]], cum:[], total} */
  var _lastOff = -1, _lastOffT = 0, _lastProgSave = 0, _readUiT = null, _doneSavedFor = null;
  var SPEED_KEY = 'wuri_jing_speed';
  function readSpeed() {
    try { var v = +localStorage.getItem(SPEED_KEY); if (v >= 60 && v <= 1500) return v; } catch (e) {}
    return 300;
  }
  function stripContent(s) { return String(s || '').replace(DZ_STRIP_RE, ''); }
  function buildReaderMetrics(d) {
    _metrics = null; _lastOff = -1; _lastOffT = 0;
    if (!d || !d.sections) return;
    var secLens = [], paraLens = [], paraCum = [], cum = [], total = 0;
    d.sections.forEach(function (sec) {
      cum.push(total);
      var pl = [], pc = [], sl = 0;
      (sec.paras || []).forEach(function (p) {
        var L = p.img ? 0 : stripContent(p.t).length;
        pc.push(sl); pl.push(L); sl += L;
      });
      paraLens.push(pl); paraCum.push(pc); secLens.push(sl); total += sl;
    });
    _metrics = { secLens: secLens, paraLens: paraLens, paraCum: paraCum, cum: cum, total: total };
  }
  function contentOffsetNow() {
    if (!_metrics || !_metrics.total) return 0;
    var LINE = 120, passed = 0;
    var secs = document.querySelectorAll('#jing-content .jing-sec');
    for (var k = 0; k < secs.length; k++) {
      var secEl = secs[k], si = +secEl.getAttribute('data-sec');
      var secRect = secEl.getBoundingClientRect();
      if (secRect.bottom <= LINE) { passed += _metrics.secLens[si] || 0; continue; }
      if (secRect.top > LINE) break;
      var body = secEl.querySelector('.jing-sec-body');
      if (!body || body.hidden) break;
      var ps = body.querySelectorAll('p.jing-para');
      for (var i = 0; i < ps.length; i++) {
        var pi = +ps[i].getAttribute('data-para');
        var len = (_metrics.paraLens[si] || [])[pi] || 0;
        var r = ps[i].getBoundingClientRect();
        if (r.bottom <= LINE) { passed += len; continue; }
        if (r.top < LINE) {
          var ratio = (LINE - r.top) / Math.max(1, r.height);
          passed += len * Math.min(1, Math.max(0, ratio));
        }
        break;
      }
      break;
    }
    return Math.min(Math.round(passed), _metrics.total);
  }
  /* 有效已读偏移：已滚到文档底部时，最后一屏（顶线以下）必然已在目——计全书读完。
     否则末卷较长的书会卡在 98–99%（实测 KR5g0030 末屏约占全书 1.5%），「已读完」永不可达。
     守卫 scrollY>0：整屏装得下的短经打开瞬间不自动判完。 */
  function effContentOffset() {
    if (!_metrics || !_metrics.total) return 0;
    if (window.scrollY > 0 && (window.scrollY + window.innerHeight) >= (document.documentElement.scrollHeight - 2)) return _metrics.total;
    return contentOffsetNow();
  }
  /* 跳转坚持状态（armJumpInsist/jumpInsistTick 用） */
  var _jumpInsist = null, _jumpGen = 0;
  /* 左右翻页已于 2026-10-29 整体下线（用户拍板只留滚动）：切片引擎、
     页表、翻页手势、保险丝、页码冻结门全部删除；存量偏好
     wuri_jing_turn='page' 不再读取，开书一律滚动。 */

  /* 当前阅读位置的内容字偏移（供进度/autopos/书签共用，滚动口径） */
  function currentContentOffset() {
    if (!_metrics || !_metrics.total) return 0;
    return effContentOffset();
  }

  /* 跨闭包钩子：JingMark 书签存档借用同一字偏移口径 */
  window.__wuriReaderOffset = function () { try { return currentContentOffset(); } catch (e) { return 0; } };

  /* ---------- 阅读覆盖账本（2026-10-29 进度误标修复） ----------
   * 旧口径之病：frac＝当前位置偏移÷全书字数（contentOffsetNow 把视口
   * 顶线以上的整节字数全计「已过」）——深链/位置恢复落到哪，前面的卷
   * 就整卷算读完（用户实证：每日一经推《虚靖语录》卷五，前四卷全标
   * 已读完、本书 63%，本人从未读过）。现行口径：只有真正进过视口带
   * 的字才记账。_cov＝已读字区间并集（全书字坐标、升序合并）；节百
   * 分比＝该节被覆盖字数÷节字数；本书 frac＝覆盖总字数÷全书字数。
   * 节「已读完」阈值＝覆盖率≥0.90：记账以段为粒度做 rect 分数插值，
   * 节首尾段只部分入带、图版段 0 字，真读完一节实测覆盖≥95%，0.90
   * 留采样损耗余量、又明显高于「读了大半」；书「已读完」（读完信号，
   * 阅读统计 rpStatsFinish 的唯一定义）＝覆盖率≥0.995。
   * 记账节拍与 updateReadUI 同拍（滚动 300ms 节流＋开卷定时拍）：相
   * 邻拍位移＞1.2 屏判为跳跃/直达穿越，该拍不记账、不弥合；连续小位
   * 移滚动时弥合两拍间扫过的字带（仅与已展开已填充节求交的部分，
   * 折叠节不凭空给分）。深链落位、展开、开目录、位置恢复本身都不产
   * 生覆盖；落位后用户正看的那一屏自下一拍起正常记账。
   * 落盘：随 autopos 条目存 cov（区间）/covFrac/covSec，frac 字段语义
   * 自本版起改为真实覆盖率；off 仍是位置锚（落位用），分工不变。
   * 存量条目只有旧 frac/done、无从分辨真读与误标：首次打开时把旧值
   * 隔离存入 legacyFrac/legacyDone（原样保留、不删数据），账本从空
   * 重计、done 活动旗清零，显示随即转新口径；统计 fin 已入账者不回
   * 滚（同样无从分辨，见回执存量方案）。 */
  var _cov = null;         /* 当前书已读字区间 [[a,b],...]（升序、已合并） */
  var _covTotal = 0;       /* 区间并集总字数 */
  var _covTick = null;     /* 上一记账拍 {y, lo, hi}：scrollY 与带覆盖字区间 */
  var _covLegacy = false;  /* 本书存量进度待隔离落盘 */
  var _covLegacyVals = null;
  var COV_SEC_DONE = 0.90;
  var COV_MAX_IV = 80;
  function covInsert(a, b) {
    if (!_cov) _cov = [];
    if (b <= a) return;
    var out = [], na = a, nb = b, placed = false;
    for (var i = 0; i < _cov.length; i++) {
      var iv = _cov[i];
      if (iv[1] < na) { out.push(iv); continue; }
      if (iv[0] > nb) {
        if (!placed) { out.push([na, nb]); placed = true; }
        out.push(iv); continue;
      }
      na = Math.min(na, iv[0]); nb = Math.max(nb, iv[1]);
    }
    if (!placed) out.push([na, nb]);
    /* 区间数封顶：逐对并掉最近的一对（间隙被多算，量级为段落级、罕见触发） */
    while (out.length > COV_MAX_IV) {
      var bi = 0, bg = Infinity;
      for (var j = 0; j + 1 < out.length; j++) {
        var g = out[j + 1][0] - out[j][1];
        if (g < bg) { bg = g; bi = j; }
      }
      out.splice(bi, 2, [out[bi][0], out[bi + 1][1]]);
    }
    _cov = out;
    _covTotal = 0;
    for (var k = 0; k < out.length; k++) _covTotal += out[k][1] - out[k][0];
  }
  function covCoveredIn(a, b) {
    if (!_cov || b <= a) return 0;
    var s = 0;
    for (var i = 0; i < _cov.length; i++) {
      if (_cov[i][1] <= a) continue;
      if (_cov[i][0] >= b) break;
      s += Math.min(b, _cov[i][1]) - Math.max(a, _cov[i][0]);
    }
    return s;
  }
  function coveredFracNow() {
    return (_metrics && _metrics.total) ? _covTotal / _metrics.total : 0;
  }
  function secCovRatio(si) {
    if (!_metrics) return 0;
    var sl = _metrics.secLens[si] || 0;
    if (!sl) return 1; /* 空节无字可读，视为满 */
    return covCoveredIn(_metrics.cum[si], _metrics.cum[si] + sl) / sl;
  }
  function loadCoverage(id) {
    _cov = []; _covTotal = 0; _covTick = null;
    _covLegacy = false; _covLegacyVals = null;
    var e = loadAutoPos(id);
    if (!e) return;
    if (Array.isArray(e.cov)) {
      var raw = e.cov.filter(function (iv) {
        return Array.isArray(iv) && isFinite(iv[0]) && isFinite(iv[1]) && iv[1] > iv[0];
      }).sort(function (x, y) { return x[0] - y[0]; });
      raw.forEach(function (iv) { covInsert(iv[0], iv[1]); });
    } else if (e.frac != null || e.done) {
      _covLegacy = true;
      _covLegacyVals = { frac: (e.frac != null ? e.frac : null), done: !!e.done, doneTs: e.doneTs || null };
    }
  }
  function accrueCoverage() {
    if (!_metrics || !_metrics.total || !currentId) return;
    var ih = window.innerHeight || 0;
    if (!ih) return;
    var y = window.scrollY || window.pageYOffset || 0;
    /* 已展开已填充的节才可能被看到：折叠节/懒填充未填节一律不记账 */
    var openSecs = {};
    document.querySelectorAll('#jing-content .jing-sec').forEach(function (secEl) {
      var body = secEl.querySelector('.jing-sec-body');
      if (body && !body.hidden && !body.hasAttribute('data-lazy')) openSecs[+secEl.getAttribute('data-sec')] = secEl;
    });
    var lo = Infinity, hi = -Infinity, spans = [];
    for (var sk in openSecs) {
      var si = +sk, secEl = openSecs[sk];
      var sr = secEl.getBoundingClientRect();
      if (sr.bottom <= 0 || sr.top >= ih) continue;
      var ps = secEl.querySelectorAll('.jing-sec-body p.jing-para');
      for (var i = 0; i < ps.length; i++) {
        var pi = +ps[i].getAttribute('data-para');
        var len = (_metrics.paraLens[si] || [])[pi] || 0;
        if (!len) continue;
        var r = ps[i].getBoundingClientRect();
        if (r.bottom <= 0) continue;
        if (r.top >= ih) break;
        var base = _metrics.cum[si] + ((_metrics.paraCum[si] || [])[pi] || 0);
        var f0 = Math.min(1, Math.max(0, (0 - r.top) / Math.max(1, r.height)));
        var f1 = Math.min(1, Math.max(0, (ih - r.top) / Math.max(1, r.height)));
        if (f1 <= f0) continue;
        var a = base + f0 * len, b = base + f1 * len;
        spans.push([a, b]);
        if (a < lo) lo = a;
        if (b > hi) hi = b;
      }
    }
    var prev = _covTick;
    _covTick = { y: y, lo: lo, hi: hi };
    if (!prev) return; /* 首拍只建基准，不记账 */
    if (Math.abs(y - prev.y) > ih * 1.2) return; /* 跳跃/直达穿越：不记不弥合 */
    if (hi === -Infinity) return; /* 本拍视口内无正文 */
    if (prev.hi !== -Infinity && isFinite(prev.hi)) {
      var gapA = (y >= prev.y) ? prev.hi : hi;
      var gapB = (y >= prev.y) ? lo : prev.lo;
      if (gapB > gapA) {
        for (var sk2 in openSecs) {
          var sj = +sk2, s0 = _metrics.cum[sj], s1 = s0 + (_metrics.secLens[sj] || 0);
          var ia = Math.max(gapA, s0), ib = Math.min(gapB, s1);
          if (ib > ia) spans.push([ia, ib]);
        }
      }
    }
    spans.forEach(function (sp) { covInsert(sp[0], sp[1]); });
  }

  function saveProgressNow() {
    if (!currentId || !_metrics || !_metrics.total) return;
    if (window.__wuriHlFreeze && window.__wuriHlFreeze.id === currentId && Date.now() < window.__wuriHlFreeze.until) return; /* 高亮提交冻结期：回闪瞬时位不得写进 autopos 毒化后续落位 */
    accrueCoverage(); /* 落盘前先记账到最新一拍 */
    var frac = coveredFracNow();
    try {
      var m = JSON.parse(localStorage.getItem(AUTOPOS_KEY) || '{}');
      var e = m[currentId] || {};
      if (_covLegacy && _covLegacyVals) {
        /* 存量隔离：旧位置口径 frac/done 原样转存 legacy*，活动字段转新口径 */
        if (e.legacyFrac === undefined) {
          e.legacyFrac = _covLegacyVals.frac;
          e.legacyDone = _covLegacyVals.done;
          if (_covLegacyVals.doneTs) e.legacyDoneTs = _covLegacyVals.doneTs;
        }
        if (e.done && frac < 0.995) { e.done = false; delete e.doneTs; }
        _covLegacy = false; _covLegacyVals = null;
      }
      e.frac = Math.round(frac * 10000) / 10000; /* 语义＝真实覆盖率（见账本注释） */
      e.off = currentContentOffset(); /* 字偏移锚随进度同写，保证重渲/重进落位不读到陈旧 off */
      e.cov = (_cov || []).map(function (iv) { return [Math.round(iv[0]), Math.round(iv[1])]; });
      e.covFrac = e.frac;
      e.covSec = _metrics.secLens.map(function (sl, si) { return sl ? Math.floor(secCovRatio(si) * 100) : 100; });
      var newlyDone = false;
      if (frac >= 0.995 && !e.done) { e.done = true; e.doneTs = Date.now(); newlyDone = true; }
      e.ts = Date.now();
      m[currentId] = e;
      var keys = Object.keys(m);
      if (keys.length > 40) {
        keys.sort(function (a, b) { return (m[a].ts || 0) - (m[b].ts || 0); });
        keys.slice(0, keys.length - 40).forEach(function (kk) { delete m[kk]; });
      }
      localStorage.setItem(AUTOPOS_KEY, JSON.stringify(m));
    } catch (err) {}
    if (newlyDone) rpStatsFinish(currentId);
  }
  /* ---------- 阅读统计（批一第 4 项）：纯本地，不上传 ----------
   * 存储 wuri_jing_stats_v1 = {days:{'YYYY-MM-DD':秒}, fin:{sid:ts}, total:秒}
   * 计时：5 秒节拍，仅当 阅读器打开＋页面可见＋最近 90 秒内有交互 才累加
   * （防挂机刷时长）；攒满 15 秒落盘，页面转隐藏时立即落盘（心跳防丢）。
   * 读完：saveProgressNow 判定进度 100%（frac≥0.995）时经 rpStatsFinish 记账。 */
  var RP_STATS_KEY = 'wuri_jing_stats_v1';
  var rpPending = 0, rpLastTick = 0, rpLastAct = Date.now();
  function rpLoadStats() {
    try {
      var d = JSON.parse(localStorage.getItem(RP_STATS_KEY) || 'null');
      if (d && d.days && d.fin) return d;
    } catch (e) {}
    return { days: {}, fin: {}, total: 0 };
  }
  function rpSaveStats(d) {
    try { localStorage.setItem(RP_STATS_KEY, JSON.stringify(d)); } catch (e) {}
  }
  /* ---------- 阅读统计云同步（反馈第二批第 9 项） ----------
   * 本地 wuri_jing_stats_v1 永远只记本设备。同步走既有账号通道：
   * dataset 'jing.stats'、item_key＝设备 id、值＝本设备桶 {days, fin}
   * 快照。后端 sync_items 按 (user_id, dataset, item_key) 后写为准，
   * 每台设备只写自己的 key —— 分桶即防覆盖，不存在整 blob 互覆。
   * 展示与周结一律读合并视图 rpMergedStats()：本设备贡献取本地与自家
   * 远端桶逐日 max（同源计数、max 防双计），他设备桶逐日相加；fin 按
   * 书 id 并集取最早 ts；total＝合并 days 之和，连读/天数按合并 days。
   * 拉取时把自家远端桶回填本地（换机/清数据后恢复本设备历史）。
   * 未登录或未开同步：rpSyncOn() 为假、全部短路，纯本地现状不变；
   * 失败静默，下次落盘/进页自动补传。 */
  var RP_REMOTE_KEY = 'wuri_jing_stats_remote_v1';
  var rpSyncBusy = false, rpPushTimer = null, rpLastPull = 0;
  function rpMyDeviceId() {
    try { if (window.WuriAccount && WuriAccount._deviceId) return WuriAccount._deviceId(); } catch (e) {}
    return '';
  }
  function rpSyncOn() {
    try { return !!(window.WuriAccount && WuriAccount._syncEnabled && WuriAccount._syncEnabled()); } catch (e) { return false; }
  }
  function rpRemoteLoad() {
    try { var d = JSON.parse(localStorage.getItem(RP_REMOTE_KEY) || 'null'); if (d && typeof d === 'object') return d; } catch (e) {}
    return {};
  }
  function rpRemoteSave(d) { try { localStorage.setItem(RP_REMOTE_KEY, JSON.stringify(d)); } catch (e) {} }
  function rpMergedStats() {
    var local = rpLoadStats();
    /* 同步未开（未登录/已登出/关同步）：展示纯本地，不混缓存的远端桶 */
    if (!rpSyncOn()) {
      var lt = 0;
      Object.keys(local.days).forEach(function (k) { lt += local.days[k] || 0; });
      return { days: local.days, fin: local.fin, total: lt };
    }
    var remote = rpRemoteLoad();
    var myId = rpMyDeviceId();
    var days = {}, fin = {};
    Object.keys(local.days).forEach(function (k) { if (local.days[k] > 0) days[k] = local.days[k]; });
    Object.keys(local.fin).forEach(function (k) { fin[k] = local.fin[k]; });
    Object.keys(remote).forEach(function (dev) {
      var b = remote[dev]; if (!b) return;
      var bd = b.days || {}, bf = b.fin || {};
      Object.keys(bd).forEach(function (k) {
        if (!(bd[k] > 0)) return;
        if (dev === myId) days[k] = Math.max(days[k] || 0, bd[k]);
        else days[k] = (days[k] || 0) + bd[k];
      });
      Object.keys(bf).forEach(function (k) { if (!fin[k] || bf[k] < fin[k]) fin[k] = bf[k]; });
    });
    var total = 0;
    Object.keys(days).forEach(function (k) { total += days[k]; });
    return { days: days, fin: fin, total: total };
  }
  function rpSyncPull() {
    if (!rpSyncOn() || rpSyncBusy) return;
    rpSyncBusy = true;
    rpLastPull = Date.now();
    WuriAccount._syncPullAll().then(function (items) {
      rpSyncBusy = false;
      if (!items) return;
      var remote = rpRemoteLoad();
      var myId = rpMyDeviceId();
      var changed = false;
      var barrier = rpResetBarrier();
      items.forEach(function (it) {
        if (!it || it.dataset !== 'jing.stats') return;
        /* 重置屏障：本设备桶在重置时刻之前的残影（tombstone 未送达时
           云端仍是旧行）一律不入缓存、不回填，并补发 tombstone 自愈；
           重置后的新快照 updated_at 必晚于屏障、不受影响 */
        if (myId && it.key === myId && barrier && Date.parse(it.updated_at || '') <= barrier) {
          if (it.deleted) {
            if (remote[myId]) { delete remote[myId]; changed = true; }
          } else { rpPushStatsTombstone(); }
          return;
        }
        if (it.deleted) return;
        var v = null;
        try { v = JSON.parse(it.value); } catch (e) {}
        if (!v || typeof v !== 'object') return;
        remote[it.key] = { days: v.days || {}, fin: v.fin || {} };
        changed = true;
      });
      if (!changed) return;
      rpRemoteSave(remote);
      var mine = myId && remote[myId];
      if (mine) {
        var d = rpLoadStats(), dirty = false;
        Object.keys(mine.days || {}).forEach(function (k) {
          if ((mine.days[k] || 0) > (d.days[k] || 0)) { d.days[k] = mine.days[k]; dirty = true; }
        });
        Object.keys(mine.fin || {}).forEach(function (k) {
          if (!d.fin[k]) { d.fin[k] = mine.fin[k]; dirty = true; }
        });
        if (dirty) {
          d.total = 0;
          Object.keys(d.days).forEach(function (k) { d.total += d.days[k] || 0; });
          rpSaveStats(d);
        }
      }
      rpRenderStats();
    }).catch(function () { rpSyncBusy = false; });
  }
  function rpSyncPush() {
    if (!rpSyncOn()) return;
    var myId = rpMyDeviceId();
    if (!myId) return;
    var d = rpLoadStats();
    try {
      WuriAccount._syncPushItems([{ dataset: 'jing.stats', key: myId, value: JSON.stringify({ days: d.days, fin: d.fin }), updated_at: new Date().toISOString() }])
        .catch(function () { /* 静默：下次落盘/进页补传 */ });
    } catch (e) {}
  }
  function rpSyncPushSoon() {
    if (rpPushTimer) clearTimeout(rpPushTimer);
    rpPushTimer = setTimeout(rpSyncPush, 4000);
  }
  /* ---------- 阅读统计重置（方案二，2026-10-29 用户裁定） ----------
   * 存量 fin 无从可靠甄别（v349 结论），用户裁定整表重置。范围仅统计层：
   * 本机 wuri_jing_stats_v1、远端缓存里的本设备桶、云端本设备桶；阅读
   * 位置进度（AUTOPOS/pos）、书签、划线、心得、生词本不在统计层、不动。
   * 云端清除复用 sync/push 既有 tombstone 语义（deleted=true 按
   * (user, dataset, item_key) 标记删除），不新增后端端点；push 失败时
   * 靠重置屏障（rpResetBarrier）在后续 pull 时拦残影并补发 tombstone。
   * 周结旗标一并复位（删 WK_SHOWN_KEY）。 */
  var RP_RESET_KEY = 'wuri_jing_stats_reset_at';
  function rpResetBarrier() {
    try { return parseInt(localStorage.getItem(RP_RESET_KEY) || '0', 10) || 0; } catch (e) { return 0; }
  }
  var rpTombBusy = false;
  function rpPushStatsTombstone() {
    var myId = rpMyDeviceId();
    if (!myId || rpTombBusy) return Promise.resolve(false);
    if (!(window.WuriAccount && WuriAccount._syncPushItems && WuriAccount.isLoggedIn && WuriAccount.isLoggedIn())) {
      return Promise.resolve(false);
    }
    rpTombBusy = true;
    return WuriAccount._syncPushItems([{ dataset: 'jing.stats', key: myId, value: '', deleted: true, updated_at: new Date().toISOString() }])
      .then(function (r) { rpTombBusy = false; return !!(r && r.body && r.body.ok); })
      .catch(function () { rpTombBusy = false; return false; });
  }
  function rpResetStats() {
    if (rpPushTimer) { clearTimeout(rpPushTimer); rpPushTimer = null; }
    rpPending = 0; /* 未落盘的在读秒数一并作废，防重置后被 flush 写回 */
    try { localStorage.setItem(RP_RESET_KEY, String(Date.now())); } catch (e) {}
    try { localStorage.removeItem(RP_STATS_KEY); } catch (e) {}
    var myId = rpMyDeviceId();
    if (myId) {
      var remote = rpRemoteLoad();
      if (remote[myId]) { delete remote[myId]; rpRemoteSave(remote); }
    }
    try { localStorage.removeItem(WK_SHOWN_KEY); } catch (e) {}
    rpRenderStats();
    return rpPushStatsTombstone();
  }
  /* ---------- 每周阅读总结（反馈第二批第 8 项） ----------
   * 口径：本地周一为周始；总结对象＝刚结束的上一周。数据读合并视图
   * （第 9 项；未同步时即本机数据——卡面口径不变式：分钟/天数/读完，
   * 有数据才带连读，无数据的项不显示、不编造未追踪字段）。每个新周
   * 首次渲染经文页在列表顶出一次性卡（关后本周不再弹，旗标存已弹的
   * 本周一日期）；统计明细里留「上周总结」回看入口随时重开。 */
  var WK_SHOWN_KEY = 'wuri_jing_wk_shown';
  function wkMonday(dt) {
    var d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function wkRangeLabel(start) {
    var end = new Date(start); end.setDate(end.getDate() + 6);
    var f = function (x) { return (x.getMonth() + 1) + '月' + x.getDate() + '日'; };
    return f(start) + ' – ' + f(end);
  }
  function wkSummaryData() {
    var d = rpMergedStats();
    var start = wkMonday(new Date()); start.setDate(start.getDate() - 7);
    var sec = 0, daysN = 0;
    for (var i = 0; i < 7; i++) {
      var dt = new Date(start); dt.setDate(dt.getDate() + i);
      var s = d.days[rpDayKey(dt)] || 0;
      sec += s; if (s > 0) daysN++;
    }
    var finN = 0, lo = start.getTime(), hi = lo + 7 * 86400000;
    Object.keys(d.fin).forEach(function (k) { var ts = d.fin[k]; if (ts >= lo && ts < hi) finN++; });
    return { start: start, sec: sec, days: daysN, fin: finN, streak: rpStreak(d) };
  }
  function wkHasData(s) { return s.sec > 0 || s.fin > 0; }
  function wkCardHTML(s) {
    var lines = '<p>阅读 ' + rpFmtDur(s.sec) + ' · 阅读 ' + s.days + ' 天';
    if (s.fin > 0) lines += ' · 读完 ' + s.fin + ' 本';
    lines += '</p>';
    if (s.days > 0 && s.streak > 1) lines += '<p>当前连读 ' + s.streak + ' 天</p>';
    return '<h4>上周阅读小结（' + wkRangeLabel(s.start) + '）</h4>' + lines
      + '<div class="wk-btns"><button class="mini-btn tiny" id="jing-wk-share">分享</button>'
      + '<button class="mini-btn tiny" id="jing-wk-close">关闭</button></div>';
  }
  function wkMaybeShow() {
    var card = document.getElementById('jing-wk-card');
    if (!card || !card.hidden) return;
    var wkKey = rpDayKey(wkMonday(new Date()));
    var shown = '';
    try { shown = localStorage.getItem(WK_SHOWN_KEY) || ''; } catch (e) {}
    if (shown === wkKey) return;
    var s = wkSummaryData();
    if (!wkHasData(s)) return; // 无数据不弹也不置旗标，待同步数据到达后仍可弹
    try { localStorage.setItem(WK_SHOWN_KEY, wkKey); } catch (e) {}
    card.innerHTML = wkCardHTML(s);
    card.hidden = false;
  }
  function wkShowSummary() {
    var card = document.getElementById('jing-wk-card');
    if (!card) return;
    var s = wkSummaryData();
    card.innerHTML = wkHasData(s) ? wkCardHTML(s)
      : '<h4>上周阅读小结（' + wkRangeLabel(s.start) + '）</h4><p>上周暂无阅读记录</p>'
        + '<div class="wk-btns"><button class="mini-btn tiny" id="jing-wk-close">关闭</button></div>';
    card.hidden = false;
    try { card.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }
  function wkShareCard() {
    var s = wkSummaryData();
    var lines = ['上周阅读小结', wkRangeLabel(s.start), '阅读 ' + rpFmtDur(s.sec), '阅读 ' + s.days + ' 天'];
    if (s.fin > 0) lines.push('读完 ' + s.fin + ' 本');
    if (s.days > 0 && s.streak > 1) lines.push('当前连读 ' + s.streak + ' 天');
    // 复用图卡 Canvas 规格（宣纸底/金边/右下落款），经分享 IIFE 的桥出图
    if (window.__wuriShareCardParts) window.__wuriShareCardParts({ text: lines.join('\n'), book: '', secTitle: '' });
  }
  function rpDayKey(dt) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }
  function rpFlushStats() {
    if (rpPending <= 0) return;
    var d = rpLoadStats();
    var k = rpDayKey(new Date());
    d.days[k] = (d.days[k] || 0) + rpPending;
    d.total = (d.total || 0) + rpPending;
    rpPending = 0;
    rpSaveStats(d);
    rpRenderStats();
    rpSyncPushSoon();
  }
  function rpStatsFinish(sid) {
    if (!sid) return;
    var d = rpLoadStats();
    if (!d.fin[sid]) { d.fin[sid] = Date.now(); rpSaveStats(d); }
    rpRenderStats();
    rpSyncPushSoon();
  }
  function rpStreak(d) {
    var n = 0, cur = new Date();
    if (!d.days[rpDayKey(cur)]) cur.setDate(cur.getDate() - 1); /* 今日未读：自昨日起算 */
    while (d.days[rpDayKey(cur)] > 0) { n++; cur.setDate(cur.getDate() - 1); }
    return n;
  }
  function rpFmtDur(sec) {
    sec = Math.round(sec || 0);
    if (sec <= 0) return '0 分钟';
    if (sec < 60) return '不足 1 分钟';
    var m = Math.round(sec / 60);
    if (m < 60) return m + ' 分钟';
    return Math.floor(m / 60) + ' 小时 ' + (m % 60 ? (m % 60) + ' 分钟' : '');
  }
  function rpRenderStats() {
    var row = document.getElementById('jing-stats-row');
    var sum = document.getElementById('jing-stats-sum');
    if (!row || !sum) return;
    /* 同步开时进页懒拉取（5 分钟节流；拉回后 rpSyncPull 内部会再渲染） */
    if (rpSyncOn() && !rpSyncBusy && Date.now() - rpLastPull > 300000) rpSyncPull();
    var d = rpMergedStats(); // 展示读合并视图（本机＋已同步的他设备）
    var today = d.days[rpDayKey(new Date())] || 0;
    var finN = Object.keys(d.fin).length;
    sum.textContent = '今日 ' + rpFmtDur(today); // 一行三格格内只放关键数字（第 7 项）
    var det = document.getElementById('jing-stats-detail');
    if (det && !det.hidden) {
      var wk = 0;
      for (var i = 0; i < 7; i++) {
        var dt = new Date(); dt.setDate(dt.getDate() - i);
        wk += d.days[rpDayKey(dt)] || 0;
      }
      var daysN = Object.keys(d.days).filter(function (k) { return d.days[k] > 0; }).length;
      det.innerHTML = '<div class="rp-stat-grid">'
        + '<div><b>' + rpFmtDur(today) + '</b><span>今日时长</span></div>'
        + '<div><b>' + rpFmtDur(wk) + '</b><span>本周时长</span></div>'
        + '<div><b>' + rpStreak(d) + ' 天</b><span>连读天数</span></div>'
        + '<div><b>' + finN + ' 本</b><span>读完本数</span></div>'
        + '<div><b>' + rpFmtDur(d.total || 0) + '</b><span>总时长</span></div>'
        + '<div><b>' + daysN + ' 天</b><span>累计阅读天数</span></div>'
        + '</div>'
        + '<div class="wk-review-row"><button class="mini-btn tiny" id="jing-wk-review">上周总结</button></div>';
    }
    wkMaybeShow();
  }
  window.__wuriStats = { load: rpLoadStats, render: rpRenderStats, finish: rpStatsFinish, flush: rpFlushStats, merged: rpMergedStats, pull: rpSyncPull, push: rpSyncPush, reset: rpResetStats, wkData: wkSummaryData, wkShow: wkShowSummary };
  document.addEventListener('DOMContentLoaded', function () {
    ['touchstart', 'touchmove', 'scroll', 'click', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, function () { rpLastAct = Date.now(); }, { passive: true });
    });
    rpLastTick = Date.now();
    setInterval(function () {
      var now = Date.now();
      var dt = Math.min(10, (now - rpLastTick) / 1000);
      rpLastTick = now;
      var rd = document.getElementById('jing-reader');
      var active = !!(window._jingCurrentId && rd && !rd.hidden && !document.hidden
        && (now - rpLastAct) < 90000);
      if (active && dt > 0) {
        rpPending += dt;
        if (rpPending >= 15) rpFlushStats();
      }
    }, 5000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) rpFlushStats();
    });
    var row = document.getElementById('jing-stats-row');
    if (row) row.addEventListener('click', function () {
      var det = document.getElementById('jing-stats-detail');
      if (!det) return;
      det.hidden = !det.hidden;
      rpRenderStats();
    });
    /* 周结卡按钮（事件委托：卡与明细按钮都由 innerHTML 动态生成） */
    document.addEventListener('click', function (e) {
      if (e.target.closest('#jing-wk-close')) {
        var c = document.getElementById('jing-wk-card');
        if (c) c.hidden = true;
      } else if (e.target.closest('#jing-wk-share')) {
        wkShareCard();
      } else if (e.target.closest('#jing-wk-review')) {
        wkShowSummary();
      }
    });
    rpRenderStats();
    rpSyncPull(); // 进页先拉一次（未登录/未开同步内部短路）
    /* 设置页「重置阅读统计」（方案二）：入口在设置页最底部次级区、低调
       小钮防误触；确认弹窗讲清范围与不可恢复，确认后才执行 rpResetStats */
    var rsBtn = document.getElementById('stats-reset-btn');
    if (rsBtn) rsBtn.addEventListener('click', function () {
      var logged = !!(window.WuriAccount && WuriAccount.isLoggedIn && WuriAccount.isLoggedIn());
      var text = '重置阅读统计？\n\n将清零本机的阅读时长、读完本数与连读天数'
        + (logged ? '，并清除本设备在云端的统计备份' : '')
        + '，重置后不可恢复。\n阅读进度、书签、划线和生词本不受影响。';
      if (!confirm(text)) return;
      var msg = document.getElementById('stats-reset-msg');
      rsBtn.disabled = true;
      rpResetStats().then(function (cloudOk) {
        rsBtn.disabled = false;
        if (!msg) return;
        if (!logged) msg.textContent = '已重置：本机阅读统计已清零。';
        else if (cloudOk) msg.textContent = '已重置：本机与本设备云端统计已清零。';
        else msg.textContent = '本机统计已清零；云端清除未完成，下次同步时会自动补清。';
      });
    });
  });
  function secIdxAtOffset(off) {
    if (!_metrics) return 0;
    var si = 0;
    for (var i = 0; i < _metrics.cum.length; i++) { if (_metrics.cum[i] <= off) si = i; else break; }
    return si;
  }
  function fmtRemain(chars) {
    if (chars <= 0) return '已读完';
    var mins = chars / readSpeed();
    return mins < 1 ? '余不足 1 分钟' : '余约 ' + Math.round(mins) + ' 分钟';
  }
  function updateReadUI() {
    var fill = $('#jing-prog-fill'), bar = $('#jing-statusbar'), txt = $('#jing-status-text');
    var reader = $('#jing-reader');
    if (!reader || reader.hidden || !currentId || !_metrics || !_metrics.total) {
      if (bar) bar.hidden = true;
      return;
    }
    var off = currentContentOffset(), frac = off / _metrics.total;
    accrueCoverage(); /* 与滚动同拍记账（覆盖账本，见其注释） */
    var covFrac = coveredFracNow();
    /* 显示口径（2026-10-29 翻页下线后）：状态行只呈现卷/章名 · 本书
       百分比；百分比/进度条＝真实覆盖率（2026-10-29 误标修复：旧版用
       实时位置偏移，深链落点前的卷被整卷计满）；卷/章名仍按位置 off */
    var _dispOff = off;
    if (fill) fill.style.width = (covFrac * 100).toFixed(1) + '%';
    /* 速度采样：间隔 >2.5s 且确有推进才计，EMA 平滑后落盘 */
    var now = Date.now();
    if (_lastOff >= 0 && off > _lastOff && now - _lastOffT > 2500) {
      var inst = (off - _lastOff) / ((now - _lastOffT) / 60000);
      if (inst > 40 && inst < 1500) {
        try { localStorage.setItem(SPEED_KEY, String(Math.round(readSpeed() * 0.7 + inst * 0.3))); } catch (e) {}
      }
    }
    if (off !== _lastOff) { _lastOff = off; _lastOffT = now; }
    if (bar && txt) {
      bar.hidden = false;
      var d = window.JINGWEN && JINGWEN[currentId];
      var si = secIdxAtOffset(_dispOff);
      var secH = (d && d.sections && d.sections[si] && d.sections[si].h) || '';
      /* 口径（2026-10-28 用户钉死）：百分比恒以本经为单位——全经已读内容字数
         ÷ 全经总内容字数（多卷经跨卷合并计算）；本卷进度与本卷剩余作并列小字，
         不做任何跨经聚合；存档/已读完落盘走实时 frac */
      var dfrac = covFrac;
      var pct = dfrac >= 0.995 ? 100 : Math.floor(dfrac * 100);
      /* 底栏瘦身（2026-10-28 用户定，推翻 v257 口径）：只呈现「卷/章名 · 本书
         X%」；本卷进度与剩余时间估算不再上栏（底层 frac/速度采样/autopos
         存储口径全部不动） */
      txt.innerHTML = (secH ? '<b>' + esc(txScript(secH)) + '</b> · ' : '') + (dfrac >= 0.995 ? '已读完' : '本书 ' + pct + '%');
    }
    if (now - _lastProgSave > 2500) { _lastProgSave = now; saveProgressNow(); }
    /* 读完瞬间立即落盘一次：滚到底后不再有滚动事件触发节流保存，
       否则 done 只停在状态栏、存档仍是 98.x%（实测 KR5g0030）。 */
    if (covFrac >= 0.995 && _doneSavedFor !== currentId) { _doneSavedFor = currentId; _lastProgSave = now; saveProgressNow(); }
  }
  function scheduleReadUI() {
    if (_readUiT) return;
    _readUiT = setTimeout(function () { _readUiT = null; updateReadUI(); }, 300);
  }
  window.addEventListener('scroll', function () {
    var reader = $('#jing-reader');
    if (reader && !reader.hidden && currentId) scheduleReadUI();
  }, { passive: true });
  /* 列表行进度：读 autopos 的 frac/done 装饰目录行（精选架＋全藏行共用） */
  function decorateReadProgress() {
    var m;
    try { m = JSON.parse(localStorage.getItem(AUTOPOS_KEY) || '{}'); } catch (e) { return; }
    document.querySelectorAll('#jing-list .jing-item[data-jing], #jing-list [data-dz-work]').forEach(function (row) {
      var id = row.getAttribute('data-jing') || row.getAttribute('data-dz-work');
      var e = m[id];
      var old = row.querySelector('.read-prog');
      if (!e || (e.frac == null && e.covFrac == null && !e.done)) {
        if (old) old.remove();
        var sub0 = row.querySelector('.jing-sub');
        if (sub0) sub0.classList.remove('has');
        return;
      }
      if (!old) {
        old = document.createElement('span');
        old.className = 'read-prog';
        var meta = row.querySelector('.dz-wmeta');
        if (meta) { meta.appendChild(old); } /* 道藏书行：胶囊进眷属小字流（2026-10-28 排版定版） */
        else {
          /* 精选/内丹行（2026-10-28 晚反馈批第 15 条）：徽标退到书名下方
             小字行 .jing-sub，不再挤占书名行宽；无小字行容器时回落旧位 */
          var sub = row.querySelector('.jing-sub');
          if (sub) sub.appendChild(old);
          else {
            var go = row.querySelector('.jing-go');
            if (go) row.insertBefore(old, go); else row.appendChild(old);
          }
        }
      }
      /* 覆盖口径优先（covFrac 在场即以真实覆盖为准，旧 frac/done 仅未隔离存量回落） */
      var _ef = (e.covFrac != null) ? e.covFrac : (e.frac || 0);
      var _edone = (e.covFrac != null) ? (_ef >= 0.995) : !!e.done;
      old.textContent = _edone ? '已读完' : ('读 ' + Math.floor(_ef * 100) + '%');
      old.classList.toggle('done', _edone);
      var sub2 = row.querySelector('.jing-sub');
      if (sub2) sub2.classList.toggle('has', !!old.parentNode && old.parentNode === sub2);
    });
  }
  window.__wuriDecorateProgress = decorateReadProgress;
  window.__wuriReadFrac = function (id) {
    var e = loadAutoPos(id);
    if (!e || (e.frac == null && e.covFrac == null && !e.done)) return null;
    var f = (e.covFrac != null) ? e.covFrac : (e.frac || 0);
    return { frac: f, done: (e.covFrac != null) ? (f >= 0.995) : !!e.done };
  };

  /* ---------- 卷次目录抽屉：卷→章二级（章＝卷内 dz-cht 类题/第X题式段） ---------- */
  function tocChapters(d, si) {
    var sec = d.sections[si];
    if (!sec || !sec.paras) return [];
    var out = [], acc = 0;
    sec.paras.forEach(function (p) {
      if (p.img) return;
      var s = jpStrip(p.t || '');
      var isCh = p.cls === 'dz-cht' ||
        (s.length >= 2 && s.length <= 18 && /第[一二三四五六七八九十百廿卅\d]+$/.test(s) && !/[，。；：？]/.test(p.t || ''));
      if (isCh) out.push({ name: String(p.t || '').trim(), off: acc });
      acc += stripContent(p.t).length;
    });
    return out.length >= 2 ? out : [];
  }
  function openToc() {
    var d = window.JINGWEN && JINGWEN[currentId];
    var toc = $('#jing-toc'), list = $('#jing-toc-list'), title = $('#jing-toc-title');
    if (!d || !toc || !list) return;
    if (!_metrics) buildReaderMetrics(d);
    var off = currentContentOffset();
    var curSi = secIdxAtOffset(off);
    /* 本书进度与每卷百分比＝真实覆盖（覆盖账本）；cur 高亮仍按位置 */
    var frac = (_metrics && _metrics.total) ? coveredFracNow() : 0;
    if (title) title.textContent = txScript(d.title || '');
    var html = '<div class="jing-toc-all">本书进度 ' + (frac >= 0.995 ? '已读完' : Math.floor(frac * 100) + '%') + ' · 共 ' + d.sections.length + ' 卷</div>';
    d.sections.forEach(function (sec, si) {
      var sp = secCovRatio(si);
      var spct = Math.floor(sp * 100);
      html += '<div class="jing-toc-vol' + (si === curSi ? ' cur' : '') + '" data-toc-sec="' + si + '">'
        + '<span class="tv-name">' + esc(txScript(sec.h || ('第' + (si + 1) + '卷'))) + '</span>'
        + '<span class="tv-pct">' + (sp >= COV_SEC_DONE ? '已读完' : spct + '%') + '</span></div>';
      tocChapters(d, si).forEach(function (ch) {
        html += '<div class="jing-toc-ch" data-toc-sec="' + si + '" data-toc-off="' + ch.off + '">' + esc(txScript(ch.name)) + '</div>';
      });
    });
    /* 目录顶部固定一行「我的标记」入口（2026-10-28 晚反馈批第 6 条改名；
       点击处理在目录委托里 data-toc-marks，走 fromReader 路径） */
    html = '<div class="jing-toc-vol" data-toc-marks="1"><span class="tv-name">我的标记</span><span class="tv-pct">书签 · 高亮 · 心得</span></div>' + html;
    list.innerHTML = html;
    toc.hidden = false;
    var cur = list.querySelector('.jing-toc-vol.cur');
    if (cur) setTimeout(function () { cur.scrollIntoView({ block: 'center' }); }, 30);
  }
  function closeToc() { var toc = $('#jing-toc'); if (toc) toc.hidden = true; }

  /* ---------- 长按查字（数据层 js/dict.js：__wuriDict，全书可用） ---------- */
  var _dictSel = null; /* {text, paraText, start, end} */
  function plainTextOfFrag(frag) {
    var c = frag.cloneNode ? frag.cloneNode(true) : frag;
    if (c.querySelectorAll) c.querySelectorAll('rt, rp').forEach(function (n) { n.remove(); });
    return c.textContent || '';
  }
  function captureDictSel() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var range = sel.getRangeAt(0);
    var content = $('#jing-content');
    if (!content || !content.contains(range.startContainer)) return null;
    var para = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    para = para && para.closest ? para.closest('.jing-para') : null;
    if (!para) return null;
    var selText = plainTextOfFrag(range.cloneContents()).trim();
    if (!selText || selText.length > 20) return null;
    var pre = document.createRange();
    pre.selectNodeContents(para);
    pre.setEnd(range.startContainer, range.startOffset);
    var start = plainTextOfFrag(pre.cloneContents()).length;
    var paraText = plainTextOfFrag((function () { var r = document.createRange(); r.selectNodeContents(para); return r.cloneContents(); })());
    return { text: selText, paraText: paraText, start: start, end: start + selText.length };
  }
  function showDictCard(word, wordEntry, charEntries) {
    var card = $('#dict-card'), wEl = $('#dict-word'), body = $('#dict-body');
    if (!card || !wEl || !body) return;
    wEl.textContent = txScript(word);
    var html = '';
    if (wordEntry) {
      if (wordEntry.py) html += '<div class="dict-py">' + esc(wordEntry.py) + '</div>';
      if (wordEntry.def) html += '<div class="dict-sec"><h4>今义</h4><p>' + esc(wordEntry.def) + '</p></div>';
      if (wordEntry.jingDef) html += '<div class="dict-sec"><h4>经文义</h4><p>' + esc(wordEntry.jingDef) + '</p></div>';
    }
    (charEntries || []).forEach(function (ce) {
      if (!ce) return;
      html += '<div class="dict-char"><span class="dc-head">' + esc(txScript(ce.ch)) + '</span>'
        + (ce.py ? '<span class="dc-py">' + esc(ce.py) + '</span>' : '')
        + (ce.radical ? '<span class="dc-py">' + esc(ce.radical) + '部' + (ce.strokes ? ' · ' + ce.strokes + '画' : '') + '</span>' : '')
        + (ce.def ? '<p>' + esc(ce.def) + '</p>' : '')
        + (ce.sw ? '<p class="sw">《说文》：' + esc(txScript(ce.sw)) + '</p>' : '')
        + '</div>';
    });
    if (!html) html = '<p class="hint">辞书暂未收录此字/词。</p>';
    body.innerHTML = html;
    card.hidden = false;
  }
  function runDictLookup() {
    var fab = $('#dict-fab');
    if (fab) fab.hidden = true;
    var info = _dictSel || captureDictSel();
    _dictSel = null;
    if (!info) return;
    var D = window.__wuriDict;
    var word = info.text;
    if (!D) { showDictCard(word, null, []); return; }
    var doLookup = function () {
      var ex = null;
      try { ex = D.expandWord ? D.expandWord(info.paraText, info.start, info.end) : null; } catch (e) {}
      if (ex && ex.text && ex.text.length <= 8) word = ex.text;
      var pWord = D.lookupWord ? D.lookupWord(word) : Promise.resolve(null);
      var chars = [];
      var seen = {};
      for (var i = 0; i < word.length && chars.length < 6; i++) {
        var ch = word[i];
        if (!seen[ch] && /[一-鿿]/.test(ch)) { seen[ch] = 1; chars.push(ch); }
      }
      var pChars = Promise.all(chars.map(function (ch) { return D.lookupChar ? D.lookupChar(ch) : Promise.resolve(null); }));
      Promise.all([pWord, pChars]).then(function (rs) {
        showDictCard(word, rs[0], rs[1]);
        /* 生词本自动入本（批二第 5 项）：有读音或释义才收，同词只更新 */
        try {
          var we = rs[0], ces = rs[1] || [];
          var py = (we && we.py) || ces.map(function (c) { return c && c.py; }).filter(Boolean).join(' ');
          var def = (we && (we.def || we.jingDef)) || (ces[0] && ces[0].def) || '';
          if (py || def) {
            var bk = '';
            try { bk = (window.JINGWEN && JINGWEN[currentId] && JINGWEN[currentId].title) || ''; } catch (e) {}
            var s0 = Math.max(0, info.start - 18), s1 = Math.min(info.paraText.length, info.end + 18);
            rpVocabSave({
              word: word, py: py, def: def, book: bk,
              sentence: (s0 > 0 ? '…' : '') + info.paraText.slice(s0, s1) + (s1 < info.paraText.length ? '…' : ''),
              ts: Date.now()
            });
          }
        } catch (e) {}
      }).catch(function () { showDictCard(word, null, []); });
    };
    if (D.ready) { D.ready().then(doLookup).catch(doLookup); } else doLookup();
  }

  /* ---------- 生词本（批二第 5 项） ----------
   * 查字成功（有读音/释义）自动入本：词＋读音＋释义＋出处（书名/原句
   * 节选）；同词重复查只更新时间不重复建条。存储 wuri_jing_vocab。
   * 入口在经文页（阅读统计行下方），可翻看、可逐条删。 */
  var RP_VOCAB_KEY = 'wuri_jing_vocab';
  function rpVocabLoad() {
    try { var a = JSON.parse(localStorage.getItem(RP_VOCAB_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function rpVocabSave(entry) {
    if (!entry || !entry.word) return;
    var a = rpVocabLoad(), found = null;
    a.forEach(function (x) { if (x.word === entry.word) found = x; });
    if (found) {
      found.ts = entry.ts;
      found.py = entry.py || found.py;
      found.def = entry.def || found.def;
      found.book = entry.book || found.book;
      found.sentence = entry.sentence || found.sentence;
    } else a.push(entry);
    try { localStorage.setItem(RP_VOCAB_KEY, JSON.stringify(a)); } catch (e) {}
    rpVocabRender();
  }
  function rpVocabRemove(word) {
    var a = rpVocabLoad().filter(function (x) { return x.word !== word; });
    try { localStorage.setItem(RP_VOCAB_KEY, JSON.stringify(a)); } catch (e) {}
    rpVocabRender();
  }
  function rpVocabRender() {
    var a = rpVocabLoad();
    var cnt = document.getElementById('jing-vocab-count');
    if (cnt) cnt.textContent = a.length + ' 词';
    var list = document.getElementById('jing-vocab-list');
    if (!list) return;
    if (!a.length) {
      list.innerHTML = '<p class="hint">还没有生词。阅读时选中文字点查字，有释义的会自动收进来。</p>';
      return;
    }
    var sorted = a.slice().sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); });
    list.innerHTML = sorted.map(function (x) {
      return '<div class="vocab-item"><div class="vocab-main"><span class="vocab-word">' + esc(txScript(x.word)) + '</span>'
        + (x.py ? '<span class="vocab-py">' + esc(x.py) + '</span>' : '')
        + '<button class="vocab-del" data-vocab-del="' + esc(x.word) + '">删除</button></div>'
        + (x.def ? '<div class="vocab-def">' + esc(x.def) + '</div>' : '')
        + '<div class="vocab-src">' + esc(txScript(x.book || '')) + (x.sentence ? ' · ' + esc(txScript(x.sentence)) : '') + '</div></div>';
    }).join('');
  }
  window.__wuriVocab = { list: rpVocabLoad, save: rpVocabSave, remove: rpVocabRemove, render: rpVocabRender };
  document.addEventListener('DOMContentLoaded', function () {
    var row = document.getElementById('jing-vocab-row');
    if (row) row.addEventListener('click', function () {
      var p = document.getElementById('jing-vocab-panel');
      if (!p) return;
      p.hidden = !p.hidden;
      rpVocabRender();
    });
    var panel = document.getElementById('jing-vocab-panel');
    if (panel) panel.addEventListener('click', function (e) {
      var del = e.target.closest('[data-vocab-del]');
      if (del) rpVocabRemove(del.getAttribute('data-vocab-del'));
    });
    rpVocabRender();
  });

  document.addEventListener('DOMContentLoaded', function () {
    var toc = $('#jing-toc');
    if (toc) toc.addEventListener('click', function (e) {
      if (e.target.closest('[data-toc-close]')) { closeToc(); return; }
      /* 目录顶部「我的标记」入口：关目录、从阅读页进标记页（返回回
         本书原位，反馈批第 6 条；不再退阅读器回书架） */
      if (e.target.closest('[data-toc-marks]')) {
        closeToc();
        if (window.__wuriOpenMarksFromReader) window.__wuriOpenMarksFromReader('lines');
        return;
      }
      var vol = e.target.closest('[data-toc-sec]');
      if (vol) {
        var si = +vol.getAttribute('data-toc-sec');
        var off = +(vol.getAttribute('data-toc-off') || 0);
        closeToc();
        jumpToSec(si, off);
        setTimeout(updateReadUI, 500);
      }
    });
    /* 点状态行开卷次目录（2026-10-28 晚用户定：底栏不再设目录钮；
       状态行右端书签图标钮自带 stopPropagation、不会误开）。
       旧 _statusMode 卷/本切换随之退役（状态文案早已不分模式） */
    var bar = $('#jing-statusbar');
    if (bar) bar.addEventListener('click', function () {
      closeDockPanels();
      openToc();
    });
    var fab = $('#dict-fab');
    if (fab) fab.addEventListener('click', runDictLookup);
    /* 沉浸态：点正文（非高亮/叩磬/图版/卷题、无选区、非跟读）切换。
       背诵模式例外（反馈批第 10 条）：点被遮的字/句（段落内）只展开
       该句（document 委托处理器负责），不得触发沉浸进出；沉浸只认
       点正文空白处（段落外） */
    var contentEl = $('#jing-content');
    if (contentEl) contentEl.addEventListener('click', function (e) {
      if (!currentId || followMode) return;
      if (reciteMode && e.target.closest('.jing-para')) return;
      if (e.target.closest('.hl, .qing-inline, .dz-fig, a, button, .jing-sec-h')) return;
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      document.body.classList.toggle('jing-immersive');
    });
    var rszT = null;
    window.addEventListener('resize', function () {
      if (rszT) clearTimeout(rszT);
      rszT = setTimeout(function () {
        var reader = $('#jing-reader');
        if (reader && !reader.hidden && currentId) { applyReaderPrefs(); scheduleReadUI(); }
      }, 250);
    });
    /* 可见视口变化（浏览器工具栏伸缩/分屏/折叠屏/残留缩放）：翻页几何按
       新视口重量并复检——v262 旧实现只测一次、永不复检 */
    if (window.visualViewport) {
      var vvT = null;
      window.visualViewport.addEventListener('resize', function () {
        if (vvT) clearTimeout(vvT);
        vvT = setTimeout(function () {
          var reader = $('#jing-reader');
          if (reader && !reader.hidden && currentId) { applyReaderPrefs(); scheduleReadUI(); }
        }, 200);
      });
    }
    var dcard = $('#dict-card');
    if (dcard) dcard.addEventListener('click', function (e) {
      if (e.target.closest('[data-dict-close]')) dcard.hidden = true;
    });
    var dictDeb = null;
    document.addEventListener('selectionchange', function () {
      var reader = $('#jing-reader');
      if (!reader || reader.hidden || !currentId) return;
      if (dictDeb) clearTimeout(dictDeb);
      dictDeb = setTimeout(function () {
        var info = null;
        try { info = captureDictSel(); } catch (e) {}
        _dictSel = info;
        var fb = $('#dict-fab');
        if (fb) fb.hidden = !info;
      }, 500);
    });
  });

  function openReaderAt(id, secIdx, charOff, _retry) {
    _posSuppressUntil = Date.now() + 12000; /* 直达锚点优先：时限内不恢复书签/自动位置 */
    if (isNeidan(id) && !isPro()) { if (window.WuriPro) WuriPro.requirePro('jingwen'); return; }
    if (/^KR5/.test(id || '')) {
      /* 全藏正文走 daozang.js 的取文/开卷路径（其内另有一道门控），开卷后跳锚；
         常见经文架 KR 指针 10 部免费例外与 openReader 同口径 */
      if (!isPro() && !SHELF_FREE_KR[id]) { if (window.WuriPro) WuriPro.requirePro('jingwen'); return; }
      if (typeof window.__wuri_dzOpenWork === 'function') {
        window.__wuri_dzOpenWork(id);
        dzPollJump(id, secIdx, charOff || 0, 40);
      } else if (typeof openReader === 'function') {
        openReader(id);
        dzPollJump(id, secIdx, charOff || 0, 40);
      }
      return;
    }
    ensureLoaded(id, function () {
      var d = window.JINGWEN && JINGWEN[id];
      if (!d) {
        if (!_retry) {
          loaded[id] = null;
          setTimeout(function () { openReaderAt(id, secIdx, charOff, true); }, 300);
        }
        return;
      }
      prepJingPunct(d, function () {
        renderReaderBody(id, d);
        jumpToSec(secIdx, charOff || 0);
      });
    });
  }

  function renderReaderBody(id, d) {
      currentId = id;
      window._jingCurrentId = id;
      /* 返回定位武装：确认这部经确实打开了（付费墙拦截/加载失败不武装） */
      if (libReturn && libReturn.id === id) libReturn.armed = true;
      $('#jing-home').hidden = true;
      $('#jing-reader').hidden = false;
      /* 阅读器打开期间 App 底 tab 与经文页眉不占位（微信读书式底部控制栏定案） */
      document.body.classList.add('reader-open');
      updateAudioButtons();
      syncDockPlayUI(_dockState); /* 胶囊显隐随阅读器可见性重同步 */
      // 切到无音频经时若跟读开着，自动退出跟读态（避免高亮映射残留到新经）
      if (followMode && !hasAudio(id)) toggleFollow();
      /* 磬钮数据判定（反馈批第 2 条）：本书是否有敲磬语境。
         两路并集——①任一段落原文含「敲磬」字样（经文自带的舞台指示）；
         ②任一节名属赞/韵/咒/偈/开经/完经类（渲染时在末段追加内联（敲磬）
         标注，见下方 isQingSec）。判定结果存 window._jingHasQing；实际
         显示还须叠加书类闸（仅常见经文类，见 updateFab 的 fabIsNdDz） */
      var hasQing = false;
      if (d.sections) {
        for (var qi = 0; qi < d.sections.length && !hasQing; qi++) {
          var qs = d.sections[qi];
          if (/赞|韵|咒|偈|开经|完经/.test(qs.h || '')) { hasQing = true; break; }
          var qp = qs.paras || [];
          for (var qj = 0; qj < qp.length; qj++) {
            if (qp[qj].t && qp[qj].t.indexOf('敲磬') >= 0) { hasQing = true; break; }
          }
        }
      }
      window._jingHasQing = hasQing;

      $('#jing-title').textContent = txScript(d.title);
      // 传本标注（如宝诰的"闾山三奶派传本、非道藏所载"）：有才显示。
      // 道藏全集不在书头挂分类行（2026-10-27 用户定）：分类/底本移到文末一行小字
      var jsub = $('#jing-subtitle');
      if (jsub) {
        if (d.subtitle && !d.daozang) { jsub.textContent = txScript(d.subtitle); jsub.hidden = false; }
        else { jsub.hidden = true; }
      }
      // 来源标注（精选自家口径，书头显示；道藏全集不在书头显示，文末行交代；
      // 精选 KR 转录书同口径不显示底本框，2026-10-29 用户定，判定见 isKrSourced；
      // 常见经文区一律不显示来源·底本标注，2026-10-29 用户定扩围，判定见 isCommonShelf）
      var jnote = $('#jing-srcnote');
      if (jnote) {
        if (d.note && !isKrSourced(d) && !isCommonShelf(d)) {
          var dzSuffix = '';
          if (d.daozang) {
            dzSuffix = d.punctMode
              ? '｜机器标点 · 未经校订' + (d.punctPartial ? '（已标 ' + d.punctPartial.done + '/' + d.punctPartial.total + ' 卷）' : '') + '｜注音为机器标注加审读表校正，多音字可能有误' + (isSimpMode() ? '｜简体由繁体底本机器转换' : (!isSimpMode() && bookSimpBase(currentId) ? '｜繁体由简体底本机器转换' : ''))
              : '｜底本直出 · 未经校订｜注音为机器标注加审读表校正，多音字可能有误' + (isSimpMode() ? '｜简体由繁体底本机器转换' : (!isSimpMode() && bookSimpBase(currentId) ? '｜繁体由简体底本机器转换' : ''));
          } else if (d.punctMode) {
            /* 精选内丹标点版：只标标点口径（底本口径已在 note 内） */
            dzSuffix = '｜机器标点 · 未经校订';
          } else if (isSimpMode() && bookSimpBase(currentId) === false) {
            /* 精选繁体底本书在简体模式下同样经显示层转换，与道藏分支同口径标注 */
            dzSuffix = '｜简体由繁体底本机器转换';
          } else if (!isSimpMode() && bookSimpBase(currentId)) {
            dzSuffix = '｜繁体由简体底本机器转换';
          }
          jnote.textContent = txScript(d.note + dzSuffix);
          jnote.hidden = false;
        } else { jnote.hidden = true; }
      }
      // 标点版排版容器类（spec v1.1 §12：行高/段距/缩进走 .dz-punct 规则）
      var jcontent = $('#jing-content');
      if (jcontent) jcontent.classList.toggle('dz-punct', !!d.punctMode);
      // 单节书无折叠概念：全展开/全收回钮隐藏（多节书恒显）
      var fb2 = $('#jing-foldall');
      if (fb2) fb2.hidden = !(d.sections && d.sections.length > 1);
      /* 统一底栏（2026-10-29 第 0 步用户定版，supersede 反馈批第 11 条的
         分书类底栏与 v318 的内丹/道藏四钮）：全书类同一套钮 目录｜读｜
         背诵｜字｜全展开/全收回｜注音开/关（单节书隐藏全展开）；注音钮
         按书的注音能力显隐（applyReaderPrefs 内以 py 数据判定，内丹无
         注音数据→不显示）；「我的标记」不占底栏（入口＝目录面板首行
         ＋字面板本书组，全书类一致） */
      var rcb2 = $('#jing-recite');
      if (rcb2) rcb2.hidden = false;
      var rb3 = $('#jing-read-btn'); if (rb3) rb3.hidden = false;
      var tb3 = $('#jing-toc-btn'); if (tb3) tb3.hidden = false;
      // 「全部展开」全藏多卷本同样显示（2026-10-26 用户定）：卷体按需填充，
      // 展开走 foldAll 内的渐进分片渲染防卡死，按钮不再按 lazy 隐藏
      /* 背诵全书类开放（第 0 步统一底栏）：旧口径对内丹/全藏强制关背诵
         已废止；无标点底本按整段一句呈现（首字＋遮盖余文，点句展开） */
      clearFind(); /* 换书清本书搜索态与计数 */
      var fb9 = document.getElementById('jing-findbar');
      if (fb9) fb9.hidden = true;
      applyReaderPrefs();
      // 重建高亮范围
      if (window._jingHlRebuild) window._jingHlRebuild(id);
      var html = '';
      // 单节经文直接显示，不套折叠
      var singleSec = d.sections.length === 1;
      d.sections.forEach(function (sec, si) {
        // 叩磬：在赞/韵/咒/偈类节的末段加（敲磬）
        var h = sec.h || '';
        var isQingSec = /赞|韵|咒|偈|开经|完经/.test(h);
        var paras = (d.lazy && si > 0) ? '' : sec.paras.map(function (p, pi) {
          if (p.img) return dzFigHtml(p); /* 图版段：不套 .jing-para、不挂叩磬 */
          var txt = reciteMode ? recitePara(p) : rubyPara(p, si, pi);
          if (isQingSec && pi === sec.paras.length - 1) {
            txt += ' <span class="qing-inline" data-qing title="此处叩磬">（敲磬）</span>';
          }
          return '<p class="jing-para' + (p.cls ? ' ' + p.cls : '') + '" data-sec="' + si + '" data-para="' + pi + '">' + txt + '</p>';
        }).join('');
        var secH = sec.h || ('第' + (si + 1) + '节');
        secH = txScript(secH);
        if (singleSec) {
          // 单节：直接显示正文，无折叠头
          html += '<div class="jing-sec jing-sec-single" data-sec="' + si + '">'
            + '<div class="jing-sec-body">' + paras + '</div>'
            + '</div>';
        } else {
          html += '<div class="jing-sec" data-sec="' + si + '">'
            + '<h3 class="jing-sec-h" data-fold="' + si + '">' + esc(secH)
            + '</h3>'
            + '<div class="jing-sec-body"' + ((d.lazy && si > 0) ? ' data-lazy="' + si + '"' : '') + ' hidden>' + paras + '</div>'
            + '</div>';
        }
      });
      // 道藏全集文末行（2026-10-27 用户定）：分类编号＋底本＋标点口径一行小字，
      // 书头不再挂；标点版/原文版两形态都在（口径词随形态：机器标点/底本直出）
      if (d.daozang && d.dzMeta) {
        var dzm = d.dzMeta;
        var dzMetaLine = dzm.bu + (dzm.lei ? ' · ' + dzm.lei + '类' : '') + (dzm.dz ? ' · ' + dzm.dz : '');
        var dzModeLine = d.punctMode
          ? '机器标点 · 未经校订' + (d.punctPartial ? '（已标 ' + d.punctPartial.done + '/' + d.punctPartial.total + ' 卷）' : '')
          : '底本直出 · 未经校订';
        html += '<div class="dz-endnote">' + esc(txScript(dzMetaLine + '｜底本：正统道藏涵芬楼版（Kanripo 转录）｜' + dzModeLine)) + '</div>';
      }
      $('#jing-content').innerHTML = html;
      buildReaderMetrics(d);
      loadCoverage(id); /* 覆盖账本载入（存量隔离判定在此，落盘在首次 saveProgressNow） */
      _lastProgSave = 0; _doneSavedFor = null;
      setTimeout(updateReadUI, 700);
      setTimeout(updateReadUI, 2000);
      updateFoldBtn();
      /* 短书开卷全展开（2026-10-28 晚用户定）：正文 ≤2 万字一打开就全
         展开；>2 万字维持分节，靠播放驱动读到哪节展开哪节（见跟随高亮
         驱动）。落位恢复的展开集不满全节
         时，其 scrollTop 是旧展开布局下量的、展开全后失真——下方恢复
         段对这种情形放弃纵向落位（短书全开、回顶可接受）；展开集本
         就全满时照常恢复。 */
      var autoAll = false;
      if (d.sections && d.sections.length > 1 && _metrics && _metrics.total <= 20000) {
        autoAll = true;
        var allBodies = document.querySelectorAll('#jing-content .jing-sec-body');
        if (d.lazy) expandAllProgressive(allBodies);
        else for (var ab = 0; ab < allBodies.length; ab++) allBodies[ab].hidden = false;
        updateFoldBtn();
      }
      // 恢复书签位置（如果有）
      var bm = (window.JingMark && window.JingMark.getBookmark(id)) || null;
      if (bm && bm.expanded && d.lazy) {
        bm.expanded.forEach(function (sx) {
          if (window.__wuri_dzFill) { try { window.__wuri_dzFill(sx); } catch (e) {} }
          var bEl = document.querySelector('#jing-content .jing-sec[data-sec="' + sx + '"] .jing-sec-body');
          if (bEl) bEl.hidden = false;
        });
      }
      /* 滚动落点：锚点（落色等重渲前位置，5 秒内有效）＞书签＞自动位置记忆；
         openReaderAt 直达时限内只认锚点。命中走 insistReaderPos 轮询落位
         （展开＋等页高长够）；无命中维持旧行为回顶。
         高亮提交冻结期（__wuriHlFreeze）：只认落色锚点一处，书签/autopos
         两级冻结——防陈旧存档与锚点赛跑出「先闪回旧位、再跳回高亮处」。 */
      var _hlFrozen = !!(window.__wuriHlFreeze && window.__wuriHlFreeze.id === id && Date.now() < window.__wuriHlFreeze.until);
      var posY = 0, posExp = null, posHit = false;
      if (window._jingAnchorY != null && (Date.now() - (window._jingAnchorTs || 0)) < 5000) {
        posY = window._jingAnchorY; posExp = window._jingAnchorExp || null; posHit = true;
      } else if (!_hlFrozen && bm && bm.scrollTop != null) {
        posY = bm.scrollTop; posExp = bm.expanded || null; posHit = true;
      } else if (!_hlFrozen && Date.now() > _posSuppressUntil) {
        var ap = loadAutoPos(id);
        if (ap && ap.y > 50) { posY = ap.y; posExp = ap.expanded || null; posHit = true; }
      }
      if (autoAll && posExp && d.sections && posExp.length < d.sections.length) posY = 0;
      window._jingAnchorY = null; window._jingAnchorExp = null;
      if (posHit) insistReaderPos(id, posY, posExp);
      else window.scrollTo(0, 0);
      // 跟读模式开着时重渲染了内容：重建段落映射（懒节书一并填齐）
      if (followMode) {
        clearFollowCur();
        _mapSid = null;
        ensurePlayMap(function () {});
      }
  }

  function updateFoldBtn() {
    var btn = $('#jing-foldall');
    if (!btn) return;
    if (_foldBusy) { btn.textContent = '展开中…'; return; }
    var bodies = document.querySelectorAll('#jing-content .jing-sec-body');
    var open = 0;
    for (var i = 0; i < bodies.length; i++) if (!bodies[i].hidden) open++;
    /* 动作标签（2026-10-28 晚用户亲定）：有任一节未开→「全展开」；
       全部已开→「全收回」 */
    btn.textContent = (open === bodies.length && bodies.length) ? '全收回' : '全展开';
  }

  function toggleSection(si) {
    if (window.__wuri_dzFill) { try { window.__wuri_dzFill(+si); } catch (e) {} }
    var body = document.querySelector('#jing-content .jing-sec[data-sec="' + si + '"] .jing-sec-body');
    if (body) { body.hidden = !body.hidden; updateFoldBtn(); }
  }

  /* 全藏懒填充：某卷首次展开时才渲染该卷段落（注音/高亮随现行机制） */
  function dzFillSection(si, force) {
    var d = window.JINGWEN && window.JINGWEN[currentId];
    if (!d || !d.lazy) return;
    var body = document.querySelector('#jing-content .jing-sec[data-sec="' + si + '"] .jing-sec-body');
    if (!body) return;
    if (!force && !body.hasAttribute('data-lazy')) return;
    var sec = d.sections[si];
    if (!sec) return;
    if (window.__wuri_dzAnnotate) { try { window.__wuri_dzAnnotate(d, si); } catch (e) {} }
    body.innerHTML = sec.paras.map(function (p, pi) {
      if (p.img) return dzFigHtml(p);
      return '<p class="jing-para' + (p.cls ? ' ' + p.cls : '') + '" data-sec="' + si + '" data-para="' + pi + '">' + rubyPara(p, si, pi) + '</p>';
    }).join('');
    body.removeAttribute('data-lazy');
    if (window._jingHlRebuild) { try { window._jingHlRebuild(currentId); } catch (e) {} }
  }
  window.__wuri_dzFill = dzFillSection;
  /* 注音开关切换时：全藏已渲染卷用已加载字典重注并重渲 */
  window.__wuri_dzOnPyToggle = function () {
    var d = window.JINGWEN && window.JINGWEN[currentId];
    if (!d || !d.daozang || !pyOn) return;
    var refill = function () {
      document.querySelectorAll('#jing-content .jing-sec-body').forEach(function (b) {
        if (b.hasAttribute('data-lazy')) return;
        dzFillSection(+b.parentNode.getAttribute('data-sec'), true);
      });
      applyReaderPrefs();
    };
    if (window.__wuri_dzEnsureDict) { try { window.__wuri_dzEnsureDict(refill); return; } catch (e) {} }
    refill();
  };

  var _foldBusy = false;
  function foldAll() {
    if (_foldBusy) return;
    var bodies = document.querySelectorAll('#jing-content .jing-sec-body');
    if (bodies.length <= 1) return; /* 单节书无折叠概念（钮已隐藏，此为兜底） */
    var anyClosed = false;
    for (var i = 0; i < bodies.length; i++) if (bodies[i].hidden) { anyClosed = true; break; }
    if (!anyClosed) {
      for (var j = 0; j < bodies.length; j++) bodies[j].hidden = true;
      updateFoldBtn();
      return;
    }
    var d = window.JINGWEN && window.JINGWEN[currentId];
    if (d && d.lazy) { expandAllProgressive(bodies); return; }
    for (var k = 0; k < bodies.length; k++) bodies[k].hidden = false;
    updateFoldBtn();
  }
  /* 全藏多卷本「全部展开」：按卷分片填充＋展开（每片约 12ms 后让出主线程），
     61 卷整部渲染也不长时间白屏/无响应；期间按钮置「展开中…」并禁用防重复点 */
  function expandAllProgressive(bodies) {
    var btn = $('#jing-foldall');
    _foldBusy = true;
    if (btn) { btn.disabled = true; btn.textContent = '展开中…'; }
    var i = 0, total = bodies.length;
    (function step() {
      var t0 = Date.now();
      while (i < total) {
        var body = bodies[i];
        var si = +(body.parentNode && body.parentNode.getAttribute('data-sec') || i);
        if (window.__wuri_dzFill) { try { window.__wuri_dzFill(si); } catch (e) {} }
        body.hidden = false;
        i++;
        if (Date.now() - t0 >= 12) break;
      }
      if (i < total) { setTimeout(step, 0); return; }
      _foldBusy = false;
      if (btn) btn.disabled = false;
      updateFoldBtn();
    })();
  }

  /* ---------- 返回定位（2026-10-27 用户反馈） ----------
   * 从目录架/全藏分类/搜索结果点开经文时记下出处（来源面＋条目 id＋
   * window 滚动位），点「‹ 目录」返回时回到原面原位，并给刚读的那条
   * 加约 1.5 秒的淡金色描边便于眼睛落点（初版 2.4 秒全金太突兀，同日晚改淡＋缩短）。阅读器真正渲染（renderReaderBody
   * 同 id）才武装；标记页/每日推荐等其他入口直达不经捕获，返回不变。 */
  var libReturn = null;
  function libCapture(id, el) {
    if (!id || !el || !el.closest) return;
    var kind = null;
    if (el.closest('#jing-results')) kind = 'search';
    else if (el.closest('#jing-list')) kind = 'catalog';
    if (!kind) return; /* 标记页等来路不记，维持既有返回 */
    libReturn = { id: id, kind: kind, scrollY: window.scrollY || window.pageYOffset || 0, armed: false };
    /* 与文库视图记忆统一：目录来路的滚动位同步入存档，切 Tab 回来落点与读完返回一致 */
    if (kind === 'catalog') {
      var lv = libViewLoad(); lv.y = libReturn.scrollY; libView = lv; libViewPersist();
    }
  }
  window.__wuriLibCapture = libCapture;
  function libRestore(lr) {
    if (!lr || !lr.armed) return;
    var host = document.querySelector(lr.kind === 'search' ? '#jing-results' : '#jing-list');
    var other = document.querySelector(lr.kind === 'search' ? '#jing-list' : '#jing-results');
    if (!host) return;
    /* 来源面恢复（与 search() 的 list/results 互斥口径一致） */
    host.hidden = false;
    if (other) other.hidden = true;
    var marksEl = $('#jing-marks');
    if (marksEl) marksEl.hidden = true;
    var el = host.querySelector('[data-jing="' + lr.id + '"],[data-dz-work="' + lr.id + '"]');
    if (el) {
      /* 祖先折叠兜底展开：内丹架 / 全藏分类 / 全藏折叠体 */
      var ndBody = el.closest('.jing-neidan-body');
      if (ndBody && ndBody.hidden) ndBody.hidden = false;
      var dzWorks = el.closest('.dz-works');
      if (dzWorks && dzWorks.hidden) dzWorks.hidden = false;
      var dzBody = el.closest('[data-dz-body]');
      if (dzBody && dzBody.hidden) dzBody.hidden = false;
    }
    var apply = function () {
      window.scrollTo(0, lr.scrollY);
      if (!el) return;
      /* 高亮守卫：搜索结果会在全文命中到齐时重渲一次（节点被换），
         1.0 秒内周期复查、节点被换就给新节点补上描边（冒烟实证竞态）；
         描边动画本体 1.5 秒（CSS libRetHl），复查窗＋移除延时与之对齐（合计 1.5 秒收尾） */
      var t0 = Date.now();
      var tick = function () {
        var cur = host.querySelector('[data-jing="' + lr.id + '"],[data-dz-work="' + lr.id + '"]');
        if (cur && !cur.classList.contains('lib-ret-hl')) cur.classList.add('lib-ret-hl');
        if (Date.now() - t0 < 1000) setTimeout(tick, 250);
        else if (cur) setTimeout(function () { cur.classList.remove('lib-ret-hl'); }, 500);
      };
      tick();
    };
    if (window.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(apply); });
    else setTimeout(apply, 50);
  }

  /* ---------- 文库视图记忆（2026-10-27 用户诉求） ----------
   * 在道藏里展开某部、滚到深处，切去别的页再回经文页，不再被重置回
   * 常见经文最上方：记住离开时的整页滚动位＋道藏折叠/各部展开态＋内丹架
   * 展开态，回来自动复原。存档 localStorage wuri_lib_view_v1，冷启动同样
   * 恢复（daozang.js 载入时回灌展开态，滚动位于进经文 tab 时复原）。
   * 分工：从阅读器返回走上面的 v211 libRestore；切 Tab 返回走本节——两条
   * 路径落点一致。不入存：常见经文区收起态（进页默认展开，用户定）、
   * 搜索结果/标记页（临时面，resetToCatalog 仍回目录面）。 */
  var LIB_VIEW_KEY = 'wuri_lib_view_v1';
  var libView = null;
  function libViewLoad() {
    if (libView) return libView;
    try { libView = JSON.parse(localStorage.getItem(LIB_VIEW_KEY) || 'null'); } catch (e) { libView = null; }
    if (!libView || typeof libView !== 'object') libView = {};
    return libView;
  }
  function libViewPersist() {
    try { localStorage.setItem(LIB_VIEW_KEY, JSON.stringify(libViewLoad())); } catch (e) {}
  }
  function libListVisible() {
    var tab = document.getElementById('tab-jing');
    var list = document.getElementById('jing-list');
    var reader = document.getElementById('jing-reader');
    return !!(tab && tab.classList.contains('active') && list && !list.hidden
      && reader && reader.hidden);
  }
  /* 采集当前视图并落盘（app.js 离开经文 tab 时调用＋滚动/展开变化时自存） */
  function libSaveView() {
    var st = libViewLoad();
    if (libListVisible()) st.y = window.scrollY || window.pageYOffset || 0;
    try { var dz = window.__wuri_dzGetState && window.__wuri_dzGetState(); if (dz) st.dz = dz; } catch (e) {}
    var nd = document.querySelector('.jing-neidan-body');
    if (nd) st.nd = !nd.hidden;
    libView = st; libViewPersist();
  }
  window.__wuriLibSaveView = libSaveView;
  /* 复原视图；返回 true 表示滚动有人接管（app.js 不再 scrollTo(0,0)） */
  function libApplyView() {
    var st = libViewLoad();
    var has = (typeof st.y === 'number' && st.y > 0)
      || !!(st.dz && (st.dz.open || (st.dz.bu && Object.keys(st.dz.bu).length)))
      || !!st.nd;
    if (st.nd) {
      var nd = document.querySelector('.jing-neidan-body');
      if (nd) nd.hidden = false;
    }
    if (st.dz && window.__wuri_dzSetState) { try { window.__wuri_dzSetState(st.dz); } catch (e) {} }
    if (typeof st.y === 'number' && st.y > 0) {
      var target = st.y, tries = 0, cancelled = false;
      var cancel = function () { cancelled = true; };
      window.addEventListener('wheel', cancel, { passive: true, once: true });
      window.addEventListener('touchmove', cancel, { passive: true, once: true });
      var apply = function () {
        if (cancelled) return;
        window.scrollTo(0, target);
        /* 道藏目录异步加载会继续长高，短时内复断言直至落位（用户手动滚动即让路） */
        if (Math.abs((window.scrollY || 0) - target) > 4 && tries++ < 8) setTimeout(apply, 250);
      };
      if (window.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(apply); });
      else setTimeout(apply, 50);
    }
    return has;
  }
  /* 列表面滚动时节流自存（切页/冷启回来都有最新落点） */
  var libSaveT = null;
  window.addEventListener('scroll', function () {
    if (!libListVisible() || libSaveT) return;
    libSaveT = setTimeout(function () { libSaveT = null; libSaveView(); }, 250);
  }, { passive: true });
  window.addEventListener('pagehide', function () { if (libListVisible()) libSaveView(); });

  /* ---------- 从阅读页进/出我的标记（2026-10-28 晚反馈批第 6 条） ----------
   * 进：不关阅读器（currentId 与正文 DOM 原样保留），只记返回点、隐
   * 阅读器、显经文首页外壳后开标记页；出（标记页 ‹ 钮）：隐标记页、
   * 复原阅读器并滚回原位。标记页内点条目跳别的书时走 openReader，
   * hideMarks 会清返回点（见标记页 IIFE），不会误回旧书 */
  window.__wuriOpenMarksFromReader = function (tab) {
    if (!currentId) { if (window.__wuriOpenMarks) window.__wuriOpenMarks(tab); return; }
    var rt = { id: currentId, y: window.scrollY };
    window._marksReturn = rt;
    saveProgressNow();
    var reader = $('#jing-reader'); if (reader) reader.hidden = true;
    var home = $('#jing-home'); if (home) home.hidden = false;
    document.body.classList.remove('reader-open');
    document.body.classList.remove('jing-immersive');
    try { window.scrollTo(0, 0); } catch (e) {}
    if (window.__wuriOpenMarks) window.__wuriOpenMarks(tab);
    syncDockPlayUI(_dockState); /* 阅读器已隐：胶囊不冒头 */
  };
  window.__wuriReturnToReader = function () {
    var rt = window._marksReturn;
    window._marksReturn = null;
    if (!rt || !currentId || rt.id !== currentId) return false;
    var marks = $('#jing-marks'); if (marks) marks.hidden = true;
    var home = $('#jing-home'); if (home) home.hidden = true;
    var reader = $('#jing-reader'); if (reader) reader.hidden = false;
    document.body.classList.add('reader-open');
    var tries = 0;
    var restore = function () {
      tries++;
      try { window.scrollTo(0, rt.y); } catch (e) {}
      var okPos = Math.abs(window.scrollY - rt.y) <= 2;
      if (!okPos && tries < 8) setTimeout(restore, 120);
      else updateReadUI();
    };
    requestAnimationFrame(restore);
    syncDockPlayUI(_dockState);
    return true;
  };

  function closeReader() {
    stopTtsOnly(); // 只停系统 TTS，后台 MP3 服务交给悬浮岛（回经文 tab 不停播）
    // 跟读模式随阅读器关闭而关闭（避免切经文后映射错乱）
    if (followMode) toggleFollow();
    // 自动位置记忆：退出时存当前落点＋展开卷次，重进回到此处（与书签分开存）
    if (currentId && !$('#jing-reader').hidden) {
      saveAutoPos(currentId, window.scrollY || window.pageYOffset || 0, collectExpandedSecs());
      saveProgressNow();
    }
    var _sb = $('#jing-statusbar'); if (_sb) _sb.hidden = true;
    window._marksReturn = null; /* 真关阅读器：标记页返回链随之作废 */
    document.body.classList.remove('jing-immersive');
    document.body.classList.remove('reader-open');
    closeToc();
    var _dc = $('#dict-card'); if (_dc) _dc.hidden = true;
    var _df = $('#dict-fab'); if (_df) _df.hidden = true;
    currentId = null;
    window._jingCurrentId = null;
    $('#jing-reader').hidden = true;
    _jumpInsist = null;
    closeDockPanels();
    document.body.style.overflow = '';
    $('#jing-home').hidden = false;
    var lr = libReturn; libReturn = null;
    libRestore(lr);
    /* 回列表即刷新行进度徽标（刚读的书立刻见新进度） */
    try { decorateReadProgress(); } catch (e) {}
  }

  /* 重置回目录页（问题1修复：进经文tab时调用）
     返回值：true＝滚动已由 v211 返回定位或视图记忆接管，app.js 不再归零 */
  function resetToCatalog() {
    dzPreload(); /* 进文库即预加载全藏书名索引，检索书名阶段不等临查现拉 */
    var lrArmed = !!(libReturn && libReturn.armed);
    closeReader();
    // 阻止待处理的标记页刷新
    if (window._refreshMarks) window._refreshMarks = null;
    window._jingMarksUserRequested = false;
    var listEl = $('#jing-list');
    var marksEl = $('#jing-marks');
    var resultsEl = $('#jing-results');
    if (listEl) listEl.hidden = false;
    if (marksEl) marksEl.hidden = true;
    if (resultsEl) resultsEl.hidden = true;
    // 「常见经文」每次进页默认展开（收起不持久化）
    commonCollapsed = false;
    var csec = document.querySelector('[data-common-sec]');
    if (csec) {
      csec.classList.remove('collapsed');
      var cbody = csec.querySelector('.jing-common-body');
      if (cbody) cbody.hidden = false;
    }
    refreshMarksRow();
    // 清空搜索框
    var q = $('#jing-q');
    if (q) { q.value = ''; }
    var qClear = $('#jing-q-clear');
    if (qClear) qClear.hidden = true;
    /* 视图记忆复原：v211 已武装时以其为准（closeReader 内 libRestore），不叠加 */
    if (lrArmed) return true;
    return libApplyView();
  }

  /* 当前书注音能力：已载段落任一段 py 含非空拼音即有（数据驱动，不设
     书名名单）。懒载书以已填卷为准——首卷开卷时已注音，足够判定 */
  function bookHasPy() {
    var d = currentId && window.JINGWEN && JINGWEN[currentId];
    if (!d || !d.sections) return false;
    for (var si = 0; si < d.sections.length; si++) {
      var ps = d.sections[si].paras || [];
      for (var pi = 0; pi < ps.length; pi++) {
        var py = ps[pi] && ps[pi].py;
        if (py) for (var k = 0; k < py.length; k++) if (py[k]) return true;
      }
    }
    return false;
  }

  function applyReaderPrefs() {
    /* 平板/宽屏（≥768）：同档位字号 +2px 联动（版心限宽见 style.css 媒体查询） */
    var effPx = fontPx + ((window.innerWidth || 0) >= 768 ? 2 : 0);
    $('#jing-content').style.fontSize = effPx + 'px';
    /* 字体/行距（批一）：类开关挂在 #jing-content，CSS 在 style.css 末尾
       rp-ff 与 rp-lh 两段；宋体＝默认 var(--serif) 栈不挂类 */
    var jcF = $('#jing-content');
    if (jcF) {
      jcF.classList.toggle('rp-ff-kai', fontFam === 'kai');
      jcF.classList.toggle('rp-ff-hei', fontFam === 'hei');
      jcF.classList.toggle('rp-lh-tight', lhMode === 'tight');
      jcF.classList.toggle('rp-lh-wide', lhMode === 'wide');
    }
    syncFontPanel();
    var pyBtn = $('#jing-pybtn');
    /* 注音钮按书的注音能力显隐（2026-10-29 07:08 用户定版，supersede
       v318 的全书类恒显与更早的书类名单口径）：以当前书已载段落的 py
       数据判定——任一段含非空拼音即有能力。内丹诸书 py 键在而全空
       （实测 s18/s19/s23/s41 非空段数均为 0）→钮撤下；常见经文与道藏
       （字典注音非空）→显示。showPy 不再按书类抑制：有数据才渲染得
       出，无数据恒无 rt，呈现与能力天然一致 */
    if (pyBtn) pyBtn.hidden = !bookHasPy();
    var showPy = pyOn;
    $('#jing-content').classList.toggle('no-py', !showPy);
    /* 动作标签（2026-10-28 晚用户亲定）：钮面＝点了会发生什么——拼音
       正显示时钮写「注音关」（点了关掉），关着时写「注音开」 */
    if (pyBtn) pyBtn.textContent = pyOn ? '注音关' : '注音开';
    $('#jing-content').classList.toggle('recite-on', reciteMode);
    var rb = $('#jing-recite');
    if (rb) rb.textContent = reciteMode ? t('jing_recite_on') : t('jing_recite');
    if (rb) rb.classList.toggle('active', reciteMode);
  }
  /* ---------- 字体版式（批一第 2 项）：字号滑杆/字体/行距 ---------- */
  function setFontPx(px) {
    px = Math.max(14, Math.min(30, Math.round(px) || 17));
    fontPx = px;
    try { localStorage.setItem('wuri_jing_font', fontPx); } catch (e) {}
    applyReaderPrefs();
  }
  function setFontFam(v) {
    if (v !== 'kai' && v !== 'hei') v = 'song';
    fontFam = v;
    try { localStorage.setItem('wuri_jing_ff', v); } catch (e) {}
    applyReaderPrefs();
  }
  function setLhMode(v) {
    if (v !== 'tight' && v !== 'wide') v = 'mid';
    lhMode = v;
    try { localStorage.setItem('wuri_jing_lh', v); } catch (e) {}
    applyReaderPrefs();
  }
  function syncFontPanel() {
    var r = document.getElementById('jing-font-range');
    if (r && +r.value !== fontPx) r.value = fontPx;
    var val = document.getElementById('jing-font-val');
    if (val) val.textContent = fontPx;
    document.querySelectorAll('#jing-font-panel [data-ff]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-ff') === fontFam);
    });
    document.querySelectorAll('#jing-font-panel [data-lh]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lh') === lhMode);
    });
  }

  /* ---------- 自动滚动（批二第 6 项） ----------
   * 匀速滚动：慢 24px/s、中 48px/s（起步值）；手指触碰正文或滚轮即停；
   * 到底自停；开关不持久化、速度档持久化（wuri_jing_as_speed）。
   * 跟读优先：跟读中拒绝启动；滚动途中跟读开启则 tick 内立即停。 */
  var asOn = false, asRaf = 0, asLast = 0, asStartTs = 0, asAcc = 0, asSpeedMode = 'slow';
  try { asSpeedMode = localStorage.getItem('wuri_jing_as_speed') || 'slow'; } catch (e) {}
  if (asSpeedMode !== 'mid') asSpeedMode = 'slow';
  function asPxPerSec() { return asSpeedMode === 'mid' ? 48 : 24; }
  function asSyncBtn() {
    var b = document.getElementById('jing-scroll-toggle');
    if (b) b.textContent = asOn ? '停' : '开';
    document.querySelectorAll('#jing-font-panel [data-as-spd]').forEach(function (x) {
      x.classList.toggle('active', x.getAttribute('data-as-spd') === asSpeedMode);
    });
  }
  function asStop() {
    asOn = false;
    if (asRaf) cancelAnimationFrame(asRaf);
    asRaf = 0;
    asSyncBtn();
  }
  function asTick(ts) {
    if (!asOn) return;
    if (followMode || !currentId) { asStop(); return; }
    var rd = document.getElementById('jing-reader');
    if (!rd || rd.hidden) { asStop(); return; }
    if (!asStartTs) asStartTs = ts;
    if (asLast) {
      var dt = Math.min(100, ts - asLast) / 1000;
      if (dt > 0) {
        /* 亚像素步进会被浏览器量化丢弃（实测 60×0.4px 纹丝不动）：
           分数像素在 JS 里攒，满 1px 才整步滚 */
        asAcc += asPxPerSec() * dt;
        if (asAcc >= 1) {
          var dy = Math.floor(asAcc);
          asAcc -= dy;
          window.scrollBy(0, dy);
        }
      }
      var de = document.documentElement;
      /* 到底自停；启动 800ms 内不判（布局未稳时 scrollHeight 不可信） */
      if (ts - asStartTs > 800 && window.scrollY + window.innerHeight >= de.scrollHeight - 2) { asStop(); return; }
    }
    asLast = ts;
    asRaf = requestAnimationFrame(asTick);
  }
  function asStart() {
    if (followMode) { if (window.showToast) showToast('跟读进行中，自动滚动不可用'); return; }
    asOn = true;
    asLast = 0;
    asStartTs = 0;
    asAcc = 0;
    asSyncBtn();
    asRaf = requestAnimationFrame(asTick);
  }
  window.__wuriAutoScroll = {
    start: asStart, stop: asStop,
    on: function () { return asOn; },
    setSpeed: function (m) {
      asSpeedMode = m === 'mid' ? 'mid' : 'slow';
      try { localStorage.setItem('wuri_jing_as_speed', asSpeedMode); } catch (e) {}
      asSyncBtn();
    }
  };
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('jing-scroll-toggle');
    if (b) b.addEventListener('click', function () { if (asOn) asStop(); else asStart(); });
    document.querySelectorAll('#jing-font-panel [data-as-spd]').forEach(function (x) {
      x.addEventListener('click', function () { window.__wuriAutoScroll.setSpeed(x.getAttribute('data-as-spd')); });
    });
    var content = document.getElementById('jing-content');
    if (content) {
      content.addEventListener('touchstart', function () { if (asOn) asStop(); }, { passive: true });
      content.addEventListener('wheel', function () { if (asOn) asStop(); }, { passive: true });
    }
    asSyncBtn();
  });

  function toggleRecite() {
    reciteMode = !reciteMode;
    try { localStorage.setItem('wuri_jing_recite', reciteMode ? '1' : '0'); } catch (e) {}
    // 重新渲染当前经文
    if (currentId) openReader(currentId);
    else applyReaderPrefs();
  }

  /* ---------- 跟读模式 ---------- */
  // 文本归一化：去空白、去（安奉）等朗读时省略的标注
  function normFollowText(s) {
    return String(s || '').replace(/\s+/g, '')
      .replace(/[（(]安奉[)）]/g, '').replace(/[（(]坛[)）]/g, '')
      .replace(/[（(]敲磬[)）]/g, '');
  }
  // 构建时间戳段落 -> 阅读器段落元素的映射（顺序贪心对齐，容忍跳段）
  function buildFollowMap() {
    followMap = null; followElToTs = null;
    var ts = jingTimestamps;
    if (!ts || !ts.segments || !ts.segments.length) return false;
    // 从数据模型取纯文本（DOM 的 textContent 会混入注音拼音，导致匹配失败）
    var d = window.JINGWEN && window.JINGWEN[currentId];
    if (!d || !d.sections) return false;
    var flat = []; // {sec, para, text}
    d.sections.forEach(function (sec, si) {
      (sec.paras || []).forEach(function (p, pi) {
        flat.push({ sec: si, para: pi, text: normFollowText(p.t) });
      });
    });
    if (!flat.length) return false;
    var map = {}, elToTs = new Map();
    var rIdx = 0;
    for (var tIdx = 1; tIdx < ts.segments.length; tIdx++) { // 跳过 para 0（标题）
      var tNorm = normFollowText(ts.segments[tIdx].text);
      if (!tNorm) continue;
      var found = -1;
      // 在 reader 中从 rIdx 起向后找（窗口 8 段，容忍音频跳过个别标注段）
      for (var j = rIdx; j < Math.min(rIdx + 8, flat.length); j++) {
        var rT = flat[j].text;
        if (!rT) continue;
        // 取前 12 字比较，任一包含任一即算匹配
        var a = tNorm.slice(0, 12), b = rT.slice(0, 12);
        if ((a && b) && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0 || a === b)) { found = j; break; }
      }
      if (found >= 0) {
        // 按 data-sec/data-para 找 DOM 元素
        var el = document.querySelector('#jing-content .jing-para[data-sec="' + flat[found].sec + '"][data-para="' + flat[found].para + '"]');
        if (el) {
          map[tIdx] = { el: el, start: ts.segments[tIdx].start };
          elToTs.set(el, tIdx);
        }
        rIdx = found + 1;
      }
    }
    followMap = map; followElToTs = elToTs;
    return Object.keys(map).length > 0;
  }
  function toggleFollow() {
    /* 开关瞬间锚点保险（反馈批第 5 条）：高亮样式已改纯背景/字色（CSS
       侧不再改段落几何），此处再加位置双保险——记切换前位置，切换后
       两拍复核、不等则复位；自动跟随滚动另有 playAdvancing 门（hlTick） */
    var y0 = window.scrollY;
    followMode = !followMode;
    var btn = $('#jing-follow');
    if (btn) btn.classList.toggle('on', followMode);
    $('#jing-content').classList.toggle('follow-on', followMode);
    if (followMode) {
      // 需要当前经文+声音的时间戳与段落映射（懒节书先填齐未填充卷）
      ensurePlayMap(function (ok) {
        if (!ok) {
          readerToast('该经文暂无分段朗读数据，跟读模式不可用');
          if (followMode) toggleFollow();
        }
      });
      startFollowTicker();
    } else {
      stopFollowTicker();
      clearFollowCur();
      /* 播放中退出跟读：句高亮由诵读驱动接棒，不随跟读一起熄 */
      if (_dockState !== 'idle') startSpeakTicker();
    }
    var restoreAnchor = function () {
      try {
        if (Math.abs(window.scrollY - y0) > 1) window.scrollTo(0, y0);
      } catch (e) {}
    };
    requestAnimationFrame(restoreAnchor);
    setTimeout(restoreAnchor, 80);
  }
  /* 播放是否真在推进（自动展开/跟随滚动的唯一许可）：开关瞬间或暂停态
     下位置只是残值，不得据此拽动视口（反馈批第 5 条） */
  function playAdvancing() {
    var b = bridge();
    if (b && typeof b.jingIsPlaying === 'function') { try { if (b.jingIsPlaying()) return true; } catch (e) {} }
    if (window._fpSid) return _dockState === 'playing';
    if (jingAudio && _jingSrc) { try { if (!jingAudio.paused && !jingAudio.ended) return true; } catch (e) {} }
    if (window.speechSynthesis) { try { if (speechSynthesis.speaking && !speechSynthesis.paused) return true; } catch (e) {} }
    return false;
  }
  function clearFollowCur() {
    if (_followCurEl) { _followCurEl.classList.remove('follow-cur'); _followCurEl = null; }
  }
  /* ---------- 播放位置双来源＋句高亮驱动（2026-10-28 晚回归修） ----------
   * v293 后句高亮丢失的根因：旧 ticker 的位置只取原生桥 jingPosition()，
   * 网页版 bridge() 恒为 null → 每拍直接 return、永不高亮；且 ticker 只
   * 在跟读模式启动，普通诵读从不驱动页内高亮。现行口径：位置双来源
   * （原生桥毫秒数 ?? 网页 jingAudio.currentTime），诵读/跟读任一播放
   * 都驱动；段所在节折叠着先展开（规格：读到哪节自动展开哪节，展开
   * 不打断播放）；停止/播完清高亮。 */
  var _speakTimer = null, _speakLastIdx = -1, _followLastIdx = -1;
  var _mapSid = null, _mapVoice = null, _mapRebuilding = false;
  function playPosSec() {
    var b = bridge();
    if (b && typeof b.jingPosition === 'function') {
      try { var p = b.jingPosition(); if (typeof p === 'number' && p >= 0) return p / 1000; } catch (e) {}
    }
    if (jingAudio && _jingSrc) {
      try { var ct = jingAudio.currentTime; if (typeof ct === 'number' && isFinite(ct)) return ct; } catch (e) {}
    }
    return null;
  }
  /* 确保当前书＋声线的段→段落映射可用（懒节书先把未填充卷填齐，元素
     齐了映射才完整；填充只补内容、节仍保持折叠态） */
  function ensurePlayMap(cb) {
    if (followMap && _mapSid === currentId && _mapVoice === getVoice()) { cb(true); return; }
    var sid = currentId, voice = getVoice();
    ensureTimestamps(sid, voice, function (ok) {
      if (!ok) { cb(false); return; }
      var d = window.JINGWEN && window.JINGWEN[sid];
      if (d && d.lazy && window.__wuri_dzFill) {
        document.querySelectorAll('#jing-content .jing-sec-body[data-lazy]').forEach(function (bEl) {
          try { window.__wuri_dzFill(+bEl.parentNode.getAttribute('data-sec')); } catch (e) {}
        });
      }
      var built = buildFollowMap();
      if (built) { _mapSid = sid; _mapVoice = voice; }
      cb(built);
    });
  }
  function hlTick(kind) {
    if (kind === 'follow') { if (!followMode) { stopFollowTicker(); return; } }
    else if (_dockState === 'idle') { stopSpeakTicker(); return; }
    if (!followMap || !jingTimestamps || !jingTimestamps.segments) return;
    var posSec = playPosSec();
    if (posSec == null) return;
    var ts = jingTimestamps.segments;
    var lo = 0, hi = ts.length - 1, ans = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (ts[mid].start <= posSec) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    var last = (kind === 'follow') ? _followLastIdx : _speakLastIdx;
    if (ans === last || !followMap[ans]) return;
    var el = followMap[ans].el;
    if (!el || !el.isConnected) {
      /* 重渲（注音切换/落色等）后映射元素失效：重建一次映射再继续 */
      if (!_mapRebuilding) {
        _mapRebuilding = true; _mapSid = null;
        ensurePlayMap(function () {
          _mapRebuilding = false;
          if (kind === 'follow') _followLastIdx = -1; else _speakLastIdx = -1;
        });
      }
      return;
    }
    if (kind === 'follow') _followLastIdx = ans; else _speakLastIdx = ans;
    /* 自动展开与跟随滚动只许在播放实际推进时发生（开关瞬间/暂停态的
       残值位置只更新高亮、不动版面与视口——反馈批第 5 条） */
    var advancing = playAdvancing();
    /* 播放自动展开：当前段所在节折叠着 → 先展开（懒节先填充）再高亮；
       只动该节，不打断播放、不跳位 */
    var body = el.closest ? el.closest('.jing-sec-body') : null;
    if (advancing && body && body.hidden) {
      if (body.hasAttribute('data-lazy') && window.__wuri_dzFill) {
        try { window.__wuri_dzFill(+el.getAttribute('data-sec')); } catch (e) {}
        var el2 = document.querySelector('#jing-content .jing-para[data-sec="' + el.getAttribute('data-sec') + '"][data-para="' + el.getAttribute('data-para') + '"]');
        if (el2) {
          el = el2; followMap[ans].el = el2;
          if (followElToTs) followElToTs.set(el2, ans);
          body = el2.closest ? el2.closest('.jing-sec-body') : body;
        }
      }
      if (body && body.hidden) { body.hidden = false; updateFoldBtn(); }
    }
    clearFollowCur();
    el.classList.add('follow-cur');
    _followCurEl = el;
    if (!advancing) return;
    // 温和跟随：只在段落不在视口内时滚动
    try {
      var r = el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 120) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    } catch (e) {}
  }
  /* 普通诵读的句高亮驱动（跟读走 startFollowTicker，同一 hlTick） */
  function startSpeakTicker() {
    stopSpeakTicker();
    if (followMode) return;
    ensurePlayMap(function (ok) {
      if (!ok || followMode || _dockState === 'idle') return;
      _speakLastIdx = -1;
      _speakTimer = setInterval(function () { hlTick('speak'); }, 500);
    });
  }
  function stopSpeakTicker() {
    if (_speakTimer) { clearInterval(_speakTimer); _speakTimer = null; }
  }
  /* ---------- 播放态呈现（2026-10-28 晚反馈批第 4 条改版） ----------
   * 底栏主行恒定不换排（播放中照样能开字/注音面板）；暂停/继续＋停止
   * 改走半透明悬浮胶囊 #jing-play-fab（可拖动、位置持久化，拖动装配
   * 在 init 里走 __wuriMakeDraggable）；停止/播完 → 胶囊消失。
   * 阅读器关闭时胶囊不冒头（后台续播由悬浮播放岛接管呈现）。 */
  var _dockState = 'idle';
  function syncDockPlayUI(state) {
    _dockState = state;
    var cap = document.getElementById('jing-play-fab');
    var reader = document.getElementById('jing-reader');
    if (cap) {
      cap.hidden = (state === 'idle' || !reader || reader.hidden);
      /* 拖后位置可能超出当前视口（转屏/换设备）：显示时钳回屏内 */
      if (!cap.hidden && cap.style.left) {
        var cw = cap.offsetWidth || 150, ch = cap.offsetHeight || 48;
        var cx = parseFloat(cap.style.left) || 0, cy = parseFloat(cap.style.top) || 0;
        cap.style.left = Math.max(4, Math.min(cx, window.innerWidth - cw - 4)) + 'px';
        cap.style.top = Math.max(4, Math.min(cy, window.innerHeight - ch - 4)) + 'px';
      }
    }
    var pz = document.getElementById('jing-pause');
    if (pz) pz.textContent = (state === 'paused') ? '继续' : '暂停';
  }
  function dockPauseToggle() {
    if (_dockState === 'idle') return;
    var b = bridge();
    if (_dockState === 'paused') {
      if (b && window._fpSid) svcResume();
      else if (jingAudio && _jingSrc) {
        var p = null;
        try { p = jingAudio.play(); } catch (e) {}
        if (p && p.catch) p.catch(function () {});
      }
      else if (b && typeof b.ttsResume === 'function') { try { b.ttsResume(); } catch (e) {} }
      else if (window.speechSynthesis && speechSynthesis.paused) { try { speechSynthesis.resume(); } catch (e) {} }
      syncDockPlayUI('playing');
    } else {
      if (b && window._fpSid) svcPause();
      else if (jingAudio && _jingSrc && !jingAudio.paused) { try { jingAudio.pause(); } catch (e) {} }
      else if (b && typeof b.ttsPause === 'function') { try { b.ttsPause(); } catch (e) {} }
      else if (window.speechSynthesis && speechSynthesis.speaking) { try { speechSynthesis.pause(); } catch (e) {} }
      syncDockPlayUI('paused');
    }
  }
  function closeDockPanels() {
    var pp = document.getElementById('jing-play-panel');
    if (pp) pp.hidden = true;
    var fp = document.getElementById('jing-font-panel');
    if (fp) fp.hidden = true;
    var rb = document.getElementById('jing-read-btn');
    if (rb) { rb.setAttribute('aria-expanded', 'false'); rb.classList.remove('on'); }
    var fb = document.getElementById('jing-font-btn');
    if (fb) { fb.setAttribute('aria-expanded', 'false'); fb.classList.remove('on'); }
  }
  // 跟读点播：点段落 -> 跳到该段时间戳并播放
  function followSeek(el) {
    if (!followElToTs) return;
    var tIdx = followElToTs.get(el);
    if (tIdx == null || !followMap[tIdx]) return;
    var startSec = followMap[tIdx].start || 0;
    var b = bridge();
    var playing = false;
    try { playing = b && typeof b.jingIsPlaying === 'function' && b.jingIsPlaying(); } catch (e) {}
    if (playing && b && typeof b.jingSeekTo === 'function') {
      try { b.jingSeekTo(Math.floor(startSec * 1000)); } catch (e) {}
    } else {
      // 未播放：从该处开始播
      playJingAudio(currentId, startSec);
    }
    // 立即高亮该段
    clearFollowCur();
    el.classList.add('follow-cur');
    _followCurEl = el;
  }
  // 播放时轮询：根据播放位置高亮当前段并跟随滚动（hlTick 双来源驱动，
  // 网页版同样有效——旧实现只认原生桥位置、网页版每拍空转，是 v293 后
  // 句高亮在网页版丢失的根因）
  function startFollowTicker() {
    stopFollowTicker();
    _followLastIdx = -1;
    _followTimer = setInterval(function () { hlTick('follow'); }, 800);
  }
  function stopFollowTicker() {
    if (_followTimer) { clearInterval(_followTimer); _followTimer = null; }
  }

  /* ---------- 检索 ---------- */
  /* 2026-10-26 三修（用户真机实测）：
   * ①分阶段出结果——精选别名/题名与全藏书名只依赖书名级索引，不再被
   *   ensureAll（精选全文顺序加载，KR 指针条目跳过）阻塞，书名命中先行渲染，全文命中随后并入；
   * ②时序令牌——每次查询自增 seq，异步回调渲染前先验令牌，旧查询结果一律
   *   丢弃（此前连查时上一查结果会串到下一查名下：搜「度人经」冒出「道德经」）；
   * ③索引未就绪/阶段未齐时显示「检索中…」，不先报空；
   * ④输入防抖 150ms（监听处）；全藏书名索引在进文库/聚焦检索框时预加载，
   *   解析结果驻 daozang.js 模块缓存，二次查询走内存。 */
  var searchSeq = 0;
  var searchTimer = null;
  function dzPreload() {
    if (window.__wuri_dzPreload) { try { window.__wuri_dzPreload(); } catch (e) {} }
  }
  /* 精选题名/别名命中：只用 JINGWEN_INDEX 的题名（目录同源），不等正文加载 */
  function searchAliasHits(q) {
    var hits = [];
    (window.JINGWEN_INDEX || []).forEach(function (it) {
      var aliases = JING_ALIAS[it.id] || [];
      var title = it.title || '';
      var hit = title.indexOf(q) >= 0;
      if (!hit && window.t2s) { try { hit = window.t2s(title).indexOf(q) >= 0; } catch (e) {} }
      if (!hit && window.s2t) { try { hit = window.s2t(title).indexOf(q) >= 0; } catch (e) {} }
      if (!hit) {
        for (var i = 0; i < aliases.length; i++) {
          if (aliases[i].indexOf(q) >= 0 || q.indexOf(aliases[i]) >= 0) { hit = true; break; }
        }
      }
      if (hit) hits.push({ id: it.id, title: title, sec: '', si: -1, snip: '（' + aliases.join('、') + '）', isAlias: true });
    });
    return hits;
  }
  /* 精选全文命中：正文已全部加载后才可扫（ensureAll 完成后调用） */
  function searchTextHits(q) {
    var out = [];
    (window.JINGWEN_INDEX || []).forEach(function (it) {
      var d = window.JINGWEN[it.id];
      if (!d) return;
      d.sections.forEach(function (sec, si) {
        sec.paras.forEach(function (p, pi) {
          if (!p.t) return; /* 图版段无正文不参与全文检索 */
          var i = p.t.indexOf(q);
          /* 简繁归一兜底（2026-10-29）：转换等长、命中下标可直接投影回原文切片——
           * 简体查询命中繁体底本（t2s 归一）、繁体查询命中简体底本（s2t 归一） */
          if (i < 0 && window.t2s) { try { i = window.t2s(p.t).indexOf(window.t2s(q)); } catch (e) {} }
          if (i < 0 && window.s2t) { try { i = window.s2t(p.t).indexOf(q); } catch (e) {} }
          if (i >= 0) {
            var s = Math.max(0, i - 14), e = Math.min(p.t.length, i + q.length + 14);
            var snip = (s > 0 ? '…' : '') + p.t.slice(s, e) + (e < p.t.length ? '…' : '');
            var seg = p.t.substr(i, q.length);
            snip = esc(snip).replace(esc(seg), '<b>' + esc(seg) + '</b>');
            out.push({ id: it.id, title: d.title, sec: sec.h || '', si: si, snip: snip });
          }
        });
      });
    });
    return out;
  }
  function search(q) {
    q = (q || '').trim();
    var mySeq = ++searchSeq;
    var box = $('#jing-results');
    if (!q) { box.hidden = true; $('#jing-list').hidden = false; return; }
    $('#jing-list').hidden = true;
    box.hidden = false;
    box.innerHTML = '<p class="hint">检索中…</p>';
    dzPreload();
    var st = { alias: searchAliasHits(q), dz: null, text: null, dzt: null, dztTrunc: false, dztShort: false };
    function render() {
      if (mySeq !== searchSeq) return; /* 旧查询结果：一律丢弃 */
      var pending = (st.dz === null || st.text === null || st.dzt === null);
      var nameHits = st.alias.concat(st.dz || []);
      var total = nameHits.length + (st.text || []).length + (st.dzt || []).length;
      if (!total) {
        box.innerHTML = pending
          ? '<p class="hint">检索中…</p>'
          : '<p class="hint">未找到「' + esc(q) + '」</p>';
        return;
      }
      function jingRow(r) {
        return '<div class="jing-res" data-jing="' + r.id + '" data-sec="' + r.si + '">'
          + '<div class="jing-res-t">' + esc(r.title) + (r.sec ? ' · ' + esc(r.sec) : '') + '</div>'
          + '<div class="jing-res-s">' + r.snip + '</div></div>';
      }
      /* 分组呈现（批一第 1 项）：书名／精选正文／道藏正文口径分明 */
      var html = '<div class="jing-res-count">共 ' + total + ' 条'
        + (pending ? '（全文检索中…）' : '') + '</div>';
      if (nameHits.length) {
        html += '<div class="jing-res-group">书名</div>' + nameHits.slice(0, 60).map(function (r) {
          if (r.dz) {
            return '<div class="jing-res" data-dz-work="' + r.id + '">'
              + '<div class="jing-res-t">' + esc(txScript(r.title)) + '</div>'
              + '<div class="jing-res-s">' + esc(txScript(r.snip)) + '</div></div>';
          }
          return jingRow(r);
        }).join('');
      }
      if (st.text && st.text.length) {
        html += '<div class="jing-res-group">精选正文</div>' + st.text.slice(0, 120).map(jingRow).join('');
      }
      if (st.dzt && st.dzt.length) {
        html += '<div class="jing-res-group">道藏正文</div>' + st.dzt.map(function (r) {
          return '<div class="jing-res" data-dz-work="' + r.id + '" data-dz-off="' + r.off + '">'
            + '<div class="jing-res-t">' + esc(txScript(r.title)) + (r.sec ? ' · ' + esc(txScript(r.sec)) : '') + '</div>'
            + '<div class="jing-res-s">' + esc(txScript(r.snip)) + '</div></div>';
        }).join('') + (st.dztTrunc ? '<p class="hint">命中过多，仅显示前一部分</p>' : '');
      }
      if (st.dztShort) html += '<p class="hint">道藏正文搜索至少输入 2 个字</p>';
      box.innerHTML = html;
    }
    render();
    /* 统一检索：精选（题名/别名＋全文）＋道藏全集（书名，经 daozang.js 钩子）一处搜全 */
    if (window.__wuri_dzTitleSearch) {
      var dzDone = false;
      var dzFinish = function (hits) { if (!dzDone) { dzDone = true; st.dz = hits || []; render(); } };
      try { window.__wuri_dzTitleSearch(q, dzFinish); } catch (e) { dzFinish([]); }
      setTimeout(function () { dzFinish([]); }, 4000);
    } else { st.dz = []; render(); }
    /* 道藏正文（批一第 1 项②）：bigram 索引钩子，20 秒超时兜底 */
    if (window.__wuri_dzTextSearch) {
      var dztDone = false;
      var dztFinish = function (res) {
        if (dztDone) return;
        dztDone = true;
        if (mySeq !== searchSeq) return;
        st.dzt = (res && res.hits) || [];
        st.dztTrunc = !!(res && res.truncated);
        st.dztShort = !!(res && res.short);
        render();
      };
      try { window.__wuri_dzTextSearch(q, dztFinish); } catch (e) { dztFinish({ hits: [] }); }
      setTimeout(function () { dztFinish({ hits: [] }); }, 20000);
    } else { st.dzt = []; }
    ensureAll(function () {
      if (mySeq !== searchSeq) return;
      st.text = searchTextHits(q);
      render();
    });
  }

  /* ---------- 书内正文搜索（批一第 1 项①；第 0 步状态行搜索图标合流） ----------
   * 口径与图版锚点一致：段文先剥标点（jpStrip）再经 t2s 归一，询问同路
   * 归一——繁简/标点差异不挡命中，偏移恒在剥标点字序内、与底本 1:1。
   * 命中导航：展开/填充目标卷→滚到段→CSS Highlight API  paint 命中串
   * （不支持时退化为整段闪烁）。清除恢复原状。 */
  var findHits = [], findIdx = -1;
  function findNorm(s) {
    var st = jpStrip(String(s || ''));
    return window.t2s ? window.t2s(st) : st;
  }
  function clearFindPaint() {
    try {
      if (window.CSS && CSS.highlights) { CSS.highlights.delete('jingfindcur'); }
    } catch (e) {}
    document.querySelectorAll('#jing-content .jing-para.find-flash').forEach(function (el) {
      el.classList.remove('find-flash');
    });
  }
  function clearFind() {
    findHits = []; findIdx = -1;
    clearFindPaint();
    var c = document.getElementById('jing-find-count');
    if (c) c.textContent = '';
  }
  function buildFindHits(q) {
    var d = window.JINGWEN && window.JINGWEN[currentId];
    var hits = [];
    if (!d || !d.sections || !q) return hits;
    var nq = findNorm(q);
    if (!nq) return hits;
    d.sections.forEach(function (sec, si) {
      (sec.paras || []).forEach(function (p, pi) {
        if (!p || p.img || p.t == null) return;
        var nt = findNorm(p.t);
        var from = 0;
        while (from <= nt.length - nq.length) {
          var i = nt.indexOf(nq, from);
          if (i < 0) break;
          hits.push({ sec: si, para: pi, s: i, e: i + nq.length });
          from = i + Math.max(1, nq.length);
        }
      });
    });
    return hits;
  }
  function findCountLabel() {
    var c = document.getElementById('jing-find-count');
    if (!c) return;
    if (!findHits.length) { c.textContent = '0 处'; return; }
    c.textContent = (findIdx + 1) + ' / ' + findHits.length + ' 处';
  }
  /* 剥标点字序 k → 显示串下标（与 dzCutIndex 同法） */
  function findCutIdx(t, k) {
    if (k <= 0) return 0;
    var c = 0;
    for (var i = 0; i < t.length; i++) {
      if (!jpIsPunct(t[i])) { if (c === k) return i; c++; }
    }
    return t.length;
  }
  function paintFindHit(el, h) {
    clearFindPaint();
    el.classList.add('find-flash');
    try {
      if (!(window.CSS && CSS.highlights && window.Highlight && window.Range)) return;
      var frag = document.createRange();
      frag.selectNodeContents(el);
      var clone = frag.cloneContents();
      clone.querySelectorAll('rt, rp').forEach(function (n) { n.remove(); });
      var disp = clone.textContent || '';
      var dS = findCutIdx(disp, h.s), dE = findCutIdx(disp, h.e);
      if (dE <= dS) return;
      /* DOM 文本节点序（排除 rt/rp）与 disp 同序，逐节点累计定位 */
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          return (n.parentElement && n.parentElement.closest('rt, rp')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      var acc = 0, sNode = null, sOff = 0, eNode = null, eOff = 0, node;
      while ((node = walker.nextNode())) {
        var len = node.nodeValue.length;
        if (sNode === null && acc + len > dS) { sNode = node; sOff = dS - acc; }
        if (acc + len >= dE) { eNode = node; eOff = dE - acc; break; }
        acc += len;
      }
      if (sNode && eNode) {
        var rg = document.createRange();
        rg.setStart(sNode, sOff);
        rg.setEnd(eNode, eOff);
        CSS.highlights.set('jingfindcur', new Highlight(rg));
      }
    } catch (e) {}
  }
  function findGo(i) {
    if (!findHits.length) { findCountLabel(); return; }
    findIdx = ((i % findHits.length) + findHits.length) % findHits.length;
    var h = findHits[findIdx];
    findCountLabel();
    if (window.__wuri_dzFill) { try { window.__wuri_dzFill(h.sec); } catch (e) {} }
    var secBody = document.querySelector('#jing-content .jing-sec[data-sec="' + h.sec + '"] .jing-sec-body');
    if (secBody && secBody.hidden) secBody.hidden = false;
    var tries = 0;
    (function attempt() {
      var el = document.querySelector('#jing-content .jing-para[data-sec="' + h.sec + '"][data-para="' + h.para + '"]');
      if (!el) { if (++tries < 10) setTimeout(attempt, 250); return; }
      if (window.__wuriReaderGoToPara && window.__wuriReaderGoToPara(el)) {}
      else el.scrollIntoView({ block: 'center' });
      setTimeout(function () { paintFindHit(el, h); }, 60);
    })();
  }
  function runFind() {
    var inp = document.getElementById('jing-find-q');
    var q = inp ? inp.value.trim() : '';
    clearFindPaint();
    findHits = buildFindHits(q);
    findIdx = -1;
    if (findHits.length) findGo(0);
    else findCountLabel();
  }
  function openFindBar() {
    closeDockPanels();
    var bar = document.getElementById('jing-findbar');
    if (!bar) return;
    bar.hidden = false;
    var inp = document.getElementById('jing-find-q');
    if (inp) {
      inp.focus();
      if (inp.value.trim()) runFind();
    }
  }
  function closeFindBar() {
    var bar = document.getElementById('jing-findbar');
    if (bar) bar.hidden = true;
    clearFind();
  }
  window.__wuriFind = {
    open: openFindBar, close: closeFindBar, go: findGo, run: runFind,
    hits: function () { return findHits; }, idx: function () { return findIdx; }
  };
  document.addEventListener('DOMContentLoaded', function () {
    var ico = document.getElementById('jing-find-ico');
    if (ico) ico.addEventListener('click', function (e) {
      e.stopPropagation(); /* 状态行本体点击开目录，图标只开搜索 */
      openFindBar();
    });
    var inp = document.getElementById('jing-find-q');
    if (inp) {
      var deb = null;
      inp.addEventListener('input', function () {
        if (deb) clearTimeout(deb);
        deb = setTimeout(runFind, 220);
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); findGo(findIdx + (e.shiftKey ? -1 : 1)); }
      });
    }
    var pv = document.getElementById('jing-find-prev');
    if (pv) pv.addEventListener('click', function () { findGo(findIdx - 1); });
    var nx = document.getElementById('jing-find-next');
    if (nx) nx.addEventListener('click', function () { findGo(findIdx + 1); });
    var cl = document.getElementById('jing-find-close');
    if (cl) cl.addEventListener('click', closeFindBar);
  });
  /* 道藏正文搜索命中跳转（批一第 1 项②）：结果行 data-dz-off 在捕获相位
     先记偏移（daozang.js 的开卷委托随后触发），开卷落位后轮询兑现 */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-dz-off]') : null;
    if (!el) return;
    var id = el.getAttribute('data-dz-work');
    var off = +el.getAttribute('data-dz-off');
    if (!id || !(off >= 0)) return;
    /* 全局偏移→（节序，节内偏移）：_metrics.cum 为各节起始偏移 */
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (window._jingCurrentId === id && _metrics && _metrics.total) {
        clearInterval(iv);
        var secIdx = secIdxAtOffset(off);
        var charOff = off - (_metrics.cum[secIdx] || 0);
        dzPollJump(id, secIdx, charOff, 60);
        /* 落位后给目标段一记闪烁（等懒填充把该节段落铺好） */
        var fTries = 0;
        var fIv = setInterval(function () {
          fTries++;
          var sec = document.querySelector('#jing-content .jing-sec[data-sec="' + secIdx + '"]');
          var body = sec && sec.querySelector('.jing-sec-body');
          var target = null;
          if (body && body.querySelector('p.jing-para')) {
            try { target = paraAtContentOff(body, charOff); } catch (err) {}
          }
          if (target) {
            clearInterval(fIv);
            target.classList.add('find-flash');
            setTimeout(function () { target.classList.remove('find-flash'); }, 1600);
          } else if (fTries > 40) clearInterval(fIv);
        }, 400);
      } else if (tries > 40) clearInterval(iv);
    }, 300);
  }, true);

  /* ---------- 系统朗读 TTS（批二第 7 项） ----------
   * 无双声录音的书经读面板「系统朗读」进入（面板分流在第 0 步搭好，
   * #jing-tts-btn 的点击在 init 里转到 window.__wuriTTSStart）。
   * 口径：朗读当前节（按当前偏移定节，懒载先填充）；逐句切分
   * （。！？；…），逐句以所在段落为高亮单位（.follow-cur 呈现，需
   * #jing-content 同挂 follow-on 类）并跟随滚动。推进以 utterance
   * 的 onend 为准、估时看门狗兜底：估时＝字数÷(4.2 字/秒×语速)，
   * 看门狗＝估时×1.6＋2 秒（下限 2.5 秒），防个别平台 onend 丢失
   * 卡死；boundary 事件各平台支持不一，不依赖。无中文语音时如实
   * toast 后以默认语音朗读。语速取读面板 #jing-tts-speed（持久化
   * wuri_jing_tts_rate），改速在下一句生效。沙箱无语音：只验调用链。 */
  var ttsState = null;
  function ttsPlain(el) {
    var r = document.createRange();
    r.selectNodeContents(el);
    return plainTextOfFrag(r.cloneContents());
  }
  function ttsSplitSentences(text) {
    var out = [], cur = '';
    for (var i = 0; i < text.length; i++) {
      cur += text[i];
      if ('。！？；…'.indexOf(text[i]) >= 0) { out.push(cur); cur = ''; }
    }
    if (cur) out.push(cur);
    return out;
  }
  var TTS_VOICE_KEY = 'wuri_jing_tts_voice';
  function ttsZhVoices() {
    var vs = [];
    try { vs = speechSynthesis.getVoices() || []; } catch (e) {}
    return vs.filter(function (v) { return /^zh/i.test(v.lang || ''); });
  }
  function ttsPickVoice() {
    /* 语音选择（反馈第二批第 5 项）：持久化 voiceURI 优先，失效回落首个
       中文语音；逐句调用，故面板改选下一句即生效。只按原名呈现、不贴
       男女等推断标签（选择列表在 ttsPopulateVoices） */
    var want = '';
    try { want = localStorage.getItem(TTS_VOICE_KEY) || ''; } catch (e) {}
    var all = [];
    try { all = speechSynthesis.getVoices() || []; } catch (e) {}
    if (want) for (var i = 0; i < all.length; i++) if (all[i].voiceURI === want) return all[i];
    var zh = ttsZhVoices();
    return zh.length ? zh[0] : null;
  }
  function ttsPopulateVoices() {
    var sel = document.getElementById('jing-tts-voice');
    var row = document.getElementById('jing-tts-voice-row');
    if (!sel) return;
    var zh = ttsZhVoices();
    if (row) row.hidden = !zh.length;
    if (!zh.length) { sel.innerHTML = ''; return; }
    var want = '';
    try { want = localStorage.getItem(TTS_VOICE_KEY) || ''; } catch (e) {}
    var cur = zh[0];
    sel.innerHTML = '';
    zh.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = v.name; // 照原名显示，不加任何推断标签
      sel.appendChild(o);
      if (v.voiceURI === want) cur = v;
    });
    sel.value = cur.voiceURI;
  }
  function ttsSetBtn() {
    /* 面板钮与胶囊钮面三态同步（反馈第二批第 4 项）：未开始「系统朗读」／
       朗读中「暂停朗读」／已暂停「继续朗读」；胶囊暂停钮同理 */
    var b = document.getElementById('jing-tts-btn');
    var p = document.getElementById('jing-tts-pause');
    if (b) b.textContent = !ttsState ? '系统朗读' : (ttsState.paused ? '继续朗读' : '暂停朗读');
    if (p) p.textContent = ttsState && ttsState.paused ? '继续' : '暂停';
  }
  function ttsClampFab(el) {
    /* 与诵读胶囊 clampFabIntoView 同口径（彼在本文件另一作用域，此处本地实现） */
    if (!el || el.hidden) return;
    var x = parseFloat(el.style.left), y = parseFloat(el.style.top);
    if (!isFinite(x) || !isFinite(y)) return;
    var w = el.offsetWidth || 150, h = el.offsetHeight || 48;
    x = Math.max(4, Math.min(x, window.innerWidth - w - 4));
    y = Math.max(4, Math.min(y, window.innerHeight - h - 4));
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  function syncTtsFab() {
    var fab = document.getElementById('jing-tts-fab');
    if (fab) {
      fab.hidden = !ttsState;
      if (ttsState) ttsClampFab(fab);
    }
    ttsSetBtn();
  }
  function ttsStop() {
    var st = ttsState;
    ttsState = null;
    if (st && st.watchdog) clearTimeout(st.watchdog);
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    if (st && st.curEl) st.curEl.classList.remove('follow-cur');
    var jc = document.getElementById('jing-content');
    if (jc && !followMode) jc.classList.remove('follow-on');
    syncTtsFab();
  }
  function ttsPauseToggle() {
    /* 暂停不打乱状态机：gen++ 作废当前句的 onend/onerror 与看门狗，
       idx 停在本句；继续从本句句首重读、看门狗随 ttsSpeakNext 重装 */
    var st = ttsState;
    if (!st) return;
    if (!st.paused) {
      st.paused = true;
      st.gen = (st.gen || 0) + 1;
      if (st.watchdog) { clearTimeout(st.watchdog); st.watchdog = null; }
      try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    } else {
      st.paused = false;
      ttsSpeakNext();
    }
    syncTtsFab();
  }
  function ttsSpeakNext() {
    var st = ttsState;
    if (!st || st.paused) return;
    if (window._jingCurrentId !== st.book) { ttsStop(); return; }
    if (st.idx >= st.queue.length) {
      ttsStop();
      if (window.showToast) showToast('本节朗读完毕');
      return;
    }
    var item = st.queue[st.idx];
    if (st.curEl && st.curEl !== item.el) st.curEl.classList.remove('follow-cur');
    st.curEl = item.el;
    if (item.el) {
      item.el.classList.add('follow-cur');
      var r = item.el.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 120) item.el.scrollIntoView({ block: 'center' });
    }
    var u;
    try { u = new SpeechSynthesisUtterance(item.text); } catch (e) { ttsStop(); return; }
    u.lang = 'zh-CN';
    u.rate = st.rate || 1;
    var vNow = ttsPickVoice(); // 逐句取音：面板改选下一句起生效
    if (vNow) { try { u.voice = vNow; } catch (e) { /* 异常语音对象忽略 */ } }
    var gen = st.gen || 0;
    var advanced = false;
    var advance = function () {
      if (advanced || ttsState !== st || (st.gen || 0) !== gen) return;
      advanced = true;
      if (st.watchdog) { clearTimeout(st.watchdog); st.watchdog = null; }
      st.idx++;
      ttsSpeakNext();
    };
    u.onend = advance;
    u.onerror = advance;
    var estMs = (item.text.length / (4.2 * (st.rate || 1))) * 1000;
    st.watchdog = setTimeout(advance, Math.max(2500, estMs * 1.6 + 2000));
    try { speechSynthesis.speak(u); } catch (e) { advance(); }
  }
  function ttsStart() {
    if (ttsState) { ttsStop(); return; }
    if (!('speechSynthesis' in window)) { if (window.showToast) showToast('本设备不支持系统朗读'); return; }
    if (followMode) { if (window.showToast) showToast('跟读进行中，系统朗读不可用'); return; }
    var d = window.JINGWEN && JINGWEN[currentId];
    if (!d || !d.sections) return;
    var secIdx = 0;
    try { secIdx = secIdxAtOffset(currentContentOffset()); } catch (e) {}
    if (window.__wuri_dzFill) { try { window.__wuri_dzFill(secIdx); } catch (e) {} }
    var build = function () {
      var secEl = document.querySelector('#jing-content .jing-sec[data-sec="' + secIdx + '"]');
      var body = secEl && secEl.querySelector('.jing-sec-body');
      if (body && body.hidden) body.hidden = false;
      var queue = [];
      if (body) body.querySelectorAll('.jing-para').forEach(function (p) {
        ttsSplitSentences(ttsPlain(p)).forEach(function (s) {
          if (s.trim()) queue.push({ el: p, text: s });
        });
      });
      if (!queue.length) { if (window.showToast) showToast('本节暂无可朗读文字'); return; }
      ttsPopulateVoices();
      var zh = ttsPickVoice();
      if (!zh && !ttsZhVoices().length && window.showToast) showToast('未检测到中文语音，将用默认语音朗读');
      var rate = 1;
      try { rate = +localStorage.getItem('wuri_jing_tts_rate') || 1; } catch (e) {}
      var sel = document.getElementById('jing-tts-speed');
      if (sel && sel.value) rate = +sel.value || rate;
      try { speechSynthesis.cancel(); } catch (e) {}
      ttsState = { book: currentId, queue: queue, idx: 0, rate: rate, voice: zh, curEl: null, watchdog: null, gen: 0, paused: false };
      var jc = document.getElementById('jing-content');
      if (jc) jc.classList.add('follow-on');
      syncTtsFab();
      closeDockPanels();
      ttsSpeakNext();
    };
    if (d.lazy) setTimeout(build, 350); else build();
  }
  /* 面板钮三态：未开始→开始；朗读中→暂停；已暂停→继续（停止走胶囊或切书/关阅读器） */
  window.__wuriTTSStart = function () {
    if (!ttsState) { ttsStart(); return; }
    ttsPauseToggle();
  };
  window.__wuriTTSStop = ttsStop;
  window.__wuriTTSPauseToggle = ttsPauseToggle;
  window.__wuriTTSSetRate = function (r) { if (ttsState && r > 0) ttsState.rate = r; };
  window.__wuriTTSState = function () {
    return ttsState ? { on: true, paused: !!ttsState.paused, book: ttsState.book, idx: ttsState.idx, total: ttsState.queue.length } : { on: false };
  };
  window.__wuriTTSVoices = ttsPopulateVoices;

  /* ---------- MP3 诵读（Qwen3-TTS 预渲染） ---------- */
  var jingAudio = null;
  var _playToken = 0, _jingSrc = '', _playRetry = 0, _playErrToken = -1;
  var jingTimestamps = null;
  var jingTsSid = null, jingTsVoice = null; /* 时间戳所属经文+声音，避免跨经文错配 */
  function getVoice() {
    var sel = document.getElementById('jing-voice');
    return sel ? sel.value : 'male';
  }
  function loadTimestamps(sid, voice, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'audio/timestamps/' + sid + '_' + voice + '.json', true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { jingTimestamps = JSON.parse(xhr.responseText); jingTsSid = sid; jingTsVoice = voice; }
        catch (e) { jingTimestamps = null; jingTsSid = null; jingTsVoice = null; }
      } else { jingTimestamps = null; jingTsSid = null; jingTsVoice = null; }
      if (cb) cb();
    };
    xhr.onerror = function () { jingTimestamps = null; jingTsSid = null; jingTsVoice = null; if (cb) cb(); };
    xhr.send();
  }
  // 确保时间戳是当前经文+声音的，否则重载
  function ensureTimestamps(sid, voice, cb) {
    if (jingTimestamps && jingTsSid === sid && jingTsVoice === voice) { if (cb) cb(true); return; }
    loadTimestamps(sid, voice, function () { if (cb) cb(!!jingTimestamps); });
  }
  var JING_BASE = 'https://dennisdysb.github.io/wuri-web/www/audio/jing/';
  var JING_HAS_AUDIO = ['s01','s02','s03','s04','s05','s07','s09','s15','s10','s12','s13','s14','s16','s17','s26','s27','s28','s29','s30','s31','s32','s33','s35','s34','s36','s39',
    /* 2026-10-27 扩容常见经文配音：KR 指针挂架 8 部（键＝书架条目 id，与全藏同条目同呈现） */
    'KR5c0005','KR5c0002','KR5a0027','KR5a0194','KR5b0242','KR5c0030','KR5i0088','KR5c0181'];
  /* 注意：本 IIFE 内 isNeidan 有两处同名声明（模块头 NEIDAN_IDS 版与此处
     JING_NEIDAN 版），函数声明提升以后者为准——目录排除/门控/注音隐藏实际
     都走这张表。两表必须同步增减（2026-10-28 书架扩容冒烟实证）。 */
  var JING_NEIDAN = ['s18','s19','s20','s21','s23','s22','s40','s41','s42','s43','s44','s45','s46','s47','s48',
    'KR5a0250','KR5a0247','KR5d0113','KR5g0117','KR5e0055','KR5a0242',
    'KR5d0111','KR5a0014','KR5c0022','KR5d0097','KR5a0265','KR5g0067',
    'KR5d0080','KR5d0078','KR5i0064','KR5c0350'];
  function isNeidan(sid) { return JING_NEIDAN.indexOf(sid) >= 0; }
  function hasAudio(sid) { return JING_HAS_AUDIO.indexOf(sid) >= 0; }
  function updateAudioButtons() {
    var has = hasAudio(currentId);
    // 跟读依赖分段朗读时间戳：无音频的经（如内丹诸经）隐藏跟读按钮
    var flEl = document.getElementById('jing-follow');
    if (flEl) flEl.style.display = has ? '' : 'none';
    /* 统一底栏（第 0 步）：「读」钮全书类恒显，读面板按有无双声录音分流——
       有录音 #jing-audio-grp（声线/诵读/跟读/下载），无录音 #jing-tts-grp
       （系统朗读＋语速，TTS 本体批二接入 __wuriTTSStart） */
    var readBtn = document.getElementById('jing-read-btn');
    var gA = document.getElementById('jing-audio-grp');
    var gT = document.getElementById('jing-tts-grp');
    var isFree = window.IS_FREE_BUILD;
    if (isFree) {
      // 免费版：系统诵读即其朗读形态，维持旧口径（藏声线/下载、KR 藏诵读）
      ['jing-voice','jing-download'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      var sp = document.getElementById('jing-speak');
      if (sp) { sp.style.display = ''; sp.hidden = false; }
      // 道藏全藏一律无音频：免费版口径下亦隐藏系统诵读
      var krFree = /^KR5/.test(currentId || '');
      if (krFree && sp) sp.style.display = 'none';
      if (gA) gA.style.display = '';
      if (gT) gT.hidden = true;
      if (readBtn) readBtn.style.display = krFree ? 'none' : '';
      return;
    }
    if (gA) gA.style.display = has ? '' : 'none';
    if (gT) gT.hidden = has;
    ['jing-speak','jing-voice','jing-download'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = has ? '' : 'none';
    });
    if (readBtn) readBtn.style.display = '';
  }
  // 免费版诵读：强制用系统 TTS
  var _origSpeak = null;
  function localAudioFile(sid, voice) { return sid + '_' + voice + '.mp3'; }
  // 后台服务播放（替代 HTML5 Audio）
  function svcPlay(sid, voice, positionMs) {
    var b = bridge();
    if (!b || typeof b.jingPlay !== 'function') return false;
    var filename = localAudioFile(sid, voice);
    var localPath = '';
    if (typeof b.getLocalAudioPath === 'function') {
      try { localPath = b.getLocalAudioPath(filename); } catch (e) {}
    }
    var path = localPath ? ('file://' + localPath) : (JING_BASE + filename);
    var title = '';
    try {
      var d = window.JINGWEN[sid];
      if (d) title = d.title || sid;
    } catch (e) {}
    try { b.jingPlay(path, title + (voice === 'female' ? '（女声）' : '（男声）'), positionMs || 0); } catch (e) { return false; }
    showFloatPlayer(title, voice);
    return true;
  }
  function svcPause() {
    var b = bridge();
    if (b && typeof b.jingPause === 'function') { try { b.jingPause(); } catch (e) {} }
    saveJingPos();
    updateFloatBtn(false);
  }
  function svcResume() {
    var b = bridge();
    if (b && typeof b.jingResume === 'function') { try { b.jingResume(); } catch (e) {} }
    updateFloatBtn(true);
  }
  function svcStop() {
    saveJingPos();
    var b = bridge();
    if (b && typeof b.jingStop === 'function') { try { b.jingStop(); } catch (e) {} }
    hideFloatPlayer();
    /* 底栏回五钮常态＋诵读句高亮驱动停转＋高亮清除 */
    syncDockPlayUI('idle');
    stopSpeakTicker();
    clearFollowCur();
  }
  // 断点续播：把当前毫秒存起来
  function saveJingPos() {
    try {
      var b = bridge();
      if (b && typeof b.jingPosition === 'function' && window._fpSid) {
        var pos = b.jingPosition();
        if (pos > 1000) {
          localStorage.setItem('wuri_jing_pos_' + window._fpSid, String(Math.floor(pos / 1000)));
        }
      }
    } catch (e) {}
  }
  // 灵动岛悬浮播放器（全 App 可见，SPA 切 tab 不消失）
  function ensureFloatPlayer() {
    var el = document.getElementById('jing-float-player');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'jing-float-player';
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(110px + env(safe-area-inset-bottom));z-index:10000;'
      + 'width:min(92%,480px);background:rgba(18,18,26,0.96);border-radius:20px;'
      + 'padding:10px 12px 12px;color:#fff;display:none;'
      + 'box-shadow:0 8px 28px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.09);'
      + 'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);';
    el.innerHTML =
      '<div id="jing-fp-body" style="display:flex;align-items:center;gap:10px;">'
      + '<div style="flex:1;min-width:0;">'
      + '<div id="jing-fp-title" style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.02em;"></div>'
      + '<div id="jing-fp-para" style="font-size:11px;color:#9a9aa8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px;"></div>'
      + '</div>'
      + '<button id="jing-fp-toggle" style="flex:none;width:38px;height:38px;border-radius:50%;border:none;background:linear-gradient(135deg,#c9a35c,#e8c877);color:#1a1a1a;font-size:15px;line-height:1;">❚❚</button>'
      + '<button id="jing-fp-close" style="flex:none;width:30px;height:30px;border-radius:50%;border:none;background:rgba(255,255,255,0.12);color:#ccc;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer"><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" style="display:block"><path d="M2.2 2.2 L9.8 9.8 M9.8 2.2 L2.2 9.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg></button>'
      + '</div>'
      + '<div style="height:3px;background:rgba(255,255,255,0.14);border-radius:2px;margin-top:9px;overflow:hidden;">'
      + '<div id="jing-fp-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#c9a35c,#e8c877);border-radius:2px;transition:width 0.9s linear;"></div></div>';
    document.body.appendChild(el);
    document.getElementById('jing-fp-toggle').addEventListener('click', function (e) {
      e.stopPropagation();
      var b = bridge();
      var playing = false;
      if (b && typeof b.jingIsPlaying === 'function') { try { playing = b.jingIsPlaying(); } catch (e2) {} }
      if (playing) { svcPause(); } else { svcResume(); }
    });
    document.getElementById('jing-fp-close').addEventListener('click', function (e) {
      e.stopPropagation();
      svcStop();
    });
    // 点岛身（非按钮区）：回到经文阅读页
    document.getElementById('jing-fp-body').addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      if (!window._fpSid) return;
      var tabBtn = document.querySelector('#tabbar button[data-tab="tab-jing"]');
      if (tabBtn) tabBtn.click();
      if (window.JingWen && window.JingWen.openReader) {
        window.JingWen.openReader(window._fpSid);
      }
    });
    return el;
  }
  function showFloatPlayer(title, voice) {
    showFloatPlayerFor(currentId, title, voice);
  }
  function showFloatPlayerFor(sid, title, voice) {
    if (!sid) return;
    var el = ensureFloatPlayer();
    el.style.display = 'block';
    document.getElementById('jing-fp-title').textContent =
      title + (voice === 'female' ? ' · 女声' : ' · 男声');
    document.getElementById('jing-fp-para').textContent = '正在加载…';
    document.getElementById('jing-fp-bar').style.width = '0%';
    updateFloatBtn(true);
    window._fpSid = sid; window._fpVoice = voice;
    try {
      localStorage.setItem('wuri_jing_last',
        JSON.stringify({ sid: sid, voice: voice, title: title }));
    } catch (e) {}
    // 段落名显示需要时间戳，按需加载（确保是当前经文+声音的）
    ensureTimestamps(sid, voice, function () {});
    startFpTicker();
  }
  // 页面重载后恢复悬浮岛（后台服务还在播时）
  function restoreFloatPlayer() {
    if (!isSvcActive()) return;
    var info = null;
    try { info = JSON.parse(localStorage.getItem('wuri_jing_last') || 'null'); } catch (e) {}
    if (!info || !info.sid) return;
    showFloatPlayerFor(info.sid, info.title || info.sid, info.voice);
    var b = bridge();
    var playing = true;
    try { playing = b.jingIsPlaying(); } catch (e) {}
    updateFloatBtn(playing);
  }
  function updateFloatBtn(playing) {
    var t = document.getElementById('jing-fp-toggle');
    if (t) t.textContent = playing ? '❚❚' : '▶';
  }
  function hideFloatPlayer() {
    stopFpTicker();
    var el = document.getElementById('jing-float-player');
    if (el) el.style.display = 'none';
    window._fpSid = null; window._fpVoice = null;
    try { localStorage.removeItem('wuri_jing_last'); } catch (e) {}
  }
  // 每秒轮询原生播放状态，更新进度条 + 当前段落 + 断点保存
  var _fpTimer = null;
  function startFpTicker() {
    stopFpTicker();
    var saveCounter = 0;
    _fpTimer = setInterval(function () {
      var b = bridge();
      if (!b || typeof b.jingState !== 'function') return;
      var st = 0, pos = -1, dur = -1;
      try { st = b.jingState(); pos = b.jingPosition(); dur = b.jingDuration(); }
      catch (e) { return; }
      if (st === 3) { onTrackCompleted(); return; } // 播完
      if (st === 0) { hideFloatPlayer(); return; }   // 外部停止
      updateFloatBtn(st === 1 || st === 4);
      if (dur > 0 && pos >= 0) {
        var bar = document.getElementById('jing-fp-bar');
        if (bar) bar.style.width = Math.min(100, pos / dur * 100).toFixed(1) + '%';
        updateFpPara(pos);
      }
      if (++saveCounter % 10 === 0) saveJingPos();
    }, 1000);
  }
  function stopFpTicker() {
    if (_fpTimer) { clearInterval(_fpTimer); _fpTimer = null; }
  }
  // 二分查找当前段落，显示在岛上
  function updateFpPara(posMs) {
    var ts = jingTimestamps;
    if (!ts || !ts.segments || !ts.segments.length) return;
    var segs = ts.segments;
    var pos = posMs / 1000;
    var lo = 0, hi = segs.length - 1, ans = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (segs[mid].start <= pos) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    var el = document.getElementById('jing-fp-para');
    if (el) {
      var t = String(segs[ans].text || '').replace(/\s+/g, ' ').slice(0, 24);
      var label = '第' + (ans + 1) + '/' + segs.length + '段 · ' + t;
      if (el.textContent !== label) el.textContent = label;
    }
  }
  function onTrackCompleted() {
    stopFpTicker();
    clearFollowCur(); // 跟读高亮清掉，模式保持可点播
    var sid = window._fpSid;
    hideFloatPlayer();
    try { if (sid) localStorage.removeItem('wuri_jing_pos_' + sid); } catch (e) {}
    /* 底栏回五钮常态＋诵读句高亮驱动停转 */
    syncDockPlayUI('idle');
    stopSpeakTicker();
  }
  function playJingAudio(sid, startTime) {
    var voice = getVoice();
    var savedPos = 0;
    try { savedPos = parseFloat(localStorage.getItem('wuri_jing_pos_' + sid) || '0'); } catch (e) {}
    var posMs = Math.floor(((startTime !== undefined) ? startTime : savedPos) * 1000);
    // 优先用后台服务（支持后台播放+通知栏控制）
    if (svcPlay(sid, voice, posMs)) {
      syncDockPlayUI('playing');
      closeDockPanels();
      startSpeakTicker();
      var b = bridge();
      var lp = '';
      if (b && typeof b.getLocalAudioPath === 'function') {
        try { lp = b.getLocalAudioPath(localAudioFile(sid, voice)); } catch (e) {}
      }
      updateDownloadBtn(sid, voice, !!lp);
      return;
    }
    // 降级：HTML5 Audio（网页版/桌面）
    var filename = localAudioFile(sid, voice);
    var src = JING_BASE + filename;
    /* 装载/播放串行化（2026-10-28 跟读首播弹错修复）：旧实现 src 一设就
       play()、loadedmetadata 后又设 currentTime——play() 未决期间的二次
       装载/seek 会把 play() 打断（AbortError: interrupted by a new load
       request），旧代码还把该拒绝 alert 给用户（真机截图实证：点跟读先
       弹「播放失败」确定后才出声）。现行口径：令牌串行（新调用废旧调用）、
       同 src 不重设、seek 只在元数据就绪后且在 play() 之前设一次、
       play() 只发一次；AbortError 静默（仍是当前意图则限次重试续播），
       真失败走 toast，阅读器内不再用原生 alert 弹播放错误。 */
    var token = ++_playToken;
    var seekSec = posMs / 1000;
    if (!jingAudio) {
      jingAudio = new Audio();
      /* 网页版自然播完：与原生 onTrackCompleted 同口径收尾（底栏回常态、
         句高亮清掉、续播位清除）——旧实现无此监听，播完底栏停在播放态 */
      jingAudio.addEventListener('ended', function () { onTrackCompleted(); });
      jingAudio.addEventListener('error', function () {
        if (_playErrToken !== _playToken) return;
        _playErrToken = _playToken;
        readerToast(!navigator.onLine
          ? '无网络：这部经文的音频还没有离线下载。请联网后播放，或先下载音频。'
          : '播放失败：音频加载出错，请检查网络后重试。');
      });
    }
    if (_jingSrc !== src) {
      _jingSrc = src;
      try { jingAudio.pause(); } catch (e) {}
      jingAudio.src = src;
    }
    var doPlay = function () {
      if (token !== _playToken) return;
      if (seekSec > 0) { try { jingAudio.currentTime = seekSec; } catch (e) {} }
      var p = null;
      try { p = jingAudio.play(); } catch (e) { p = null; }
      if (p && p.catch) p.catch(function (e) {
        if (token !== _playToken) return;
        if (e && e.name === 'AbortError') {
          /* 被后续装载打断：若播放意图仍在（未被新调用/停止取代），重试续播 */
          if (_playRetry < 2) {
            _playRetry++;
            setTimeout(function () { if (token === _playToken && jingAudio && jingAudio.paused) doPlay(); }, 300);
          }
          return;
        }
        readerToast(!navigator.onLine
          ? '无网络：这部经文的音频还没有离线下载。请联网后播放，或先下载音频。'
          : '播放失败：' + (e && e.message ? e.message : '请重试'));
      });
    };
    _playRetry = 0;
    if (seekSec > 0 && jingAudio.readyState < 1) {
      var _seekPlay = function () {
        jingAudio.removeEventListener('loadedmetadata', _seekPlay);
        doPlay();
      };
      jingAudio.addEventListener('loadedmetadata', _seekPlay);
    } else {
      doPlay();
    }
    /* 媒体卡片：先设 metadata 再 play，iOS 才能显示 logo（2026-10-11） */
    try {
      if (window.WuriMediaSession) {
        /* titleOf 在另一个 IIFE 里，本作用域取不到（typeof 恒 false → 以前一直回落成编号 s02）。
         * 改走它暴露的全局入口 window.JingTitleOf（2026-10-19 修） */
        var jt = sid;
        try {
          if (typeof window.JingTitleOf === 'function') jt = window.JingTitleOf(sid);
          else if (typeof titleOf === 'function') jt = titleOf(sid);
        } catch (e3) {}
        window.WuriMediaSession.bindAudio(jingAudio, {
          title: jt,
          artist: '戊日不上香 · 经文诵读',
          album: voice === 'female' ? '女声' : '男声'
        });
      }
    } catch (e2) {}
    syncDockPlayUI('playing');
    closeDockPanels();
    startSpeakTicker();
  }
  /* 播放/跟读类提示一律非阻塞 toast（阅读器内禁用原生 alert 弹播放错误） */
  function readerToast(msg) {
    if (window.showToast) { try { showToast(msg); return; } catch (e) {} }
    try { console.warn('[jing]', msg); } catch (e) {}
  }
  function updateDownloadBtn(sid, voice, isDownloaded) {
    var btn = document.getElementById('jing-download');
    if (!btn) return;
    if (isDownloaded) {
      btn.textContent = '已下载 ✓';
      btn.disabled = true;
    } else {
      btn.textContent = '下载音频';
      btn.disabled = false;
    }
  }
  function ensureProgressBar() {
    var bar = document.getElementById('jing-dl-bar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'jing-dl-bar';
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:70px;z-index:10002;background:rgba(30,30,40,0.92);border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;display:none;box-shadow:0 2px 12px rgba(0,0,0,0.3);';
    bar.innerHTML = '<div id="jing-dl-text" style="margin-bottom:6px;">后台下载中…</div>' +
      '<div style="height:6px;background:rgba(255,255,255,0.2);border-radius:3px;overflow:hidden;">' +
      '<div id="jing-dl-fill" style="height:100%;width:0%;background:#4a9eff;border-radius:3px;transition:width 0.3s;"></div></div>';
    document.body.appendChild(bar);
    return bar;
  }
  function downloadJingAudio(sid, voice) {
    /* 离线下载属高级版功能：未激活弹付费墙、不发起下载（在线播放仍免费） */
    if (!isPro()) { window.WuriPro && WuriPro.requirePro('jingwen'); return; }
    var b = bridge();
    var filename = localAudioFile(sid, voice);
    if (!b || typeof b.downloadFile !== 'function') {
      // 网页版：无原生桥，用 <a download> 直接下载（iOS 网页版修复 2026-10-10）
      try {
        var a = document.createElement('a');
        a.href = JING_BASE + filename;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (e) {
        readerToast('下载失败：' + e.message);
      }
      return;
    }
    var bar = ensureProgressBar();
    bar.style.display = 'block';
    document.getElementById('jing-dl-text').textContent = '后台下载中：' + filename + '（0%）';
    document.getElementById('jing-dl-fill').style.width = '0%';
    var btn = document.getElementById('jing-download');
    if (btn) { btn.textContent = '下载中...'; btn.disabled = true; }
    window._dlSid = sid; window._dlVoice = voice;
    try { b.downloadFile(JING_BASE + filename, filename); } catch (e) {
      bar.style.display = 'none';
      if (btn) { btn.textContent = '下载音频'; btn.disabled = false; }
    }
  }
  window.onJingDownloadProgress = function (filename, pct) {
    var bar = document.getElementById('jing-dl-bar');
    if (bar) {
      bar.style.display = 'block';
      document.getElementById('jing-dl-text').textContent = '后台下载中：' + filename + '（' + pct + '%）';
      document.getElementById('jing-dl-fill').style.width = pct + '%';
    }
  };
  window.onJingDownloadDone = function (filename, path) {
    var bar = document.getElementById('jing-dl-bar');
    var btn = document.getElementById('jing-download');
    if (path) {
      if (bar) {
        document.getElementById('jing-dl-text').textContent = '下载完成 ✓ ' + filename;
        document.getElementById('jing-dl-fill').style.width = '100%';
        setTimeout(function () { bar.style.display = 'none'; }, 3000);
      }
      if (btn) { btn.textContent = '已下载 ✓'; btn.disabled = true; }
      try { localStorage.setItem('wuri_jing_dl_' + window._dlSid + '_' + window._dlVoice, '1'); } catch (e) {}
    } else {
      // 失败时保持显示，不消失
      if (bar) {
        document.getElementById('jing-dl-text').textContent = '下载失败 ✗ ' + filename + '，点下载音频重试';
        document.getElementById('jing-dl-fill').style.width = '0%';
        document.getElementById('jing-dl-fill').style.background = '#ff5555';
      }
      if (btn) { btn.textContent = '下载音频'; btn.disabled = false; }
    }
  };
  // 点进度条可以关闭
  document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'jing-dl-bar') {
      document.getElementById('jing-dl-bar').style.display = 'none';
    }
  });
  function stopJingAudio() {
    _playToken++; /* 废止一切在途装载/播放意图，防停止后迟到回调又出声 */
    svcStop();
    if (jingAudio) { try { jingAudio.pause(); } catch (e) {} }
  }
  /* ---------- TTS（保留作备用） ---------- */
  function bridge() { return window.WuBridge || null; }
  function speakText(text) {
    var b = bridge();
    if (b && typeof b.ttsSpeak === 'function') { try { b.ttsSpeak(text); return true; } catch (e) {} }
    // 退路：Web Speech（桌面调试用）
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 0.9;
      speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }
  function stopSpeak() {
    stopJingAudio();
    stopTtsOnly();
  }
  // 后台 MP3 服务是否活跃（播放中/暂停/缓冲）
  function isSvcActive() {
    try {
      var b = bridge();
      if (!b || typeof b.jingState !== 'function') return false;
      var s = b.jingState();
      return s === 1 || s === 2 || s === 4;
    } catch (e) { return false; }
  }
  // 只停系统 TTS 朗读（关阅读器/切 tab 用），不动后台 MP3 服务和悬浮岛
  function stopTtsOnly() {
    var b = bridge();
    if (b && typeof b.ttsStop === 'function') { try { b.ttsStop(); } catch (e) {} }
    try { speechSynthesis.cancel(); } catch (e) {}
    if (!isSvcActive()) syncDockPlayUI('idle');
  }
  function speakSection(si) {
    var d = window.JINGWEN[currentId];
    if (!d) return;
    var sec = d.sections[si];
    var text = sec.paras.map(function (p) { return p.t; }).join('\n');
    if (speakText(text)) syncDockPlayUI('playing');
  }
  function speakAll() {
    if (!currentId) return;
    // 免费版：直接用系统 TTS
    if (window.IS_FREE_BUILD) {
      var d = window.JINGWEN[currentId];
      if (!d) return;
      var text = d.sections.map(function(sec) {
        return sec.paras.map(function(p) { return p.t; }).join('\n');
      }).join('\n\n');
      if (speakText(text)) syncDockPlayUI('playing');
      return;
    }
    var voice = getVoice();
    loadTimestamps(currentId, voice, function () {
      playJingAudio(currentId);
    });
  }

  function bindMoreMenu() {
    var btn = document.getElementById('jing-more');
    var menu = document.getElementById('jing-more-menu');
    if (btn && menu) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      });
      document.addEventListener('click', function() {
        menu.style.display = 'none';
      });
      menu.addEventListener('click', function(e) { e.stopPropagation(); });
    }
  }
  function bindDownload() {
    var btn = document.getElementById('jing-download');
    if (btn) {
      btn.addEventListener('click', function () {
        if (currentId) downloadJingAudio(currentId, getVoice());
      });
    }
    var vsel = document.getElementById('jing-voice');
    if (vsel) {
      // 记住选择
      try {
        var saved = localStorage.getItem('wuri_jing_voice');
        if (saved) vsel.value = saved;
      } catch (e) {}
      vsel.addEventListener('change', function () {
        // 切换声音时：停止旧的，自动用新声音开始
        var wasPlaying = false;
        var b = bridge();
        if (b && typeof b.jingIsPlaying === 'function') {
          try { wasPlaying = b.jingIsPlaying(); } catch (e) {}
        } else if (jingAudio && !jingAudio.paused) {
          wasPlaying = true;
        }
        stopJingAudio();
        try { localStorage.setItem('wuri_jing_voice', vsel.value); } catch (e) {}
        // 如果之前在播，用新声音自动开始
        if (wasPlaying && currentId) {
          setTimeout(function() { playJingAudio(currentId); }, 300);
        }
        // 跟读模式开着时：换声音要重载时间戳并重建映射
        if (followMode && currentId) {
          jingTimestamps = null; jingTsSid = null; jingTsVoice = null;
          loadTimestamps(currentId, vsel.value, function () {
            if (!buildFollowMap()) {
              readerToast('该声音暂无分段朗读数据，跟读模式已关闭');
              toggleFollow();
            }
          });
        }
        // 切换声音时更新下载按钮状态
        if (currentId) {
          var b = bridge();
          var lp = '';
          if (b && typeof b.getLocalAudioPath === 'function') {
            try { lp = b.getLocalAudioPath(localAudioFile(currentId, vsel.value)); } catch (e) {}
          }
          updateDownloadBtn(currentId, vsel.value, !!lp);
        }
      });
    }
  }
  /* ---------- 初始化 ---------- */
  var _catalogUiBound = false;
  function bindFilter() {
    /* 筛选钮已移入目录渲染内（随 renderCatalog 重建），故改事件委托、只绑一次 */
    if (_catalogUiBound) return;
    _catalogUiBound = true;
    document.addEventListener('click', function (e) {
      var tg = e.target.closest('[data-common-toggle]');
      if (tg) {
        commonCollapsed = !commonCollapsed;
        var sec = tg.closest('[data-common-sec]');
        if (sec) {
          sec.classList.toggle('collapsed', commonCollapsed);
          var cbody = sec.querySelector('.jing-common-body');
          if (cbody) cbody.hidden = commonCollapsed;
        }
        return;
      }
      var b = e.target.closest('[data-jing-filter]');
      if (!b) return;
      // 问题2修复：如果在标记页，先回目录再过滤
      var marksEl = $('#jing-marks');
      var listEl = $('#jing-list');
      if (marksEl && !marksEl.hidden) {
        marksEl.hidden = true;
        if (listEl) listEl.hidden = false;
        var resultsEl = $('#jing-results');
        if (resultsEl) resultsEl.hidden = true;
        if (window._refreshMarks) window._refreshMarks = null;
      }
      document.querySelectorAll('[data-jing-filter]').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      jingFilter = b.getAttribute('data-jing-filter');
      renderCatalog();
    });
  }

  /* ---------- 我的标记入口行计数（书签＋高亮＋笔记总数） ---------- */
  function marksTotal() {
    var n = 0;
    try {
      var bm = JSON.parse(localStorage.getItem('wuri_jing_bookmarks') || '{}');
      Object.keys(bm).forEach(function (k) { var a = bm[k]; n += Array.isArray(a) ? a.length : (a ? 1 : 0); });
      var hl = JSON.parse(localStorage.getItem('wuri_jing_highlights') || '[]');
      if (Array.isArray(hl)) n += hl.length;
      var nt = JSON.parse(localStorage.getItem('wuri_jing_notes') || '[]');
      if (Array.isArray(nt)) n += nt.length;
    } catch (e) {}
    return n;
  }
  function refreshMarksRow() {
    var el = document.getElementById('jing-marks-count');
    if (el) el.textContent = marksTotal() + ' 条'; // 一行三格格内副字（反馈第二批第 7 项）
  }
  window.__wuriRefreshMarksRow = refreshMarksRow;

  function init() {
    bindDownload();
    bindMoreMenu();
    bindFilter();
    if (!$('#jing-body')) return;
    // APP启动时强制回到目录（不只点tab时）
    var listEl = $('#jing-list');
    var marksEl = $('#jing-marks');
    var resultsEl = $('#jing-results');
    if (listEl) listEl.hidden = false;
    if (marksEl) marksEl.hidden = true;
    if (resultsEl) resultsEl.hidden = true;
    try { fontPx = +(localStorage.getItem('wuri_jing_font') || 17); } catch (e) {}
    /* 字号无级滑杆（批一）：旧五档存值（14/17/20/24/29）直接沿用，不再
       吸附到 17/28 两值；越界夹回 14–30 */
    if (!(fontPx >= 14 && fontPx <= 30)) fontPx = Math.max(14, Math.min(30, fontPx || 17));
    try {
      fontFam = localStorage.getItem('wuri_jing_ff') || 'song';
      if (fontFam !== 'kai' && fontFam !== 'hei') fontFam = 'song';
      lhMode = localStorage.getItem('wuri_jing_lh') || 'mid';
      if (lhMode !== 'tight' && lhMode !== 'wide') lhMode = 'mid';
    } catch (e) {}
    try { pyOn = localStorage.getItem('wuri_jing_py') !== '0'; } catch (e) {}
    /* 翻页存量偏好迁移（2026-10-29）：左右翻页整体下线，wuri_jing_turn
       一律规范化为 scroll——存了 'page' 的用户开书直接滚动，不报错、
       无页码 UI 残留 */
    try { localStorage.setItem('wuri_jing_turn', 'scroll'); } catch (e) {}
    renderCatalog();
    refreshMarksRow();
    /* 我的标记入口行（div 模拟按钮）键盘可达：Enter/空格触发 */
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'jing-mymarks' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.target.click();
      }
    });
    /* 语言切换时目录随之重渲（三段标题简繁、全藏目录显示口径跟随系统语言）；
     * 正在读的书正文一并即时重渲（简繁跟随系统，2026-10-29）：沿用高亮重渲同款
     * 锚点机制（_jingAnchorY＋展开集）恢复阅读位置，不重载、不丢位 */
    var prevRr = window.__wuri_rerender;
    window.__wuri_rerender = function () {
      if (prevRr) prevRr();
      renderCatalog();
      try {
        if (currentId && window.JINGWEN && window.JINGWEN[currentId] && !$('#jing-reader').hidden) {
          var sc = window.scrollY || 0;
          if (sc > 0) {
            window._jingAnchorY = sc;
            window._jingAnchorExp = collectExpandedSecs();
            window._jingAnchorTs = Date.now();
          }
          renderReaderBody(currentId, window.JINGWEN[currentId]);
        }
      } catch (e) {}
    };
    applyReaderPrefs();
    syncFontPanel();

    document.addEventListener('click', function (e) {
      var ji = e.target.closest('[data-jing]');
      if (ji) {
        var jingId = ji.getAttribute('data-jing');
        var sec = ji.getAttribute('data-sec');
        // 问题5修复：如果数据还没加载，显示加载提示
        if (!(window.JINGWEN && window.JINGWEN[jingId])) {
          // 在目录区显示加载中
          var listEl = $('#jing-list');
          if (listEl) {
            var loadingTip = document.createElement('div');
            loadingTip.id = 'jing-loading-tip';
            loadingTip.className = 'hint';
            loadingTip.style.cssText = 'text-align:center;padding:20px;';
            loadingTip.textContent = '加载中…';
            // 避免重复添加
            if (!$('#jing-loading-tip')) listEl.appendChild(loadingTip);
          }
        }
        /* 返回定位：记下出处（目录架/搜索结果），返回时回原位 */
        libCapture(jingId, ji);
        openReader(jingId);
        if (sec != null && sec !== '-1') {
          setTimeout(function () {
            var body = document.querySelector('#jing-content .jing-sec[data-sec="' + sec + '"] .jing-sec-body');
            if (body) { body.hidden = false; updateFoldBtn(); }
            var hs = document.querySelectorAll('#jing-content .jing-sec-h');
            if (hs[+sec]) hs[+sec].scrollIntoView();
          }, 300);
        }
        // 数据加载完成后移除提示（openReader 成功后会隐藏目录）
        setTimeout(function () {
          var tip = $('#jing-loading-tip');
          if (tip) tip.remove();
        }, 3000);
        return;
      }
      var qm = e.target.closest('[data-qing]');
      if (qm) {
        e.stopPropagation();
        try {
          var a = new Audio('audio/qing.mp3');
          a.play();
        } catch (e2) {}
        return;
      }
      var fh = e.target.closest('[data-fold]');
      if (fh) { toggleSection(fh.getAttribute('data-fold')); return; }
      // 内丹书籍折叠开关
      var nd = e.target.closest('[data-neidan-toggle]');
      if (nd) {
        var body = nd.parentNode.querySelector('.jing-neidan-body');
        if (body) {
          body.hidden = !body.hidden;
          libSaveView(); /* 视图记忆：内丹架展开态入存（收起时未必有滚动事件可借） */
          // 问题6修复：展开后滚到可见位置
          if (!body.hidden) {
            setTimeout(function () {
              nd.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }, 100);
          }
        }
        return;
      }
      var rs = e.target.closest('.recite-sen');
      if (rs && reciteMode) {
        var rest = rs.querySelector('.recite-rest');
        if (rest) { rest.hidden = !rest.hidden; rs.classList.toggle('open', !rest.hidden); }
        return;
      }
    });

    var q = $('#jing-q');
    var qClear = $('#jing-q-clear');
    function updateQClear() {
      if (qClear) qClear.hidden = !q.value;
    }
    q.addEventListener('input', function () {
      updateQClear();
      /* 防抖 150ms：连打时只查最后一词（时序令牌再兜底防串味） */
      if (searchTimer) clearTimeout(searchTimer);
      var v = q.value;
      searchTimer = setTimeout(function () { search(v); }, 150);
    });
    q.addEventListener('focus', dzPreload);
    if (qClear) {
      qClear.addEventListener('click', function () {
        if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
        q.value = '';
        updateQClear();
        search('');
        q.focus();
      });
    }

    /* 返回走左下悬浮钮（jing-back-fab，绑定在 JingMark 侧 DOMContentLoaded）；
       底栏旧「‹ 目录」钮已随五钮主行撤除 */
    $('#jing-pybtn').addEventListener('click', function () {
      pyOn = !pyOn;
      try { localStorage.setItem('wuri_jing_py', pyOn ? '1' : '0'); } catch (e) {}
      applyReaderPrefs();
      if (window.__wuri_dzOnPyToggle) { try { window.__wuri_dzOnPyToggle(); } catch (e) {} }
    });
    try { reciteMode = localStorage.getItem('wuri_jing_recite') === '1'; } catch (e) {}
    var rcb = $('#jing-recite');
    if (rcb) rcb.addEventListener('click', toggleRecite);
    var flb = $('#jing-follow');
    if (flb) flb.addEventListener('click', toggleFollow);
    /* 字面板「高亮」显隐开关钮已删（反馈批第 8 条：用户实录按了无反应、
       多余；划线正路＝选中文字弹色板，JingMark.openHlPopForSelection
       保留供选区路径调用） */
    // 跟读模式：点段落从该处开始播
    var jc = $('#jing-content');
    if (jc) jc.addEventListener('click', function (e) {
      if (!followMode) return;
      // 高亮/背诵/折叠等已有交互优先
      if (e.target.closest('.hl') || e.target.closest('[data-qing]') ||
          e.target.closest('.recite-sen') || e.target.closest('[data-fold]')) return;
      var p = e.target.closest('.jing-para');
      if (p) { e.stopPropagation(); followSeek(p); }
    });
    /* 字体版式控件（批一第 2 项，控件在字面板「显示」组续加三行；
       字小/字大五档钮与翻页切换钮均已撤——前者由无级滑杆替代，后者
       随 v318 撤翻页下线） */
    var frEl = $('#jing-font-range');
    if (frEl) frEl.addEventListener('input', function () { setFontPx(+frEl.value); });
    document.querySelectorAll('#jing-font-panel [data-ff]').forEach(function (b) {
      b.addEventListener('click', function () { setFontFam(b.getAttribute('data-ff')); });
    });
    document.querySelectorAll('#jing-font-panel [data-lh]').forEach(function (b) {
      b.addEventListener('click', function () { setLhMode(b.getAttribute('data-lh')); });
    });
    syncFontPanel();
    /* 读/字双面板（2026-10-28 晚五钮主行）：互斥展开、点外关（收起逻辑
       在 closeDockPanels，播放开始/开目录/关阅读器时亦调用） */
    var readBtn = $('#jing-read-btn'), playPanel = $('#jing-play-panel');
    var fontBtn = $('#jing-font-btn'), fontPanel = $('#jing-font-panel');
    function dockPanelToggle(which) {
      var p = which === 'read' ? playPanel : fontPanel;
      var b = which === 'read' ? readBtn : fontBtn;
      var o = which === 'read' ? fontPanel : playPanel;
      var ob = which === 'read' ? fontBtn : readBtn;
      if (!p || !b) return;
      var willOpen = p.hidden;
      p.hidden = !willOpen;
      b.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      b.classList.toggle('on', willOpen);
      if (o) o.hidden = true;
      if (ob) { ob.setAttribute('aria-expanded', 'false'); ob.classList.remove('on'); }
    }
    if (readBtn) readBtn.addEventListener('click', function (e) { e.stopPropagation(); dockPanelToggle('read'); });
    if (fontBtn) fontBtn.addEventListener('click', function (e) { e.stopPropagation(); dockPanelToggle('font'); });
    document.addEventListener('click', function (e) {
      if (e.target.closest('#jing-dock')) return;
      closeDockPanels();
    });
    /* 播放胶囊：暂停/继续（钮在 #jing-play-fab 胶囊内） */
    var pzB = $('#jing-pause');
    if (pzB) pzB.addEventListener('click', dockPauseToggle);
    /* 系统朗读胶囊（反馈第二批第 4 项）：暂停/继续＋停止，与面板钮共用
       ttsPauseToggle/ttsStop，状态经 syncTtsFab 双向同步 */
    var tpB = $('#jing-tts-pause');
    if (tpB) tpB.addEventListener('click', function () { if (window.__wuriTTSPauseToggle) window.__wuriTTSPauseToggle(); });
    var tsB = $('#jing-tts-stop');
    if (tsB) tsB.addEventListener('click', function () { if (window.__wuriTTSStop) window.__wuriTTSStop(); });
    var tcapEl = $('#jing-tts-fab');
    if (tcapEl && window.__wuriMakeDraggable) {
      window.__wuriMakeDraggable(tcapEl, 'wuri_jing_ttsfab_v1', { always: true });
      try {
        var tp0 = JSON.parse(localStorage.getItem('wuri_jing_ttsfab_v1') || 'null');
        if (tp0 && typeof tp0.x === 'number') {
          tcapEl.style.left = tp0.x + 'px'; tcapEl.style.top = tp0.y + 'px';
          tcapEl.style.right = 'auto'; tcapEl.style.bottom = 'auto';
        }
      } catch (e) {}
    }
    /* TTS 语音选择（反馈第二批第 5 项）：填充中文语音列表（异步补列）、
       改选持久化 voiceURI、下一句起生效（ttsPickVoice 逐句取） */
    if (window.__wuriTTSVoices) window.__wuriTTSVoices();
    try {
      if (window.speechSynthesis && speechSynthesis.addEventListener) {
        speechSynthesis.addEventListener('voiceschanged', function () { if (window.__wuriTTSVoices) window.__wuriTTSVoices(); });
      }
    } catch (e) {}
    var tvSel = $('#jing-tts-voice');
    if (tvSel) tvSel.addEventListener('change', function () {
      try { localStorage.setItem('wuri_jing_tts_voice', tvSel.value); } catch (e) {}
    });
    /* 播放胶囊可拖动（反馈批第 4 条；与内丹/道藏悬浮钮同一套拖动机制，
       位置独立持久化）。拖动装配器在文件后段（磬 IIFE）挂 window 上，
       init 在 DOMContentLoaded 后运行、届时已就绪 */
    var capEl = $('#jing-play-fab');
    if (capEl && window.__wuriMakeDraggable) {
      window.__wuriMakeDraggable(capEl, 'wuri_jing_playfab_v1', { always: true });
      /* 恢复上次拖后位置（显示时 syncDockPlayUI 再做视口钳制） */
      try {
        var cp0 = JSON.parse(localStorage.getItem('wuri_jing_playfab_v1') || 'null');
        if (cp0 && typeof cp0.x === 'number') {
          capEl.style.left = cp0.x + 'px'; capEl.style.top = cp0.y + 'px';
          capEl.style.right = 'auto'; capEl.style.bottom = 'auto';
        }
      } catch (e) {}
    }
    /* 本书·我的标记（字面板本书组唯一行）：从阅读页进标记页，返回回到
       本书原位（反馈批第 6 条，不再退出阅读器回书架） */
    var mkB = $('#jing-marks-btn');
    if (mkB) mkB.addEventListener('click', function () {
      closeDockPanels();
      if (window.__wuriOpenMarksFromReader) window.__wuriOpenMarksFromReader('lines');
    });
    /* 内丹/道藏底栏：目录钮＝与点状态行同一目录视图 */
    var tocB = $('#jing-toc-btn');
    if (tocB) tocB.addEventListener('click', function () {
      closeDockPanels();
      openToc();
    });
    $('#jing-speak').addEventListener('click', speakAll);
    /* 系统朗读（第 0 步先置入口与语速持久化；TTS 本体批二 __wuriTTSStart） */
    var ttsBtn = $('#jing-tts-btn');
    if (ttsBtn) ttsBtn.addEventListener('click', function () {
      if (window.__wuriTTSStart) { window.__wuriTTSStart(); return; }
      if (window.showToast) showToast('系统朗读随下一批上线');
    });
    var ttsSp = $('#jing-tts-speed');
    if (ttsSp) {
      try { var rv = localStorage.getItem('wuri_jing_tts_rate'); if (rv) ttsSp.value = rv; } catch (e) {}
      ttsSp.addEventListener('change', function () {
        try { localStorage.setItem('wuri_jing_tts_rate', ttsSp.value); } catch (e) {}
        if (window.__wuriTTSSetRate) window.__wuriTTSSetRate(+ttsSp.value);
      });
    }
    var ttsSetBtn = $('#jing-tts-set');
    if (ttsSetBtn) ttsSetBtn.addEventListener('click', function () {
      var b = bridge();
      if (b && typeof b.openTtsSettings === 'function') { try { b.openTtsSettings(); } catch (e) {} }
    });

    $('#jing-stop').addEventListener('click', stopSpeak);
    var fa = $('#jing-foldall');
    if (fa) fa.addEventListener('click', foldAll);

    document.addEventListener('wuri-pro-change', function () {
      /* 经文库免费开放（2026-10-14）：解锁状态变化时重渲染目录，刷新内丹锁标记 */
      $('#jing-lock').hidden = true;
      $('#jing-body').hidden = false;
      renderCatalog();
    });
    // 经文库免费开放：整页不上锁，仅内丹书籍收费
    $('#jing-lock').hidden = true;
    $('#jing-body').hidden = false;
    // 页面重载但后台服务还在播（系统回收 WebView 后回来）：恢复悬浮岛
    restoreFloatPlayer();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.closeReader = closeReader; // 供 Android 系统返回键调用
  return { openReader: openReader, openReaderAt: openReaderAt, search: search, closeReader: closeReader, isNeidan: isNeidan, resetToCatalog: resetToCatalog };
})();

/* ---------- 敲磬 ---------- */
(function () {
  var audio = null;
  function getAudio() {
    if (!audio) {
      audio = new Audio('audio/qing.mp3');
      audio.preload = 'auto';
    }
    return audio;
  }
  /* 书签/高亮支持面判定——书签/高亮各入口的显示条件唯一真源。
     2026-10-28 晚起全书化（精选经文/常见内丹/道藏全藏皆可），真源在
     JingMark.marksEnabled；此处只做空书防护 */
  function readerMarksOn(curId) {
    try {
      return !!(curId && window.JingMark && typeof window.JingMark.marksEnabled === 'function' && window.JingMark.marksEnabled(curId));
    } catch (e) { return false; }
  }
  /* ---------- 悬浮件拖动装配（反馈批第 1b/4 条共用一套机制） ----------
   * 位移 ≤8px 算点按（原 click 照常触发）；超阈值判拖动、吞掉随后合成
   * 的 click；松手按 storageKey 持久化 {x,y}（left/top，视口钳制）。
   * 悬浮钮组共用键 wuri_jing_fabpos_v1（按元素分格 back/bm/qing，
   * 全书类共用一套坐标）；播放胶囊自用键。opts.always=true 恒可拖，
   * 否则仅当 body.fabs-ghost（阅读器打开时恒置，2026-10-29 起全书类
   * 统一，v315 的内丹/道藏规格推广至常见经文）时可拖 */
  window.__wuriMakeDraggable = function (el, storageKey, opts) {
    if (!el || el.__wuriDrag) return;
    el.__wuriDrag = true;
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false, pid = null;
    function enabled() { return !!(opts && opts.always) || document.body.classList.contains('fabs-ghost'); }
    function subKey() {
      return el.id === 'jing-back-fab' ? 'back' : (el.id === 'jing-bookmark-fab' ? 'bm' : (el.id === 'qing-btn' ? 'qing' : null));
    }
    function save(x, y) {
      try {
        var sub = subKey();
        if (sub) {
          var m = JSON.parse(localStorage.getItem(storageKey) || '{}');
          m[sub] = { x: Math.round(x), y: Math.round(y) };
          localStorage.setItem(storageKey, JSON.stringify(m));
        } else {
          localStorage.setItem(storageKey, JSON.stringify({ x: Math.round(x), y: Math.round(y) }));
        }
      } catch (e) {}
    }
    /* 拖动追踪走 window 级监听，不用 setPointerCapture：capture 会把
       抬手后的 click 重定向到装配元素本身，胶囊内的暂停/停止钮永远
       收不到点按（冒烟实证：点胶囊 target 变容器、钮无反应） */
    function onMove(e) {
      if (!dragging || e.pointerId !== pid) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.sqrt(dx * dx + dy * dy) < 8) return;
      moved = true;
      if (e.cancelable) e.preventDefault();
      var w = el.offsetWidth || 56, h = el.offsetHeight || 56;
      var nx = Math.max(4, Math.min(ox + dx, window.innerWidth - w - 4));
      var ny = Math.max(4, Math.min(oy + dy, window.innerHeight - h - 4));
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    }
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      if (moved) {
        var r = el.getBoundingClientRect();
        save(r.left, r.top);
        var swallow = function (ev) { ev.stopImmediatePropagation(); ev.preventDefault(); };
        el.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(function () { el.removeEventListener('click', swallow, { capture: true }); }, 350);
      }
      moved = false;
    }
    el.addEventListener('pointerdown', function (e) {
      if (!enabled()) return;
      pid = e.pointerId; dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      var r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    });
  };
  /* 悬浮钮模式（反馈批第 1 条定内丹/道藏 ghost；2026-10-29 用户真机
     定版推广全书类）：ghost＝阅读器打开即生效（半透明＋可拖＋恢复
     持久化位置），与书类无关；fabIsNdDz 此后仅余磬显隐书类闸一职 */
  var _fabGhost = null;
  function fabIsNdDz(curId) {
    if (!curId) return false;
    try {
      if (window.JingWen && JingWen.isNeidan && JingWen.isNeidan(curId)) return true;
      var d = window.JINGWEN && window.JINGWEN[curId];
      return !!(d && d.daozang);
    } catch (e) { return false; }
  }
  function applyFabPos(el, pos) {
    if (!el) return;
    if (pos && typeof pos.x === 'number') {
      var w = el.offsetWidth || 56, h = el.offsetHeight || 56;
      el.style.left = Math.max(4, Math.min(pos.x, window.innerWidth - w - 4)) + 'px';
      el.style.top = Math.max(4, Math.min(pos.y, window.innerHeight - h - 4)) + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    } else {
      el.style.left = ''; el.style.top = ''; el.style.right = ''; el.style.bottom = '';
    }
  }
  function storedFabPos(which) {
    try { var m = JSON.parse(localStorage.getItem('wuri_jing_fabpos_v1') || '{}'); return m[which] || null; } catch (e) { return null; }
  }
  function updateFab() {
    var reader = document.getElementById('jing-reader');
    var showReader = !!(reader && !reader.hidden);
    var curId = window._jingCurrentId;
    var ghost = !!showReader;
    if (ghost !== _fabGhost) {
      _fabGhost = ghost;
      document.body.classList.toggle('fabs-ghost', ghost);
      var bf = document.getElementById('jing-back-fab');
      var mf = document.getElementById('jing-bookmark-fab');
      var qf = document.getElementById('qing-btn');
      if (ghost) { applyFabPos(bf, storedFabPos('back')); applyFabPos(mf, storedFabPos('bm')); applyFabPos(qf, storedFabPos('qing')); }
      else { applyFabPos(bf, null); applyFabPos(mf, null); applyFabPos(qf, null); }
    }
    /* 磬（反馈批第 2 条＋2026-10-28 晚收紧）：显示＝常见经文类 AND 数据
       判定有敲磬。数据判定在 renderReaderBody 扫描（window._jingHasQing）；
       书类复用底栏分书类同一谓词 fabIsNdDz（内丹/道藏四钮类的反面）——
       内丹、道藏无论正文有无（敲磬）舞台指示，一律不出现磬钮 */
    var qFab = document.getElementById('qing-btn');
    if (qFab) qFab.classList.toggle('show', !!(showReader && window._jingHasQing && !fabIsNdDz(curId)));
    var backFab = document.getElementById('jing-back-fab');
    if (backFab) backFab.classList.toggle('show', showReader);
    /* 加书签悬浮钮＝加书签唯一入口（第 7 条）；「我的标记」本书组行
       显隐同 bmShow */
    var bmShow = !!(showReader && readerMarksOn(curId));
    var bmFab = document.getElementById('jing-bookmark-fab');
    if (bmFab) bmFab.classList.toggle('show', bmShow);
    var mkBtn2 = document.getElementById('jing-marks-btn');
    if (mkBtn2) mkBtn2.hidden = !bmShow;
  }
  document.addEventListener('DOMContentLoaded', function () {
    var fab = document.getElementById('qing-btn');
    if (fab) {
      fab.addEventListener('click', function () {
        try {
          var a = getAudio();
          a.currentTime = 0;
          a.play();
          // 按钮动画
          fab.style.transform = 'scale(0.9)';
          setTimeout(function () { fab.style.transform = ''; }, 150);
        } catch (e) {}
      });
    }
    // 浮动返回钮：退出阅读器回经文列表（与底栏「‹ 目录」同一 closeReader）
    var backFab2 = document.getElementById('jing-back-fab');
    if (backFab2) {
      backFab2.addEventListener('click', function () {
        if (window.closeReader) window.closeReader();
      });
    }
    // 书签悬浮按钮：点击在当前位置加书签（旧行为/旧存储 JingMark.saveBookmark）
    var bmFab2 = document.getElementById('jing-bookmark-fab');
    if (bmFab2) {
      bmFab2.addEventListener('click', function () {
        var sid = window._jingCurrentId;
        if (!sid || !readerMarksOn(sid)) return;
        if (window.JingMark && window.JingMark.saveBookmark) {
          window.JingMark.saveBookmark(sid);
        }
        bmFab2.style.transform = 'scale(0.9)';
        setTimeout(function () { bmFab2.style.transform = ''; }, 150);
      });
    }
    /* 加书签入口已收敛为悬浮钮一个（反馈批第 7 条）：字面板「加书签」
       与状态行书签图标连同其接线一并删除 */
    /* 悬浮钮拖动装配（全书类生效，判定在装配器内；磬同入一组，
       分格 qing 与 back/bm 共用 wuri_jing_fabpos_v1） */
    if (window.__wuriMakeDraggable) {
      var bfD = document.getElementById('jing-back-fab');
      var mfD = document.getElementById('jing-bookmark-fab');
      var qfD = document.getElementById('qing-btn');
      if (bfD) window.__wuriMakeDraggable(bfD, 'wuri_jing_fabpos_v1', {});
      if (mfD) window.__wuriMakeDraggable(mfD, 'wuri_jing_fabpos_v1', {});
      if (qfD) window.__wuriMakeDraggable(qfD, 'wuri_jing_fabpos_v1', {});
    }
    // 六爻浮动返回：回到六爻主页面
    var lyBackFab = document.getElementById('liuyao-back-fab');
    if (lyBackFab) {
      lyBackFab.addEventListener('click', function () {
        var btn = document.getElementById('liuyao-back');
        if (btn) btn.click();
      });
    }
    // 定时更新内丹专属按钮可见性
    setInterval(updateFab, 500);
    updateFab();
  });
  // 暴露给外部调用（每日经文推荐等）
  window.JingOpenReader = (typeof JingWen !== 'undefined' && JingWen.openReader) ? JingWen.openReader : null;
  window.JingOpenReaderAt = (typeof JingWen !== 'undefined' && JingWen.openReaderAt) ? JingWen.openReaderAt : null;
})();

/* ---------- 书签·高亮·心得（全部书籍，2026-10-28 晚全书化） ---------- */
(function () {
  'use strict';
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* 内丹书判定（心得/书签的旧数据归类仍用；可用面判定见 marksEnabled） */
  function isNeidanBook(sid) {
    try {
      if (window.JingWen && typeof window.JingWen.isNeidan === 'function') return window.JingWen.isNeidan(sid);
    } catch (e) {}
    return false;
  }
  /* 标记（书签/高亮/心得）适用范围：2026-10-28 晚用户定全书化——精选
     经文、常见内丹、道藏全藏皆可；存储本就按书 id 分键（书签对象
     sid→数组、高亮/心得条目带 sid），「我的标记」汇总天然含三类书 */
  function marksEnabled(sid) {
    return !!sid;
  }
  function currentIsNeidan() {
    var sid = window._jingCurrentId;
    return sid && marksEnabled(sid);
  }

  /* --- 书签 --- */
  function getBookmarks() {
    try { return JSON.parse(localStorage.getItem('wuri_jing_bookmarks') || '{}'); }
    catch (e) { return {}; }
  }
  function saveBookmark(sid) {
    if (!marksEnabled(sid)) return;
    var reader = $('#jing-reader');
    if (!reader || reader.hidden) return;
    // 保存展开的章节 + 滚动位置
    var expanded = [];
    var bodies = document.querySelectorAll('#jing-content .jing-sec-body');
    bodies.forEach(function (b, idx) {
      if (!b.hidden) {
        var sec = b.closest('.jing-sec');
        if (sec) expanded.push(sec.getAttribute('data-sec'));
      }
    });
    var bm = getBookmarks();
    // 支持同一本书多个书签（数组），每个书签记录章节和位置
    if (!bm[sid]) bm[sid] = [];
    if (!Array.isArray(bm[sid])) bm[sid] = [bm[sid]]; // 兼容旧数据
    bm[sid].push({
      off: (window.__wuriReaderOffset ? window.__wuriReaderOffset() : 0),
      scrollTop: window.scrollY || window.pageYOffset || 0,
      expanded: expanded,
      ts: Date.now(),
      id: 'bm' + Date.now() + Math.floor(Math.random() * 1000)
    });
    try { localStorage.setItem('wuri_jing_bookmarks', JSON.stringify(bm)); } catch (e) {}
    showToast('书签已保存');
  }
  // 简单的 Toast 提示
  function showToast(msg) {
    var t = document.getElementById('jing-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'jing-toast';
      t.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:10px 20px;border-radius:20px;font-size:14px;z-index:9999;opacity:0;transition:opacity 0.3s;pointer-events:none;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.style.opacity = '0'; }, 1500);
  }
  function getBookmark(sid) {
    var arr = getBookmarks()[sid];
    if (!arr) return null;
    // 兼容：旧数据是单个对象，新数据是数组，返回最新的
    if (Array.isArray(arr)) return arr[arr.length - 1] || null;
    return arr;
  }
  function getBookmarksForBook(sid) {
    var arr = getBookmarks()[sid];
    if (!arr) return [];
    if (Array.isArray(arr)) return arr;
    return [arr]; // 兼容旧数据
  }
  function deleteBookmark(bmId, sid) {
    var bm = getBookmarks();
    if (sid && bm[sid]) {
      // 按书签ID删除单条
      if (Array.isArray(bm[sid])) {
        bm[sid] = bm[sid].filter(function (b) { return b.id !== bmId; });
        if (!bm[sid].length) delete bm[sid];
      } else {
        delete bm[sid];
      }
    } else if (bm[bmId]) {
      // 兼容旧调用：直接按 key 删除
      delete bm[bmId];
    }
    try { localStorage.setItem('wuri_jing_bookmarks', JSON.stringify(bm)); } catch (e) {}
  }

  /* --- 高亮 --- */
  /* 划线颜色 8 色（2026-10-28 晚反馈批第 9 条由 4 色扩容；旧 4 键不变，
     存量高亮数据直接兼容；色值呈现走 CSS 变量链 --hl-*，三态可辨） */
  var HL_COLORS = {
    yellow: { name: '黄', css: 'hl-yellow', label: '重点经文' },
    green: { name: '绿', css: 'hl-green', label: '修炼口诀' },
    blue: { name: '蓝', css: 'hl-blue', label: '存疑待考' },
    red: { name: '红', css: 'hl-red', label: '警示禁忌' },
    purple: { name: '紫', css: 'hl-purple', label: '感悟体会' },
    orange: { name: '橙', css: 'hl-orange', label: '人物事迹' },
    pink: { name: '粉', css: 'hl-pink', label: '优美文句' },
    teal: { name: '青', css: 'hl-teal', label: '地点时节' }
  };
  function escH(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getHighlights() {
    try { return JSON.parse(localStorage.getItem('wuri_jing_highlights') || '[]'); }
    catch (e) { return []; }
  }
  function saveHighlight(hl) {
    var arr = getHighlights();
    hl.id = 'hl_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    hl.ts = Date.now();
    if (!hl.color) hl.color = 'yellow';
    arr.push(hl);
    try { localStorage.setItem('wuri_jing_highlights', JSON.stringify(arr)); } catch (e) {}
    return hl.id;
  }
  function deleteHighlight(id) {
    // 删除高亮时，其心得一起删除
    var arr = getHighlights().filter(function (h) { return h.id !== id; });
    try { localStorage.setItem('wuri_jing_highlights', JSON.stringify(arr)); } catch (e) {}
    deleteNotesForHighlight(id);
  }
  function getHighlightsFor(sid) {
    return getHighlights().filter(function (h) { return h.sid === sid; });
  }
  function getHighlightById(id) {
    var arr = getHighlights();
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }
  function updateHighlightColor(id, color) {
    var arr = getHighlights();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { arr[i].color = color; break; }
    }
    try { localStorage.setItem('wuri_jing_highlights', JSON.stringify(arr)); } catch (e) {}
  }

  /* --- 心得 --- */
  function getNotes() {
    try { return JSON.parse(localStorage.getItem('wuri_jing_notes') || '[]'); }
    catch (e) { return []; }
  }
  function saveNote(note) {
    var arr = getNotes();
    // 如果已存在该高亮的心得，则更新
    var found = false;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].highlightId === note.highlightId) {
        arr[i].text = note.text;
        arr[i].updatedAt = Date.now();
        found = true;
        break;
      }
    }
    if (!found) {
      note.id = 'nt_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      note.createdAt = Date.now();
      note.updatedAt = Date.now();
      arr.push(note);
    }
    try { localStorage.setItem('wuri_jing_notes', JSON.stringify(arr)); } catch (e) {}
  }
  function deleteNote(id) {
    var arr = getNotes().filter(function (n) { return n.id !== id; });
    try { localStorage.setItem('wuri_jing_notes', JSON.stringify(arr)); } catch (e) {}
  }
  function deleteNotesForHighlight(highlightId) {
    var arr = getNotes().filter(function (n) { return n.highlightId !== highlightId; });
    try { localStorage.setItem('wuri_jing_notes', JSON.stringify(arr)); } catch (e) {}
  }
  function getNoteForHighlight(highlightId) {
    var arr = getNotes();
    for (var i = 0; i < arr.length; i++) if (arr[i].highlightId === highlightId) return arr[i];
    return null;
  }
  function getNotesFor(sid) {
    return getNotes().filter(function (n) { return n.sid === sid; });
  }

  // 供 rubyPara 调用：检查某段某字符是否在高亮范围内（含颜色）
  window._jingHlRanges = {};
  function rebuildHlRanges(sid) {
    window._jingHlRanges = {};
    getHighlightsFor(sid).forEach(function (h) {
      /* 存储恒为原文坐标；标点版模式下经 daozang 字序投影换算到显示段
         （一条原文高亮可横跨多个标点段，逐段同 id 落点） */
      var segs = null;
      if (window.__wuri_dzHlToDisp) { try { segs = window.__wuri_dzHlToDisp(sid, h); } catch (e) {} }
      if (!segs || !segs.length) segs = [{ sec: h.sec, para: h.para, start: h.start, end: h.end }];
      segs.forEach(function (sg) {
        var key = sg.sec + '_' + sg.para;
        if (!window._jingHlRanges[key]) window._jingHlRanges[key] = [];
        window._jingHlRanges[key].push({ start: sg.start, end: sg.end, color: h.color || 'yellow', id: h.id });
      });
    });
  }
  window._jingHlRebuild = rebuildHlRanges;

  // 从 selection 计算在段落纯文本中的偏移
  function getSelOffsets() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    var range = sel.getRangeAt(0);

    // 找到选择范围内的所有段落（支持跨段落）
    var paras = [];
    var allParas = document.querySelectorAll('#jing-content .jing-para');
    for (var i = 0; i < allParas.length; i++) {
      var p = allParas[i];
      try {
        // 检查 range 是否与段落相交
        var pRange = document.createRange();
        pRange.selectNodeContents(p);
        // 相交条件：range.start < p.end && range.end > p.start
        if (range.compareBoundaryPoints(Range.END_TO_START, pRange) < 0 &&
            range.compareBoundaryPoints(Range.START_TO_END, pRange) > 0) {
          paras.push(p);
        }
      } catch (e) {}
    }
    if (!paras.length) return null;

    var results = [];
    var fullText = '';

    paras.forEach(function (para) {
      var secIdx = +(para.getAttribute('data-sec') || 0);
      var paraIdx = +(para.getAttribute('data-para') || 0);

      function textOffset(node, offsetInNode) {
        /* 边界点 → 段内（非 RT）文本偏移。边界容器既可能是文本节点，
           也可能是元素节点：安卓在 ruby 注音文本中选字时常把选区边界锚在
           <ruby>/段落元素上（子节点序号），旧实现只认文本节点、锚到元素时
           恒返回段长，起止相等使整段选区被丢弃、高亮条永不弹（道藏全藏
           注音默认开故必现，内丹无 ruby 不受影响，2026-10-27 真机报）。
           计量法：取「段首→边界点」前缀 Range 的克隆片段，累计其中非 RT
           文本长度——不依赖 compareBoundaryPoints 的符号约定（其实测
           END_TO_START 等跨点比较与同点比较符号相反，逐节点比较法曾在
           文本节点边界上误判，已弃），文本/元素两种边界结果都精确。 */
        var pre = document.createRange();
        try {
          pre.selectNodeContents(para);
          pre.setEnd(node, offsetInNode);
        } catch (e) { return 0; }
        var total = 0;
        try {
          var frag = pre.cloneContents();
          var walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT, null, false);
          var n;
          while ((n = walker.nextNode())) {
            if (n.parentNode && n.parentNode.tagName === 'RT') continue;
            total += n.textContent.length;
          }
        } catch (e) {}
        return total;
      }

      // 计算该段落在选择中的起止
      var start, end;
      try {
        var pRange = document.createRange();
        pRange.selectNodeContents(para);
        // start: range.start 和 para.start 取较晚者
        if (range.compareBoundaryPoints(Range.START_TO_START, pRange) <= 0) {
          start = 0; // 选择从段落开头或更早开始
        } else {
          start = textOffset(range.startContainer, range.startOffset);
        }
        // end: range.end 和 para.end 取较早者
        if (range.compareBoundaryPoints(Range.END_TO_END, pRange) >= 0) {
          // 选择到段落末尾或更晚：取段落纯文本总长度
          var walker2 = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, null, false);
          var n2, total2 = 0;
          while ((n2 = walker2.nextNode())) {
            if (n2.parentNode && n2.parentNode.tagName === 'RT') continue;
            total2 += n2.textContent.length;
          }
          end = total2;
        } else {
          end = textOffset(range.endContainer, range.endOffset);
        }
      } catch (e) { return; }

      if (start < end) {
        // 提取该段的选中文本
        var pText = '';
        try {
          var walker3 = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, null, false);
          var n3, idx3 = 0;
          while ((n3 = walker3.nextNode())) {
            if (n3.parentNode && n3.parentNode.tagName === 'RT') continue;
            var t = n3.textContent;
            var s = Math.max(0, start - idx3);
            var e = Math.min(t.length, end - idx3);
            if (s < e) pText += t.slice(s, e);
            idx3 += t.length;
          }
        } catch (e2) {}
        results.push({
          sec: secIdx, para: paraIdx, start: start, end: end,
          text: pText.trim()
        });
        fullText += pText + ' ';
      }
    });

    if (!results.length) return null;

    /* 标点版模式下选区偏移是标点段坐标，存档前投影回原文坐标
       （存储口径恒原文；投影失败则整批保留原值，绝不静默写错位） */
    if (window.__wuri_dzHlToOrig) {
      try {
        var conv = [], okAll = true;
        results.forEach(function (r) {
          var segs = window.__wuri_dzHlToOrig(window._jingCurrentId, r);
          if (!segs) { okAll = false; return; }
          segs.forEach(function (sg) {
            conv.push({ sec: sg.sec, para: sg.para, start: sg.start, end: sg.end, text: r.text });
          });
        });
        if (okAll && conv.length) results = conv;
      } catch (e) {}
    }

    // 返回数组（跨段落时多条），兼容旧的单条用法
    var out = results;
    out.fullText = fullText.trim().slice(0, 200);
    return out;
  }

  var pendingHl = null;
  var pendingHlId = null; // 用于已存在高亮的操作（换色/写心得/删除）
  var cachedSelInfo = null; // 缓存的最后有效选区（iOS 点按钮时会清掉实时选区，2026-10-11）

  function showHlPop(x, y, isExisting) {
    var pop = $('#hl-pop');
    if (!pop) return;
    /* 两行制（2026-10-29 反馈第二批第 1 项）：按钮一行、八色一行；
       弹窗恒水平居中（CSS left:50%＋translate），不再锚选区横向跑偏；
       已存在态不显原文引文（用户定），自写想法仍显（用户自己的内容） */
    var html = '';
    var colorRow = function (attr) {
      var s = '<div class="hl-pop-row">';
      Object.keys(HL_COLORS).forEach(function (c) {
        s += '<button class="hl-color-btn hl-' + c + '" ' + attr + '="' + c + '" title="' + HL_COLORS[c].label + '">' + HL_COLORS[c].name + '</button>';
      });
      return s + '</div>';
    };
    if (!isExisting) {
      // 新建高亮：按钮一行（分享/图卡/取消）＋八色一行（底部固定）
      html += '<div class="hl-pop-row">'
        + '<button id="hl-share">分享</button>'
        + '<button id="hl-card">图卡</button>'
        + '<button id="hl-cancel">取消</button></div>';
      html += colorRow('data-hl-color');
    } else {
      var exNote = pendingHlId ? getNoteForHighlight(pendingHlId) : null;
      var exNoteText = exNote ? (typeof exNote === 'string' ? exNote : (exNote.text || '')) : '';
      if (exNoteText) html += '<div class="hl-pop-note">想法：' + escH(exNoteText) + '</div>';
      html += '<div class="hl-pop-row">'
        + '<button id="hl-note">' + (exNoteText ? '改想法' : '写想法') + '</button>'
        + '<button id="hl-share">分享</button>'
        + '<button id="hl-card">图卡</button>'
        + '<button id="hl-del">删除</button></div>';
      html += colorRow('data-hl-recolor');
    }
    pop.innerHTML = html;
    pop.hidden = false;
    if (!isExisting) {
      // 新建：底部固定
      pop.classList.add('hl-bottom');
      pop.style.left = '';
      pop.style.top = '';
    } else {
      // 已存在：纵向跟点按处、钳回屏内；横向恒居中（不设 left）
      pop.classList.remove('hl-bottom');
      pop.style.left = '';
      var ph = pop.offsetHeight || 150;
      pop.style.top = Math.max(8, Math.min(y + 10, window.innerHeight - ph - 12)) + 'px';
    }
  }
  function hideHlPop() {
    var pop = $('#hl-pop');
    if (pop) pop.hidden = true;
    pendingHl = null;
    pendingHlId = null;
  }

  /* 分享（2026-10-29 追加）：选中原文＋出处一行（《书名》·节名）纯文本；
     优先系统分享通道 navigator.share，不支持时回落复制＋toast。不自建面板。 */
  function getShareParts() {
    var text = '', sid = null, sec = 0;
    if (pendingHlId) {
      var hl = getHighlightById(pendingHlId);
      if (!hl) return null;
      text = hl.text || '';
      sid = hl.sid || window._jingCurrentId;
      sec = hl.sec || 0;
    } else if (pendingHl) {
      var items = Array.isArray(pendingHl) ? pendingHl : [pendingHl];
      if (!items.length) return null;
      text = items.map(function (it) { return it.text || ''; }).join('');
      if (!text && pendingHl.fullText) text = pendingHl.fullText;
      sid = items[0].sid || window._jingCurrentId;
      sec = items[0].sec || 0;
    }
    text = String(text || '').trim();
    if (!text) return null;
    var secT = '';
    if (sid) { try { secT = getSectionTitle(sid, sec); } catch (e) {} }
    /* 分享物料按当前语言设置出字（简繁跟随系统，2026-10-29）：正文/书名/节名
     * 都走显示层转换（getSectionTitle/getBookTitle 均返回底本原字、未转） */
    var _txFor = window.wuriTxFor || function (s) { return s; };
    return { text: _txFor(text, sid), book: sid ? _txFor(getBookTitle(sid), sid) : '', secTitle: secT ? _txFor(secT, sid) : '' };
  }
  function buildShareText() {
    var p = getShareParts();
    if (!p) return null;
    return p.text + (p.book ? '\n——《' + p.book + '》' + (p.secTitle ? '·' + p.secTitle : '') : '');
  }
  /* 分享图卡（批二第 8 项）：宣纸底＋原文＋出处＋品牌落款，
     Canvas 出图走系统分享（图片）或保存。图卡是对外物料，恒用日间
     宣纸配色，不随夜间/红光变色。超长口径：字号自 40px 逐档降到
     28px 仍超 12 行时，截断至 12 行、末行尾加「……」。
     落款（2026-10-29 改版）：App 图标（香炉三炷香 icon-512）＋文字
     「戊日不上香 APP」紧凑排布居右下；绘制必须等图标加载完成，
     图标未就绪/失败绝不出图（不许出无图标版）。 */
  var _cardIconPromise = null;
  function loadCardIcon() {
    if (_cardIconPromise) return _cardIconPromise;
    _cardIconPromise = new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('card icon load failed')); };
      img.src = 'icon-512.png';
    });
    return _cardIconPromise;
  }
  try { loadCardIcon(); } catch (e) {} /* 预热：点图卡时多半已就绪 */
  function drawShareCard(parts, iconImg) {
    var W = 750, PAD = 56;
    var cv = document.createElement('canvas');
    var ctx = cv.getContext('2d');
    var FONT = '"Songti SC","STSong","Noto Serif CJK SC","SimSun",serif';
    function wrap(fontPx) {
      ctx.font = fontPx + 'px ' + FONT;
      var maxW = W - PAD * 2, lines = [], line = '';
      for (var i = 0; i < parts.text.length; i++) {
        var ch = parts.text[i];
        if (ch === '\n') { lines.push(line); line = ''; continue; }
        if (line && ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; }
        else line += ch;
      }
      if (line) lines.push(line);
      return lines;
    }
    var fontPx = 40, lines = wrap(fontPx);
    while (lines.length > 12 && fontPx > 28) { fontPx -= 4; lines = wrap(fontPx); }
    if (lines.length > 12) {
      lines = lines.slice(0, 12);
      lines[11] = lines[11].slice(0, -1) + '……';
    }
    var lh = Math.round(fontPx * 1.9);
    var H = PAD + lines.length * lh + 30 + 46 + 44 + PAD - 16;
    cv.width = W;
    cv.height = H;
    ctx = cv.getContext('2d');
    ctx.fillStyle = '#f6efdb';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d8c391';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.fillStyle = '#2e2a20';
    ctx.font = fontPx + 'px ' + FONT;
    ctx.textBaseline = 'top';
    var y = PAD;
    lines.forEach(function (ln) { ctx.fillText(ln, PAD, y); y += lh; });
    y += 30;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6b5a35';
    ctx.font = '30px ' + FONT;
    if (parts.book) {
      ctx.fillText('——《' + parts.book + '》' + (parts.secTitle ? '·' + parts.secTitle : ''), W - PAD, y);
    }
    y += 46;
    /* 品牌行：图标在左、文字在右，整组右对齐；文字正常字距，
       「戊日不上香」与「APP」间一个普通空格 */
    var brand = '戊日不上香 APP';
    ctx.fillStyle = '#a5874e';
    ctx.font = '24px ' + FONT;
    var brandW = ctx.measureText(brand).width;
    var IS = 36, IGAP = 10;
    var ix = Math.round(W - PAD - brandW - IGAP - IS);
    var iy = Math.round(y + 4 + (24 - IS) / 2);
    ctx.save();
    ctx.beginPath();
    var ir = 8;
    ctx.moveTo(ix + ir, iy);
    ctx.arcTo(ix + IS, iy, ix + IS, iy + IS, ir);
    ctx.arcTo(ix + IS, iy + IS, ix, iy + IS, ir);
    ctx.arcTo(ix, iy + IS, ix, iy, ir);
    ctx.arcTo(ix, iy, ix + IS, iy, ir);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(iconImg, ix, iy, IS, IS);
    ctx.restore();
    ctx.fillText(brand, W - PAD, y + 4);
    ctx.textAlign = 'left';
    return cv;
  }
  function deliverCardCanvas(cv) {
    var saveFallback = function () {
      try {
        var a = document.createElement('a');
        a.href = cv.toDataURL('image/png');
        a.download = '戊日不上香图卡.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('图卡已保存');
      } catch (e) { showToast('图卡生成失败'); }
    };
    if (cv.toBlob) {
      cv.toBlob(function (blob) {
        if (!blob) { saveFallback(); return; }
        var file = null;
        try { file = new File([blob], 'wuri-card.png', { type: 'image/png' }); } catch (e) {}
        if (file && navigator.canShare && navigator.canShare({ files: [file] }) && typeof navigator.share === 'function') {
          navigator.share({ files: [file] }).then(function () {}, function () { /* 用户取消：不回落保存 */ });
        } else saveFallback();
      }, 'image/png');
    } else saveFallback();
  }
  /* 出图统一管线（打磨批口径）：等图标加载完成再出图，图标失败则不出图 */
  function makeAndDeliverCard(parts) {
    loadCardIcon().then(function (iconImg) {
      deliverCardCanvas(drawShareCard(parts, iconImg));
    }, function () { showToast('图卡生成失败'); });
  }
  function shareCard() {
    var parts = getShareParts(); // 先取文案：hideHlPop 会清空 pending 状态
    hideHlPop();
    try { window.getSelection().removeAllRanges(); } catch (e) {}
    if (!parts) return;
    makeAndDeliverCard(parts);
  }
  /* 任意文案出图卡（周结卡用：parts={text, book:'', secTitle:''}，
     落款与经文图卡同一 drawShareCard＋同一等图标管线） */
  window.__wuriShareCardParts = function (parts) {
    if (!parts || !parts.text) return false;
    makeAndDeliverCard(parts);
    return true;
  };
  window.__wuriMakeCard = function () {
    var parts = getShareParts();
    if (!parts) return Promise.resolve(null);
    return loadCardIcon().then(function (iconImg) {
      var cv = drawShareCard(parts, iconImg);
      return { dataUrl: cv.toDataURL('image/png'), w: cv.width, h: cv.height };
    }, function () { return null; });
  };
  function copyTextFallback(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { legacyCopy(text, done); });
    } else {
      legacyCopy(text, done);
    }
  }
  function legacyCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      done(!!ok);
    } catch (e) { done(false); }
  }
  function shareSelection() {
    var text = buildShareText(); // 先取文案：hideHlPop 会清空 pending 状态
    hideHlPop();
    try { window.getSelection().removeAllRanges(); } catch (e) {}
    if (!text) return;
    if (typeof navigator.share === 'function') {
      try {
        var p = navigator.share({ text: text });
        if (p && p.catch) p.catch(function () { /* 用户取消分享：不回退复制 */ });
      } catch (e) {
        copyTextFallback(text, shareCopyDone);
      }
    } else {
      copyTextFallback(text, shareCopyDone);
    }
  }
  function shareCopyDone(ok) {
    showToast(ok ? '已复制，去粘贴分享' : '复制失败，请长按文字复制');
  }

  /* --- 心得悬浮窗 --- */
  function showNoteModal(highlightId) {
    var hl = getHighlightById(highlightId);
    if (!hl) return;
    var existing = getNoteForHighlight(highlightId);

    var modal = $('#note-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'note-modal';
      modal.className = 'note-modal';
      modal.innerHTML =
        '<div class="note-backdrop" id="note-backdrop"></div>' +
        '<div class="note-box">' +
          '<div class="note-title">写心得</div>' +
          '<div class="note-quote" id="note-quote"></div>' +
          '<textarea class="note-input" id="note-input" placeholder="写下你的感想…"></textarea>' +
          '<div class="note-btns">' +
            '<button id="note-cancel">取消</button>' +
            '<button id="note-save" class="primary">保存</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      $('#note-backdrop').addEventListener('click', hideNoteModal);
      $('#note-cancel').addEventListener('click', hideNoteModal);
      $('#note-save').addEventListener('click', function () {
        var text = $('#note-input').value.trim();
        var hid = modal.getAttribute('data-hl-id');
        if (!hid) return;
        var h = getHighlightById(hid);
        if (!h) return;
        if (text) {
          saveNote({
            highlightId: hid,
            sid: h.sid,
            bookTitle: getBookTitle(h.sid),
            sectionTitle: getSectionTitle(h.sid, h.sec),
            highlightText: h.text,
            text: text
          });
        }
        hideNoteModal();
        // 刷新标记列表（如果正在显示）
        if (window._refreshMarks) window._refreshMarks();
      });
    }
    modal.setAttribute('data-hl-id', highlightId);
    $('#note-quote').textContent = '「' + (window.wuriTxFor || function (s) { return s; })(hl.text || '', hl.sid) + '」';
    $('#note-input').value = existing ? existing.text : '';
    modal.hidden = false;
    setTimeout(function () { $('#note-input').focus(); }, 100);
  }
  function hideNoteModal() {
    var modal = $('#note-modal');
    if (modal) modal.hidden = true;
  }

  function getBookTitle(sid) {
    var idx = window.JINGWEN_INDEX || [];
    for (var i = 0; i < idx.length; i++) if (idx[i].id === sid) return idx[i].title;
    var dz = window.DAOZANG_INDEX && window.DAOZANG_INDEX.works;
    if (dz) for (var j = 0; j < dz.length; j++) if (dz[j].id === sid) return dz[j].title;
    return sid;
  }
  function getSectionTitle(sid, secIdx) {
    try {
      var d = window.JINGWEN && window.JINGWEN[sid];
      if (d && d.sections && d.sections[secIdx]) return d.sections[secIdx].h || '';
    } catch (e) {}
    return '';
  }

  /* 精确定位到某条高亮 */
  function scrollToHighlight(hlId, retryCount) {
    retryCount = retryCount || 0;
    var hl = getHighlightById(hlId);
    if (!hl) return;
    // 全藏懒填充：先把目标卷渲染出来
    if (window.__wuri_dzFill) { try { window.__wuri_dzFill(hl.sec); } catch (e) {} }
    // 先展开目标章节（多章节书默认折叠，高亮可能在隐藏章节里）
    var secBody = document.querySelector('#jing-content .jing-sec[data-sec="' + hl.sec + '"] .jing-sec-body');
    if (secBody && secBody.hidden) {
      secBody.hidden = false;
    }
    // 先按 sec/para 找到段落，再在段内找对应高亮 span（标点版模式先投影到显示段）
    var dispPara = hl.para;
    if (window.__wuri_dzHlToDisp) {
      try {
        var dsg = window.__wuri_dzHlToDisp(hl.sid || window._jingCurrentId, hl);
        if (dsg && dsg.length) dispPara = dsg[0].para;
      } catch (e) {}
    }
    var sel = '#jing-content .jing-para[data-sec="' + hl.sec + '"][data-para="' + dispPara + '"] .hl[data-hl-id="' + hlId + '"]';
    var el = document.querySelector(sel);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // 闪烁提示
      el.classList.add('hl-flash');
      setTimeout(function () { el.classList.remove('hl-flash'); }, 1500);
    } else if (retryCount < 5) {
      // 问题4修复：内容可能还没渲染完，重试
      setTimeout(function () { scrollToHighlight(hlId, retryCount + 1); }, 500);
    } else {
      // 降级：找该段第一处高亮，或滚到该章
      var para = document.querySelector('#jing-content .jing-para[data-sec="' + hl.sec + '"][data-para="' + dispPara + '"] .hl');
      if (para) {
        para.scrollIntoView({ block: 'center' });
      } else {
        var sec = document.querySelector('#jing-content .jing-para[data-sec="' + hl.sec + '"]');
        if (sec) sec.scrollIntoView({ block: 'start' });
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // 书签按钮：仅内丹书显示
    var bmBtn = $('#jing-bookmark');
    if (bmBtn) {
      bmBtn.addEventListener('click', function () {
        var sid = window._jingCurrentId;
        if (!sid || !marksEnabled(sid)) return;
        saveBookmark(sid);
        bmBtn.textContent = '已存✓';
        setTimeout(function () { bmBtn.textContent = '书签'; }, 1500);
      });
    }

    // 选择文字后弹出高亮工具条（仅内丹书）：用 selectionchange + 防抖，避开系统菜单抢时机
    var content = $('#jing-content');
    var selDebounce = null;
    if (content) {
      document.addEventListener('selectionchange', function () {
        if (!currentIsNeidan()) return;
        // 只在阅读器打开时处理
        var reader = $('#jing-reader');
        if (!reader || reader.hidden) return;
        // 如果正在显示"已存在高亮"的操作菜单，不自动隐藏（等用户点按钮或点空白处）
        if (pendingHlId) return;
        // 立即缓存选区（不要等防抖，否则用户点高亮按钮时缓存还是空的）
        try {
          var earlyInfo = getSelOffsets();
          var earlySid = window._jingCurrentId;
          if (earlyInfo && earlyInfo.length && earlySid && marksEnabled(earlySid)) {
            earlyInfo.forEach(function (it) { it.sid = earlySid; });
            cachedSelInfo = earlyInfo;
          }
        } catch (e) {}
        if (selDebounce) clearTimeout(selDebounce);
        selDebounce = setTimeout(function () {
          var info = getSelOffsets();
          if (!info || !info.length) { hideHlPop(); return; }
          var sid = window._jingCurrentId;
          if (!sid || !marksEnabled(sid)) return;
          // info 是数组（支持跨段落），每条加上 sid
          info.forEach(function (it) { it.sid = sid; });
          pendingHl = info; // 数组
          pendingHlId = null;
          cachedSelInfo = info; // 缓存，供高亮按钮使用（iOS 点按钮会清选区）
          showHlPop(0, 0, false); // 底部固定，不需要坐标
        }, 800);
      });

      // 点击已高亮文字：弹出操作菜单（仅内丹书）
      content.addEventListener('click', function (e) {
        if (!currentIsNeidan()) return;
        var hlEl = e.target.closest('.jing-para .hl');
        if (!hlEl) return;
        var hlId = hlEl.getAttribute('data-hl-id');
        if (!hlId) return;
        e.stopPropagation();
        pendingHl = null;
        pendingHlId = hlId;
        var rect = hlEl.getBoundingClientRect();
        showHlPop(rect.left, rect.bottom, true);
      });
    }

    // 高亮 popup 内的按钮（事件委托）
    document.addEventListener('click', function (e) {
      // 新建高亮选颜色
      var colorBtn = e.target.closest('[data-hl-color]');
      if (colorBtn) {
        if (!pendingHl) { hideHlPop(); return; }
        var color = colorBtn.getAttribute('data-hl-color');
        // pendingHl 是数组（支持跨段落），逐条保存
        var items = Array.isArray(pendingHl) ? pendingHl : [pendingHl];
        var sid = items[0] && items[0].sid;
        items.forEach(function (it) {
          it.color = color;
          saveHighlight(it);
        });
        var firstNewId = items[0] && items[0].id;
        if (sid) rebuildHlRanges(sid);
        hideHlPop();
        window.getSelection().removeAllRanges();
        // 重新渲染以显示高亮
        if (window.JingWen) {
          var evt = new CustomEvent('jing-rerender');
          document.dispatchEvent(evt);
        }
        if (items.length === 1 && firstNewId) {
          /* 划完就地写想法（批一第 3 项）：单段新划线落色后以「已存在」
             形态在底部重开小卡（原文＋写想法入口），免再点一次划线 */
          pendingHlId = firstNewId;
          showHlPop(0, 0, true);
          var pop2 = $('#hl-pop');
          if (pop2) { pop2.classList.add('hl-bottom'); pop2.style.left = ''; pop2.style.top = ''; }
        }
        return;
      }
      // 取消
      if (e.target.closest('#hl-cancel')) {
        hideHlPop();
        window.getSelection().removeAllRanges();
        return;
      }
      // 分享（选中文字或已存在高亮皆可；文案与收尾在 shareSelection 内）
      if (e.target.closest('#hl-share')) {
        shareSelection();
        return;
      }
      // 图卡（批二第 8 项，分享旁）
      if (e.target.closest('#hl-card')) {
        shareCard();
        return;
      }
      // 写心得
      if (e.target.closest('#hl-note')) {
        var hid = pendingHlId;
        hideHlPop();
        if (hid) showNoteModal(hid);
        return;
      }
      // 换颜色
      var recolorBtn = e.target.closest('[data-hl-recolor]');
      if (recolorBtn) {
        var rid = pendingHlId;
        var newColor = recolorBtn.getAttribute('data-hl-recolor');
        var rsid = window._jingCurrentId;
        hideHlPop();
        if (rid) {
          updateHighlightColor(rid, newColor);
          rebuildHlRanges(rsid);
          var evt2 = new CustomEvent('jing-rerender');
          document.dispatchEvent(evt2);
        }
        return;
      }
      // 删除高亮
      if (e.target.closest('#hl-del')) {
        var did = pendingHlId;
        var dsid = window._jingCurrentId;
        hideHlPop();
        if (did && confirm('删除这条高亮？它的心得也会一起删除。')) {
          deleteHighlight(did);
          rebuildHlRanges(dsid);
          var evt3 = new CustomEvent('jing-rerender');
          document.dispatchEvent(evt3);
        }
        return;
      }
      // 点击别处隐藏 popup
      if (!e.target.closest('#hl-pop') && !e.target.closest('.jing-para .hl') && !window.getSelection().toString()) {
        hideHlPop();
      }
    });

    // 重新渲染时恢复高亮
    document.addEventListener('jing-rerender', function () {
      var sid = window._jingCurrentId;
      if (sid && window.JingWen && JingWen.openReader) {
        var st = window.scrollY || window.pageYOffset || 0;
        // 保存展开的章节
        var expanded = [];
        var bodies = document.querySelectorAll('#jing-content .jing-sec-body');
        bodies.forEach(function (b) {
          if (!b.hidden) {
            var sec = b.closest('.jing-sec');
            if (sec) expanded.push(sec.getAttribute('data-sec'));
          }
        });
        /* 落点交给 renderReaderBody 的锚点恢复（insistReaderPos 轮询落位）：
           旧实现渲染后 400ms 一次性展开＋scrollTo，与异步渲染/展开/注音赛跑、
           页高未稳时被钳制，真机落色必跳顶（2026-10-27 用户真机报） */
        window._jingAnchorY = st;
        window._jingAnchorExp = expanded;
        window._jingAnchorTs = Date.now();
        /* 高亮提交冻结（2026-10-28 用户报「先闪回旧位、再跳回高亮处」）：
           冻结期内 autopos 写入停摆、重渲落位只认此锚点一处（见
           saveProgressNow / renderReaderBody 的 _hlFrozen 分支） */
        window.__wuriHlFreeze = { id: sid, until: Date.now() + 4000 };
        JingWen.openReader(sid);
        /* 兜底只续期、绝不自行落位：旧实现 900ms 后直接 __wuriInsistPos 在
           半成品 DOM 上先落一次、渲染完成再落一次，正是两段式回闪的第二落点。
           现改为锚点仍未被渲染消费时只刷新其新鲜度＋延长冻结，等渲染消费。 */
        var _fbTries = 0;
        var _fbIv = setInterval(function () {
          _fbTries++;
          if (window._jingAnchorY == null || _fbTries >= 4) { clearInterval(_fbIv); return; }
          window._jingAnchorTs = Date.now();
          if (window.__wuriHlFreeze && window.__wuriHlFreeze.id === sid) window.__wuriHlFreeze.until = Date.now() + 4000;
        }, 900);
      }
    });

    // 顶部书签按钮已废弃（改用悬浮按钮），始终隐藏
    var _bmBtnTop = $('#jing-bookmark');
    if (_bmBtnTop) _bmBtnTop.hidden = true;
  });

  /* 工具栏高亮钮入口：优先用 selectionchange 缓存的选区（iOS 点钮清选区），
     无缓存时取实时选区；置 pendingHl 并弹选色层。与自动弹窗同一作用域实现 */
  function openHlPopForSelection() {
    var sid = window._jingCurrentId;
    if (!sid || !marksEnabled(sid)) return;
    var info = cachedSelInfo;
    if (!info || !info.length) {
      info = getSelOffsets();
      if (!info || !info.length) return;
      info.forEach(function (it) { it.sid = sid; });
    }
    pendingHl = info;
    pendingHlId = null;
    showHlPop(0, 0, false);
  }

  // 暴露给外部
  window.JingMark = {
    openHlPopForSelection: openHlPopForSelection,
    saveBookmark: saveBookmark,
    getBookmark: getBookmark,
    deleteBookmark: deleteBookmark,
    getHighlights: getHighlights,
    getHighlightsFor: getHighlightsFor,
    getHighlightById: getHighlightById,
    deleteHighlight: deleteHighlight,
    getNotes: getNotes,
    getNotesFor: getNotesFor,
    getNoteForHighlight: getNoteForHighlight,
    saveNote: saveNote,
    deleteNote: deleteNote,
    showNoteModal: showNoteModal,
    scrollToHighlight: scrollToHighlight,
    isNeidanBook: isNeidanBook,
    marksEnabled: marksEnabled,
    HL_COLORS: HL_COLORS
  };
})();

/* ---------- 我的标记列表（三页签：书签｜高亮｜心得） ---------- */
(function () {
  'use strict';
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var activeTab = 'bookmark';

  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function fmtTime(ts) {
    var d = new Date(ts);
    return fmtDate(ts) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  /* 日期＋时间（2026-10-29）：同书同日多条书签靠时分区分；存量仅日期
     （'YYYY-MM-DD' 字符串）原样只显日期，坏值显空，绝不 NaN 报错 */
  function fmtDateTime(ts) {
    if (ts == null || ts === '') return '';
    if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return fmtTime(ts);
  }

  function titleOf(sid) {
    var _txf = window.wuriTxFrag || function (s) { return s; };
    var idx = window.JINGWEN_INDEX || [];
    for (var i = 0; i < idx.length; i++) if (idx[i].id === sid) return _txf(idx[i].title);
    var dz = window.DAOZANG_INDEX && window.DAOZANG_INDEX.works;
    if (dz) for (var j = 0; j < dz.length; j++) if (dz[j].id === sid) return _txf(dz[j].title);
    return sid;
  }
  // 暴露给外部调用（每日经文推荐等）
  window.JingTitleOf = titleOf;

  window.__wuriOpenMarks = function (tab) { window._jingMarksUserRequested = true; showMarks(tab || 'lines'); };
  function showMarks(tab) {
    // 守卫：只有用户点了"我的标记"才允许显示，防止 tab 切换时误显示
    if (!window._jingMarksUserRequested && !tab) return;
    try {
    if (tab) activeTab = tab;
    var listEl = $('#jing-list');
    var marksEl = $('#jing-marks');
    var resultsEl = $('#jing-results');
    if (!listEl || !marksEl) return;

    listEl.hidden = true;
    if (resultsEl) resultsEl.hidden = true;
    marksEl.hidden = false;

    var JM = window.JingMark;
    if (!JM) { marksEl.innerHTML = '<p class="hint">加载中…</p>'; return; }

    var html = '<div class="jing-rhead"><button class="mini-btn" id="marks-back">‹ 返回目录</button></div>';
    // 页签
    html += '<div class="marks-tabs">'
      + '<button class="marks-tab' + (activeTab === 'bookmark' ? ' active' : '') + '" data-tab="bookmark">书签</button>'
      + '<button class="marks-tab' + (activeTab === 'highlight' ? ' active' : '') + '" data-tab="highlight">高亮</button>'
      + '<button class="marks-tab' + (activeTab === 'note' ? ' active' : '') + '" data-tab="note">心得</button>'
      + '<button class="marks-tab' + (activeTab === 'lines' ? ' active' : '') + '" data-tab="lines">汇总</button>'
      + '</div>';

    if (activeTab === 'bookmark') {
      html += renderBookmarks(JM);
    } else if (activeTab === 'highlight') {
      html += renderHighlights(JM);
    } else if (activeTab === 'lines') {
      html += renderLines(JM);
    } else {
      html += renderNotes(JM);
    }

    marksEl.innerHTML = html;
    if (activeTab === 'lines') bindLinesTools(JM);
    window._refreshMarks = function () { showMarks(); };
    } catch (e) {
      var me = $('#jing-marks');
      if (me) { me.hidden = false; me.innerHTML = '<p class="hint">出错：' + esc(e && e.message) + '</p>'; }
    }
  }

  function renderBookmarks(JM) {
    var bm = {};
    try { bm = JSON.parse(localStorage.getItem('wuri_jing_bookmarks') || '{}'); } catch (e) {}
    // 只显示内丹书的书签（每本书可有多个书签）
    var keys = Object.keys(bm).filter(function (sid) { return JM.marksEnabled(sid); });
    var total = 0;
    keys.forEach(function (sid) {
      var arr = bm[sid];
      if (Array.isArray(arr)) total += arr.length;
      else if (arr) total += 1;
    });
    var html = '<h3 class="jing-sec-h">书签（' + total + '）</h3>';
    if (!total) {
      html += '<p class="hint">暂无书签。阅读时点右侧悬浮书签钮保存进度。</p>';
    } else {
      keys.forEach(function (sid) {
        var arr = bm[sid];
        if (!Array.isArray(arr)) arr = arr ? [arr] : [];
        arr.forEach(function (b) {
          var bmId = b.id || sid;
          html += '<div class="jing-hl-item" data-open-bm="' + bmId + '" data-sid="' + sid + '">'
            + '<div><span class="jing-book">' + (/^KR5/.test(sid) ? '藏' : '丹') + '</span> ' + esc(titleOf(sid)) + '</div>'
            + '<div class="hl-meta">' + fmtDateTime(b.ts) + ' · 点击继续阅读</div>'
            + '<span class="hl-del" data-del-bm="' + bmId + '" data-sid="' + sid + '">删除</span>'
            + '</div>';
        });
      });
    }
    return html;
  }

  function renderHighlights(JM) {
    var hls = JM.getHighlights().filter(function (h) { return JM.marksEnabled(h.sid); });
    var colors = JM.HL_COLORS || {};
    var html = '<h3 class="jing-sec-h">高亮（' + hls.length + '）</h3>';
    if (!hls.length) {
      html += '<p class="hint">暂无高亮。在任意书籍中长按选择文字即可高亮。</p>';
    } else {
      var bySid = {};
      hls.forEach(function (h) {
        if (!bySid[h.sid]) bySid[h.sid] = [];
        bySid[h.sid].push(h);
      });
      Object.keys(bySid).forEach(function (sid) {
        html += '<div class="hl-meta" style="padding:8px 14px 0">' + esc(titleOf(sid)) + '</div>';
        bySid[sid].forEach(function (h) {
          var c = colors[h.color] || colors.yellow || {};
          var _txH = window.wuriTxFor || function (s) { return s; };
          html += '<div class="jing-hl-item" data-open-hl="' + h.id + '" data-sid="' + h.sid + '">'
            + '<div><span class="hl-text hl-' + (h.color || 'yellow') + '">' + esc(_txH(h.text, h.sid)) + '</span></div>'
            + '<div class="hl-meta">' + esc(c.label || '') + ' · ' + fmtDate(h.ts) + ' · 点击定位原文</div>'
            + '<span class="hl-del" data-del-hl="' + h.id + '">删除</span>'
            + '</div>';
        });
      });
    }
    return html;
  }

  function renderNotes(JM) {
    var notes = JM.getNotes().filter(function (n) { return JM.marksEnabled(n.sid); });
    // 按更新时间倒序
    notes.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    var html = '<h3 class="jing-sec-h">心得（' + notes.length + '）</h3>';
    if (!notes.length) {
      html += '<p class="hint">暂无心得。点一条高亮，选"写心得"即可记录感想。</p>';
    } else {
      notes.forEach(function (n) {
        var preview = n.text.length > 60 ? n.text.slice(0, 60) + '…' : n.text;
        html += '<div class="jing-hl-item" data-open-note="' + n.id + '" data-hl="' + n.highlightId + '" data-sid="' + n.sid + '">'
          + '<div class="note-preview">' + esc(preview) + '</div>'
          + '<div class="note-quote">' + esc('「' + ((window.wuriTxFor || function (s) { return s; })(n.highlightText || '', n.sid)).slice(0, 50) + '」') + '</div>'
          + '<div class="hl-meta">' + esc(n.bookTitle ? (window.wuriTxFor || function (s) { return s; })(n.bookTitle, n.sid) : titleOf(n.sid)) + ' · ' + fmtTime(n.updatedAt || n.createdAt) + ' · 点击回到原文</div>'
          + '<span class="hl-del" data-del-note="' + n.id + '">删除</span>'
          + '</div>';
      });
    }
    return html;
  }

  /* ---------- 我的标记汇总（跨书聚合高亮＋心得：可检索/导出/随机回顾；
     2026-10-28 晚反馈批第 6 条由「我的划线」改名「我的标记」） ---------- */
  var linesQ = '', linesScope = 'all';
  var HL_DOT = { yellow: '#d9a916', green: '#5da463', blue: '#5b8dd6', red: '#d65b5b', purple: '#9b6dd6', orange: '#e08b2d', pink: '#e07ba0', teal: '#3d9b9b' };
  /* 「本书」上下文：阅读器开着时为当前书，否则取 autopos 最近读过的一部 */
  function linesBookSid() {
    if (window._jingCurrentId) return window._jingCurrentId;
    try {
      var m = JSON.parse(localStorage.getItem('wuri_jing_autopos') || '{}');
      var best = null, bt = 0;
      Object.keys(m).forEach(function (k) { if ((m[k].ts || 0) > bt) { bt = m[k].ts; best = k; } });
      return best;
    } catch (e) { return null; }
  }
  function linesData(JM) {
    var bookSid = linesBookSid();
    var hls = JM.getHighlights().filter(function (h) { return JM.marksEnabled(h.sid); });
    if (linesScope === 'book' && bookSid) hls = hls.filter(function (h) { return h.sid === bookSid; });
    if (linesQ) {
      var q = linesQ;
      hls = hls.filter(function (h) {
        var note = JM.getNoteForHighlight(h.id);
        if ((h.text || '').indexOf(q) >= 0 || titleOf(h.sid).indexOf(q) >= 0 ||
          (note && note.text.indexOf(q) >= 0)) return true;
        /* 简繁归一兜底：原文/显示文/查询词任一字形不同都应命中（与全库搜索同口径） */
        try {
          if (window.t2s) {
            var nq = window.t2s(q);
            if (window.t2s(h.text || '').indexOf(nq) >= 0) return true;
            if (window.t2s(titleOf(h.sid)).indexOf(nq) >= 0) return true;
          }
          var _txH = window.wuriTxFor || function (s) { return s; };
          if (_txH(h.text || '', h.sid).indexOf(q) >= 0) return true;
        } catch (e) {}
        return false;
      });
    }
    var bySid = {}, order = [];
    hls.forEach(function (h) {
      if (!bySid[h.sid]) { bySid[h.sid] = []; order.push(h.sid); }
      bySid[h.sid].push(h);
    });
    order.sort(function (a, b) {
      var ta = Math.max.apply(null, bySid[a].map(function (h) { return h.ts || 0; }));
      var tb = Math.max.apply(null, bySid[b].map(function (h) { return h.ts || 0; }));
      return tb - ta;
    });
    order.forEach(function (sid) {
      bySid[sid].sort(function (a, b) {
        return (a.sec - b.sec) || (a.para - b.para) || (a.start - b.start);
      });
    });
    return { bySid: bySid, order: order, total: hls.length };
  }
  function linesSecLabel(h) {
    var dz = window.DAOZANG_INDEX && window.DAOZANG_INDEX.works;
    if (dz) for (var j = 0; j < dz.length; j++) if (dz[j].id === h.sid) return dz[j].juan > 1 ? '第 ' + (h.sec + 1) + ' 卷 · ' : '';
    return h.sec > 0 ? '第 ' + (h.sec + 1) + ' 卷 · ' : '';
  }
  function renderLinesList(JM) {
    var data = linesData(JM);
    var colors = JM.HL_COLORS || {};
    var _txL = window.wuriTxFor || function (s) { return s; };
    if (!data.total) return '<p class="hint">没有符合条件的划线。</p>';
    var html = '';
    data.order.forEach(function (sid) {
      html += '<div class="hl-meta" style="padding:10px 14px 0;font-size:.95rem;color:var(--ink)">' + esc(titleOf(sid)) + '（' + data.bySid[sid].length + '）</div>';
      data.bySid[sid].forEach(function (h) {
        var c = colors[h.color] || colors.yellow || {};
        var note = JM.getNoteForHighlight(h.id);
        html += '<div class="jing-hl-item" data-open-hl="' + h.id + '" data-sid="' + h.sid + '">'
          + '<div><span class="hl-dot" style="background:' + (HL_DOT[h.color] || HL_DOT.yellow) + '"></span>'
          + '<span class="hl-text hl-' + (h.color || 'yellow') + '">' + esc(_txL(h.text, h.sid)) + '</span></div>'
          + (note ? '<div class="note-preview" style="margin-top:4px">✎ ' + esc(note.text.length > 80 ? note.text.slice(0, 80) + '…' : note.text) + '</div>' : '')
          + '<div class="hl-meta">' + esc(c.label || '') + ' · ' + linesSecLabel(h) + fmtDate(h.ts) + ' · 点击定位原文</div>'
          + '<span class="hl-del" data-del-hl="' + h.id + '">删除</span>'
          + '</div>';
      });
    });
    return html;
  }
  function renderLines(JM) {
    var data = linesData(JM);
    var bookSid = linesBookSid();
    var html = '<h3 class="jing-sec-h">我的标记（' + data.total + '）</h3>'
      + '<div class="lines-tools">'
      + '<input class="lines-search" id="lines-q" type="search" placeholder="搜索划线、心得、书名…" value="' + esc(linesQ) + '">'
      + '<span class="lines-seg">'
      + '<button data-lines-scope="all"' + (linesScope === 'all' ? ' class="active"' : '') + '>全部</button>'
      + '<button data-lines-scope="book"' + (linesScope === 'book' ? ' class="active"' : '') + (bookSid ? '' : ' disabled style="opacity:.4"') + '>本书</button>'
      + '</span></div>'
      + '<div class="lines-tools">'
      + '<button class="mini-btn" id="lines-random">随机回顾</button>'
      + '<button class="mini-btn" id="lines-export-md">导出 Markdown</button>'
      + '<button class="mini-btn" id="lines-export-txt">导出 TXT</button>'
      + '</div>'
      + '<div class="lines-note">跨书汇总全部划线与心得，点任一条跳回原文。</div>'
      + '<div id="lines-list">' + renderLinesList(JM) + '</div>';
    return html;
  }
  function linesExportText(JM, md) {
    var data = linesData(JM);
    var out = [];
    var stamp = new Date();
    var ds = stamp.getFullYear() + '-' + ('0' + (stamp.getMonth() + 1)).slice(-2) + '-' + ('0' + stamp.getDate()).slice(-2);
    out.push(md ? '# 我的标记' : '我的标记');
    out.push((md ? '' : '') + '导出于 ' + ds + '，共 ' + data.total + ' 条');
    data.order.forEach(function (sid) {
      out.push('');
      out.push(md ? '## ' + titleOf(sid) : '【' + titleOf(sid) + '】');
      data.bySid[sid].forEach(function (h) {
        var c = (JM.HL_COLORS || {})[h.color] || {};
        var d = new Date(h.ts || 0);
        var dstr = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
        out.push((md ? '- ' : '· ') + '「' + ((window.wuriTxFor || function (s) { return s; })(h.text || '', h.sid)) + '」（' + (c.label || '') + ' · ' + linesSecLabel(h).replace(/ · $/, '') + (linesSecLabel(h) ? ' · ' : '') + dstr + '）');
        var note = JM.getNoteForHighlight(h.id);
        if (note) out.push((md ? '  - 心得：' : '  心得：') + note.text);
      });
    });
    return out.join('\n') + '\n';
  }
  function downloadTextFile(name, text) {
    var b = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var u = URL.createObjectURL(b);
    var a = document.createElement('a');
    a.href = u; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 500);
  }
  function bindLinesTools(JM) {
    var q = document.getElementById('lines-q');
    if (q) {
      var deb = null;
      q.addEventListener('input', function () {
        if (deb) clearTimeout(deb);
        deb = setTimeout(function () {
          linesQ = q.value.trim();
          var host = document.getElementById('lines-list');
          if (host) host.innerHTML = renderLinesList(JM);
          var head = document.querySelector('#jing-marks .jing-sec-h');
          if (head) head.textContent = '我的标记（' + linesData(JM).total + '）';
        }, 250);
      });
    }
    document.querySelectorAll('[data-lines-scope]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        linesScope = btn.getAttribute('data-lines-scope');
        showMarks('lines');
      });
    });
    var rnd = document.getElementById('lines-random');
    if (rnd) rnd.addEventListener('click', function () {
      var all = JM.getHighlights().filter(function (h) { return JM.marksEnabled(h.sid); });
      if (!all.length) return;
      var h = all[Math.floor(Math.random() * all.length)];
      hideMarks();
      if (window.JingWen) {
        JingWen.openReader(h.sid);
        setTimeout(function () { if (window.JingMark) window.JingMark.scrollToHighlight(h.id); }, 600);
      }
    });
    var exMd = document.getElementById('lines-export-md');
    if (exMd) exMd.addEventListener('click', function () {
      var d = new Date();
      downloadTextFile('wuri-lines-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '.md', linesExportText(JM, true));
    });
    var exTxt = document.getElementById('lines-export-txt');
    if (exTxt) exTxt.addEventListener('click', function () {
      var d = new Date();
      downloadTextFile('wuri-lines-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '.txt', linesExportText(JM, false));
    });
  }

  function hideMarks() {
    var listEl = $('#jing-list');
    var marksEl = $('#jing-marks');
    if (listEl) listEl.hidden = false;
    if (marksEl) marksEl.hidden = true;
    window._refreshMarks = null;
    /* 回目录/点条目跳书都经此路：阅读返回点就此作废（‹ 钮的回阅读器
       路径不经 hideMarks，见下方 #marks-back 处理） */
    window._marksReturn = null;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = $('#jing-mymarks');
    if (btn) btn.addEventListener('click', function () {
      try {
        window._jingMarksUserRequested = true;
        showMarks('bookmark');
      } catch (e) {
        alert('我的标记出错：' + (e && e.message));
      }
    });

    document.addEventListener('click', function (e) {
      // 页签切换（只处理标记页内部的书签/高亮/心得，不处理底部主导航）
      var tab = e.target.closest('[data-tab]');
      if (tab) {
        var tabName = tab.getAttribute('data-tab');
        if (tabName === 'bookmark' || tabName === 'highlight' || tabName === 'note' || tabName === 'lines') {
          showMarks(tabName);
          return;
        }
        // 主导航的 data-tab (tab-home/tab-jing等) 不在这里处理，交给 app.js
      }
      // 返回：从阅读页进来（_marksReturn 在）→ 回刚才那本书＋原位
      // （反馈批第 6 条）；从目录进来 → 回目录列表
      if (e.target.closest('#marks-back')) {
        if (window._marksReturn && window.__wuriReturnToReader && window.__wuriReturnToReader()) return;
        hideMarks(); if (window.__wuriRefreshMarksRow) window.__wuriRefreshMarksRow(); return;
      }
      // 删除书签
      var delBm = e.target.closest('[data-del-bm]');
      if (delBm) {
        e.stopPropagation();
        if (window.JingMark) window.JingMark.deleteBookmark(delBm.getAttribute('data-del-bm'), delBm.getAttribute('data-sid'));
        showMarks();
        return;
      }
      // 删除高亮（含心得）
      var delHl = e.target.closest('[data-del-hl]');
      if (delHl) {
        e.stopPropagation();
        if (confirm('删除这条高亮？它的心得也会一起删除。')) {
          if (window.JingMark) window.JingMark.deleteHighlight(delHl.getAttribute('data-del-hl'));
          showMarks();
        }
        return;
      }
      // 删除心得
      var delNote = e.target.closest('[data-del-note]');
      if (delNote) {
        e.stopPropagation();
        if (confirm('删除这条心得？')) {
          if (window.JingMark) window.JingMark.deleteNote(delNote.getAttribute('data-del-note'));
          showMarks();
        }
        return;
      }
      // 点击书签打开经文
      var openJing = e.target.closest('[data-open-bm]');
      if (openJing) {
        var bmId = openJing.getAttribute('data-open-bm');
        var jsid = openJing.getAttribute('data-sid');
        hideMarks();
        if (window.JingWen) {
          JingWen.openReader(jsid);
          // 恢复书签的展开章节 + 滚动位置（按书签ID找具体那条）
          var bm = null;
          try {
            var allBm = JSON.parse(localStorage.getItem('wuri_jing_bookmarks') || '{}')[jsid];
            if (Array.isArray(allBm)) {
              bm = allBm.filter(function (b) { return b.id === bmId; })[0] || allBm[allBm.length - 1];
            } else {
              bm = allBm;
            }
          } catch (e) {}
          if (bm) {
            var tries = 0;
            var iv = setInterval(function () {
              tries++;
              var reader = $('#jing-reader');
              if (!reader || reader.hidden) {
                if (tries > 10) clearInterval(iv);
                return;
              }
              // 先展开保存的章节
              if (bm.expanded && bm.expanded.length) {
                bm.expanded.forEach(function (secIdx) {
                  if (window.__wuri_dzFill) { try { window.__wuri_dzFill(secIdx); } catch (e) {} }
                  var body = document.querySelector('#jing-content .jing-sec[data-sec="' + secIdx + '"] .jing-sec-body');
                  if (body) body.hidden = false;
                });
              }
              // 再恢复滚动位置（页面是window滚动）
              if (bm.scrollTop != null) {
                window.scrollTo(0, bm.scrollTop);
                // 确认滚动生效
                var curY = window.scrollY || window.pageYOffset || 0;
                if (Math.abs(curY - bm.scrollTop) < 5 || tries > 10) {
                  clearInterval(iv);
                }
              } else {
                clearInterval(iv);
              }
            }, 300);
          }
        }
        return;
      }
      // 点击高亮精确定位原文
      var openHl = e.target.closest('[data-open-hl]');
      if (openHl) {
        var hsid = openHl.getAttribute('data-sid');
        var hlId = openHl.getAttribute('data-open-hl');
        hideMarks();
        if (window.JingWen) {
          JingWen.openReader(hsid);
          setTimeout(function () {
            if (window.JingMark) window.JingMark.scrollToHighlight(hlId);
          }, 600);
        }
        return;
      }
      // 点击心得：回到原文 + 打开心得悬浮窗
      var openNote = e.target.closest('[data-open-note]');
      if (openNote) {
        var nsid = openNote.getAttribute('data-sid');
        var nhlId = openNote.getAttribute('data-hl');
        hideMarks();
        if (window.JingWen) {
          JingWen.openReader(nsid);
          setTimeout(function () {
            if (window.JingMark) {
              window.JingMark.scrollToHighlight(nhlId);
              // 再打开心得查看/编辑
              setTimeout(function () { window.JingMark.showNoteModal(nhlId); }, 800);
            }
          }, 600);
        }
        return;
      }
    });
  });

  // 全局兜底：供 HTML onclick 直接调用（防止 DOMContentLoaded 绑定失败）
  window.JingShowMarks = function (tab) {
    try {
      window._jingMarksUserRequested = true;
      showMarks(tab || 'bookmark');
    } catch (e) {
      alert('我的标记出错：' + (e && e.message));
    }
  };
})();
