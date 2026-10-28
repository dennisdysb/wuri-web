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
  var turnMode = 'scroll'; /* 翻页方式：'scroll' 上下滚动（默认）｜'page' 左右翻页 */
  var reciteMode = false; /* 背诵模式：只显示每句首字，点句显示全文 */
  var followMode = false; /* 跟读模式：点段落从该处开始播，播放时高亮跟随 */
  var followMap = null; /* tsIdx -> {el, start} */
  var followElToTs = null; /* element -> tsIdx */
  var _followTimer = null;
  var _followCurEl = null;

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function isPro() { return window.WuriPro && WuriPro.isPro(); }
  /* 经文简繁转换：经文源文件为繁体；繁体模式直接显示，简体模式转简体 */
  function txScript(s) {
    if (!s) return s;
    var lang = 'zh-CN';
    try {
      if (window.I18N && typeof window.curLang === 'function') lang = window.curLang();
      else if (document.documentElement.getAttribute('lang') === 'zh-TW') lang = 'zh-TW';
    } catch (e) {}
    if (lang === 'zh-TW') {
      // 繁体模式：源文已为繁体，直接返回（不再做 S2T，避免误转）
      return s;
    }
    // 简体模式：繁转简
    if (window.t2s && typeof window.t2s === 'function') return window.t2s(s);
    return s;
  }
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
          + '<span class="jing-title">' + esc(it.title) + '</span>'
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
            + '<span class="jing-title">' + esc(it.title) + '</span>'
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
    var t = p.t, py = p.py;
    
    // 按 。！？；切句，保留标点
    var sens = t.match(/[^。！？；]+[。！？；]?/g) || [t];
    var out = '', pos = 0;
    sens.forEach(function (sen) {
      if (!sen) return;
      var firstCh = sen.charAt(0);
      var dispCh = txScript(firstCh);
      // 找首字拼音
      var pyIdx = t.indexOf(sen, pos);
      var r = (pyIdx >= 0 && py[pyIdx]) ? py[pyIdx] : '';
      var firstHtml = r ? '<ruby>' + esc(dispCh) + '<rt>' + esc(r) + '</rt></ruby>' : esc(dispCh);
      // 全文其余部分（隐藏，点击显示）
      // rest：去掉首字后的剩余部分
      var restHtml = '';
      for (var j = 1; j < sen.length; j++) {
        var ch2 = sen[j], rr2 = (pyIdx >= 0) ? (py[pyIdx + j] || '') : '';
        ch2 = txScript(ch2);
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
  /* 跳到第 secIdx 节并展开（懒填充卷先填后展）；charOff>0 时再定位到节内对应段 */
  function jumpToSec(secIdx, charOff) {
    if (secIdx == null) return;
    if (isPaged() && currentId && _metrics) {
      ensureSecFilled(secIdx);
      var toff = (_metrics.cum[secIdx] || 0) + (charOff || 0);
      goToContentOffset(toff);
      /* 后续卷填充会改变分页：挂恢复轮询按同一字偏移复位直至版面稳定 */
      _restoreOff = toff;
      pagedRestorePos();
      return;
    }
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
  function insistReaderPos(sid, y, expanded) {
    var tries = 0, hits = 0, lastCur = -1, stableTicks = 0, t0 = Date.now();
    var iv = setInterval(function () {
      tries++;
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
  var _statusMode = 'vol';
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
    var secLens = [], paraLens = [], cum = [], total = 0;
    d.sections.forEach(function (sec) {
      cum.push(total);
      var pl = [], sl = 0;
      (sec.paras || []).forEach(function (p) {
        var L = p.img ? 0 : stripContent(p.t).length;
        pl.push(L); sl += L;
      });
      paraLens.push(pl); secLens.push(sl); total += sl;
    });
    _metrics = { secLens: secLens, paraLens: paraLens, cum: cum, total: total };
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
  /* ---------- 左右翻页模式（二期，2026-10-28） ----------
   * 形态：#jing-reader 变全屏 stage（position:fixed），#jing-content 横向滚动
   * ＋CSS 多列分页（列宽＝可视宽－左右 padding、列距＝padding 和，保证一列
   * 恰为一页、scrollLeft 按 clientWidth 整页步进）。位置一律走「内容字偏移」
   * 同一坐标系（_metrics 累计字数），与滚动模式共用 autopos/书签/进度口径：
   * autopos 与书签另存 off 字段，跨模式打开按 off 落位、分页重排不漂。
   * 懒填充：fillAhead 预填当前页后 3 页内的未填充卷，填充若动到当前页之前
   * 的版面则按锚点偏移复位。跟读/划线点跳/目录跳卷在分页下改走 goToParaPage。 */
  var _pageAnchorOff = 0, _pagedSnapId = null, _restoreOff = null, _fillAheadT = null, _restoreGen = 0, _turnSwitchOff = null;
  function isPaged() { return turnMode === 'page'; }
  function pageScroller() { return $('#jing-content'); }
  function pageW() { var sc = pageScroller(); return sc ? sc.clientWidth : 0; }
  function pageCount() {
    var sc = pageScroller(), w = pageW();
    if (!sc || !w) return 1;
    return Math.max(1, Math.ceil((sc.scrollWidth - 1) / w));
  }
  function curPage() {
    var sc = pageScroller(), w = pageW();
    if (!sc || !w) return 0;
    return Math.max(0, Math.min(pageCount() - 1, Math.round(sc.scrollLeft / w)));
  }
  function paraContentOff(p) {
    if (!_metrics || !p) return 0;
    var si = +p.getAttribute('data-sec'), pi = +p.getAttribute('data-para');
    var off = _metrics.cum[si] || 0, pl = _metrics.paraLens[si] || [];
    for (var i = 0; i < pi && i < pl.length; i++) off += pl[i];
    return off;
  }
  function ensureSecFilled(si) {
    var body = document.querySelector('#jing-content .jing-sec[data-sec="' + si + '"] .jing-sec-body');
    if (body && body.hasAttribute('data-lazy') && window.__wuri_dzFill) { try { window.__wuri_dzFill(si); } catch (e) {} }
  }
  /* 某页的起始内容字偏移：第一段其横坐标落入该页（或跨入该页）的段 */
  function pageOffset(page) {
    var sc = pageScroller(); if (!sc || !_metrics) return 0;
    var sr = sc.getBoundingClientRect(), w = pageW(); if (!w) return 0;
    var px = page * w, off = 0, straddle = null;
    var secs = sc.querySelectorAll('.jing-sec');
    for (var k = 0; k < secs.length; k++) {
      var secEl = secs[k], si = +secEl.getAttribute('data-sec');
      var r = secEl.getBoundingClientRect();
      var x0 = r.left - sr.left + sc.scrollLeft, x1 = x0 + r.width;
      if (x1 <= px) { off = (_metrics.cum[si] || 0) + (_metrics.secLens[si] || 0); continue; }
      if (x0 > px) break;
      var ps = secEl.querySelectorAll('p.jing-para');
      for (var i = 0; i < ps.length; i++) {
        var pr = ps[i].getBoundingClientRect();
        var qx = pr.left - sr.left + sc.scrollLeft;
        if (qx >= px - 8) return paraContentOff(ps[i]);
        straddle = ps[i];
      }
      if (straddle) return paraContentOff(straddle);
    }
    return Math.min(off, _metrics.total);
  }
  /* 当前阅读位置的内容字偏移（双模式统一口径，供进度/autopos/书签共用）。
     分页下末页即全书末页、整页在目 → 计 total（同滚动到底规则）。 */
  function currentContentOffset() {
    if (!_metrics || !_metrics.total) return 0;
    if (isPaged()) {
      var cp = curPage();
      if (cp >= pageCount() - 1 && pageCount() > 1) {
        /* 末页判读完须实证：末段确已排进当前页（版面未就绪时 pageCount 会
           暂时为 1/偏小，此时误判 total 会毒化锚点——实测 TOC 跳卷被冲到书末） */
        var sc3 = pageScroller(), ps3 = sc3 ? sc3.querySelectorAll('p.jing-para') : [];
        if (ps3.length) {
          var sr3 = sc3.getBoundingClientRect();
          var lx = ps3[ps3.length - 1].getBoundingClientRect().left - sr3.left + sc3.scrollLeft;
          if (Math.floor(lx / pageW()) <= cp) return _metrics.total;
        }
      }
      return pageOffset(cp);
    }
    return effContentOffset();
  }
  function goToPage(p, smooth) {
    var sc = pageScroller(), w = pageW(); if (!sc || !w) return;
    p = Math.max(0, Math.min(pageCount() - 1, p));
    sc.scrollTo({ left: p * w, behavior: smooth ? 'smooth' : 'auto' });
    scheduleReadUI(); pagedFillAheadSoon();
  }
  function goToContentOffset(off, instant) {
    var sc = pageScroller(); if (!sc || !_metrics || !pageW()) return;
    off = Math.max(0, Math.min(off, _metrics.total));
    var si = secIdxAtOffset(off);
    ensureSecFilled(si);
    var acc = _metrics.cum[si] || 0, pl = _metrics.paraLens[si] || [], pi = 0;
    for (var i = 0; i < pl.length; i++) { if (acc + pl[i] > off) { pi = i; break; } acc += pl[i]; pi = i; }
    var el = document.querySelector('#jing-content .jing-para[data-sec="' + si + '"][data-para="' + pi + '"]');
    if (!el) el = document.querySelector('#jing-content .jing-para[data-sec="' + si + '"]');
    if (!el) return;
    var sr = sc.getBoundingClientRect();
    var x = el.getBoundingClientRect().left - sr.left + sc.scrollLeft;
    var pg = Math.max(0, Math.floor(x / pageW()));
    sc.scrollTo({ left: pg * pageW(), behavior: instant ? 'auto' : 'smooth' });
    _pageAnchorOff = off; _pagedSnapId = currentId;
  }
  function pagedFillAheadSoon() {
    if (_fillAheadT) return;
    _fillAheadT = setTimeout(function () { _fillAheadT = null; pagedFillAhead(); }, 250);
  }
  function pagedFillAhead() {
    if (!isPaged() || !currentId) return;
    var sc = pageScroller(); if (!sc) return;
    var sr = sc.getBoundingClientRect(), w = pageW(); if (!w) return;
    var limitX = (curPage() + 3) * w, curX = curPage() * w, shifted = false;
    document.querySelectorAll('#jing-content .jing-sec').forEach(function (secEl) {
      var body = secEl.querySelector('.jing-sec-body');
      if (!body || !body.hasAttribute('data-lazy')) return;
      var x = secEl.getBoundingClientRect().left - sr.left + sc.scrollLeft;
      if (x <= limitX) {
        if (window.__wuri_dzFill) { try { window.__wuri_dzFill(+secEl.getAttribute('data-sec')); } catch (e) {} }
        if (x < curX + w) shifted = true;
      }
    });
    if (shifted && _restoreOff == null) goToContentOffset(_pageAnchorOff, true);
  }
  function sizePagedColumns() {
    var sc = pageScroller(); if (!sc) return;
    var cs = window.getComputedStyle(sc);
    var pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var w = sc.clientWidth - pad;
    if (w > 40) { sc.style.columnWidth = w + 'px'; sc.style.columnGap = pad + 'px'; }
  }
  function syncPagedChrome() {
    var reader = $('#jing-reader');
    var on = isPaged() && !!currentId && reader && !reader.hidden;
    if (reader) reader.classList.toggle('reader-paged', !!on);
    document.body.style.overflow = on ? 'hidden' : '';
    if (on) { sizePagedColumns(); updateTurnBtn(); }
  }
  function applyTurnMode() {
    var off = 0;
    if (_turnSwitchOff != null) { off = _turnSwitchOff; _turnSwitchOff = null; }
    else { try { off = currentContentOffset(); } catch (e) {} }
    syncPagedChrome();
    if (!currentId) return;
    if (isPaged()) {
      pagedFillAhead();
      _restoreOff = off;
      pagedRestorePos();
    } else {
      var si = _metrics ? secIdxAtOffset(off) : 0;
      jumpToSec(si, _metrics ? Math.max(0, off - (_metrics.cum[si] || 0)) : 0);
    }
    updateTurnBtn();
  }
  function pagedRestorePos() {
    var gen = ++_restoreGen;
    if (!isPaged() || !currentId || _restoreOff == null) return;
    var tries = 0, target = _restoreOff, lastSW = -1, lastSL = -1, stable = 0;
    var iv = setInterval(function () {
      tries++;
      if (gen !== _restoreGen || !isPaged() || !currentId || _restoreOff == null) { clearInterval(iv); return; }
      pagedFillAhead();
      goToContentOffset(target, true);
      var sc = pageScroller();
      var sw = sc ? sc.scrollWidth : 0, sl = sc ? sc.scrollLeft : 0;
      if (sw === lastSW && sl === lastSL) stable++; else stable = 0;
      lastSW = sw; lastSL = sl;
      /* 版面（scrollWidth）与落点连稳 4 拍才收：注音/标点异步重排未完时
         目标段横坐标还在漂，提前收手会被甩在旧位置（实测重进落位偏小） */
      if (stable >= 4 || tries >= 60) { clearInterval(iv); if (_restoreOff === target) _restoreOff = null; }
    }, 180);
  }
  function updateTurnBtn() {
    var b = $('#jing-turn-btn');
    if (b) b.textContent = isPaged() ? '翻页·左右' : '翻页·滚动';
  }
  /* 跨闭包钩子（JingMark 的点跳/书签存档借用同一字偏移口径） */
  window.__wuriPagedActive = function () { return isPaged() && !!currentId; };
  window.__wuriReaderOffset = function () { try { return currentContentOffset(); } catch (e) { return 0; } };
  window.__wuriReaderGoToPara = function (el) {
    if (!el) return false;
    if (isPaged() && currentId) {
      var p = el.closest ? (el.closest('.jing-para') || el) : el;
      if (p && p.getAttribute && p.getAttribute('data-sec') != null) { goToContentOffset(paraContentOff(p)); return true; }
    }
    return false;
  };

  function saveProgressNow() {
    if (!currentId || !_metrics || !_metrics.total) return;
    if (_restoreOff != null) return; /* 落位未稳：此刻的偏移可能是重排瞬时值，写盘会毒化下次落位 */
    var off = currentContentOffset(), frac = off / _metrics.total;
    try {
      var m = JSON.parse(localStorage.getItem(AUTOPOS_KEY) || '{}');
      var e = m[currentId] || {};
      e.frac = Math.round(frac * 10000) / 10000;
      e.off = off; /* 字偏移锚随进度同写，保证重渲/重进落位不读到陈旧 off */
      if (frac >= 0.995 && !e.done) { e.done = true; e.doneTs = Date.now(); }
      e.ts = Date.now();
      m[currentId] = e;
      var keys = Object.keys(m);
      if (keys.length > 40) {
        keys.sort(function (a, b) { return (m[a].ts || 0) - (m[b].ts || 0); });
        keys.slice(0, keys.length - 40).forEach(function (kk) { delete m[kk]; });
      }
      localStorage.setItem(AUTOPOS_KEY, JSON.stringify(m));
    } catch (err) {}
  }
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
    if (_restoreOff == null) _pageAnchorOff = off; /* 恢复轮询期间锚点归轮询所有，防瞬时误算毒化 */
    var _pi = $('#jing-page-ind');
    if (_pi) _pi.textContent = isPaged() ? (curPage() + 1) + ' / ' + pageCount() : '';
    if (fill) fill.style.width = (frac * 100).toFixed(1) + '%';
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
      var si = secIdxAtOffset(off);
      var secH = (d && d.sections && d.sections[si] && d.sections[si].h) || '';
      /* 口径（2026-10-28 用户钉死）：百分比恒以本经为单位——全经已读内容字数
         ÷ 全经总内容字数（多卷经跨卷合并计算）；本卷进度与本卷剩余作并列小字，
         不做任何跨经聚合 */
      var pct = frac >= 0.995 ? 100 : Math.floor(frac * 100);
      var slNow = _metrics.secLens[si] || 0;
      var volPct = slNow ? Math.min(100, Math.floor(Math.min(1, Math.max(0, (off - _metrics.cum[si]) / slNow)) * 100)) : 100;
      var tail;
      if (frac >= 0.995) tail = '已读完';
      else if (_statusMode === 'book') tail = '本书' + fmtRemain(_metrics.total - off);
      else tail = '本卷' + fmtRemain((_metrics.cum[si] + _metrics.secLens[si]) - off);
      txt.innerHTML = (secH ? '<b>' + esc(txScript(secH)) + '</b> · ' : '') + '本书 ' + pct + '% · 本卷 ' + volPct + '% · ' + tail;
    }
    if (now - _lastProgSave > 2500) { _lastProgSave = now; saveProgressNow(); }
    /* 读完瞬间立即落盘一次：滚到底后不再有滚动事件触发节流保存，
       否则 done 只停在状态栏、存档仍是 98.x%（实测 KR5g0030）。 */
    if (frac >= 0.995 && _doneSavedFor !== currentId) { _doneSavedFor = currentId; _lastProgSave = now; saveProgressNow(); }
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
      if (!e || (e.frac == null && !e.done)) { if (old) old.remove(); return; }
      if (!old) {
        old = document.createElement('span');
        old.className = 'read-prog';
        var go = row.querySelector('.jing-go');
        if (go) row.insertBefore(old, go); else row.appendChild(old);
      }
      old.textContent = e.done ? '已读完' : ('读 ' + Math.floor((e.frac || 0) * 100) + '%');
      old.classList.toggle('done', !!e.done);
    });
  }
  window.__wuriDecorateProgress = decorateReadProgress;
  window.__wuriReadFrac = function (id) {
    var e = loadAutoPos(id);
    return (e && (e.frac != null || e.done)) ? { frac: e.frac || 0, done: !!e.done } : null;
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
    var frac = _metrics && _metrics.total ? off / _metrics.total : 0;
    if (title) title.textContent = txScript(d.title || '');
    var html = '<div class="jing-toc-all">本书进度 ' + (frac >= 0.995 ? '已读完' : Math.floor(frac * 100) + '%') + ' · 共 ' + d.sections.length + ' 卷</div>';
    d.sections.forEach(function (sec, si) {
      var sl = _metrics ? _metrics.secLens[si] : 0;
      var sb = _metrics ? _metrics.cum[si] : 0;
      var sp = sl ? Math.min(1, Math.max(0, (off - sb) / sl)) : 0;
      var spct = off >= sb + sl && sl ? 100 : Math.floor(sp * 100);
      html += '<div class="jing-toc-vol' + (si === curSi ? ' cur' : '') + '" data-toc-sec="' + si + '">'
        + '<span class="tv-name">' + esc(txScript(sec.h || ('第' + (si + 1) + '卷'))) + '</span>'
        + '<span class="tv-pct">' + (spct >= 100 ? '已读完' : spct + '%') + '</span></div>';
      tocChapters(d, si).forEach(function (ch) {
        html += '<div class="jing-toc-ch" data-toc-sec="' + si + '" data-toc-off="' + ch.off + '">' + esc(txScript(ch.name)) + '</div>';
      });
    });
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
      }).catch(function () { showDictCard(word, null, []); });
    };
    if (D.ready) { D.ready().then(doLookup).catch(doLookup); } else doLookup();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var tocBtn = $('#jing-toc-btn');
    if (tocBtn) tocBtn.addEventListener('click', openToc);
    var toc = $('#jing-toc');
    if (toc) toc.addEventListener('click', function (e) {
      if (e.target.closest('[data-toc-close]')) { closeToc(); return; }
      var vol = e.target.closest('[data-toc-sec]');
      if (vol) {
        var si = +vol.getAttribute('data-toc-sec');
        var off = +(vol.getAttribute('data-toc-off') || 0);
        closeToc();
        jumpToSec(si, off);
        setTimeout(updateReadUI, 500);
      }
    });
    var bar = $('#jing-statusbar');
    if (bar) bar.addEventListener('click', function () {
      _statusMode = _statusMode === 'vol' ? 'book' : 'vol';
      updateReadUI();
    });
    var fab = $('#dict-fab');
    if (fab) fab.addEventListener('click', runDictLookup);
    /* 沉浸态：点正文（非高亮/叩磬/图版/卷题、无选区、非跟读）切换 */
    var contentEl = $('#jing-content');
    if (contentEl) contentEl.addEventListener('click', function (e) {
      if (!currentId || followMode) return;
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
      updateAudioButtons();
      // 切到无音频经时若跟读开着，自动退出跟读态（避免高亮映射残留到新经）
      if (followMode && !hasAudio(id)) toggleFollow();

      $('#jing-title').textContent = txScript(d.title);
      // 传本标注（如宝诰的"闾山三奶派传本、非道藏所载"）：有才显示。
      // 道藏全集不在书头挂分类行（2026-10-27 用户定）：分类/底本移到文末一行小字
      var jsub = $('#jing-subtitle');
      if (jsub) {
        if (d.subtitle && !d.daozang) { jsub.textContent = txScript(d.subtitle); jsub.hidden = false; }
        else { jsub.hidden = true; }
      }
      // 来源标注（精选自家口径，书头显示；道藏全集不在书头显示，文末行交代）
      var jnote = $('#jing-srcnote');
      if (jnote) {
        if (d.note && !d.daozang) {
          var dzSuffix = '';
          if (d.daozang) {
            dzSuffix = d.punctMode
              ? '｜机器标点 · 未经校订' + (d.punctPartial ? '（已标 ' + d.punctPartial.done + '/' + d.punctPartial.total + ' 卷）' : '') + '｜注音为机器标注加审读表校正，多音字可能有误' + (isSimpMode() ? '｜简体由繁体底本机器转换' : '')
              : '｜底本直出 · 未经校订｜注音为机器标注加审读表校正，多音字可能有误' + (isSimpMode() ? '｜简体由繁体底本机器转换' : '');
          } else if (d.punctMode) {
            /* 精选内丹标点版：只标标点口径（底本口径已在 note 内） */
            dzSuffix = '｜机器标点 · 未经校订';
          }
          jnote.textContent = txScript(d.note + dzSuffix);
          jnote.hidden = false;
        } else { jnote.hidden = true; }
      }
      // 标点版排版容器类（spec v1.1 §12：行高/段距/缩进走 .dz-punct 规则）
      var jcontent = $('#jing-content');
      if (jcontent) jcontent.classList.toggle('dz-punct', !!d.punctMode);
      // 内丹书：隐藏背诵模式按钮；全藏无音频亦隐藏背诵
      var rcb2 = $('#jing-recite');
      if (rcb2) rcb2.hidden = isNeidan(id) || !!d.daozang;
      // 「全部展开」全藏多卷本同样显示（2026-10-26 用户定）：卷体按需填充，
      // 展开走 foldAll 内的渐进分片渲染防卡死，按钮不再按 lazy 隐藏
      // 内丹书强制关闭背诵模式；全藏同理（背诵走逐字转换、无短语上下文）
      if ((isNeidan(id) || d.daozang) && reciteMode) { reciteMode = false; }
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
      _lastProgSave = 0; _doneSavedFor = null;
      setTimeout(updateReadUI, 700);
      setTimeout(updateReadUI, 2000);
      updateFoldBtn();
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
         （展开＋等页高长够）；无命中维持旧行为回顶。 */
      var posY = 0, posExp = null, posHit = false;
      if (window._jingAnchorY != null && (Date.now() - (window._jingAnchorTs || 0)) < 5000) {
        posY = window._jingAnchorY; posExp = window._jingAnchorExp || null; posHit = true;
      } else if (bm && bm.scrollTop != null) {
        posY = bm.scrollTop; posExp = bm.expanded || null; posHit = true;
      } else if (Date.now() > _posSuppressUntil) {
        var ap = loadAutoPos(id);
        if (ap && ap.y > 50) { posY = ap.y; posExp = ap.expanded || null; posHit = true; }
      }
      window._jingAnchorY = null; window._jingAnchorExp = null;
      if (isPaged()) {
        /* 分页落位：重渲锚（落色等）＞书签 off＞autopos off/frac，全走字偏移 */
        var roff = null;
        if (_restoreOff != null && _pagedSnapId === id) roff = _restoreOff; /* 恢复在途的重渲：沿用原目标，不读存档（可能已被瞬时值污染） */
        else if (bm && bm.off != null) roff = bm.off;
        else if (_pageAnchorOff > 0 && _pagedSnapId === id) roff = _pageAnchorOff; /* 同书重渲（落色等）：内存锚最新 */
        else {
          var ap2 = loadAutoPos(id);
          if (ap2 && ap2.off != null) roff = ap2.off;
          else if (ap2 && ap2.frac && _metrics) roff = Math.round(ap2.frac * _metrics.total);
        }
        var sc0 = pageScroller(); if (sc0) sc0.scrollLeft = 0;
        _restoreOff = roff;
        syncPagedChrome();
        if (roff != null) pagedRestorePos();
      } else if (posHit) insistReaderPos(id, posY, posExp);
      else window.scrollTo(0, 0);
      // 跟读模式开着时重渲染了内容：重建段落映射
      if (followMode) {
        clearFollowCur();
        buildFollowMap();
      }
  }

  function updateFoldBtn() {
    var btn = $('#jing-foldall');
    if (!btn) return;
    if (_foldBusy) { btn.textContent = '展开中…'; return; }
    var bodies = document.querySelectorAll('#jing-content .jing-sec-body');
    var open = 0;
    for (var i = 0; i < bodies.length; i++) if (!bodies[i].hidden) open++;
    btn.textContent = (open === bodies.length && bodies.length) ? '全部折叠' : '全部展开';
  }

  function toggleSection(si) {
    if (isPaged()) return; /* 分页下全卷展开呈现，折叠无意义 */
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
    if (isPaged()) { showToast('翻页模式下随翻页自动加载'); return; }
    if (_foldBusy) return;
    var bodies = document.querySelectorAll('#jing-content .jing-sec-body');
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
    document.body.classList.remove('jing-immersive');
    closeToc();
    var _dc = $('#dict-card'); if (_dc) _dc.hidden = true;
    var _df = $('#dict-fab'); if (_df) _df.hidden = true;
    currentId = null;
    window._jingCurrentId = null;
    $('#jing-reader').hidden = true;
    _restoreOff = null;
    document.body.style.overflow = '';
    var _rd = $('#jing-reader'); if (_rd) _rd.classList.remove('reader-paged');
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

  function applyReaderPrefs() {
    /* 平板/宽屏（≥768）：同档位字号 +2px 联动（版心限宽见 style.css 媒体查询） */
    var effPx = fontPx + ((window.innerWidth || 0) >= 768 ? 2 : 0);
    $('#jing-content').style.fontSize = effPx + 'px';
    // 问题8修复：内丹书不显示拼音，隐藏拼音按钮
    var isNd = currentId && isNeidan(currentId);
    var pyBtn = $('#jing-pybtn');
    if (pyBtn) pyBtn.hidden = !!isNd;
    var showPy = pyOn && !isNd;
    $('#jing-content').classList.toggle('no-py', !showPy);
    if (pyBtn) pyBtn.textContent = pyOn ? '注音开' : '注音关';
    if (isPaged() && currentId && _pagedSnapId === currentId && _restoreOff == null) {
      var _a = _pageAnchorOff;
      sizePagedColumns();
      requestAnimationFrame(function () { if (isPaged() && currentId) goToContentOffset(_a, true); });
    }
    $('#jing-content').classList.toggle('recite-on', reciteMode);
    var rb = $('#jing-recite');
    if (rb) rb.textContent = reciteMode ? t('jing_recite_on') : t('jing_recite');
    if (rb) rb.classList.toggle('active', reciteMode);
  }
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
    followMode = !followMode;
    var btn = $('#jing-follow');
    if (btn) btn.classList.toggle('on', followMode);
    $('#jing-content').classList.toggle('follow-on', followMode);
    if (followMode) {
      // 需要当前经文+声音的时间戳：错配或缺失则重载
      var voice = getVoice();
      ensureTimestamps(currentId, voice, function (ok) {
        if (!ok || !buildFollowMap()) {
          alert('该经文暂无分段朗读数据，跟读模式不可用');
          if (followMode) toggleFollow();
        }
      });
      startFollowTicker();
    } else {
      stopFollowTicker();
      clearFollowCur();
    }
  }
  function clearFollowCur() {
    if (_followCurEl) { _followCurEl.classList.remove('follow-cur'); _followCurEl = null; }
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
  // 播放时轮询：根据播放位置高亮当前段并跟随滚动
  function startFollowTicker() {
    stopFollowTicker();
    var lastTsIdx = -1;
    _followTimer = setInterval(function () {
      if (!followMode) { stopFollowTicker(); return; }
      var b = bridge();
      if (!b || typeof b.jingPosition !== 'function') return;
      var pos = -1;
      try { pos = b.jingPosition(); } catch (e) { return; }
      if (pos < 0 || !followMap) return;
      var posSec = pos / 1000;
      // 二分找当前 ts 段
      var ts = jingTimestamps.segments;
      var lo = 0, hi = ts.length - 1, ans = 0;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (ts[mid].start <= posSec) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      if (ans === lastTsIdx || !followMap[ans]) return;
      lastTsIdx = ans;
      var el = followMap[ans].el;
      if (!el) return;
      clearFollowCur();
      el.classList.add('follow-cur');
      _followCurEl = el;
      // 温和跟随：只在段落不在视口内时滚动（分页下＝段落不在当前页时翻页）
      try {
        if (isPaged() && currentId) {
          var sc2 = pageScroller(), sr2 = sc2.getBoundingClientRect();
          var ex = el.getBoundingClientRect().left - sr2.left + sc2.scrollLeft;
          var ep = Math.floor(ex / pageW());
          if (ep !== curPage()) goToPage(ep, true);
        } else {
          var r = el.getBoundingClientRect();
          if (r.top < 80 || r.bottom > window.innerHeight - 120) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }
      } catch (e) {}
    }, 800);
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
          if (i >= 0) {
            var s = Math.max(0, i - 14), e = Math.min(p.t.length, i + q.length + 14);
            var snip = (s > 0 ? '…' : '') + p.t.slice(s, e) + (e < p.t.length ? '…' : '');
            snip = esc(snip).replace(esc(q), '<b>' + esc(q) + '</b>');
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
    var st = { alias: searchAliasHits(q), dz: null, text: null };
    function render() {
      if (mySeq !== searchSeq) return; /* 旧查询结果：一律丢弃 */
      var pending = (st.dz === null || st.text === null);
      var all = st.alias.concat(st.dz || [], st.text || []);
      if (!all.length) {
        box.innerHTML = pending
          ? '<p class="hint">检索中…</p>'
          : '<p class="hint">未找到「' + esc(q) + '」</p>';
        return;
      }
      box.innerHTML = '<div class="jing-res-count">共 ' + all.length + ((st.dz && st.dz.length) ? ' 条' : ' 处')
        + (pending ? '（全文检索中…）' : '') + '</div>'
        + all.slice(0, 200).map(function (r) {
          if (r.dz) {
            return '<div class="jing-res" data-dz-work="' + r.id + '">'
              + '<div class="jing-res-t">' + esc(txScript(r.title)) + '</div>'
              + '<div class="jing-res-s">' + esc(txScript(r.snip)) + '</div></div>';
          }
          return '<div class="jing-res" data-jing="' + r.id + '" data-sec="' + r.si + '">'
            + '<div class="jing-res-t">' + esc(r.title) + (r.sec ? ' · ' + esc(r.sec) : '') + '</div>'
            + '<div class="jing-res-s">' + r.snip + '</div></div>';
        }).join('');
    }
    render();
    /* 统一检索：精选（题名/别名＋全文）＋道藏全集（书名，经 daozang.js 钩子）一处搜全 */
    if (window.__wuri_dzTitleSearch) {
      var dzDone = false;
      var dzFinish = function (hits) { if (!dzDone) { dzDone = true; st.dz = hits || []; render(); } };
      try { window.__wuri_dzTitleSearch(q, dzFinish); } catch (e) { dzFinish([]); }
      setTimeout(function () { dzFinish([]); }, 4000);
    } else { st.dz = []; render(); }
    ensureAll(function () {
      if (mySeq !== searchSeq) return;
      st.text = searchTextHits(q);
      render();
    });
  }

  /* ---------- MP3 诵读（Qwen3-TTS 预渲染） ---------- */
  var jingAudio = null;
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
    // 跟读依赖分段朗读时间戳：无音频的经（如内丹诸经）隐藏跟读按钮
    var flEl = document.getElementById('jing-follow');
    if (flEl) flEl.style.display = hasAudio(currentId) ? '' : 'none';
    var isFree = window.IS_FREE_BUILD;
    if (isFree) {
      // 免费版：只显示系统诵读相关，隐藏 MP3 专用
      ['jing-voice','jing-download'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      var sp = document.getElementById('jing-speak');
      if (sp) { sp.style.display = ''; sp.hidden = false; }
      // 道藏全藏一律无音频：免费版口径下亦隐藏系统诵读
      if (/^KR5/.test(currentId || '') && sp) sp.style.display = 'none';
      // jing-stop 由播放状态控制，这里不动
      return;
    }
    var show = hasAudio(currentId);
    ['jing-speak','jing-voice','jing-download','jing-stop'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = show ? '' : 'none';
    });
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
    var s = document.getElementById('jing-stop');
    if (s) s.hidden = true;
    var sp = document.getElementById('jing-speak');
    if (sp) sp.hidden = false;
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
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:78px;z-index:10000;'
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
    var s = document.getElementById('jing-stop');
    if (s) s.hidden = true;
    var sp = document.getElementById('jing-speak');
    if (sp) sp.hidden = false;
  }
  function playJingAudio(sid, startTime) {
    var voice = getVoice();
    var savedPos = 0;
    try { savedPos = parseFloat(localStorage.getItem('wuri_jing_pos_' + sid) || '0'); } catch (e) {}
    var posMs = Math.floor(((startTime !== undefined) ? startTime : savedPos) * 1000);
    // 优先用后台服务（支持后台播放+通知栏控制）
    if (svcPlay(sid, voice, posMs)) {
      document.getElementById('jing-speak').hidden = true;
      document.getElementById('jing-stop').hidden = false;
      var b = bridge();
      var lp = '';
      if (b && typeof b.getLocalAudioPath === 'function') {
        try { lp = b.getLocalAudioPath(localAudioFile(sid, voice)); } catch (e) {}
      }
      updateDownloadBtn(sid, voice, !!lp);
      return;
    }
    // 降级：HTML5 Audio（桌面调试用）
    var filename = localAudioFile(sid, voice);
    var src = JING_BASE + filename;
    if (!jingAudio) { jingAudio = new Audio(); }
    jingAudio.src = src;
    // 跟读点播：从指定位置开始（iOS 网页版修复 2026-10-10）
    var seekSec = posMs / 1000;
    if (seekSec > 0) {
      try { jingAudio.currentTime = seekSec; } catch (e) {}
      // 部分浏览器在元数据加载前设置 currentTime 会被忽略，加载完成后再设一次
      var _seekOnce = function () {
        jingAudio.removeEventListener('loadedmetadata', _seekOnce);
        try { if (seekSec > 0) jingAudio.currentTime = seekSec; } catch (e2) {}
      };
      jingAudio.addEventListener('loadedmetadata', _seekOnce);
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
    jingAudio.play().catch(function(e) {
      /* 断网且该音频未离线下载时给明确话术，别只报一句播放失败（2026-10-21 离线下载） */
      if (!navigator.onLine) alert('无网络：这部经文的音频还没有离线下载。请联网后播放，或到「我的 → 离线音频」先一键下载。');
      else alert('播放失败：' + e.message);
    });
    document.getElementById('jing-speak').hidden = true;
    document.getElementById('jing-stop').hidden = false;
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
        alert('下载失败：' + e.message);
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
    if (!isSvcActive()) {
      var sp = document.getElementById('jing-speak');
      var st = document.getElementById('jing-stop');
      if (sp) sp.hidden = false;
      if (st) st.hidden = true;
    }
  }
  function speakSection(si) {
    var d = window.JINGWEN[currentId];
    if (!d) return;
    var sec = d.sections[si];
    var text = sec.paras.map(function (p) { return p.t; }).join('\n');
    if (speakText(text)) {
      $('#jing-speak').hidden = true;
      $('#jing-stop').hidden = false;
    }
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
      if (speakText(text)) {
        $('#jing-speak').hidden = true;
        $('#jing-stop').hidden = false;
      }
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
              alert('该声音暂无分段朗读数据，跟读模式已关闭');
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
    if (el) el.textContent = '（' + marksTotal() + '）';
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
    /* 校准到两种之一 */
    fontPx = Math.abs(fontPx - 17) <= Math.abs(fontPx - 28) ? 17 : 28;
    try { pyOn = localStorage.getItem('wuri_jing_py') !== '0'; } catch (e) {}
    try { turnMode = localStorage.getItem('wuri_jing_turn') === 'page' ? 'page' : 'scroll'; } catch (e) {}
    renderCatalog();
    refreshMarksRow();
    /* 我的标记入口行（div 模拟按钮）键盘可达：Enter/空格触发 */
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'jing-mymarks' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.target.click();
      }
    });
    /* 语言切换时目录随之重渲（三段标题简繁、全藏目录显示口径跟随系统语言） */
    var prevRr = window.__wuri_rerender;
    window.__wuri_rerender = function () { if (prevRr) prevRr(); renderCatalog(); };
    applyReaderPrefs();
    /* 初始化按钮高亮 */
    var isBig = fontPx === 28;
    var bd = $('#jing-font-dec'), bi = $('#jing-font-inc');
    if (bd) bd.classList.toggle('active', !isBig);
    if (bi) bi.classList.toggle('active', isBig);

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
            if (isPaged() && currentId) { jumpToSec(+sec, 0); return; }
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

    $('#jing-back').addEventListener('click', closeReader);
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
    // 高亮按钮（仅内丹书）：选中文字后点此手动触发高亮弹窗（iOS selectionchange 不可靠）
    // 注意：点按钮时 iOS 会清掉实时选区，所以用 selectionchange 时缓存的选区（2026-10-11）
    var hlb = $('#jing-highlight-btn');
    if (hlb) hlb.addEventListener('click', function () {
      /* 选区缓存/偏移/弹窗全在 JingMark 作用域内，此处只委托（旧写法直引
         cachedSelInfo 等跨作用域名，点击必抛 ReferenceError，2026-10-26 修） */
      if (window.JingMark && window.JingMark.openHlPopForSelection) {
        try { window.JingMark.openHlPopForSelection(); } catch (e) {}
      }
    });
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
    var FONT_SIZES = [14, 17, 20, 24, 29]; /* 五档字号，持久化 */
    function fontIdx() {
      var best = 1, bd = 1e9;
      FONT_SIZES.forEach(function (s, i) { var dd = Math.abs(s - fontPx); if (dd < bd) { bd = dd; best = i; } });
      return best;
    }
    function setFont(idx) {
      idx = Math.max(0, Math.min(FONT_SIZES.length - 1, idx));
      fontPx = FONT_SIZES[idx];
      try { localStorage.setItem('wuri_jing_font', fontPx); } catch (e) {}
      applyReaderPrefs();
      // 更新按钮状态
      $('#jing-font-dec').classList.toggle('active', idx === 0);
      $('#jing-font-inc').classList.toggle('active', idx === FONT_SIZES.length - 1);
    }
    $('#jing-font-inc').addEventListener('click', function () { setFont(fontIdx() + 1); });
    $('#jing-font-dec').addEventListener('click', function () { setFont(fontIdx() - 1); });
    /* 翻页方式切换钮（阅读设置，与字号/注音同排） */
    var turnBtn = $('#jing-turn-btn');
    if (turnBtn) turnBtn.addEventListener('click', function () {
      try { _turnSwitchOff = currentContentOffset(); } catch (e) { _turnSwitchOff = null; }
      turnMode = isPaged() ? 'scroll' : 'page';
      try { localStorage.setItem('wuri_jing_turn', turnMode); } catch (e) {}
      applyTurnMode();
    });
    updateTurnBtn();
    /* 分页容器：横滚即刷新进度/页码并预填后续卷 */
    var scEl = $('#jing-content');
    if (scEl) {
      scEl.addEventListener('scroll', function () {
        if (!isPaged() || !currentId) return;
        scheduleReadUI(); pagedFillAheadSoon();
      }, { passive: true });
      /* 点按分区：左/右 30% 翻页（捕获相位，抢在沉浸切换与段落委托之前）；
         中区放行给既有沉浸切换，切换后版面高度变、150ms 后按锚复位 */
      scEl.addEventListener('click', function (e) {
        if (!isPaged() || !currentId || followMode) return;
        if (e.target.closest('.hl, .qing-inline, .dz-fig, a, button, .jing-sec-h')) return;
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        var r = scEl.getBoundingClientRect();
        var xr = (e.clientX - r.left) / Math.max(1, r.width);
        if (xr < 0.3) { _restoreOff = null; goToPage(curPage() - 1, true); e.stopImmediatePropagation(); e.preventDefault(); }
        else if (xr > 0.7) { _restoreOff = null; goToPage(curPage() + 1, true); e.stopImmediatePropagation(); e.preventDefault(); }
        else setTimeout(function () { if (isPaged() && currentId) { sizePagedColumns(); goToContentOffset(_pageAnchorOff, true); } }, 160);
      }, true);
      /* 滑动翻页：横向快扫（有选区时不触发，避免与查字选词打架） */
      var _tsx = 0, _tsy = 0, _tst = 0;
      scEl.addEventListener('touchstart', function (e) {
        if (!isPaged()) return;
        var t = e.changedTouches[0]; _tsx = t.clientX; _tsy = t.clientY; _tst = Date.now();
      }, { passive: true });
      scEl.addEventListener('touchend', function (e) {
        if (!isPaged() || !currentId || followMode) return;
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        var t = e.changedTouches[0];
        var dx = t.clientX - _tsx, dy = t.clientY - _tsy;
        if (Date.now() - _tst < 600 && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          _restoreOff = null; goToPage(curPage() + (dx < 0 ? 1 : -1), true);
        }
      }, { passive: true });
    }
    $('#jing-speak').addEventListener('click', speakAll);
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
  function updateFab() {
    var fab = document.getElementById('qing-btn');
    var backFab = document.getElementById('jing-back-fab');
    var bmFab = document.getElementById('jing-bookmark-fab');
    // 阅读器开着就显示浮动按钮（不依赖 tab 的 active 状态，避免从搜索/背诵等入口进入时丢失）
    var reader = document.getElementById('jing-reader');
    var showReader = !!(reader && !reader.hidden);
    if (fab) fab.classList.toggle('show', !!showReader);
    if (backFab) backFab.classList.toggle('show', !!showReader);
    // 书签悬浮按钮：仅内丹书阅读时显示
    if (bmFab) {
      var curId = window._jingCurrentId;
      var isNd = false;
      try {
        if (curId && window.JingMark && typeof window.JingMark.marksEnabled === 'function') isNd = window.JingMark.marksEnabled(curId);
      } catch (e) { isNd = false; }
      var showBm = showReader && curId && isNd;
      bmFab.classList.toggle('show', !!showBm);
    }
    // 高亮按钮：仅内丹书阅读时显示（与书签悬浮按钮同逻辑）
    var hlBtn = document.getElementById('jing-highlight-btn');
    if (hlBtn) {
      var curId2 = window._jingCurrentId;
      var isNd2 = false;
      try {
        if (curId2 && window.JingMark && typeof window.JingMark.marksEnabled === 'function') isNd2 = window.JingMark.marksEnabled(curId2);
      } catch (e) { isNd2 = false; }
      hlBtn.hidden = !(showReader && curId2 && isNd2);
    }
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
    // 浮动返回按钮：点击关闭阅读器回目录
    var backFab = document.getElementById('jing-back-fab');
    if (backFab) {
      backFab.addEventListener('click', function () {
        closeReader();
      });
    }
    // 书签悬浮按钮：点击保存当前位置
    var bmFab = document.getElementById('jing-bookmark-fab');
    if (bmFab) {
      bmFab.addEventListener('click', function () {
        var sid = window._jingCurrentId;
        var isNd = window.JingMark && typeof window.JingMark.marksEnabled === 'function' ? window.JingMark.marksEnabled(sid) : false;
        if (!sid || !isNd) return;
        // 调用 JingMark 的保存（如果可用），否则用内部的
        if (window.JingMark && window.JingMark.saveBookmark) {
          window.JingMark.saveBookmark(sid);
        }
        // 视觉反馈
        bmFab.style.transform = 'scale(0.9)';
        setTimeout(function () { bmFab.style.transform = ''; }, 150);
      });
    }
    // 六爻浮动返回：回到六爻主页面
    var lyBackFab = document.getElementById('liuyao-back-fab');
    if (lyBackFab) {
      lyBackFab.addEventListener('click', function () {
        var btn = document.getElementById('liuyao-back');
        if (btn) btn.click();
      });
    }
    // 置顶按钮：滚动到顶部
    var topFab = document.querySelector('.jing-back-fab.to-top');
    if (topFab) {
      topFab.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    // 定时更新浮动按钮
    setInterval(updateFab, 500);
    updateFab();
  });
  // 暴露给外部调用（每日经文推荐等）
  window.JingOpenReader = (typeof JingWen !== 'undefined' && JingWen.openReader) ? JingWen.openReader : null;
  window.JingOpenReaderAt = (typeof JingWen !== 'undefined' && JingWen.openReaderAt) ? JingWen.openReaderAt : null;
})();

/* ---------- 书签·高亮·心得（仅内丹书籍） ---------- */
(function () {
  'use strict';
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* 仅内丹书可用 */
  function isNeidanBook(sid) {
    try {
      if (window.JingWen && typeof window.JingWen.isNeidan === 'function') return window.JingWen.isNeidan(sid);
    } catch (e) {}
    return false;
  }
  /* 标记（书签/高亮/心得）适用范围：内丹书籍＋道藏全藏（KR5*） */
  function marksEnabled(sid) {
    return isNeidanBook(sid) || /^KR5/.test(sid || '');
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
  var HL_COLORS = {
    yellow: { name: '黄', css: 'hl-yellow', label: '重点经文' },
    green: { name: '绿', css: 'hl-green', label: '修炼口诀' },
    blue: { name: '蓝', css: 'hl-blue', label: '存疑待考' },
    red: { name: '红', css: 'hl-red', label: '警示禁忌' }
  };
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
    // 构建颜色按钮
    var html = '';
    if (!isExisting) {
      // 新建高亮：4色 + 取消（底部固定，不跟随选择位置）
      Object.keys(HL_COLORS).forEach(function (c) {
        html += '<button class="hl-color-btn hl-' + c + '" data-hl-color="' + c + '" title="' + HL_COLORS[c].label + '">' + HL_COLORS[c].name + '</button>';
      });
      html += '<button id="hl-cancel">取消</button>';
    } else {
      // 已存在高亮：写心得 / 换色 / 删除（跟随点击位置）
      html += '<button id="hl-note">写心得</button>';
      Object.keys(HL_COLORS).forEach(function (c) {
        html += '<button class="hl-color-btn hl-' + c + '" data-hl-recolor="' + c + '">' + HL_COLORS[c].name + '</button>';
      });
      html += '<button id="hl-del">删除</button>';
    }
    pop.innerHTML = html;
    pop.hidden = false;
    if (!isExisting) {
      // 新建：底部固定
      pop.classList.add('hl-bottom');
      pop.style.left = '';
      pop.style.top = '';
    } else {
      // 已存在：跟随位置
      pop.classList.remove('hl-bottom');
      pop.style.left = Math.min(x, window.innerWidth - 160) + 'px';
      pop.style.top = (y + 10) + 'px';
    }
  }
  function hideHlPop() {
    var pop = $('#hl-pop');
    if (pop) pop.hidden = true;
    pendingHl = null;
    pendingHlId = null;
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
    $('#note-quote').textContent = '「' + hl.text + '」';
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
      if (window.__wuriReaderGoToPara && window.__wuriReaderGoToPara(el)) { /* 分页：翻到该段所在页 */ }
      else el.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
        if (window.__wuriReaderGoToPara && window.__wuriReaderGoToPara(para)) { /* 分页同口径 */ }
        else para.scrollIntoView({ block: 'center' });
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
        if (sid) rebuildHlRanges(sid);
        hideHlPop();
        window.getSelection().removeAllRanges();
        // 重新渲染以显示高亮
        if (window.JingWen) {
          var evt = new CustomEvent('jing-rerender');
          document.dispatchEvent(evt);
        }
        return;
      }
      // 取消
      if (e.target.closest('#hl-cancel')) {
        hideHlPop();
        window.getSelection().removeAllRanges();
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
        JingWen.openReader(sid);
        // 兜底：900ms 后锚点仍未被渲染消费（如重入被拦未走渲染），直接轮询落位
        setTimeout(function () {
          if (window._jingAnchorY != null && window.__wuriInsistPos) {
            var ay = window._jingAnchorY, ae = window._jingAnchorExp;
            window._jingAnchorY = null; window._jingAnchorExp = null;
            window.__wuriInsistPos(sid, ay, ae);
          }
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

  function titleOf(sid) {
    var idx = window.JINGWEN_INDEX || [];
    for (var i = 0; i < idx.length; i++) if (idx[i].id === sid) return idx[i].title;
    var dz = window.DAOZANG_INDEX && window.DAOZANG_INDEX.works;
    if (dz) for (var j = 0; j < dz.length; j++) if (dz[j].id === sid) return dz[j].title;
    return sid;
  }
  // 暴露给外部调用（每日经文推荐等）
  window.JingTitleOf = titleOf;

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
      + '<button class="marks-tab' + (activeTab === 'lines' ? ' active' : '') + '" data-tab="lines">划线</button>'
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
      html += '<p class="hint">暂无书签。在内丹书籍阅读时点悬浮书签按钮保存进度。</p>';
    } else {
      keys.forEach(function (sid) {
        var arr = bm[sid];
        if (!Array.isArray(arr)) arr = arr ? [arr] : [];
        arr.forEach(function (b) {
          var bmId = b.id || sid;
          html += '<div class="jing-hl-item" data-open-bm="' + bmId + '" data-sid="' + sid + '">'
            + '<div><span class="jing-book">' + (/^KR5/.test(sid) ? '藏' : '丹') + '</span> ' + esc(titleOf(sid)) + '</div>'
            + '<div class="hl-meta">' + fmtDate(b.ts) + ' · 点击继续阅读</div>'
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
      html += '<p class="hint">暂无高亮。在内丹书籍中长按选择文字即可高亮。</p>';
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
          html += '<div class="jing-hl-item" data-open-hl="' + h.id + '" data-sid="' + h.sid + '">'
            + '<div><span class="hl-text hl-' + (h.color || 'yellow') + '">' + esc(h.text) + '</span></div>'
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
          + '<div class="note-quote">' + esc('「' + (n.highlightText || '').slice(0, 50) + '」') + '</div>'
          + '<div class="hl-meta">' + esc(n.bookTitle || titleOf(n.sid)) + ' · ' + fmtTime(n.updatedAt || n.createdAt) + ' · 点击回到原文</div>'
          + '<span class="hl-del" data-del-note="' + n.id + '">删除</span>'
          + '</div>';
      });
    }
    return html;
  }

  /* ---------- 我的划线汇总（跨书聚合高亮＋心得：可检索/导出/随机回顾） ---------- */
  var linesQ = '', linesScope = 'all';
  var HL_DOT = { yellow: '#d9a916', green: '#5da463', blue: '#5b8dd6', red: '#d65b5b' };
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
        return (h.text || '').indexOf(q) >= 0 || titleOf(h.sid).indexOf(q) >= 0 ||
          (note && note.text.indexOf(q) >= 0);
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
    if (!data.total) return '<p class="hint">没有符合条件的划线。</p>';
    var html = '';
    data.order.forEach(function (sid) {
      html += '<div class="hl-meta" style="padding:10px 14px 0;font-size:.95rem;color:var(--ink)">' + esc(titleOf(sid)) + '（' + data.bySid[sid].length + '）</div>';
      data.bySid[sid].forEach(function (h) {
        var c = colors[h.color] || colors.yellow || {};
        var note = JM.getNoteForHighlight(h.id);
        html += '<div class="jing-hl-item" data-open-hl="' + h.id + '" data-sid="' + h.sid + '">'
          + '<div><span class="hl-dot" style="background:' + (HL_DOT[h.color] || HL_DOT.yellow) + '"></span>'
          + '<span class="hl-text hl-' + (h.color || 'yellow') + '">' + esc(h.text) + '</span></div>'
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
    var html = '<h3 class="jing-sec-h">我的划线（' + data.total + '）</h3>'
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
    out.push(md ? '# 我的划线' : '我的划线');
    out.push((md ? '' : '') + '导出于 ' + ds + '，共 ' + data.total + ' 条');
    data.order.forEach(function (sid) {
      out.push('');
      out.push(md ? '## ' + titleOf(sid) : '【' + titleOf(sid) + '】');
      data.bySid[sid].forEach(function (h) {
        var c = (JM.HL_COLORS || {})[h.color] || {};
        var d = new Date(h.ts || 0);
        var dstr = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
        out.push((md ? '- ' : '· ') + '「' + (h.text || '') + '」（' + (c.label || '') + ' · ' + linesSecLabel(h).replace(/ · $/, '') + (linesSecLabel(h) ? ' · ' : '') + dstr + '）');
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
          if (head) head.textContent = '我的划线（' + linesData(JM).total + '）';
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
      // 返回目录
      if (e.target.closest('#marks-back')) { hideMarks(); if (window.__wuriRefreshMarksRow) window.__wuriRefreshMarksRow(); return; }
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
