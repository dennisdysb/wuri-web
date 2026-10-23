/* 戊日不上香 · 中国星象模块「今日星空」引擎（一期）
* 纯计算层，零依赖：不引用 lunar.min.js 或任何外部库，可被 www 直接 <script> 引入，
* 也可在 Node 下 require 做测试。三个部件：
*
* 1) 二十八宿值日 xiuOfDate(y, m, d)
* 口径与现行 App 完全一致：App 用 lunar-javascript 的 Lunar.getXiu()（见 www/js/app.js
* dayGodsOf）。该值宿为纯日序 28 日循环，本引擎以儒略日数拟合锚点
* index = (JDN + 11) mod 28（宿序：角亢氐房心尾箕斗牛女虚危室壁奎娄胃昴毕觜参井鬼柳星张翼轸），
* 经 1990–2035 共 16,801 天与库逐日回归，零差（见 test-today-sky.js）。
* 宿名全称与四象分组与 App 内 zhishen-data.js 的 XINGSU28 保持一致。
*
* 2) 北斗斗柄指向 dipperOf(date, opts)
* 传统定义：斗建者，斗柄所指之辰也——以初昏（戌时）斗柄所指地支定月建，
* 《鹖冠子·环流》：「斗柄东指，天下皆春；斗柄南指，天下皆夏；斗柄西指，天下皆秋；
* 斗柄北指，天下皆冬。」斗柄绕极一周天均分十二辰：初昏指月建之辰，
* 此后每过一时辰顺进一辰（子→丑→寅→卯…序），昼间时辰按同一推步外推。
* 输入的 date 须已按全站口径换算为真太阳时（App 侧 solarNow() 的结果），
* 本引擎只读取其本地时分定辰。月建支默认由太阳视黄经近似推算（节气边界
* 误差约 ±0.1 日，见测试报告），宿主若有精确节气（如 App 的农历库）可经
* opts.monthBranch（地支序号 0=子）覆盖，覆盖时 monthBranchApprox=false。
*
* 3) 月相 moonPhaseOf(date)
* 现行 App 只有库的月相名（Lunar.getYueXiang()，按农历日命名的细名）。
* 本引擎补数值：以月日视黄经差（距角）的主要摄动项模型求朔时刻（迭代求解），
* 给出月龄（日）与照亮比例（0–1）；并按距角八分位给出八大月相名
* （朔／娥眉月／上弦／盈凸月／望／亏凸月／下弦／残月）。
* 与 2024–2026 年 37 个朔日、37 个望日（农历库口径）对照，误差见测试报告。
*/
(function (global) {
'use strict';

var D2R = Math.PI / 180;
function norm360(x) { x = x % 360; return x < 0? x + 360: x;}
function floorDiv(a, b) { return Math.floor(a / b);}

/* ================= 通用：儒略日 ================= */
// 公历日期（当日 12:00 本地民用日口径，与 App 值日按民用日取数一致）→ 儒略日数 JDN（整数）
function julianDayNumber(y, m, d) {
var a = floorDiv(14 - m, 12);
var y2 = y + 4800 - a;
var m2 = m + 12 * a - 3;
return d + floorDiv(153 * m2 + 2, 5) + 365 * y2 + floorDiv(y2, 4) - floorDiv(y2, 100) + floorDiv(y2, 400) - 32045;
}
// Date（绝对时刻）→ 儒略日（小数）
function jdFromDate(date) { return date.getTime() / 86400000 + 2440587.5;}

/* ================= 1) 二十八宿值日 ================= */
var XIU28 = [
{ name: '角', full: '角木蛟', group: '东方青龙'}, { name: '亢', full: '亢金龙', group: '东方青龙'},
{ name: '氐', full: '氐土貉', group: '东方青龙'}, { name: '房', full: '房日兔', group: '东方青龙'},
{ name: '心', full: '心月狐', group: '东方青龙'}, { name: '尾', full: '尾火虎', group: '东方青龙'},
{ name: '箕', full: '箕水豹', group: '东方青龙'},
{ name: '斗', full: '斗木獬', group: '北方玄武'}, { name: '牛', full: '牛金牛', group: '北方玄武'},
{ name: '女', full: '女土蝠', group: '北方玄武'}, { name: '虚', full: '虚日鼠', group: '北方玄武'},
{ name: '危', full: '危月燕', group: '北方玄武'}, { name: '室', full: '室火猪', group: '北方玄武'},
{ name: '壁', full: '壁水貐', group: '北方玄武'},
{ name: '奎', full: '奎木狼', group: '西方白虎'}, { name: '娄', full: '娄金狗', group: '西方白虎'},
{ name: '胃', full: '胃土雉', group: '西方白虎'}, { name: '昴', full: '昴日鸡', group: '西方白虎'},
{ name: '毕', full: '毕月乌', group: '西方白虎'}, { name: '觜', full: '觜火猴', group: '西方白虎'},
{ name: '参', full: '参水猿', group: '西方白虎'},
{ name: '井', full: '井木犴', group: '南方朱雀'}, { name: '鬼', full: '鬼金羊', group: '南方朱雀'},
{ name: '柳', full: '柳土獐', group: '南方朱雀'}, { name: '星', full: '星日马', group: '南方朱雀'},
{ name: '张', full: '张月鹿', group: '南方朱雀'}, { name: '翼', full: '翼火蛇', group: '南方朱雀'},
{ name: '轸', full: '轸水蚓', group: '南方朱雀'}
];
var XIU_ANCHOR = 11; // index = (JDN + 11) % 28，拟合自 lunar-javascript getXiu()，1990–2035 全量验证零差

function xiuOfDate(y, m, d) {
var idx = ((julianDayNumber(y, m, d) + XIU_ANCHOR) % 28 + 28) % 28;
var x = XIU28[idx];
return { index: idx, name: x.name, fullName: x.full, group: x.group};
}
function xiuOfDateObj(date) { return xiuOfDate(date.getFullYear(), date.getMonth() + 1, date.getDate());}

/* ================= 太阳视黄经（近似）与月建 ================= */
// 太阳视黄经（度）。多项式＋中心差级数（Meeus 低精度式），精度约 0.01° 量级。
function sunLongitude(jd) {
var T = (jd - 2451545.0) / 36525;
var L0 = 280.46646 + T * (36000.76983 + 0.0003032 * T);
var M = norm360(357.52911 + T * (35999.05029 - 0.0001537 * T)) * D2R;
var C = (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(M)
+ (0.019993 - 0.000101 * T) * Math.sin(2 * M)
+ 0.000289 * Math.sin(3 * M);
return norm360(L0 + C);
}
var DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
// 节气月建支序号：寅月起于立春（黄经 315°），每 30° 进一节。返回 0–11（0=子）。
function monthBranchIndexOfJD(jd) {
var t = Math.floor(norm360(sunLongitude(jd) - 315) / 30); // 0=寅月 1=卯月 … 11=丑月
return (2 + t) % 12;
}

/* ================= 2) 北斗斗柄指向（传统斗建口径） ================= */
// 地支 → 八方（斗柄十二辰方位圈：子北、卯东、午南、酉西，与《鹖冠子》四指对应）
var DIR8_OF_BRANCH = ['北', '东北', '东北', '东', '东南', '东南', '南', '西南', '西南', '西', '西北', '西北'];
var SEASON_OF_MONTH_BRANCH = { 2: '春', 3: '春', 4: '春', 5: '夏', 6: '夏', 7: '夏', 8: '秋', 9: '秋', 10: '秋', 11: '冬', 0: '冬', 1: '冬'};
var HEGUANZI = {
3: '斗柄东指，天下皆春', // 卯
6: '斗柄南指，天下皆夏', // 午
9: '斗柄西指，天下皆秋', // 酉
0: '斗柄北指，天下皆冬' // 子
};
// 时辰支序号：23 时起子时（与 App hourZhiIndex 口径一致；date 已按真太阳时换算）
function hourBranchIndex(hour) { return Math.floor(((hour % 24) + 1) / 2) % 12;}

function dipperOf(date, opts) {
opts = opts || {};
var hb = hourBranchIndex(date.getHours());
var hasExact = typeof opts.monthBranch === 'number';
var mb = hasExact? ((opts.monthBranch % 12) + 12) % 12: monthBranchIndexOfJD(jdFromDate(date));
// 初昏（戌时，序号 10）斗柄指月建之辰；每过一时辰顺进一辰
var steps = ((hb - 10) % 12 + 12) % 12;
var pb = (mb + steps) % 12;
return {
pointingBranch: DIZHI[pb],
pointingIndex: pb,
direction8: DIR8_OF_BRANCH[pb],
hourBranch: DIZHI[hb],
hourBranchIndex: hb,
monthBranch: DIZHI[mb],
monthBranchIndex: mb,
monthBranchApprox:!hasExact,
season: SEASON_OF_MONTH_BRANCH[mb],
quote: HEGUANZI[pb] || null,
source: '《鹖冠子·环流》',
caliber: '传统斗建口径（初昏锚定月建、每时辰顺进一辰），非现代天文方位角'
};
}

/* ================= 3) 月相（月龄＋照亮比例） ================= */
var SYNODIC = 29.530588853; // 平均朔望月（日）
// 月日距角（度，0=朔 180=望）：月球黄经取主要摄动项，太阳黄经同上
function elongationDeg(jd) {
var T = (jd - 2451545.0) / 36525;
var Lp = norm360(218.3164477 + 481267.88123421 * T); // 月球平黄经
var D = norm360(297.8501921 + 445267.1114034 * T); // 平距角
var M = norm360(357.5291092 + 35999.0502909 * T); // 太阳平近点角
var Mp = norm360(134.9633964 + 477198.8675055 * T); // 月球平近点角
var F = norm360(93.2720950 + 483202.0175233 * T); // 月球纬度幅角
var lonCorr = 6.289 * Math.sin(Mp * D2R)
+ 1.274 * Math.sin((2 * D - Mp) * D2R)
+ 0.658 * Math.sin(2 * D * D2R)
+ 0.214 * Math.sin(2 * Mp * D2R)
- 0.186 * Math.sin(M * D2R)
- 0.114 * Math.sin(2 * F * D2R);
var moonLon = Lp + lonCorr;
return norm360(moonLon - sunLongitude(jd));
}
function signedElong(jd) { var e = elongationDeg(jd); return e > 180? e - 360: e;}
// jd 附近的朔时刻：以「有符号距角」估偏移为初值迭代求解距角=0（收敛到最近的根）
function conjunctionNearJD(jd) {
var t = jd - signedElong(jd) / 360 * SYNODIC;
for (var i = 0; i < 6; i++) {
var e = signedElong(t);
if (Math.abs(e) < 0.001) break;
t -= e / 360 * SYNODIC;
}
return t;
}
// 最近一次朔时刻（儒略日，≤ jd）：最近的根若在 jd 之后（临朔数小时内），回退一个朔望月再求根
function lastConjunctionJD(jd) {
var t = conjunctionNearJD(jd);
if (t > jd) t = conjunctionNearJD(t - SYNODIC);
return t;
}
var PHASE8 = [
{ name: '朔', en: 'new'}, { name: '娥眉月', en: 'waxing-crescent'},
{ name: '上弦', en: 'first-quarter'}, { name: '盈凸月', en: 'waxing-gibbous'},
{ name: '望', en: 'full'}, { name: '亏凸月', en: 'waning-gibbous'},
{ name: '下弦', en: 'last-quarter'}, { name: '残月', en: 'waning-crescent'}
];
function moonPhaseOf(date) {
var jd = jdFromDate(date);
var elong = elongationDeg(jd);
var illum = (1 - Math.cos(elong * D2R)) / 2;
var age = jd - lastConjunctionJD(jd);
if (age < 0) age = 0; if (age >= SYNODIC) age = age % SYNODIC;
var sector = Math.floor(norm360(elong + 22.5) / 45) % 8;
return {
ageDays: Math.round(age * 100) / 100, // 月龄（日，自最近朔起算）
illumination: Math.round(illum * 10000) / 10000, // 照亮比例 0–1
illuminationPct: Math.round(illum * 1000) / 10, // 照亮百分比（一位小数）
elongationDeg: Math.round(elong * 100) / 100,
phaseName: PHASE8[sector].name,
phaseIndex: sector,
synodic: SYNODIC
};
}

/* ================= 4) 太阳躔宿（v2.0.0 (5) 贯通批） =================
 * 口径：以《晋书·天文志上》十二次宿度（陈卓系，fenye.json）为骨架——
 * 二十八宿古度宽（角12…轸17，合计 365 度，余分在斗、旧制通例）定宿界，
 * 十二次的起讫/中点宿度为锚点，锚点黄经以中气定之（次中点＝中气，
 * 次界＝相邻中气黄经正中，即中气 ±15°）。太阳视黄经（上文 Meeus 式，
 * 约 0.01° 量级）经锚点分段线性折合为宿度位置，再按宿宽定所在之宿
 * 与入宿度。此谓「以宿度为准的黄道过宫近似」：锚点处与节气严合，
 * 段内为线性约数；古度为整数、锚点本身有一度内出入（见 fenye 分歧
 * D9），故入宿度只作约数（一位小数系折合算术、非实测精度）。
 * 定位粒度止于「宿」：星官在宿内分布广狭不一，无逐官宿度正文可据，
 * 不判太阳入某星官（宁粗而真）。 */
var ZHONGQI_LON = { '冬至': 270, '大寒': 300, '雨水': 330, '春分': 0, '谷雨': 30, '小满': 60,
  '夏至': 90, '大暑': 120, '处暑': 150, '秋分': 180, '霜降': 210, '小雪': 240 };
var MANSION_ORDER = ['角', '亢', '氐', '房', '心', '尾', '箕', '斗', '牛', '女', '虚', '危',
  '室', '壁', '奎', '娄', '胃', '昴', '毕', '觜', '参', '井', '鬼', '柳', '星', '张', '翼', '轸'];

function sunMansionOf(jd, fenye) {
  if (!fenye || !fenye.mansions || !fenye.shierci) return null;
  var width = {}, entry = {};
  fenye.mansions.forEach(function (m) {
    var base = m.mansion.replace(/宿$/, '');
    width[base] = m.width_degrees; entry[base] = m;
  });
  var cum = {}, acc = 0, total = 0;
  MANSION_ORDER.forEach(function (n) { cum[n] = acc; acc += width[n] || 0; });
  total = acc; // 365（晋书古度合计）
  if (!total) return null;
  function ptPos(p) { return cum[p.mansion.replace(/宿$/, '')] + p.degree; }
  /* 锚点：[黄经, 宿度位置]，按黄经升序，宿度位置解缠为单调递增 */
  var raw = [];
  fenye.shierci.forEach(function (c) {
    var mid = ZHONGQI_LON[c.span_mid.solar_term];
    if (typeof mid !== 'number') return;
    raw.push([norm360(mid - 15), ptPos(c.span_start)]);
    raw.push([mid, ptPos(c.span_mid)]);
    raw.push([norm360(mid + 15), ptPos(c.span_end)]);
  });
  if (raw.length < 12) return null;
  raw.sort(function (a, b) { return a[0] - b[0]; });
  var anchors = [], lastPos = -Infinity;
  raw.forEach(function (p) {
    var pos = p[1];
    while (pos < lastPos - 1e-9) pos += total;
    /* 同一黄经容许重复锚点（次界一点两记），宿度位置应一致，取先到者 */
    if (anchors.length && Math.abs(anchors[anchors.length - 1][0] - p[0]) < 1e-9) return;
    anchors.push([p[0], pos]); lastPos = pos;
  });
  var lam = sunLongitude(jd);
  /* 锚点列复制一份 +360°/+total 拼接，把 lam 归一到首锚点起的 360° 窗内找包夹段 */
  var ext = anchors.concat(anchors.map(function (p) { return [p[0] + 360, p[1] + total]; }));
  var base = anchors[0][0], lamN = lam;
  while (lamN < base) lamN += 360;
  while (lamN >= base + 360) lamN -= 360;
  var pos = null;
  for (var i = 0; i + 1 < ext.length; i++) {
    if (lamN >= ext[i][0] && lamN <= ext[i + 1][0]) {
      var span = ext[i + 1][0] - ext[i][0];
      pos = ext[i][1] + (span > 0 ? (ext[i + 1][1] - ext[i][1]) * (lamN - ext[i][0]) / span : 0);
      break;
    }
  }
  if (pos === null) return null;
  pos = ((pos % total) + total) % total;
  for (var k = 0; k < MANSION_ORDER.length; k++) {
    var n = MANSION_ORDER[k];
    if (pos >= cum[n] && pos < cum[n] + width[n]) {
      var m = entry[n];
      var inDeg = pos - cum[n];
      /* 所在之次按本宿 ci_span 分段定（跨次之宿前後段各归其次，
       * 如井前十五度在实沈、后十八度在鹑首），国/州随段取十二次表 */
      var segCi = m.ci_primary, acc2 = 0;
      (m.ci_span || []).forEach(function (sg) {
        if (inDeg >= acc2) segCi = sg.ci;
        acc2 += sg.degrees;
      });
      var ciEntry = null;
      fenye.shierci.forEach(function (c) { if (c.name === segCi) ciEntry = c; });
      return {
        mansion: m.mansion,            // 如「危宿」
        base: n,                        // 如「危」
        inDeg: Math.round(inDeg * 10) / 10,
        ci: segCi,                      // 太阳所在段之次（跨次宿按段分）
        ciPrimary: m.ci_primary,        // 本宿主属之次
        guo: ciEntry ? ciEntry.guo : m.fenye_guo,
        zhou: ciEntry ? ciEntry.zhou : m.fenye_zhou,
        sunLon: Math.round(lam * 100) / 100,
        fenye: m
      };
    }
  }
  return null;
}

var api = {
julianDayNumber: julianDayNumber,
sunMansionOf: sunMansionOf,
ZHONGQI_LON: ZHONGQI_LON,
MANSION_ORDER: MANSION_ORDER,
jdFromDate: jdFromDate,
XIU28: XIU28,
xiuOfDate: xiuOfDate,
xiuOfDateObj: xiuOfDateObj,
sunLongitude: sunLongitude,
monthBranchIndexOfJD: monthBranchIndexOfJD,
DIZHI: DIZHI,
hourBranchIndex: hourBranchIndex,
dipperOf: dipperOf,
elongationDeg: elongationDeg,
lastConjunctionJD: lastConjunctionJD,
conjunctionNearJD: conjunctionNearJD,
moonPhaseOf: moonPhaseOf,
PHASE8: PHASE8,
SYNODIC: SYNODIC
};
global.WuriTodaySky = api;
if (typeof module!== 'undefined' && module.exports) module.exports = api;
})(typeof window!== 'undefined'? window: globalThis);
