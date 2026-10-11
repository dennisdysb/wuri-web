/* 戊日不上香 · 自定义 ICS 日历生成器（网页版）
 * 用户勾选提醒类型 → 浏览器端实时生成 .ics 下载
 * 日期逻辑复用 app.js 的 lunar-javascript
 */
(function () {
'use strict';

/* 从 app.js 复用：SHENDAN, isWuriDay 等 */
/* 为独立性，这里重新实现核心日期判定（不依赖 app.js 内部函数） */

var GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
var ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

/* 暗戊地支：寅辰巳申戌 */
var ANWU_ZHI = { '寅':1, '辰':1, '巳':1, '申':1, '戌':1 };

/* 八节 */
var BAJIE = ['立春','春分','立夏','夏至','立秋','秋分','立冬','冬至'];
/* 三元：农历 */
var SANYUAN = { '1-15': '上元天官圣诞', '7-15': '中元地官圣诞', '10-15': '下元水官圣诞' };
/* 五腊：农历 */
var WULA = { '1-1': '天腊之辰', '5-5': '地腊之辰', '7-7': '道德腊之辰', '10-1': '民岁腊之辰', '12-8': '王侯腊之辰' };

function pad(n) { return (n < 10 ? '0' : '') + n; }
function fmtDate(d) {
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/* 生成单个 VEVENT */
function vevent(date, summary, desc, timing) {
  var dt = fmtDate(date);
  var uid = 'wuri-' + dt + '-' + Math.random().toString(36).slice(2, 8) + '@wuribushangxiang';
  var stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  var out = 'BEGIN:VEVENT\n';
  out += 'UID:' + uid + '\n';
  out += 'DTSTAMP:' + stamp + '\n';
  out += 'DTSTART;VALUE=DATE:' + dt + '\n';
  /* 次日 */
  var next = new Date(date.getTime() + 86400000);
  out += 'DTEND;VALUE=DATE:' + fmtDate(next) + '\n';
  out += 'SUMMARY:' + esc(summary) + '\n';
  out += 'DESCRIPTION:' + esc(desc) + '\n';
  if (timing === 'day1' || timing === 'both') {
    out += 'BEGIN:VALARM\nTRIGGER:-P1D\nACTION:DISPLAY\nDESCRIPTION:' + esc('明日：' + summary) + '\nEND:VALARM\n';
  }
  if (timing === 'today' || timing === 'both') {
    out += 'BEGIN:VALARM\nTRIGGER:PT0S\nACTION:DISPLAY\nDESCRIPTION:' + esc(summary) + '\nEND:VALARM\n';
  }
  out += 'END:VEVENT\n';
  return out;
}

/* 主生成函数 */
function generateICS(opts) {
  /* opts: { ming, anwu, baidou, shendan, gengshen, jiazi, bajie, sanyuan, wula, timing } */
  /* timing: 'day1' | 'today' | 'both' */

  var Lunar = window.Lunar;
  if (!Lunar) { alert('历法库未加载'); return null; }

  /* SHENDAN 从 app.js 取（全局 var） */
  var SHENDAN = {};
  try {
    if (typeof window.SHENDAN !== 'undefined') SHENDAN = window.SHENDAN;
  } catch (e) {}

  var calName = '戊日不上香·自定义';
  var ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//wuri//自定义//CN\n';
  ics += 'NAME:' + esc(calName) + '\nX-WR-CALNAME:' + esc(calName) + '\n';
  ics += 'X-WR-TIMEZONE:America/Toronto\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n';

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var end = new Date(today.getTime() + 730 * 86400000); /* 2 年 */

  var count = 0;
  for (var d = new Date(today); d <= end; d = new Date(d.getTime() + 86400000)) {
    var lunar;
    try {
      lunar = Lunar.fromDate(d);
    } catch (e) { continue; }

    var events = []; /* [summary, desc] */

    var ganZhi = lunar.getDayGan() + lunar.getDayZhi();
    var gan = lunar.getDayGan();
    var zhi = lunar.getDayZhi();
    var m = lunar.getMonth();
    var dd = lunar.getDay();
    var md = m + '-' + dd;
    var jq = '';
    try { jq = lunar.getJieQi() || ''; } catch (e) {}

    /* 明戊日 */
    if (opts.ming && gan === '戊') {
      events.push(['戊日 · 不上香', '戊日不朝真。农历' + m + '月' + dd + '日，' + ganZhi + '日。']);
    }
    /* 暗戊日 */
    if (opts.anwu && gan !== '戊' && ANWU_ZHI[zhi]) {
      events.push(['暗戊日 · 提示', '暗戊日（' + ganZhi + '），各派做法不一，仅作提示。']);
    }
    /* 拜斗日：初一、十五 */
    if (opts.baidou && (dd === 1 || dd === 15)) {
      events.push(['拜斗日 · 宜斋戒敬香', (dd === 1 ? '朔日' : '望日') + '礼斗，宜斋戒敬香。']);
    }
    /* 神诞 */
    if (opts.shendan && SHENDAN[md]) {
      events.push([SHENDAN[md], '农历' + m + '月' + dd + '日，宜斋戒敬香。']);
    }
    /* 庚申日 */
    if (opts.gengshen && ganZhi === '庚申') {
      events.push(['庚申日 · 守庚申', '庚申日，宜守庚申。']);
    }
    /* 甲子日 */
    if (opts.jiazi && ganZhi === '甲子') {
      events.push(['甲子日 · 斋醮', '甲子日，宜斋醮。']);
    }
    /* 八节 */
    if (opts.bajie && BAJIE.indexOf(jq) >= 0) {
      events.push(['八节 · ' + jq, jq + '，宜斋戒。']);
    }
    /* 三元 */
    if (opts.sanyuan && SANYUAN[md]) {
      events.push(['三元 · ' + SANYUAN[md], '农历' + md + '，' + SANYUAN[md] + '。']);
    }
    /* 五腊 */
    if (opts.wula && WULA[md]) {
      events.push(['五腊 · ' + WULA[md], '农历' + md + '，' + WULA[md] + '。']);
    }

    /* 节气神诞（冬至/夏至） */
    if (opts.shendan) {
      if (jq === '冬至') events.push(['元始天尊圣诞', '冬至，元始天尊圣诞。']);
      if (jq === '夏至') events.push(['灵宝天尊圣诞', '夏至，灵宝天尊圣诞。']);
    }

    for (var i = 0; i < events.length; i++) {
      ics += vevent(d, events[i][0], events[i][1], opts.timing);
      count++;
    }
  }

  ics += 'END:VCALENDAR\n';
  return { text: ics, count: count };
}

/* 下载 */
function downloadICS(text, filename) {
  var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'wuri-custom.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, 1000);
}

/* 绑定 UI */
function init() {
  var btn = document.getElementById('ics-gen-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var opts = {
      ming: document.getElementById('ics-ming').checked,
      anwu: document.getElementById('ics-anwu').checked,
      baidou: document.getElementById('ics-baidou').checked,
      shendan: document.getElementById('ics-shendan').checked,
      gengshen: document.getElementById('ics-gengshen').checked,
      jiazi: document.getElementById('ics-jiazi').checked,
      bajie: document.getElementById('ics-bajie').checked,
      sanyuan: document.getElementById('ics-sanyuan').checked,
      wula: document.getElementById('ics-wula').checked,
      timing: (document.querySelector('input[name="ics-timing"]:checked') || {}).value || 'both'
    };
    var anyType = opts.ming || opts.anwu || opts.baidou || opts.shendan || opts.gengshen || opts.jiazi || opts.bajie || opts.sanyuan || opts.wula;
    if (!anyType) { alert('请至少勾选一种提醒类型'); return; }

    btn.textContent = '生成中…';
    btn.disabled = true;
    setTimeout(function () {
      try {
        var r = generateICS(opts);
        if (r && r.count > 0) {
          downloadICS(r.text, 'wuri-custom.ics');
          document.getElementById('ics-gen-info').textContent = '已生成 ' + r.count + ' 个事件，请在下载完成后导入到系统日历。';
        } else {
          alert('生成失败，请重试');
        }
      } catch (e) {
        alert('生成出错：' + e.message);
      }
      btn.textContent = '生成我的日历';
      btn.disabled = false;
    }, 50);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.WuriICSGen = { generate: generateICS, download: downloadICS };
})();
