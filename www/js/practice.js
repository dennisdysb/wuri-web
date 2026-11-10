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
    /* 增量迁移（v605 第 14 项＋硬约束）：只给图标缺失或为通用 ✦ 的旧项
     * 按名字推断补默认图标；用户已设的图标绝不覆盖；其余字段原样保留；
     * 习惯列表与历史记录的键名、schema 一律不变（wuri_daka_habits /
     * wuri_daka_records），更新/排序/编辑保存/重装都不删项。 */
    list.forEach(function (h) {
      if (!h.icon || h.icon === '✦') {
        var ic = inferIcon(h.name);
        if (ic !== '✦') { h.icon = ic; migrated = true; }
      }
    });
    if (migrated) save(LS_HABITS, list);
    return list;
  }
  function getHabit(id) {
    var list = getHabits();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function saveHabits(list) { save(LS_HABITS, list); }

  /* ---------- 顺序（v605 第 13 项：拖动排序，顺序单存一键） ----------
   * 键 wuri_daka_order_v1 只存习惯 id 数组；习惯本体仍在 wuri_daka_habits，
   * 顺序键绝不决定习惯项的存亡——渲染时按顺序排，顺序键里没有的 id
   * 一律追加到末尾，顺序键里多余的旧 id 直接丢弃（只清顺序表垃圾）。 */
  var LS_ORDER = 'wuri_daka_order_v1';
  function loadOrder() {
    try { var v = JSON.parse(localStorage.getItem(LS_ORDER) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function saveOrder(ids) {
    try { localStorage.setItem(LS_ORDER, JSON.stringify(ids)); } catch (e) {}
  }
  function sortHabitsByOrder(list) {
    var order = loadOrder(), byId = {}, out = [], seen = {}, i;
    for (i = 0; i < list.length; i++) byId[list[i].id] = list[i];
    for (i = 0; i < order.length; i++) {
      if (byId[order[i]] && !seen[order[i]]) { out.push(byId[order[i]]); seen[order[i]] = true; }
    }
    for (i = 0; i < list.length; i++) {
      if (!seen[list[i].id]) { out.push(list[i]); seen[list[i].id] = true; }
    }
    return out;
  }
  /* 拖动过程态（第 13 项）＋拖后点按抑制＋编辑弹窗态（第 14 项） */
  var dragState = null;   /* {hid, el, startY, moved, targetHid, before} */
  var dragSuppressUntil = 0;
  var editingHid = null;  /* 编辑弹窗正在改的习惯 id，null = 新建 */
  var formIcon = '✦';
  var formIconPicked = false;
  function dragClearHints() {
    var host = $('#daka-habit-list');
    if (!host) return;
    host.querySelectorAll('.daka-item').forEach(function (r) {
      r.classList.remove('drop-before');
      r.classList.remove('drop-after');
    });
  }
  function dragUpdateTarget(clientY) {
    var host = $('#daka-habit-list');
    if (!host || !dragState) return;
    var rows = host.querySelectorAll('.daka-item');
    var target = null, before = true, i, r, rect, mid;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (r === dragState.el) continue;
      rect = r.getBoundingClientRect ? r.getBoundingClientRect() : null;
      mid = rect ? (rect.top + rect.bottom) / 2 : 0;
      if (clientY <= mid) { target = r; before = true; break; }
    }
    if (!target) {
      for (i = rows.length - 1; i >= 0; i--) {
        if (rows[i] !== dragState.el) { target = rows[i]; before = false; break; }
      }
    }
    dragClearHints();
    dragState.targetHid = null;
    if (target) {
      dragState.targetHid = target.getAttribute('data-hid');
      dragState.before = before;
      target.classList.add(before ? 'drop-before' : 'drop-after');
    }
  }
  function dragEnd(commit) {
    if (!dragState) return;
    var st = dragState;
    dragState = null;
    dragClearHints();
    if (st.el) st.el.classList.remove('dragging');
    if (!commit || !st.moved || !st.targetHid || st.targetHid === st.hid) return;
    dragSuppressUntil = Date.now() + 300;   /* 拖完抬手的 click 不误触进行身 */
    var ids = sortHabitsByOrder(getHabits()).map(function (h) { return h.id; });
    var from = ids.indexOf(st.hid);
    if (from >= 0) ids.splice(from, 1);
    var to = ids.indexOf(st.targetHid);
    if (to < 0) return;
    ids.splice(st.before ? to : to + 1, 0, st.hid);
    saveOrder(ids);   /* 顺序表含当前全部习惯 id；习惯本体不动 */
    renderAll();
  }

  /* ---------- 图标（v605 第 14 项：自建项可选图标，≥16 个） ---------- */
  var DAKA_ICONS = ['🎵', '🎸', '🎤', '🎧', '🏃', '🏋️', '🧘', '📖', '📚', '✍️',
    '🍎', '🥗', '😴', '💼', '🌳', '🚶', '🎨', '🪷', '🙏', '💧', '☕', '🌙', '🧹', '📿'];
  /* 名字推断默认图标：只在图标缺失或为通用 ✦ 时用，绝不覆盖用户已设图标 */
  function inferIcon(name) {
    var n = String(name || '');
    if (/音乐|唱歌|听歌|疗愈|琴|歌|唱诵|跟唱/.test(n)) return '🎵';
    if (/跑步|跑|运动|健身|锻炼|瑜伽/.test(n)) return '🏃';
    if (/散步|步行/.test(n)) return '🚶';
    if (/阅读|读书|读经|看书/.test(n)) return '📖';
    if (/学习|背诵|上课|练字|作业/.test(n)) return '📚';
    if (/抄经|写字|写经|书法/.test(n)) return '✍️';
    if (/饮食|吃饭|做饭|断食|辟谷/.test(n)) return '🍎';
    if (/睡眠|睡觉|午睡|早睡/.test(n)) return '😴';
    if (/工作|上班|加班/.test(n)) return '💼';
    if (/户外|爬山/.test(n)) return '🌳';
    if (/冥想|打坐|静坐|禅修/.test(n)) return '🧘';
    if (/拜忏|礼佛|诵经|念佛|持咒|念诵/.test(n)) return '📿';
    return '✦';
  }

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
    var f = $('#daka-form-wrap'); if (f) f.classList.remove('show');
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
    var habits = sortHabitsByOrder(getHabits());   /* 第 13 项：按顺序键排，新 id 追加末尾 */
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
        + '<span class="daka-grip" aria-hidden="true">⋮⋮</span>'
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
        + '</div></div>';   /* 第 14 项修正：行上什么按钮都不放，删除钮已移进编辑弹窗 */
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
      /* 抓手拖动排序（第 13 项）：pointer 事件，触屏＋鼠标通用；
       * setPointerCapture 后 move/up 都落在抓手上；位移 >8px 才算拖动。 */
      var grip = el.querySelector('.daka-grip');
      if (grip) {
        try { grip.style.touchAction = 'none'; } catch (e) {}   /* 触屏拖动不触发页面滚动 */
        grip.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          e.stopPropagation();
          try { grip.setPointerCapture(e.pointerId); } catch (err) {}
          dragState = { hid: hid, el: el, startY: e.clientY, moved: false, targetHid: null, before: true };
          el.classList.add('dragging');
        });
        grip.addEventListener('pointermove', function (e) {
          if (!dragState || dragState.hid !== hid) return;
          e.preventDefault();
          if (Math.abs(e.clientY - dragState.startY) > 8) dragState.moved = true;
          if (!dragState.moved) return;
          dragUpdateTarget(e.clientY);
        });
        grip.addEventListener('pointerup', function () { dragEnd(true); });
        grip.addEventListener('pointercancel', function () { dragEnd(false); });
        grip.addEventListener('contextmenu', function (e) { e.preventDefault(); }); /* v606：禁长按菜单 */
      }
      /* 点行身：自建项进编辑弹窗（第 14 项修正：行上无按钮，点行身进编辑）；
       * 内置项保持原有行为——计次类点行打卡、计时类点行再开一局。
       * 排除抓手与「打卡」按钮；拖动位移 >8px 的抬手 click 由 dragEnd 抑制。 */
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); }); /* v606：行身长按也不弹菜单 */
      el.addEventListener('click', function (e) {
        if (Date.now() < dragSuppressUntil) return;
        if (e.target && e.target.closest && (e.target.closest('.daka-grip') || e.target.closest('[data-dact="check"]'))) return;
        var h = getHabit(hid);
        if (!h) return;
        if (!h.preset) { openEditForm(h); return; }
        if (h.type === 'count') {
          if (todayRecord(hid)) return;
          if (hid === 'zaoke' || hid === 'wanke') { openKe(h); return; }
          addRecord(hid, 0); renderAll();
        }
        else openTimed(h);
      });
    });
  }

  /* ---------- 早晚课打卡验证（v602 第二次修订，设计文档第三节；v604 去传统选择器） ----------
   * 点早课/晚课 → 打开对应功课经、定位到早坛/晚坛首节；
   * 结算在退出阅读器时（closeReader → WuriPoints.keEnd）或满分自动结算
   * （划到底＋前台可见停留 ≥10 分钟）；只打开也按停留分钟记（最低 1，上限 25）。
   * v604：不再弹传统选择框——未存过传统的用户默认全真 s02（points.js keStart 内置），
   * 已存 s01/s02 的用户继续沿用原值；打卡页传统行与本页切换入口一并删除。 */
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
    go(); /* v604：不再先弹传统选择框，未存传统时 keStart 默认全真 s02 */
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
  /* 内练 BGM Web Audio 增益链（v605：iOS 不认 element.volume，修法同混音台）：
   * source(MediaElementAudioSourceNode, 只建一次) → GainNode → destination；
   * #daka-bgm-vol 改调 gain；gain 是唯一音量控制，接线成功时 element.volume
   * 固定为 1，防 gain 与 volume 双重衰减；无 AudioContext 才回落 volume。 */
  var bgmCtx = null, bgmGain = null, bgmSrc = null;
  function bgmAudioCtx() {
    if (bgmCtx) return bgmCtx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      bgmCtx = new AC();
      bgmGain = bgmCtx.createGain();
      try { bgmGain.gain.value = (parseInt(localStorage.getItem('wuri_daka_bgmvol') || '60', 10) || 60) / 100; } catch (e) {}
      bgmGain.connect(bgmCtx.destination);
    } catch (e) { return null; }
    return bgmCtx;
  }
  function bgmResumeCtx() {
    var c = bgmAudioCtx();
    if (c && c.state === 'suspended') {
      try { var p = c.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
  }
  function bgmEnsureGain() {
    if (!bgmAudio) return null;
    try {
      var ctx = bgmAudioCtx();
      if (!ctx || !bgmGain) return null;
      if (!bgmSrc) {
        bgmSrc = ctx.createMediaElementSource(bgmAudio);
        bgmSrc.connect(bgmGain);
      }
      return bgmGain;
    } catch (e) { return null; }
  }
  function bgmSetGain(v) {
    var g = bgmEnsureGain();
    if (g) { try { g.gain.value = v; } catch (e) {} }
  }
  function bgmVol0() {
    try { return (parseInt(localStorage.getItem('wuri_daka_bgmvol') || '60', 10) || 60) / 100; } catch (e) { return 0.6; }
  }
  var bgmId = 'rain';
  var bgmWantPlay = true; /* 用户是否想听（独立暂停键控制） */
  try { var _bv = localStorage.getItem('wuri_daka_bgm'); bgmId = (_bv === null) ? 'rain' : _bv; } catch (e) {}
  function getBgmAudio() {
    if (!bgmAudio) {
      bgmAudio = new Audio(); bgmAudio.loop = true; bgmAudio.preload = 'auto';
      bgmEnsureGain();
      if (bgmGain) { try { bgmAudio.volume = 1; } catch (e) {} bgmSetGain(bgmVol0()); }   /* gain 是唯一音量控制 */
      else { try { bgmAudio.volume = bgmVol0(); } catch (e) {} }   /* 无 AudioContext 才回落 volume */
    }
    return bgmAudio;
  }
  function bgmPlay(id) {
    try {
      var t = null;
      for (var i = 0; i < BGM_LIST.length; i++) if (BGM_LIST[i].id === id) t = BGM_LIST[i];
      var a = getBgmAudio();
      if (!t) { bgmStop(); return; }
      bgmResumeCtx();   /* 播放切换即手势：恢复 AudioContext */
      bgmSetGain(bgmVol0());
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
        var vv = (parseInt(vol.value, 10) || 0) / 100;
        var _ba = getBgmAudio();
        if (bgmGain) { try { _ba.volume = 1; } catch (e) {} bgmSetGain(vv); }   /* gain 是唯一音量控制 */
        else { try { _ba.volume = vv; } catch (e) {} }   /* 无 AudioContext 才回落 volume */
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

  /* ---------- 自建（v603：改居中弹窗——旧页面内展开＋scrollTo(0,0) 滚回页顶，
     表单在视口下方不可见，Maggie 实测上报“按上去好像没有反应”；旧行为彻底移除） ---------- */
  /* ---------- 自建项编辑弹窗（v605 第 14 项，复用 #daka-form-wrap） ----------
   * 行上无任何按钮：点自建项行身进编辑；内置项行身保持原打卡行为。
   * 编辑模式：预填名字＋图标；类型选择器禁用（建好后类型不动，防旧记录口径乱）；
   * 删除钮只在编辑模式显示，点后 WuriDlg.confirm 确认才删。
   * 图标网格与删除钮均由 JS 注入（不改 index.html、不改 style.css）。 */
  function ensureFormExtras() {
    var box = document.querySelector('#daka-form-wrap .daka-form-box');
    if (!box) return;
    if (!box.querySelector('.daka-icon-grid')) {
      var grid = document.createElement('div');
      grid.className = 'daka-icon-grid';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', '选择图标');
      var btnRow = box.querySelector('.btn-row');
      if (btnRow) box.insertBefore(grid, btnRow);
      else box.appendChild(grid);
      renderIconGrid();
    }
    if (!box.querySelector('.daka-del-btn')) {
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn daka-del-btn';
      del.textContent = '删除此项';
      del.addEventListener('click', onDeleteEditing);
      var br = box.querySelector('.btn-row');
      if (br) br.appendChild(del);
      else box.appendChild(del);
    }
  }
  function renderIconGrid() {
    var grid = document.querySelector('#daka-form-wrap .daka-icon-grid');
    if (!grid) return;
    grid.innerHTML = '';
    DAKA_ICONS.forEach(function (ic) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'daka-icon-opt' + (ic === formIcon ? ' on' : '');
      b.textContent = ic;
      b.setAttribute('aria-label', '图标 ' + ic);
      b.addEventListener('click', function () {
        formIcon = ic;
        formIconPicked = true;
        renderIconGrid();
      });
      grid.appendChild(b);
    });
  }
  function syncFormMode() {
    var title = $('#daka-form-title');
    if (title) title.textContent = editingHid ? '编辑打卡项' : '＋ 自建打卡项';
    var typeSel = $('#df-type');
    if (typeSel) typeSel.disabled = !!editingHid;
    var del = document.querySelector('#daka-form-wrap .daka-del-btn');
    if (del) del.hidden = !editingHid;
    renderIconGrid();
  }
  function openForm() {
    ensureFormExtras();
    editingHid = null;
    formIcon = '✦';
    formIconPicked = false;
    var w = $('#daka-form-wrap');
    if (!w) return;
    $('#df-name').value = '';
    $('#df-type').value = 'count';
    syncFormMode();
    w.classList.add('show');
    try { $('#df-name').focus(); } catch (e) {}
  }
  function openEditForm(h) {
    if (!h || h.preset) return;
    ensureFormExtras();
    editingHid = h.id;
    /* 图标预填：有用户自设图标就用它；缺失或通用 ✦ 时按名字推断补默认 */
    if (h.icon && h.icon !== '✦') { formIcon = h.icon; formIconPicked = true; }
    else { formIcon = inferIcon(h.name); formIconPicked = false; }
    var w = $('#daka-form-wrap');
    if (!w) return;
    $('#df-name').value = h.name || '';
    var typeSel = $('#df-type');
    if (typeSel) typeSel.value = h.type || 'count';
    syncFormMode();
    w.classList.add('show');
    try { $('#df-name').focus(); } catch (e) {}
  }
  function onDeleteEditing() {
    if (!editingHid) return;
    var h = getHabit(editingHid);
    if (!h) { closeForm(); return; }
    var hid = editingHid;
    WuriDlg.confirm('确定删除「' + h.name + '」吗？历史打卡记录会保留。', '删除').then(function (ok) {
      if (!ok) return;
      cancelRemind(h);
      saveHabits(getHabits().filter(function (x) { return x.id !== hid; }));
      saveOrder(loadOrder().filter(function (id) { return id !== hid; }));   /* 只清顺序表里的旧 id */
      editingHid = null;
      closeForm();
      renderAll();
    });
  }
  function closeForm() {
    editingHid = null;
    var w = $('#daka-form-wrap');
    if (w) w.classList.remove('show');
  }
  function saveForm() {
    var name = $('#df-name').value.trim();
    if (!name) { WuriDlg.alert('请填写名称'); return; }
    var icon = formIconPicked ? formIcon : inferIcon(name);
    if (editingHid) {
      /* 合并保留原对象全部字段（只改名字＋图标），类型与提醒等原样不动 */
      var list = getHabits();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === editingHid) {
          list[i] = Object.assign({}, list[i], { name: name, icon: icon });
          break;
        }
      }
      saveHabits(list);
      editingHid = null;
      closeForm();
      renderAll();
      return;
    }
    var h = {
      id: uid(),
      name: name,
      type: $('#df-type').value,
      icon: icon,
      preset: false
    };
    var list2 = getHabits();
    list2.push(h);
    saveHabits(list2);
    closeForm();
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
    if (cancelBtn) cancelBtn.addEventListener('click', closeForm);
    /* 点遮罩关闭（只认遮罩本身点按，弹窗内点按不关）；Esc 同样关闭 */
    var formWrap = $('#daka-form-wrap');
    if (formWrap) formWrap.addEventListener('click', function (e) { if (e.target === formWrap) closeForm(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var w = $('#daka-form-wrap');
        if (w && w.classList.contains('show')) closeForm();
      }
    });
    var prev = $('#daka-cal-prev');
    if (prev) prev.addEventListener('click', function () {
      calM--; if (calM < 0) { calM = 11; calY--; } renderCal();
    });
    var next = $('#daka-cal-next');
    if (next) next.addEventListener('click', function () {
      calM++; if (calM > 11) { calM = 0; calY++; } renderCal();
    });
    renderBgmRow();
    ensureFormExtras();   /* 第 14 项：图标网格＋弹窗内删除钮预注入（只建一次） */
    var dfName = $('#df-name');
    if (dfName) dfName.addEventListener('input', function () {
      /* 未亲手选过图标时，名字输入即实时推断默认图标 */
      if (!formIconPicked) { formIcon = inferIcon(dfName.value.trim()); renderIconGrid(); }
    });
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
