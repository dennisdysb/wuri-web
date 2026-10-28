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
  var LS_CUE_VIB = 'wuri_med_cuevib';
  /* 冥想批（2026-10-28，对标 Insight Timer/潮汐）：混音配方、场景预设、拨珠计数。
   * 新键全部已登记 account.js 同步表（冥想设置同步口径）：
   * wuri_med_mix / wuri_med_mix_recipes / wuri_med_presets / wuri_beads_records / wuri_beads_cfg。 */
  var LS_MIX = 'wuri_med_mix';
  var LS_MIX_RECIPES = 'wuri_med_mix_recipes';
  var LS_PRESETS = 'wuri_med_presets';
  var LS_BEADS_RECORDS = 'wuri_beads_records';
  var LS_BEADS_CFG = 'wuri_beads_cfg';
  var MIX_MAX_TRACKS = 4; /* 多轨同播上限（移动端解码/耗电考量，对标潮汐混音） */

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
    /* 切场景即清零上一场景全部音频（2026-10-28 用户确认口径，见 stopSceneAudio）：
     * 先硬停弃置，再按新场景口径决定续播——非混音会话换上新场景声景（静室无声）；
     * 混音会话各轨已弃置，由 mixPlayAll 按原选轨重建续播（静室时其内部闸口拦下、
     * 保持全静）。暂停态切场景同样清零，恢复时按当前场景重建（见 fbResume）。 */
    stopSceneAudio();
    if (playing && !mixMode()) {
      var rem = getRemaining();
      if (rem > 0) startPlayback(rem);
    } else if (playing && mixSession) {
      mixPlayAll();
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
    /* 呼吸态布局类：舞台与圈径口径随型态显隐切换（meditation.css），纯计时态不挂此列 */
    var view = $('#meditation-view');
    if (view) view.classList.toggle('med-breathing', !!breathPattern());
    /* 圈径按舞台实测重算；浮层若开着，限高基准随呼吸态变化一并重算 */
    fitBreathCircle();
    if (typeof mixFitPanel === 'function') mixFitPanel();
    renderKeySubs();
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
   * 2026-10-27 改版：用户真机反馈 v179 的 WebAudio 合成滑音提示音「特别不好听」，
   * 合成引擎整体删除，改为真人语音口令——素材为诵经女声（Fish 克隆声线）单字
   * 录音 cue-xi/cue-hu/cue-ting.mp3（吸/呼/停，头尾静音裁紧、峰值归一 -3dB）。
   * 相位起点播对应词：吸气→「吸」、呼气→「呼」、吸后屏息与呼后屏息→「停」。
   * 由相位调度同点触发（beginBreathPhase），不另起时钟；口令走独立 Audio 通道，
   * 与环境音/间隔磬的元素互不干扰；「引导音量」滑杆直接映射播放元素 volume。
   * 让行（沿 v179 已验口径）：间隔磬将落在口令发声窗口内（或刚鸣 <400ms）时，
   * 本相位口令跳过、不叠响、不延迟补响——间隔磬优先。振动是独立无声通道，
   * 不受让行影响。暂停/停止即停播并回零、不留尾音。
   * 会话已播时长（sess）只为预测间隔磬时刻：开始/重开清零，暂停折算、继续接续，
   * 与原生服务/降级定时器同口径（两路间隔磬都按已播时长每 INTERVAL_SEC 一鸣）。
   * 2026-10-27 二次换素材：首版单字（各约 0.54s）真机评「话不自然」，换 C 单字
   * 改良版（放慢 0.70–0.72＋省略号柔化收尾＋淡入淡出，0.57–0.86s）同名替换，
   * 引用 ?v=2、MED_CACHE 升 v4 强制全端换新；引擎逻辑零改动。 */
  var CUE_VOICE_SRC = {
    inhale: 'audio/meditation/cue-xi.mp3?v=2',
    exhale: 'audio/meditation/cue-hu.mp3?v=2',
    holdIn: 'audio/meditation/cue-ting.mp3?v=2',
    holdOut: 'audio/meditation/cue-ting.mp3?v=2'
  };
  var CUE_WORD = { inhale: '吸', exhale: '呼', holdIn: '停', holdOut: '停' };
  var cue = { els: {}, last: '', plays: 0, skips: 0 };
  var sess = { base: 0, since: 0 };
  function sessElapsedMs() { return sess.since ? sess.base + (Date.now() - sess.since) : sess.base; }
  function sessReset() { sess.base = 0; sess.since = 0; }
  function cueOn() { var t = $('#med-cue-toggle'); return t ? t.checked : false; }
  function cueVibOn() { var t = $('#med-cue-vib'); return t ? t.checked : false; }
  function cueVol() {
    var el = $('#med-cue-vol');
    var v = parseInt((el ? el.value : '45'), 10);
    return Math.max(0, Math.min(100, isNaN(v) ? 45 : v)) / 100;
  }
  function cueEnsureEls() {
    /* 预加载三条口令（独立通道，与环境音/磬的 Audio 元素分开）：首次开启引导
       或恢复出已开启状态时调用，preload=auto 拉全量（每条约 5KB）。 */
    var keys = ['inhale', 'exhale', 'holdIn'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!cue.els[k]) {
        try {
          var a = new Audio(CUE_VOICE_SRC[k]);
          a.preload = 'auto';
          cue.els[k] = a;
        } catch (e) {}
      }
    }
    if (cue.els.holdIn && !cue.els.holdOut) cue.els.holdOut = cue.els.holdIn;
    return cue.els;
  }
  function cueBellClash(durMs) {
    if (!bellOn() || !sess.since) return false;
    var iv = INTERVAL_SEC * 1000, el = sessElapsedMs();
    var into = el % iv, until = iv - into;
    if (until <= durMs + 150) return true;      /* 磬将落在提示窗口内 */
    if (into <= 400 && el >= iv) return true;   /* 磬刚鸣，衰减最响段不叠 */
    return false;
  }
  function cueVoice(key) {
    var a = cueEnsureEls()[key];
    if (!a) return;
    /* 让行窗口按口令实长（未载完时以 800ms 保守估），与 v179 同口径判定 */
    var durMs = (a.duration && isFinite(a.duration) && a.duration > 0) ? a.duration * 1000 : 800;
    if (cueBellClash(durMs)) { cue.skips++; return; }
    try {
      a.pause();
      try { a.currentTime = 0; } catch (e) {}
      a.volume = cueVol();
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
      cue.last = CUE_WORD[key] || '';
      cue.plays++;
    } catch (e) {}
  }
  function cueStopAll() {
    for (var k in cue.els) {
      var a = cue.els[k];
      if (!a) continue;
      try { a.pause(); } catch (e) {}
      try { a.currentTime = 0; } catch (e) {}
    }
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
    cueVoice(key);
  }
  function renderCueVolState() {
    var vr = $('#med-cue-volrow');
    if (vr) vr.classList.toggle('off', !cueOn());
  }

  /* ---------- 冥想统计（对标 Insight Timer Stats & milestones） ----------
   * 数据源＝修行打卡记录 wuri_daka_records 中 hid='dazuo' 的条目（结束自动记入
   * 既有口径不变）；连续天数按「有打坐记录的自然日」单算，不与其它习惯混。
   * 里程碑：累计 10/50/100 小时、连续 7/30 天，结束页在跨越当次提示。 */
  var MILE_HOURS = [10, 50, 100];
  var MILE_STREAK = [7, 30];
  function lsJson(k, d) {
    try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; }
    catch (e) { return d; }
  }
  function dateStrOf(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function medStats() {
    var recs = lsJson('wuri_daka_records', []);
    var total = 0, sessions = 0, days = {}, i, r;
    if (Array.isArray(recs)) {
      for (i = 0; i < recs.length; i++) {
        r = recs[i];
        if (!r || r.hid !== 'dazuo') continue;
        total += (r.secs || 0);
        sessions++;
        if (r.date) days[r.date] = true;
      }
    }
    var streak = 0, d = new Date();
    if (!days[dateStrOf(d)]) d.setDate(d.getDate() - 1);
    while (days[dateStrOf(d)]) { streak++; d.setDate(d.getDate() - 1); }
    return { totalSecs: total, sessions: sessions, streak: streak };
  }
  function fmtDurZh(secs) {
    secs = Math.max(0, Math.floor(secs || 0));
    var h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    if (h > 0) return h + ' 小时' + (m > 0 ? ' ' + m + ' 分' : '');
    if (m > 0) return m + ' 分钟';
    return secs + ' 秒';
  }
  function crossedMilestones(before, after) {
    var out = [], i;
    for (i = 0; i < MILE_HOURS.length; i++) {
      if (before.totalSecs < MILE_HOURS[i] * 3600 && after.totalSecs >= MILE_HOURS[i] * 3600) {
        out.push('累计打坐满 ' + MILE_HOURS[i] + ' 小时');
      }
    }
    for (i = 0; i < MILE_STREAK.length; i++) {
      if (before.streak < MILE_STREAK[i] && after.streak >= MILE_STREAK[i]) {
        out.push('连续打坐 ' + MILE_STREAK[i] + ' 天');
      }
    }
    return out;
  }
  function renderMedStats() {
    var el = $('#med-stats');
    if (!el) return;
    var st = medStats();
    if (!st.sessions) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = '连续 ' + st.streak + ' 天 · 累计 ' + fmtDurZh(st.totalSecs) + ' · 共 ' + st.sessions + ' 次';
  }
  /* 结束页寄语：取自每日一诗池（158 首，全部出自星空／修道游仙／宫观步虚／静观
   * 四题口径，与 App 内容相关性口径一致）；按「日期＋累计次数」定种，同日同次不换。 */
  function pickDoneQuote(seed) {
    try {
      var dd = window.WURI_POEMS_DATA || window.WURI_POEMS_BUNDLED;
      var list = dd && Array.isArray(dd.poems) ? dd.poems : null;
      if (!list || !list.length) return null;
      var p = list[Math.abs(seed | 0) % list.length];
      if (!p || !Array.isArray(p.text) || !p.text.length) return null;
      var lines = p.text.slice(0, 2).join('');
      return { text: lines, from: '《' + (p.title || '') + '》· ' + (p.author || '') };
    } catch (e) { return null; }
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
    try { localStorage.removeItem('wuri_med_cuepad'); } catch (e) {}  /* 「屏息垫音」键随语音改版废弃，顺手清掉 */
    if (cueT && cueT.checked) cueEnsureEls();   /* 已开启引导：进页即预加载口令 */
    var cueVb = $('#med-cue-vib'); if (cueVb) cueVb.checked = lsGet(LS_CUE_VIB, '0') === '1';
    var vibItem = $('#med-cue-vib-item');
    if (vibItem && !navigator.vibrate) vibItem.style.display = 'none';
    renderCueVolState();
    breathId = lsGet(LS_BREATH, 'off');
    if (breathId !== 'off' && !breathPattern()) breathId = 'off';
    renderBreathSelection();
    resetBreathPreview();
  }

  /* ---------- 环境音混音（对标潮汐：多源叠放、各轨独立音量、配方可存） ----------
   * 素材＝App 既有 9 条环境音循环（loop-*.mp3，既往版本已上线、本批未引入外部
   * 新音频）。混音态（≥1 轨）走网页多轨引擎：每轨一个 Audio 元素、懒创建后复用
   * （沿「环境音 Audio 复用」口径）；会话计时/间隔磬/结束铃由本地定时器驱动。
   * 原生桥（WuBridge）只支持单音轨：单轨/无混音时仍走既有原生路，行为不变；
   * 混音时原生端环境音由网页层播放（前台/常亮下正常），计时磬铃不受影响。 */
  var mix = (function () {
    var m = lsJson(LS_MIX, null);
    return (m && m.tracks && typeof m.tracks === 'object') ? m : { tracks: {} };
  })();
  var mixEls = {};
  var mixSession = false;   /* 当前会话由混音网页引擎驱动 */
  var mixTick = 0;
  function saveMix() { lsSet(LS_MIX, JSON.stringify(mix)); }
  function mixMode() { return Object.keys(mix.tracks).length > 0; }
  function mixCount() { return Object.keys(mix.tracks).length; }
  function soundById(id) {
    for (var i = 0; i < SOUNDS.length; i++) if (SOUNDS[i].id === id) return SOUNDS[i];
    return null;
  }
  function mixEnsureEl(id) {
    var s = soundById(id);
    if (!s || !s.loop) return null;
    if (!mixEls[id]) {
      try {
        var a = new Audio();
        a.loop = true;
        a.preload = 'auto';
        a.src = s.loop;
        mixEls[id] = a;
      } catch (e) { return null; }
    }
    return mixEls[id];
  }
  function mixTrackVol(id) {
    var v = parseInt(mix.tracks[id], 10);
    v = Math.max(0, Math.min(100, isNaN(v) ? 70 : v));
    return (v / 100) * volume();
  }
  function mixApplyVolumes() {
    for (var id in mix.tracks) {
      var a = mixEls[id];
      if (a) { try { a.volume = mixTrackVol(id); } catch (e) {} }
    }
  }
  function mixPlayAll() {
    /* 静室闸口：当前场景为无声·静室（无 loop）时混音各轨一律不起播——
     * 「无声」名副其实（2026-10-28 口径）；切回有声场景时由 onSoundChanged 续播。 */
    if (!SOUNDS[cur].loop) return;
    for (var id in mix.tracks) {
      var a = mixEnsureEl(id);
      if (!a) continue;
      try {
        a.volume = mixTrackVol(id);
        if (a.paused) { var p = a.play(); if (p && p.catch) p.catch(function () {}); }
      } catch (e) {}
    }
  }
  function mixPauseAll() {
    for (var k in mixEls) { try { mixEls[k].pause(); } catch (e) {} }
  }
  function mixFadeOut(done) {
    var els = [], i, a;
    for (var k in mix.tracks) { a = mixEls[k]; if (a && !a.paused) els.push(a); }
    if (!els.length) { done(); return; }
    var v0 = els.map(function (x) { return x.volume; });
    var steps = 15, n = 0;
    var iv = setInterval(function () {
      n++;
      for (i = 0; i < els.length; i++) {
        try { els[i].volume = Math.max(0, v0[i] * (1 - n / steps)); } catch (e) {}
      }
      if (n >= steps) {
        clearInterval(iv);
        for (i = 0; i < els.length; i++) { try { els[i].pause(); } catch (e) {} }
        done();
      }
    }, 200);
  }
  /* --- 混音会话引擎（计时与磬铃本地驱动，与降级路同口径） --- */
  function mixStartTick() {
    mixStopTick();
    mixTick = setInterval(function () {
      showTime(Math.max(0, Math.ceil((fb.endAt - Date.now()) / 1000)));
    }, 500);
  }
  function mixStopTick() { if (mixTick) { clearInterval(mixTick); mixTick = 0; } }
  function mixStartSession(secs) {
    totalSec = secs;
    expectDone = true;
    seenActive = true;
    mixSession = true;
    fb.paused = false;
    fb.remainMs = 0;
    fb.elapsedMs = 0;
    fb.startedAt = Date.now();
    fb.endAt = Date.now() + secs * 1000;
    fbClearTimers();
    mixPlayAll();
    if (bellOn()) {
      try { if (!fb.bellAudio) fb.bellAudio = new Audio(INTERVAL_BELL_LOOP); } catch (e) {}
      fbArmBell(INTERVAL_SEC * 1000);
    }
    fb.endTimer = setTimeout(mixFinish, secs * 1000);
    playing = true;
    sess.base = 0; sess.since = Date.now();
    updatePlayBtn();
    showTime(totalSec);
    mixStartTick();
    startBreath();
    acquireWakeLock();
  }
  function mixPauseSession() {
    fb.remainMs = Math.max(0, fb.endAt - Date.now());
    fb.elapsedMs = Date.now() - fb.startedAt;
    fb.paused = true;
    fbClearTimers();
    mixStopTick();
    mixPauseAll();
  }
  function mixResumeSession() {
    fb.paused = false;
    fb.startedAt = Date.now() - fb.elapsedMs;
    fb.endAt = Date.now() + fb.remainMs;
    mixPlayAll();
    if (bellOn()) {
      var nextIn = INTERVAL_SEC * 1000 - (fb.elapsedMs % (INTERVAL_SEC * 1000));
      if (nextIn < fb.remainMs - 5000) fbArmBell(nextIn);
    }
    fb.endTimer = setTimeout(mixFinish, fb.remainMs);
    mixStartTick();
  }
  function mixFinish() {
    if (!expectDone) return;
    fbClearTimers();
    mixStopTick();
    mixFadeOut(function () { fbPlayEndBell(); });
  }
  function mixStopSession() {
    fbClearTimers();
    mixStopTick();
    mixSession = false;
    mixPauseAll();
  }
  /* 播放中改混音构成：会话引擎随之转换（单轨⇄混音），剩余时长不变 */
  function mixConvertIfPlaying() {
    if (!playing) return;
    var rem = getRemaining();
    if (rem <= 0) return;
    if (mixMode() && !mixSession) {
      var b = bridge();
      if (b) { try { b.medStop(); } catch (e) {} }
      fbStop();
      stopPoll();
      mixStartSession(rem);
      startBreath();
    } else if (!mixMode() && mixSession) {
      mixStopSession();
      startPlayback(rem);
    }
  }
  function mixHint(msg) {
    var h = $('#med-mix-hint');
    if (!h) return;
    h.textContent = msg || '';
    if (msg) setTimeout(function () { if (h.textContent === msg) h.textContent = ''; }, 2600);
  }
  function buildMixPanel() {
    var list = $('#med-mix-list');
    if (!list || list.children.length) { renderMixPanel(); return; }
    SOUNDS.forEach(function (s) {
      if (!s.loop) return;
      var row = document.createElement('div');
      row.className = 'med-mix-item';
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'med-mix-chip';
      chip.setAttribute('data-mix', s.id);
      chip.textContent = s.name;
      chip.addEventListener('click', function () { mixToggleTrack(s.id); });
      var vol = document.createElement('input');
      vol.type = 'range';
      vol.className = 'med-vol med-mix-vol';
      vol.min = '0'; vol.max = '100'; vol.value = '70';
      vol.setAttribute('data-mixvol', s.id);
      vol.setAttribute('aria-label', s.name + '音量');
      vol.addEventListener('input', function () {
        if (!(s.id in mix.tracks)) return;
        mix.tracks[s.id] = parseInt(vol.value, 10) || 0;
        saveMix();
        mixApplyVolumes();
      });
      row.appendChild(chip);
      row.appendChild(vol);
      list.appendChild(row);
    });
    renderMixPanel();
    renderMixRecipes();
  }
  function renderMixPanel() {
    var chips = document.querySelectorAll('#med-mix-list .med-mix-chip');
    for (var i = 0; i < chips.length; i++) {
      var id = chips[i].getAttribute('data-mix');
      chips[i].classList.toggle('on', id in mix.tracks);
    }
    var vols = document.querySelectorAll('#med-mix-list .med-mix-vol');
    for (var j = 0; j < vols.length; j++) {
      var vid = vols[j].getAttribute('data-mixvol');
      vols[j].value = (vid in mix.tracks) ? mix.tracks[vid] : 70;
      vols[j].disabled = !(vid in mix.tracks);
    }
    var tgl = $('#med-mix-toggle');
    if (tgl) tgl.checked = mixMode();
    var pcnt = $('#med-mix-panel-count');
    if (pcnt) pcnt.textContent = mixMode() ? '已选 ' + mixCount() + ' 轨' : '';
    renderKeySubs();
  }
  function mixPanelOpen() { var p = $('#med-mix-panel'); return !!p && !p.hidden; }

  /* ---------- 设置 sheet 管理（2026-10-28 改版：三键三 sheet） ----------
   * 主界面三键（呼吸/时长/调音台）各开一个底部 sheet，任一时刻只开一个、
   * 开新关旧；每 sheet 有收起钮＋点外可收，收起不影响播放状态。
   * 混音 sheet 沿 v276 机制（mixSetPanel 为其开关入口），此处统一调度。 */
  var SHEET_SEL = { breath: '#med-sheet-breath', dur: '#med-sheet-dur', mix: '#med-mix-panel' };
  var KEY_SEL = { breath: '#med-key-breath', dur: '#med-key-dur', mix: '#med-key-mix' };
  function sheetIsOpen(name) { var el = $(SHEET_SEL[name]); return !!el && !el.hidden; }
  function anySheetOpen() { return sheetIsOpen('breath') || sheetIsOpen('dur') || sheetIsOpen('mix'); }
  function syncSheetKey(name) {
    var key = $(KEY_SEL[name]); if (!key) return;
    var open = sheetIsOpen(name);
    key.classList.toggle('on', open);
    key.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function setSheet(name, open) {
    if (name === 'mix') { mixSetPanel(open); return; }
    if (open) { setSheet('mix', false); var other = (name === 'breath') ? 'dur' : 'breath'; setSheet(other, false); }
    var el = $(SHEET_SEL[name]); if (!el) return;
    el.hidden = !open;
    syncSheetKey(name);
    if (open) fitSheet(el);
  }
  function closeSheets() { setSheet('breath', false); setSheet('dur', false); setSheet('mix', false); }
  /* 大面板定位（2026-10-28 二轮真机反馈，用户口径优先于 v289「展开零挤压」）：
   * 三个 sheet 改为正经底部大面板——贴底、高度按内容自适应，下限约 52vh、
   * 上限约 82vh，顶边护栏只护页首顶栏一行（返回＋标题＋拨珠钮）不被盖。
   * 展开时覆盖下半部舞台与控制区属预期（覆盖≠挤压：圈与控制层的布局尺寸
   * 一律不动、收起后一切原样，fitBreathCircle 不因 sheet 开合重算）；内容超
   * 上限时面板 body 内部滚动。收起钮在头行常驻，点面板外露出的上半部区域
   * 也可收（document pointerdown 既有口径）；播放键展开时被面板覆盖点不到，
   * 「点播放键不误收」随之自然失效（预期，非缺陷）。 */
  function fitSheet(p) {
    if (!p || p.hidden) return;
    var ih = window.innerHeight;
    var bar = document.querySelector('.med-topbar');
    var guard = bar ? bar.getBoundingClientRect().bottom + 8 : 100;
    var maxH = Math.min(ih * 0.82, ih - guard);
    var minH = Math.min(ih * 0.52, maxH);
    p.style.bottom = '0px';
    p.style.maxHeight = maxH + 'px';
    p.style.minHeight = minH + 'px';
  }
  function fitSheets() { for (var k in SHEET_SEL) { var el = $(SHEET_SEL[k]); if (el && !el.hidden) fitSheet(el); } }
  function mixFitPanel() { var p = $('#med-mix-panel'); if (p && !p.hidden) fitSheet(p); }
  /* 收起只收面板：不动混音轨单与播放；键面状态同步（展开时「调音台」键呈 .on） */
  function mixSetPanel(open) {
    var p = $('#med-mix-panel'); if (!p) return;
    if (open) { setSheet('breath', false); setSheet('dur', false); }
    p.hidden = !open;
    syncSheetKey('mix');
    if (open) fitSheet(p);
  }
  /* 呼吸圈基径按舞台实测可用空间取（2026-10-28 改版）：舞台底边由控制层实测高
   * 界定（--med-controls-h 同步写回 CSS 变量）；基径＝min(屏宽−边距, 圆区高)/1.35，
   * 峰值恰塞圆区、谷值（×0.60）保下限 120 不失去存在感，短屏同此回落。 */
  function fitBreathCircle() {
    var view = $('#meditation-view'); if (!view || view.hidden) return;
    var controls = document.querySelector('.med-controls');
    if (controls) view.style.setProperty('--med-controls-h', controls.getBoundingClientRect().height + 'px');
    var box = $('#med-breath'); if (!box || box.hidden) return;
    var r = box.getBoundingClientRect();
    var peak = Math.min(view.clientWidth - 36, r.height - 8);
    var base = peak / 1.35;
    if (base > 380) base = 380;
    if (base < 120) base = 120;
    box.style.setProperty('--med-circ', base.toFixed(1) + 'px');
  }
  /* 三键键面小字摘要：呼吸＝当前方式名、时长＝当前档位、调音台＝已选轨数/未开启 */
  function renderKeySubs() {
    var bs = $('#med-key-breath-sub');
    if (bs) { var p = breathPattern(); bs.textContent = p ? p.name : '关闭'; }
    var ds = $('#med-key-dur-sub');
    if (ds) {
      var on = document.querySelector('#med-dur-row .med-seg.on');
      var v = on ? on.getAttribute('data-dur') : '15';
      if (v === 'custom') {
        var cmEl = $('#med-custom-min');
        var m = parseInt((cmEl ? cmEl.value : '') || '', 10);
        ds.textContent = '自选 ' + ((m >= 1 && m <= 180) ? m : 15) + '分钟';
      } else ds.textContent = v + '分钟';
    }
    var ms = $('#med-key-mix-sub');
    if (ms) ms.textContent = mixMode() ? '已选 ' + mixCount() + ' 轨' : '未开启';
  }
  function mixToggleTrack(id) {
    if (id in mix.tracks) {
      delete mix.tracks[id];
      var a = mixEls[id];
      if (a) { try { a.pause(); } catch (e) {} }
    } else {
      if (mixCount() >= MIX_MAX_TRACKS) { mixHint('最多同时混 ' + MIX_MAX_TRACKS + ' 轨'); renderMixPanel(); return; }
      mix.tracks[id] = 70;
      if (playing && mixSession) mixPlayAll();
    }
    saveMix();
    renderMixPanel();
    mixConvertIfPlaying();
  }
  function mixRecipes() {
    var r = lsJson(LS_MIX_RECIPES, []);
    return Array.isArray(r) ? r : [];
  }
  function renderMixRecipes() {
    var host = $('#med-mix-recipe-chips');
    if (!host) return;
    host.innerHTML = '';
    mixRecipes().forEach(function (rcp, idx) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'med-mix-recipe';
      chip.textContent = rcp.name;
      chip.addEventListener('click', function () {
        mix.tracks = {};
        for (var k in rcp.tracks) mix.tracks[k] = rcp.tracks[k];
        saveMix();
        renderMixPanel();
        if (playing && mixSession) { mixPauseAll(); mixPlayAll(); }
        mixConvertIfPlaying();
      });
      var del = document.createElement('span');
      del.className = 'med-mix-recipe-del';
      del.textContent = '✕';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        var list = mixRecipes();
        list.splice(idx, 1);
        lsSet(LS_MIX_RECIPES, JSON.stringify(list));
        renderMixRecipes();
      });
      chip.appendChild(del);
      host.appendChild(chip);
    });
  }

  /* ---------- 场景预设（对标 Insight Timer Preset：整组参数命名保存、一键开练） ---------- */
  var BUILTIN_PRESETS = [
    { name: '晨练', dur: { seg: '15' }, breath: 'awake', sound: 'forest', bell: true, cue: false, mix: null },
    { name: '午间小憩', dur: { seg: 'custom', min: 10 }, breath: 'coherent', sound: 'rain', bell: false, cue: false, mix: null },
    { name: '睡前', dur: { seg: 'custom', min: 20 }, breath: 'deep-calm', sound: 'night', bell: false, cue: false, mix: null }
  ];
  function userPresets() {
    var r = lsJson(LS_PRESETS, []);
    return Array.isArray(r) ? r : [];
  }
  function setDurSelection(seg, min) {
    var segs = document.querySelectorAll('#med-dur-row .med-seg[data-dur]');
    for (var i = 0; i < segs.length; i++) {
      segs[i].classList.toggle('on', segs[i].getAttribute('data-dur') === seg);
    }
    lsSet(LS_DUR, seg);
    var cm = $('#med-custom-min'), go = $('#med-custom-go');
    if (seg === 'custom') {
      cm.hidden = false; go.hidden = false;
      if (min) { cm.value = min; lsSet(LS_CUSTOM, String(min)); }
    } else { cm.hidden = true; go.hidden = true; }
    renderKeySubs();
  }
  function applyPreset(p) {
    if (!p) return;
    var idx = -1, i;
    for (i = 0; i < SOUNDS.length; i++) if (SOUNDS[i].id === p.sound) idx = i;
    if (idx >= 0 && idx !== cur) setPage(idx);
    mix.tracks = {};
    if (p.mix) { for (var k in p.mix) mix.tracks[k] = p.mix[k]; }
    saveMix();
    renderMixPanel();
    if (!playing) mixPauseAll();
    setDurSelection(p.dur && p.dur.seg ? p.dur.seg : '15', p.dur ? p.dur.min : null);
    selectBreath(p.breath || 'off');
    var bt = $('#med-bell-toggle');
    if (bt) { bt.checked = !!p.bell; lsSet(LS_BELL, p.bell ? '1' : '0'); }
    var ct = $('#med-cue-toggle');
    if (ct) {
      ct.checked = !!p.cue;
      lsSet(LS_CUE, p.cue ? '1' : '0');
      renderCueVolState();
      if (p.cue) cueEnsureEls();
    }
    startPlayback(getSelectedDuration());
  }
  function capturePreset(name) {
    var on = document.querySelector('#med-dur-row .med-seg.on');
    var seg = on ? on.getAttribute('data-dur') : '15';
    var p = {
      name: name,
      dur: { seg: seg },
      breath: breathId,
      sound: SOUNDS[cur].id,
      bell: bellOn(),
      cue: cueOn(),
      mix: mixMode() ? (function () { var o = {}; for (var k in mix.tracks) o[k] = mix.tracks[k]; return o; })() : null
    };
    if (seg === 'custom') p.dur.min = parseInt(($('#med-custom-min').value || '10'), 10) || 10;
    return p;
  }
  function renderPresetChips() {
    var host = $('#med-preset-chips');
    if (!host) return;
    host.innerHTML = '';
    BUILTIN_PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'med-breath-chip med-preset-chip';
      b.textContent = p.name;
      b.addEventListener('click', function () { applyPreset(p); });
      host.appendChild(b);
    });
    userPresets().forEach(function (p, idx) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'med-breath-chip med-preset-chip user';
      b.textContent = p.name;
      b.addEventListener('click', function () { applyPreset(p); });
      var del = document.createElement('span');
      del.className = 'med-mix-recipe-del';
      del.textContent = '✕';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        var list = userPresets();
        list.splice(idx, 1);
        lsSet(LS_PRESETS, JSON.stringify(list));
        renderPresetChips();
      });
      b.appendChild(del);
      host.appendChild(b);
    });
    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'med-breath-chip med-preset-chip med-preset-save';
    save.textContent = '＋ 存当前';
    save.addEventListener('click', function () {
      var name = '';
      try { name = window.prompt('预设名（如：晚课前）', ''); } catch (e) {}
      if (!name || !name.trim()) return;
      name = name.trim();
      var list = userPresets().filter(function (x) { return x.name !== name; });
      list.push(capturePreset(name));
      lsSet(LS_PRESETS, JSON.stringify(list));
      renderPresetChips();
    });
    host.appendChild(save);
  }

  /* ---------- 播放控制 ---------- */
  function updatePlayBtn() {
    $('#med-play').innerHTML = playing ? SVG_PAUSE : SVG_PLAY;
  }
  function showTime(sec) { $('#med-clock').textContent = fmt(sec); }

  function getRemaining() {
    if (mixSession) {
      if (fb.paused) return Math.ceil(fb.remainMs / 1000);
      return Math.max(0, Math.ceil((fb.endAt - Date.now()) / 1000));
    }
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
    if (mixMode()) { mixStartSession(secs); return; }
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
      if (mixSession) mixPauseSession();
      else {
        var b = bridge();
        if (b) { try { b.medPause(); } catch (e) {} }
        else fbPause();
      }
      playing = false;
      if (sess.since) { sess.base += Date.now() - sess.since; sess.since = 0; }
      pauseBreath();
      releaseWakeLock();
      updatePlayBtn();
    } else if (expectDone && seenActive) {
      /* 暂停后继续：混音走本地引擎；原生直接 resume；降级恢复计时 */
      if (mixSession) mixResumeSession();
      else {
        var b2 = bridge();
        if (b2) { try { b2.medResume(); } catch (e) {} }
        else fbResume();
      }
      playing = true;
      sess.since = Date.now();
      updatePlayBtn();
      if (!mixSession) startPoll();
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
    var statsBefore = medStats();
    expectDone = false;
    seenActive = false;
    playing = false;
    sessReset();
    stopPoll();
    if (mixSession) mixStopSession();
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
    /* 结束页：统计＋里程碑＋一句应景诗（每日一诗池，内容口径见 pickDoneQuote） */
    var statsAfter = medStats();
    var ds = $('#med-done-stats');
    if (ds) {
      ds.textContent = '本次 ' + fmtDurZh(totalSec) + ' · 累计 ' + fmtDurZh(statsAfter.totalSecs)
        + ' · 连续 ' + statsAfter.streak + ' 天';
    }
    var miles = crossedMilestones(statsBefore, statsAfter);
    var dm = $('#med-done-mile');
    if (dm) {
      if (miles.length) { dm.hidden = false; dm.textContent = '✦ 里程碑达成：' + miles.join(' · '); }
      else { dm.hidden = true; dm.textContent = ''; }
    }
    var dq = $('#med-done-quote');
    if (dq) {
      var nowD = new Date();
      var q = pickDoneQuote(statsAfter.sessions * 131 + nowD.getDate() * 7 + (nowD.getMonth() + 1) * 37);
      if (q) {
        dq.hidden = false;
        dq.textContent = q.text + ' —— ' + q.from;
      } else { dq.hidden = true; dq.textContent = ''; }
    }
    renderMedStats();
    $('#med-done').hidden = false;
  }

  function back() {
    if (mixSession) mixStopSession();
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
    document.body.classList.remove('med-open');   /* 退出冥想：底部导航恢复 */
  }

  /* ---------- 降级播放（HTML5 Audio） ---------- */
  function fbClearTimers() {
    if (fb.bellTimer) { clearTimeout(fb.bellTimer); fb.bellTimer = 0; }
    if (fb.endTimer) { clearTimeout(fb.endTimer); fb.endTimer = 0; }
  }
  /* 环境音起播（fbStart/fbResume 共用）：复用单个 Audio 对象（2026-10-11 fix，
   * iOS 上频繁 new Audio + play 会被静默拦截）；src 未变不重 load。 */
  function fbPlayAmbient(s) {
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
  }
  /* 切场景硬停（2026-10-28 用户确认口径）：切换场景这个动作本身即停掉并清零
   * 上一场景的全部音频——环境音元素停播弃置、混音各轨停播并弃置元素，不依赖
   * 结束会话/开始新会话才清。续播与否由调用方按新场景口径决定。 */
  function stopSceneAudio() {
    try { if (fb.ambient) fb.ambient.pause(); } catch (e) {}
    fb.ambient = null;
    fb.retriedFor = '';
    mixPauseAll();
    mixEls = {};
  }
  function fbStart(s, secs) {
    fbClearTimers();
    fb.paused = false;
    fb.elapsedMs = 0;
    fb.startedAt = Date.now();
    fb.endAt = Date.now() + secs * 1000;
    if (s.loop) {
      fbPlayAmbient(s);
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
    /* 暂停期间切过场景时 fb.ambient 已被清零（stopSceneAudio）：按当前场景重建
     * 起播；静室无 loop 则不起播——旧场景声不得在恢复时还魂（2026-10-28 修）。 */
    var s = SOUNDS[cur];
    if (s && s.loop) fbPlayAmbient(s);
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
    /* 沉浸口径：先挂 med-open 隐藏底部导航，再显视图——底栏在视图出现前已收，
     * 不产生可见跳动；舞台/圈径随后按全高实测落位（fitBreathCircle）。 */
    document.body.classList.add('med-open');
    $('#meditation-view').hidden = false;
    restoreOpts();
    renderMedStats();
    renderPresetChips();
    renderMixPanel();
    /* 显示当前声音 */
    setPage(cur, true);
    totalSec = getSelectedDuration();
    showTime(totalSec);
    playing = false;
    expectDone = false;
    seenActive = false;
    updatePlayBtn();
    resetBreathPreview();
    /* 进页回到主界面态：sheet 全收、圈径按当前舞台实测落位 */
    closeSheets();
    fitBreathCircle();
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
          renderKeySubs();
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
      renderKeySubs();
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
      mixApplyVolumes();
    });
    /* 混音开关/面板/配方 */
    buildMixPanel();
    renderPresetChips();
    $('#med-mix-toggle').addEventListener('change', function () {
      if (this.checked) {
        if (!mixMode()) {
          var s = SOUNDS[cur];
          if (s && s.loop) mix.tracks[s.id] = 80;
          saveMix();
        }
        mixSetPanel(true);
      } else {
        mix.tracks = {};
        saveMix();
        mixPauseAll();
        mixSetPanel(false);
        mixConvertIfPlaying();
      }
      renderMixPanel();
    });
    /* 三键开合各自 sheet（开新关旧在 setSheet 内统一处理） */
    $('#med-key-breath').addEventListener('click', function () {
      setSheet('breath', !sheetIsOpen('breath'));
    });
    $('#med-key-dur').addEventListener('click', function () {
      setSheet('dur', !sheetIsOpen('dur'));
    });
    $('#med-key-mix').addEventListener('click', function () {
      mixSetPanel(!mixPanelOpen());
    });
    $('#med-mix-close').addEventListener('click', function () {
      mixSetPanel(false);
    });
    $('#med-sheet-breath-close').addEventListener('click', function () {
      setSheet('breath', false);
    });
    $('#med-sheet-dur-close').addEventListener('click', function () {
      setSheet('dur', false);
    });
    /* 点 sheet 外收起（键面/播放键/主音量除外：键面自身走 click 开合、播放操作不打断） */
    document.addEventListener('pointerdown', function (e) {
      if (!anySheetOpen()) return;
      var v = $('#meditation-view'); if (!v || v.hidden) return;
      var t = e.target;
      if (t && t.closest && (t.closest('#med-mix-panel') || t.closest('#med-sheet-breath') ||
          t.closest('#med-sheet-dur') || t.closest('.med-key') ||
          t.closest('#med-play') || t.closest('#med-vol'))) return;
      closeSheets();
    });
    window.addEventListener('resize', function () { fitSheets(); fitBreathCircle(); });
    $('#med-mix-save').addEventListener('click', function () {
      if (!mixMode()) { mixHint('先选至少一轨再存配方'); return; }
      var name = '';
      try { name = window.prompt('配方名（如：雨夜读经）', ''); } catch (e) {}
      if (!name || !name.trim()) return;
      name = name.trim();
      var tracks = {};
      for (var k in mix.tracks) tracks[k] = mix.tracks[k];
      var list = mixRecipes().filter(function (x) { return x.name !== name; });
      list.push({ name: name, tracks: tracks });
      lsSet(LS_MIX_RECIPES, JSON.stringify(list));
      renderMixRecipes();
      mixHint('已存配方「' + name + '」');
    });
    $('#med-mix-clear').addEventListener('click', function () {
      mix.tracks = {};
      saveMix();
      mixPauseAll();
      renderMixPanel();
      mixConvertIfPlaying();
    });
    $('#med-cue-toggle').addEventListener('change', function () {
      lsSet(LS_CUE, this.checked ? '1' : '0');
      renderCueVolState();
      if (this.checked) cueEnsureEls();
      else cueStopAll();
    });
    $('#med-cue-vol').addEventListener('input', function () {
      lsSet(LS_CUE_VOL, this.value);   /* 口令播放时按当下值取 volume，滑杆即时生效于下一声 */
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

  /* 冒烟专用钩子（非产品 API）：缩短间隔磬周期以构造口令让行场景 + 读引导状态 */
  window.__medTest = {
    setBellIntervalSec: function (s) { if (s && s > 0) INTERVAL_SEC = s; },
    /* 冥想批冒烟：读混音/统计状态 + 以指定秒数直接走结束页路径 */
    mixState: function () {
      var els = [];
      for (var k in mixEls) {
        els.push({ id: k, paused: mixEls[k].paused, vol: Math.round(mixEls[k].volume * 100) });
      }
      return {
        mode: mixMode(), count: mixCount(),
        tracks: JSON.parse(JSON.stringify(mix.tracks)),
        session: mixSession, playing: playing, els: els
      };
    },
    medStats: function () { return medStats(); },
    /* 切场景清零冒烟：逐路音频实况（环境音/混音各轨/口令/磬） */
    audioState: function () {
      var amb = null;
      if (fb.ambient) {
        amb = { paused: fb.ambient.paused, src: (fb.ambient.src || '').split('/').pop(), vol: Math.round(fb.ambient.volume * 100) };
      }
      var mx = [];
      for (var k in mixEls) mx.push({ id: k, paused: mixEls[k].paused });
      var cu = [];
      for (var k2 in cue.els) { var a = cue.els[k2]; if (a) cu.push({ k: k2, paused: a.paused, ended: a.ended }); }
      return { ambient: amb, mixEls: mx, cueEls: cu,
               bell: fb.bellAudio ? { paused: fb.bellAudio.paused } : null,
               scene: SOUNDS[cur].id, playing: playing, pausedVis: !!fb.paused, mixSession: mixSession };
    },
    finishSession: function (secs) { if (secs && secs > 0) totalSec = secs; onSessionDone(); },
    cueState: function () {
      var nowPlaying = '';
      for (var k in cue.els) {
        var a = cue.els[k];
        if (a && !a.paused && !a.ended) nowPlaying = CUE_WORD[k] || '';
      }
      return {
        on: cueOn(), vib: cueVibOn(), vol: cueVol(),
        last: cue.last, plays: cue.plays, skips: cue.skips,
        nowPlaying: nowPlaying, live: nowPlaying ? 1 : 0,
        elapsedMs: Math.round(sessElapsedMs())
      };
    }
  };

  /* 物理返回键（MainActivity 经 evaluateJavascript 调用） */
  window.__wuriOnBack = function () {
    var bv = $('#beads-view');
    if (bv && !bv.hidden) { if (window.Beads) window.Beads.back(); return true; }
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

/* 戊日不上香 · 拨珠念诵计数（独门功能，无对标实现，按自家口径）
 * 点按进珠、108 一轮、记珠震动（默认开、单珠 50ms）、目标计数；统计单列（wuri_beads_records），
 * 不并入修行打卡记录、更不与静坐时长混算。入口与打坐并列：冥想页顶栏＋修行页卡。 */
var Beads = (function () {
  'use strict';
  var LS_R = 'wuri_beads_records';
  var LS_C = 'wuri_beads_cfg';
  var ROUND = 108;
  var session = 0;        /* 本次未保存计数 */
  var saved = true;       /* 本次是否已落盘 */
  var built = false;
  var dotEls = [];

  function $(s) { return document.querySelector(s); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function lsJson(k, d) {
    try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; }
    catch (e) { return d; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function cfg() {
    var c = lsJson(LS_C, null);
    if (!c || typeof c !== 'object') return { name: '', goal: 0, vib: true, vibSet: false };
    /* 记珠震动默认开（2026-10-28 用户口径）：旧版存量中 vib:false 且无 vibSet
     * 标记的，多为旧默认 false 被圣号/目标/提示转淡等顺带落盘「烘焙」出来的，
     * 并非用户在开关上亲手关闭——视作未表态、按新默认开；带 vibSet 标记的
     * false 是用户亲手关的，永远尊重。自本版起开关 change 必写 vibSet。 */
    if (c.vib === false && !c.vibSet) c.vib = true;
    return c;
  }
  function saveCfg(c) { lsSet(LS_C, JSON.stringify(c)); }
  function records() {
    var r = lsJson(LS_R, []);
    return Array.isArray(r) ? r : [];
  }
  function totals() {
    var recs = records(), t = todayStr(), today = 0, total = 0, rounds = 0, i, r;
    for (i = 0; i < recs.length; i++) {
      r = recs[i];
      if (!r || !(r.count > 0)) continue;
      total += r.count;
      rounds += Math.floor(r.count / ROUND);
      if (r.date === t) today += r.count;
    }
    return { today: today, total: total, rounds: rounds };
  }

  function build() {
    if (built) return;
    built = true;
    var ring = $('#bd-ring'), i, dot;
    if (ring) {
      for (i = 0; i < ROUND; i++) {
        dot = document.createElement('span');
        dot.className = 'bd-dot';
        dot.setAttribute('data-i', i);
        ring.appendChild(dot);
        dotEls.push(dot);
      }
      layoutDots();
    }
    var c = cfg();
    var nameEl = $('#bd-name');
    if (nameEl) {
      nameEl.value = c.name || '';
      nameEl.addEventListener('input', function () {
        var cc = cfg(); cc.name = nameEl.value; saveCfg(cc);
      });
    }
    var goalEl = $('#bd-goal');
    if (goalEl) {
      goalEl.value = String(c.goal || 0);
      goalEl.addEventListener('change', function () {
        var cc = cfg(); cc.goal = parseInt(goalEl.value, 10) || 0; saveCfg(cc);
        render();
      });
    }
    var vibEl = $('#bd-vib');
    if (vibEl) {
      vibEl.checked = !!c.vib;
      if (!navigator.vibrate) {
        var item = vibEl.closest ? vibEl.closest('.med-cue-item') : null;
        if (item) item.style.display = 'none';
      }
      vibEl.addEventListener('change', function () {
        var cc = cfg(); cc.vib = vibEl.checked; cc.vibSet = true; saveCfg(cc);
      });
    }
    var stage = $('#bd-stage');
    if (stage) stage.addEventListener('click', tap);
    var undo = $('#bd-undo');
    if (undo) undo.addEventListener('click', function () {
      if (session > 0) { session--; render(); }
    });
    var fin = $('#bd-finish');
    if (fin) fin.addEventListener('click', finish);
    var backBtn = $('#bd-back');
    if (backBtn) backBtn.addEventListener('click', back);
    window.addEventListener('resize', layoutDots);
  }
  function layoutDots() {
    var ring = $('#bd-ring');
    if (!ring || !dotEls.length) return;
    var R = ring.clientWidth / 2 - 7;
    if (!(R > 0)) return;
    for (var i = 0; i < dotEls.length; i++) {
      var ang = (i / ROUND) * Math.PI * 2 - Math.PI / 2;
      dotEls[i].style.transform =
        'translate(' + (Math.cos(ang) * R).toFixed(1) + 'px,' + (Math.sin(ang) * R).toFixed(1) + 'px)';
    }
  }
  function vibrate(pat) {
    if (!cfg().vib || !navigator.vibrate) return;
    try { navigator.vibrate(pat); } catch (e) {}
  }
  function render() {
    var c = cfg();
    var inRound = session % ROUND;
    var justFull = session > 0 && inRound === 0;
    var shown = justFull ? ROUND : inRound;
    var roundNo = Math.floor(session / ROUND) + (justFull ? 0 : 1);
    for (var i = 0; i < dotEls.length; i++) {
      dotEls[i].classList.toggle('on', justFull || i < inRound);
      dotEls[i].classList.toggle('cur', !justFull && i === inRound && session >= 0 && (inRound > 0 || session > 0));
    }
    var cnt = $('#bd-count'); if (cnt) cnt.textContent = shown;
    var rd = $('#bd-round');
    if (rd) rd.textContent = '第 ' + roundNo + ' 遍 · ' + shown + ' / ' + ROUND;
    var goal = c.goal || 0;
    var ss = $('#bd-session');
    if (ss) {
      ss.textContent = '本次 ' + session + (goal ? ' / 目标 ' + goal : '')
        + (goal && session >= goal ? ' · 目标达成' : '');
    }
    var t = totals();
    var pending = saved ? 0 : session;
    var st = $('#bd-stats');
    if (st) {
      st.textContent = '今日 ' + (t.today + pending) + ' · 累计 ' + (t.total + pending)
        + ' · ' + (t.rounds + Math.floor(session / ROUND)) + ' 遍';
    }
    var sub = $('#beads-entry-sub');
    if (sub) sub.textContent = '今日已诵 ' + (t.today + pending) + ' · 累计 ' + (t.total + pending);
  }
  /* 提示转淡：首次记数后加 .dim 并落 cfg（重进页面即淡态，仍在场可瞥见） */
  function dimHint() {
    var h = $('#bd-hint'); if (h) h.classList.add('dim');
    var c = cfg();
    if (!c.hintDim) { c.hintDim = true; saveCfg(c); }
  }
  function tap() {
    session++;
    saved = false;
    if (!cfg().hintDim) dimHint();
    var goal = cfg().goal || 0;
    if (session % ROUND === 0) vibrate([50, 40, 90]);
    else if (goal && session === goal) vibrate([40, 40, 40, 40, 120]);
    else vibrate(50);   /* 单珠 50ms（原 8ms 弱不可感，2026-10-28 用户口径加强） */
    var sv = $('#bd-saved'); if (sv) sv.textContent = '';
    render();
  }
  function saveSession() {
    if (session <= 0 || saved) return;
    var recs = records();
    recs.push({ date: todayStr(), count: session, name: cfg().name || '', ts: Date.now() });
    lsSet(LS_R, JSON.stringify(recs));
    saved = true;
    var sv = $('#bd-saved');
    if (sv) sv.textContent = '已保存：本次 ' + session + ' 计数';
  }
  function finish() {
    saveSession();
    session = 0;
    render();
  }
  function open() {
    build();
    var v = $('#beads-view');
    if (v) v.hidden = false;
    var h = $('#bd-hint');
    if (h) h.classList.toggle('dim', !!cfg().hintDim);
    layoutDots();
    render();
  }
  function back() {
    saveSession();
    var v = $('#beads-view');
    if (v) v.hidden = true;
    session = 0;
    render();
  }

  /* 冒烟专用钩子（非产品 API） */
  window.__beadsTest = {
    state: function () {
      var t = totals();
      return { session: session, saved: saved, records: records().length, today: t.today, total: t.total };
    },
    tap: tap,
    open: open
  };

  document.addEventListener('DOMContentLoaded', function () {
    var b1 = $('#med-beads-open');
    if (b1) b1.addEventListener('click', open);
    var b2 = $('#beads-open-2');
    if (b2) b2.addEventListener('click', open);
    build();
    render();
  });

  return { open: open, back: back };
})();
window.Beads = Beads;
