/* 阴盘奇门算法验证脚本（独立，不碰引擎）
 *
 * 目的：先证明两件事，再动 engine.js ——
 *   1) 农历转换正确（用多个公开锚点互校）
 *   2) 阴盘定局公式正确（用公开算例互校）
 *
 * 阴盘定局公式（多源一致）：
 *   局数 = (年支序数 + 农历月数 + 农历日数 + 时支序数) % 9
 *   整除（余 0）取 9。序数：子1 丑2 寅3 卯4 辰5 巳6 午7 未8 申9 酉10 戌11 亥12。
 * 阴阳遁：冬至后夏至前 = 阳遁，夏至后冬至前 = 阴遁（同节气判定）。
 *
 * 依据来源（均联网核实）：
 *   - 百度百科「阴盘奇门遁甲」：局数取(年支序数+月数+日数+时支序数)除9之余数
 *   - 易德轩《阴盘奇门遁甲的定局与排盘》：2015-09-15 12:45 农历八月三日
 *     局数=(8+8+3+7)÷9 余 8 → 阴八局
 *   - 易德轩《阴盘奇门起局心法》：2012-05-03 壬辰年四月十三日午时
 *     (5+4+13+7)/9 余 2 → 阳二局
 *   - 范鹤俊《阴盘奇门遁甲导航二》：2012-08-18 七月初二 (5+7+2+10)=24 余 6 → 阴六局
 *
 * 农历表来源：香港天文台《公历-农历对照表》(1901-2100)，见
 *   https://www.hko.gov.hk/tc/gts/time/conversion.htm
 * 程序编码采用流传最广的 lunarInfo 十六进制表（与香港天文台对照表一致）。
 */

// 农历数据表 1900-2100（香港天文台对照表编码）
const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2, //1900-1909
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977, //1910-1919
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970, //1920-1929
  0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950, //1930-1939
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557, //1940-1949
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0, //1950-1959
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0, //1960-1969
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6, //1970-1979
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570, //1980-1989
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0, //1990-1999
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5, //2000-2009
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930, //2010-2019
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530, //2020-2029
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45, //2030-2039
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0, //2040-2049
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0, //2050-2059
  0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4, //2060-2069
  0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0, //2070-2079
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160, //2080-2089
  0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252, //2090-2099
  0x0d520  //2100
];

// 公历转农历（儒略日）
function jdn(y, m, d) {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
       - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}
// 农历基准：1900-01-31 = 农历 1900 年正月初一
const BASE_JDN = jdn(1900, 1, 31);

function leapMonth(y) { return LUNAR_INFO[y - 1900] & 0xf; }
function leapDays(y) { return leapMonth(y) ? ((LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29) : 0; }
function monthDays(y, m) { return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29; }
function lunarYearDays(y) {
  let s = 348; // 12*29
  for (let i = 0x8000; i > 0x8; i >>= 1) s += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
  return s + leapDays(y);
}

function solarToLunar(y, m, d) {
  if (y < 1900 || y > 2100) return null;
  let off = jdn(y, m, d) - BASE_JDN;
  let ly = 1900;
  while (ly < 2100 && off >= lunarYearDays(ly)) { off -= lunarYearDays(ly); ly++; }
  const lm = leapMonth(ly); // 0=无闰月
  let isLeap = false;
  for (let i = 1; i <= 12; i++) {
    const md = monthDays(ly, i);
    if (off < md) return { year: ly, month: i, day: off + 1, leap: false };
    off -= md;
    if (lm === i) {
      const ld = leapDays(ly);
      if (off < ld) return { year: ly, month: i, day: off + 1, leap: true };
      off -= ld;
    }
  }
  return { year: ly, month: 12, day: off + 1, leap: false };
}

// 地支序数：子1 丑2 ... 亥12
const DZ = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
function zhiOrder(branch) { return DZ.indexOf(branch) + 1; }

// 阴盘定局
function yinpanJu(yearZhiBranch, lunarMonth, lunarDay, hourZhiBranch) {
  const sum = zhiOrder(yearZhiBranch) + lunarMonth + lunarDay + zhiOrder(hourZhiBranch);
  const rem = sum % 9;
  return { sum, ju: rem === 0 ? 9 : rem };
}

/* ============ 锚点验证 ============ */
let pass = 0, fail = 0; const fails = [];
function ok(c, n) { if (c) pass++; else { fail++; fails.push(n); } }

// ---- 1. 农历转换锚点（香港天文台对照表 + 公开算例） ----
const LUNAR_ANCHORS = [
  { y: 2012, m: 5, d: 3,  lm: 4,  ld: 13, src: "易德轩：2012-05-03 = 壬辰年四月十三" },
  { y: 2012, m: 8, d: 18, lm: 7,  ld: 2,  src: "范鹤俊：2012-08-18 = 七月初二" },
  { y: 2015, m: 9, d: 15, lm: 8,  ld: 3,  src: "易德轩：2015-09-15 = 农历八月三日" },
  { y: 2005, m: 12, d: 1, lm: 11, ld: 1,  src: "百度百科：2005-12-01 = 乙酉年十一月（初一天" },
];
for (const a of LUNAR_ANCHORS) {
  const l = solarToLunar(a.y, a.m, a.d);
  if (!l) { ok(false, "农历转换超范围 " + a.y); continue; }
  ok(l.month === a.lm && l.day === a.ld,
     "农历 " + a.y + "-" + a.m + "-" + a.d + " = " + l.month + "月" + l.day + "日（应 " + a.lm + "/" + a.ld + "）[" + a.src + "]");
}

// 另补一个 2026 年已知锚点（正月初一春节 2026-02-17）
{
  const l = solarToLunar(2026, 2, 17);
  ok(l && l.month === 1 && l.day === 1, "2026-02-17 = 正月初一（春节）实得 " + (l ? l.month + "月" + l.day + "日" : "null"));
}

// ---- 2. 阴盘定局锚点（公开算例，含四柱年支/时支） ----
const JU_ANCHORS = [
  { y: 2012, m: 5, d: 3,  h: 12, yz: "辰", hz: "午", expect: 2,  dun: "阳", src: "易德轩心法：(5+4+13+7)/9余2=阳二局" },
  { y: 2015, m: 9, d: 15, h: 12, yz: "未", hz: "午", expect: 8,  dun: "阴", src: "易德轩定局：(8+8+3+7)÷9余8=阴八局" },
  { y: 2012, m: 8, d: 18, h: 18, yz: "辰", hz: "酉", expect: 6,  dun: "阴", src: "范鹤俊：(5+7+2+10)=24余6=阴六局" },
];
for (const a of JU_ANCHORS) {
  const l = solarToLunar(a.y, a.m, a.d);
  if (!l) { ok(false, "农历转换失败 " + a.y); continue; }
  const r = yinpanJu(a.yz, l.month, l.day, a.hz);
  ok(r.ju === a.expect,
     "阴盘定局 " + a.y + "-" + a.m + "-" + a.d + " = " + r.ju + "局（应 " + a.expect + "）[" + a.src + "]，四数之和=" + r.sum);
}

console.log("—— 阴盘奇门算法验证 ——");
console.log("断言：" + pass + " 通过，" + fail + " 失败");
if (fails.length) { console.log("\n失败明细："); fails.forEach(f => console.log("  ✗ " + f)); }
process.exit(fail ? 1 : 0);
