/* 紫微斗数排盘 · Pro · 基于 iztro */
(function () {
'use strict';
var $ = function (s) { return document.querySelector(s); };
var isPro = function () { return window.WuriPro && WuriPro.isPro(); };
var privacyOn = false;
// 宫位顺序：传统4x4布局，索引对应
// 0命宫 1兄弟 2夫妻 3子女 4财帛 5疾厄 6迁移 7交友 8官禄 9田宅 10福德 11父母
var PALACE_GRID = [6, 5, 4, 3, 7, null, null, 2, 8, null, null, 1, 9, 10, 11, 0];
function openView() {
  if (!isPro()) { if (window.WuriPro) WuriPro.showPaywall('ziwei'); return; }
  ['view-ziwei'].forEach(function (id) { var v = document.getElementById(id); if (v) v.hidden = false; });
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
  window.scrollTo(0, 0);
}
function closeView() {
  var v = document.getElementById('view-ziwei'); if (v) v.hidden = true;
  var home = document.getElementById('tab-home'); if (home) home.classList.add('active');
}
function switchTab(name) {
  document.querySelectorAll('[data-zwtab]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-zwtab') === name);
  });
  ['input', 'result', 'history'].forEach(function (n) {
    var el = document.getElementById('zw-tab-' + n);
    if (el) el.hidden = (n !== name);
  });
  if (name === 'history') renderHistory();
}
function saveHistory(entry) {
  try {
    var arr = JSON.parse(localStorage.getItem('wuri_zw_history') || '[]');
    arr.unshift(entry);
    if (arr.length > 300) arr = arr.slice(0, 300);
    localStorage.setItem('wuri_zw_history', JSON.stringify(arr));
  } catch (e) {}
}
function renderHistory() {
  var host = $('#zw-history-list'); if (!host) return;
  var arr = [];
  try { arr = JSON.parse(localStorage.getItem('wuri_zw_history') || '[]'); } catch (e) {}
  if (!arr.length) { host.innerHTML = '<p class="hint">暂无记录</p>'; return; }
  host.innerHTML = arr.map(function (h, i) {
    return '<div class="jing-hl-item" data-zw-hist="' + i + '"><div>' + h.label + '</div>'
      + '<div class="hl-meta">' + h.ts + '</div></div>';
  }).join('');
  host.querySelectorAll('[data-zw-hist]').forEach(function (el) {
    el.addEventListener('click', function () {
      var h = arr[+el.getAttribute('data-zw-hist')];
      if (h) { doCalc(h.date, h.time, h.gender, true, { name: h.name, cal: h.cal }); switchTab('result'); }
    });
  });
}
function starHtml(stars) {
  return stars.map(function (s) {
    var cls = s.type === 'major' ? 'zw-major' : (s.type === 'soft' ? 'zw-soft' : 'zw-minor');
    var bright = s.brightness ? '<span class="zw-bright">' + s.brightness + '</span>' : '';
    var hua = s.mutagen ? '<span class="zw-hua">' + s.mutagen + '</span>' : '';
    return '<span class="' + cls + '">' + s.name + bright + hua + '</span>';
  }).join('');
}
function doCalc(dateStr, timeIdx, gender, fromHist, extra) {
  if (!window.iztro) { $('#zw-chart').innerHTML = '<p class="hint">排盘库加载失败</p>'; return; }
  // 加载页
  var chartEl = $('#zw-chart');
  chartEl.innerHTML = '<div class="zw-loading"><div class="zw-loading-title">正在起盘…</div><div class="zw-loading-bar"><div class="zw-loading-fill"></div></div></div>';
  setTimeout(function () { doCalcReal(dateStr, timeIdx, gender, fromHist, extra); }, 300);
}
function doCalcReal(dateStr, timeIdx, gender, fromHist, extra) {
  try {
    var cal = (extra && extra.cal) || 'solar';
    var astro = cal === 'lunar'
      ? window.iztro.astro.byLunar(dateStr, +timeIdx, gender, true)
      : window.iztro.astro.bySolar(dateStr, +timeIdx, gender, true);
    var html = '<div class="zw-grid-pro">';
    var names = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '交友', '官禄', '田宅', '福德', '父母'];
    // 方向
    var dirs = ['北偏东', '正北方', '北偏西', '东偏北', '', '', '西偏北', '东偏南', '', '', '西偏南', '南偏东', '正南方', '南偏西'];
    // 计算流年：每年地支对应的宫位
    var birthYear = parseInt(dateStr.split('-')[0]);
    var centerDone = false;
    PALACE_GRID.forEach(function (pi, gridIdx) {
      if (pi === null) {
        if (centerDone) return; // 中央区只生成一次
        centerDone = true;
        // 中央信息区
        var centerHtml = '<div class="zw-center-pro">';
        try {
          var dispName2 = privacyOn ? '＊＊＊' : (extra && extra.name ? extra.name : '');
          // 年龄
          var birthY = parseInt(dateStr.split('-')[0]);
          var age = new Date().getFullYear() - birthY + 1;
          centerHtml += '<div class="zw-c-name">' + (dispName2 || '') + ' ' + gender + ' ' + astro.fiveElementsClass + ' ' + age + '岁</div>';
          centerHtml += '<div class="zw-c-time">公历 ' + dateStr + '</div>';
          // 农历
          try {
            if (window.Lunar) {
              var ld = window.Lunar.fromDate(new Date(dateStr));
              centerHtml += '<div class="zw-c-lunar">农历 ' + ld.getYearShengXiao() + '年' + ld.getMonthInChinese() + '月' + ld.getDayInChinese() + '</div>';
            }
          } catch (e) {}
          // 大运干支列表
          try {
            if (astro.decadal && astro.decadal.length) {
              var dyHtml = '<div class="zw-c-dayun-full">';
              for (var di = 0; di < Math.min(8, astro.decadal.length); di++) {
                var dd = astro.decadal[di];
                if (dd) {
                  var age0 = dd.range ? dd.range[0] : (di * 10 + 1);
                  var gz = dd.stemBranch || '';
                  // 年份
                  var by = parseInt(dateStr.split('-')[0]);
                  var yr = by + age0 - 1;
                  dyHtml += '<span class="zw-dy-item">' + gz + '<br>' + age0 + '岁<br>' + yr + '</span>';
                }
              }
              dyHtml += '</div>';
              centerHtml += dyHtml;
            }
          } catch (e) {}
          // 起运（简化：显示出生后起运）
          try {
            centerHtml += '<div class="zw-c-qiyun">出生后八字起运</div>';
          } catch (e) {}
          // 节气四柱（带五行颜色）
          try {
            if (window.Lunar) {
              var ld = window.Lunar.fromDate(new Date(dateStr));
              var sizhu = [
                ld.getYearGan() + ld.getYearZhi(),
                ld.getMonthGan() + ld.getMonthZhi(),
                ld.getDayGan() + ld.getDayZhi(),
                ld.getTimeGan() + ld.getTimeZhi()
              ];
              var wxColor = {'金':'#b8860b','木':'#2e8b57','水':'#4169e1','火':'#dc143c','土':'#8b6914'};
              var ganWx = {'甲':'木','乙':'木','丙':'火','丁':'火','戊':'土','己':'土','庚':'金','辛':'金','壬':'水','癸':'水'};
              var zhiWx = {'子':'水','丑':'土','寅':'木','卯':'木','辰':'土','巳':'火','午':'火','未':'土','申':'金','酉':'金','戌':'土','亥':'水'};
              var szHtml = '<div class="zw-c-sizhu">';
              sizhu.forEach(function (gz) {
                var g = gz[0], z = gz[1];
                szHtml += '<span style="color:' + (wxColor[ganWx[g]]||'#333') + '">' + g + '</span>';
                szHtml += '<span style="color:' + (wxColor[zhiWx[z]]||'#333') + '">' + z + '</span> ';
              });
              szHtml += '</div>';
              centerHtml += szHtml;
            }
          } catch (e) {}
          var soulB = '';
          try { soulB = '命主' + (astro.soulStar || '') + ' 身主' + (astro.bodyStar || ''); } catch (e) {}
          centerHtml += '<div class="zw-c-soul">' + soulB + '</div>';
        } catch (e) {}
        centerHtml += '</div>';
        html += centerHtml;
        return;
      }
      var p = astro.palace(pi);
      var cell = '<div class="zw-cell' + (pi === 0 ? ' zw-ming' : '') + '">';
      // 主星+辅星
      cell += '<div class="zw-stars-pro">' + starHtml(p.majorStars.map(function (s) { s.type = 'major'; return s; }))
        + starHtml(p.minorStars.map(function (s) { s.type = 'minor'; return s; })) + '</div>';
      // 博士+大限
      try {
        var dx = p.decadal && p.decadal.range ? p.decadal.range[0] + '~' + p.decadal.range[1] : '';
        if (p.boshi12 || dx) cell += '<div class="zw-boshi">' + (p.boshi12 || '') + ' ' + dx + '</div>';
      } catch (e) {}
      // 长生
      try { if (p.changsheng12) cell += '<div class="zw-cs">' + p.changsheng12 + '</div>'; } catch (e) {}
      // 岁前+将前
      try {
        var sq = p.suiqian12 || '', jq = p.jiangqian12 || '';
        if (sq || jq) cell += '<div class="zw-sqjq">' + sq + ' ' + jq + '</div>';
      } catch (e) {}
      // 小限
      try {
        if (p.ages && p.ages.length) {
          cell += '<div class="zw-xiaoxian">小限:' + p.ages.slice(0,6).join(',') + '</div>';
        }
      } catch (e) {}
      // 流年：按出生年支推算
      try {
        var zhiOrder = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
        var birthY = parseInt(dateStr.split('-')[0]);
        // 出生年支 index (1900年是子年)
        var birthZhiIdx = (birthY - 1900) % 12;
        if (birthZhiIdx < 0) birthZhiIdx += 12;
        // 注意：1900是庚子年，子年index 0
        // 实际：(year - 4) % 12，1984甲子年
        birthZhiIdx = (birthY - 4) % 12;
        if (birthZhiIdx < 0) birthZhiIdx += 12;
        var palaceZhiIdx = zhiOrder.indexOf(p.earthlyBranch);
        // 流年年龄：A 满足 (birthZhiIdx + A - 1) % 12 == palaceZhiIdx
        var startAge = (palaceZhiIdx - birthZhiIdx + 1) % 12;
        if (startAge <= 0) startAge += 12;
        var liuNian = [];
        for (var la = startAge; la <= startAge + 60; la += 12) liuNian.push(la);
        cell += '<div class="zw-liunian">流年:' + liuNian.slice(0,6).join(',') + '</div>';
      } catch (e) {}
      // 干支+宫名
      cell += '<div class="zw-gz-pro">' + p.heavenlyStem + p.earthlyBranch + '</div>';
      cell += '<div class="zw-pname-pro">' + names[pi] + '</div>';
      cell += '</div>';
      html += cell;
    });
    html += '</div>';
    $('#zw-chart').innerHTML = html;
    var timeName = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'][+timeIdx];
    var dispName = privacyOn ? '＊＊＊' : (extra && extra.name ? extra.name : '');
    var infoTxt = '公历 ' + dateStr + ' ' + timeName + '时 · ' + gender;
    if (dispName) infoTxt = dispName + '　' + infoTxt;
    infoTxt += ' <button class="mini-btn tiny" id="zw-privacy">' + (privacyOn ? '显示' : '隐藏') + '</button>';
    $('#zw-info').innerHTML = '<p class="hint">' + infoTxt + '</p>';
    var pvBtn = $('#zw-privacy');
    if (pvBtn) pvBtn.addEventListener('click', function () {
      privacyOn = !privacyOn;
      doCalc(dateStr, timeIdx, gender, true, extra);
    });
    // 保存文字版供 AI 分析
    try {
      var txt = '紫微斗数命盘\n公历：' + dateStr + ' ' + ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'][+timeIdx] + '时 ' + gender
        + '\n五行局：' + astro.fiveElementsClass + '\n';
      var names = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '交友', '官禄', '田宅', '福德', '父母'];
      for (var pi = 0; pi < 12; pi++) {
        var p = astro.palace(pi);
        txt += names[pi] + '(' + p.heavenlyStem + p.earthlyBranch + ')：'
          + p.majorStars.map(function (s) { return s.name; }).join('、')
          + (p.minorStars.length ? '；' + p.minorStars.map(function (s) { return s.name; }).join('、') : '') + '\n';
      }
      window.__wuriChartText = window.__wuriChartText || {};
      window.__wuriChartText.ziwei = txt;
    } catch (e) {}
    if (!fromHist) {
      var saveChk = document.getElementById('zw-save');
      if (!saveChk || saveChk.checked) {
        var lbl = dateStr + ' ' + gender + (extra && extra.name ? ' ' + extra.name : '');
        var grp = (function(){ var s=document.getElementById('zw-group'), cu=document.getElementById('zw-group-custom'); if(s && s.value==='__custom' && cu) return (cu.value||'').trim(); return ((s&&s.value)||'').trim(); })();
        saveHistory({ date: dateStr, time: timeIdx, gender: gender, name: extra && extra.name, cal: extra && extra.cal, group: grp, label: lbl, ts: new Date().toLocaleString() });
      }
    }
  } catch (e) {
    $('#zw-chart').innerHTML = '<p class="hint">排盘失败：' + e.message + '</p>';
  }
}
function init() {
  var enter = $('#ziwei-enter');
  if (enter) enter.addEventListener('click', openView);
  var back = $('#ziwei-back');
  if (back) back.addEventListener('click', closeView);
  document.querySelectorAll('[data-zwtab]').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-zwtab')); });
  });
  // 城市选择器（照搬八字）
  var zwCityNav = [];
  function zwEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function zwRenderCityNav() {
    var nav = $('#zw-city-nav');
    if (!nav) return;
    var html = '<button class="mini-btn" data-nav="-1">全国</button>';
    zwCityNav.forEach(function (n, i) {
      html += ' › <button class="mini-btn" data-nav="' + i + '">' + zwEsc(n) + '</button>';
    });
    nav.innerHTML = html;
    nav.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = +b.getAttribute('data-nav');
        zwCityNav = idx < 0 ? [] : zwCityNav.slice(0, idx + 1);
        zwRenderCityList('');
      });
    });
  }
  function zwRenderCityList(kw) {
    var list = $('#zw-city-list');
    if (!list || typeof CITY_DATA === 'undefined') return;
    function cityBtn(name, lon, lat, sub) {
      return '<button class="bz-city-item" data-lon="' + lon + '" data-name="' + zwEsc(name) + '">' + zwEsc(name) + '<span class="hint"> ' + zwEsc(sub) + '</span></button>';
    }
    var html = '';
    if (kw) {
      CITY_DATA.forEach(function (prov) {
        if (prov.countries) {
          prov.countries.forEach(function (ct) {
            ct.cities.forEach(function (cc) {
              if (cc[0].indexOf(kw) >= 0) html += cityBtn(cc[0], cc[1], cc[2], ct.n);
            });
          });
        } else {
          prov.cities.forEach(function (cc) {
            if (cc[0].indexOf(kw) >= 0 || prov.p.indexOf(kw) >= 0) html += cityBtn(cc[0], cc[1], cc[2], prov.p);
          });
        }
      });
      if (!html) html = '<p class="hint">无匹配城市</p>';
    } else if (zwCityNav.length === 0) {
      CITY_DATA.forEach(function (prov) {
        html += '<button class="bz-city-item bz-prov" data-prov="' + zwEsc(prov.p) + '">' + zwEsc(prov.p) + ' ›</button>';
      });
    } else if (zwCityNav.length === 1) {
      var pv = CITY_DATA.filter(function (x) { return x.p === zwCityNav[0]; })[0];
      if (pv) {
        if (pv.countries) {
          pv.countries.forEach(function (ct) {
            html += '<button class="bz-city-item bz-prov" data-country="' + zwEsc(ct.n) + '">' + zwEsc(ct.n) + ' ›</button>';
          });
        } else {
          pv.cities.forEach(function (cc) { html += cityBtn(cc[0], cc[1], cc[2], pv.p); });
        }
      }
    } else if (zwCityNav.length === 2) {
      var pv2 = CITY_DATA.filter(function (x) { return x.p === zwCityNav[0]; })[0];
      if (pv2 && pv2.countries) {
        var ct2 = pv2.countries.filter(function (x) { return x.n === zwCityNav[1]; })[0];
        if (ct2) ct2.cities.forEach(function (cc) { html += cityBtn(cc[0], cc[1], cc[2], ct2.n); });
      }
    }
    list.innerHTML = html;
    zwRenderCityNav();
    list.querySelectorAll('[data-prov]').forEach(function (b) {
      b.addEventListener('click', function () { zwCityNav.push(b.getAttribute('data-prov')); zwRenderCityList(''); });
    });
    list.querySelectorAll('[data-country]').forEach(function (b) {
      b.addEventListener('click', function () { zwCityNav.push(b.getAttribute('data-country')); zwRenderCityList(''); });
    });
    list.querySelectorAll('[data-lon]').forEach(function (b) {
      b.addEventListener('click', function () {
        var nm = b.getAttribute('data-name'), lon = b.getAttribute('data-lon');
        $('#zw-lon').value = lon;
        $('#zw-cityname').value = nm;
        $('#zw-city-btn').textContent = nm + ' ' + lon + '°';
        $('#zw-city-modal').hidden = true;
      });
    });
  }
  (function initZwCityPicker() {
    var btn = $('#zw-city-btn'), modal = $('#zw-city-modal');
    if (!btn || !modal || typeof CITY_DATA === 'undefined') return;
    btn.addEventListener('click', function () {
      zwCityNav = []; zwRenderCityList(''); $('#zw-city-search').value = '';
      modal.hidden = false;
    });
    $('#zw-city-close').addEventListener('click', function () { modal.hidden = true; });
    $('#zw-city-search').addEventListener('input', function () { zwRenderCityList(this.value); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });
  })();
  var gSel = $('#zw-group'), gCus = $('#zw-group-custom');
  if (gSel && gCus) {
    gSel.addEventListener('change', function () {
      gCus.style.display = this.value === '__custom' ? 'block' : 'none';
    });
  }
  var calc = $('#zw-go');
  if (calc) calc.addEventListener('click', function () {
    var d = $('#zw-date').value;
    var tInput = $('#zw-time').value;
    var gEl = document.querySelector('input[name="zw-gender"]:checked');
    var gVal = gEl ? gEl.value : '1';
    var g = gVal === '1' ? '男' : '女';
    var calEl = document.querySelector('input[name="zw-cal"]:checked');
    var cal = calEl ? calEl.value : 'solar';
    var name = ($('#zw-name').value || '').trim();
    if (!d) return;
    var timeIdx = 6;
    var hh = 12, mm = 0;
    if (tInput) {
      var parts = tInput.split(':');
      hh = +parts[0]; mm = +(parts[1] || 0);
      if ($('#zw-true') && $('#zw-true').checked) {
        var lon = parseFloat($('#zw-lon').value || '116.42');
        var offsetMin = (lon - 120) * 4;
        var totalMin = hh * 60 + mm + offsetMin;
        hh = Math.floor(totalMin / 60) % 24; mm = totalMin % 60;
      }
      timeIdx = Math.floor(((hh + 1) % 24) / 2);
    }
    doCalc(d, timeIdx, g, false, { name: name, cal: cal });
    switchTab('result');
  });
  // tab切换时隐藏独立视图
  document.querySelectorAll('#tabbar button').forEach(function (btn) {
    btn.addEventListener('click', function () { closeView(); });
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () {
  init();
  // 双指缩放
  var chart = document.getElementById('zw-chart');
  if (chart) {
    var scale = 1, lastDist = 0;
    chart.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        lastDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      }
    }, { passive: true });
    chart.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        if (lastDist > 0) {
          scale = Math.min(3, Math.max(0.5, scale * dist / lastDist));
          var grid = chart.querySelector('.zw-grid-pro');
          if (grid) grid.style.transform = 'scale(' + scale + ')';
        }
        lastDist = dist;
      }
    }, { passive: false });
    chart.addEventListener('touchend', function () { lastDist = 0; });
  }
});
else init();
})();
