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
    's40','s41','s42','s43','s44','s45','s46','s47','s48'];
  var NEIDAN_TITLES = {
    s18: '黄庭内景经', s19: '周易参同契', s20: '太乙金华宗旨', s21: '太清元道真经',
    s22: '钟吕传道集', s23: '性命圭旨', s24: '伍柳仙宗', s25: '乐育堂语录',
    s40: '悟真篇', s41: '入药镜', s42: '金丹四百字', s43: '灵宝毕法',
    s44: '规中指南', s45: '金丹大要', s46: '还源篇', s47: '天仙正理', s48: '坐忘论',
  };
  function isNeidan(id) { return NEIDAN_IDS.indexOf(id) >= 0; }
  var jingFilter = 'all';
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
    s27: ['心印经', '心印妙经', '玉皇心印']
  };

  var loaded = {};
  var currentId = null;
  var pyOn = true;
  var fontPx = 17;
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
    /* 第一层「常见经文」：置顶、一直展开（无折叠开关） */
    var html = '<div class="jing-sec" data-common-sec>'
      + '<h3 class="jing-sec-h">' + esc(t('jing_sec_common')) + '（' + sorted.length + '）</h3>'
      + sorted.map(function (it) {
        return '<div class="jing-item" data-jing="' + it.id + '">'
          + '<span class="jing-book">' + esc(it.cat || '經') + '</span>'
          + '<span class="jing-title">' + esc(it.title) + '</span>'
          + '<span class="jing-go">›</span></div>';
      }).join('')
      + '</div>';
    // 内丹书籍折叠区
    var neidanItems = [];
    NEIDAN_IDS.forEach(function (id) {
      var f = idx.filter(function (x) { return x.id === id; })[0];
      if (f) neidanItems.push(f);
    });
    if (neidanItems.length && !window.IS_FREE_BUILD) {
      var ndPro = isPro();
      html += '<div class="jing-sec" data-neidan-fold>'
        + '<h3 class="jing-sec-h" data-neidan-toggle>' + esc(t('jing_sec_neidan')) + '（' + neidanItems.length + '）<span class="jing-go">›</span></h3>'
        + '<div class="jing-neidan-body" hidden>'
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
  }

  /* ---------- 阅读器 ---------- */
  function rubyPara(p, secIdx, paraIdx) {
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
       此处兜底书签/高亮/心得列表跳转等直达路径（KR5* 条目），与内丹同口径 */
    if (/^KR5/.test(id || '') && !isPro()) { if (window.WuriPro) WuriPro.requirePro('jingwen'); return; }
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

  function renderReaderBody(id, d) {
      currentId = id;
      window._jingCurrentId = id;
      $('#jing-home').hidden = true;
      $('#jing-reader').hidden = false;
      updateAudioButtons();
      // 切到无音频经时若跟读开着，自动退出跟读态（避免高亮映射残留到新经）
      if (followMode && !hasAudio(id)) toggleFollow();

      $('#jing-title').textContent = txScript(d.title);
      // 传本标注（如宝诰的"闾山三奶派传本、非道藏所载"）：有才显示
      var jsub = $('#jing-subtitle');
      if (jsub) {
        if (d.subtitle) { jsub.textContent = txScript(d.subtitle); jsub.hidden = false; }
        else { jsub.hidden = true; }
      }
      // 来源标注（道藏全藏：底本来源＋未校订＋注音口径；标点版模式换标点口径）
      var jnote = $('#jing-srcnote');
      if (jnote) {
        if (d.note) {
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
      $('#jing-content').innerHTML = html;
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
      if (bm && bm.scrollTop > 50) {
        $('#jing-reader').scrollTop = bm.scrollTop;
      } else {
        $('#jing-reader').scrollTop = 0;
      }
      window.scrollTo(0, 0);
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

  function closeReader() {
    stopTtsOnly(); // 只停系统 TTS，后台 MP3 服务交给悬浮岛（回经文 tab 不停播）
    // 跟读模式随阅读器关闭而关闭（避免切经文后映射错乱）
    if (followMode) toggleFollow();
    currentId = null;
    window._jingCurrentId = null;
    $('#jing-reader').hidden = true;
    $('#jing-home').hidden = false;
  }

  /* 重置回目录页（问题1修复：进经文tab时调用） */
  function resetToCatalog() {
    dzPreload(); /* 进文库即预加载全藏书名索引，检索书名阶段不等临查现拉 */
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
    // 清空搜索框
    var q = $('#jing-q');
    if (q) { q.value = ''; }
    var qClear = $('#jing-q-clear');
    if (qClear) qClear.hidden = true;
  }

  function applyReaderPrefs() {
    $('#jing-content').style.fontSize = fontPx + 'px';
    // 问题8修复：内丹书不显示拼音，隐藏拼音按钮
    var isNd = currentId && isNeidan(currentId);
    var pyBtn = $('#jing-pybtn');
    if (pyBtn) pyBtn.hidden = !!isNd;
    var showPy = pyOn && !isNd;
    $('#jing-content').classList.toggle('no-py', !showPy);
    if (pyBtn) pyBtn.textContent = pyOn ? '注音开' : '注音关';
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
      // 温和跟随：只在段落不在视口内时滚动
      try {
        var r = el.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight - 120) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
   *   ensureAll（44 部全文顺序加载）阻塞，书名命中先行渲染，全文命中随后并入；
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
  var JING_HAS_AUDIO = ['s01','s02','s03','s04','s05','s07','s09','s15','s10','s12','s13','s14','s16','s17','s26','s27','s28','s29','s30','s31','s32','s33','s35','s34','s36','s39'];
  var JING_NEIDAN = ['s18','s19','s20','s21','s23','s22','s40','s41','s42','s43','s44','s45','s46','s47','s48'];
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
      + '<button id="jing-fp-close" style="flex:none;width:30px;height:30px;border-radius:50%;border:none;background:rgba(255,255,255,0.12);color:#ccc;font-size:12px;line-height:1;">✕</button>'
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
  function bindFilter() {
    var btns = document.querySelectorAll('[data-jing-filter]');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
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
        btns.forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        jingFilter = b.getAttribute('data-jing-filter');
        renderCatalog();
      });
    });
  }

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
    renderCatalog();
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
  return { openReader: openReader, search: search, closeReader: closeReader, isNeidan: isNeidan, resetToCatalog: resetToCatalog };
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
        var total = 0;
        var walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, null, false);
        var n;
        while ((n = walker.nextNode())) {
          if (n.parentNode && n.parentNode.tagName === 'RT') continue;
          if (n === node) return total + offsetInNode;
          total += n.textContent.length;
        }
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
        JingWen.openReader(sid);
        setTimeout(function () {
          // 恢复展开的章节
          expanded.forEach(function (secIdx) {
            if (window.__wuri_dzFill) { try { window.__wuri_dzFill(+secIdx); } catch (e) {} }
            var body = document.querySelector('#jing-content .jing-sec[data-sec="' + secIdx + '"] .jing-sec-body');
            if (body) body.hidden = false;
          });
          // 恢复滚动位置（页面是window滚动，不是#jing-reader）
          window.scrollTo(0, st);
        }, 400);
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
      + '</div>';

    if (activeTab === 'bookmark') {
      html += renderBookmarks(JM);
    } else if (activeTab === 'highlight') {
      html += renderHighlights(JM);
    } else {
      html += renderNotes(JM);
    }

    marksEl.innerHTML = html;
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
        if (tabName === 'bookmark' || tabName === 'highlight' || tabName === 'note') {
          showMarks(tabName);
          return;
        }
        // 主导航的 data-tab (tab-home/tab-jing等) 不在这里处理，交给 app.js
      }
      // 返回目录
      if (e.target.closest('#marks-back')) { hideMarks(); return; }
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
