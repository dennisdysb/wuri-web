/* 戊日不上香 · 年历总览（Pro）
 * 黄历 tab 内「年览」入口：12 宫格年视图，戊日/暗戊/拜斗/神诞标记；
 * 导出图片（canvas 海报 → 原生分享）、打印（原生 PrintManager）。
 * 全部数据经 lunarOf() 即 App 自带 lunar-javascript，口径一致。
 */
var YearView = (function () {
  'use strict';
  var WC = window.__wuriCal || {};
  var yvYear = null; // null=月视图

  function open(year) {
    if (window.WuriPro && !WuriPro.requirePro('year')) return;
    yvYear = year || (WC.getView ? WC.getView().y : new Date().getFullYear());
    document.getElementById('cal-grid').hidden = true;
    document.querySelector('#tab-cal .cal-week').hidden = true;
    document.getElementById('month-legend').hidden = true;
    document.getElementById('day-detail').hidden = true;
    document.getElementById('date-jump').hidden = true;
    document.getElementById('year-view').hidden = false;
    render();
    window.scrollTo(0, 0);
  }
  function close() {
    yvYear = null;
    document.getElementById('cal-grid').hidden = false;
    document.querySelector('#tab-cal .cal-week').hidden = false;
    document.getElementById('month-legend').hidden = false;
    document.getElementById('day-detail').hidden = false;
    document.getElementById('year-view').hidden = true;
    WC.renderCalendar();
  }
  function isOpen() { return yvYear !== null; }

  /* 当天标记：{wu, an, bd, sd} */
  function marks(y, m, d) {
    var l = WC.lunarOf(y, m, d);
    var wu = l.getDayGan() === '戊';
    return {
      wu: wu,
      an: !wu && WC.ANWU_ZHI.indexOf(l.getDayZhi()) >= 0,
      bd: WC.isBaidouDay(l),
      sd: !!WC.shendanName(l)
    };
  }

  function render() {
    var y = yvYear;
    document.getElementById('yv-title').textContent =
      y + '年 · ' + WC.lunarOf(y, 6, 1).getYearGan() + WC.lunarOf(y, 6, 1).getYearZhi() + '年';
    var now = new Date();
    var ty = now.getFullYear(), tm = now.getMonth() + 1, td = now.getDate();
    var host = document.getElementById('yv-grid');
    host.innerHTML = '';
    for (var m = 1; m <= 12; m++) {
      (function (m) {
        var box = document.createElement('div');
        box.className = 'yv-month';
        var dim = new Date(y, m, 0).getDate();
        var lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 周一起
        var html = '<div class="yv-mtitle">' + m + '月</div><div class="yv-mgrid">';
        var wk = ['一', '二', '三', '四', '五', '六', '日'];
        for (var i = 0; i < 7; i++) html += '<span class="yv-wk">' + wk[i] + '</span>';
        for (var i = 0; i < lead; i++) html += '<span class="yv-day empty"></span>';
        for (var d = 1; d <= dim; d++) {
          var mk = marks(y, m, d);
          var cls = 'yv-day' + (mk.wu ? ' wu' : mk.an ? ' an' : '')
            + ((y === ty && m === tm && d === td) ? ' today' : '');
          var dots = (mk.bd ? '<i class="yv-bd">★</i>' : '') + (mk.sd ? '<i class="yv-sd"></i>' : '');
          html += '<span class="' + cls + '" data-y="' + y + '" data-m="' + m + '" data-d="' + d + '">' + d + dots + '</span>';
        }
        html += '</div>';
        box.innerHTML = html;
        host.appendChild(box);
      })(m);
    }
    host.querySelectorAll('.yv-day[data-d]').forEach(function (el) {
      el.addEventListener('click', function () {
        WC.setView(+el.getAttribute('data-y'), +el.getAttribute('data-m'), +el.getAttribute('data-d'));
        close();
      });
    });
  }

  /* ---------- 导出图片：canvas 海报 ---------- */
  function exportImage() {
    var y = yvYear;
    var W = 1600, PAD = 64, MW = 480, MH = 470, GAP = 32;
    var H = PAD * 2 + 130 + 4 * MH + 3 * GAP + 90;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    c.fillStyle = '#F5F1E6'; c.fillRect(0, 0, W, H);
    var ink = '#2b2b26', gold = '#a8842c', wuRed = '#b3402e', teal = '#1f6f5c';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    // 标题
    c.fillStyle = ink;
    c.font = '700 64px serif';
    var yg = WC.lunarOf(y, 6, 1).getYearGan() + WC.lunarOf(y, 6, 1).getYearZhi();
    c.fillText(y + '年 · ' + yg + '年戊日年览', W / 2, PAD + 30);
    c.fillStyle = gold; c.font = '30px serif';
    c.fillText('戊日不上香', W / 2, PAD + 88);
    // 12 宫
    var now = new Date(), ty = now.getFullYear(), tm = now.getMonth() + 1, td = now.getDate();
    var x0 = (W - (3 * MW + 2 * GAP)) / 2, y0 = PAD + 130;
    var wk = ['一', '二', '三', '四', '五', '六', '日'];
    for (var m = 1; m <= 12; m++) {
      var col = (m - 1) % 3, row = Math.floor((m - 1) / 3);
      var bx = x0 + col * (MW + GAP), by = y0 + row * (MH + GAP);
      c.strokeStyle = '#d8cfb8'; c.lineWidth = 2;
      c.strokeRect(bx, by, MW, MH);
      c.fillStyle = ink; c.font = '700 40px serif';
      c.fillText(m + '月', bx + MW / 2, by + 42);
      var cellW = MW / 7, top = by + 84, cellH = (MH - 100) / 7;
      c.font = '26px sans-serif'; c.fillStyle = '#8a8272';
      for (var i = 0; i < 7; i++) c.fillText(wk[i], bx + cellW * (i + 0.5), top + cellH / 2);
      var dim = new Date(y, m, 0).getDate();
      var lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
      c.font = '30px sans-serif';
      for (var d = 1; d <= dim; d++) {
        var pos = lead + d - 1;
        var cx = bx + cellW * (pos % 7 + 0.5), cy = top + cellH * (Math.floor(pos / 7) + 1.5);
        var mk = marks(y, m, d);
        if (mk.wu) {
          c.fillStyle = wuRed;
          c.beginPath(); c.arc(cx, cy, 24, 0, 7); c.fill();
          c.fillStyle = '#fff';
        } else if (mk.an) {
          c.strokeStyle = wuRed; c.lineWidth = 3;
          c.beginPath(); c.arc(cx, cy, 24, 0, 7); c.stroke();
          c.fillStyle = wuRed;
        } else {
          c.fillStyle = ink;
        }
        c.fillText(String(d), cx, cy);
        if (mk.bd || mk.sd) {
          c.fillStyle = gold;
          c.beginPath(); c.arc(cx + 20, cy - 20, 7, 0, 7); c.fill();
        }
        if (y === ty && m === tm && d === td) {
          c.strokeStyle = teal; c.lineWidth = 3;
          c.beginPath(); c.arc(cx, cy, 30, 0, 7); c.stroke();
        }
      }
    }
    // 图例
    var ly = H - 60;
    c.font = '28px sans-serif'; c.textAlign = 'left';
    var lx = PAD;
    function dot(x, draw, label) {
      draw(x, ly);
      c.fillStyle = '#5a5348'; c.fillText(label, x + 34, ly);
      return x + 34 + c.measureText(label).width + 48;
    }
    lx = dot(lx, function (x, yy) { c.fillStyle = wuRed; c.beginPath(); c.arc(x + 12, yy, 12, 0, 7); c.fill(); }, '明戊日');
    lx = dot(lx, function (x, yy) { c.strokeStyle = wuRed; c.lineWidth = 3; c.beginPath(); c.arc(x + 12, yy, 12, 0, 7); c.stroke(); }, '暗戊日');
    lx = dot(lx, function (x, yy) { c.fillStyle = gold; c.beginPath(); c.arc(x + 12, yy, 8, 0, 7); c.fill(); }, '拜斗/神诞');
    var url = cv.toDataURL('image/png');
    var b = window.WuBridge;
    if (b && typeof b.shareImage === 'function') {
      try { b.shareImage(url, 'wuri-year-' + y); return; } catch (e) {}
    }
    var a = document.createElement('a');
    a.href = url; a.download = 'wuri-year-' + y + '.png'; a.click();
  }

  /* ---------- 打印：原生 PrintManager ---------- */
  function printYear() {
    var y = yvYear;
    var yg = WC.lunarOf(y, 6, 1).getYearGan() + WC.lunarOf(y, 6, 1).getYearZhi();
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
      + 'body{font-family:serif;color:#222;margin:24px}'
      + 'h1{text-align:center;font-size:28px;margin:0}h2{text-align:center;color:#a8842c;font-size:16px;font-weight:normal}'
      + '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:16px}'
      + '.m{border:1px solid #bbb;padding:8px;page-break-inside:avoid}'
      + '.mt{text-align:center;font-weight:bold;margin-bottom:6px}'
      + 'table{width:100%;border-collapse:collapse;font-size:12px;text-align:center}'
      + 'td,th{padding:3px}.wu{background:#b3402e;color:#fff;border-radius:50%}.an{border:1px solid #b3402e;border-radius:50%;color:#b3402e}.mk{color:#a8842c}'
      + '.lg{text-align:center;margin-top:14px;color:#666;font-size:13px}</style></head><body>'
      + '<h1>' + y + '年 · ' + yg + '年戊日年览</h1><h2>戊日不上香</h2><div class="grid">';
    var wk = ['一', '二', '三', '四', '五', '六', '日'];
    for (var m = 1; m <= 12; m++) {
      var dim = new Date(y, m, 0).getDate();
      var lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
      html += '<div class="m"><div class="mt">' + m + '月</div><table><tr>';
      for (var i = 0; i < 7; i++) html += '<th>' + wk[i] + '</th>';
      html += '</tr><tr>';
      for (var i = 0; i < lead; i++) html += '<td></td>';
      for (var d = 1; d <= dim; d++) {
        var pos = lead + d - 1;
        if (d > 1 && pos % 7 === 0) html += '</tr><tr>';
        var mk = marks(y, m, d);
        var cls = mk.wu ? 'wu' : mk.an ? 'an' : '';
        var star = (mk.bd || mk.sd) ? '<span class="mk">·</span>' : '';
        html += '<td><span class="' + cls + '">' + d + '</span>' + star + '</td>';
      }
      html += '</tr></table></div>';
    }
    html += '</div><div class="lg">● 明戊日 ○ 暗戊日 · 拜斗/神诞</div></body></html>';
    var b = window.WuBridge;
    if (b && typeof b.printHtml === 'function') {
      try { b.printHtml(html); return; } catch (e) {}
    }
    var w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-yv]');
    if (!el) return;
    var act = el.getAttribute('data-yv');
    if (act === 'open') open(WC.getView().y);
    else if (act === 'close') close();
    else if (act === 'prev') { yvYear--; render(); }
    else if (act === 'next') { yvYear++; render(); }
    else if (act === 'export') exportImage();
    else if (act === 'print') printYear();
  });

  return { open: open, close: close, isOpen: isOpen };
})();
