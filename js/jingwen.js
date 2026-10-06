/* 戊日不上香 · 经文库阅读器（Pro）
 * 目录 / 全文检索 / 读诵（ruby 拼音注音，可开关）/ TTS 诵读 / 字号。
 * 经文数据 www/jing/sXX.js 按需懒加载（本地 <script> 注入）。
 */
var JingWen = (function () {
  'use strict';
  /* 三派排序（用户指定顺序） */
  var JING_ORDER = {
    all: ['s02','s01','s12','s13','s14','s10','s07','s11','s03','s04','s05','s09','s15','s16','s17'],
    quanzhen: ['s02','s12','s13','s10','s07','s11','s03','s04'],
    zhengyi: ['s01','s14','s10','s07','s11','s03','s04','s05','s09','s15','s16','s17']
  };
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
    s17: ['开库经', '钥匙经', '开库钥匙经']
  };

  var loaded = {};
  var currentId = null;
  var pyOn = true;
  var fontPx = 17;
  var reciteMode = false; /* 背诵模式：只显示每句首字，点句显示全文 */

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function isPro() { return window.WuriPro && WuriPro.isPro(); }

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
    var sc = document.createElement('script');
    sc.src = 'jing/' + id + '.js';
    sc.onload = function () { loaded[id] = 'done'; cb && cb(); };
    sc.onerror = function () { loaded[id] = 'error'; cb && cb(); };
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
    // 未在排序表中的追加在末尾
    idx.forEach(function (it) {
      if (order.indexOf(it.id) < 0) sorted.push(it);
    });
    host.innerHTML = sorted.map(function (it) {
      return '<div class="jing-item" data-jing="' + it.id + '">'
        + '<span class="jing-book">經</span>'
        + '<span class="jing-title">' + esc(it.title) + '</span>'
        + '<span class="jing-go">›</span></div>';
    }).join('');
  }

  /* ---------- 阅读器 ---------- */
  function rubyPara(p) {
    var t = p.t, py = p.py, out = '';
    var doTx = window.tx && typeof window.tx === 'function';
    for (var i = 0; i < t.length; i++) {
      var ch = t[i], r = py[i] || '';
      if (doTx) ch = window.tx(ch);
      if (r) out += '<ruby>' + esc(ch) + '<rt>' + esc(r) + '</rt></ruby>';
      else out += esc(ch);
    }
    return out;
  }
  /* 背诵模式：按句切分，每句只显示首字，点击展开全文 */
  function recitePara(p) {
    var t = p.t, py = p.py;
    var doTx = window.tx && typeof window.tx === 'function';
    // 按 。！？；切句，保留标点
    var sens = t.match(/[^。！？；]+[。！？；]?/g) || [t];
    var out = '', pos = 0;
    sens.forEach(function (sen) {
      if (!sen) return;
      var firstCh = sen.charAt(0);
      var dispCh = doTx ? window.tx(firstCh) : firstCh;
      // 找首字拼音
      var pyIdx = t.indexOf(sen, pos);
      var r = (pyIdx >= 0 && py[pyIdx]) ? py[pyIdx] : '';
      var firstHtml = r ? '<ruby>' + esc(dispCh) + '<rt>' + esc(r) + '</rt></ruby>' : esc(dispCh);
      // 全文其余部分（隐藏，点击显示）
      // rest：去掉首字后的剩余部分
      var restHtml = '';
      for (var j = 1; j < sen.length; j++) {
        var ch2 = sen[j], rr2 = (pyIdx >= 0) ? (py[pyIdx + j] || '') : '';
        if (doTx) ch2 = window.tx(ch2);
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

  function openReader(id, _retry) {
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
      currentId = id;
      $('#jing-home').hidden = true;
      $('#jing-reader').hidden = false;
      var doTx = window.tx && typeof window.tx === 'function';
      $('#jing-title').textContent = doTx ? window.tx(d.title) : d.title;
      applyReaderPrefs();
      var html = '';
      // 单节经文直接显示，不套折叠
      var singleSec = d.sections.length === 1;
      d.sections.forEach(function (sec, si) {
        // 叩磬：在赞/韵/咒/偈类节的末段加（敲磬）
        var h = sec.h || '';
        var isQingSec = /赞|韵|咒|偈|开经|完经/.test(h);
        var paras = sec.paras.map(function (p, pi) {
          var txt = reciteMode ? recitePara(p) : rubyPara(p);
          if (isQingSec && pi === sec.paras.length - 1) {
            txt += ' <span class="qing-inline" data-qing title="此处叩磬">（敲磬）</span>';
          }
          return '<p class="jing-para">' + txt + '</p>';
        }).join('');
        var secH = sec.h || ('第' + (si + 1) + '节');
        if (doTx) secH = window.tx(secH);
        if (singleSec) {
          // 单节：直接显示正文，无折叠头
          html += '<div class="jing-sec jing-sec-single" data-sec="' + si + '">'
            + '<div class="jing-sec-body">' + paras + '</div>'
            + '</div>';
        } else {
          html += '<div class="jing-sec" data-sec="' + si + '">'
            + '<h3 class="jing-sec-h" data-fold="' + si + '">' + esc(secH)
            + '</h3>'
            + '<div class="jing-sec-body" hidden>' + paras + '</div>'
            + '</div>';
        }
      });
      $('#jing-content').innerHTML = html;
      updateFoldBtn();
      $('#jing-reader').scrollTop = 0;
      window.scrollTo(0, 0);
    });
  }

  function updateFoldBtn() {
    var bodies = document.querySelectorAll('#jing-content .jing-sec-body');
    var open = 0;
    for (var i = 0; i < bodies.length; i++) if (!bodies[i].hidden) open++;
    var btn = $('#jing-foldall');
    if (btn) btn.textContent = (open === bodies.length && bodies.length) ? '全部折叠' : '全部展开';
  }

  function toggleSection(si) {
    var body = document.querySelector('#jing-content .jing-sec[data-sec="' + si + '"] .jing-sec-body');
    if (body) { body.hidden = !body.hidden; updateFoldBtn(); }
  }

  function foldAll() {
    var bodies = document.querySelectorAll('#jing-content .jing-sec-body');
    var anyClosed = false;
    for (var i = 0; i < bodies.length; i++) if (bodies[i].hidden) { anyClosed = true; break; }
    for (var j = 0; j < bodies.length; j++) bodies[j].hidden = !anyClosed;
    updateFoldBtn();
  }

  function closeReader() {
    stopSpeak();
    currentId = null;
    $('#jing-reader').hidden = true;
    $('#jing-home').hidden = false;
  }

  function applyReaderPrefs() {
    $('#jing-content').style.fontSize = fontPx + 'px';
    $('#jing-content').classList.toggle('no-py', !pyOn);
    $('#jing-pybtn').textContent = pyOn ? '注音开' : '注音关';
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

  /* ---------- 检索 ---------- */
  function search(q) {
    q = q.trim();
    var box = $('#jing-results');
    if (!q) { box.hidden = true; $('#jing-list').hidden = false; return; }
    ensureAll(function () {
      var out = [];
      var aliasHits = [];
      // 别名匹配：简称命中整部经，置顶
      (window.JINGWEN_INDEX || []).forEach(function (it) {
        var d = window.JINGWEN[it.id];
        if (!d) return;
        var aliases = JING_ALIAS[it.id] || [];
        var hit = d.title.indexOf(q) >= 0;
        if (!hit) {
          for (var i = 0; i < aliases.length; i++) {
            if (aliases[i].indexOf(q) >= 0 || q.indexOf(aliases[i]) >= 0) { hit = true; break; }
          }
        }
        if (hit) aliasHits.push({ id: it.id, title: d.title, sec: '', si: -1, snip: '（' + aliases.join('、') + '）', isAlias: true });
      });
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
      $('#jing-list').hidden = true;
      box.hidden = false;
      out = aliasHits.concat(out);
      box.innerHTML = out.length
        ? '<div class="jing-res-count">共 ' + out.length + ' 处</div>' + out.slice(0, 200).map(function (r) {
          return '<div class="jing-res" data-jing="' + r.id + '" data-sec="' + r.si + '">'
            + '<div class="jing-res-t">' + esc(r.title) + (r.sec ? ' · ' + esc(r.sec) : '') + '</div>'
            + '<div class="jing-res-s">' + r.snip + '</div></div>';
        }).join('')
        : '<p class="hint">未找到「' + esc(q) + '」</p>';
    });
  }

  /* ---------- TTS ---------- */
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
    var b = bridge();
    if (b && typeof b.ttsStop === 'function') { try { b.ttsStop(); } catch (e) {} }
    try { speechSynthesis.cancel(); } catch (e) {}
    var s = $('#jing-stop');
    if (s) s.hidden = true;
    var sp = $('#jing-speak');
    if (sp) sp.hidden = false;
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
    var d = window.JINGWEN[currentId];
    if (!d) return;
    var text = d.sections.map(function (sec) {
      return sec.paras.map(function (p) { return p.t; }).join('\n');
    }).join('\n');
    if (speakText(text)) {
      $('#jing-speak').hidden = true;
      $('#jing-stop').hidden = false;
    }
  }

  /* ---------- 初始化 ---------- */
  function bindFilter() {
    var btns = document.querySelectorAll('[data-jing-filter]');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        jingFilter = b.getAttribute('data-jing-filter');
        renderCatalog();
      });
    });
  }

  function init() {
    bindFilter();
    if (!$('#jing-body')) return;
    try { fontPx = +(localStorage.getItem('wuri_jing_font') || 17); } catch (e) {}
    /* 校准到两种之一 */
    fontPx = Math.abs(fontPx - 17) <= Math.abs(fontPx - 28) ? 17 : 28;
    try { pyOn = localStorage.getItem('wuri_jing_py') !== '0'; } catch (e) {}
    renderCatalog();
    applyReaderPrefs();
    /* 初始化按钮高亮 */
    var isBig = fontPx === 28;
    var bd = $('#jing-font-dec'), bi = $('#jing-font-inc');
    if (bd) bd.classList.toggle('active', !isBig);
    if (bi) bi.classList.toggle('active', isBig);

    document.addEventListener('click', function (e) {
      var ji = e.target.closest('[data-jing]');
      if (ji) {
        var sec = ji.getAttribute('data-sec');
        openReader(ji.getAttribute('data-jing'));
        if (sec != null && sec !== '-1') {
          setTimeout(function () {
            var body = document.querySelector('#jing-content .jing-sec[data-sec="' + sec + '"] .jing-sec-body');
            if (body) { body.hidden = false; updateFoldBtn(); }
            var hs = document.querySelectorAll('#jing-content .jing-sec-h');
            if (hs[+sec]) hs[+sec].scrollIntoView();
          }, 300);
        }
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
      var rs = e.target.closest('.recite-sen');
      if (rs && reciteMode) {
        var rest = rs.querySelector('.recite-rest');
        if (rest) { rest.hidden = !rest.hidden; rs.classList.toggle('open', !rest.hidden); }
        return;
      }
    });

    var q = $('#jing-q');
    q.addEventListener('input', function () { search(q.value); });

    $('#jing-back').addEventListener('click', closeReader);
    $('#jing-pybtn').addEventListener('click', function () {
      pyOn = !pyOn;
      try { localStorage.setItem('wuri_jing_py', pyOn ? '1' : '0'); } catch (e) {}
      applyReaderPrefs();
    });
    try { reciteMode = localStorage.getItem('wuri_jing_recite') === '1'; } catch (e) {}
    var rcb = $('#jing-recite');
    if (rcb) rcb.addEventListener('click', toggleRecite);
    var FONT_SIZES = [17, 28]; /* 两种：正常/大 */
    function setFont(idx) {
      fontPx = FONT_SIZES[idx];
      try { localStorage.setItem('wuri_jing_font', fontPx); } catch (e) {}
      applyReaderPrefs();
      // 更新按钮状态
      $('#jing-font-dec').classList.toggle('active', idx === 0);
      $('#jing-font-inc').classList.toggle('active', idx === 1);
    }
    $('#jing-font-inc').addEventListener('click', function () { setFont(1); });
    $('#jing-font-dec').addEventListener('click', function () { setFont(0); });
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
      var pro = isPro();
      $('#jing-lock').hidden = !!pro;
      $('#jing-body').hidden = !pro;
      if (pro) renderCatalog();
    });
    // 初始锁定态
    var pro = isPro();
    $('#jing-lock').hidden = !!pro;
    $('#jing-body').hidden = !pro;
  }

  document.addEventListener('DOMContentLoaded', init);
  window.closeReader = closeReader; // 供 Android 系统返回键调用
  return { openReader: openReader, search: search, closeReader: closeReader };
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
    var lyBackFab = document.getElementById('liuyao-back-fab');
    var topFab = document.getElementById('to-top-fab');
    // 经文阅读器
    var reader = document.getElementById('jing-reader');
    var jingTab = document.getElementById('tab-jing');
    var showReader = reader && !reader.hidden && jingTab && !jingTab.hidden;
    if (fab) fab.classList.toggle('show', !!showReader);
    if (backFab) backFab.classList.toggle('show', !!showReader);
    // 六爻占卜视图
    var lyView = document.getElementById('view-liuyao');
    var showLy = lyView && !lyView.hidden;
    if (lyBackFab) lyBackFab.classList.toggle('show', !!showLy);
    // 黄历/提醒置顶按钮（滚动超过一屏时显示）
    var calTab = document.getElementById('tab-cal');
    var remTab = document.getElementById('tab-remind');
    var showCal = calTab && !calTab.hidden;
    var showRem = remTab && !remTab.hidden;
    var scrolled = (window.scrollY || document.documentElement.scrollTop) > 400;
    if (topFab) topFab.classList.toggle('show', !!(scrolled && (showCal || showRem)));
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
    // 六爻浮动返回：回到六爻主页面
    var lyBackFab = document.getElementById('liuyao-back-fab');
    if (lyBackFab) {
      lyBackFab.addEventListener('click', function () {
        var btn = document.getElementById('liuyao-back');
        if (btn) btn.click();
      });
    }
    // 置顶按钮：滚动到顶部
    var topFab = document.getElementById('to-top-fab');
    if (topFab) {
      topFab.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    // 监听滚动，更新置顶按钮显示
    window.addEventListener('scroll', updateFab, { passive: true });
    // 监听视图切换
    setInterval(updateFab, 500);
  });
})();
