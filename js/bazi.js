/* 戊日不上香 · 八字排盘（Pro）v3
 * 三页：起盘（输入）/ 细盘（专业细盘）/ 记录（历史分组）
 * 细盘严格参照问真八字版式：日期/流年/大运前置三列，主星/干支/藏干/星运/自坐/空亡/纳音/神煞
 * 仅历法推算，不作命理解读。
 */
var Bazi = (function () {
  'use strict';
  function $(s) { return document.querySelector(s); }
  function $all(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function isPro() { return window.WuriPro && WuriPro.isPro(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var LS_HIST = 'wuri_bazi_history_v3';

  var WX_COLOR = { '木': '#2e7d32', '火': '#c62828', '土': '#8d6e00', '金': '#b26a00', '水': '#1565c0' };
  var GAN_WX = { '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土', '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水' };
  var ZHI_WX = { '寅': '木', '卯': '木', '巳': '火', '午': '火', '申': '金', '酉': '金', '亥': '水', '子': '水', '辰': '土', '戌': '土', '丑': '土', '未': '土' };

  /* 十二长生（自坐用） */
  var CS_ORDER = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];
  var CS_START = { '甲': '亥', '丙': '寅', '戊': '寅', '庚': '巳', '壬': '申', '乙': '午', '丁': '酉', '己': '酉', '辛': '子', '癸': '卯' };
  var ZHI_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var YANG_GAN = { '甲': 1, '丙': 1, '戊': 1, '庚': 1, '壬': 1 };
  function ziZuo(gan, zhi) {
    var start = CS_START[gan];
    if (!start) return '';
    var si = ZHI_ORDER.indexOf(start), zi = ZHI_ORDER.indexOf(zhi);
    if (si < 0 || zi < 0) return '';
    var step = YANG_GAN[gan] ? (zi - si + 12) % 12 : (si - zi + 12) % 12;
    return CS_ORDER[step];
  }

  /* 神煞（传统口诀） */
  var TIANYI = { '甲': ['丑', '未'], '戊': ['丑', '未'], '庚': ['丑', '未'], '乙': ['子', '申'], '己': ['子', '申'], '丙': ['亥', '酉'], '丁': ['亥', '酉'], '壬': ['巳', '卯'], '癸': ['巳', '卯'], '辛': ['午', '寅'] };
  var WENCHANG = { '甲': '巳', '乙': '午', '丙': '申', '戊': '申', '丁': '酉', '己': '酉', '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯' };
  var TAIJI = { '甲': ['子', '午'], '乙': ['子', '午'], '丙': ['卯', '酉'], '丁': ['卯', '酉'], '戊': ['辰', '戌', '丑', '未'], '己': ['辰', '戌', '丑', '未'], '庚': ['寅', '亥'], '辛': ['寅', '亥'], '壬': ['巳', '申'], '癸': ['巳', '申'] };
  // 桃花/驿马/华盖：按年支查
  var TAO_SANHE = { '申': '酉', '子': '酉', '辰': '酉', '寅': '卯', '午': '卯', '戌': '卯', '巳': '午', '酉': '午', '丑': '午', '亥': '子', '卯': '子', '未': '子' };
  var YIMA_SANHE = { '申': '寅', '子': '寅', '辰': '寅', '寅': '申', '午': '申', '戌': '申', '巳': '亥', '酉': '亥', '丑': '亥', '亥': '巳', '卯': '巳', '未': '巳' };
  var HUAGAI_SANHE = { '申': '辰', '子': '辰', '辰': '辰', '寅': '戌', '午': '戌', '戌': '戌', '巳': '丑', '酉': '丑', '丑': '丑', '亥': '未', '卯': '未', '未': '未' };
  /* 新增神煞（传统口诀） */
  var TIANDE = { '寅': '丁', '卯': '申', '辰': '壬', '巳': '辛', '午': '亥', '未': '甲', '申': '癸', '酉': '寅', '戌': '丙', '亥': '乙', '子': '巳', '丑': '庚' };
  var YUEDE = { '亥': '甲', '卯': '甲', '未': '甲', '寅': '丙', '午': '丙', '戌': '丙', '巳': '庚', '酉': '庚', '丑': '庚', '申': '壬', '子': '壬', '辰': '壬' };
  var DEXIU = { '亥': ['甲', '乙'], '卯': ['甲', '乙'], '未': ['甲', '乙'], '寅': ['丙', '丁'], '午': ['丙', '丁'], '戌': ['丙', '丁'], '巳': ['庚', '辛'], '酉': ['庚', '辛'], '丑': ['庚', '辛'], '申': ['壬', '癸'], '子': ['壬', '癸'], '辰': ['壬', '癸'] };
  var WANGSHEN = { '申': '亥', '子': '亥', '辰': '亥', '寅': '巳', '午': '巳', '戌': '巳', '巳': '申', '酉': '申', '丑': '申', '亥': '寅', '卯': '寅', '未': '寅' };
  var YANGBLADE = { '甲': '卯', '丙': '午', '戊': '午', '庚': '酉', '壬': '子', '乙': '寅', '丁': '巳', '己': '巳', '辛': '申', '癸': '亥' };
  var LIUXIA = { '甲': '酉', '乙': '戌', '丙': '未', '丁': '申', '戊': '巳', '己': '午', '庚': '辰', '辛': '卯', '壬': '亥', '癸': '寅' };
  var LUSHEN = { '甲': '寅', '乙': '卯', '丙': '巳', '丁': '午', '戊': '巳', '己': '午', '庚': '申', '辛': '酉', '壬': '亥', '癸': '子' };
  var BAZHUAN = ['甲寅', '乙卯', '己未', '丁未', '庚申', '辛酉'];
  function shensha(dayGan, yearZhi, zhi, monthZhi, dayZhi, pillarGz, stem) {
    var out = [];
    if ((TIANYI[dayGan] || []).indexOf(zhi) >= 0) out.push('天乙贵人');
    if (WENCHANG[dayGan] === zhi) out.push('文昌贵人');
    if ((TAIJI[dayGan] || []).indexOf(zhi) >= 0) out.push('太极贵人');
    if (TAO_SANHE[yearZhi] === zhi) out.push('桃花');
    if (YIMA_SANHE[yearZhi] === zhi) out.push('驿马');
    if (HUAGAI_SANHE[yearZhi] === zhi) out.push('华盖');
    // 天德/月德/德秀（按月支查天干）
    if (TIANDE[monthZhi] === stem) out.push('天德贵人');
    if (YUEDE[monthZhi] === stem) out.push('月德贵人');
    if ((DEXIU[monthZhi] || []).indexOf(stem) >= 0) out.push('德秀贵人');
    // 亡神（按日支三合）
    if (WANGSHEN[dayZhi] === zhi) out.push('亡神');
    // 羊刃/流霞/禄神（按日干）
    if (YANGBLADE[dayGan] === zhi) out.push('羊刃');
    if (LIUXIA[dayGan] === zhi) out.push('流霞');
    if (LUSHEN[dayGan] === zhi) out.push('禄神');
    // 四废日（按月令季节+日柱）
    var season = { '寅': '春', '卯': '春', '辰': '春', '巳': '夏', '午': '夏', '未': '夏', '申': '秋', '酉': '秋', '戌': '秋', '亥': '冬', '子': '冬', '丑': '冬' }[monthZhi];
    var sifei = { '春': ['庚申', '辛酉'], '夏': ['壬子', '癸亥'], '秋': ['甲寅', '乙卯'], '冬': ['丙午', '丁巳'] }[season] || [];
    if (sifei.indexOf(pillarGz) >= 0) out.push('四废日');
    // 八专日
    if (BAZHUAN.indexOf(pillarGz) >= 0) out.push('八专日');
    // 天医（按月支）
    var TIANYI2 = { '寅': '卯', '卯': '辰', '辰': '巳', '巳': '午', '午': '未', '未': '申', '申': '酉', '酉': '戌', '戌': '亥', '亥': '子', '子': '丑', '丑': '寅' };
    if (TIANYI2[monthZhi] === zhi) out.push('天医');
    // 劫煞/灾煞（按年支三合）
    var JIESHA = { '申': '巳', '子': '巳', '辰': '巳', '寅': '亥', '午': '亥', '戌': '亥', '巳': '寅', '酉': '寅', '丑': '寅', '亥': '申', '卯': '申', '未': '申' };
    var ZAISHA = { '申': '午', '子': '午', '辰': '午', '寅': '子', '午': '子', '戌': '子', '巳': '卯', '酉': '卯', '丑': '卯', '亥': '酉', '卯': '酉', '未': '酉' };
    if (JIESHA[yearZhi] === zhi) out.push('劫煞');
    if (ZAISHA[yearZhi] === zhi) out.push('灾煞');
    // 将星（按年支三合）
    var JIANGXING = { '寅': '午', '午': '午', '戌': '午', '申': '子', '子': '子', '辰': '子', '巳': '酉', '酉': '酉', '丑': '酉', '亥': '卯', '卯': '卯', '未': '卯' };
    if (JIANGXING[yearZhi] === zhi) out.push('将星');
    // 金舆（按日干）
    var JINYU = { '甲': '辰', '乙': '巳', '丙': '未', '丁': '申', '戊': '未', '己': '申', '庚': '戌', '辛': '亥', '壬': '丑', '癸': '寅' };
    if (JINYU[dayGan] === zhi) out.push('金舆');
    // 红鸾/天喜（按年支）
    var HONGLUAN = { '子': '卯', '丑': '寅', '寅': '丑', '卯': '子', '辰': '亥', '巳': '戌', '午': '酉', '未': '申', '申': '未', '酉': '午', '戌': '巳', '亥': '辰' };
    var TIANXI = { '子': '酉', '丑': '申', '寅': '未', '卯': '午', '辰': '巳', '巳': '辰', '午': '卯', '未': '寅', '申': '丑', '酉': '子', '戌': '亥', '亥': '戌' };
    if (HONGLUAN[yearZhi] === zhi) out.push('红鸾');
    if (TIANXI[yearZhi] === zhi) out.push('天喜');
    // 孤辰/寡宿（按年支）
    var GUCHEN = { '亥': '寅', '子': '寅', '丑': '寅', '寅': '巳', '卯': '巳', '辰': '巳', '巳': '申', '午': '申', '未': '申', '申': '亥', '酉': '亥', '戌': '亥' };
    var GUASU = { '亥': '戌', '子': '戌', '丑': '戌', '寅': '丑', '卯': '丑', '辰': '丑', '巳': '辰', '午': '辰', '未': '辰', '申': '未', '酉': '未', '戌': '未' };
    if (GUCHEN[yearZhi] === zhi) out.push('孤辰');
    if (GUASU[yearZhi] === zhi) out.push('寡宿');
    // 大耗（按年支对冲）
    var DAHAO = { '子': '午', '丑': '未', '寅': '申', '卯': '酉', '辰': '戌', '巳': '亥', '午': '子', '未': '丑', '申': '寅', '酉': '卯', '戌': '辰', '亥': '巳' };
    if (DAHAO[yearZhi] === zhi) out.push('大耗');
    // 国印贵人（按年干/日干）
    var GUOYIN = { '甲': '戌', '乙': '亥', '丙': '丑', '丁': '寅', '戊': '丑', '己': '寅', '庚': '辰', '辛': '巳', '壬': '未', '癸': '申' };
    if (GUOYIN[dayGan] === zhi) out.push('国印贵人');
    // 魁罡日（特定日柱）
    if (['庚辰', '庚戌', '壬辰', '戊戌'].indexOf(pillarGz) >= 0) out.push('魁罡');
    // 十恶大败日
    if (['甲辰', '乙巳', '丙申', '丁亥', '戊戌', '己丑', '庚辰', '辛巳', '壬申', '癸亥'].indexOf(pillarGz) >= 0) out.push('十恶大败');
    // 天罗地网（按日支）
    if (['戌', '亥'].indexOf(dayZhi) >= 0 && ['戌', '亥'].indexOf(zhi) >= 0) out.push('天罗');
    if (['辰', '巳'].indexOf(dayZhi) >= 0 && ['辰', '巳'].indexOf(zhi) >= 0) out.push('地网');
    // 孤鸾煞（特定日柱）
    if (['乙巳', '丁巳', '辛亥', '戊申', '壬寅', '戊午', '壬子', '丙午'].indexOf(pillarGz) >= 0) out.push('孤鸾');
    // 阴阳差错日
    if (['丙子', '丁丑', '戊寅', '辛卯', '壬辰', '癸巳', '丙午', '丁未', '戊申', '辛酉', '壬戌', '癸亥'].indexOf(pillarGz) >= 0) out.push('阴阳差错');
    // 天德合/月德合（天干五合）
    var HE = { '甲': '己', '己': '甲', '乙': '庚', '庚': '乙', '丙': '辛', '辛': '丙', '丁': '壬', '壬': '丁', '戊': '癸', '癸': '戊' };
    var tiande = { '寅': '丁', '卯': '申', '辰': '壬', '巳': '辛', '午': '亥', '未': '甲', '申': '癸', '酉': '寅', '戌': '丙', '亥': '乙', '子': '巳', '丑': '庚' }[monthZhi];
    var yuede = { '亥': '甲', '卯': '甲', '未': '甲', '寅': '丙', '午': '丙', '戌': '丙', '巳': '庚', '酉': '庚', '丑': '庚', '申': '壬', '子': '壬', '辰': '壬' }[monthZhi];
    if (tiande && HE[tiande] === stem) out.push('天德合');
    if (yuede && HE[yuede] === stem) out.push('月德合');
    return out.join(' ');
  }

  var curData = null;      // 当前排盘数据
  var selDayunIdx = 0;     // 选中的大运序号
  var privacyOn = false;   // 隐私模式

  function open() {
    if (!isPro()) { window.WuriPro && WuriPro.requirePro('bazi'); return; }
    $('#bazi-view').hidden = false;
    showTab('input');
    window.scrollTo(0, 0);
  }
  function close() {
    $('#bazi-view').hidden = true;
  }

  function showTab(which) {
    $all('[data-bztab]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-bztab') === which);
    });
    $('#bz-tab-input').hidden = which !== 'input';
    $('#bz-tab-result').hidden = which !== 'result';
    $('#bz-tab-history').hidden = which !== 'history';
    if (which === 'history') renderHistory();
    if (which === 'input') initInputDefaults();
  }

  function loadHist() {
    try { return JSON.parse(localStorage.getItem(LS_HIST) || '[]'); } catch (e) { return []; }
  }
  function saveHist(l) { try { localStorage.setItem(LS_HIST, JSON.stringify(l)); } catch (e) {} }

  function initInputDefaults() {
    var d = $('#bz-date');
    if (d && !d.value) {
      var now = new Date();
      d.value = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    }
    if (d) d.max = new Date().toISOString().slice(0, 10);
  }

  function trueSolar(y, m, d, h, mi, lon) {
    var dt = new Date(y, m - 1, d, h, mi);
    var off = Math.round((lon - 120) * 4);
    dt = new Date(dt.getTime() + off * 60000);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(), h: dt.getHours(), mi: dt.getMinutes(), off: off };
  }

  function buildData(p) {
    var y = p.y, m = p.m, d = p.d, hh = p.hh, mm = p.mm, tsInfo = null;
    if (p.useTrue && !isNaN(p.lon)) {
      tsInfo = trueSolar(y, m, d, hh, mm, p.lon);
      y = tsInfo.y; m = tsInfo.m; d = tsInfo.d; hh = tsInfo.h; mm = tsInfo.mi;
    }
    if (!window.Solar) throw new Error('历法库未加载');
    var solar;
    if (p.cal === 'lunar') {
      var ln = window.Lunar.fromYmd(y, m, d);
      solar = ln.getSolar();
      if (p.hasTime) solar = window.Solar.fromYmdHms(solar.getYear(), solar.getMonth(), solar.getDay(), hh, mm, 0);
    } else if (p.hasTime) {
      solar = window.Solar.fromYmdHms(y, m, d, hh, mm, 0);
    } else {
      solar = window.Solar.fromYmd(y, m, d);
    }
    var lunar = solar.getLunar();
    return {
      name: p.name, gender: p.gender, cal: p.cal, dateStr: p.dateStr,
      hasTime: p.hasTime, tsInfo: tsInfo, group: p.group, cityName: p.cityName,
      ec: lunar.getEightChar(), lunar: lunar,
      y: solar.getYear(), m: solar.getMonth(), d: solar.getDay()
    };
  }

  function doPaipan() {
    var date = $('#bz-date').value;
    if (!date) { alert('请选择出生日期'); return; }
    var a = date.split('-'), y = +a[0], m = +a[1], d = +a[2];
    var now = new Date(); now.setHours(0, 0, 0, 0);
    if (new Date(y, m - 1, d) > now) { alert('出生日期不能是未来'); return; }
    var timeStr = $('#bz-time').value, hasTime = !!timeStr, hh = 0, mm = 0;
    if (hasTime) { var ta = timeStr.split(':'); hh = +ta[0]; mm = +ta[1]; }
    var g = document.querySelector('input[name="bz-gender"]:checked');
    var gender = g ? +g.value : 1;
    var c = document.querySelector('input[name="bz-cal"]:checked');
    var cal = c ? c.value : 'solar';
    var useTrue = $('#bz-true').checked;
    // 城市（任务9会换成分级选择器，先保留简单版）
    var lon = parseFloat($('#bz-lon') ? $('#bz-lon').value : '116.42');
    var cityName = $('#bz-cityname') ? $('#bz-cityname').value : '';

    var p = {
      name: ($('#bz-name').value || '').trim(), gender: gender, cal: cal,
      dateStr: date + (hasTime ? ' ' + timeStr : ''),
      y: y, m: m, d: d, hh: hh, mm: mm, hasTime: hasTime,
      useTrue: useTrue, lon: lon, cityName: cityName,
      group: ($('#bz-group').value || '').trim()
    };
    var data;
    try { data = buildData(p); } catch (e) { alert('排盘失败：' + e.message); return; }

    if ($('#bz-save').checked) {
      var hist = loadHist();
      hist.unshift({
        name: p.name, gender: p.gender, cal: p.cal, dateStr: p.dateStr, group: p.group,
        y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm, hasTime: p.hasTime,
        useTrue: p.useTrue, lon: p.lon, cityName: p.cityName,
        // 存四柱用于列表预览
        gz: [data.ec.getYear(), data.ec.getMonth(), data.ec.getDay(), p.hasTime ? data.ec.getTime() : '']
      });
      if (hist.length > 300) {
        hist = hist.slice(0, 300);
        try {
          if (!localStorage.getItem('wuri_bazi_hist_warned')) {
            localStorage.setItem('wuri_bazi_hist_warned', '1');
            setTimeout(function () { alert('八字历史已满300条，新记录将覆盖最早的记录。'); }, 500);
          }
        } catch (e) {}
      }
      saveHist(hist);
    }
    curData = data;
    selDayunIdx = 0;
    privacyOn = false;
    renderResult();
    showTab('result');
  }

  function wxSpan(ch, wx) {
    return '<span style="color:' + (WX_COLOR[wx] || '') + '">' + esc(ch) + '</span>';
  }

  function renderResult() {
    if (!curData) return;
    var data = curData, ec = data.ec;
    var host = $('#bz-tab-result');

    var dayGan = ec.getDayGan(), yearZhi = ec.getYearZhi();
    var pillars = [
      { k: 'year', label: '年柱' }, { k: 'month', label: '月柱' },
      { k: 'day', label: '日柱' }, { k: 'time', label: '时柱' }
    ];
    var cols = pillars.map(function (p) {
      if (p.k === 'time' && !data.hasTime) return null;
      var cap = p.k.charAt(0).toUpperCase() + p.k.slice(1);
      var col = { label: p.label };
      try {
        col.gan = ec['get' + cap + 'Gan']();
        col.zhi = ec['get' + cap + 'Zhi']();
        col.ssGan = ec['get' + cap + 'ShiShenGan']();
        col.hide = ec['get' + cap + 'HideGan']() || [];
        col.ssZhi = ec['get' + cap + 'ShiShenZhi']() || [];
        col.nayin = ec['get' + cap + 'NaYin']();
        col.dishi = ec['get' + cap + 'DiShi'](); // 星运=日干对各支
        col.zizuo = ziZuo(col.gan, col.zhi);     // 自坐=本干坐本支
        col.xunkong = ec['get' + cap + 'XunKong']();
        col.shensha = shensha(dayGan, yearZhi, col.zhi, ec.getMonthZhi(), ec.getDayZhi(), col.gan + col.zhi, col.gan);
      } catch (e) { return null; }
      return col;
    });

    // 大运
    var yun = null, dys = [];
    try {
      yun = ec.getYun(data.gender);
      dys = yun.getDaYun(10);
    } catch (e) {}

    // 当前选中的大运/流年（用于前置三列）
    var selDy = dys[selDayunIdx + 1] || null; // dys[0]是起运前，dys[1]是第一步大运
    var selDyGz = '', selDySs = '';
    if (selDy) { try { selDyGz = selDy.getGanZhi(); selDySs = selDy.getGanZhiShiShen ? '' : ''; } catch (e) {} }

    var html = '';

    // 头部：姓名 + 隐私开关
    var dispName = privacyOn ? '＊＊＊' : esc(data.name || '未命名');
    var dispBirth = privacyOn ? '＊＊＊' : esc((data.cal === 'lunar' ? '农历 ' : '阳历 ') + data.dateStr);
    html += '<div class="bz-r-head">'
      + '<div class="bz-r-top"><span class="bz-r-name">' + dispName + '</span>'
      + '<button class="mini-btn tiny" id="bz-privacy">' + (privacyOn ? '显示' : '隐藏') + '</button></div>'
      + '<div class="bz-r-sub">' + esc(data.lunar.getYearShengXiao() + '年') + ' · '
      + esc(data.gender === 1 ? '乾造' : '坤造') + ' · ' + dispBirth
      + (data.tsInfo && !privacyOn ? '（真太阳时' + (data.tsInfo.off >= 0 ? '+' : '') + data.tsInfo.off + '分，未含均时差）' : '')
      + '</div></div>';

    // 主表
    html += '<div class="bz-table-wrap"><table class="bz-table">';
    // 表头：日期/流年/大运/年柱/月柱/日柱/时柱
    html += '<tr><th>日期</th><th>流年</th><th>大运</th>'
      + cols.map(function (c) { return '<th>' + (c ? c.label : '') + '</th>'; }).join('') + '</tr>';

    // 主星行
    html += '<tr><td class="bz-rowh">主星</td>';
    // 流年主星（对日干的十神）
    var lnGan = '', lnZhi = '';
    // 大运主星
    html += '<td class="bz-ss" id="bz-c-liunian-ss">-</td><td class="bz-ss" id="bz-c-dayun-ss">-</td>';
    html += cols.map(function (c) {
      if (!c) return '<td></td>';
      var ss = c.label === '日柱' ? '日主' : (c.ssGan || '');
      return '<td class="bz-ss">' + esc(ss) + '</td>';
    }).join('') + '</tr>';

    // 天干
    html += '<tr><td class="bz-rowh">天干</td><td id="bz-c-liunian-gan">-</td><td id="bz-c-dayun-gan">-</td>'
      + cols.map(function (c) {
        return c ? '<td class="bz-gan">' + wxSpan(c.gan, GAN_WX[c.gan]) + '</td>' : '<td></td>';
      }).join('') + '</tr>';
    // 地支
    html += '<tr><td class="bz-rowh">地支</td><td id="bz-c-liunian-zhi">-</td><td id="bz-c-dayun-zhi">-</td>'
      + cols.map(function (c) {
        return c ? '<td class="bz-zhi">' + wxSpan(c.zhi, ZHI_WX[c.zhi]) + '</td>' : '<td></td>';
      }).join('') + '</tr>';
    // 藏干（问真式：干支同行，一行一组）
    html += '<tr><td class="bz-rowh">藏干</td><td>-</td><td>-</td>'
      + cols.map(function (c) {
        if (!c) return '<td></td>';
        var t = c.hide.map(function (g, i) {
          return '<div class="bz-cg-line">' + wxSpan(g, GAN_WX[g]) + '<span class="bz-cg-ss">' + esc(c.ssZhi[i] || '') + '</span></div>';
        }).join('');
        return '<td class="bz-hide">' + t + '</td>';
      }).join('') + '</tr>';
    // 星运
    html += '<tr><td class="bz-rowh">星运</td><td>-</td><td>-</td>'
      + cols.map(function (c) { return c ? '<td>' + esc(c.dishi) + '</td>' : '<td></td>'; }).join('') + '</tr>';
    // 自坐
    html += '<tr><td class="bz-rowh">自坐</td><td>-</td><td>-</td>'
      + cols.map(function (c) { return c ? '<td>' + esc(c.zizuo) + '</td>' : '<td></td>'; }).join('') + '</tr>';
    // 空亡
    html += '<tr><td class="bz-rowh">空亡</td><td>-</td><td>-</td>'
      + cols.map(function (c) { return c ? '<td>' + esc(c.xunkong) + '</td>' : '<td></td>'; }).join('') + '</tr>';
    // 纳音
    html += '<tr><td class="bz-rowh">纳音</td><td>-</td><td>-</td>'
      + cols.map(function (c) { return c ? '<td>' + esc(c.nayin) + '</td>' : '<td></td>'; }).join('') + '</tr>';
    // 神煞（全展示）
    html += '<tr><td class="bz-rowh">神煞</td><td>-</td><td>-</td>'
      + cols.map(function (c) {
        if (!c) return '<td></td>';
        var items = (c.shensha || '').split(/\s+/).filter(Boolean);
        var t = items.map(function (s) { return '<span class="bz-ss-item">' + esc(s) + '</span>'; }).join('');
        return '<td class="bz-shensha">' + t + '</td>';
      }).join('') + '</tr>';
    html += '</table></div>';


    // 起运/交运
    if (yun) {
      try {
        html += '<div class="bz-yun-info">起运：出生后' + yun.getStartYear() + '年' + yun.getStartMonth() + '月' + yun.getStartDay() + '天起运'
          + ' · 交运：' + (yun.isForward() ? '顺行' : '逆行') + '</div>';
      } catch (e) {}
    }

    // 大运选择器
    html += '<div class="bz-sec-t">大运 <span class="muted">（点击切换）</span></div>';
    html += '<div class="bz-hscroll"><table class="bz-htable"><tr id="bz-dayun-row">';
    for (var i = 1; i < dys.length && i <= 8; i++) {
      var gz = '', sa = '';
      try { gz = dys[i].getGanZhi(); sa = dys[i].getStartAge(); } catch (e) {}
      if (!gz) continue;
      var sel = (i - 1 === selDayunIdx) ? ' sel' : '';
      html += '<td class="bz-dy-cell' + sel + '" data-dyi="' + (i - 1) + '">'
        + '<div class="bz-hgz">' + wxSpan(gz.charAt(0), GAN_WX[gz.charAt(0)]) + wxSpan(gz.charAt(1), ZHI_WX[gz.charAt(1)]) + '</div>'
        + '<div class="bz-hage">' + sa + '岁</div></td>';
    }
    html += '</tr></table></div>';

    // 流年（选中大运的10年）
    html += '<div class="bz-sec-t">流年</div><div class="bz-hscroll"><table class="bz-htable"><tr id="bz-liunian-row"></tr></table></div>';
    // 流月
    html += '<div class="bz-sec-t">流月 <span class="muted" id="bz-liuyue-year"></span></div><div class="bz-hscroll"><table class="bz-htable"><tr id="bz-liuyue-row"></tr></table></div>';

    html += '<p class="hint bz-disclaimer">以上为传统历法推算，仅供参考，不作命理解读。</p>';

    host.innerHTML = html;

    // 绑定
    $('#bz-privacy').addEventListener('click', function () {
      privacyOn = !privacyOn;
      renderResult();
    });
    $all('.bz-dy-cell').forEach(function (el) {
      el.addEventListener('click', function () {
        selDayunIdx = +el.getAttribute('data-dyi');
        renderResult();
      });
    });

    updateLiunianLiuyue();
  }

  function updateLiunianLiuyue() {
    if (!curData) return;
    var ec = curData.ec, dys = [];
    try { dys = ec.getYun(curData.gender).getDaYun(10); } catch (e) { return; }
    var selDy = dys[selDayunIdx + 1];
    if (!selDy) return;

    // 大运干支填入前置列
    var dg = '', dz = '';
    try {
      var gzz = selDy.getGanZhi();
      dg = gzz.charAt(0); dz = gzz.charAt(1);
    } catch (e) {}
    var el = $('#bz-c-dayun-gan');
    if (el) el.innerHTML = wxSpan(dg, GAN_WX[dg]);
    el = $('#bz-c-dayun-zhi');
    if (el) el.innerHTML = wxSpan(dz, ZHI_WX[dz]);

    // 流年：大运起始年起10年
    var startAge = 0;
    try { startAge = selDy.getStartAge(); } catch (e) {}
    var birthY = curData.y;
    var lrHtml = '';
    var curYear = new Date().getFullYear();
    var selYear = null;
    for (var k = 0; k < 10; k++) {
      var yy = birthY + startAge + k;
      var lz;
      try { lz = window.Solar.fromYmd(yy, 6, 15).getLunar(); } catch (e) { continue; }
      var lg = lz.getYearGan(), lzh = lz.getYearZhi();
      var isCur = yy === curYear;
      if (isCur) selYear = yy;
      lrHtml += '<td class="bz-ly-cell' + (isCur ? ' sel' : '') + '" data-y="' + yy + '">'
        + '<div class="bz-hage">' + yy + '</div>'
        + '<div class="bz-hgz">' + wxSpan(lg, GAN_WX[lg]) + wxSpan(lzh, ZHI_WX[lzh]) + '</div></td>';
    }
    var lr = $('#bz-liunian-row');
    if (lr) {
      lr.innerHTML = lrHtml;
      $all('.bz-ly-cell').forEach(function (cell) {
        cell.addEventListener('click', function () {
          $all('.bz-ly-cell').forEach(function (c) { c.classList.remove('sel'); });
          cell.classList.add('sel');
          updateLiuyue(+cell.getAttribute('data-y'));
          // 更新前置流年列
          updateLiunianCol(+cell.getAttribute('data-y'));
        });
      });
    }
    // 默认选中今年（或第一年），更新流月
    updateLiuyue(selYear || (birthY + startAge));
    updateLiunianCol(selYear || (birthY + startAge));
  }

  function updateLiunianCol(yy) {
    try {
      var lz = window.Solar.fromYmd(yy, 6, 15).getLunar();
      var lg = lz.getYearGan(), lzh = lz.getYearZhi();
      var el = $('#bz-c-liunian-gan');
      if (el) el.innerHTML = wxSpan(lg, GAN_WX[lg]);
      el = $('#bz-c-liunian-zhi');
      if (el) el.innerHTML = wxSpan(lzh, ZHI_WX[lzh]);
    } catch (e) {}
  }

  function updateLiuyue(yy) {
    if (!yy) return;
    var yl = $('#bz-liuyue-year');
    if (yl) yl.textContent = '（' + yy + '年）';
    var html = '';
    var jieqi = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒'];
    for (var mi = 0; mi < 12; mi++) {
      // 用节气日取月柱
      var md = [4, 6, 6, 6, 6, 7, 8, 8, 9, 8, 7, 6][mi]; // 粗略节气日
      var mm = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1][mi];
      var yyy = mm === 1 ? yy + 1 : yy;
      try {
        var lz = window.Solar.fromYmd(yyy, mm, md).getLunar();
        var mg = lz.getMonthGan(), mzh = lz.getMonthZhi();
        html += '<td><div class="bz-hage">' + jieqi[mi] + '</div>'
          + '<div class="bz-hgz">' + wxSpan(mg, GAN_WX[mg]) + wxSpan(mzh, ZHI_WX[mzh]) + '</div></td>';
      } catch (e) {}
    }
    var lr = $('#bz-liuyue-row');
    if (lr) lr.innerHTML = html;
  }

  function renderHistory() {
    var list = loadHist();
    var host = $('#bz-hist-list');
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '<p class="hint">暂无保存的排盘</p>';
      return;
    }
    // 按分组
    var groups = {}, order = [];
    list.forEach(function (it, i) {
      var g = it.group || '未分组';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push({ it: it, idx: i });
    });
    var html = '';
    order.forEach(function (g) {
      html += '<div class="bz-hg-t">' + esc(g) + '（' + groups[g].length + '）</div>';
      groups[g].forEach(function (e) {
        var it = e.it;
        var gz = it.gz || ['', '', '', ''];
        var gzHtml = '<div class="bz-hg-gz">'
          + gz.map(function (gzz) {
            if (!gzz || gzz.length < 2) return '<span></span>';
            return '<span>' + wxSpan(gzz.charAt(0), GAN_WX[gzz.charAt(0)]) + wxSpan(gzz.charAt(1), ZHI_WX[gzz.charAt(1)]) + '</span>';
          }).join('') + '</div>';
        html += '<div class="bz-hist-item" data-hi="' + e.idx + '">'
          + '<div class="bz-hi-main"><div><b>' + esc(it.name || '未命名') + '</b> '
          + '<span class="muted">' + esc(it.gender === 1 ? '男' : '女') + '</span></div>'
          + '<div class="muted small">' + esc(it.dateStr) + '</div></div>'
          + gzHtml
          + '</div>';
      });
    });
    host.innerHTML = html;
    host.querySelectorAll('.bz-hist-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var it = loadHist()[+el.getAttribute('data-hi')];
        if (it) replay(it);
      });
    });
  }

  function replay(it) {
    $('#bz-name').value = it.name || '';
    $all('input[name="bz-gender"]').forEach(function (r) { r.checked = (+r.value === it.gender); });
    $all('input[name="bz-cal"]').forEach(function (r) { r.checked = (r.value === it.cal); });
    $('#bz-date').value = it.dateStr.slice(0, 10);
    $('#bz-time').value = it.hasTime ? it.dateStr.slice(11) : '';
    $('#bz-group').value = it.group || '';
    var p = {
      name: it.name, gender: it.gender, cal: it.cal, dateStr: it.dateStr,
      y: it.y, m: it.m, d: it.d, hh: it.hh, mm: it.mm, hasTime: it.hasTime,
      useTrue: it.useTrue, lon: it.lon, cityName: it.cityName, group: it.group
    };
    try { curData = buildData(p); } catch (e) { alert('排盘失败：' + e.message); return; }
    selDayunIdx = 0; privacyOn = false;
    renderResult();
    showTab('result');
  }

  /* ---------- 城市选择器 ---------- */
  var cityNav = []; // 导航栈
  function renderCityNav() {
    var nav = $('#bz-city-nav');
    if (!nav) return;
    var html = '<button class="bz-cn" data-lv="-1">全部</button>';
    cityNav.forEach(function (n, i) {
      html += ' › <button class="bz-cn" data-lv="' + i + '">' + esc(n) + '</button>';
    });
    nav.innerHTML = html;
    nav.querySelectorAll('.bz-cn').forEach(function (b) {
      b.addEventListener('click', function () {
        var lv = +b.getAttribute('data-lv');
        cityNav = lv < 0 ? [] : cityNav.slice(0, lv + 1);
        renderCityList('');
      });
    });
  }
  function renderCityList(kw) {
    var list = $('#bz-city-list');
    if (!list) return;
    kw = (kw || '').trim();
    var html = '';
    function cityBtn(name, lon, lat, sub) {
      return '<button class="bz-city-item" data-name="' + esc(name) + '" data-lon="' + lon + '" data-sub="' + esc(sub || '') + '">'
        + esc(name) + '<span class="muted small"> ' + lon + '°</span></button>';
    }
    if (kw) {
      // 搜索全部
      CITY_DATA.forEach(function (prov) {
        if (prov.countries) {
          prov.countries.forEach(function (ct) {
            ct.cities.forEach(function (c) {
              if (c[0].indexOf(kw) >= 0) html += cityBtn(c[0], c[1], c[2], ct.n);
            });
          });
        } else {
          prov.cities.forEach(function (c) {
            if (c[0].indexOf(kw) >= 0 || prov.p.indexOf(kw) >= 0) html += cityBtn(c[0], c[1], c[2], prov.p);
          });
        }
      });
      if (!html) html = '<p class="hint">无匹配城市</p>';
    } else if (cityNav.length === 0) {
      CITY_DATA.forEach(function (prov) {
        html += '<button class="bz-city-item bz-prov" data-prov="' + esc(prov.p) + '">' + esc(prov.p) + ' ›</button>';
      });
    } else if (cityNav.length === 1) {
      var pv = CITY_DATA.filter(function (x) { return x.p === cityNav[0]; })[0];
      if (pv) {
        if (pv.countries) {
          pv.countries.forEach(function (ct) {
            html += '<button class="bz-city-item bz-prov" data-country="' + esc(ct.n) + '">' + esc(ct.n) + ' ›</button>';
          });
        } else {
          pv.cities.forEach(function (c) { html += cityBtn(c[0], c[1], c[2], pv.p); });
        }
      }
    } else if (cityNav.length === 2) {
      var pv2 = CITY_DATA.filter(function (x) { return x.p === cityNav[0]; })[0];
      if (pv2 && pv2.countries) {
        var ct2 = pv2.countries.filter(function (x) { return x.n === cityNav[1]; })[0];
        if (ct2) ct2.cities.forEach(function (c) { html += cityBtn(c[0], c[1], c[2], ct2.n); });
      }
    }
    list.innerHTML = html;
    renderCityNav();
    list.querySelectorAll('[data-prov]').forEach(function (b) {
      b.addEventListener('click', function () { cityNav.push(b.getAttribute('data-prov')); renderCityList(''); });
    });
    list.querySelectorAll('[data-country]').forEach(function (b) {
      b.addEventListener('click', function () { cityNav.push(b.getAttribute('data-country')); renderCityList(''); });
    });
    list.querySelectorAll('[data-lon]').forEach(function (b) {
      b.addEventListener('click', function () {
        var nm = b.getAttribute('data-name'), lon = b.getAttribute('data-lon');
        $('#bz-lon').value = lon;
        $('#bz-cityname').value = nm;
        $('#bz-city-btn').textContent = nm + ' ' + lon + '°';
        $('#bz-city-modal').hidden = true;
      });
    });
  }
  function initCityPicker() {
    var btn = $('#bz-city-btn'), modal = $('#bz-city-modal');
    if (!btn || !modal || typeof CITY_DATA === 'undefined') return;
    btn.addEventListener('click', function () {
      cityNav = []; renderCityList(''); $('#bz-city-search').value = '';
      modal.hidden = false;
    });
    $('#bz-city-close').addEventListener('click', function () { modal.hidden = true; });
    $('#bz-city-search').addEventListener('input', function () { renderCityList(this.value); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });
  }

  function init() {
    var entry = $('#bazi-enter');
    if (entry) entry.addEventListener('click', open);
    var back = $('#bazi-back');
    if (back) back.addEventListener('click', close);
    $all('[data-bztab]').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-bztab')); });
    });
    var go = $('#bz-go');
    if (go) go.addEventListener('click', doPaipan);
    initCityPicker();
    // citydata.js 需在 index.html 中引入
    if (typeof CITY_DATA === 'undefined') {
      var s = document.createElement('script');
      s.src = 'js/citydata.js';
      document.head.appendChild(s);
    }
  }

  return { init: init, open: open, close: close, showTab: showTab };
})();

document.addEventListener('DOMContentLoaded', function () { Bazi.init(); });
