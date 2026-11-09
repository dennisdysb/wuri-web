/* 跟唱播放器（2026-11-06 跟唱样板 v1 · 用户亲令上网页版）
 * 第二档：逐句真实时间轴＋句内逐字匀速推进、已唱字变金色；
 * 变速 0.5×/0.75×/1×；点句跳转＋单句循环；播放自动滚动。
 * 打分 v1：录用户音（getUserMedia），与青玄原唱逐句比对——
 *   完成度（该句时段内有声占比）＋节奏（有声重心与句中点贴合度）为主、
 *   音高（中位基频与原唱参考音高之差，八度折叠、±100 音分满分）为辅；
 *   唱诵拖腔多、音高比流行歌松，分数宽容。音高参考来自 timeline.json 的
 *   ref_pitch_hz（voiced_frac < 0.5 的句不计音高，只计完成度＋节奏）。
 * 数据：content/karaoke/base_text.json（底本，唱词＋注音）＋
 *       content/karaoke/timeline.json（逐句时间轴＋参考音高，147 条）。
 * 音频：audio/karaoke/seg1|2|3.m4a（三段青玄录音）。
 * 旋律引导（v594）：content/karaoke/melody.json（懒加载，缺失不影响播放）提供
 *   参考音高曲线——音高线 strip（30s 窗口＋播放头）可视化保留。
 *   正弦提示音（v594–v596）已于 v597 删除（用户定：效果不好）；只听提示音
 *   三态（v596）一并移除；旋律音高线不受影响。
 * 颜色一律走 CSS 变量链（--gold 已唱字、--teal 好分、--cinnabar 差分），
 *   日间／夜间／红光三态由变量覆写自动适配，不得写死色值。
 * 录音＋分享＋打分特效（v599）：录音入口为右侧悬浮钮（磬钮上方垂直叠放，
 *   用户 2026-11-09 15:24 定；左边不放，会盖歌词），顶栏四钮不动；录音只存
 *   本机 IndexedDB（无 IDB 时退内存），不上传；成绩卡 canvas 现绘后走
 *   navigator.share／下载回落。打分特效用虚构小仙童原创卡通 SVG（不用真
 *   神仙像，用户 2026-11-09 定：不敬），四档同童、袍色＋光效区分；各档
 *   动作不同（90+ 跳起来鼓掌＋花瓣、75+ 胸前正常鼓掌、60+ 挥拳头加油、
 *   <60 攥紧小拳头打气），SVG/CSS 动图；最终以小样返工后的做法为准核对，
 *   特效不算定稿。
 *   透明度分层（2026-11-09 用户定）：人物 opacity 1 实色，半透明 50%
 *   只是背景纱层，绝不给整个 overlay 统一 0.5 opacity。
 *   打分公式与档位切分（90/75/60）冻结，不得改动。
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
  /* 悬浮时间框用：mm:ss.d（1 位小数），与主显原始秒数并列 */
  function fmt1(sec) {
    sec = Math.max(0, sec || 0);
    var m = Math.floor(sec / 60), s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  /* ---------- 常量 ---------- */
  var BASE_TEXT_URL = 'content/karaoke/base_text.json';
  var TIMELINE_URL = 'content/karaoke/timeline.json';
  var MELODY_URL = 'content/karaoke/melody.json';
  var MELODY_FMIN = 110, MELODY_FMAX = 310; /* 音高线显示窗 Hz（对数轴；实测旋律约 116–305 Hz） */
  var MELODY_WIN_BEFORE = 8, MELODY_WIN_AFTER = 22; /* 音高线窗口：当前时刻前 8s＋后 22s */
  var AUDIO_URL = { seg1: 'audio/karaoke/seg1.m4a', seg2: 'audio/karaoke/seg2.m4a', seg3: 'audio/karaoke/seg3.m4a' };
  var SEG_ORDER = ['seg1', 'seg2', 'seg3'];
  /* （罄）显示位置 = 该位置前的字数（按底本 note 的显式表述，与 build_s06.py 一致；
     qing 数值数组在三处天尊句与 note 不符，以 note 为准） */
  var QING_POS = {
    'chengqing|3': [4], 'ju_tianzun|1': [1], 'diaogua|6': [7],
    'xiang_gongyang|0': [5], 'xiao_qiqing|3': [3], 'xiao_qiqing|4': [4, 6],
    'jingxin|0': [2], 'jingshen|0': [3]
  };
  var RMS_VOICED = 0.012;   /* 麦克风有声阈值（RMS） */
  var PITCH_MIN = 80, PITCH_MAX = 400; /* 人声基频搜索范围 Hz */
  /* ---------- 敲磬（v583：改与读经器同款） ----------
   * 音源改用读经器 qing.mp3（v581 的 bell-interval.mp3 用户真机反馈听着像敲钵，不用）；
   * 与读经器同一 URL（无 ?v），离线口径与读经器一致（运行期缓存，sw.js 预缓存未单列）。
   * QING_AUTO 预留自动敲开关：默认 false（手动 only，等用户定），本版不接线。 */
  var QING_URL = 'audio/qing.mp3';
  var QING_VOL = 0.6;            /* 磬固定音量（不跟冥想滑杆联动） */
  var QING_THROTTLE_MS = 500;    /* 防连点：500ms 内重复点按忽略 */
  var QING_NEAR_BEFORE = 2.0;    /* 临近提示窗：磬点前 2.0s 起亮 */
  var QING_NEAR_AFTER = 1.0;     /* 临近提示窗：磬点后 1.0s 熄灭 */
  var QING_SCORE_EXCL_S = 1.5;   /* 打分：敲击后 1.5s 内麦克风样本剔除 */
  var QING_AUTO = false;         /* 未定项：自动敲磬，用户未定前恒 false */

  /* ---------- 状态 ---------- */
  var data = null;          /* {base, timeline, items:[147], sections:[{id,name,sing,items[]}]} */
  var seg = 'all';          /* 'all' | 'seg1' | 'seg2' | 'seg3' */
  var curFile = 'seg1';
  var loopOne = false;
  var scoring = false;      /* 打分是否已武装（正在采样） */
  var arming = false;       /* 打分授权进行中（getUserMedia 未决；C 线 §1.4 竞态 A） */
  var scoreShown = false;   /* 本次打分是否已出分（防重复出分纵深防御，§1.4） */
  var scoreElapsedMs = 0;   /* 本次计分累计时长（仅原唱播放时走；状态条计时用，§1.6） */
  var lastTickT = 0;        /* 上一帧 rAF 时间戳（计时累计用） */
  var noAutoScrollUntil = 0;/* 回顶后抑制歌词自动居中的截止时间戳（§2.5） */
  var topShown = false;     /* 回顶按钮当前是否已显示（scroll 监听去重写用） */
  var mic = null;           /* {stream, ctx, analyser, timer, samples:[{file,t,rms,f0}]} */
  var rafId = 0;
  var lastLineIdx = -1;
  var lastLineEl = null;
  var audio = null;
  var qingAudio = null;    /* 磬独立 Audio 元素（与原唱 #karaoke-audio 分开） */
  var qingTimes = [];      /* 预计算磬点 [{file, t, n}]，t 为媒体时间 */
  var qingStrikes = [];    /* 本次手动敲击 [{file, t}]，供打分剔除 */
  var lastQingAt = 0;      /* 上次有效敲击的 Date.now()（节流用） */
  var opened = false;
  var loadPromise = null;
  /* ---------- 旋律引导状态（v594） ---------- */
  var melody = null;         /* 归一化后 {version, segments:{seg1|2|3:{frames:[{t,f0_hz,note,voiced}],duration_s}}} */
  var melodyPromise = null;  /* 懒加载缓存；失败也缓存为 null，不阻塞播放器 */
  var melodyFailed = false;
  var lastMelodyNote = '';   /* 音高线当前音名（DOM 写去重用） */
  /* 提示音已删（用户 2026-11-09 定：效果不好）。正弦振荡器／三态循环／
   * 只听提示音全部移除；旋律音高线（melody.json 可视化）保留，不受影响。 */
  var headphonesToastTimer = null; /* 打分耳机提示 toast 的 3s 自消失定时器 */
  /* ---------- 录音（v599）状态 ----------
   * recMode 持久化 localStorage；rec 为当前进行中的一次录音；
   * chantSrcNode／recCtx／recDest 为合唱混音图（原唱元素一生只建一次
   *   MediaElementSource，见 duetDest 守卫）。 */
  var REC_DB_NAME = 'wuri-karaoke-recs';
  var REC_DB_STORE = 'recs';
  var REC_MODE_KEY = 'wuri_karaoke_rec_mode_v1';
  var REC_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];
  var recMode = 'solo'; /* 'solo' 独唱 | 'duet' 合唱 */
  var rec = null; /* {stream, recorder, chunks, mime, startedAt, mode, timerId, bgInterrupted, micSrc, micGain} */
  var recList = []; /* [{id, name, mode, mime, createdAt, durMs, bgInterrupted, blob, url}] */
  var recDbPromise = null;
  var chantSrcNode = null, recCtx = null, recDest = null, chantGain = null;
  var recPlayEl = null; /* 当前试听的 <audio>（切歌／删项时停掉） */
  try { var _rm = localStorage.getItem(REC_MODE_KEY); if (_rm === 'duet' || _rm === 'solo') recMode = _rm; } catch (e) {}

  /* 打分 UI 四处状态的唯一同步点（打分按钮文案/class、悬浮状态条、麦克风提示）。
   * 调用点只有 arm .then/.catch、disarmScoring、open/close——不散落手写（C 线 §1.4）。 */
  function updateScoringUI() {
    var btn = $('karaoke-score-btn');
    if (btn) {
      var on = scoring || arming;
      btn.textContent = on ? t('karaoke_scoring') : t('karaoke_score');
      btn.classList.toggle('active', !!scoring);
    }
    var pill = $('karaoke-score-float');
    if (pill) pill.hidden = !(scoring || arming);
    var hint = $('karaoke-mic-hint');
    if (hint) hint.hidden = !(scoring || arming);
    updateScoreTime();
    /* 四钮等宽，文案 打分↔打分中… 同宽不跳动；行高不变时 layoutSticky()
     * 仍重算一次（窄屏 ≤344px 换行档行高会变），开销可忽略。 */
    layoutSticky();
  }
  function updateScoreTime() {
    var tm = $('karaoke-score-time');
    if (tm) tm.textContent = fmt(scoreElapsedMs / 1000);
  }
  /* 吸顶偏移实测：头栏高度随宽度折行（320px 约 94px，360px 约 74px），
   * 写死 px 会在窄屏上把控制条顶进头栏。open() 与 resize 时重算（C 线 §1.6/§4）。 */
  function layoutSticky() {
    var view = $('karaoke-view');
    if (!view) return;
    var head = view.querySelector('.karaoke-head');
    var ctl = view.querySelector('.karaoke-controls');
    var seek = view.querySelector('.karaoke-seek-row');
    var mel = $('karaoke-melody');
    var pill = $('karaoke-score-float');
    var headH = head ? head.offsetHeight : 74;
    if (ctl) ctl.style.top = headH + 'px';
    var seekH = 0;
    if (seek) {
      seek.style.top = (headH + (ctl ? ctl.offsetHeight : 0)) + 'px';
      seekH = seek.offsetHeight;
    }
    /* v595：音高线吸顶，贴在快进退行正下方（top＝头栏＋控制条＋快进退行）；
     * hidden 时 offsetHeight 为 0，melH 计 0，打分状态条 top 退回 v594 口径。 */
    var melH = 0;
    if (mel) {
      mel.style.top = (headH + (ctl ? ctl.offsetHeight : 0) + seekH) + 'px';
      melH = mel.hidden ? 0 : mel.offsetHeight;
    }
    if (ctl && pill) pill.style.top = (headH + ctl.offsetHeight + seekH + melH) + 'px';
  }

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
          voiced_frac: tlLine.voiced_frac, align: tlLine.align || '',
          char_t0: (tlLine.char_t0 && tlLine.char_t0.length === b.line.text.length) ? tlLine.char_t0.slice() : null,
        });
      });
      /* 按底本段序分组；不唱的两段（提纲）以灰化分隔行呈现 */
      var sections = [];
      base.sections.forEach(function (s) {
        var its = items.filter(function (it) { return it.section === s.id; });
        sections.push({ id: s.id, name: s.name, sing: s.sing !== false, items: its });
      });
      data = { base: base, timeline: tl, items: items, sections: sections };
      buildQingTimes();
      return data;
    });
    return loadPromise;
  }

  /* 由 QING_POS＋时间轴派生磬点时刻：句内匀速插值（与 paintLine 同假设，
   * 估计值 ±1s，只用于临近提示窗，不得用作自动敲触发——见 B 线 §1.1/§1.4）。 */
  function buildQingTimes() {
    qingTimes = [];
    if (!data) return;
    data.items.forEach(function (it) {
      var pos = QING_POS[it.section + '|' + it.line_idx] || [];
      var len = (it.text || '').length;
      if (!len) return;
      pos.forEach(function (p) {
        var frac = Math.min(1, Math.max(0, p / len));
        qingTimes.push({ file: it.audio, t: it.t0 + frac * (it.t1 - it.t0), n: it.n });
      });
    });
    qingTimes.sort(function (a, b) { return a.t - b.t; });
  }

  /* ---------- 旋律引导（v594） ----------
   * melody.json 懒加载（首次 open 时 fetch，缓存；404／损坏时 resolve null，
   * 音高线保持 hidden、提示音钮点按无操作，播放器其余功能照常）。
   * 接受两种形态：① 任务 schema {version, segments:{seg:{frames:[{t,f0_hz,note,voiced}]}}}
   * ② 样本形态 {frames:[...]}（整段平铺，作 seg1）。帧时间均为段内时间，与
   * timeline.json／音频同一时间基。 */
  function normalizeSeg(s) {
    var frames = (Array.isArray(s.frames) ? s.frames : []).map(function (f) {
      return { t: (+f.t || 0), f0_hz: (f.f0_hz == null ? null : +f.f0_hz), note: f.note || null, voiced: !!f.voiced };
    }).sort(function (a, b) { return a.t - b.t; });
    var dur = s.duration_s ? (+s.duration_s) : (frames.length ? frames[frames.length - 1].t : 0);
    return { audio: s.audio || null, duration_s: dur, frames: frames, breaks: s.breaks || [] };
  }
  function normalizeMelody(json) {
    if (!json || typeof json !== 'object') return null;
    var segs = {};
    if (json.segments && typeof json.segments === 'object') {
      Object.keys(json.segments).forEach(function (id) { segs[id] = normalizeSeg(json.segments[id] || {}); });
    } else if (Array.isArray(json.frames)) {
      segs.seg1 = normalizeSeg(json); /* 样本形态：整段平铺 frames（86fps，seg1） */
    }
    var ids = Object.keys(segs).filter(function (id) { return segs[id] && segs[id].frames.length; });
    if (!ids.length) return null;
    var out = { version: json.version || 1, segments: {} };
    ids.forEach(function (id) { out.segments[id] = segs[id]; });
    return out;
  }
  function loadMelody(url) {
    if (!url && melodyPromise) return melodyPromise;
    var u = url || MELODY_URL;
    var p = fetch(u).then(function (r) {
      if (!r.ok) throw new Error('melody ' + r.status);
      return r.json();
    }).then(function (json) {
      melody = normalizeMelody(json);
      melodyFailed = !melody;
      return melody;
    }).catch(function () {
      melody = null; melodyFailed = true;
      return null; /* 降级：无音高线、无提示音，其余照常 */
    });
    if (!url) melodyPromise = p;
    return p;
  }
  function melodySeg(file) {
    return (melody && melody.segments && melody.segments[file]) || null;
  }
  /* 帧间线性插值求当前基频；任一端点无声（f0_hz null＝停顿）即返回 null（提示音静默、
   * 音高线断笔）。段外时间返回 null。 */
  function melodyF0At(file, time) {
    var sg = melodySeg(file);
    if (!sg || !sg.frames.length) return null;
    var fr = sg.frames, lo = 0, hi = fr.length - 1;
    if (time < fr[0].t || time > fr[fr.length - 1].t) return null;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (fr[mid].t <= time) lo = mid; else hi = mid - 1; }
    var a = fr[lo], b = fr[lo + 1];
    if (!b) return a.f0_hz;
    if (!a.f0_hz || !b.f0_hz) return null;
    if (b.t <= a.t) return a.f0_hz;
    var k = (time - a.t) / (b.t - a.t);
    return a.f0_hz + k * (b.f0_hz - a.f0_hz);
  }
  /* 当前时刻最近的有声音符名（±0.15s 内），无则 null（显示 —）。 */
  function melodyNoteAt(file, time) {
    var sg = melodySeg(file);
    if (!sg || !sg.frames.length) return null;
    var fr = sg.frames, lo = 0, hi = fr.length - 1;
    if (time < fr[0].t || time > fr[fr.length - 1].t) return null;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (fr[mid].t <= time) lo = mid; else hi = mid - 1; }
    var best = null, bestDt = 0.15;
    [fr[lo], fr[lo + 1]].forEach(function (f) {
      if (!f || !f.f0_hz || !f.note) return;
      var dt = Math.abs(f.t - time);
      if (dt <= bestDt) { bestDt = dt; best = f.note; }
    });
    return best;
  }
  /* 音高线窗口：[time-8s, time+22s]，两端夹在 [0, duration] 内（段首段尾窗口收窄，
   * 播放头随之移位，恒在窗内）。 */
  function melodyWindow(file, time) {
    var sg = melodySeg(file);
    var dur = (sg && sg.duration_s) || (audio && audio.duration) || 0;
    var w0 = time - MELODY_WIN_BEFORE, w1 = time + MELODY_WIN_AFTER;
    if (w0 < 0) { w1 -= w0; w0 = 0; }
    if (dur > 0 && w1 > dur) { w0 -= (w1 - dur); w1 = dur; if (w0 < 0) w0 = 0; }
    return { w0: w0, w1: w1, dur: dur };
  }
  /* 读 CSS 变量画 canvas：getComputedStyle 解析 --gold/--cinnabar/--line-soft，
   * 日/夜/红光三态自动跟随；变量读不到（无头环境）才用宣纸日间值回落。 */
  function melodyCssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      if (v && v.trim()) return v.trim();
    } catch (e) {}
    return fallback;
  }
  function updateMelodyNote(time) {
    var noteEl = $('karaoke-melody-note');
    if (!noteEl) return;
    var note = melodyNoteAt(curFile, time) || '—';
    if (note !== lastMelodyNote) { lastMelodyNote = note; noteEl.textContent = note; }
  }
  function drawMelody(time) {
    var strip = $('karaoke-melody');
    var canvas = $('karaoke-melody-canvas');
    if (!strip || !canvas) return;
    if (strip.hidden) return;
    var sg = melodySeg(curFile);
    updateMelodyNote(time);
    if (!sg || !sg.frames.length) return;
    var ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (e) {}
    if (!ctx) return; /* 无 2d 上下文（旧 WebView）时只更新音名，不抛错 */
    var cssW = canvas.clientWidth || canvas.width || 300;
    var cssH = canvas.clientHeight || canvas.height || 64;
    var dpr = window.devicePixelRatio || 1;
    var Wpx = Math.max(1, Math.round(cssW * dpr)), Hpx = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== Wpx || canvas.height !== Hpx) { canvas.width = Wpx; canvas.height = Hpx; }
    var win = melodyWindow(curFile, time);
    var span = Math.max(0.001, win.w1 - win.w0);
    var logSpan = Math.log(MELODY_FMAX / MELODY_FMIN);
    function X(t) { return (t - win.w0) / span * Wpx; }
    function Y(f) {
      var l = Math.log(Math.max(MELODY_FMIN, Math.min(MELODY_FMAX, f)) / MELODY_FMIN) / logSpan;
      return Hpx - (0.08 + 0.84 * l) * Hpx;
    }
    ctx.clearRect(0, 0, Wpx, Hpx);
    /* 网格线：110 / 188（中位）/ 310 Hz */
    ctx.strokeStyle = melodyCssVar('--line-soft', '#EFE9D4');
    ctx.lineWidth = 1;
    [110, 188, 310].forEach(function (f) {
      ctx.beginPath(); ctx.moveTo(0, Y(f)); ctx.lineTo(Wpx, Y(f)); ctx.stroke();
    });
    /* 曲线：窗内帧降采样到约 600 点；f0 null 处断笔（停顿不断线成假音高） */
    var frames = sg.frames;
    var stride = Math.max(1, Math.floor(frames.length / 600));
    ctx.strokeStyle = melodyCssVar('--gold', '#A2813B');
    ctx.lineWidth = Math.max(1, 2 * dpr);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var pen = false, i, fr;
    for (i = 0; i < frames.length; i += stride) {
      fr = frames[i];
      if (fr.t < win.w0 || fr.t > win.w1 || !fr.f0_hz) { pen = false; continue; }
      if (!pen) { ctx.moveTo(X(fr.t), Y(fr.f0_hz)); pen = true; }
      else ctx.lineTo(X(fr.t), Y(fr.f0_hz));
    }
    ctx.stroke();
    /* 播放头：当前时刻竖线 */
    var px = X(time);
    ctx.strokeStyle = melodyCssVar('--cinnabar', '#B23A2B');
    ctx.lineWidth = Math.max(1, 2 * dpr);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, Hpx); ctx.stroke();
  }

  /* 提示音已删（用户 2026-11-09 定：效果不好）——正弦振荡器、
   * 三态循环、只听提示音（原唱静音）整段移除；旋律音高线可视化保留。 */

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
    drawMelody(0); /* 切段即换曲线段（tick 下一帧也会跟上） */
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
          /* 回顶点按后 900ms 内不自动居中，否则平滑回顶会被半路拉回（C 线 §2.5） */
          if (Date.now() >= noAutoScrollUntil) scrollToEl(lastLineEl, { block: 'center' });
        }
      }
    }
    if (itemIdx < 0 || !data || !lastLineEl) return;
    var it = data.items[itemIdx];
    var dur = Math.max(0.001, it.t1 - it.t0);
    var sung;
    if (it.char_t0) {
      /* 逐字实测：已过起音的字变金（含当前字） */
      sung = 0;
      for (var k = 0; k < it.char_t0.length; k++) {
        if (time >= it.char_t0[k]) sung = k + 1; else break;
      }
    } else {
      /* 回退：匀速，但用 ceil 修掉 floor 差一（当前字立即变金） */
      var frac = Math.min(1, Math.max(0, (time - it.t0) / dur));
      sung = Math.min(it.text.length, Math.floor(frac * it.text.length) + 1);
      if (time <= it.t0) sung = 0;   /* 行首未起音时不提前变金 */
    }
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
    updateTimebox(c); /* 悬浮时间框随同一 tick 更新（播放中／暂停都跟） */
  }

  /* ---------- 跟唱测试用悬浮时间框（v586：测试阶段临时工具，耳核完成后可删） ----------
   * 主显原始秒数（1 位小数，如 115.3s），旁附 mm:ss.d（如 1:55.3）。
   * 拖动＋持久化照抄读经器 #qing-btn 的 __wuriMakeDraggable 模式（8px 阈值判拖动、
   * 松手存 localStorage、视口钳制），自用键 wuri_karaoke_timebox_v1，恒可拖
   * （测试工具，不设 fabs-ghost 门）；元素放在 #karaoke-view 之外（见 index.html），
   * 显隐由 open()/close() 的 .show 管理。 */
  var TIMEBOX_KEY = 'wuri_karaoke_timebox_v1';
  function updateTimebox(time) {
    var sec = $('karaoke-timebox-sec'), mmss = $('karaoke-timebox-mmss');
    if (!sec && !mmss) return;
    var t = Math.max(0, time || 0);
    if (sec) sec.textContent = t.toFixed(1) + 's';
    if (mmss) mmss.textContent = fmt1(t);
  }
  function applyTimeboxPos() {
    var box = $('karaoke-timebox');
    if (!box) return;
    try {
      var pos = JSON.parse(localStorage.getItem(TIMEBOX_KEY) || 'null');
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        var w = box.offsetWidth || 110, h = box.offsetHeight || 56;
        box.style.left = Math.max(4, Math.min(pos.x, window.innerWidth - w - 4)) + 'px';
        box.style.top = Math.max(4, Math.min(pos.y, window.innerHeight - h - 4)) + 'px';
        box.style.right = 'auto';
      }
    } catch (e) {}
  }
  function bindTimeboxDrag() {
    var box = $('karaoke-timebox');
    if (!box || box.__wuriTimeboxDrag) return;
    box.__wuriTimeboxDrag = true;
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false, pid = null;
    function onMove(e) {
      if (!dragging || e.pointerId !== pid) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.sqrt(dx * dx + dy * dy) < 8) return;
      moved = true;
      if (e.cancelable) e.preventDefault();
      var w = box.offsetWidth || 110, h = box.offsetHeight || 56;
      var nx = Math.max(4, Math.min(ox + dx, window.innerWidth - w - 4));
      var ny = Math.max(4, Math.min(oy + dy, window.innerHeight - h - 4));
      box.style.left = nx + 'px'; box.style.top = ny + 'px';
      box.style.right = 'auto';
    }
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      if (moved) {
        var r = box.getBoundingClientRect();
        try { localStorage.setItem(TIMEBOX_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (e) {}
        var swallow = function (ev) { ev.stopImmediatePropagation(); ev.preventDefault(); };
        box.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(function () { box.removeEventListener('click', swallow, { capture: true }); }, 350);
      }
      moved = false;
    }
    box.addEventListener('pointerdown', function (e) {
      pid = e.pointerId; dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      var r = box.getBoundingClientRect(); ox = r.left; oy = r.top;
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    });
  }
  function jumpToLine(n, autoplay) {
    if (!data || n < 0 || n >= data.items.length) return;
    var it = data.items[n];
    if (it.audio !== curFile) loadFile(it.audio, false);
    audio.currentTime = Math.max(0, it.t0 + 0.01);
    if (autoplay) audio.play().catch(function () {});
    paintLine(n, audio.currentTime);
  }
  /* ---------- 单句循环（v585：抽成 setLoop，供快进/退调用取消） ---------- */
  function setLoop(on) {
    loopOne = !!on;
    var loopBtn = $('karaoke-loop');
    if (loopBtn) {
      loopBtn.textContent = loopOne ? t('karaoke_loop_on') : t('karaoke_loop');
      loopBtn.classList.toggle('active', loopOne);
    }
  }
  /* ---------- 快进/快退（v585：±5s/±10s） ----------
   * 点一下把 currentTime 加/减 5 或 10 秒，夹在 [0, duration] 内；
   * duration 未知（metadata 未到）时只夹下限，不夹上限。
   * 播放中和暂停时都能用；点完立即按新位置重绘（tick 下一帧也会跟上，
   * 往后退时行索引经 findLine 正确回退）。
   * 若单句循环开着，取消它（避免循环目标与新位置打架）。
   * 打分进行中：麦克风采样按 audio.currentTime 键控，从新位置继续采，无须改动。 */
  function seekBy(seconds) {
    if (!audio) return;
    var nt = (audio.currentTime || 0) + seconds;
    if (nt < 0) nt = 0;
    var d = audio.duration;
    if (isFinite(d) && d > 0 && nt > d) nt = d;
    audio.currentTime = nt;
    if (loopOne) setLoop(false);
    if (data) {
      paintLine(findLine(curFile, nt), nt);
      updateQingNear(nt);
    }
    updateTime();
    drawMelody(nt); /* 快进/退后音高线立即重同步到新位置 */
  }
  /* ---------- 敲磬 ---------- */
  function strikeQing() {
    var now = Date.now();
    if (now - lastQingAt < QING_THROTTLE_MS) return; /* 500ms 内连点忽略 */
    lastQingAt = now;
    if (!qingAudio) {
      try { qingAudio = new Audio(QING_URL); } catch (e) { return; }
      try { qingAudio.volume = QING_VOL; } catch (e2) {}
    }
    try { qingAudio.currentTime = 0; } catch (e) {}
    var p = qingAudio.play();
    if (p && p.catch) p.catch(function () {});
    /* 记一笔供打分剔除（媒体时间坐标，与 mic 样本的 s.t 同坐标） */
    if (audio) qingStrikes.push({ file: curFile, t: audio.currentTime || 0 });
    var btn = $('karaoke-qing-fab');
    if (btn) {
      btn.classList.add('qing-hit');
      setTimeout(function () { btn.classList.remove('qing-hit'); }, 300);
    }
  }
  function updateQingNear(time) {
    var btn = $('karaoke-qing-fab');
    if (!btn) return;
    var near = null, i, q;
    for (i = 0; i < qingTimes.length; i++) {
      q = qingTimes[i];
      if (q.file !== curFile) continue;
      if (time >= q.t - QING_NEAR_BEFORE && time <= q.t + QING_NEAR_AFTER) { near = q; break; }
      if (q.t - QING_NEAR_BEFORE > time) break; /* 已按 t 排序，后面只会更远 */
    }
    btn.classList.toggle('qing-near', !!near);
    /* 正文（罄）标记同步加亮：取最近磬点所在句的标记 */
    var host = $('karaoke-lyrics');
    if (host) {
      host.querySelectorAll('.karaoke-qing.qing-near').forEach(function (el) {
        el.classList.remove('qing-near');
      });
      if (near) {
        var lineEl = elForItem(near.n);
        if (lineEl) {
          var mark = lineEl.querySelector('.karaoke-qing');
          if (mark) mark.classList.add('qing-near');
        }
      }
    }
  }

  function setPlayingUI(playing) {
    var btn = $('karaoke-play');
    if (btn) btn.textContent = playing ? t('karaoke_pause') : t('karaoke_play');
  }

  /* ---------- 逐帧循环 ---------- */
  function tick(ts) {
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
    /* 计分计时：只在原唱播放时累计（与麦克风采样口径一致）；秒变才写 DOM */
    if (typeof ts === 'number') {
      if ((scoring || arming) && audio && !audio.paused && lastTickT) {
        var before = Math.floor(scoreElapsedMs / 1000);
        scoreElapsedMs += Math.max(0, ts - lastTickT);
        if (Math.floor(scoreElapsedMs / 1000) !== before) updateScoreTime();
      }
      lastTickT = ts;
    }
    var idx = findLine(curFile, time);
    paintLine(idx, time);
    updateQingNear(time);
    updateTime();
    drawMelody(time); /* 音高线窗口＋播放头跟随播放（同一 rAF 循环） */
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

  /* ---------- 打分耳机提示 toast ----------
   * 打分真正开始（麦克风授权成功、scoring 置位）时弹一次「戴上耳机效果更好」，
   * 3s 后自消失；提前停分／重武装时清掉旧定时器（重武装则重新计时 3s）。
   * toast 为 position:fixed＋pointer-events:none，不挡控制条、不拦截点按。 */
  function showHeadphonesToast() {
    var el = $('karaoke-headphones-toast');
    if (!el) return;
    el.hidden = false;
    if (headphonesToastTimer) clearTimeout(headphonesToastTimer);
    headphonesToastTimer = setTimeout(function () { hideHeadphonesToast(); }, 3000);
  }
  function hideHeadphonesToast() {
    if (headphonesToastTimer) { clearTimeout(headphonesToastTimer); headphonesToastTimer = null; }
    var el = $('karaoke-headphones-toast');
    if (el) el.hidden = true;
  }

  /* ---------- 打分 ---------- */
  function armScoring() {
    if (scoring || arming) return; /* 授权未决时再点是 no-op（C 线 §1.4 竞态 A） */
    arming = true;
    scoreShown = false;
    scoreElapsedMs = 0;
    lastTickT = 0;
    updateScoringUI();
    startMic().then(function () {
      if (!arming) { stopMic(); return; } /* 授权期间用户已点停：刚拿到的麦立即释放 */
      arming = false;
      scoring = true;
      updateScoringUI();
      showHeadphonesToast(); /* 打分开始时提示戴耳机（3s 自消失） */
      if (audio && audio.paused) audio.play().catch(function () {});
    }).catch(function () {
      if (!arming) return; /* 已停就不弹授权失败（用户主动停的） */
      arming = false;
      scoring = false;
      updateScoringUI();
      alert(t('karaoke_mic_denied'));
    });
  }
  function disarmScoring(show) {
    if (!scoring && !arming) return; /* 幂等：第二路调用（ended/重复点按）是 no-op（§1.4 竞态 B） */
    /* 先置位、再停麦、再出分——guard 在 showScore 之前生效 */
    scoring = false;
    arming = false;
    hideHeadphonesToast(); /* 停分即收掉耳机提示（不等 3s 自然消失） */
    updateScoringUI();
    var samples = mic ? mic.samples.slice() : [];
    stopMic();
    if (show && !scoreShown) { scoreShown = true; showScore(samples); }
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
      /* 敲磬剔除：磬声会进麦克风抬完成度、污染音高——敲击后 1.5s 内样本不计分
       *（分母同步缩小，不按静音计）。见 B 线 §1.5。 */
      if (qingStrikes.length) {
        win = win.filter(function (s) {
          for (var i = 0; i < qingStrikes.length; i++) {
            var q = qingStrikes[i];
            if (q.file === s.file && s.t >= q.t && s.t <= q.t + QING_SCORE_EXCL_S) return false;
          }
          return true;
        });
      }
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
      /* v599：单句 90+ 行加小金光标记（✦＋金字），轻量、不改分 */
      var great = s >= 90;
      html += '<div class="karaoke-score-row' + (great ? ' karaoke-score-row-great' : '') + '"><span class="karaoke-score-text">' +
        (great ? '<span class="karaoke-score-spark">✦</span>' : '') +
        esc(r.item.text) + '</span><span class="karaoke-score-val ' + lc + '">' + s +
        '</span><span class="karaoke-score-fb">' + esc(feedbackOf(r)) + '</span></div>';
    });
    html += '</div><div class="karaoke-score-actions"><button class="btn small" id="karaoke-retry">' + esc(t('karaoke_retry')) + '</button>' +
      '<button class="btn small" id="karaoke-share-card">' + esc(t('karaoke_share_card')) + '</button></div></div>';
    host.innerHTML = html;
    scrollToEl(host, { block: 'start' });
    var rb = $('karaoke-retry');
    if (rb) rb.addEventListener('click', function () {
      host.hidden = true; host.innerHTML = '';
      if (audio) { audio.currentTime = 0; }
      armScoring();
    });
    var sb = $('karaoke-share-card');
    if (sb) sb.addEventListener('click', function () { shareScoreCard(total100); });
    showCelebration(total100); /* v599：小仙童打分特效（约 4s 自消，点按提前消散） */
  }

  /* ---------- 录音（v599） ----------
   * 入口：右侧悬浮钮 #karaoke-rec-fab（磬钮上方垂直叠放；左边不放，会盖歌词；
   *   用户 2026-11-09 15:24 定），顶栏四钮不动。点按开始／再点停止；停止后
   *   弹出录音面板（试听／下载／分享／删除）。
   * 模式：独唱＝只录麦克风；合唱＝原唱（MediaElementSource）＋麦克风混音
   *   → MediaStreamDestination → MediaRecorder。原唱元素一旦接
   *   createMediaElementSource 就永久走 AudioContext 路由（只建一次，见
   *   chantSrcNode 守卫），因此合唱首建后须在 audio 'play' 时 resume
   *   recCtx，否则后台切回后原唱可能静音。
   * 本地优先：录音存 IndexedDB（wuri-karaoke-recs），无 IDB 时退内存
   *   （仅本次会话）；不上传服务器。切后台时 MediaRecorder 在部分
   *   浏览器会暂停——只如实标记（bgInterrupted），不静默假装正常。
   * 格式：MediaRecorder.isTypeSupported 链——webm/opus（Android/Chrome）
   *   → mp4/aac（Safari/iOS）→ 默认；无 getUserMedia / 无 MediaRecorder
   *   时按钮点按只提示，不崩播放器。 */
  function recSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }
  function pickRecMime() {
    if (!window.MediaRecorder) return null;
    for (var i = 0; i < REC_MIMES.length; i++) {
      try {
        if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(REC_MIMES[i])) return REC_MIMES[i];
      } catch (e) {}
    }
    return ''; /* 默认编码（isTypeSupported 缺失的老实现也走这里） */
  }
  function recExt(mime) {
    if ((mime || '').indexOf('mp4') >= 0) return '.m4a';
    if ((mime || '').indexOf('ogg') >= 0) return '.ogg';
    return '.webm';
  }
  function fmtSize(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  /* ---------- 录音本地库（IndexedDB，可缺省退内存） ---------- */
  function openRecDb() {
    if (recDbPromise) return recDbPromise;
    recDbPromise = new Promise(function (resolve) {
      var idb = null;
      try { idb = window.indexedDB; } catch (e) {}
      if (!idb) { resolve(null); return; }
      var req;
      try { req = idb.open(REC_DB_NAME, 1); } catch (e) { resolve(null); return; }
      req.onupgradeneeded = function () {
        try { if (!req.result.objectStoreNames.contains(REC_DB_STORE)) req.result.createObjectStore(REC_DB_STORE, { keyPath: 'id' }); } catch (e2) {}
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
    return recDbPromise;
  }
  function recDbPut(item) {
    return openRecDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(REC_DB_STORE, 'readwrite');
          tx.objectStore(REC_DB_STORE).put({ id: item.id, name: item.name, mode: item.mode, mime: item.mime, createdAt: item.createdAt, durMs: item.durMs, bgInterrupted: !!item.bgInterrupted, blob: item.blob });
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }
  function recDbDel(id) {
    return openRecDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(REC_DB_STORE, 'readwrite');
          tx.objectStore(REC_DB_STORE).delete(id);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }
  function recDbAll() {
    return openRecDb().then(function (db) {
      if (!db) return [];
      return new Promise(function (resolve) {
        try {
          var out = [];
          var tx = db.transaction(REC_DB_STORE, 'readonly');
          var req = tx.objectStore(REC_DB_STORE).openCursor();
          req.onsuccess = function () { var c = req.result; if (!c) { resolve(out); return; } out.push(c.value); c.continue(); };
          req.onerror = function () { resolve(out); };
        } catch (e) { resolve([]); }
      });
    });
  }
  /* ---------- 录音控制 ---------- */
  function updateRecUI() {
    var fab = $('karaoke-rec-fab');
    if (fab) {
      fab.textContent = rec ? t('karaoke_rec_stop') : t('karaoke_rec');
      fab.classList.toggle('recording', !!rec);
      fab.setAttribute('aria-label', rec ? t('karaoke_rec_stop') : t('karaoke_rec'));
    }
    var tm = $('karaoke-rec-time');
    if (tm) tm.hidden = !rec;
    if (rec) updateRecTime();
    var status = $('karaoke-rec-status');
    if (status && rec && rec.bgInterrupted) { status.hidden = false; status.textContent = t('karaoke_rec_bg_warn'); }
    updateRecModeUI();
  }
  function updateRecTime() {
    var tm = $('karaoke-rec-time');
    if (tm && rec) tm.textContent = fmt((Date.now() - rec.startedAt) / 1000);
  }
  function updateRecModeUI() {
    document.querySelectorAll('.karaoke-rec-mode-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === recMode);
    });
  }
  function setRecMode(mode) {
    if (rec) return; /* 录制中不换模式 */
    recMode = (mode === 'duet') ? 'duet' : 'solo';
    try { localStorage.setItem(REC_MODE_KEY, recMode); } catch (e) {}
    updateRecModeUI();
  }
  function showRecPanel(scroll) {
    var p = $('karaoke-rec-panel');
    if (!p) return;
    p.hidden = false;
    if (scroll) scrollToEl(p, { block: 'start' });
  }
  /* 合唱混音图：原唱 MediaElementSource（每元素一生一次）＋麦克风源
   * → MediaStreamDestination。麦克风只进录音，不接扬声器（防啸叫／回声）。 */
  function duetDest(stream, cur) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!recCtx) recCtx = new AC();
      if (recCtx.state === 'suspended') recCtx.resume().catch(function () {});
      if (!chantSrcNode) {
        chantSrcNode = recCtx.createMediaElementSource(audio);
        chantGain = recCtx.createGain();
        chantGain.gain.value = 1;
        chantSrcNode.connect(chantGain);
        chantGain.connect(recCtx.destination);
        recDest = recCtx.createMediaStreamDestination();
        chantGain.connect(recDest);
      }
      var micSrc = recCtx.createMediaStreamSource(stream);
      var micGain = recCtx.createGain();
      micGain.gain.value = 1;
      micSrc.connect(micGain);
      micGain.connect(recDest);
      cur.micSrc = micSrc; cur.micGain = micGain;
      return recDest.stream;
    } catch (e) { return null; }
  }
  function startRecording() {
    if (rec) { stopRecording(); return; }
    if (!recSupported()) { alert(t('karaoke_rec_unavailable')); return; }
    var mode = recMode;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
      var mime = pickRecMime();
      var chunks = [];
      var cur = { stream: stream, chunks: chunks, mime: (mime == null ? '' : mime), startedAt: Date.now(), mode: mode, bgInterrupted: false, timerId: 0, micSrc: null, micGain: null };
      var recorder = null;
      try {
        if (mode === 'duet') {
          var dest = duetDest(stream, cur);
          if (!dest) throw new Error('no duet graph');
          recorder = mime ? new MediaRecorder(dest, { mimeType: mime }) : new MediaRecorder(dest);
        } else {
          recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        }
      } catch (e) {
        try { stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e2) {}
        alert(t('karaoke_rec_failed'));
        return;
      }
      cur.recorder = recorder;
      recorder.ondataavailable = function (ev) { if (ev && ev.data && ev.data.size) chunks.push(ev.data); };
      recorder.onstop = function () { finishRecording(cur); };
      try { recorder.start(500); } catch (e) {
        try { stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e2) {}
        alert(t('karaoke_rec_failed'));
        return;
      }
      rec = cur;
      cur.timerId = setInterval(updateRecTime, 250);
      showRecPanel(false);
      updateRecUI();
    }).catch(function () { alert(t('karaoke_rec_denied')); });
  }
  function stopRecording() {
    if (!rec) return;
    var cur = rec;
    rec = null;
    try { clearInterval(cur.timerId); } catch (e) {}
    try {
      if (cur.recorder && cur.recorder.state !== 'inactive') cur.recorder.stop();
      else finishRecording(cur);
    } catch (e) { finishRecording(cur); }
    /* 停麦克风轨道；合唱图里 micSrc 断开（原唱节点保留，供下次合唱复用） */
    try { if (cur.micSrc) cur.micSrc.disconnect(); } catch (e2) {}
    try { if (cur.micGain) cur.micGain.disconnect(); } catch (e3) {}
    try { cur.stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e4) {}
    updateRecUI();
  }
  function finishRecording(cur) {
    if (!cur || !cur.chunks) return;
    var blob = null;
    try { blob = new Blob(cur.chunks, { type: cur.mime || '' }); } catch (e) { return; }
    if (!blob || !blob.size) return; /* 空录音不入库 */
    var durMs = Date.now() - cur.startedAt;
    var d = new Date(cur.startedAt);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var name = t('karaoke_rec') + ' ' + (d.getMonth() + 1) + '-' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) +
      '（' + (cur.mode === 'duet' ? t('karaoke_rec_mode_duet') : t('karaoke_rec_mode_solo')) + '）';
    var item = { id: 'rec-' + cur.startedAt + '-' + Math.floor(Math.random() * 1000), name: name, mode: cur.mode, mime: cur.mime || blob.type || '', createdAt: cur.startedAt, durMs: durMs, bgInterrupted: !!cur.bgInterrupted, blob: blob, url: null };
    try { item.url = URL.createObjectURL(blob); } catch (e) {}
    recList.unshift(item);
    recDbPut(item); /* 失败也不阻塞：内存里仍可试听／下载／分享 */
    renderRecList();
    showRecPanel(true);
    var st = $('karaoke-rec-status');
    if (st) { st.hidden = false; st.textContent = t('karaoke_rec_saved'); }
  }
  /* ---------- 录音列表 ---------- */
  function findRec(id) { for (var i = 0; i < recList.length; i++) if (recList[i].id === id) return recList[i]; return null; }
  function renderRecList() {
    var host = $('karaoke-rec-list');
    if (!host) return;
    var empty = $('karaoke-rec-empty');
    if (empty) empty.hidden = recList.length > 0;
    var html = '';
    recList.forEach(function (it) {
      html += '<div class="karaoke-rec-item" data-id="' + esc(it.id) + '">' +
        '<div class="karaoke-rec-name">' + esc(it.name) + '</div>' +
        '<div class="karaoke-rec-meta">' + fmt(Math.round(it.durMs / 1000)) + ' · ' + fmtSize(it.blob ? it.blob.size : 0) +
        (it.bgInterrupted ? ' · <span class="karaoke-rec-warn">' + esc(t('karaoke_rec_bg_warn')) + '</span>' : '') + '</div>' +
        '<div class="karaoke-rec-actions">' +
        '<button class="mini-btn tiny" data-act="play" type="button">' + esc(t('karaoke_rec_play')) + '</button>' +
        '<button class="mini-btn tiny" data-act="download" type="button">' + esc(t('karaoke_rec_download')) + '</button>' +
        '<button class="mini-btn tiny" data-act="share" type="button">' + esc(t('karaoke_rec_share')) + '</button>' +
        '<button class="mini-btn tiny" data-act="delete" type="button">' + esc(t('karaoke_rec_delete')) + '</button>' +
        '</div></div>';
    });
    host.innerHTML = html;
    host.querySelectorAll('.karaoke-rec-item').forEach(function (row) {
      var id = row.getAttribute('data-id');
      row.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () { recItemAction(id, btn.getAttribute('data-act'), btn); });
      });
    });
  }
  function recAudioFor(it) {
    if (it._audio) return it._audio;
    if (!it.url) return null;
    try { var a = new Audio(it.url); it._audio = a; return a; } catch (e) { return null; }
  }
  function recItemAction(id, act, btn) {
    var it = findRec(id);
    if (!it) return;
    if (act === 'play') {
      var au = recAudioFor(it);
      if (!au) return;
      if (recPlayEl && recPlayEl !== au) { try { recPlayEl.pause(); } catch (e) {} }
      recPlayEl = au;
      if (au.paused) {
        var pp = au.play();
        if (pp && pp.catch) pp.catch(function () {});
        if (btn) btn.textContent = t('karaoke_rec_stop');
      } else {
        au.pause();
        if (btn) btn.textContent = t('karaoke_rec_play');
      }
      au.onended = function () { if (btn) btn.textContent = t('karaoke_rec_play'); };
    } else if (act === 'download') {
      downloadBlob(it.blob, it.name + recExt(it.mime));
    } else if (act === 'share') {
      shareFile(it.blob, it.name + recExt(it.mime)).then(function (how) {
        if (how === 'downloaded') { var st = $('karaoke-rec-status'); if (st) { st.hidden = false; st.textContent = t('karaoke_share_fallback'); } }
      });
    } else if (act === 'delete') {
      if (!window.confirm || !window.confirm(t('karaoke_rec_confirm_del'))) return;
      deleteRec(id);
    }
  }
  function deleteRec(id) {
    var it = findRec(id);
    if (it) {
      try { if (it._audio) it._audio.pause(); } catch (e) {}
      try { if (it.url) URL.revokeObjectURL(it.url); } catch (e2) {}
    }
    recList = recList.filter(function (x) { return x.id !== id; });
    recDbDel(id);
    renderRecList();
  }
  function loadRecList() {
    recDbAll().then(function (rows) {
      if (!rows || !rows.length) return;
      rows.sort(function (a, b) { return b.createdAt - a.createdAt; });
      rows.forEach(function (r) {
        if (!r.blob) return;
        var it = { id: r.id, name: r.name, mode: r.mode, mime: r.mime || '', createdAt: r.createdAt, durMs: r.durMs || 0, bgInterrupted: !!r.bgInterrupted, blob: r.blob, url: null };
        try { it.url = URL.createObjectURL(r.blob); } catch (e) {}
        recList.push(it);
      });
      renderRecList();
      showRecPanel(false);
    });
  }

  /* ---------- 分享（v599） ----------
   * 录音文件与成绩卡共用同一出口：navigator.share（files）优先——系统分享单
   * 在支持的浏览器（Android Chrome／iOS Safari 15+）走原生分享；否则回落
   * 下载。返回 'shared' / 'downloaded' / 'cancelled'，供调用方写状态行
   * （不弹 alert）。不上传服务器。 */
  function downloadBlob(blob, filename) {
    return new Promise(function (resolve) {
      var url = null;
      try { url = URL.createObjectURL(blob); } catch (e) {}
      if (!url) { resolve(false); return; }
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      try { document.body.appendChild(a); a.click(); a.remove(); } catch (e) {}
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e2) {} resolve(true); }, 1000);
    });
  }
  function canShareFiles(file) {
    try {
      return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (e) { return false; }
  }
  function shareFile(blob, filename) {
    var file = null;
    try { file = new File([blob], filename, { type: blob.type || '' }); } catch (e) {}
    if (file && canShareFiles(file)) {
      return navigator.share({ files: [file] }).then(function () { return 'shared'; }).catch(function (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        return downloadBlob(blob, filename).then(function () { return 'downloaded'; });
      });
    }
    return downloadBlob(blob, filename).then(function () { return 'downloaded'; });
  }
  /* 成绩卡：canvas 现绘——标题＋总分＋档位＋小仙童贺词＋日期＋落款；颜色
   * 读 CSS 变量（melodyCssVar），日/夜/红光三态跟随。画布 720×900，
   * 导出 PNG 后走同一 shareFile（原生分享／下载回落），不上传服务器。 */
  function drawScoreCard(total100) {
    var canvas = document.createElement('canvas');
    canvas.width = 720; canvas.height = 900;
    var ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (e) {}
    if (!ctx) return null;
    var card = melodyCssVar('--card', '#FCFAF2');
    var ink = melodyCssVar('--ink', '#2A251B');
    var muted = melodyCssVar('--muted', '#8C8371');
    var gold = melodyCssVar('--gold', '#A2813B');
    var line = melodyCssVar('--line', '#E3DBC3');
    ctx.fillStyle = card; ctx.fillRect(0, 0, 720, 900);
    ctx.strokeStyle = gold; ctx.lineWidth = 4; ctx.strokeRect(28, 28, 664, 844);
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(40, 40, 640, 820);
    ctx.fillStyle = gold;
    ctx.font = '700 34px serif'; ctx.textAlign = 'center';
    ctx.fillText(t('karaoke_sample_title'), 360, 130);
    ctx.fillStyle = muted;
    ctx.font = '26px sans-serif';
    ctx.fillText(t('karaoke_score_title'), 360, 180);
    ctx.fillStyle = ink;
    ctx.font = '700 150px serif';
    ctx.fillText(String(total100), 360, 340);
    ctx.fillStyle = gold;
    ctx.font = '700 52px serif';
    ctx.fillText(gradeOf(total100), 360, 420);
    ctx.fillStyle = muted;
    ctx.font = '28px sans-serif';
    ctx.fillText(t(CELE_TIERS[tierOf(total100)].cap), 360, 490);
    var d = new Date();
    ctx.fillText(d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(), 360, 540);
    ctx.fillText(t('app_title') + ' · ' + t('karaoke_open'), 360, 800);
    return canvas;
  }
  function shareScoreCard(total100) {
    var canvas = drawScoreCard(total100);
    if (!canvas) return Promise.resolve('failed');
    return new Promise(function (resolve) {
      try {
        if (canvas.toBlob) {
          canvas.toBlob(function (blob) {
            if (!blob) { resolve('failed'); return; }
            shareFile(blob, 'karaoke-score-' + total100 + '.png').then(resolve);
          }, 'image/png');
        } else resolve('failed');
      } catch (e) { resolve('failed'); }
    });
  }

  /* ---------- 打分特效：小仙童（v599） ----------
   * 用户 2026-11-09 定：不用真神仙像（不敬），改用虚构小女孩——穿神仙衣服的
   * 小仙童，原创卡通 SVG（内联手绘，无外部图、不用道藏真神仙像）。
   * 四档动作各不相同（2026-11-09 15:35 用户定）：
   *   90+ 跳起来鼓掌（cele-jump 大起伏＋胸前合掌＋花瓣＋最盛金光雨）；
   *   75+ 正常鼓掌（返工标准：双掌掌心相对、胸前合拢分开、手指朝上、
   *     带自然弧线和节奏；不用叠加手掌的做法）；
   *   60+ 挥拳头加油（单臂举拳上下挥动）；<60 攥紧小拳头打气
   *   （双拳收在胸前轻晃，「再练一遍」文案保留）。
   *   做不好看宁可简单干净，不贴别扭的手。
   *   顺序：小样也在返工，返工后以小样的最终做法为准核对本特效，
   *   有出入列出来等下一步按小样调整——本特效不算定稿。
   * 透明度分层（2026-11-09 用户定）：人物层 opacity 1 实色不清透；
   *   半透明 50% 只是后面那层金光背景纱（veil），透出歌词；绝不给
   *   整个 overlay 一个统一的 0.5 opacity。覆盖层 pointer-events:none
   *   （CSS）、约 4s 自消，点按提前消散；金光粒子 canvas 读 --gold 变量，
   *   红光下自动转红谱；光晕读 --cele-glow（JS 按档位写，红光下 CSS 覆写收成红谱）。 */
  var CELE_TIERS = {
    excellent: { action: 'jump', robe: '#C9A227', robeDeep: '#8A6D1B', sash: '#E8C34A', glow: 'rgba(232,195,74,.55)', particles: 60, cap: 'karaoke_cele_gold' },
    good: { action: 'clap', robe: '#E88CA0', robeDeep: '#B85C74', sash: '#F6C6D2', glow: 'rgba(232,140,160,.5)', particles: 40, cap: 'karaoke_cele_pink' },
    fair: { action: 'fist', robe: '#5FA8A0', robeDeep: '#3E7A73', sash: '#BFE3DE', glow: 'rgba(95,168,160,.5)', particles: 24, cap: 'karaoke_cele_teal' },
    retry: { action: 'cheer', robe: '#8FB8D8', robeDeep: '#5B7FA6', sash: '#CFE0F0', glow: 'rgba(143,184,216,.4)', particles: 12, cap: 'karaoke_cele_cheer' }
  };
  var CELE_MS = 4000;
  var celeTimer = null, celeRaf = 0, celeParts = [], celeTapHide = null;
  function tierOf(total100) {
    if (total100 >= 90) return 'excellent';
    if (total100 >= 75) return 'good';
    if (total100 >= 60) return 'fair';
    return 'retry';
  }
  /* 原创小仙童 SVG：双髻＋金簪、圆脸、交领仙袍＋金腰带。
   * 四档动作各不相同（2026-11-09 15:35 用户定）：
   *   90+ 跳起来鼓掌（cele-jump 大起伏＋胸前合掌＋花瓣＋最盛金光雨）；
   *   75+ 正常鼓掌（返工标准：双掌掌心相对、胸前合拢分开、手指朝上、
   *     带自然弧线和节奏；不用叠加手掌的做法——手在胸前、掌面竖直，
   *     合拢时掌心贴合，不做横向滑动叠掌）；
   *   60+ 挥拳头加油（单臂举拳上下挥动）；
   *   <60 攥紧小拳头打气（双拳收在胸前轻晃）。
   * 做不好看宁可简单干净，不贴别扭的手。人物层不设任何透明。 */
  function fairySVG(tier, cfg) {
    var robe = cfg.robe, deep = cfg.robeDeep, sash = cfg.sash;
    var bobCls = (cfg.action === 'jump') ? 'cele-jump' : 'cele-bob';
    var arms = '';
    if (cfg.action === 'jump' || cfg.action === 'clap') {
      /* 胸前合掌：掌面竖直、手指朝上；左右掌各向中线合拢 4px＋上抬 3px
       * （自然弧线），合掌瞬间掌心金光星一闪。 */
      arms = '<g class="cele-arm-l"><path d="M42 78 Q40 92 50 94" stroke="' + robe + '" stroke-width="9" stroke-linecap="round" fill="none"/>' +
        '<rect x="46" y="72" width="11" height="22" rx="5.5" fill="#FFE3C2"/>' +
        '<path d="M49 72 L49 68 M53 72 L53 68" stroke="#E8B48C" stroke-width="1.2" stroke-linecap="round"/></g>' +
        '<g class="cele-arm-r"><path d="M78 78 Q80 92 70 94" stroke="' + robe + '" stroke-width="9" stroke-linecap="round" fill="none"/>' +
        '<rect x="63" y="72" width="11" height="22" rx="5.5" fill="#FFE3C2"/>' +
        '<path d="M67 72 L67 68 M71 72 L71 68" stroke="#E8B48C" stroke-width="1.2" stroke-linecap="round"/></g>' +
        '<g class="cele-spark"><path d="M60 62 L62.5 69.5 L70 72 L62.5 74.5 L60 82 L57.5 74.5 L50 72 L57.5 69.5 Z" fill="#FFD94A"/></g>';
    } else if (cfg.action === 'fist') {
      /* 挥拳头加油：右臂举拳上下挥动，左臂自然下垂 */
      arms = '<path d="M42 78 Q36 96 40 110" stroke="' + robe + '" stroke-width="9" stroke-linecap="round" fill="none"/>' +
        '<circle cx="40" cy="112" r="6" fill="#FFE3C2"/>' +
        '<g class="cele-fist"><path d="M78 76 Q84 60 90 52" stroke="' + robe + '" stroke-width="9" stroke-linecap="round" fill="none"/>' +
        '<rect x="84" y="44" width="12" height="8" rx="4" fill="' + sash + '"/>' +
        '<circle cx="92" cy="42" r="7" fill="#FFE3C2"/></g>';
    } else {
      /* 攥紧小拳头打气：双拳收在胸前轻晃 */
      arms = '<g class="cele-cheer">' +
        '<path d="M42 78 Q40 88 48 90" stroke="' + robe + '" stroke-width="9" stroke-linecap="round" fill="none"/>' +
        '<circle cx="49" cy="88" r="6.5" fill="#FFE3C2"/>' +
        '<path d="M78 78 Q80 88 72 90" stroke="' + robe + '" stroke-width="9" stroke-linecap="round" fill="none"/>' +
        '<circle cx="71" cy="88" r="6.5" fill="#FFE3C2"/></g>';
    }
    var petals = '';
    if (cfg.action === 'jump') {
      petals = '<g class="cele-petals">' +
        '<ellipse class="cele-petal" cx="22" cy="30" rx="4" ry="7" fill="#F6A8BC" style="animation-delay:0s"/>' +
        '<ellipse class="cele-petal" cx="98" cy="22" rx="4" ry="7" fill="#E8C34A" style="animation-delay:.4s"/>' +
        '<ellipse class="cele-petal" cx="108" cy="60" rx="4" ry="7" fill="#F6A8BC" style="animation-delay:.8s"/>' +
        '<ellipse class="cele-petal" cx="12" cy="66" rx="4" ry="7" fill="#E8C34A" style="animation-delay:1.2s"/></g>';
    }
    return '<svg class="karaoke-cele-fairy" viewBox="0 0 120 160" role="img" aria-label="小仙童">' +
      '<defs><radialGradient id="celeGlow" cx="50%" cy="42%" r="55%">' +
      '<stop offset="0%" stop-color="' + sash + '" stop-opacity=".9"/><stop offset="100%" stop-color="' + sash + '" stop-opacity="0"/></radialGradient></defs>' +
      '<circle cx="60" cy="66" r="56" fill="url(#celeGlow)"/>' +
      '<g class="' + bobCls + '">' +
      '<circle cx="44" cy="26" r="9" fill="#3A2E22"/><circle cx="76" cy="26" r="9" fill="#3A2E22"/>' +
      '<path d="M52 14 Q60 4 68 14" stroke="#E8C34A" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="60" cy="8" r="3" fill="#E8C34A"/>' +
      '<circle cx="60" cy="44" r="22" fill="#FFE3C2"/>' +
      '<path d="M40 40 Q60 22 80 40 Q80 30 60 28 Q40 30 40 40Z" fill="#3A2E22"/>' +
      '<circle cx="52" cy="44" r="2.4" fill="#2A251B"/><circle cx="68" cy="44" r="2.4" fill="#2A251B"/>' +
      '<path d="M54 52 Q60 57 66 52" stroke="#B23A2B" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="44" cy="51" r="3.4" fill="#F2A0A0" opacity=".7"/><circle cx="76" cy="51" r="3.4" fill="#F2A0A0" opacity=".7"/>' +
      '<path d="M60 66 L40 74 Q34 96 38 132 L82 132 Q86 96 80 74 Z" fill="' + robe + '"/>' +
      '<path d="M60 66 L48 76 L60 88 L72 76 Z" fill="' + sash + '"/>' +
      '<path d="M38 132 L82 132 L84 142 L36 142 Z" fill="' + deep + '"/>' +
      '<rect x="44" y="104" width="32" height="6" rx="3" fill="' + sash + '"/>' +
      arms +
      '</g>' + petals + '</svg>';
  }
  function showCelebration(total100) {
    var host = $('karaoke-celebration');
    if (!host) return;
    hideCelebration();
    var key = tierOf(total100);
    var cfg = CELE_TIERS[key];
    host.innerHTML =
      '<div class="karaoke-cele-veil" style="opacity:.5"></div>' +
      '<canvas class="karaoke-cele-canvas" id="karaoke-cele-canvas"></canvas>' +
      '<div class="karaoke-cele-card">' + fairySVG(key, cfg) +
      '<div class="karaoke-cele-score">' + total100 + '</div>' +
      '<div class="karaoke-cele-cap">' + esc(t(cfg.cap)) + '</div>' +
      '<div class="karaoke-cele-sub">' + esc(t('karaoke_sample_title')) + '</div></div>';
    host.hidden = false;
    host.style.pointerEvents = 'none';
    host.style.setProperty('--cele-glow', cfg.glow); /* 档位光晕：JS 只写变量，强度由 CSS drop-shadow 读出 */
    /* 点按提前消散：覆盖层 pointer-events:none 永不挡点按，点按落在下方
     * 视图／悬浮钮上；capture 监听 document——showCelebration 由出分按钮
     * click 同步触发，冒泡监听会在同一 click 冒到 document 时立刻误触，
     * capture 则已错过在途事件，只响应之后的点按；不 preventDefault、
     * 不 stopPropagation，点按的本来动作（如播放）照常执行。 */
    if (!celeTapHide) {
      celeTapHide = function () { hideCelebration(); };
      document.addEventListener('click', celeTapHide, true);
    }
    startCeleParticles(cfg.particles);
    celeTimer = setTimeout(function () { hideCelebration(); }, CELE_MS);
  }
  function hideCelebration() {
    if (celeTimer) { clearTimeout(celeTimer); celeTimer = null; }
    if (celeRaf) { try { cancelAnimationFrame(celeRaf); } catch (e) {} celeRaf = 0; }
    celeParts = [];
    if (celeTapHide) { document.removeEventListener('click', celeTapHide, true); celeTapHide = null; }
    var host = $('karaoke-celebration');
    if (host) { host.hidden = true; host.innerHTML = ''; host.style.removeProperty('--cele-glow'); }
  }
  function startCeleParticles(n) {
    var canvas = $('karaoke-cele-canvas');
    if (!canvas) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; /* 静帧，不跑粒子 */
    var ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (e) {}
    if (!ctx) return;
    var w = canvas.clientWidth || window.innerWidth || 360;
    var h = canvas.clientHeight || window.innerHeight || 640;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var gold = melodyCssVar('--gold', '#C9A227');
    celeParts = [];
    for (var i = 0; i < n; i++) {
      celeParts.push({ x: Math.random() * w, y: h * (0.25 + Math.random() * 0.75), r: 1.5 + Math.random() * 3.5, vy: -(0.3 + Math.random() * 0.9), vx: (Math.random() - 0.5) * 0.5, tw: Math.random() * Math.PI * 2 });
    }
    var start = Date.now();
    var step = function () {
      if (!celeParts.length) return;
      if (Date.now() - start > CELE_MS) { celeParts = []; return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = gold;
      celeParts.forEach(function (p) {
        p.y += p.vy; p.x += p.vx; p.tw += 0.08;
        if (p.y < -10) p.y = h + 10;
        ctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(p.tw));
        ctx.beginPath(); ctx.arc(p.x * dpr, p.y * dpr, p.r * dpr, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      celeRaf = requestAnimationFrame(step);
    };
    celeRaf = requestAnimationFrame(step);
  }

  /* ---------- 打开 / 关闭 ---------- */
  function open() {
    var view = $('karaoke-view');
    if (!view) return;
    view.hidden = false;
    opened = true;
    var qfab = $('karaoke-qing-fab');
    if (qfab) qfab.classList.add('show'); /* 悬浮磬钮在视图之外，显隐由 open/close 管理 */
    var rfab = $('karaoke-rec-fab');
    if (rfab) rfab.classList.add('show'); /* 录音悬浮钮（右侧、磬钮上方），同理在视图之外 */
    updateRecUI(); /* 录音钮文案／模式切换复位 */
    loadRecList(); /* 本机旧录音进面板 */
    var tbox = $('karaoke-timebox');
    if (tbox) { applyTimeboxPos(); tbox.classList.add('show'); updateTimebox(audio ? (audio.currentTime || 0) : 0); }
    layoutSticky(); /* 显形后再算吸顶偏移：hidden 时 offsetHeight 为 0，须先显形再实测（C 线 §1.6 原意不变） */
    updateScoringUI(); /* 重开复位：状态条、提示、按钮文案回到未打分态 */
    updateTopBtn();
    renderLyrics();
    loadData().then(function () {
      renderLyrics();
      setSeg(seg, { autoplay: false });
    }).catch(function () {
      var host = $('karaoke-lyrics');
      if (host) host.innerHTML = '<p class="hint">' + esc(t('karaoke_loading')) + '</p>';
    });
    /* 旋律懒加载：不阻塞播放器；到手才亮音高线，失败则整块保持 hidden。
     * v595：亮起后重算 layoutSticky()——open() 时条仍 hidden、melH 按 0 计，
     * 不重算则打分状态条会顶进音高线。 */
    loadMelody().then(function (m) {
      var strip = $('karaoke-melody');
      if (strip) strip.hidden = !m;
      if (m) { layoutSticky(); drawMelody(audio ? (audio.currentTime || 0) : 0); }
    });
    /* 预建磬 Audio（用户点击手势上下文，iOS 不拦截；沿冥想区 fbStart 预建口径） */
    try {
      if (!qingAudio) qingAudio = new Audio(QING_URL);
      qingAudio.volume = QING_VOL;
    } catch (e) {}
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
    try { if (qingAudio) qingAudio.pause(); } catch (e) {}
    var qbtn = $('karaoke-qing-fab');
    if (qbtn) qbtn.classList.remove('qing-near', 'qing-hit', 'show');
    if (rec) stopRecording(); /* 关视图即停录（已录分片照常保存进面板） */
    hideCelebration(); /* 关视图即收特效（清掉自消定时器与粒子循环） */
    var rfab2 = $('karaoke-rec-fab');
    if (rfab2) rfab2.classList.remove('show', 'recording');
    var rtime = $('karaoke-rec-time');
    if (rtime) rtime.hidden = true;
    var tbox2 = $('karaoke-timebox');
    if (tbox2) tbox2.classList.remove('show');
    if (scoring || arming) disarmScoring(false);
    updateTopBtn();
    var host = $('karaoke-score');
    if (host) { host.hidden = true; host.innerHTML = ''; }
    lastLineIdx = -1;
    scoreElapsedMs = 0;
    lastTickT = 0;
  }

  /* ---------- 回到顶部（C 线 §2） ---------- */
  function updateTopBtn() {
    var view = $('karaoke-view');
    var btn = $('karaoke-top-btn');
    if (!view || !btn) return;
    var show = opened && view.scrollTop > 400;
    if (show === topShown) return; /* 值不变不写 DOM（scroll 高频） */
    topShown = show;
    btn.classList.toggle('show', show);
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
    var qingBtn = $('karaoke-qing-fab');
    if (qingBtn) qingBtn.addEventListener('click', function () { strikeQing(); });
    /* 录音悬浮钮（v599）：点按开始／再点停止；不支持的浏览器只提示，不崩播放器 */
    var recFab = $('karaoke-rec-fab');
    if (recFab) recFab.addEventListener('click', function () {
      if (rec) stopRecording(); else startRecording();
    });
    /* 录音模式切换（独唱／合唱）：录制中不换 */
    document.querySelectorAll('.karaoke-rec-mode-btn').forEach(function (b) {
      b.addEventListener('click', function () { setRecMode(b.getAttribute('data-mode')); });
    });
    /* 切后台：如实标记本次录音可能中断（部分浏览器会暂停 MediaRecorder），
     * 不静默假装正常；标记显示在录音项与状态行。 */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && rec) { rec.bgInterrupted = true; updateRecUI(); }
    });
    bindTimeboxDrag(); /* 悬浮时间框拖动（v586 测试工具；恒可拖） */
    var spd = $('karaoke-speed');
    if (spd) spd.addEventListener('change', function () {
      audio.playbackRate = parseFloat(spd.value) || 1;
    });
    var loopBtn = $('karaoke-loop');
    if (loopBtn) loopBtn.addEventListener('click', function () { setLoop(!loopOne); });
    /* 快进/快退（v585）：-10s/-5s/+5s/+10s，data-seek 存秒数 */
    document.querySelectorAll('#karaoke-seek-row .karaoke-seek').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = parseInt(b.getAttribute('data-seek'), 10);
        if (!isNaN(s)) seekBy(s);
      });
    });
    var scoreBtn = $('karaoke-score-btn');
    if (scoreBtn) scoreBtn.addEventListener('click', function () {
      if (scoring) disarmScoring(true);
      else armScoring();
    });
    /* 悬浮停控制：与控制条打分按钮同一漏斗（C 线 §1.3） */
    var stopBtn = $('karaoke-score-stop');
    if (stopBtn) stopBtn.addEventListener('click', function () { disarmScoring(true); });
    /* 回到顶部：监听视图自身滚动（窗口不滚，§0）；点按只滚视图，不碰播放/计分 */
    var view = $('karaoke-view');
    if (view) view.addEventListener('scroll', updateTopBtn);
    var topBtn = $('karaoke-top-btn');
    if (topBtn) topBtn.addEventListener('click', function () {
      if (!view) return;
      noAutoScrollUntil = Date.now() + 900; /* 抑制随后 900ms 内的切句自动居中 */
      var smooth = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      try { view.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' }); }
      catch (e) { view.scrollTop = 0; }
    });
    /* 横竖屏切换重算吸顶偏移（头栏折行会变高）；只在视图开着时算 */
    window.addEventListener('resize', function () { if (opened) layoutSticky(); });

    audio.addEventListener('play', function () {
      setPlayingUI(true);
      /* 合唱混音图建后原唱走 recCtx：切后台回来若 ctx 被挂起，原唱会静音，在此唤醒 */
      if (recCtx && recCtx.state === 'suspended') { recCtx.resume().catch(function () {}); }
    });
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
    loadMelody: loadMelody,
    /* 供冒烟测试的纯函数／入口（生产不调用） */
    _test: { detectPitch: detectPitch, median: median, showScore: showScore, scoreLines: scoreLines, strikeQing: strikeQing, buildQingTimes: buildQingTimes, seekBy: seekBy, setLoop: setLoop, findLine: findLine, updateTimebox: updateTimebox, applyTimeboxPos: applyTimeboxPos,
      /* v594 旋律引导（音高线可视化保留；提示音声源已删） */
      loadMelody: loadMelody, normalizeMelody: normalizeMelody, melodyF0At: melodyF0At,
      melodyNoteAt: melodyNoteAt, melodyWindow: melodyWindow, melodySeg: melodySeg,
      drawMelody: drawMelody,
      /* 打分耳机提示 toast */
      showHeadphonesToast: showHeadphonesToast, hideHeadphonesToast: hideHeadphonesToast,
      /* v599 录音＋分享＋小仙童打分特效（拍手动图；人物 opacity 1、背景纱 0.5） */
      tierOf: tierOf, CELE_TIERS: CELE_TIERS, CELE_MS: CELE_MS,
      fairySVG: fairySVG, showCelebration: showCelebration, hideCelebration: hideCelebration,
      pickRecMime: pickRecMime, recSupported: recSupported, recExt: recExt, fmtSize: fmtSize,
      canShareFiles: canShareFiles, shareFile: shareFile, downloadBlob: downloadBlob,
      drawScoreCard: drawScoreCard, shareScoreCard: shareScoreCard,
      startRecording: startRecording, stopRecording: stopRecording,
      setRecMode: setRecMode, getRecMode: function () { return recMode; },
      getRecList: function () { return recList; }, renderRecList: renderRecList,
      deleteRec: deleteRec, recItemAction: recItemAction,
      melodyLoaded: function () { return melody; },
      MELODY_FMIN: MELODY_FMIN, MELODY_FMAX: MELODY_FMAX,
      MELODY_WIN_BEFORE: MELODY_WIN_BEFORE, MELODY_WIN_AFTER: MELODY_WIN_AFTER } };
})();
