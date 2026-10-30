/* 戊日不上香 · 道藏全集（Kanripo / CC BY-SA 4.0）
 * 经文库增量层：目录与正文全走 content feed（content/daozang/），不进安装包。
 *  - 一级架：三洞四辅＋續道藏＋道藏輯要＋待分類（源数据 SOURCE 字段实录，不硬编）
 *  - 阅读复用经文阅读器（JingWen.openReader）；多卷本按卷懒渲染
 *  - 注音：字典懒加载（content/daozang/pinyin.json）＋审读表词组覆盖，按卷现注
 *  - 全藏无音频：不在 JING_HAS_AUDIO 内，诵读/下载/跟读按钮自动隐藏
 *  - 书签/高亮：JingMark.marksEnabled 对 KR5* 放行，localStorage 持久化
 */
(function () {
  'use strict';
  var FEED_DIR = 'content/daozang/';
  var BU_ORDER = ['洞真部', '洞玄部', '洞神部', '太玄部', '太平部', '太清部', '正一部', '續道藏', '道藏輯要', '待分類'];
  var idxData = null;       // DAOZANG_INDEX
  var idxLoading = null;
  var pyDict = null;        // {char: pinyin}
  var pyOverrides = null;   // {word: [py,...]}
  var dictLoading = null;
  var workCache = {};       // id -> JINGWEN entry
  var workLoading = {};     // id -> true（openWork 在途，防重复点击重入）
  var imgData = null;       // images.json 解析结果 {version, works:{KRID:[锚点]}}
  var imgLoading = null;    // images.json 在途回调队列
  var openBu = {};          // bu -> true（重渲目录时恢复展开）
  var dzOpen = false;       // 道藏全集折叠体展开态（文库视图记忆 wuri_lib_view_v1）
  /* 视图记忆回灌：模块载入时先读存档展开态，renderFold 首渲即按存档展开——
     切页回来/冷启动都不必再从收起态点开。存档由 jingwen.js 统一写入，本处只读。 */
  try {
    var _lvDz = JSON.parse(localStorage.getItem('wuri_lib_view_v1') || 'null');
    if (_lvDz && _lvDz.dz) {
      dzOpen = !!_lvDz.dz.open;
      if (_lvDz.dz.bu) { for (var _bk in _lvDz.dz.bu) if (_lvDz.dz.bu[_bk]) openBu[_bk] = true; }
    }
  } catch (e) {}
  function dzNotifySave() { if (window.__wuriLibSaveView) { try { window.__wuriLibSaveView(); } catch (e) {} } }
  var punctSet = null;      // {KR id: true} 有标点版的部（index.punct）
  var punctPartial = {};    // id -> 已标卷数（部分标点，如度人经前 6 卷）

  /* 标点版（2026-10-26 用户定）：不设切换钮——有标点版者一律标点版呈现，
     无标点版者原文。旧偏好键 wuri_dz_punct 留尸不读。 */
  function hasPunct(id) { return !!(punctSet && punctSet[id]); }

  /* 标点字（与清洗口径一致）：内容字 = 非标点非空白；标点版去标点后与原文
     逐字相等（离线全量校验 119/119 卷 0 差异），故字序可双向投影 */
  var DZ_PUNCT_CHARS = '。，、；：？！·…—「」『』﹝﹞（）《》〈〉“”‘’％';
  function dzIsPunct(ch) { return DZ_PUNCT_CHARS.indexOf(ch) >= 0 || /\s/.test(ch); }
  function dzStripPunct(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) if (!dzIsPunct(s[i])) o += s[i];
    return o;
  }
  /* 标点版段落排版分类（spec v1.1 §9–12）：章题/对话/韵文行在建 entry 时定类，
     渲染层只挂 class（dz-cht/dz-dlg/dz-verse），散文无类走默认缩进 */
  function punctParaCls(t, isFirst) {
    var s = dzStripPunct(t), L = s.length;
    if (!L) return '';
    if (L <= 18 && /第[一二三四五六七八九十百廿卅\d]+$/.test(s) && !/[，。；：？]/.test(t)) return 'dz-cht';
    if (/^[^，。；？！]{1,14}曰：/.test(t)) return 'dz-dlg';
    if (isFirst && L <= 20) return 'dz-verse';
    var nEnd = (t.match(/[，。；]/g) || []).length;
    if (L <= 17 && /[，。]$/.test(t) && nEnd <= 2) return 'dz-verse';
    return '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtNum(n) { return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /* 简繁显示：底本恒繁体；简体模式仅在呈现层转换（与阅读器 txScript 同一转换器，
     等长替换——书签/高亮偏移与注音下标不受影响）。繁体模式原样。 */
  function isSimp() {
    try {
      if (typeof window.curLang === 'function') return window.curLang() !== 'zh-TW';
      return document.documentElement.getAttribute('lang') !== 'zh-TW';
    } catch (e) { return true; }
  }
  function txUi(s) { try { return window.tx ? window.tx(s) : s; } catch (e) { return s; } }
  function dzTx(s) {
    if (!s || !isSimp()) return s;
    try { return window.t2s ? window.t2s(s) : s; } catch (e) { return s; }
  }

  function fillPunct(d) {
    punctSet = {};
    ((d && d.punct) || []).forEach(function (id) { punctSet[id] = true; });
    punctPartial = (d && d.punctPartial) || {};
  }
  function ensureIndex(cb) {
    if (window.DAOZANG_INDEX && window.DAOZANG_INDEX.works) { idxData = window.DAOZANG_INDEX; if (!punctSet) fillPunct(idxData); cb && cb(idxData); return; }
    if (idxData) { cb && cb(idxData); return; }
    if (idxLoading) { idxLoading.push(cb); return; }
    idxLoading = [cb];
    fetch(FEED_DIR + 'index.json').then(function (r) { return r.json(); }).then(function (d) {
      idxData = d; window.DAOZANG_INDEX = d;
      fillPunct(d);
      var cbs = idxLoading; idxLoading = null;
      cbs.forEach(function (f) { try { f && f(d); } catch (e) {} });
    }).catch(function () {
      var cbs = idxLoading; idxLoading = null;
      cbs.forEach(function (f) { try { f && f(null); } catch (e) {} });
    });
  }

  function ensureDict(cb) {
    if (pyDict) { cb && cb(true); return; }
    if (dictLoading) { dictLoading.push(cb); return; }
    dictLoading = [cb];
    fetch(FEED_DIR + 'pinyin.json').then(function (r) { return r.json(); }).then(function (d) {
      pyDict = (d && d.dict) || {};
      pyOverrides = {};
      ((d && d.overrides) || []).forEach(function (o) { pyOverrides[o.w] = o.py; });
      var cbs = dictLoading; dictLoading = null;
      cbs.forEach(function (f) { try { f && f(true); } catch (e) {} });
    }).catch(function () {
      pyDict = {}; pyOverrides = {};
      var cbs = dictLoading; dictLoading = null;
      cbs.forEach(function (f) { try { f && f(false); } catch (e) {} });
    });
  }
  window.__wuri_dzEnsureDict = ensureDict;

  /* ---------- 图版（images.json） ----------
   * 清单契约：{version, works:{<KRID>:[{vol,char,src,caption,w,h}]}}；
   * vol＝0 起卷序，char＝该卷内容字序偏移（dzIsPunct 口径剥标点/空白后的
   * 字流下标，0＝卷首），src 相对 FEED_DIR。懒加载一次缓存；
   * 失败静默当无图（不缓存失败，下次开卷重试）。 */
  function ensureImages(cb) {
    if (imgData) { cb && cb(imgData); return; }
    if (imgLoading) { imgLoading.push(cb); return; }
    imgLoading = [cb];
    fetch(FEED_DIR + 'images.json').then(function (r) { return r.json(); }).then(function (d) {
      imgData = (d && d.works) ? d : { version: 1, works: {} };
      var cbs = imgLoading; imgLoading = null;
      cbs.forEach(function (f) { try { f && f(imgData); } catch (e) {} });
    }).catch(function () {
      var cbs = imgLoading; imgLoading = null;
      cbs.forEach(function (f) { try { f && f({ version: 1, works: {} }); } catch (e) {} });
    });
  }
  /* 段串内切点：内容字偏移 k（第 k 个内容字之前切）→ 串内下标。
     标点版段内标点不计内容字，逐字跳过即得该模式自己的切点。 */
  function dzCutIndex(t, k) {
    if (k <= 0) return 0;
    var c = 0;
    for (var i = 0; i < t.length; i++) {
      if (!dzIsPunct(t[i])) { if (c === k) return i; c++; }
    }
    return t.length;
  }
  /* 把一卷 paras 按锚点预切分：锚点段中时原段切成前后两段文字段，
     图以 {img:{src,caption,w,h}} 特殊段插入。图段无 .t、不参与字序计数
     （注音/高亮投影/内容字累计均按 .t 遍历，图段贡献 0 内容字）。
     切分只改段界不改字流顺序与内容：注音逐段 annotate，两半各自成段；
     审读表词组恰跨切分点时该词组退回单字读音（极罕见，可接受）。 */
  function dzSpliceImages(paras, anchors) {
    var list = anchors.slice().sort(function (a, b) { return a.char - b.char; });
    var out = [], ai = 0, cum = 0;
    function pushImg(a) {
      out.push({ img: { src: a.src, caption: a.caption || '原書圖版', w: a.w || 0, h: a.h || 0 } });
    }
    paras.forEach(function (p, pi) {
      if (p.img || p.t == null) { out.push(p); return; }
      var t = p.t, len = 0;
      for (var i = 0; i < t.length; i++) if (!dzIsPunct(t[i])) len++;
      var isLast = pi === paras.length - 1;
      var here = [];
      while (ai < list.length && (list[ai].char < cum + len || (isLast && list[ai].char <= cum + len))) {
        here.push(list[ai]); ai++;
      }
      if (!here.length) { out.push(p); cum += len; return; }
      var pos = 0; /* 串内已切下标 */
      here.forEach(function (a, hi) {
        var cut = dzCutIndex(t, a.char - cum);
        if (cut > pos) {
          var chunk = { t: t.slice(pos, cut) };
          if (hi === 0 && p.cls) chunk.cls = p.cls; /* 排版分类只留首块 */
          if (p.py) chunk.py = p.py.slice(pos, cut);
          out.push(chunk);
        }
        pushImg(a);
        pos = cut;
      });
      if (pos < t.length) {
        var rest = { t: t.slice(pos) };
        if (p.py) rest.py = p.py.slice(pos);
        out.push(rest);
      }
      cum += len;
    });
    while (ai < list.length) { pushImg(list[ai]); ai++; } /* 偏移越界兜底：卷末 */
    return out;
  }
  /* 按 vol 分组把锚点切进一整套 sections（orig/punct 共用：两套字流剥标点
     后逐字相同，各自按本套段界换算切点，落点文字位置恒一致） */
  function dzApplyImages(sections, anchors) {
    var byVol = {};
    anchors.forEach(function (a) { (byVol[a.vol] = byVol[a.vol] || []).push(a); });
    return sections.map(function (sec, vi) {
      var list = byVol[vi];
      if (!list || !list.length) return sec;
      var ns = { h: sec.h, paras: dzSpliceImages(sec.paras, list) };
      if (sec._punct) ns._punct = true;
      return ns;
    });
  }
  /* 书名索引预加载：进入经文库/聚焦检索框时由 jingwen.js 调用，
     使统一检索的书名阶段不等临查才拉索引（264K 单文件，解析后驻内存） */
  window.__wuri_dzPreload = ensureIndex;

  /* ---------- 开卷提速（2026-10-28 用户真机：短经点开也要等「载入中…」） ----------
   * 实测耗时结构：一趟并行（原文＋标点＋图清单）＋字典串行一趟＋注音/首渲。
   * 慢在请求趟数与往返、不在字节。对症：字典与图清单在目录浏览期空闲预载、
   * 可见行正文空闲预取进 SW 缓存、字典迟到不堵开卷（到后补注）。 */
  function dzIdle(fn) {
    if (window.requestIdleCallback) { try { requestIdleCallback(fn, { timeout: 2500 }); return; } catch (e) {} }
    setTimeout(fn, 900);
  }
  function dzPreloadAssets() {
    dzIdle(function () { ensureDict(function () {}); ensureImages(function () {}); });
  }
  /* 可见行预取：行进入视口（含 400px 预热边）即空闲预拉正文（＋标点）分片，
     响应经 SW 缓存优先分支落缓存，点开时 fetch 直接命中、零网络等待。
     并发 2、省流模式（saveData）跳过；失败静默（点击路径自会重试）。 */
  var pfSeen = {}, pfQueue = [], pfActive = 0, pfObs = null;
  function pfRun() {
    while (pfActive < 2 && pfQueue.length) {
      var id = pfQueue.shift();
      pfActive++;
      var done = function () { pfActive--; pfRun(); };
      var urls = [FEED_DIR + 'texts/' + id + '.json'];
      if (hasPunct(id)) urls.push(FEED_DIR + 'texts-punct/' + id + '.json');
      Promise.all(urls.map(function (u) {
        return fetch(u).then(function (r) { return r.text(); }).catch(function () {});
      })).then(done, done);
    }
  }
  function pfAdd(id, front) {
    if (!id || pfSeen[id] || workCache[id] || workLoading[id]) return;
    try { if (navigator.connection && navigator.connection.saveData) return; } catch (e) {}
    pfSeen[id] = true;
    if (front) pfQueue.unshift(id); else pfQueue.push(id);
    pfRun();
  }
  function pfWatch(root) {
    if (!root || !('IntersectionObserver' in window)) return;
    if (pfObs) { try { pfObs.disconnect(); } catch (e) {} }
    pfObs = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        pfObs.unobserve(en.target);
        var id = en.target.getAttribute('data-dz-work');
        dzIdle(function () { pfAdd(id); });
      });
    }, { rootMargin: '400px 0px' });
    root.querySelectorAll('[data-dz-work]').forEach(function (el) { pfObs.observe(el); });
  }
  /* 手指/鼠标按下行时抢先急拉（早于 click 数十毫秒，正文＋标点并行） */
  ['touchstart', 'mousedown'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var wk = e.target && e.target.closest ? e.target.closest('[data-dz-work]') : null;
      if (wk) pfAdd(wk.getAttribute('data-dz-work'), true);
    }, { capture: true, passive: true });
  });

  /* 逐字注音：审读表词组（最长匹配）优先，其次字典单字默认；无读音留空 */
  function annotateText(t, dict, ovr) {
    var out = new Array(t.length);
    var i = 0;
    while (i < t.length) {
      var matched = false;
      if (ovr) {
        var maxL = Math.min(6, t.length - i);
        for (var L = maxL; L >= 2; L--) {
          var ov = ovr[t.substr(i, L)];
          if (ov) {
            for (var k = 0; k < L; k++) out[i + k] = ov[k] || '';
            i += L; matched = true; break;
          }
        }
      }
      if (matched) continue;
      out[i] = (dict && dict[t[i]]) || '';
      i++;
    }
    return out;
  }
  /* 注音口径（简繁同）：按底本文字注音，py 下标与显示文字 1:1 对齐（转换等长）。
     不按简体字形另建字典：繁→简多对一合并会串读——实测单字字典键转换后
     13,908→12,906（同→衕、發/髮→发 等 1,002 组合并），「同時」会被误注 tòng、
     「發泄」误注 fà。读音属于词：显示「同时」即注 tóng、「发泄」即注 fā，
     以底本注音对齐呈现，简繁两模式读音逐项一致（离线等价测试 5 部验证）。
     审读表 301 条词组键经转换后 300 键、异读冲突 0 条，两种口径等价。 */
  /* 标点段注音：先剥标点成内容字流再整体注音（审读表词组按原文字流匹配，
     不被插入的标点打断），读音再散射回内容字下标，标点位留空。
     与原文口径一致：读音属于字流，不属于标点。 */
  function annotateParaPunct(p) {
    var pos = [], stripped = '';
    for (var i = 0; i < p.t.length; i++) {
      if (!dzIsPunct(p.t[i])) { pos.push(i); stripped += p.t[i]; }
    }
    var pyC = annotateText(stripped, pyDict, pyOverrides);
    var py = new Array(p.t.length);
    for (var j = 0; j < p.t.length; j++) py[j] = '';
    for (var k = 0; k < pos.length; k++) py[pos[k]] = pyC[k] || '';
    p.py = py;
  }
  function annotateSection(entry, si) {
    var sec = entry.sections[si];
    if (!sec) return;
    if (sec._dzDone && (sec._dzWithDict || !pyDict)) return;
    sec.paras.forEach(function (p) {
      if (p.img || p.t == null) return; /* 图段不注音、不占字序 */
      if (sec._punct) annotateParaPunct(p);
      else p.py = annotateText(p.t, pyDict, pyOverrides);
    });
    sec._dzDone = true;
    sec._dzWithDict = !!pyDict;
  }
  window.__wuri_dzAnnotate = function (entry, si) { annotateSection(entry, si); };

  /* ---------- 目录层 ---------- */
  function worksOfBu(bu) {
    return (idxData.works || []).filter(function (w) { return w.bu === bu; });
  }
  /* 部短签（pill 第三档补位用）：輯要→輯要、續道藏→續藏、余者去「部」字 */
  function buShort(bu) {
    if (bu === '道藏輯要') return '輯要';
    if (bu === '續道藏') return '續藏';
    return String(bu || '').replace(/部$/, '');
  }
  function workRow(w) {
    /* 标签 pill（2026-10-28 晚反馈批第 17 条）：lei（十二部類）只有三洞
       （洞真/洞玄/洞神）有真值，四辅/續/輯要按道藏目录学本就不分十二類、
       源数据 lei 为空——不编造类名，依次以正統道藏編號（DZxxxx）、所属
       部短签补位（輯要诸书无 DZ 编号、散见双空共 134 行），全藏书行样式
       统一（图标＋pill＋卷/字），三档都是真实目录信息 */
    var pill = w.lei ? '<span class="dz-lei">' + esc(dzTx(w.lei)) + '</span>'
      : (w.dz ? '<span class="dz-lei dz-lei-dz">' + esc(w.dz) + '</span>'
      : '<span class="dz-lei dz-lei-bu">' + esc(dzTx(buShort(w.bu))) + '</span>');
    return '<div class="dz-work" data-dz-work="' + w.id + '">'
      + '<span class="jing-book">藏</span>'
      + '<span class="dz-wtext"><span class="dz-wt">' + esc(dzTx(w.title)) + '</span>'
      + '<span class="dz-wmeta">'
      + pill
      + '<span class="dz-wm">' + w.juan + ' ' + txUi('卷') + ' · ' + fmtNum(w.chars) + ' ' + txUi('字') + '</span>'
      + '</span></span></div>';
  }
  /* 眷属小字（类签/卷·字数/读进度，.dz-wmeta）呈现（2026-10-28 用户定版，覆盖同日早先「一律行内顺排」口径）：
     经名占满整行宽度（已废右侧固定元信息列）；经名单行时小字独占第二行（.dz-meta-block 左对齐副行）；
     经名自身断行（≥2 行）时小字不再另起一行，行内接在经名末行尾顺排。行数以渲染后 Range 量测为准，
     字体迟到与视口变化后复测，避免行数算错；隐藏（折叠未展开）行不测，展开路径补测。 */
  function dzFlowRow(row) {
    var wt = row.querySelector('.dz-wt');
    if (!wt || !row.offsetParent) return;
    row.classList.remove('dz-meta-block');
    var lines = 1;
    try {
      var rg = document.createRange();
      rg.selectNodeContents(wt);
      var rects = rg.getClientRects(), tops = [];
      for (var i = 0; i < rects.length; i++) {
        var t = rects[i].top, seen = false;
        for (var j = 0; j < tops.length; j++) if (Math.abs(tops[j] - t) < 3) { seen = true; break; }
        if (!seen) tops.push(t);
      }
      if (tops.length) lines = tops.length;
    } catch (e) { lines = 1; }
    if (lines <= 1) row.classList.add('dz-meta-block');
  }
  function dzFlowRows(scope) {
    (scope || document).querySelectorAll('.dz-work').forEach(dzFlowRow);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { dzFlowRows(document); });
  }
  var dzFlowRzT = null;
  window.addEventListener('resize', function () {
    if (dzFlowRzT) clearTimeout(dzFlowRzT);
    dzFlowRzT = setTimeout(function () { dzFlowRzT = null; dzFlowRows(document); }, 150);
  });
  function renderCats(body) {
    var cats = body.querySelector('.dz-cats');
    if (!cats) return;
    if (!idxData) { cats.innerHTML = '<div class="dz-empty">目录加载中…</div>'; return; }
    var present = {};
    idxData.works.forEach(function (w) { present[w.bu] = (present[w.bu] || 0) + 1; });
    var bus = BU_ORDER.filter(function (b) { return present[b]; });
    Object.keys(present).forEach(function (b) { if (bus.indexOf(b) < 0) bus.push(b); });
    cats.innerHTML = bus.map(function (bu) {
      return '<div class="dz-bu" data-dz-bu="' + esc(bu) + '"><span class="jing-book">藏</span>' + esc(dzTx(bu))
        + '<span class="dz-count">' + present[bu] + ' ' + txUi('部') + '</span><span class="jing-go">›</span></div>'
        + '<div class="dz-works" data-dz-works="' + esc(bu) + '"' + (openBu[bu] ? '' : ' hidden') + '>'
        + (openBu[bu] ? worksOfBu(bu).map(workRow).join('') : '') + '</div>';
    }).join('');
    dzPreloadAssets();
    pfWatch(cats);
    if (window.__wuriDecorateProgress) { try { window.__wuriDecorateProgress(); } catch (e) {} }
    dzFlowRows(cats);
  }
  function renderFold(host) {
    var fold = document.createElement('div');
    fold.className = 'jing-sec';
    fold.setAttribute('data-dz-fold', '');
    fold.innerHTML =
      '<h3 class="jing-sec-h" data-dz-toggle>' + txUi('道藏全集')
      + '<span class="dz-count" data-dz-total></span><span class="jing-go">›</span></h3>'
      + '<div class="dz-body" data-dz-body' + (dzOpen ? '' : ' hidden') + '>'
      + '<div class="dz-cats"><div class="dz-empty">目录加载中…</div></div>'
      + '</div>';
    host.appendChild(fold);
    ensureIndex(function () {
      var total = fold.querySelector('[data-dz-total]');
      if (total && idxData) total.textContent = '（' + fmtNum(idxData.count) + ' 部）';
      var body = fold.querySelector('[data-dz-body]');
      if (body && !body.hidden) renderCats(body);
    });
  }
  window.__wuri_dzOpenWork = openWork;
  window.__wuri_dzCatalog = function (host) {
    if (!host || host.querySelector('[data-dz-fold]')) return;
    renderFold(host);
  };
  /* ---------- 回选部悬浮钮（2026-10-28 晚反馈批第 16 条） ----------
   * 某部展开且深滚（滚过该部标题行约 1.5 屏、且仍在该部书单内）时，
   * 右下出现「↑ 选部」，一键平滑回当前部标题行（在那里收起/改选）；
   * 未展开部、浅滚、已滚出该部、阅读器/标记页打开时都不出现 */
  var dzBuFab = null, dzBuTarget = null, dzBuTick = false;
  function dzBuFabEl() {
    if (dzBuFab) return dzBuFab;
    dzBuFab = document.createElement('button');
    dzBuFab.id = 'dz-bu-fab';
    dzBuFab.type = 'button';
    dzBuFab.textContent = '↑ 选部';
    dzBuFab.hidden = true;
    dzBuFab.addEventListener('click', function () {
      if (dzBuTarget) dzBuTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.body.appendChild(dzBuFab);
    return dzBuFab;
  }
  function dzBuFabUpdate() {
    dzBuTick = false;
    var fab = dzBuFabEl();
    var show = false, target = null;
    try {
      var tab = document.getElementById('tab-jing');
      var marks = document.getElementById('jing-marks');
      var body = document.querySelector('[data-dz-body]');
      var ok = tab && tab.classList.contains('active')
        && !document.body.classList.contains('reader-open')
        && (!marks || marks.hidden)
        && body && !body.hidden;
      if (ok) {
        var y = window.scrollY || 0, vh = window.innerHeight || 0;
        var heads = body.querySelectorAll('[data-dz-bu]');
        for (var i = 0; i < heads.length; i++) {
          var h = heads[i];
          var wrap = h.parentNode ? h.parentNode.querySelector('[data-dz-works="' + h.getAttribute('data-dz-bu') + '"]') : null;
          if (!wrap || wrap.hidden) continue;
          var hTop = h.getBoundingClientRect().top + y;
          if (hTop > y + 4) break; /* 已到视口下方的部：更后面的更不用看 */
          if (y - hTop > vh * 1.5) {
            var wBot = wrap.getBoundingClientRect().bottom + y;
            if (wBot > y + 100) { target = h; show = true; }
          }
        }
      }
    } catch (e) { show = false; target = null; }
    dzBuTarget = target;
    fab.hidden = !show;
  }
  function dzBuFabSchedule() {
    if (dzBuTick) return;
    dzBuTick = true;
    requestAnimationFrame(dzBuFabUpdate);
  }
  window.addEventListener('scroll', dzBuFabSchedule, { passive: true });
  window.addEventListener('resize', dzBuFabSchedule);
  document.addEventListener('click', function () { setTimeout(dzBuFabSchedule, 60); }, true);
  /* 文库视图记忆接口（jingwen.js 调用）：读/写道藏侧展开态（折叠体＋各部） */
  window.__wuri_dzGetState = function () {
    var bu = {};
    for (var k in openBu) if (openBu[k]) bu[k] = true;
    return { open: dzOpen, bu: bu };
  };
  window.__wuri_dzSetState = function (st) {
    if (!st) return;
    dzOpen = !!st.open;
    if (st.bu) {
      openBu = {};
      for (var k in st.bu) if (st.bu[k]) openBu[k] = true;
    }
    var body = document.querySelector('[data-dz-body]');
    if (!body) return;
    body.hidden = !dzOpen;
    if (dzOpen) {
      if (idxData) renderCats(body);
      else ensureIndex(function () {
        var b = document.querySelector('[data-dz-body]');
        if (b && !b.hidden) renderCats(b);
      });
    }
  };

  /* ---------- 开卷 ---------- */
  /* 道藏全集门控（2026-10-26 用户拍板）：目录/分类/书名对所有人可见可浏览，
   * 点开正文为高级版——在取正文之前落点拦截（不发 fetch）。统一检索命中的
   * 全藏条目点击同经 data-dz-work 委托到此，一并覆盖。 */
  function dzGate(id) {
    if (window.WuriPro && WuriPro.isPro()) return true;
    /* 书架扩容例外（2026-10-28 用户批准）：挂入常见经文架的 10 部 KR 指针
       按常见经文口径免费（名单由 jingwen.js 暴露 __wuriShelfFreeKR 共用）；
       自全藏分类点开同一部仍走此口径——同一本书不两价 */
    if (id && window.__wuriShelfFreeKR && window.__wuriShelfFreeKR[id]) return true;
    if (window.WuriPro) WuriPro.requirePro('daozang');
    return false;
  }
  function buildOrigSections(w) {
    return w.volumes.map(function (v) {
      return { h: v.h, paras: v.paras.map(function (t) { return { t: t }; }) };
    });
  }
  /* 标点版 sections：逐卷对位——有标点卷用标点段（_punct 标＋排版分类），
     未覆盖卷（如度人经第 7 卷起）回落原文段，两套 sections 卷序恒一致 */
  function buildPunctSections(w, pw) {
    return w.volumes.map(function (v, vi) {
      var pv = pw && pw.volumes && pw.volumes[vi];
      if (!pv) return { h: v.h, paras: v.paras.map(function (t) { return { t: t }; }) };
      return {
        h: pv.h || v.h, _punct: true,
        paras: pv.paras.map(function (t, pi) {
          var o = { t: t };
          var cls = punctParaCls(t, pi === 0);
          if (cls) o.cls = cls;
          return o;
        })
      };
    });
  }
  function applyDzMode(entry) {
    entry.punctMode = !!entry.hasPunct;
    entry.sections = entry.punctMode ? entry.sectionsPunct : entry.sectionsOrig;
  }
  function openWork(id, rowEl) {
    if (!dzGate(id)) return;
    /* 返回定位：记下出处（全藏分类列表/统一检索命中），jingwen.js 在
       closeReader 时统一恢复原分类原滚动位（__wuriLibCapture） */
    if (window.__wuriLibCapture) { try { window.__wuriLibCapture(id, rowEl); } catch (e) {} }
    if (workCache[id]) { doOpen(workCache[id]); return; }
    if (workLoading[id]) return; /* 在途：首击已负责开卷 */
    workLoading[id] = true;
    /* 行内容保持原样（书名/卷数在位），只以变淡示在途——不再用「载入中…」顶替整行
       （2026-10-28 用户真机：短经点开行间挂着「载入中…」迟迟不消失，观感如卡死） */
    if (rowEl) rowEl.classList.add('dz-row-loading');
    var settleRow = function () { if (rowEl) rowEl.classList.remove('dz-row-loading'); };
    ensureIndex(function () {
      var pText = fetch(FEED_DIR + 'texts/' + id + '.json').then(function (r) { return r.json(); });
      var pPunct = hasPunct(id)
        ? fetch(FEED_DIR + 'texts-punct/' + id + '.json').then(function (r) { return r.json(); }).catch(function () { return null; })
        : Promise.resolve(null);
      /* 图清单只为极少数有图部服务，不许它堵住全部开卷：已载入即同步取；
         未载入时与 600ms 竞速，超时按无图开卷且不入 workCache（下次开卷重建补图） */
      var pImg = new Promise(function (res) {
        if (imgData) { res({ anchors: (imgData.works && imgData.works[id]) || null, known: true }); return; }
        var done = false;
        ensureImages(function (d) {
          if (!done) { done = true; res({ anchors: (d && d.works && d.works[id]) || null, known: true }); }
        });
        setTimeout(function () {
          if (!done) { done = true; res({ anchors: null, known: false }); }
        }, 600);
      });
      Promise.all([pText, pPunct, pImg]).then(function (res) {
        workLoading[id] = false;
        var w = res[0], pw = res[1], anchors = res[2].anchors, imgKnown = res[2].known;
        var entry = {
          id: w.id, title: w.title,
          /* 分类/编号不在书头显示（2026-10-27 用户定）：随 dzMeta 交阅读器，文末一行小字交代 */
          dzMeta: { bu: w.bu, lei: w.lei || '', dz: w.dz || '' },
          note: w.note, daozang: true, lazy: (w.volumes.length > 1),
          /* 卷首错绑注记（数据驱动，feed 文本 JSON 的 binding_note 字段；
             仅错绑部有值，如 a0277 首葉被他經顶替。注记只在呈现层渲染，
             绝不进入正文段流——char 偏移/锚点/高亮/搜索/进度零影响） */
          bindingNote: w.binding_note || (pw && pw.binding_note) || '',
          hasPunct: !!(pw && pw.volumes && pw.volumes.length),
          punctPartial: null,
          sectionsOrig: buildOrigSections(w),
          sectionsPunct: null,
          sections: null
        };
        if (entry.hasPunct) {
          entry.sectionsPunct = buildPunctSections(w, pw);
          if (pw.volumes.length < w.volumes.length) {
            entry.punctPartial = { done: pw.volumes.length, total: w.volumes.length };
          }
        }
        /* 图版预切分：orig/punct 两套段落各按本套字流换算同一锚点，
           落点文字位置恒一致；无图部零改动 */
        if (anchors && anchors.length) {
          entry.sectionsOrig = dzApplyImages(entry.sectionsOrig, anchors);
          if (entry.sectionsPunct) entry.sectionsPunct = dzApplyImages(entry.sectionsPunct, anchors);
        }
        applyDzMode(entry);
        /* 图清单竞速超时（imgKnown=false）时条目可能缺图：不入 workCache，
           下次开卷时图清单多半已到、重建即补图（本次开卷内容不受影响） */
        if (imgKnown) workCache[id] = entry;
        window.JINGWEN = window.JINGWEN || {};
        window.JINGWEN[id] = entry;
        settleRow();
        doOpen(entry);
      }).catch(function () {
        workLoading[id] = false;
        settleRow();
        if (window.showToast) showToast('载入失败，请检查网络后重试');
      });
    });
  }

  /* ---------- 高亮字序投影（存储恒为原文坐标，显示按模式投影） ----------
   * 标点版与原文内容字逐字同序（保真校验），故以「内容字序号」为中介：
   * 原文段内偏移 → 全卷内容字区间 → 标点段串内下标，反之亦然。
   * 运行时逐卷自检 strip(标点全文)===原文全文，不符则该卷不投影（回退原样）。 */
  /* 入口查找：全藏走 workCache；精选内丹的标点 entry 挂在 JINGWEN 上
     （jingwen.js prepJingPunct 建 sectionsOrig/sectionsPunct），投影与切换共用此查找 */
  function dzFindEntry(id) {
    if (!id) return null;
    if (workCache[id]) return workCache[id];
    var j = window.JINGWEN && window.JINGWEN[id];
    return (j && j.sectionsPunct) ? j : null;
  }
  function dzSecMap(entry, si) {
    if (!entry || !entry.sectionsPunct) return null;
    entry._hlMaps = entry._hlMaps || {};
    if (entry._hlMaps[si] !== undefined) return entry._hlMaps[si];
    var oSec = entry.sectionsOrig[si], pSec = entry.sectionsPunct[si];
    var map = null;
    if (oSec && pSec && pSec._punct) {
      var oJoin = oSec.paras.map(function (p) { return p.t || ''; }).join('');
      var pJoin = pSec.paras.map(function (p) { return p.t || ''; }).join('');
      /* 两侧同口径剥除后比对：原文侧的清洗残留（入药镜 2 处、天仙正理 22 处
         制表符等空白）同样剥除，否则这类底本永远投影失败、高亮只能走回退
         （v143 已知尾巴，本批修复）。原文侧同步建内容字位表 oPos，
         原文坐标（原始下标）与内容字序号经 oPos 互转，残留字符不占内容位。 */
      if (dzStripPunct(pJoin) === dzStripPunct(oJoin)) {
        var oCum = [], oPos = [], oc = 0;
        oSec.paras.forEach(function (p) {
          var pos = [], pt = p.t || ''; /* 图段 pt='' → pos 空、不占内容字序 */
          for (var i = 0; i < pt.length; i++) if (!dzIsPunct(pt[i])) pos.push(i);
          oCum.push(oc); oPos.push(pos); oc += pos.length;
        });
        var pCum = [], pPos = [], pc = 0;
        pSec.paras.forEach(function (p) {
          var pos = [], pt = p.t || '';
          for (var i = 0; i < pt.length; i++) if (!dzIsPunct(pt[i])) pos.push(i);
          pCum.push(pc); pPos.push(pos); pc += pos.length;
        });
        map = { oCum: oCum, pCum: pCum, pPos: pPos, oPos: oPos, oLens: oPos.map(function (x) { return x.length; }) };
      }
    }
    entry._hlMaps[si] = map;
    return map;
  }
  /* 原文坐标 → 显示（标点）坐标段数组；非标点模式/无映射返回 null（调用方回退原值） */
  window.__wuri_dzHlToDisp = function (sid, h) {
    var e = dzFindEntry(sid);
    if (!e || !e.punctMode || !h) return null;
    var m = dzSecMap(e, h.sec);
    if (!m) return null;
    /* 存储坐标为原文原始下标，先经 oPos 换算为内容字序号（残留空白不占位） */
    var oPosH = m.oPos[h.para];
    if (!oPosH) return null;
    var c0 = 0; while (c0 < oPosH.length && oPosH[c0] < h.start) c0++;
    var c1 = c0; while (c1 < oPosH.length && oPosH[c1] < h.end) c1++;
    var g0 = m.oCum[h.para] + c0, g1 = m.oCum[h.para] + c1;
    var out = [];
    for (var j = 0; j < m.pPos.length; j++) {
      var ps = m.pCum[j], pe = ps + m.pPos[j].length;
      var a = Math.max(g0, ps), b = Math.min(g1, pe);
      if (a < b) out.push({ sec: h.sec, para: j, start: m.pPos[j][a - ps], end: m.pPos[j][b - ps - 1] + 1 });
    }
    return out.length ? out : null;
  };
  /* 显示（标点）选区段 → 原文坐标段数组（可能跨原文段，逐段拆） */
  window.__wuri_dzHlToOrig = function (sid, seg) {
    var e = dzFindEntry(sid);
    if (!e || !e.punctMode || !seg) return null;
    var m = dzSecMap(e, seg.sec);
    if (!m) return null;
    var pos = m.pPos[seg.para];
    if (!pos) return null;
    var c0 = 0; while (c0 < pos.length && pos[c0] < seg.start) c0++;
    var c1 = c0; while (c1 < pos.length && pos[c1] < seg.end) c1++;
    var g0 = m.pCum[seg.para] + c0, g1 = m.pCum[seg.para] + c1;
    if (g1 <= g0) return null;
    var out = [];
    for (var i = 0; i < m.oCum.length; i++) {
      var os = m.oCum[i], oe = os + m.oLens[i];
      var a = Math.max(g0, os), b = Math.min(g1, oe);
      /* 内容字序号 → 原文原始下标（与存储坐标口径一致） */
      if (a < b) out.push({ sec: seg.sec, para: i, start: m.oPos[i][a - os], end: m.oPos[i][b - os - 1] + 1 });
    }
    return out.length ? out : null;
  };
  function doOpen(entry) {
    var pyOn = true; /* 与阅读器一致：未设置时默认开（LS 为 '0' 才是关） */
    try { pyOn = localStorage.getItem('wuri_jing_py') !== '0'; } catch (e) {}
    /* 字典（224K）未到不再堵门等它（旧口径最长干等 5 秒，实测为短经冷开的
       第二趟串行往返）：先按现状注音开卷，字典到达后经阅读器既有重注机制
       （__wuri_dzOnPyToggle）补注已渲染卷；未渲染卷在懒填充时自动按新字典注。
       注音关时不强求字典（浏览目录时已空闲预载，多半早已就位）。 */
    annotateSection(entry, 0);
    if (window.JingWen && JingWen.openReader) JingWen.openReader(entry.id);
    if (pyOn && !pyDict) {
      ensureDict(function (ok) {
        if (ok && window.__wuri_dzOnPyToggle) { try { window.__wuri_dzOnPyToggle(); } catch (e) {} }
      });
    }
  }

  /* ---------- 事件（委托） ---------- */
  document.addEventListener('click', function (e) {
    var tgl = e.target.closest('[data-dz-toggle]');
    if (tgl) {
      var body = tgl.parentNode.querySelector('[data-dz-body]');
      if (body) {
        body.hidden = !body.hidden;
        dzOpen = !body.hidden;
        if (!body.hidden) renderCats(body);
        dzNotifySave();
      }
      return;
    }
    var bu = e.target.closest('[data-dz-bu]');
    if (bu) {
      var name = bu.getAttribute('data-dz-bu');
      var wrap = bu.parentNode.querySelector('[data-dz-works="' + name + '"]');
      if (wrap) {
        var willOpen = wrap.hidden;
        if (willOpen && !wrap.innerHTML) { wrap.innerHTML = worksOfBu(name).map(workRow).join(''); if (window.__wuriDecorateProgress) { try { window.__wuriDecorateProgress(); } catch (e) {} } }
        wrap.hidden = !willOpen;
        if (willOpen) dzFlowRows(wrap); /* 展开补测：隐藏时行数无从量（折叠行在 dzFlowRow 内跳过） */
        openBu[name] = willOpen;
        if (willOpen) pfWatch(bu.parentNode); /* 重挂全目录观察（pfWatch 内 disconnect 旧观察） */
        dzNotifySave();
      }
      return;
    }
    var wk = e.target.closest('[data-dz-work]');
    if (wk) { openWork(wk.getAttribute('data-dz-work'), wk); }
  });
  /* 统一检索钩子：经文库主检索（jingwen.js search）经此搜全藏书名——
     原文书名与简体显示书名双向匹配；命中点开走 openWork（data-dz-work 委托） */
  window.__wuri_dzTitleSearch = function (q, cb) {
    ensureIndex(function () {
      if (!idxData || !q) { cb && cb([]); return; }
      var hits = [];
      idxData.works.forEach(function (w) {
        if (w.title.indexOf(q) >= 0 || dzTx(w.title).indexOf(q) >= 0) {
          hits.push({
            id: w.id, title: w.title, dz: true,
            snip: '道藏全集 · ' + w.bu + (w.lei ? ' · ' + w.lei + '类' : '') + ' · ' + w.juan + ' 卷'
          });
        }
      });
      cb && cb(hits.slice(0, 60));
    });
  };
  /* 全文检索钩子（批一第 1 项②）：索引在 content/daozang/search/
     （bigram 倒排 96 分片，构建器 build_dz_search_index.py；归一化＝
     dzStripPunct＋t2s，与图版锚点/阅读器内容偏移同口径）。查词流程：
     询问 bigrams→按需拉分片（每片约 500KB）→最小 posting 为主钥与其余
     求交→候选≤30 部逐部拉底本 JSON 验证，产 {id,title,sec,snip,off}，
     off 为底本剥标点字偏移（点开后由 jingwen 侧轮询落位）。 */
  var dzSrchManifest = null, dzSrchShards = {};
  function dzSrchNorm(s) {
    var st = dzStripPunct(String(s || ''));
    return window.t2s ? window.t2s(st) : st;
  }
  function dzSrchLoadManifest(cb) {
    if (dzSrchManifest) { cb(dzSrchManifest); return; }
    fetch('content/daozang/search/manifest.json').then(function (r) { return r.json(); })
      .then(function (m) { dzSrchManifest = m; cb(m); })
      .catch(function () { cb(null); });
  }
  function dzSrchShard(n, cb) {
    if (dzSrchShards[n]) { cb(dzSrchShards[n]); return; }
    fetch('content/daozang/search/s' + ('00' + n).slice(-3) + '.bin')
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) { dzSrchShards[n] = buf; cb(buf); })
      .catch(function () { cb(null); });
  }
  function dzShardPosting(buf, key) {
    var dv = new DataView(buf);
    var n = dv.getUint32(0, true);
    var lo = 0, hi = n - 1, found = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var k = dv.getUint32(4 + mid * 12, true);
      if (k === key) { found = mid; break; }
      if (k < key) lo = mid + 1; else hi = mid - 1;
    }
    if (found < 0) return [];
    var off = dv.getUint32(4 + found * 12 + 4, true);
    var len = dv.getUint32(4 + found * 12 + 8, true);
    var base = 4 + n * 12 + off, end = base + len, i = base;
    var out = [], acc = 0;
    while (i < end) {
      var v = 0, sh = 0, b;
      do { b = dv.getUint8(i++); v |= (b & 0x7f) << sh; sh += 7; } while (b & 0x80);
      acc += v; out.push(acc);
    }
    return out;
  }
  window.__wuri_dzTextSearch = function (q, cb) {
    var nq = dzSrchNorm(q);
    if (nq.length < 2) { cb({ hits: [], short: true }); return; }
    dzSrchLoadManifest(function (m) {
      if (!m || !m.works) { cb({ hits: [], error: true }); return; }
      var nshard = m.shards || 96;
      var grams = [], seenG = {};
      for (var i = 0; i + 1 < nq.length; i++) {
        var u1 = nq.charCodeAt(i), u2 = nq.charCodeAt(i + 1);
        var key = ((u1 << 16) | u2) >>> 0;
        if (seenG[key]) continue;
        seenG[key] = 1;
        grams.push({ key: key, shard: (u1 * 31 + u2) % nshard });
      }
      var shardNos = [];
      grams.forEach(function (g) { if (shardNos.indexOf(g.shard) < 0) shardNos.push(g.shard); });
      var bufs = {}, left = shardNos.length;
      if (!left) { cb({ hits: [] }); return; }
      shardNos.forEach(function (sn) {
        dzSrchShard(sn, function (buf) {
          bufs[sn] = buf;
          if (--left > 0) return;
          var lists = [];
          for (var gi = 0; gi < grams.length; gi++) {
            var buf2 = bufs[grams[gi].shard];
            if (!buf2) { lists = null; break; }
            lists.push(dzShardPosting(buf2, grams[gi].key));
          }
          if (!lists) { cb({ hits: [], error: true }); return; }
          lists.sort(function (a, b) { return a.length - b.length; });
          var cand = (lists[0] || []).slice();
          for (var li = 1; li < lists.length && cand.length; li++) {
            var set = {};
            lists[li].forEach(function (w) { set[w] = 1; });
            cand = cand.filter(function (w) { return set[w]; });
          }
          var truncated = cand.length > 30;
          cand = cand.slice(0, 30);
          if (!cand.length) { cb({ hits: [], truncated: truncated }); return; }
          var hits = [], done = 0;
          cand.forEach(function (wi) {
            var id = m.works[wi];
            var fin = function () { if (++done === cand.length) cb({ hits: hits.slice(0, 120), truncated: truncated }); };
            if (!id) { fin(); return; }
            fetch(FEED_DIR + 'texts/' + id + '.json').then(function (r) { return r.json(); })
              .then(function (w) {
                var per = 0, base = 0;
                (w.volumes || []).forEach(function (vol, vi) {
                  var nt = dzSrchNorm((vol.paras || []).join(''));
                  var from = 0;
                  while (per < 3 && from <= nt.length - nq.length) {
                    var ix = nt.indexOf(nq, from);
                    if (ix < 0) break;
                    var s0 = Math.max(0, ix - 14), e0 = Math.min(nt.length, ix + nq.length + 14);
                    hits.push({
                      id: id, title: w.title, dzt: true,
                      sec: vol.h || ('卷' + (vi + 1)),
                      snip: (s0 > 0 ? '…' : '') + nt.slice(s0, e0) + (e0 < nt.length ? '…' : ''),
                      off: base + ix
                    });
                    per++; from = ix + Math.max(1, nq.length);
                  }
                  base += nt.length;
                });
              })
              .catch(function () {})
              .then(fin);
          });
        });
      });
    });
  };
})();
