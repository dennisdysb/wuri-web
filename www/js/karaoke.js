/* 跟唱播放器（2026-11-06 跟唱样板 v1 · 用户亲令上网页版）
 * 第二档：逐句真实时间轴＋句内逐字匀速推进、已唱字变金色；
 * 变速 0.5×/0.75×/1×；点句跳转＋单句循环；播放自动滚动。
 * 打分 v1：录用户音（getUserMedia），与青玄原唱逐句比对——
 *   完成度（该句时段内有声占比）＋节奏（有声重心与句中点贴合度）为主、
 *   音高（中位基频与原唱参考音高之差，八度折叠、±100 音分满分）为辅；
 *   唱诵拖腔多、音高比流行歌松，分数宽容。音高参考来自 timeline.json 的
 *   ref_pitch_hz（voiced_frac < 0.5 的句不计音高，只计完成度＋节奏）。
 * 数据：content/karaoke/base_text.json（底本，唱词＋注音）＋
 *       content/karaoke/timeline.json（逐句时间轴＋参考音高，153 条）。
 * 音频：audio/karaoke/seg1|2|3.m4a（三段青玄录音）。
 * 颜色一律走 CSS 变量链（--gold 已唱字、--teal 好分、--cinnabar 差分），
 *   日间／夜间／红光三态由变量覆写自动适配，不得写死色值。
 * 注意：打分时原唱经扬声器会进麦克风（回声消除仅能部分抑制），
 *   建议戴耳机打分；分数以节奏＋完成度为主，音高为辅。
 */
(function () {
  'use strict';

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function t(key) {
    try { if (typeof window.t === 'function') return window.t(key); } catch (e) {}
    return key;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function scrollToEl(el, opts) {
    /* 滚动到元素：部分 WebView 无 scrollIntoView，做防御（不抛错） */
    try { if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView(opts); } catch (e) {}
  }
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- 常量 ---------- */
  var BASE_TEXT_URL = 'content/karaoke/base_text.json';
  var TIMELINE_URL = 'content/karaoke/timeline.json';
  var AUDIO_URL = { seg1: 'audio/karaoke/seg1.m4a', seg2: 'audio/karaoke/seg2.m4a', seg3: 'audio/karaoke/seg3.m4a' };
  var SEG_ORDER = ['seg1', 'seg2', 'seg3'];
  /* （罄）显示位置 = 该位置前的字数（按底本 note 的显式表述，与 build_s06.py 一致；
     qing 数值数组在三处天尊句与 note 不符，以 note 为准） */
  var QING_POS = {
    'chengqing|9': [4], 'ju_tianzun|0': [5], 'diaogua|6': [7],
    'xiang_gongyang|0': [5], 'xiao_qiqing|3': [3], 'xiao_qiqing|4': [4, 6],
    'jingxin|0': [2], 'jingshen|0': [3]
  };
  var RMS_VOICED = 0.012;   /* 麦克风有声阈值（RMS） */
  var PITCH_MIN = 80, PITCH_MAX = 400; /* 人声基频搜索范围 Hz */

  /* ---------- 状态 ---------- */
  var data = null;          /* {base, timeline, items:[153], sections:[{id,name,sing,items[]}]} */
  var seg = 'all';          /* 'all' | 'seg1' | 'seg2' | 'seg3' */
  var curFile = 'seg1';
  var loopOne = false;
  var scoring = false;      /* 打分是否已武装（正在采样） */
  var mic = null;           /* {stream, ctx, analyser, timer, samples:[{file,t,rms,f0}]} */
  var rafId = 0;
  var lastLineIdx = -1;
  var lastLineEl = null;
  var audio = null;
  var opened = false;
  var loadPromise = null;

  /* ---------- 数据 ---------- */
  function loadData() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
      fetch(BASE_TEXT_URL).then(function (r) { if (!r.ok) throw new Error('base_text ' + r.status); return r.json(); }),
      fetch(TIMELINE_URL).then(function (r) { if (!r.ok) throw new Error('timeline ' + r.status); return r.json(); })
    ]).then(function (pair) {
      var base = pair[0], tl = pair[1];
      var baseByKey = {};
      base.sections.forEach(function (s) {
        s.lines.forEach(function (l, i) { baseByKey[s.id + '|' + i] = { section: s, line: l, idx: i }; });
      });
      var items = [];
      (tl.lines || []).forEach(function (tlLine, n) {
        var b = baseByKey[tlLine.section + '|' + tlLine.line_idx];
        if (!b) return;
        items.push({
          n: n, section: tlLine.section, section_name: tlLine.section_name || b.section.name,
          line_idx: tlLine.line_idx, repeat_idx: (tlLine.repeat_idx == null ? null : tlLine.repeat_idx),
          text: b.line.text, py: b.line.py || [],
          audio: tlLine.audio, t0: tlLine.t0, t1: tlLine.t1,
          ref_pitch_hz: tlLine.ref_pitch_hz, ref_pitch_note: tlLine.ref_pitch_note,
          voiced_frac: tlLine.voiced_frac, align: tlLine.align || ''
        });
      });
      /* 按底本段序分组；不唱的两段（提纲）以灰化分隔行呈现 */
      var sections = [];
      base.sections.forEach(function (s) {
        var its = items.filter(function (it) { return it.section === s.id; });
        sections.push({ id: s.id, name: s.name, sing: s.sing !== false, items: its });
      });
      data = { base: base, timeline: tl, items: items, sections: sections };
      return data;
    });
    return loadPromise;
  }

  /* ---------- 歌词渲染 ---------- */
  function renderLyrics() {
    var host = $('karaoke-lyrics');
    if (!host) return;
    if (!data) { host.innerHTML = '<p class="hint">' + esc(t('karaoke_loading')) + '</p>'; return; }
    var html = '';
    data.sections.forEach(function (sec) {
      html += '<div class="karaoke-sec"><div class="karaoke-sec-h">' + esc(sec.name) + '</div>';
      if (!sec.sing) {
        html += '<div class="karaoke-nonsing">' + esc(t('karaoke_nonsing_note')) + '</div></div>';
        return;
      }
      sec.items.forEach(function (it) {
        html += '<div class="karaoke-line" data-n="' + it.n + '" data-file="' + it.audio +
          '" data-t0="' + it.t0 + '" data-t1="' + it.t1 + '">';
        var chars = it.text.split('');
        var qing = QING_POS[it.section + '|' + it.line_idx] || [];
        var qingSet = {};
        qing.forEach(function (p) { qingSet[p] = true; });
        chars.forEach(function (ch, ci) {
          var py = (it.py && it.py[ci]) || '';
          html += '<ruby class="karaoke-ch" data-ci="' + ci + '">' + esc(ch) +
            '<rt>' + esc(py) + '</rt></ruby>';
          if (qingSet[ci + 1]) html += '<span class="karaoke-qing">罄</span>';
        });
        if (it.repeat_idx != null) {
          html += '<span class="karaoke-repeat">第' + (it.repeat_idx + 1) + '遍</span>';
        }
        html += '</div>';
      });
      html += '</div>';
    });
    host.innerHTML = html;
    /* 点句跳转 */
    var lines = host.querySelectorAll('.karaoke-line');
    lines.forEach(function (el) {
      el.addEventListener('click', function () {
        var n = parseInt(el.getAttribute('data-n'), 10);
        jumpToLine(n, true);
      });
    });
  }

  function lineEls() {
    var host = $('karaoke-lyrics');
    return host ? host.querySelectorAll('.karaoke-line') : [];
  }
  function elForItem(n) {
    var host = $('karaoke-lyrics');
    return host ? host.querySelector('.karaoke-line[data-n="' + n + '"]') : null;
  }

  /* ---------- 播放控制 ---------- */
  function setSeg(next, opts) {
    seg = next;
    var btns = document.querySelectorAll('#karaoke-seg-row .karaoke-seg');
    btns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-seg') === next); });
    var file = (next === 'all') ? 'seg1' : next;
    loadFile(file, opts && opts.autoplay);
  }
  function loadFile(file, autoplay) {
    curFile = file;
    if (!audio) return;
    audio.src = AUDIO_URL[file];
    audio.load();
    lastLineIdx = -1;
    clearLineState();
    updateTime();
    if (autoplay) { audio.play().catch(function () {}); }
  }
  function currentItems() {
    if (!data) return [];
    if (seg === 'all') return data.items;
    return data.items.filter(function (it) { return it.audio === seg; });
  }
  function findLine(file, time) {
    if (!data) return -1;
    for (var i = 0; i < data.items.length; i++) {
      var it = data.items[i];
      if (it.audio === file && time >= it.t0 && time < it.t1) return i;
    }
    return -1;
  }
  function clearLineState() {
    lastLineEl = null;
    lineEls().forEach(function (el) {
      el.classList.remove('active');
      el.querySelectorAll('.karaoke-ch').forEach(function (c) { c.classList.remove('sung'); });
    });
  }
  function paintLine(itemIdx, time) {
    if (itemIdx !== lastLineIdx) {
      if (lastLineEl) {
        lastLineEl.classList.remove('active');
        lastLineEl.querySelectorAll('.karaoke-ch').forEach(function (c) { c.classList.remove('sung'); });
        lastLineEl = null;
      }
      lastLineIdx = itemIdx;
      if (itemIdx >= 0) {
        lastLineEl = elForItem(itemIdx);
        if (lastLineEl) {
          lastLineEl.classList.add('active');
          scrollToEl(lastLineEl, { block: 'center' });
        }
      }
    }
    if (itemIdx < 0 || !data || !lastLineEl) return;
    var it = data.items[itemIdx];
    var dur = Math.max(0.001, it.t1 - it.t0);
    var frac = Math.min(1, Math.max(0, (time - it.t0) / dur));
    var sung = Math.floor(frac * it.text.length);
    lastLineEl.querySelectorAll('.karaoke-ch').forEach(function (c, ci) {
      c.classList.toggle('sung', ci < sung);
    });
  }
  function updateTime() {
    var bar = $('karaoke-progress-bar'), tm = $('karaoke-time');
    if (!audio) return;
    var d = audio.duration || 0, c = audio.currentTime || 0;
    if (bar) bar.style.width = (d > 0 ? (c / d * 100) : 0) + '%';
    if (tm) tm.textContent = fmt(c) + ' / ' + fmt(d);
  }
  function jumpToLine(n, autoplay) {
    if (!data || n < 0 || n >= data.items.length) return;
    var it = data.items[n];
    if (it.audio !== curFile) loadFile(it.audio, false);
    audio.currentTime = Math.max(0, it.t0 + 0.01);
    if (autoplay) audio.play().catch(function () {});
    paintLine(n, audio.currentTime);
  }
  function setPlayingUI(playing) {
    var btn = $('karaoke-play');
    if (btn) btn.textContent = playing ? t('karaoke_pause') : t('karaoke_play');
  }

  /* ---------- 逐帧循环 ---------- */
  function tick() {
    if (!opened) return;
    rafId = requestAnimationFrame(tick);
    if (!audio) return;
    /* 视图已关闭或切走标签页时停音，避免后台继续唱。
     * 注意不用 offsetParent：#karaoke-view 是 position:fixed，fixed 元素的
     * offsetParent 恒为 null，用它判可见性会在播放开始后一帧内误停
     * （v576 真机 bug：点播放无反应，时长却正常显示 02:57）。 */
    var view = $('karaoke-view');
    if (view && (view.hidden || document.hidden) && !audio.paused) { audio.pause(); return; }
    var time = audio.currentTime || 0;
    /* 单句循环 */
    if (loopOne && lastLineIdx >= 0 && data) {
      var it = data.items[lastLineIdx];
      if (it && it.audio === curFile && time >= it.t1) {
        audio.currentTime = Math.max(0, it.t0 + 0.01);
        time = audio.currentTime;
      }
    }
    var idx = findLine(curFile, time);
    paintLine(idx, time);
    updateTime();
  }

  /* ---------- 麦克风＋基频 ---------- */
  function detectPitch(buf, sampleRate) {
    /* 自相关基频跟踪（80–400 Hz），返回 {f0, clarity} 或 null */
    var n = buf.length, i, lag;
    var mean = 0;
    for (i = 0; i < n; i++) mean += buf[i];
    mean /= n;
    var rms = 0;
    for (i = 0; i < n; i++) { var v = buf[i] - mean; rms += v * v; }
    rms = Math.sqrt(rms / n);
    if (rms < 0.004) return null;
    var minLag = Math.floor(sampleRate / PITCH_MAX), maxLag = Math.ceil(sampleRate / PITCH_MIN);
    var bestLag = -1, bestVal = -1;
    var c0 = 0;
    for (i = 0; i < n; i++) { var d = buf[i] - mean; c0 += d * d; }
    if (c0 <= 0) return null;
    for (lag = minLag; lag <= maxLag; lag++) {
      var c = 0;
      for (i = 0; i < n - lag; i++) c += (buf[i] - mean) * (buf[i + lag] - mean);
      var norm = c / c0;
      if (norm > bestVal) { bestVal = norm; bestLag = lag; }
    }
    if (bestLag < 0 || bestVal < 0.5) return null;
    /* 抛物线插值细化 */
    var cPrev = 0, cNext = 0;
    for (i = 0; i < n - (bestLag - 1); i++) cPrev += (buf[i] - mean) * (buf[i + bestLag - 1] - mean);
    for (i = 0; i < n - (bestLag + 1); i++) cNext += (buf[i] - mean) * (buf[i + bestLag + 1] - mean);
    var shift = 0;
    var denom = (cPrev - 2 * bestVal * c0 + cNext);
    if (denom !== 0) shift = 0.5 * (cPrev - cNext) / denom;
    var lagFine = bestLag + shift;
    if (lagFine <= 0) return null;
    return { f0: sampleRate / lagFine, clarity: bestVal };
  }
  function startMic() {
    if (mic) return Promise.resolve(mic);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('no getUserMedia'));
    }
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    }).then(function (stream) {
      var AC = window.AudioContext || window.webkitAudioContext;
      var ctx = new AC();
      var src = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      mic = { stream: stream, ctx: ctx, analyser: analyser, samples: [], timer: 0 };
      mic.timer = setInterval(function () {
        if (!audio || audio.paused || !mic) return;
        var buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        var rms = 0, i;
        for (i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / buf.length);
        var f0 = null;
        if (rms >= RMS_VOICED) {
          var p = detectPitch(buf, ctx.sampleRate);
          if (p) f0 = p.f0;
        }
        mic.samples.push({ file: curFile, t: audio.currentTime || 0, rms: rms, f0: f0 });
      }, 100);
      return mic;
    });
  }
  function stopMic() {
    if (!mic) return;
    try { clearInterval(mic.timer); } catch (e) {}
    try { mic.stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e) {}
    try { mic.ctx.close(); } catch (e) {}
    mic = null;
  }

  /* ---------- 打分 ---------- */
  function armScoring() {
    var hint = $('karaoke-mic-hint');
    if (hint) hint.hidden = false;
    startMic().then(function () {
      scoring = true;
      var btn = $('karaoke-score-btn');
      if (btn) { btn.textContent = t('karaoke_scoring'); btn.classList.add('active'); }
      if (audio && audio.paused) audio.play().catch(function () {});
    }).catch(function () {
      scoring = false;
      var btn = $('karaoke-score-btn');
      if (btn) btn.textContent = t('karaoke_score');
      alert(t('karaoke_mic_denied'));
    });
  }
  function disarmScoring(show) {
    scoring = false;
    var btn = $('karaoke-score-btn');
    if (btn) { btn.textContent = t('karaoke_score'); btn.classList.remove('active'); }
    var samples = mic ? mic.samples.slice() : [];
    stopMic();
    if (show) showScore(samples);
  }
  function median(arr) {
    if (!arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return (a.length % 2) ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function scoreLines(samples) {
    if (!data) return null;
    var items = currentItems();
    if (!items.length) return null;
    /* 本次唱过的音频文件集合（已播完的或有采样） */
    var filesDone = {};
    samples.forEach(function (s) { filesDone[s.file] = true; });
    if (audio && audio.ended) filesDone[curFile] = true;
    var now = audio ? (audio.currentTime || 0) : 0;
    var results = [];
    items.forEach(function (it) {
      var attempted = !!filesDone[it.audio] ||
        (it.audio === curFile && now >= it.t1) ||
        samples.some(function (s) { return s.file === it.audio && s.t >= it.t0 && s.t <= it.t1; });
      if (!attempted) return; /* 尚未唱到，不计分 */
      var win = samples.filter(function (s) { return s.file === it.audio && s.t >= it.t0 && s.t <= it.t1; });
      var voiced = win.filter(function (s) { return s.rms >= RMS_VOICED; });
      var completeness = win.length ? (voiced.length / win.length) : 0;
      var rhythm = 0, rhythmOff = 0;
      if (voiced.length) {
        var centroid = voiced.reduce(function (a, s) { return a + s.t; }, 0) / voiced.length;
        var center = (it.t0 + it.t1) / 2, half = Math.max(0.001, (it.t1 - it.t0) / 2);
        var off = Math.min(1, Math.abs(centroid - center) / half);
        rhythm = Math.max(0, 1 - off);
        rhythmOff = centroid - center; /* 正=重心偏晚，负=偏早 */
      }
      var pitch = null, cents = null;
      var usePitch = !!(it.ref_pitch_hz && it.voiced_frac != null && it.voiced_frac >= 0.5);
      if (usePitch) {
        var f0s = voiced.map(function (s) { return s.f0; }).filter(function (f) { return f; });
        if (f0s.length >= 3) {
          var med = median(f0s);
          if (med && med > 0) {
            cents = 1200 * Math.log(med / it.ref_pitch_hz) / Math.log(2);
            /* 八度折叠：差一个八度不扣分 */
            cents = cents - 1200 * Math.round(cents / 1200);
            var ac = Math.abs(cents);
            pitch = ac <= 100 ? 1 : (ac >= 200 ? 0 : 1 - (ac - 100) / 100);
          }
        }
      }
      var score;
      if (pitch != null) score = 0.45 * completeness + 0.25 * rhythm + 0.30 * pitch;
      else score = 0.6 * completeness + 0.4 * rhythm;
      results.push({
        item: it, score: score, completeness: completeness, rhythm: rhythm,
        rhythmOff: rhythmOff, pitch: pitch, cents: cents,
        voiced: voiced.length, total: win.length
      });
    });
    if (!results.length) return null;
    var total = results.reduce(function (a, r) { return a + r.score; }, 0) / results.length;
    return { total: total, lines: results };
  }
  function gradeOf(total100) {
    if (total100 >= 90) return t('karaoke_grade_excellent');
    if (total100 >= 75) return t('karaoke_grade_good');
    if (total100 >= 60) return t('karaoke_grade_fair');
    return t('karaoke_grade_retry');
  }
  function feedbackOf(r) {
    if (!r.voiced) return t('karaoke_fb_silent');
    if (r.completeness < 0.7) return t('karaoke_fb_short');
    if (r.rhythm < 0.7) return (r.rhythmOff >= 0) ? t('karaoke_fb_late') : t('karaoke_fb_early');
    if (r.pitch != null && r.pitch < 0.7) return (r.cents > 0) ? t('karaoke_fb_high') : t('karaoke_fb_low');
    return t('karaoke_fb_good');
  }
  function showScore(samples) {
    var host = $('karaoke-score');
    if (!host) return;
    host.hidden = false;
    var res = scoreLines(samples || []);
    if (!res) {
      host.innerHTML = '<div class="karaoke-score-card"><div class="karaoke-score-t">' +
        esc(t('karaoke_score_title')) + '</div><p class="hint">' +
        esc(t('karaoke_fb_silent')) + '</p></div>';
      scrollToEl(host, { block: 'start' });
      return;
    }
    var total100 = Math.round(res.total * 100);
    var cls = total100 >= 75 ? 'good' : (total100 >= 60 ? 'fair' : 'poor');
    var html = '<div class="karaoke-score-card"><div class="karaoke-score-t">' +
      esc(t('karaoke_score_title')) + '</div>' +
      '<div class="karaoke-score-num ' + cls + '">' + total100 + '</div>' +
      '<div class="karaoke-score-grade">' + esc(gradeOf(total100)) + '</div>' +
      '<div class="karaoke-score-list">';
    res.lines.forEach(function (r) {
      var s = Math.round(r.score * 100);
      var lc = s >= 75 ? 'good' : (s >= 60 ? 'fair' : 'poor');
      html += '<div class="karaoke-score-row"><span class="karaoke-score-text">' +
        esc(r.item.text) + '</span><span class="karaoke-score-val ' + lc + '">' + s +
        '</span><span class="karaoke-score-fb">' + esc(feedbackOf(r)) + '</span></div>';
    });
    html += '</div><button class="btn small" id="karaoke-retry">' + esc(t('karaoke_retry')) + '</button></div>';
    host.innerHTML = html;
    scrollToEl(host, { block: 'start' });
    var rb = $('karaoke-retry');
    if (rb) rb.addEventListener('click', function () {
      host.hidden = true; host.innerHTML = '';
      if (audio) { audio.currentTime = 0; }
      armScoring();
    });
  }

  /* ---------- 打开 / 关闭 ---------- */
  function open() {
    var view = $('karaoke-view');
    if (!view) return;
    view.hidden = false;
    opened = true;
    renderLyrics();
    loadData().then(function () {
      renderLyrics();
      setSeg(seg, { autoplay: false });
    }).catch(function () {
      var host = $('karaoke-lyrics');
      if (host) host.innerHTML = '<p class="hint">' + esc(t('karaoke_loading')) + '</p>';
    });
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
    view.scrollTop = 0;
  }
  function close() {
    var view = $('karaoke-view');
    if (view) view.hidden = true;
    opened = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (audio) audio.pause();
    if (scoring) disarmScoring(false);
    var host = $('karaoke-score');
    if (host) { host.hidden = true; host.innerHTML = ''; }
    lastLineIdx = -1;
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    audio = $('karaoke-audio');
    if (!audio) return;
    try { audio.preservesPitch = true; } catch (e) {}
    try { audio.mozPreservesPitch = true; } catch (e) {}
    try { audio.webkitPreservesPitch = true; } catch (e) {}

    var openBtn = $('karaoke-open-btn');
    if (openBtn) openBtn.addEventListener('click', function () { open(); });
    var readerBtn = $('jing-karaoke-btn');
    if (readerBtn) readerBtn.addEventListener('click', function () { open(); });
    var backBtn = $('karaoke-back');
    if (backBtn) backBtn.addEventListener('click', function () { close(); });

    document.querySelectorAll('#karaoke-seg-row .karaoke-seg').forEach(function (b) {
      b.addEventListener('click', function () {
        var wasPlaying = audio && !audio.paused;
        setSeg(b.getAttribute('data-seg'), { autoplay: wasPlaying });
      });
    });

    var playBtn = $('karaoke-play');
    if (playBtn) playBtn.addEventListener('click', function () {
      if (!audio) return;
      if (audio.paused) audio.play().catch(function () {});
      else audio.pause();
    });
    var spd = $('karaoke-speed');
    if (spd) spd.addEventListener('change', function () {
      audio.playbackRate = parseFloat(spd.value) || 1;
    });
    var loopBtn = $('karaoke-loop');
    if (loopBtn) loopBtn.addEventListener('click', function () {
      loopOne = !loopOne;
      loopBtn.textContent = loopOne ? t('karaoke_loop_on') : t('karaoke_loop');
      loopBtn.classList.toggle('active', loopOne);
    });
    var scoreBtn = $('karaoke-score-btn');
    if (scoreBtn) scoreBtn.addEventListener('click', function () {
      if (scoring) disarmScoring(true);
      else armScoring();
    });

    audio.addEventListener('play', function () { setPlayingUI(true); });
    audio.addEventListener('pause', function () { setPlayingUI(false); });
    audio.addEventListener('ended', function () {
      setPlayingUI(false);
      if (seg === 'all') {
        var idx = SEG_ORDER.indexOf(curFile);
        if (idx >= 0 && idx < SEG_ORDER.length - 1) {
          loadFile(SEG_ORDER[idx + 1], true);
          return;
        }
      }
      /* 本段（或全部）唱完：若在打分，出分 */
      if (scoring) disarmScoring(true);
    });
    audio.addEventListener('loadedmetadata', function () { updateTime(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
  window.__wuriKaraoke = { open: open, close: close, loadData: loadData,
    /* 供冒烟测试的纯函数／入口（生产不调用） */
    _test: { detectPitch: detectPitch, median: median, showScore: showScore, scoreLines: scoreLines } };
})();
