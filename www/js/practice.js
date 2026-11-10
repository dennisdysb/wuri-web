/* 戊日不上香 · 修行打卡（Pro）
 * 打卡项：预设（打坐/内练/早课/晚课）+ 自建；计时类记录时长，计次类每日一次。
 * 连续天数、月历热力图、每项独立提醒时间。
 * 数据存 localStorage：wuri_daka_habits / wuri_daka_records。
 * 旧 wuri_practice_schedule / wuri_practice_journal 数据保留不删（用户可自行清理）。
 * 2026-10-09：预设「早晚功课」(zaowanke) 拆分为「早课」(zaoke)+「晚课」(wanke)；
 * 老用户存量迁移：zaowanke 习惯替换为早课/晚课，旧打卡记录保留（仍计入统计）。
 */
var Practice = (function () {
  'use strict';
  var LS_HABITS = 'wuri_daka_habits';
  var LS_RECORDS = 'wuri_daka_records';

  var PRESETS = [
    { id: 'dazuo', name: '打坐冥想', type: 'timed', icon: '🧘', preset: true, remindTime: '' },
    { id: 'neilian', name: '内练', type: 'timed', icon: '☯', preset: true, remindTime: '' },
    { id: 'zaoke', name: '早课', type: 'count', icon: '🌅', preset: true, remindTime: '' },
    { id: 'wanke', name: '晚课', type: 'count', icon: '🌙', preset: true, remindTime: '' }
  ];

  function $(s) { return document.querySelector(s); }
  function $all(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function isPro() { return window.WuriPro && WuriPro.isPro(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function uid() { return 'h' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

  function load(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function save(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
  }

  /* ---------- 习惯 ---------- */
  function getHabits() {
    var list = load(LS_HABITS);
    // 首次：写入预设
    if (!list.length && !localStorage.getItem(LS_HABITS + '_init')) {
      list = PRESETS.map(function (p) {
        return { id: p.id, name: p.name, type: p.type, icon: p.icon, preset: true, remindTime: p.remindTime };
      });
      save(LS_HABITS, list);
      try { localStorage.setItem(LS_HABITS + '_init', '1'); } catch (e) {}
      // 预设提醒
      list.forEach(function (h) { scheduleRemind(h); });
    }
    // 存量迁移：老版本预设名"打坐"→"打坐冥想"
    var migrated = false;
    list.forEach(function (h) {
      if (h.id === 'dazuo' && h.name === '打坐') { h.name = '打坐冥想'; migrated = true; }
    });
    // 存量迁移：老预设「早晚功课」(zaowanke) 拆分为「早课」+「晚课」（原位置替换）
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === 'zaowanke') {
        var oldRemind = list[i].remindTime || '';
        list.splice(i, 1,
          { id: 'zaoke', name: '早课', type: 'count', icon: '🌅', preset: true, remindTime: oldRemind },
          { id: 'wanke', name: '晚课', type: 'count', icon: '🌙', preset: true, remindTime: '' });
        migrated = true;
        break;
      }
    }
    if (migrated) save(LS_HABITS, list);
    return list;
  }
  function getHabit(id) {
    var list = getHabits();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function saveHabits(list) { save(LS_HABITS, list); }

  /* ---------- 打卡记录 ---------- */
  // record: {hid, date:'YYYY-MM-DD', secs(计时)/count, ts}
  function getRecords() { return load(LS_RECORDS); }
  function todayRecord(hid) {
    var t = todayStr();
    var recs = getRecords();
    for (var i = recs.length - 1; i >= 0; i--) {
      if (recs[i].hid === hid && recs[i].date === t) return recs[i];
    }
    return null;
  }
  function todaySecs(hid) {
    var t = todayStr(), s = 0;
    var recs = getRecords();
    for (var i = 0; i < recs.length; i++) {
      if (recs[i].hid === hid && recs[i].date === t) s += (recs[i].secs || 0);
    }
    return s;
  }
  function todayCount(hid) {
    var t = todayStr(), n = 0;
    var recs = getRecords();
    for (var i = 0; i < recs.length; i++) {
      if (recs[i].hid === hid && recs[i].date === t) n++;
    }
    return n;
  }
  function addRecord(hid, secs) {
    /* v602 第二次修订：早课/晚课不再点一下即记——须走功课经验证流程
     * （openKe → 读功课经 → keEnd 结算）；此处拦截，防旧路径漏网。 */
    if (hid === 'zaoke' || hid === 'wanke') return;
    var recs = getRecords();
    var t = todayStr();
    recs.push({ hid: hid, date: t, secs: secs || 0, ts: Date.now() });
    save(LS_RECORDS, recs);
    pushWidgetPractice();
    /* v602 修订版（时间制，1 修为/分钟）：计时类按实记分钟、计次类每次 25 分钟
     * 标准记修为，灵石为修为一半（points.js 内算）；计次类同习惯同日去重。 */
    try { if (window.WuriPoints) window.WuriPoints.awardPractice(hid, secs || 0, t); } catch (e) {}
  }
  function recordsOn(dateStr) {
    return getRecords().filter(function (r) { return r.date === dateStr; });
  }
  // 连续打卡天数（任一习惯打卡即算）
  function streak() {
    var recs = getRecords();
    var dates = {};
    recs.forEach(function (r) { dates[r.date] = true; });
    var n = 0;
    var d = new Date();
    // 今天没打卡从昨天算起
    if (!dates[todayStr(d)]) d.setDate(d.getDate() - 1);
    while (dates[todayStr(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function totalCount() { return getRecords().length; }
  function totalSecs() {
    return getRecords().reduce(function (s, r) { return s + (r.secs || 0); }, 0);
  }

  /* ---------- 提醒 ---------- */
  function hashCode(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return h;
  }
  function scheduleRemind(h) {
    try {
      var b = window.WuBridge;
      if (!b || typeof b.schedule !== 'function') return;
      if (!h.remindTime) return;
      // 每天提醒：用重复通知（id 固定，按习惯 id 哈希）
      var id = 500000 + (Math.abs(hashCode(h.id)) % 400000);
      b.schedule(JSON.stringify([{
        id: id,
        title: '修行打卡提醒',
        body: '该' + h.name + '了，坚持就是修行。',
        at: 'daily@' + h.remindTime,
        repeat: 'daily'
      }]));
    } catch (e) {}
  }
  function cancelRemind(h) {
    try {
      var b = window.WuBridge;
      if (!b || typeof b.cancelSchedule !== 'function') return;
      var id = 500000 + (Math.abs(hashCode(h.id)) % 400000);
      b.cancelSchedule(id);
    } catch (e) {}
  }

  /* ---------- 视图 ---------- */
  function open() {
    /* 修行日程免费开放（2026-10-14 用户定，不再设 Pro 门） */
    $('#practice-view').hidden = false;
    document.body.classList.add('practice-open');
    renderAll();
    window.scrollTo(0, 0);
  }
  function close() {
    $('#practice-view').hidden = true;
    document.body.classList.remove('practice-open');
    stopTimer();
    var f = $('#daka-form-wrap'); if (f) f.hidden = true;
    var m = $('#daka-timer-mask'); if (m) m.classList.remove('show');
  }

  function fmtDur(secs) {
    secs = Math.floor(secs || 0);
    var m = Math.floor(secs / 60), s = secs % 60;
    if (m >= 60) return Math.floor(m / 60) + '小时' + (m % 60) + '分';
    if (m > 0) return m + '分' + (s > 0 ? s + '秒' : '');
    return s + '秒';
  }

  function renderAll() {
    renderHabits();
    renderKeTradition();
    renderStats();
    renderCal();
    var d = new Date();
    $('#daka-today-date').textContent =
      d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function renderHabits() {
    var habits = getHabits();
    var host = $('#daka-habit-list');
    if (!habits.length) {
      host.innerHTML = '<p class="hint empty">暂无打卡项，点击下方按钮添加。</p>';
      return;
    }
    host.innerHTML = habits.map(function (h) {
      var rec = todayRecord(h.id);
      var done = !!rec;
      var sub = '';
      if (h.type === 'timed') {
        var ts = todaySecs(h.id), tc = todayCount(h.id);
        sub = done ? '今日已练 ' + fmtDur(ts) + (tc > 1 ? ' · ' + tc + '次' : '') : '点击开始' + h.name;
      } else {
        sub = done ? '今日已打卡 ✓' : '点击打卡';
      }
      var remindTxt = h.remindTime ? ' · ⏰' + h.remindTime : '';
      return '<div class="daka-item' + (done ? ' done' : '') + '" data-hid="' + esc(h.id) + '">'
        + '<div class="daka-icon">' + esc(h.icon || '✓') + '</div>'
        + '<div class="daka-main">'
        + '<div class="daka-name">' + esc(h.name)
        + '<span class="daka-type">' + (h.type === 'timed' ? '倒计时' : '计次') + '</span></div>'
        + '<div class="daka-sub">' + esc(sub) + esc(remindTxt) + '</div>'
        + '</div>'
        + '<div class="daka-actions">'
        + (done
          ? (h.type === 'timed'
            ? '<button class="btn primary small" data-dact="check">再练</button>'
            : '<span class="daka-done-mark">✓</span>')
          : '<button class="btn primary small" data-dact="check">' + (h.type === 'timed' ? '开始' : '打卡') + '</button>')
        + (h.preset ? '' : '<button class="mini-btn tiny danger" data-dact="del">删</button>')
        + '</div></div>';
    }).join('');
    host.querySelectorAll('.daka-item').forEach(function (el) {
      var hid = el.getAttribute('data-hid');
      var chk = el.querySelector('[data-dact="check"]');
      if (chk) chk.addEventListener('click', function (e) {
        e.stopPropagation();
        var h = getHabit(hid);
        if (!h) return;
        if (h.type === 'timed') openTimed(h);
        else if (hid === 'zaoke' || hid === 'wanke') openKe(h);
        else { addRecord(hid, 0); renderAll(); }
      });
      var del = el.querySelector('[data-dact="del"]');
      if (del) del.addEventListener('click', function (e) {
        e.stopPropagation();
        var hName = (getHabit(hid) || {}).name;
        WuriDlg.confirm('确定删除「' + hName + '」吗？历史打卡记录会保留。', '删除').then(function (ok) {
          if (!ok) return;
          var h = getHabit(hid);
          if (h) cancelRemind(h);
          saveHabits(getHabits().filter(function (x) { return x.id !== hid; }));
          renderAll();
        });
      });
      // 点整行也可打卡（计次类）；计时类点行可再开一局
      el.addEventListener('click', function () {
        var h = getHabit(hid);
        if (!h) return;
        if (h.type === 'count') {
          if (todayRecord(hid)) return;
          if (hid === 'zaoke' || hid === 'wanke') { openKe(h); return; }
          addRecord(hid, 0); renderAll();
        }
        else openTimed(h);
      });
    });
  }

  /* ---------- 早晚课打卡验证（v602 第二次修订，设计文档第三节） ----------
   * 点早课/晚课 → 选传统（首次）→ 打开对应功课经、定位到早坛/晚坛首节；
   * 结算在退出阅读器时（closeReader → WuriPoints.keEnd）或满分自动结算
   * （划到底＋前台可见停留 ≥10 分钟）；只打开也按停留分钟记（最低 1，上限 25）。
   * 传统存 localStorage（wuri_kegong_tradition），本页可切换。 */
  function keTraditionLabel() {
    try {
      var v = localStorage.getItem('wuri_kegong_tradition');
      return v === 's01' ? '正一' : (v === 's02' ? '全真' : null);
    } catch (e) { return null; }
  }
  function renderKeTradition() {
    var el = $('#daka-ke-trad');
    if (!el) return;
    var lab = keTraditionLabel();
    el.innerHTML = '早晚课传统：' + (lab ? esc(lab) : '未选择') +
      ' <button class="mini-btn tiny" id="daka-ke-trad-switch">' + (lab ? '切换' : '选择') + '</button>';
    var btn = $('#daka-ke-trad-switch');
    if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); chooseKeTradition(); });
  }
  function chooseKeTradition() {
    return new Promise(function (resolve) {
      var old = document.querySelector('.ke-trad-mask');
      if (old) old.remove();
      var mask = document.createElement('div');
      mask.className = 'hd-pick-mask hd-dlg-mask ke-trad-mask';
      mask.innerHTML = '<div class="hd-pick-sheet"><div class="hd-pick-title">早晚课用哪个传统？</div>' +
        '<div class="hd-pick-foot" style="flex-direction:column;gap:8px">' +
        '<button class="btn primary" id="ke-trad-s01">正一 · 《正一早晚功课经》</button>' +
        '<button class="btn primary" id="ke-trad-s02">全真 · 《全真早晚功课经》</button>' +
        '<button class="btn" id="ke-trad-cancel">取消</button></div></div>';
      document.body.appendChild(mask);
      function done(v) { mask.remove(); resolve(v); }
      function pick(sid) {
        try { if (window.WuriPoints) window.WuriPoints.keSetTradition(sid); } catch (e) {}
        renderKeTradition(); done(sid);
      }
      mask.querySelector('#ke-trad-s01').addEventListener('click', function () { pick('s01'); });
      mask.querySelector('#ke-trad-s02').addEventListener('click', function () { pick('s02'); });
      mask.querySelector('#ke-trad-cancel').addEventListener('click', function () { done(null); });
      mask.addEventListener('click', function (e) { if (e.target === mask) done(null); });
    });
  }
  /* 正在打开功课经（切 tab → 开卷之间）：此窗口内结算的旧会话不回跳打卡页 */
  var keOpening = false;
  function openKe(h) {
    if (!window.WuriPoints || typeof window.WuriPoints.keStart !== 'function') {
      WuriDlg.alert('积分模块未加载，请稍后再试。'); return;
    }
    function go() {
      /* 顺序关键：先切经文页（tab 切换会同步走 closeReader 结算旧会话），
       * 300ms 后再 keStart＋开卷——否则新会话会在 0 秒时被当场结算。 */
      keOpening = true;
      var tabBtn = document.querySelector('[data-tab="tab-jing"]');
      if (tabBtn) tabBtn.click();
      setTimeout(function () {
        var st = window.WuriPoints.keStart(h.id);
        if (!st.ok) {
          keOpening = false;
          if (st.reason === 'dup') WuriDlg.alert('今日' + h.name + '已完成。');
          else if (st.reason === 'no-tradition') { chooseKeTradition().then(function (v) { if (v) openKe(h); }); }
          return;
        }
        var t = st.target;
        try {
          if (typeof window.JingOpenReaderAt === 'function') window.JingOpenReaderAt(t.sid, t.firstSec, 0);
          else if (window.JingWen && window.JingWen.openReader) window.JingWen.openReader(t.sid);
        } catch (e) {}
        keOpening = false;
      }, 300);
    }
    if (!window.WuriPoints.keTradition()) { chooseKeTradition().then(function (v) { if (v) go(); }); }
    else go();
  }
  /* 功课经会话结算：退出阅读器时回修行打卡页；满分自动结算只提示（不切页）。
   * window.toast 未定义时静默（打卡页的「今日已打卡 ✓」与我的页积分卡即反馈）。 */
  var keEndedBound = false;
  function bindKeEnded() {
    if (keEndedBound) return; keEndedBound = true;
    window.addEventListener('wuri-ke-ended', function (ev) {
      var d = (ev && ev.detail) || {};
      if (d.origin === 'switch' || keOpening) return; /* 切到另一会话／正在开卷，静默 */
      var name = d.hid === 'zaoke' ? '早课' : (d.hid === 'wanke' ? '晚课' : '功课');
      var msg = name + '：+' + d.x + ' 修为 · +' + d.l + ' 灵石' +
        (d.full ? '（已完成 ✓）' : '（已打卡，划到底＋停留满 10 分钟可拿满 25）') +
        (d.capped ? '（已达今日上限）' : '') + (d.double ? '（初一十五双倍）' : '');
      try { if (window.toast) window.toast(msg); } catch (e) {}
      try { pushWidgetPractice(); } catch (e) {}
      if (d.origin === 'close') { renderAll(); open(); }
    });
  }

  /* 打坐冥想走沉浸页，其余计时项走老计时窗 */
  function openTimed(h) {
    if (h && h.id === 'dazuo' && window.Meditation && typeof window.Meditation.open === 'function') {
      window.Meditation.open();
    } else {
      openTimer(h);
    }
  }

  /* ---------- 倒计时 ---------- */
  var timerHid = null, timerTotal = 15 * 60, timerLeft = 15 * 60, timerInt = 0, timerRunning = false;
  var doneAudio = null;
  /* 背景音乐（内练/早晚功课等老计时窗用）：本地纯自然声，无缝循环 */
  var BGM_LIST = [
    { id: 'rain',    name: '温柔雨声', url: 'audio/meditation/loop-rain.mp3?v=4' },
    { id: 'thunder', name: '雨·远雷',   url: 'audio/meditation/loop-thunder.mp3?v=4' },
    { id: 'ocean',   name: '海浪',       url: 'audio/meditation/loop-ocean.mp3?v=4' },
    { id: 'forest',  name: '森林鸟鸣', url: 'audio/meditation/loop-forest.mp3?v=4' },
    { id: 'night',   name: '夜晚虫鸣', url: 'audio/meditation/loop-night.mp3?v=4' },
    { id: 'fire',    name: '壁炉火声', url: 'audio/meditation/loop-fire.mp3?v=4' },
    { id: 'creek',   name: '溪流',       url: 'audio/meditation/loop-creek.mp3?v=4' },
    { id: 'wind',    name: '风声',       url: 'audio/meditation/loop-wind.mp3?v=4' }
  ];
  /* 背景音乐按钮按 BGM_LIST 动态渲染（index.html 只留容器） */
  function renderBgmRow() {
    var sel = $('#daka-bgm-select');
    if (!sel) return;
    var known = (bgmId === '');
    for (var i = 0; i < BGM_LIST.length; i++) if (BGM_LIST[i].id === bgmId) known = true;
    if (!known) { bgmId = ''; try { localStorage.setItem('wuri_daka_bgm', ''); } catch (e) {} }
    // 下拉单选：无 + 8 种自然声（2026-10-08 用户定：一排按钮太乱，收成下拉）
    var html = '<option value="">无</option>';
    html += BGM_LIST.map(function (t) {
      return '<option value="' + t.id + '"' + (bgmId === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('');
    sel.innerHTML = html;
    sel.value = bgmId;
  }
  var bgmAudio = null;
  var bgmId = 'rain';
  var bgmWantPlay = true; /* 用户是否想听（独立暂停键控制） */
  try { var _bv = localStorage.getItem('wuri_daka_bgm'); bgmId = (_bv === null) ? 'rain' : _bv; } catch (e) {}
  function getBgmAudio() {
    if (!bgmAudio) {
      bgmAudio = new Audio(); bgmAudio.loop = true; bgmAudio.preload = 'auto';
      try { bgmAudio.volume = (parseInt(localStorage.getItem('wuri_daka_bgmvol') || '60', 10) || 60) / 100; } catch (e) {}
    }
    return bgmAudio;
  }
  function bgmPlay(id) {
    try {
      var t = null;
      for (var i = 0; i < BGM_LIST.length; i++) if (BGM_LIST[i].id === id) t = BGM_LIST[i];
      var a = getBgmAudio();
      if (!t) { bgmStop(); return; }
      if (a.getAttribute('src') !== t.url) a.src = t.url;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
      // 媒体卡片（用户 2026-10-10）
      try {
        if (window.WuriMediaSession && t.name) {
          window.WuriMediaSession.bindAudio(a, {
            title: '内练 · ' + t.name,
            artist: '戊日不上香',
            album: '内练打卡'
          });
        }
      } catch (e2) {}
    } catch (e) {}
  }
  function bgmPause() { try { if (bgmAudio) bgmAudio.pause(); } catch (e) {} }
  function bgmStop() { try { if (bgmAudio) { bgmAudio.pause(); bgmAudio.currentTime = 0; } } catch (e) {} }
  function bgmSelect(id) {
    bgmId = id || '';
    bgmWantPlay = true;
    try { localStorage.setItem('wuri_daka_bgm', bgmId); } catch (e) {}
    var sel = $('#daka-bgm-select');
    if (sel) sel.value = bgmId;
    bgmUpdateCtrl();
    // 计时进行中切换：直接换曲
    if (timerRunning && timerHid) bgmPlay(bgmId);
    else if (!timerRunning) bgmStop();
  }
  /* 音乐独立暂停键 + 音量条显隐（SVG 图标，主题金色，不用 emoji） */
  var SVG_BGM_PLAY = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_BGM_PAUSE = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  function bgmUpdateCtrl() {
    var tgl = $('#daka-bgm-toggle'), vol = $('#daka-bgm-vol');
    var show = !!bgmId;
    if (tgl) {
      tgl.hidden = !show;
      tgl.innerHTML = isBgmPlaying() ? SVG_BGM_PAUSE : SVG_BGM_PLAY;
      tgl.style.color = 'var(--gold)';
      tgl.style.display = show ? '' : '';
      tgl.style.alignItems = 'center';
      tgl.style.justifyContent = 'center';
    }
    if (vol) vol.hidden = !show;
  }
  function isBgmPlaying() { return !!(bgmAudio && !bgmAudio.paused && bgmAudio.src); }
  function bgmToggleManual() {
    if (!bgmId) return;
    if (isBgmPlaying()) { bgmWantPlay = false; bgmPause(); }
    else { bgmWantPlay = true; bgmPlay(bgmId); }
    bgmUpdateCtrl();
  }
  function getDoneAudio() {
    if (!doneAudio) { doneAudio = new Audio('audio/meditation/bell-ending.mp3?v=3'); doneAudio.preload = 'auto'; }
    return doneAudio;
  }
  /* 完成铃：49 秒渐入钵声，一次即够（老 done.wav 的三连播不再适用） */
  function playDone() {
    try {
      var a = getDoneAudio();
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function fmtLeft(secs) {
    var m = Math.floor(secs / 60), s = secs % 60;
    return pad(m) + ':' + pad(s);
  }
  function openTimer(h) {
    timerHid = h.id;
    timerTotal = 15 * 60; timerLeft = timerTotal; timerRunning = false;
    $('#daka-timer-name').textContent = (h.icon || '') + ' ' + h.name;
    $('#daka-timer-time').textContent = fmtLeft(timerLeft);
    $('#daka-timer-toggle').textContent = '开始';
    // 重置时长选项
    $all('#daka-dur-row [data-dur]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-dur') === '15');
    });
    $('#daka-custom-min').hidden = true;
    // 背景音乐下拉回显上次选择（2026-10-08 用户定：一排按钮太乱，收成单个下拉）
    var bgmRow = $('#daka-bgm-row');
    if (bgmRow) bgmRow.style.display = '';
    var bgmSel = $('#daka-bgm-select');
    if (bgmSel) bgmSel.value = bgmId;
    bgmWantPlay = true;
    bgmUpdateCtrl();
    $('#daka-timer-mask').classList.add('show');
  }
  function closeTimer() {
    $('#daka-timer-mask').classList.remove('show');
    stopTimer();
  }
  function stopTimer() {
    if (timerInt) clearInterval(timerInt);
    timerInt = 0; timerRunning = false; timerHid = null;
    bgmStop();
  }
  function bindTimer() {
    // 时长选择
    $all('#daka-dur-row [data-dur]').forEach(function (b) {
      b.addEventListener('click', function () {
        $all('#daka-dur-row [data-dur]').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        var v = b.getAttribute('data-dur');
        var custom = $('#daka-custom-min');
        if (v === 'custom') {
          custom.hidden = false;
          custom.focus();
        } else {
          custom.hidden = true;
          timerTotal = (+v) * 60;
          timerLeft = timerTotal;
          $('#daka-timer-time').textContent = fmtLeft(timerLeft);
        }
      });
    });
    $('#daka-custom-min').addEventListener('input', function () {
      var v = parseInt(this.value, 10);
      if (v >= 1 && v <= 180) {
        timerTotal = v * 60;
        timerLeft = timerTotal;
        $('#daka-timer-time').textContent = fmtLeft(timerLeft);
      }
    });
    // 开始/暂停
    $('#daka-timer-toggle').addEventListener('click', function () {
      if (!timerHid) return;
      if (timerRunning) {
        clearInterval(timerInt); timerInt = 0; timerRunning = false;
        bgmPause();
        bgmUpdateCtrl();
        this.textContent = '继续';
      } else {
        var self = this;
        // 如果已经走完，重置
        if (timerLeft <= 0) { timerLeft = timerTotal; }
        timerRunning = true;
        self.textContent = '暂停';
        if (bgmId && bgmWantPlay) bgmPlay(bgmId);
        bgmUpdateCtrl();
        timerInt = setInterval(function () {
          timerLeft--;
          $('#daka-timer-time').textContent = fmtLeft(Math.max(0, timerLeft));
          if (timerLeft <= 0) {
            clearInterval(timerInt); timerInt = 0; timerRunning = false;
            bgmStop();
            playDone();
            // 自动记一次打卡（用设定的时长）
            if (timerHid) addRecord(timerHid, timerTotal);
            $('#daka-timer-toggle').textContent = '开始';
            renderAll();
          }
        }, 1000);
      }
    });
    // 背景音乐选择（下拉单选）
    var bgmSel = $('#daka-bgm-select');
    if (bgmSel) bgmSel.addEventListener('change', function () { bgmSelect(bgmSel.value || ''); });
    // 音乐独立暂停/继续
    $('#daka-bgm-toggle').addEventListener('click', function () { bgmToggleManual(); });
    // 音量
    (function () {
      var vol = $('#daka-bgm-vol');
      if (!vol) return;
      try { vol.value = localStorage.getItem('wuri_daka_bgmvol') || '60'; } catch (e) {}
      vol.addEventListener('input', function () {
        try { localStorage.setItem('wuri_daka_bgmvol', vol.value); } catch (e) {}
        getBgmAudio().volume = (parseInt(vol.value, 10) || 0) / 100;
      });
    })();
    // 完成（提前结束，按已用时间记）
    $('#daka-timer-done').addEventListener('click', function () {
      if (timerHid) {
        var used = timerTotal - timerLeft;
        addRecord(timerHid, used > 0 ? used : 0);
      }
      closeTimer();
      renderAll();
    });
    $('#daka-timer-cancel').addEventListener('click', function () {
      closeTimer();
    });
  }

  /* ---------- 自建 ---------- */
  function openForm() {
    $('#daka-form-wrap').hidden = false;
    $('#df-name').value = '';
    $('#df-type').value = 'count';
    window.scrollTo(0, 0);
  }
  function saveForm() {
    var name = $('#df-name').value.trim();
    if (!name) { WuriDlg.alert('请填写名称'); return; }
    var h = {
      id: uid(),
      name: name,
      type: $('#df-type').value,
      icon: '✦',
      preset: false
    };
    var list = getHabits();
    list.push(h);
    saveHabits(list);
    $('#daka-form-wrap').hidden = true;
    renderAll();
  }

  /* ---------- 统计 ---------- */
  function renderStats() {
    var st = streak(), tot = totalCount(), secs = totalSecs();
    $('#daka-stats').innerHTML =
      '<div class="daka-stat"><div class="daka-stat-n">' + st + '</div><div class="daka-stat-l">连续天数</div></div>'
      + '<div class="daka-stat"><div class="daka-stat-n">' + tot + '</div><div class="daka-stat-l">累计打卡</div></div>'
      + '<div class="daka-stat"><div class="daka-stat-n">' + fmtDur(secs) + '</div><div class="daka-stat-l">累计用功</div></div>';
  }

  /* ---------- 月历热力图 ---------- */
  var calY = 0, calM = 0;
  function renderCal() {
    var now = new Date();
    if (!calY) { calY = now.getFullYear(); calM = now.getMonth(); }
    $('#daka-cal-title').textContent = calY + '年' + (calM + 1) + '月';
    var first = new Date(calY, calM, 1);
    var startDay = first.getDay(); // 0=周日
    var days = new Date(calY, calM + 1, 0).getDate();
    var recs = getRecords();
    var byDate = {};
    recs.forEach(function (r) {
      var d = r.date.split('-');
      if (+d[0] === calY && +d[1] === calM + 1) byDate[r.date] = (byDate[r.date] || 0) + 1;
    });
    var max = 1;
    Object.keys(byDate).forEach(function (k) { if (byDate[k] > max) max = byDate[k]; });
    var html = '<div class="daka-cal-grid">';
    ['日', '一', '二', '三', '四', '五', '六'].forEach(function (w) {
      html += '<div class="daka-cal-w">' + w + '</div>';
    });
    for (var i = 0; i < startDay; i++) html += '<div class="daka-cal-d empty"></div>';
    var tStr = todayStr();
    for (var d = 1; d <= days; d++) {
      var ds = calY + '-' + pad(calM + 1) + '-' + pad(d);
      var c = byDate[ds] || 0;
      var lv = c === 0 ? 0 : Math.min(4, Math.ceil(c / max * 4));
      var cls = 'daka-cal-d lv' + lv + (ds === tStr ? ' today' : '');
      html += '<div class="' + cls + '">' + d + '</div>';
    }
    html += '</div>';
    $('#daka-cal').innerHTML = html;
  }

  /* ---------- 初始化 ---------- */
  function init() {
    // 启动时触发习惯迁移（如早晚功课拆分），保证小组件数据也正确
    try { getHabits(); } catch (e) {}
    var entry = $('#practice-enter');
    if (entry) entry.addEventListener('click', open);
    var back = $('#practice-back');
    if (back) back.addEventListener('click', close);
    var addBtn = $('#daka-add-btn');
    if (addBtn) addBtn.addEventListener('click', openForm);
    var saveBtn = $('#df-save');
    if (saveBtn) saveBtn.addEventListener('click', saveForm);
    var cancelBtn = $('#df-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { $('#daka-form-wrap').hidden = true; });
    var prev = $('#daka-cal-prev');
    if (prev) prev.addEventListener('click', function () {
      calM--; if (calM < 0) { calM = 11; calY--; } renderCal();
    });
    var next = $('#daka-cal-next');
    if (next) next.addEventListener('click', function () {
      calM++; if (calM > 11) { calM = 0; calY++; } renderCal();
    });
    renderBgmRow();
    bindTimer();
    bindKeEnded();
    // 启动时推送一次今日进度给小组件
    setTimeout(pushWidgetPractice, 1500);
  }

  
  /* ---------- 小组件推送 ---------- */
  function pushWidgetPractice() {
    try {
      var b = window.WuBridge;
      if (!b || typeof b.pushWidgetData !== 'function') return;
      var habits = getHabits();
      var items = habits.map(function (h) {
        return { name: h.name, done: !!todayRecord(h.id) };
      });
      var done = items.filter(function (x) { return x.done; }).length;
      b.pushWidgetData('practice', JSON.stringify({
        total: items.length, done: done, items: items, date: todayStr()
      }));
    } catch (e) {}
  }
return {
    init: init,
    open: open,
    close: close,
    addRecord: addRecord /* 打坐冥想沉浸页到点记打卡用 */
  };
})();

document.addEventListener('DOMContentLoaded', function () { Practice.init(); });
