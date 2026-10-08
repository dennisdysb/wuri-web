/* 戊日不上香 · 修行打卡（Pro）
 * 打卡项：预设（打坐/内练/早晚功课）+ 自建；计时类记录时长，计次类每日一次。
 * 连续天数、月历热力图、每项独立提醒时间。
 * 数据存 localStorage：wuri_daka_habits / wuri_daka_records。
 * 旧 wuri_practice_schedule / wuri_practice_journal 数据保留不删（用户可自行清理）。
 */
var Practice = (function () {
  'use strict';
  var LS_HABITS = 'wuri_daka_habits';
  var LS_RECORDS = 'wuri_daka_records';

  var PRESETS = [
    { id: 'dazuo', name: '打坐', type: 'timed', icon: '🧘', preset: true, remindTime: '' },
    { id: 'neilian', name: '内练', type: 'timed', icon: '☯', preset: true, remindTime: '' },
    { id: 'zaowanke', name: '早晚功课', type: 'count', icon: '📿', preset: true, remindTime: '' }
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
  function addRecord(hid, secs) {
    var recs = getRecords();
    var t = todayStr();
    recs.push({ hid: hid, date: t, secs: secs || 0, ts: Date.now() });
    save(LS_RECORDS, recs);
    pushWidgetPractice();
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
    if (!isPro()) { window.WuriPro && WuriPro.requirePro('practice'); return; }
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
        sub = done ? '今日已练 ' + fmtDur(rec.secs) : '点击开始打坐';
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
          ? '<span class="daka-done-mark">✓</span>'
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
        if (h.type === 'timed') openTimer(h);
        else { addRecord(hid, 0); renderAll(); }
      });
      var del = el.querySelector('[data-dact="del"]');
      if (del) del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('确定删除「' + (getHabit(hid) || {}).name + '」吗？历史打卡记录会保留。')) return;
        var h = getHabit(hid);
        if (h) cancelRemind(h);
        saveHabits(getHabits().filter(function (x) { return x.id !== hid; }));
        renderAll();
      });
      // 点整行也可打卡（计次类）
      el.addEventListener('click', function () {
        var h = getHabit(hid);
        if (!h || todayRecord(hid)) return;
        if (h.type === 'count') { addRecord(hid, 0); renderAll(); }
        else openTimer(h);
      });
    });
  }

  /* ---------- 倒计时 ---------- */
  var timerHid = null, timerTotal = 15 * 60, timerLeft = 15 * 60, timerInt = 0, timerRunning = false;
  var doneAudio = null;
  /* 背景音乐（打坐/内练）：v1 用 WebView Audio 循环；正式曲目（用户授权取得后）替换 URL 即可 */
  var BGM_LIST = [
    { id: 'test1', name: '静心曲·测试', url: 'https://dennisdysb.github.io/wuri-web/audio/music/test-calm.mp3' }
  ];
  var bgmAudio = null;
  var bgmId = '';
  var bgmWantPlay = true; /* 用户是否想听（独立暂停键控制） */
  try { bgmId = localStorage.getItem('wuri_daka_bgm') || ''; } catch (e) {}
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
    } catch (e) {}
  }
  function bgmPause() { try { if (bgmAudio) bgmAudio.pause(); } catch (e) {} }
  function bgmStop() { try { if (bgmAudio) { bgmAudio.pause(); bgmAudio.currentTime = 0; } } catch (e) {} }
  function bgmSelect(id) {
    bgmId = id || '';
    bgmWantPlay = true;
    try { localStorage.setItem('wuri_daka_bgm', bgmId); } catch (e) {}
    $all('#daka-bgm-row [data-bgm]').forEach(function (b) {
      b.classList.toggle('on', (b.getAttribute('data-bgm') || '') === bgmId);
    });
    bgmUpdateCtrl();
    // 计时进行中切换：直接换曲
    if (timerRunning && timerHid) bgmPlay(bgmId);
    else if (!timerRunning) bgmStop();
  }
  /* 音乐独立暂停键 + 音量条显隐 */
  function bgmUpdateCtrl() {
    var tgl = $('#daka-bgm-toggle'), vol = $('#daka-bgm-vol');
    var show = !!bgmId;
    if (tgl) { tgl.hidden = !show; tgl.textContent = isBgmPlaying() ? '⏸' : '♪'; }
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
    if (!doneAudio) { doneAudio = new Audio('audio/done.wav'); doneAudio.preload = 'auto'; }
    return doneAudio;
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
    // 背景音乐选项回显上次选择
    $all('#daka-bgm-row [data-bgm]').forEach(function (b) {
      b.classList.toggle('on', (b.getAttribute('data-bgm') || '') === bgmId);
    });
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
  function playDone() {
    try {
      var a = getDoneAudio();
      a.currentTime = 0;
      a.play();
      // 连播3声，温柔提醒
      var n = 0;
      var iv = setInterval(function () {
        n++;
        if (n >= 3) { clearInterval(iv); return; }
        a.currentTime = 0; a.play();
      }, 2800);
    } catch (e) {}
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
    // 背景音乐选择
    $all('#daka-bgm-row [data-bgm]').forEach(function (b) {
      b.addEventListener('click', function () { bgmSelect(b.getAttribute('data-bgm') || ''); });
    });
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
    $('#df-remind-time').value = '';
    window.scrollTo(0, 0);
  }
  function saveForm() {
    var name = $('#df-name').value.trim();
    if (!name) { alert('请填写名称'); return; }
    var h = {
      id: uid(),
      name: name,
      type: $('#df-type').value,
      icon: '✦',
      preset: false,
      remindTime: $('#df-remind-time').value || ''
    };
    var list = getHabits();
    list.push(h);
    saveHabits(list);
    scheduleRemind(h);
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
    bindTimer();
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
    close: close
  };
})();

document.addEventListener('DOMContentLoaded', function () { Practice.init(); });
