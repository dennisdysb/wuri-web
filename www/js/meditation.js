/* 戊日不上香 · 打坐冥想沉浸页
 * 全屏禅房：9 种自然声横向滑动切换，背景交叉淡入 + 缓推近 + 视差；
 * 控制层固定。播放走原生 MeditationAudioService（后台/锁屏/通知栏），
 * 非原生环境（网页/测试）用 HTML5 Audio 降级。
 */
var Meditation = (function () {
  'use strict';

  var SOUNDS = [
    { id: 'rain',    name: '温柔雨声', img: 'img/meditation/bg-rain.webp?v=3',    loop: 'audio/meditation/loop-rain.mp3?v=3',    asset: 'www/audio/meditation/loop-rain.mp3' },
    { id: 'thunder', name: '雨·远雷',   img: 'img/meditation/bg-thunder.webp?v=3', loop: 'audio/meditation/loop-thunder.mp3?v=3', asset: 'www/audio/meditation/loop-thunder.mp3' },
    { id: 'ocean',   name: '海浪',       img: 'img/meditation/bg-ocean.webp?v=3',   loop: 'audio/meditation/loop-ocean.mp3?v=3',   asset: 'www/audio/meditation/loop-ocean.mp3' },
    { id: 'forest',  name: '森林鸟鸣', img: 'img/meditation/bg-forest.webp?v=3',  loop: 'audio/meditation/loop-forest.mp3?v=3',  asset: 'www/audio/meditation/loop-forest.mp3' },
    { id: 'night',   name: '夜晚虫鸣', img: 'img/meditation/bg-night.webp?v=3',   loop: 'audio/meditation/loop-night.mp3?v=3',   asset: 'www/audio/meditation/loop-night.mp3' },
    { id: 'fire',    name: '壁炉火声', img: 'img/meditation/bg-fire.webp?v=3',    loop: 'audio/meditation/loop-fire.mp3?v=3',    asset: 'www/audio/meditation/loop-fire.mp3' },
    { id: 'creek',   name: '溪流',       img: 'img/meditation/bg-creek.webp?v=3',   loop: 'audio/meditation/loop-creek.mp3?v=3',   asset: 'www/audio/meditation/loop-creek.mp3' },
    { id: 'wind',    name: '风声',       img: 'img/meditation/bg-wind.webp?v=3',    loop: 'audio/meditation/loop-wind.mp3?v=3',    asset: 'www/audio/meditation/loop-wind.mp3' },
    { id: 'bowl',    name: '颂钵·静',   img: 'img/meditation/bg-bowl.webp?v=3',    loop: 'audio/meditation/loop-bowl.mp3?v=3',    asset: 'www/audio/meditation/loop-bowl.mp3' },
    { id: 'silence', name: '无声·静室', img: 'img/meditation/bg-silence.webp?v=3', loop: '', asset: '' }
  ];
  var INTERVAL_BELL_LOOP = 'audio/meditation/bell-interval.mp3?v=3';
  var END_BELL_LOOP = 'audio/meditation/bell-ending.mp3?v=3';
  var INTERVAL_BELL_ASSET = 'www/audio/meditation/bell-interval.mp3';
  var END_BELL_ASSET = 'www/audio/meditation/bell-ending.mp3';
  var INTERVAL_SEC = 300; /* 间隔磬：每 5 分钟 */

  var LS_SOUND = 'wuri_med_sound';
  var LS_DUR = 'wuri_med_dur';
  var LS_CUSTOM = 'wuri_med_custom';
  var LS_BELL = 'wuri_med_bell';
  var LS_VOL = 'wuri_med_vol';
  var LS_BREATH = 'wuri_med_breath';
  var LS_CUE = 'wuri_med_cue';
  var LS_CUE_VOL = 'wuri_med_cuevol';
  var LS_CUE_PAD = 'wuri_med_cuepad';
  var LS_CUE_VIB = 'wuri_med_cuevib';

  /* 呼吸参数只取事实层（相位秒数），名称说明与引导实现均为本站自撰/自写。 */
  var BREATH_PATTERNS = [
    { id: 'square', name: '盒式呼吸', phases: [4, 4, 4, 4], note: '四相位等长，平稳安定。' },
    { id: 'coherent', name: '谐振呼吸', phases: [5.5, 0, 5.5, 0], note: '吸呼等长，缓慢均匀，适合日常定心。' },
    { id: 'extended-exhale', name: '延长呼气', phases: [4, 0, 6, 0], note: '呼气长于吸气，短时间也可练习。' },
    { id: 'deep-calm', name: '深度安神（4-7-8）', phases: [4, 7, 8, 0], note: '节奏缓慢，适合打坐收尾或睡前；如感头晕，请恢复自然呼吸。' },
    { id: 'ujjayi', name: '乌加依呼吸', phases: [7, 0, 7, 0], note: '吸呼缓慢均匀，帮助收摄心神。' },
    { id: 'pranayama', name: '调息法', phases: [7, 4, 8, 4], note: '四相位俱全的进阶慢练习；如感不适，请恢复自然呼吸。' },
    { id: 'awake', name: '清醒提神', phases: [6, 0, 2, 0], note: '吸长呼短，适合晨起，不建议睡前使用。' }
  ];
  /* 缩放口径（2026-10-26 用户真机反馈改）：峰值 1.35（圈基径同步放大，见 meditation.css
   * --med-circ 的带高公式），谷值 0.60——基径变大后谷值绝对尺寸与旧版（176×0.68≈120px）基本持平。 */
  var BREATH_PHASE_META = [
    { key: 'inhale', label: '吸气', from: 0.6, to: 1.35 },
    { key: 'holdIn', label: '屏息', from: 1.35, to: 1.35 },
    { key: 'exhale', label: '呼气', from: 1.35, to: 0.6 },
    { key: 'holdOut', label: '屏息', from: 0.6, to: 0.6 }
  ];

  var SVG_PLAY = '<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_PAUSE = '<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  function $(s) { return document.querySelector(s); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function bridge() {
    var b = window.WuBridge;
    return (b && typeof b.medStart === 'function') ? b : null;
  }

  /* ---------- 状态 ---------- */
  var cur = 0;
  var totalSec = 15 * 60;
  var playing = false;
  var expectDone = false;   /* 本轮是否等待"到点" */
  var seenActive = false;   /* 轮询到过有效剩余秒数（防 medStart 竞态） */
  var pollId = 0;
  var bgEls = [], dotEls = [];
  var pagerEl = null, rafPending = false;
  var breathId = lsGet(LS_BREATH, 'off');
  var breath = { active: false, phaseIndex: 0, endsAt: 0, durationMs: 0, remainingMs: 0, timer: 0 };

  /* 降级播放（非原生） */
  var fb = { ambient: null, endAt: 0, bellTimer: 0, endTimer: 0, paused: false, remainMs: 0, elapsedMs: 0, startedAt: 0 };

  /* ---------- 屏幕常亮（Wake Lock） ----------
   * 播放期间（含呼吸跟随）保持屏幕常亮：屏灭则呼吸圈不可见、跟随中断（2026-10-25 修）。
   * 申请/释放全程静默：API 不支持、被拒、页面不可见时一律降级为系统默认息屏，绝不报错。 */
  var wakeLock = null;
  function acquireWakeLock() {
    if (wakeLock && !wakeLock.released) return;
    try {
      if (!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') return;
      var p = navigator.wakeLock.request('screen');
      if (!p || typeof p.then !== 'function') return;
      p.then(function (wl) {
        wakeLock = wl;
        try {
          wl.addEventListener('release', function () { if (wakeLock === wl) wakeLock = null; });
        } catch (e) {}
        /* 申请在途时已暂停/结束：到手的锁立即还掉，不留亮屏 */
        if (!playing) releaseWakeLock();
      }).catch(function () { /* 被拒（不可见/省电策略等）：静默降级 */ });
    } catch (e) {}
  }
  function releaseWakeLock() {
    var wl = wakeLock;
    wakeLock = null;
    if (wl) {
      try {
        var r = wl.release();
        if (r && typeof r.catch === 'function') r.catch(function () {});
      } catch (e) {}
    }
  }

  /* ---------- 构建 ---------- */
  function build() {
    var stack = $('#med-bg-stack'), pager = $('#med-pager'), dots = $('#med-dots');
    pagerEl = pager;
    var i, d;
    for (i = 0; i < SOUNDS.length; i++) {
      (function (idx) {
        var bg = document.createElement('div');
        bg.className = 'med-bg';
        var img = document.createElement('img');
        /* src 懒赋值（setPage 时才给）：10 张全屏图不要一进页面就全部解码，
           移动端合成层/显存压力会表现为闪屏、文字层被顶掉、最后黑屏
           （2026-10-25 二轮故障修；资产已由 SW 预缓存本地化，赋值即本地命中） */
        img.alt = '';
        img.draggable = false;
        /* 载入失败（弱网/缓存异常）时换参重试一次，避免背景图永久破图（2026-10-19 修） */
        img.addEventListener('error', function () {
          if (!img.dataset.rt) { img.dataset.rt = '1'; img.src = SOUNDS[idx].img + '&r=1'; }
        });
        bg.appendChild(img);
        stack.appendChild(bg);
        bgEls.push(bg);
        var pg = document.createElement('div');
        pg.className = 'med-page';
        pager.appendChild(pg);
        d = document.createElement('span');
        d.className = 'med-dot';
        d.setAttribute('aria-hidden', 'true');
        dots.appendChild(d);
        dotEls.push(d);
      })(i);
    }
    buildBreathOptions();
    /* 滑动切场景：不用原生滚动，直接触摸判断方向，一次只走一页（2026-10-09 重构）
       根因：原生滚动的惯性+吸附+JS控制三方打架，快速连滑必乱 */
    var tsX = 0, tActive = false;
    // 禁掉 pager 的原生滚动
    try { pager.style.overflow = 'hidden'; } catch (e) {}
    pager.addEventListener('touchstart', function (e) {
      tActive = true;
      tsX = e.touches[0].clientX;
    }, { passive: true });
    pager.addEventListener('touchcancel', function () { tActive = false; }, { passive: true });
    pager.addEventListener('touchend', function (e) {
      if (!tActive) return;
      tActive = false;
      var dx = e.changedTouches[0].clientX - tsX;
      if (Math.abs(dx) > 24) {
        var target = cur + (dx < 0 ? 1 : -1);
        target = Math.max(0, Math.min(SOUNDS.length - 1, target));
        if (target !== cur) setPage(target);
      }
    }, { passive: true });
  }

  /* 目标场景图未赋值过才给 src（本地预缓存命中，近乎即时） */
  function ensureBg(i) {
    var bg = bgEls[i];
    if (!bg) return;
    var img = bg.firstChild;
    if (img && !img.getAttribute('src')) img.src = SOUNDS[i].img;
  }

  /* 直接切到指定页：更新背景交叉淡入 + 圆点 */
  function setPage(i, force) {
    if (i === cur && !force) return;
    cur = i;
    ensureBg(i);
    onSoundChanged();
    // 背景交叉淡入由 CSS transition 处理，这里直接设 opacity
    for (var j = 0; j < SOUNDS.length; j++) {
      bgEls[j].style.opacity = (j === i) ? '1' : '0';
      if (j === i) bgEls[j].classList.add('active');
      else bgEls[j].classList.remove('active');
    }
  }

  function pageW() { return pagerEl ? (pagerEl.clientWidth || 1) : 1; }
  function goPage(i) {
    // 兼容旧调用，转调 setPage
    if (!pagerEl) return;
    var target = Math.max(0, Math.min(SOUNDS.length - 1, i));
    setPage(target);
  }

  function onSoundChanged() {
    for (var i = 0; i < dotEls.length; i++) {
      dotEls[i].classList.toggle('on', i === cur);
    }
    var nameEl = $('#med-sound-name');
    nameEl.style.opacity = '0';
    setTimeout(function () {
      nameEl.textContent = SOUNDS[cur].name;
      nameEl.style.opacity = '1';
    }, 180);
    lsSet(LS_SOUND, SOUNDS[cur].id);
    /* 播放中切换：保持剩余计时，只换背景音 */
    if (playing) {
      var rem = getRemaining();
      if (rem > 0) startPlayback(rem);
    }
  }

  /* ---------- 呼吸型态 ---------- */
  function breathPattern() {
    for (var i = 0; i < BREATH_PATTERNS.length; i++) {
      if (BREATH_PATTERNS[i].id === breathId) return BREATH_PATTERNS[i];
    }
    return null;
  }
  function breathPhases(pattern) {
    var out = [];
    if (!pattern) return out;
    for (var i = 0; i < pattern.phases.length; i++) {
      if (pattern.phases[i] > 0) out.push({ meta: BREATH_PHASE_META[i], seconds: pattern.phases[i] });
    }
    return out;
  }
  function buildBreathOptions() {
    var wrap = $('#med-breath-options');
    if (!wrap || wrap.children.length) return;
    var choices = [{ id: 'off', name: '关闭' }].concat(BREATH_PATTERNS);
    choices.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'med-breath-chip';
      b.setAttribute('data-breath', p.id);
      b.textContent = p.name;
      b.addEventListener('click', function () { selectBreath(p.id); });
      wrap.appendChild(b);
    });
  }
  function selectBreath(id) {
    breathId = id;
    lsSet(LS_BREATH, id);
    renderBreathSelection();
    if (playing && breathPattern()) startBreath();
    else resetBreathPreview();
  }
  function renderBreathSelection() {
    var chips = document.querySelectorAll('#med-breath-options .med-breath-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('on', chips[i].getAttribute('data-breath') === breathId);
    }
    var box = $('#med-breath');
    if (box) box.hidden = !breathPattern();
    /* 声音引导设置块同属呼吸区：无型态时不占位 */
    var cueBlk = $('#med-cue-block');
    if (cueBlk) cueBlk.hidden = !breathPattern();
    /* 说明已移至控制层（chips 行上方）：显隐跟随型态选择，纯计时态不占位 */
    var noteEl = $('#med-breath-note');
    if (noteEl) noteEl.hidden = !breathPattern();
    /* 呼吸态布局类：中央区上移 + 呼吸圈放大（meditation.css），纯计时态不挂此列 */
    var view = $('#meditation-view');
    if (view) view.classList.toggle('med-breathing', !!breathPattern());
  }
  function setBreathVisual(phase, scale, remainSec) {
    var circle = $('#med-breath-circle');
    if (circle) circle.style.transform = 'scale(' + scale.toFixed(3) + ')';
    var label = $('#med-breath-phase');
    if (label) label.textContent = phase ? phase.meta.label : '吸气';
    var count = $('#med-breath-count');
    if (count) count.textContent = Math.max(0, remainSec || 0).toFixed(1);
    var note = $('#med-breath-note');
    var p = breathPattern();
    if (note) note.textContent = p ? p.note : '';
  }
  function resetBreathPreview() {
    clearBreathTimer();
    breath.active = false;
    breath.phaseIndex = 0;
    breath.remainingMs = 0;
    renderBreathSelection();
    var p = breathPattern(), phases = breathPhases(p);
    if (p && phases.length) setBreathVisual(phases[0], phases[0].meta.from, phases[0].seconds);
  }
  function clearBreathTimer() {
    if (breath.timer) { clearInterval(breath.timer); breath.timer = 0; }
  }
  function beginBreathPhase() {
    var p = breathPattern(), phases = breathPhases(p);
    if (!p || !phases.length || !playing) { resetBreathPreview(); return; }
    if (breath.phaseIndex >= phases.length) breath.phaseIndex = 0;
    var phase = phases[breath.phaseIndex];
    breath.active = true;
    breath.durationMs = phase.seconds * 1000;
    breath.remainingMs = breath.durationMs;
    breath.endsAt = Date.now() + breath.durationMs;
    setBreathVisual(phase, phase.meta.from, phase.seconds);
    cuePhase(phase);
    clearBreathTimer();
    breath.timer = setInterval(updateBreathVisual, 50);
  }
  function updateBreathVisual() {
    if (!breath.active) return;
    var p = breathPattern(), phases = breathPhases(p);
    if (!p || !phases.length) { resetBreathPreview(); return; }
    var phase = phases[breath.phaseIndex % phases.length];
    var remainMs = breath.endsAt - Date.now();
    if (remainMs <= 0) {
      breath.phaseIndex = (breath.phaseIndex + 1) % phases.length;
      beginBreathPhase();
      return;
    }
    breath.remainingMs = remainMs;
    var progress = 1 - remainMs / breath.durationMs;
    progress = Math.max(0, Math.min(1, progress));
    var scale = phase.meta.from + (phase.meta.to - phase.meta.from) * progress;
    setBreathVisual(phase, scale, remainMs / 1000);
  }
  function startBreath() {
    breath.phaseIndex = 0;
    breath.remainingMs = 0;
    if (breathPattern()) beginBreathPhase();
    else resetBreathPreview();
  }
  function pauseBreath() {
    if (!breath.active) return;
    breath.remainingMs = Math.max(0, breath.endsAt - Date.now());
    breath.active = false;
    clearBreathTimer();
    cueStopAll();
  }
  function resumeBreath() {
    var p = breathPattern(), phases = breathPhases(p);
    if (!p || !phases.length || breath.active) return;
    if (!breath.remainingMs) { startBreath(); return; }
    var phase = phases[breath.phaseIndex % phases.length];
    breath.active = true;
    breath.durationMs = phase.seconds * 1000;
    breath.endsAt = Date.now() + breath.remainingMs;
    clearBreathTimer();
    breath.timer = setInterval(updateBreathVisual, 50);
    updateBreathVisual();
  }
  function stopBreath() {
    clearBreathTimer();
    breath.active = false;
    breath.remainingMs = 0;
    breath.phaseIndex = 0;
    cueStopAll();
    var p = breathPattern(), phases = breathPhases(p);
    renderBreathSelection();
    if (p && phases.length) setBreathVisual(phases[0], phases[0].meta.from, phases[0].seconds);
  }

  /* ---------- 呼吸声音引导（闭眼跟随） ----------
   * 相位提示音：WebAudio 合成低音滑音（正弦基频＋二/三谐波＋极轻带通气声，
   * 柔起柔收），与间隔磬（高音区单下清磬、长衰减）在音区/时长/轮廓三重拉开。
   * 由相位调度同点触发（beginBreathPhase），不另起时钟；滑音时长随相位缩放、
   * 封顶 1.2s 且不超过相位长。提示默认音量明显低于间隔磬（独立滑杆）。
   * 让行：间隔磬将落在提示发声窗口内（或刚鸣 <400ms）时，本相位提示音跳过、
   * 不叠响、不延迟补响——间隔磬优先。振动是独立无声通道，不受让行影响。
   * 会话已播时长（sess）只为预测间隔磬时刻：开始/重开清零，暂停折算、继续接续，
   * 与原生服务/降级定时器同口径（两路间隔磬都按已播时长每 INTERVAL_SEC 一鸣）。 */
  var CUE_F_LO = 196, CUE_F_HI = 293.66, CUE_F_MID = 246.94;
  var cue = { ctx: null, master: null, live: [], noiseBuf: null };
  var sess = { base: 0, since: 0 };
  function sessElapsedMs() { return sess.since ? sess.base + (Date.now() - sess.since) : sess.base; }
  function sessReset() { sess.base = 0; sess.since = 0; }
  function cueOn() { var t = $('#med-cue-toggle'); return t ? t.checked : false; }
  function cuePadOn() { var t = $('#med-cue-pad'); return t ? t.checked : true; }
  function cueVibOn() { var t = $('#med-cue-vib'); return t ? t.checked : false; }
  function cueVol() {
    var el = $('#med-cue-vol');
    var v = parseInt((el ? el.value : '45'), 10);
    return Math.max(0, Math.min(100, isNaN(v) ? 45 : v)) / 100;
  }
  function cueMasterGain() { return cueVol() * 0.24; }
  function cueEnsureCtx() {
    if (cue.ctx) {
      if (cue.ctx.state === 'suspended') { try { cue.ctx.resume(); } catch (e) {} }
      return cue.ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      cue.ctx = new AC();
      var lp = cue.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1050; lp.Q.value = 0.3;
      cue.master = cue.ctx.createGain();
      cue.master.gain.value = cueMasterGain();
      cue.master.connect(lp); lp.connect(cue.ctx.destination);
    } catch (e) { cue.ctx = null; cue.master = null; return null; }
    return cue.ctx;
  }
  function cueBellClash(durMs) {
    if (!bellOn() || !sess.since) return false;
    var iv = INTERVAL_SEC * 1000, el = sessElapsedMs();
    var into = el % iv, until = iv - into;
    if (until <= durMs + 150) return true;      /* 磬将落在提示窗口内 */
    if (into <= 400 && el >= iv) return true;   /* 磬刚鸣，衰减最响段不叠 */
    return false;
  }
  function cueDurFor(sec) {
    var d = Math.min(1.2, Math.max(0.45, sec * 0.3));
    return Math.min(d, sec * 0.95);
  }
  function cueTone(kind, sec) {
    var ctx = cueEnsureCtx();
    if (!ctx || !cue.master) return;
    var dur = cueDurFor(sec);
    if (cueBellClash(dur * 1000)) return;
    var f0, f1, peak;
    if (kind === 'inhale') { f0 = CUE_F_LO; f1 = CUE_F_HI; peak = 1; }
    else if (kind === 'exhale') { f0 = CUE_F_HI; f1 = CUE_F_LO; peak = 1; }
    else if (kind === 'holdIn') { f0 = f1 = CUE_F_MID; peak = 0.5; }
    else { f0 = f1 = CUE_F_LO; peak = 0.12; }   /* 呼后屏息：近无声垫音 */
    var t0 = ctx.currentTime + 0.02;
    var g = ctx.createGain();
    var atk = dur * 0.3, relStart = dur * 0.6;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + relStart);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(cue.master);
    var nodes = [];
    var parts = [[1, 1], [2, 0.32], [3, 0.1]];
    for (var i = 0; i < parts.length; i++) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0 * parts[i][0], t0);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1 * parts[i][0], t0 + dur * 0.9);
      var og = ctx.createGain(); og.gain.value = parts[i][1];
      o.connect(og); og.connect(g);
      o.start(t0); o.stop(t0 + dur + 0.05);
      nodes.push(o);
    }
    /* 气声层：带通噪声随滑音频率走，极轻，取埙/箫的气感 */
    try {
      if (!cue.noiseBuf) {
        var len = Math.floor(ctx.sampleRate * 1.5);
        cue.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        var ch = cue.noiseBuf.getChannelData(0);
        for (var n = 0; n < len; n++) ch[n] = Math.random() * 2 - 1;
      }
      var ns = ctx.createBufferSource(); ns.buffer = cue.noiseBuf; ns.loop = true;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(f0 * 2, t0);
      if (f1 !== f0) bp.frequency.exponentialRampToValueAtTime(f1 * 2, t0 + dur * 0.9);
      var ng = ctx.createGain(); ng.gain.value = 0.05;
      ns.connect(bp); bp.connect(ng); ng.connect(g);
      ns.start(t0); ns.stop(t0 + dur + 0.05);
      nodes.push(ns);
    } catch (e) {}
    var rec = { g: g, nodes: nodes };
    cue.live.push(rec);
    nodes[0].onended = function () {
      var ix = cue.live.indexOf(rec);
      if (ix >= 0) cue.live.splice(ix, 1);
      try { g.disconnect(); } catch (e) {}
    };
  }
  function cueStopAll() {
    for (var i = 0; i < cue.live.length; i++) {
      var rec = cue.live[i];
      for (var j = 0; j < rec.nodes.length; j++) { try { rec.nodes[j].stop(); } catch (e) {} }
      try { rec.g.disconnect(); } catch (e) {}
    }
    cue.live = [];
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
  }
  function cueVibrate(kind, sec) {
    if (!navigator.vibrate) return;
    if (kind === 'holdIn') { try { navigator.vibrate(45); } catch (e) {} return; }
    if (kind === 'holdOut') return;
    var total = Math.round(sec * 1000 * 0.85), n = 5, pause = 110, i;
    var wsum = n * (n + 1) / 2, unit = (total - (n - 1) * pause) / wsum;
    if (unit < 25) { try { navigator.vibrate(Math.min(220, total)); } catch (e) {} return; }
    var pat = [];
    for (i = 0; i < n; i++) {
      pat.push(Math.round(unit * ((kind === 'inhale') ? (i + 1) : (n - i))));
      if (i < n - 1) pat.push(pause);
    }
    try { navigator.vibrate(pat); } catch (e) {}
  }
  function cuePhase(phase) {
    if (!playing || !phase || !phase.meta) return;
    var key = phase.meta.key, sec = phase.seconds;
    if (cueVibOn()) cueVibrate(key, sec);
    if (!cueOn()) return;
    if ((key === 'holdIn' || key === 'holdOut') && !cuePadOn()) return;
    cueTone(key, sec);
  }
  function renderCueVolState() {
    var vr = $('#med-cue-volrow');
    if (vr) vr.classList.toggle('off', !cueOn());
  }

  /* ---------- 时长 / 选项 ---------- */
  function getSelectedDuration() {
    var on = document.querySelector('#med-dur-row .med-seg.on');
    var v = on ? on.getAttribute('data-dur') : '15';
    if (v === 'custom') {
      var m = parseInt(($('#med-custom-min').value || ''), 10);
      if (!(m >= 1 && m <= 180)) m = 15;
      return m * 60;
    }
    return (+v) * 60;
  }
  function bellOn() { var t = $('#med-bell-toggle'); return t ? t.checked : true; }
  function volume() {
    var v = parseInt(($('#med-vol').value || '70'), 10);
    return Math.max(0, Math.min(100, isNaN(v) ? 70 : v)) / 100;
  }
  function restoreOpts() {
    var i, id = lsGet(LS_SOUND, 'rain');
    for (i = 0; i < SOUNDS.length; i++) if (SOUNDS[i].id === id) { cur = i; break; }
    var dur = lsGet(LS_DUR, '15');
    var segs = document.querySelectorAll('#med-dur-row .med-seg[data-dur]');
    for (i = 0; i < segs.length; i++) {
      segs[i].classList.toggle('on', segs[i].getAttribute('data-dur') === dur);
    }
    var cm = $('#med-custom-min');
    cm.hidden = (dur !== 'custom');
    cm.value = lsGet(LS_CUSTOM, '10');
    $('#med-custom-go').hidden = (dur !== 'custom');
    $('#med-bell-toggle').checked = lsGet(LS_BELL, '1') === '1';
    $('#med-vol').value = lsGet(LS_VOL, '70');
    var cueT = $('#med-cue-toggle'); if (cueT) cueT.checked = lsGet(LS_CUE, '0') === '1';
    var cueV = $('#med-cue-vol'); if (cueV) cueV.value = lsGet(LS_CUE_VOL, '45');
    var cueP = $('#med-cue-pad'); if (cueP) cueP.checked = lsGet(LS_CUE_PAD, '1') === '1';
    var cueVb = $('#med-cue-vib'); if (cueVb) cueVb.checked = lsGet(LS_CUE_VIB, '0') === '1';
    var vibItem = $('#med-cue-vib-item');
    if (vibItem && !navigator.vibrate) vibItem.style.display = 'none';
    renderCueVolState();
    breathId = lsGet(LS_BREATH, 'off');
    if (breathId !== 'off' && !breathPattern()) breathId = 'off';
    renderBreathSelection();
    resetBreathPreview();
  }

  /* ---------- 播放控制 ---------- */
  function updatePlayBtn() {
    $('#med-play').innerHTML = playing ? SVG_PAUSE : SVG_PLAY;
  }
  function showTime(sec) { $('#med-clock').textContent = fmt(sec); }

  function getRemaining() {
    var b = bridge();
    if (b) {
      try {
        var r = b.medGetRemaining();
        return (typeof r === 'number') ? r : -1;
      } catch (e) { return -1; }
    }
    /* 降级：本地计算 */
    if (!playing && !fb.paused) return -1;
    if (fb.paused) return Math.ceil(fb.remainMs / 1000);
    return Math.max(0, Math.ceil((fb.endAt - Date.now()) / 1000));
  }

  function startPlayback(secs) {
    var s = SOUNDS[cur];
    totalSec = secs;
    expectDone = true;
    seenActive = false;
    var b = bridge();
    if (b) {
      try {
        b.medStart(s.asset || '', INTERVAL_BELL_ASSET, END_BELL_ASSET,
          totalSec, bellOn() ? INTERVAL_SEC : 0, volume(),
          '打坐冥想 · ' + s.name);
      } catch (e) {}
    } else {
      fbStart(s, totalSec);
    }
    playing = true;
    sess.base = 0; sess.since = Date.now();
    updatePlayBtn();
    showTime(totalSec);
    startPoll();
    startBreath();
    acquireWakeLock();
  }

  function togglePlay() {
    if (playing) {
      /* 暂停 */
      var b = bridge();
      if (b) { try { b.medPause(); } catch (e) {} }
      else fbPause();
      playing = false;
      if (sess.since) { sess.base += Date.now() - sess.since; sess.since = 0; }
      pauseBreath();
      releaseWakeLock();
      updatePlayBtn();
    } else if (expectDone && seenActive) {
      /* 暂停后继续：原生直接 resume；降级恢复计时 */
      var b2 = bridge();
      if (b2) { try { b2.medResume(); } catch (e) {} }
      else fbResume();
      playing = true;
      sess.since = Date.now();
      updatePlayBtn();
      startPoll();
      resumeBreath();
      acquireWakeLock();
    } else {
      startPlayback(getSelectedDuration());
    }
  }

  function startPoll() {
    stopPoll();
    pollId = setInterval(function () {
      var r = getRemaining();
      if (r >= 0) {
        seenActive = true;
        showTime(r);
      } else if (r === -1 && expectDone && seenActive) {
        onSessionDone();
      }
    }, 1000);
  }
  function stopPoll() { if (pollId) { clearInterval(pollId); pollId = 0; } }

  function onSessionDone() {
    expectDone = false;
    seenActive = false;
    playing = false;
    sessReset();
    stopPoll();
    stopBreath();
    releaseWakeLock();
    showTime(0);
    updatePlayBtn();
    try {
      if (window.Practice && typeof window.Practice.addRecord === 'function') {
        window.Practice.addRecord('dazuo', totalSec);
      }
    } catch (e) {}
    var sub = $('#med-done-sub');
    sub.textContent = SOUNDS[cur].name + ' · ' + fmt(totalSec).replace(':', '分') + '秒';
    $('#med-done').hidden = false;
  }

  function back() {
    var b = bridge();
    if (b) { try { b.medStop(); } catch (e) {} }
    else fbStop();
    playing = false;
    sessReset();
    expectDone = false;
    seenActive = false;
    stopPoll();
    stopBreath();
    releaseWakeLock();
    updatePlayBtn();
    $('#med-done').hidden = true;
    $('#meditation-view').hidden = true;
  }

  /* ---------- 降级播放（HTML5 Audio） ---------- */
  function fbClearTimers() {
    if (fb.bellTimer) { clearTimeout(fb.bellTimer); fb.bellTimer = 0; }
    if (fb.endTimer) { clearTimeout(fb.endTimer); fb.endTimer = 0; }
  }
  function fbStart(s, secs) {
    fbClearTimers();
    fb.paused = false;
    fb.elapsedMs = 0;
    fb.startedAt = Date.now();
    fb.endAt = Date.now() + secs * 1000;
    if (s.loop) {
      /* 2026-10-11 fix: 复用单个 Audio 对象，iOS 上频繁 new Audio + play 会被静默拦截 */
      if (!fb.ambient) {
        fb.ambient = new Audio();
        fb.ambient.loop = true;
        /* 音频载入出错时重新 load 一次（同一 src 只重试一次），防瞬时失败变永久无声（2026-10-19 修） */
        fb.ambient.addEventListener('error', function () {
          if (!fb.ambient.src || fb.retriedFor) return;
          fb.retriedFor = fb.ambient.src;
          /* 换破缓存参数重试一次：同 URL 重 load 可能再命中发版窗口期被污染的缓存（404/截断），2026-10-25 修 */
          try { fb.ambient.src = fb.retriedFor + (fb.retriedFor.indexOf('?') >= 0 ? '&r=1' : '?r=1'); } catch (err0) {}
          try { fb.ambient.load(); } catch (err) {}
          try { var pr = fb.ambient.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (err2) {}
        });
      } else {
        try { fb.ambient.pause(); } catch (e0) {}
      }
      var curSrc = '';
      try { curSrc = fb.ambient.src || ''; } catch (e1) {}
      /* 只有声音真的变了才换 src，避免重复 load */
      if (curSrc.indexOf(s.loop) === -1) {
        fb.retriedFor = '';
        fb.ambient.src = s.loop;
        try { fb.ambient.load(); } catch (e2) {}
      }
      fb.ambient.volume = volume();
      try {
        var p = fb.ambient.play();
        if (p && p.catch) p.catch(function () {
          /* iOS 偶发拦截，重试一次 */
          try { var p2 = fb.ambient.play(); if (p2 && p2.catch) p2.catch(function () {}); } catch (e3) {}
        });
      } catch (e) {}
      // 媒体卡片：iOS 上必须在 play() 后设，否则灵动岛不出（2026-10-11 回滚 v1.1.5 的顺序调整；v1.3.4 试过 play 前 setMetadata 会导致灵动岛消失，已回滚）
      try {
        if (window.WuriMediaSession && s.name) {
          window.WuriMediaSession.bindAudio(fb.ambient, {
            title: '打坐 · ' + s.name,
            artist: '戊日不上香',
            album: '打坐冥想'
          });
        }
      } catch (e2) {}
    } else {
      /* 无声·静室：停掉背景音 */
      try { if (fb.ambient) { fb.ambient.pause(); } } catch (e4) {}
    }
    if (bellOn()) {
      /* 预创建间隔磬 Audio（用户手势上下文，iOS 不拦截） */
      try { if (!fb.bellAudio) fb.bellAudio = new Audio(INTERVAL_BELL_LOOP); } catch (e3) {}
      fbArmBell(INTERVAL_SEC * 1000);
    }
    fb.endTimer = setTimeout(fbFinish, secs * 1000);
  }
  function fbArmBell(ms) {
    fb.bellTimer = setTimeout(function () {
      try {
        /* iOS 兼容：复用 fbStart 时预创建的 Audio（用户手势上下文），避免 setTimeout 新建被拦截（2026-10-10 fix #1） */
        var a = fb.bellAudio;
        if (!a) { a = new Audio(INTERVAL_BELL_LOOP); fb.bellAudio = a; }
        try { a.currentTime = 0; } catch (e2) {}
        a.volume = volume();
        var p = a.play(); if (p && p.catch) p.catch(function () {});
      } catch (e) {}
      fb.elapsedMs = Date.now() - fb.startedAt;
      var nextIn = INTERVAL_SEC * 1000 - (fb.elapsedMs % (INTERVAL_SEC * 1000));
      var remain = fb.endAt - Date.now();
      if (nextIn < remain - 5000) fbArmBell(nextIn);
    }, ms);
  }
  function fbPause() {
    if (!fb.endAt || fb.paused) return;
    fb.remainMs = Math.max(0, fb.endAt - Date.now());
    fb.elapsedMs = Date.now() - fb.startedAt;
    fb.paused = true;
    fbClearTimers();
    try { if (fb.ambient) fb.ambient.pause(); } catch (e) {}
  }
  function fbResume() {
    if (!fb.paused) return;
    fb.paused = false;
    fb.startedAt = Date.now() - fb.elapsedMs;
    fb.endAt = Date.now() + fb.remainMs;
    try { if (fb.ambient) { var p = fb.ambient.play(); if (p && p.catch) p.catch(function () {}); } } catch (e) {}
    if (bellOn()) {
      var nextIn = INTERVAL_SEC * 1000 - (fb.elapsedMs % (INTERVAL_SEC * 1000));
      if (nextIn < fb.remainMs - 5000) fbArmBell(nextIn);
    }
    fb.endTimer = setTimeout(fbFinish, fb.remainMs);
  }
  function fbFinish() {
    fbClearTimers();
    var a = fb.ambient;
    fb.ambient = null;
    /* 环境音 3 秒淡出 → 结束铃 → 显示完成 */
    if (a) {
      var steps = 15, i = 0, v0 = a.volume;
      var iv = setInterval(function () {
        i++;
        try { a.volume = Math.max(0, v0 * (1 - i / steps)); } catch (e) {}
        if (i >= steps) {
          clearInterval(iv);
          try { a.pause(); } catch (e) {}
          fbPlayEndBell();
        }
      }, 200);
    } else {
      fbPlayEndBell();
    }
  }
  function fbPlayEndBell() {
    try {
      var b = new Audio(END_BELL_LOOP);
      b.volume = volume();
      b.addEventListener('ended', function () { onSessionDone(); });
      var p = b.play(); if (p && p.catch) p.catch(function () { onSessionDone(); });
      /* 兜底：49 秒 + 缓冲 */
      setTimeout(function () { if (expectDone) onSessionDone(); }, 55000);
    } catch (e) { onSessionDone(); }
  }
  function fbStop() {
    fbClearTimers();
    fb.paused = false;
    fb.endAt = 0;
    try { if (fb.ambient) { fb.ambient.pause(); fb.ambient = null; } } catch (e) { fb.ambient = null; }
  }

  /* ---------- 开关 ---------- */
  function open() {
    /* 未构建守卫：init 未跑完（如页面刚加载即被调起）时先补构建，
       否则 setPage 会因 bgEls 为空抛错、视图打不开（2026-10-25 冒烟竞态实证） */
    if (!bgEls.length) init();
    $('#med-done').hidden = true;
    $('#meditation-view').hidden = false;
    restoreOpts();
    /* 显示当前声音 */
    setPage(cur, true);
    totalSec = getSelectedDuration();
    showTime(totalSec);
    playing = false;
    expectDone = false;
    seenActive = false;
    updatePlayBtn();
    resetBreathPreview();
  }

  var inited = false;
  function init() {
    if (inited) return; /* 幂等：open() 守卫可能抢先 init，bootstrap 再调不得重复构建/绑事件 */
    inited = true;
    build();
    restoreOpts();
    $('#med-back').addEventListener('click', back);
    $('#med-play').addEventListener('click', togglePlay);
    var segs = document.querySelectorAll('#med-dur-row .med-seg[data-dur]');
    for (var i = 0; i < segs.length; i++) {
      (function (el) {
        el.addEventListener('click', function () {
          for (var j = 0; j < segs.length; j++) segs[j].classList.remove('on');
          el.classList.add('on');
          var v = el.getAttribute('data-dur');
          lsSet(LS_DUR, v);
          var cm = $('#med-custom-min'), go = $('#med-custom-go');
          if (v === 'custom') { cm.hidden = false; go.hidden = false; cm.focus(); }
          else {
            cm.hidden = true; go.hidden = true;
            var nd = getSelectedDuration();
            if (playing) startPlayback(nd);
            else { totalSec = nd; showTime(totalSec); }
          }
        });
      })(segs[i]);
    }
    $('#med-custom-min').addEventListener('input', function () {
      lsSet(LS_CUSTOM, this.value);
      if (!playing) { totalSec = getSelectedDuration(); showTime(totalSec); }
    });
    /* 自选开始键：未播则开始，播放中则从新时长重计 */
    $('#med-custom-go').addEventListener('click', function () {
      var cm = $('#med-custom-min');
      if (cm) cm.blur();
      startPlayback(getSelectedDuration());
    });
    $('#med-custom-min').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.blur();
        startPlayback(getSelectedDuration());
      }
    });
    $('#med-bell-toggle').addEventListener('change', function () {
      lsSet(LS_BELL, this.checked ? '1' : '0');
    });
    $('#med-vol').addEventListener('input', function () {
      lsSet(LS_VOL, this.value);
      var v = volume();
      var b = bridge();
      if (b && typeof b.medSetVolume === 'function') {
        try { b.medSetVolume(v); } catch (e) {}
      }
      if (fb.ambient) { try { fb.ambient.volume = v; } catch (e) {} }
    });
    $('#med-cue-toggle').addEventListener('change', function () {
      lsSet(LS_CUE, this.checked ? '1' : '0');
      renderCueVolState();
      if (this.checked) cueEnsureCtx();
      else cueStopAll();
    });
    $('#med-cue-vol').addEventListener('input', function () {
      lsSet(LS_CUE_VOL, this.value);
      if (cue.master && cue.ctx) {
        try { cue.master.gain.setTargetAtTime(cueMasterGain(), cue.ctx.currentTime, 0.03); } catch (e) {}
      }
    });
    $('#med-cue-pad').addEventListener('change', function () {
      lsSet(LS_CUE_PAD, this.checked ? '1' : '0');
    });
    $('#med-cue-vib').addEventListener('change', function () {
      lsSet(LS_CUE_VIB, this.checked ? '1' : '0');
      if (!this.checked && navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
    });
    $('#med-again').addEventListener('click', function () {
      $('#med-done').hidden = true;
      startPlayback(getSelectedDuration());
    });
    $('#med-done-back').addEventListener('click', back);
    document.addEventListener('visibilitychange', function () {
      /* 呼吸圈只是视觉引导：页面隐藏时冻结相位，冥想计时与音频不暂停；
         回到前台且冥想仍在播放时，从冻结处续跑。常亮锁会被系统在页面隐藏时
         自动回收，回前台仍在播放则重新申请（acquireWakeLock）。 */
      if (document.hidden) { if (playing) pauseBreath(); }
      else if (playing) { resumeBreath(); acquireWakeLock(); }
    });
    window.addEventListener('resize', function () {
      // 无滚动方案：resize 无需处理
    });
  }

  /* 冒烟专用钩子（非产品 API）：缩短间隔磬周期以构造提示让行场景 + 读引导引擎状态 */
  window.__medTest = {
    setBellIntervalSec: function (s) { if (s && s > 0) INTERVAL_SEC = s; },
    cueState: function () {
      return {
        on: cueOn(), pad: cuePadOn(), vib: cueVibOn(), vol: cueVol(),
        ctx: cue.ctx ? cue.ctx.state : 'none',
        master: (cue.master ? cue.master.gain.value : -1),
        live: cue.live.length, elapsedMs: Math.round(sessElapsedMs())
      };
    }
  };

  /* 物理返回键（MainActivity 经 evaluateJavascript 调用） */
  window.__wuriOnBack = function () {
    var v = $('#meditation-view');
    if (v && !v.hidden) { back(); return true; }
    return false;
  };

  document.addEventListener('DOMContentLoaded', init);

  return {
    open: open,
    close: back,
    back: back
  };
})();
