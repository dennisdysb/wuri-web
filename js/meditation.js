/* 戊日不上香 · 打坐冥想沉浸页
 * 全屏禅房：9 种自然声横向滑动切换，背景交叉淡入 + 缓推近 + 视差；
 * 控制层固定。播放走原生 MeditationAudioService（后台/锁屏/通知栏），
 * 非原生环境（网页/测试）用 HTML5 Audio 降级。
 */
var Meditation = (function () {
  'use strict';

  var SOUNDS = [
    { id: 'rain',    name: '温柔雨声', img: 'img/meditation/bg-rain.webp',    loop: 'audio/meditation/loop-rain.mp3',    asset: 'www/audio/meditation/loop-rain.mp3' },
    { id: 'thunder', name: '雨·远雷',   img: 'img/meditation/bg-thunder.webp', loop: 'audio/meditation/loop-thunder.mp3', asset: 'www/audio/meditation/loop-thunder.mp3' },
    { id: 'ocean',   name: '海浪',       img: 'img/meditation/bg-ocean.webp',   loop: 'audio/meditation/loop-ocean.mp3',   asset: 'www/audio/meditation/loop-ocean.mp3' },
    { id: 'forest',  name: '森林鸟鸣', img: 'img/meditation/bg-forest.webp',  loop: 'audio/meditation/loop-forest.mp3',  asset: 'www/audio/meditation/loop-forest.mp3' },
    { id: 'night',   name: '夜晚虫鸣', img: 'img/meditation/bg-night.webp',   loop: 'audio/meditation/loop-night.mp3',   asset: 'www/audio/meditation/loop-night.mp3' },
    { id: 'fire',    name: '壁炉火声', img: 'img/meditation/bg-fire.webp',    loop: 'audio/meditation/loop-fire.mp3',    asset: 'www/audio/meditation/loop-fire.mp3' },
    { id: 'creek',   name: '溪流',       img: 'img/meditation/bg-creek.webp',   loop: 'audio/meditation/loop-creek.mp3',   asset: 'www/audio/meditation/loop-creek.mp3' },
    { id: 'wind',    name: '风声',       img: 'img/meditation/bg-wind.webp',    loop: 'audio/meditation/loop-wind.mp3',    asset: 'www/audio/meditation/loop-wind.mp3' },
    { id: 'bowl',    name: '颂钵·静',   img: 'img/meditation/bg-bowl.webp',    loop: 'audio/meditation/loop-bowl.mp3',    asset: 'www/audio/meditation/loop-bowl.mp3' },
    { id: 'silence', name: '无声·静室', img: 'img/meditation/bg-silence.webp', loop: '', asset: '' }
  ];
  var INTERVAL_BELL_LOOP = 'audio/meditation/bell-interval.mp3';
  var END_BELL_LOOP = 'audio/meditation/bell-ending.mp3';
  var INTERVAL_BELL_ASSET = 'www/audio/meditation/bell-interval.mp3';
  var END_BELL_ASSET = 'www/audio/meditation/bell-ending.mp3';
  var INTERVAL_SEC = 300; /* 间隔磬：每 5 分钟 */

  var LS_SOUND = 'wuri_med_sound';
  var LS_DUR = 'wuri_med_dur';
  var LS_CUSTOM = 'wuri_med_custom';
  var LS_BELL = 'wuri_med_bell';
  var LS_VOL = 'wuri_med_vol';

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

  /* 降级播放（非原生） */
  var fb = { ambient: null, endAt: 0, bellTimer: 0, endTimer: 0, paused: false, remainMs: 0, elapsedMs: 0, startedAt: 0 };

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
        img.src = SOUNDS[idx].img;
        img.alt = '';
        img.draggable = false;
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

  /* 直接切到指定页：更新背景交叉淡入 + 圆点 */
  function setPage(i, force) {
    if (i === cur && !force) return;
    cur = i;
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
    updatePlayBtn();
    showTime(totalSec);
    startPoll();
  }

  function togglePlay() {
    if (playing) {
      /* 暂停 */
      var b = bridge();
      if (b) { try { b.medPause(); } catch (e) {} }
      else fbPause();
      playing = false;
      updatePlayBtn();
    } else if (expectDone && seenActive) {
      /* 暂停后继续：原生直接 resume；降级恢复计时 */
      var b2 = bridge();
      if (b2) { try { b2.medResume(); } catch (e) {} }
      else fbResume();
      playing = true;
      updatePlayBtn();
      startPoll();
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
    stopPoll();
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
    expectDone = false;
    seenActive = false;
    stopPoll();
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
    fbStop();
    fb.paused = false;
    fb.elapsedMs = 0;
    fb.startedAt = Date.now();
    fb.endAt = Date.now() + secs * 1000;
    if (s.loop) {
      fb.ambient = new Audio(s.loop);
      fb.ambient.loop = true;
      fb.ambient.volume = volume();
      try { var p = fb.ambient.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
      // 媒体卡片（用户 2026-10-10）
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
    if (bellOn()) fbArmBell(INTERVAL_SEC * 1000);
    fb.endTimer = setTimeout(fbFinish, secs * 1000);
  }
  function fbArmBell(ms) {
    fb.bellTimer = setTimeout(function () {
      try {
        var a = new Audio(INTERVAL_BELL_LOOP);
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
  }

  function init() {
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
    $('#med-again').addEventListener('click', function () {
      $('#med-done').hidden = true;
      startPlayback(getSelectedDuration());
    });
    $('#med-done-back').addEventListener('click', back);
    window.addEventListener('resize', function () {
      // 无滚动方案：resize 无需处理
    });
  }

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
