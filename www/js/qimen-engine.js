/* ============================================================
 * 戊日不上香 · 奇门遁甲模块（适配版）
 * 原作：「掌上乾坤 · 奇门遁甲助手」v3.2，作者 qzp001，MIT License。
 * 许可证全文见同目录 qimen-LICENSE.txt；「我的 → 关于」页有鸣谢。
 * 戊日适配点见各文件头注与 qimen-build/build_qimen.py。
 * ============================================================ */
/* 适配点：①历法经 setCalendarProvider 换 lunar-javascript 精确节气（见 qimen-cal.js）；
 * ②toTrueSolar 改为仅经度差修正（不计均时差），基准经线由调用方传入 opts.baseLon。
 * 其余排盘算法与原作一致。 */
/* 奇门遁甲排盘引擎 v3.1 · 口径显式化
 *
 * 设计原则（v3 铁律）：
 *  1) 口径一律显式可查——定局法/盘法/夜子时派/寄宫方案/历法基准/真太阳时口径，
 *     六项全部可由调用方指定，并随盘面结果返回（metadata 字段），杜绝"隐式假设"。
 *  2) 异说并列不代为择一——凡各家算法有分歧的（子时换日、寄宫、飞盘），
 *     都做成可切换的开关，并注明出处与"本工具不代为择一"。
 *  3) 定局所用节气与阴阳遁必须同源——v2 的崩溃即源于此（M0 修复）。
 *
 * v3.1 新增「阴盘奇门」定局法（dingju:"yinpan"）：
 *   - 与阳盘（拆补/置闰/茅山）不同，阴盘按太阴历起局，不用节气三元、不拆补不置闰。
 *   - 定局公式：局数 = (年支序数 + 农历月数 + 农历日数 + 时支序数) % 9，整除取 9。
 *   - 阴阳遁仍按冬至后夏至前=阳遁、夏至后冬至前=阴遁。
 *   - 依据：百度百科「阴盘奇门遁甲」、易德轩《阴盘奇门遁甲的定局与排盘》、
 *     范鹤俊《阴盘奇门遁甲导航二》。属近代流行排法，非古籍古法。
 *
 * 纯函数、零依赖，可在浏览器与 Node 中运行。仅用于传统文化学习研究。
 */
(function (global) {
  "use strict";

  /* ============ 基础常量 ============ */
  const TG = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
  const DZ = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
  const TERMS = ["立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至",
                 "小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至","小寒","大寒"];

  const PAL_NAME = {1:"坎一宫·北",2:"坤二宫·西南",3:"震三宫·东",4:"巽四宫·东南",5:"中五宫",
                    6:"乾六宫·西北",7:"兑七宫·西",8:"艮八宫·东北",9:"离九宫·南"};
  const PAL_BAGUA = {1:"坎",2:"坤",3:"震",4:"巽",5:"中",6:"乾",7:"兑",8:"艮",9:"离"};
  const PAL_WX = {1:"水",2:"土",3:"木",4:"木",5:"土",6:"金",7:"金",8:"土",9:"火"};
  const PAL_DIR = {1:"正北",2:"西南",3:"正东",4:"东南",5:"中宫",6:"西北",7:"正西",8:"东北",9:"正南"};
  const WX_SHENG = {"木":"火","火":"土","土":"金","金":"水","水":"木"};
  const WX_KE = {"木":"土","土":"水","水":"火","火":"金","金":"木"};

  const STAR_HOME = {1:"天蓬",8:"天任",3:"天冲",4:"天辅",9:"天英",2:"天芮",7:"天柱",6:"天心",5:"天禽"};
  const STAR_WX = {天蓬:"水",天任:"土",天冲:"木",天辅:"木",天英:"火",天芮:"土",天柱:"金",天心:"金",天禽:"土"};
  const DOOR_HOME = {1:"休门",8:"生门",3:"伤门",4:"杜门",9:"景门",2:"死门",7:"惊门",6:"开门"};
  const DOOR_WX = {"休":"水","生":"土","伤":"木","杜":"木","景":"火","死":"土","惊":"金","开":"金"};

  const JU = {
    "阳遁": {"冬至":[1,7,4],"惊蛰":[1,7,4],"小寒":[2,8,5],"大寒":[3,9,6],"春分":[3,9,6],"雨水":[9,6,3],
             "立春":[8,5,2],"谷雨":[5,2,8],"小满":[5,2,8],"清明":[4,1,7],"立夏":[4,1,7],"芒种":[6,3,9]},
    "阴遁": {"夏至":[9,3,6],"白露":[9,3,6],"小暑":[8,2,5],"大暑":[7,1,4],"秋分":[7,1,4],"立秋":[2,5,8],
             "处暑":[1,4,7],"寒露":[6,9,3],"立冬":[6,9,3],"霜降":[5,8,2],"小雪":[5,8,2],"大雪":[4,7,1]}
  };
  const UPPER_FU = ["甲子","甲午","己卯","己酉"];
  const ZI_BAI = ["","一白","二黑","三碧","四绿","五黄","六白","七赤","八白","九紫"];
  const MONTH_ZI = { "孟":2, "仲":8, "季":5 };
  const BASE_LON = 120;   // 通行基准东经 120°（116°25'E 属他术自设基准，奇门不用）

  const RING_ZHUAN = [1, 8, 3, 4, 9, 2, 7, 6];
  const RING_FEI_YANG = [1, 2, 3, 4, 6, 7, 8, 9];
  const RING_FEI_YIN = [1, 9, 8, 7, 6, 4, 3, 2];
  const RING_GUAQI = [1, 2, 3, 4, 9, 8, 7, 6];
  const DOOR_GUAQI = {1:"休门",2:"死门",3:"伤门",4:"杜门",9:"开门",8:"惊门",7:"生门",6:"景门"};
  const STAR_GUAQI = {1:"天蓬",2:"天芮",3:"天冲",4:"天辅",9:"天英",8:"天禽",7:"天柱",6:"天心"};

  /* ============ 历法 ============ */
  function jdn(y, m, d) {
    const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
         - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }
  function fromJdn(j) {
    const a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4);
    const dd = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * dd / 4), mm = Math.floor((5 * e + 2) / 153);
    return { y: 100 * b + dd - 4800 + Math.floor(mm / 10),
             m: mm + 3 - 12 * Math.floor(mm / 10),
             d: e - Math.floor((153 * mm + 2) / 5) + 1 };
  }
  function gzIdx(s, b) { for (let i = s; i < 60; i += 10) if (i % 12 === b) return i; return -1; }
  function gzName(i) { return TG[((i % 10) + 10) % 10] + DZ[((i % 12) + 12) % 12]; }
  function relJD(y, mo, d, h, mi) { return (jdn(y, mo, d) - 2451545) + (h + mi / 60 - 20) / 24; }

  function sunLon(jd) {
    const r = Math.PI / 180;
    const g = (357.529 + 0.98560028 * jd) % 360;
    const q = (280.459 + 0.98564736 * jd) % 360;
    const L = q + 1.915 * Math.sin(g * r) + 0.020 * Math.sin(2 * g * r);
    return ((L % 360) + 360) % 360;
  }
  function termIndex(y, mo, d, h, mi) {
    if (CAL && CAL.termIndex) return CAL.termIndex(y, mo, d, h, mi);
    const v = Math.floor((((sunLon(relJD(y, mo, d, h, mi)) + 45) % 360 + 360) % 360) / 15);
    return Math.max(0, Math.min(23, v));
  }
  function termStartJD(y, mo, d, h, mi) {
    if (CAL && CAL.termStartRelJD) return CAL.termStartRelJD(y, mo, d, h, mi);
    const jd = relJD(y, mo, d, h, mi);
    const lon0 = sunLon(jd);
    const idx = termIndex(y, mo, d, h, mi);
    const t0 = ((idx * 15 - 45) % 360 + 360) % 360;
    const off = ((lon0 - t0) % 360 + 360) % 360;
    return jd - off / 0.9856;
  }
  // M4：交节临界提示——距上一交节 / 距下一交节的小时数
  function hoursToTermBoundary(y, mo, d, h, mi) {
    if (CAL && CAL.termBounds) return CAL.termBounds(y, mo, d, h, mi);
    const cur = relJD(y, mo, d, h, mi);
    const start = termStartJD(y, mo, d, h, mi);
    const next = start + 365.2422 / 24;
    return { since: (cur - start) * 24, until: (next - cur) * 24,
             near: Math.min((cur - start) * 24, (next - cur) * 24) <= 1 };
  }
  function eqOfTime(y, mo, d) {
    const N = jdn(y, mo, d) - jdn(y, 1, 1) + 1;
    const B = 2 * Math.PI * (N - 81) / 364;
    return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  }
  function toTrueSolar(y, mo, d, h, mi, lon, meridian) {
    const deltaMin = Math.round((lon - (meridian == null ? BASE_LON : meridian)) * 4);
    const total = jdn(y, mo, d) * 1440 + h * 60 + mi + deltaMin;
    const jd = Math.floor(total / 1440);
    const rem = ((total % 1440) + 1440) % 1440;
    const dt = fromJdn(jd);
    return { y: dt.y, mo: dt.m, d: dt.d, h: Math.floor(rem / 60), mi: rem % 60, delta: deltaMin };
  }

  /* ============ 戊日适配：历法提供者 ============ *
   * 戊日全站以 lunar-javascript 为唯一历法源（干支/节气精确时刻）。
   * qimen-cal.js 在加载后调用 QM.setCalendarProvider() 注入实现：
   * termIndex / termStartRelJD / termBounds 全部改走精确交节时刻，
   * 替换原引擎的太阳视黄经近似公式（±15 分钟）。未注入时回落原公式。 */
  let CAL = null;
  function setCalendarProvider(p) { CAL = p || null; }

  /* ============ 结构化错误（M0-2） ============ */
  class QmError extends Error {
    constructor(code, message, detail) {
      super(message); this.name = "QmError"; this.code = code; this.detail = detail || {};
    }
  }

  /* ============ 农历转换（v3.1 阴盘奇门依赖） ============ *
   * 数据来源：香港天文台《公历-农历对照表》(1901-2100)
   *   https://www.hko.gov.hk/tc/gts/time/conversion.htm
   * 编码采用流传最广的 lunarInfo 十六进制表。仅 1900-2100 可用。 */
  const LUNAR_INFO = [
    0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
    0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
    0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
    0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
    0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
    0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
    0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
    0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
    0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
    0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,
    0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
    0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
    0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
    0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
    0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
    0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
    0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
    0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
    0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
    0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
    0x0d520
  ];
  const LUNAR_BASE = jdn(1900, 1, 31);   // 农历 1900 年正月初一
  function lunarLeapMonth(y) { return LUNAR_INFO[y - 1900] & 0xf; }
  function lunarLeapDays(y) { return lunarLeapMonth(y) ? ((LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29) : 0; }
  function lunarMonthDays(y, m) { return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29; }
  function lunarYearDays(y) {
    let s = 348;
    for (let i = 0x8000; i > 0x8; i >>= 1) s += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
    return s + lunarLeapDays(y);
  }
  function solarToLunar(y, m, d) {
    if (y < 1900 || y > 2100) return null;
    let off = jdn(y, m, d) - LUNAR_BASE;
    let ly = 1900;
    while (ly < 2100 && off >= lunarYearDays(ly)) { off -= lunarYearDays(ly); ly++; }
    const lm = lunarLeapMonth(ly);
    for (let i = 1; i <= 12; i++) {
      const md = lunarMonthDays(ly, i);
      if (off < md) return { year: ly, month: i, day: off + 1, leap: false };
      off -= md;
      if (lm === i) {
        const ld = lunarLeapDays(ly);
        if (off < ld) return { year: ly, month: i, day: off + 1, leap: true };
        off -= ld;
      }
    }
    return { year: ly, month: 12, day: off + 1, leap: false };
  }

  /* ============ 口径元数据（M1-5） ============ */
  const DEFAULTS = {
    dingju: "chabu",   // chabu | zhirun | maoshan | yinpan(阴盘)
    pan: "zhuan",      // zhuan | fei_tiaojian(民间) | fei_guaqi(古籍)
    zishi: "zichu",    // zichu(23:00换日·默认) | zizheng(00:00换日) | earlylate(夜子时不换日)
    jigong: "kun2",    // kun2 | erba | siwei | fei
    calendar: "diti",  // diti(定气) | pingqi(平气)
    baseLon: BASE_LON,
    lon: null
  };
  const SCHEMA = [
    { key:"dingju", name:"定局法", values:{
      chabu:"拆补法——符头取最近甲/己日，以当日实际节气定三元。教学与市面最常用。",
      zhirun:"置闰法——只认甲子/甲午/己卯/己酉四个上元符头，自符头起五日一元，节气取符头日所属，三元未走完仍属上一节气。",
      maoshan:"茅山法——不看符头，交节即上元，每六十时辰换中元、再换下元。极简，用者最少。",
      yinpan:"阴盘奇门——按太阴历（月亮周期）起局，以「年支序数+农历月数+农历日数+时支序数」之和除九取余定局，不拆补、不置闰、不分节气三元。近代流行排法，非古籍古法。" } },
    { key:"pan", name:"盘法", values:{
      zhuan:"转盘奇门——天盘人盘整体旋转，九星八门按八卦顺时针环轮转，顺序恒不颠倒。最通行。",
      fei_tiaojian:"飞盘·九宫跳涧——按九宫数序飞布（阳遁 1→2→3→4→6→7→8→9，阴遁逆）。民间常见说法，未见古籍依据。",
      fei_guaqi:"飞盘·卦气飞越——八门依休死伤杜开惊生景布八卦宫，九星依蓬芮冲辅禽心柱任，俱不入中五。见《奇门法窍·论飞宫》。" } },
    { key:"zishi", name:"子时换日派", values:{
      zichu:"子初派（默认）——23:00 起即作次日子时。袁树珊《命理探源》一系；《奇门法窍》算例可算术检验。",
      zizheng:"子正派——00:00 起作次日子时。韦千里《千里命稿》一系。",
      earlylate:"早/晚子时三分——夜子时不换日，仍属当日。本工具仅供对照。" } },
    { key:"jigong", name:"中五宫寄宫", values:{
      kun2:"寄坤二宫（本工具默认）——天禽寄天芮同行，值使落中则寄坤二。最通行。",
      erba:"寄二八宫——寄坤二或艮八，各家取舍不一。",
      siwei:"寄四维随时令——按节令寄四维宫。",
      fei:"飞盘不寄——仅飞盘法有此说，天禽不并入他星。" } },
    { key:"calendar", name:"历法基准", values:{
      diti:"定气法（默认）——按太阳视黄经 15° 一个节气，《时宪历》以来通行。本引擎精度约 ±15 分钟。",
      pingqi:"平气法——回归年长度均分节气，《授时历》一路。本引擎以定气节气近似等分推算。" } },
    { key:"trueSolar", name:"真太阳时口径", values:{
      beijing:"北京时间（不校正）——全境统一钟表时间。",
      true:"真太阳时——按当地经度与基准经线之差换算（每度 4 分钟，不计均时差），可落入不同时辰。经度与时间基准取自戊日「我的 → 设置」。" } }
  ];
  function metadataOf(o) {
    const m = Object.assign({}, DEFAULTS, o || {});
    const noCorr = (m.lon == null || m.lon === "" || +m.lon === m.baseLon);
    return {
      dingju: m.dingju, dingjuName: SCHEMA[0].values[m.dingju],
      pan: m.pan, panName: SCHEMA[1].values[m.pan],
      zishi: m.zishi, zishiName: SCHEMA[2].values[m.zishi],
      jigong: m.jigong, jigongName: SCHEMA[3].values[m.jigong],
      calendar: m.calendar, calendarName: SCHEMA[4].values[m.calendar],
      trueSolar: noCorr ? "beijing" : "true",
      trueSolarName: noCorr ? SCHEMA[5].values.beijing
        : SCHEMA[5].values.true + "（东经 " + m.lon + "°，基准 " + m.baseLon + "°）",
      lon: noCorr ? null : +m.lon, baseLon: m.baseLon
    };
  }

  /* ============ 寄宫方案（M1-4） ============ */
  function jigongPalace(p, jigong) {
    if (p !== 5) return p;
    if (jigong === "erba") return 2;
    if (jigong === "siwei") return 2;
    if (jigong === "fei") return 5;
    return 2;
  }

  /* ============ 主排盘 ============ */
  function paipan(y, mo, d, h, mi, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    const meta = metadataOf(opts);
    let solarNote = null, crossShichen = false, crossDay = false;

    if (opts.lon != null && opts.lon !== "" && +opts.lon !== opts.baseLon) {
      const before = { y, mo, d, h };
      const t = toTrueSolar(y, mo, d, h, mi, +opts.lon, opts.baseLon);
      if (t.h !== before.h) crossShichen = true;
      if (t.d !== before.d || t.mo !== before.mo || t.y !== before.y) crossDay = true;
      solarNote = "已按东经 " + opts.lon + "° 换算真太阳时（修正 "
        + (t.delta >= 0 ? "+" : "") + t.delta + " 分钟）"
        + (crossShichen ? "；⚠ 校正后已跨时辰" : "") + (crossDay ? "，并跨日" : "");
      y = t.y; mo = t.mo; d = t.d; h = t.h; mi = t.mi;
    }

    /* --- 子时换日派（M1-3） --- */
    let dayShift = 0;
    if (h >= 23) {
      if (opts.zishi === "zichu") dayShift = 1;      // 23:00 即作次日
      else if (opts.zishi === "earlylate") dayShift = 0; // 夜子时不换日
      else dayShift = 0;                                // zizheng：00:00 才换，23 点段仍属当日
    }
    const J = jdn(y, mo, d) + dayShift;
    const dayIdx = ((J + 49) % 60 + 60) % 60;
    const ti = termIndex(y, mo, d, h, mi);
    const term = TERMS[ti];
    const yangNow = (ti >= 21 || ti <= 8);

    /* --- 四柱 --- */
    const yr = (ti >= 22 || (ti === 21 && mo === 1)) ? y - 1 : y;
    const yIdx = ((yr - 4) % 60 + 60) % 60;
    const mBrArr = ["寅","卯","辰","巳","午","未","申","酉","戌","亥","子","丑"];
    const mIdx = Math.floor(ti / 2);
    const mSt = ((yIdx % 10 % 5) * 2 + 2 + mIdx) % 10;
    const mIdx60 = gzIdx(mSt, DZ.indexOf(mBrArr[mIdx]));
    const hBr = Math.floor(((h + 1) % 24) / 2);
    const hSt = ((dayIdx % 10 % 5) * 2 + hBr) % 10;
    const hI = gzIdx(hSt, hBr);

    /* --- 定局 --- */
    let yuanIdx = 0, fuInfo = null, useTerm;
    let yinpanResult = null;   // 阴盘奇门定局结果（不经过节气三元）
    if (opts.dingju === "yinpan") {
      // 阴盘奇门：太阴历起局，不拆补、不置闰、不分节气三元。
      // 局数 = (年支序数 + 农历月数 + 农历日数 + 时支序数) % 9，整除取 9。
      const lunar = solarToLunar(y, mo, d);
      if (!lunar) throw new QmError("YINPAN_LUNAR_RANGE",
        "阴盘奇门定局失败：日期超出农历数据范围（1900-2100 年）",
        { y, mo, d });
      const yz = DZ[yIdx % 12];      // 年支
      const hz = DZ[hBr];            // 时支
      const sum = (DZ.indexOf(yz) + 1) + lunar.month + lunar.day + (DZ.indexOf(hz) + 1);
      const ju = sum % 9 === 0 ? 9 : sum % 9;
      yuanIdx = 0;
      fuInfo = { name: null, term: null, offset: null, termUsed: null,
                 lunar: lunar, yz, hz, sum, ju };
      useTerm = null;
      yinpanResult = { lunar, yz, hz, sum, ju };
    } else if (opts.dingju === "zhirun") {
      let back = -1;
      for (let i = 0; i < 60; i++) {
        if (UPPER_FU.indexOf(gzName(((dayIdx - i) % 60 + 60) % 60)) > -1) { back = i; break; }
      }
      if (back < 0) back = 0;
      const fdt = fromJdn(J - back);
      const fuTerm = TERMS[termIndex(fdt.y, fdt.m, fdt.d, 12, 0)];
      yuanIdx = back < 5 ? 0 : back < 10 ? 1 : 2;
      fuInfo = { name: gzName(((dayIdx - back) % 60 + 60) % 60), term: fuTerm, offset: back, termUsed: fuTerm };
      useTerm = fuTerm;
    } else if (opts.dingju === "maoshan") {
      const hoursIn = (relJD(y, mo, d, h, mi) - termStartJD(y, mo, d, h, mi)) * 24;
      const n = Math.max(0, Math.floor(hoursIn / 2));
      yuanIdx = n < 60 ? 0 : n < 120 ? 1 : 2;
      fuInfo = { name: null, term: term, offset: n, termUsed: term };
      useTerm = term;
    } else {
      const ds = dayIdx % 10;
      const back = Math.min(ds, (ds + 5) % 10);
      const fuIdx = ((dayIdx - back) % 60 + 60) % 60;
      yuanIdx = [0, 2, 1][((fuIdx % 12) + 12) % 12 % 3];
      fuInfo = { name: gzName(fuIdx), term: term, offset: back, termUsed: term };
      useTerm = term;
    }
    const yuanName = ["上元", "中元", "下元"][yuanIdx];

    /* --- 阴阳遁与局数 --- */
    let yangOfUse, dunForJu, ju;
    if (yinpanResult) {
      // 阴盘奇门：阴阳遁按节气（冬至后夏至前阳遁），局数直接取太阴数余
      yangOfUse = yangNow;
      dunForJu = yangOfUse ? "阳遁" : "阴遁";
      ju = yinpanResult.ju;
    } else {
      /* --- M0 修复核心：阴阳遁必须跟随「定局实际所用节气」 --- *
       * v2 缺陷：用当前时刻的 yang 查表，而置闰法 useTerm 可能是符头日节气，
       * 二者落入不同阴阳遁半球时 JU[dun][term] 为 undefined → TypeError。 */
      if (JU["阳遁"][useTerm]) yangOfUse = true;
      else if (JU["阴遁"][useTerm]) yangOfUse = false;
      else throw new QmError("JU_TERM_MISSING",
        "定局失败：节气「" + useTerm + "」在阴阳遁局数表中缺项",
        { term: useTerm, yuan: yuanName, yuanIdx, dingju: opts.dingju });
      dunForJu = yangOfUse ? "阳遁" : "阴遁";
      ju = JU[dunForJu][useTerm][yuanIdx];
      if (ju == null) throw new QmError("JU_YUAN_MISSING",
        "定局失败：节气「" + useTerm + "」" + dunForJu + "缺" + yuanName,
        { term: useTerm, dun: dunForJu, yuan: yuanName, yuanIdx });
    }

    /* --- 地盘三奇六仪 --- */
    const seq = ["戊","己","庚","辛","壬","癸","丁","丙","乙"];
    const palGan = {}, ganPal = {};
    for (let i = 0; i < 9; i++) {
      const p = yangOfUse ? ((ju - 1 + i) % 9) + 1 : (((ju - 1 - i) % 9) + 9) % 9 + 1;
      palGan[p] = seq[i]; ganPal[seq[i]] = p;
    }

    /* --- 旬首 --- */
    const xunStart = hI - (hI % 10);
    const xunGan = "戊己庚辛壬癸"[xunStart / 10];
    const xunName = "甲" + DZ[xunStart % 12];
    const g0 = ganPal[xunGan];
    const g0p = jigongPalace(g0, opts.jigong);

    /* --- 空亡 / 马星 --- */
    const kongWang = [DZ[(xunStart + 10) % 12], DZ[(xunStart + 11) % 12]];
    const hZhi = DZ[hBr];
    let maXing = null, maPalace = null;
    for (const g of ["申子辰","寅午戌","巳酉丑","亥卯未"]) {
      if (g.indexOf(hZhi) > -1) {
        maXing = {"申子辰":"寅","寅午戌":"申","巳酉丑":"亥","亥卯未":"巳"}[g]; break;
      }
    }
    if (maXing) maPalace = {"寅":"艮八宫·东北","申":"坤二宫·西南","巳":"巽四宫·东南","亥":"乾六宫·西北"}[maXing];

    /* --- 宫环与盘法（M5） --- */
    const isGuaqi = opts.pan === "fei_guaqi";
    const isFei = opts.pan !== "zhuan";
    const ring = isGuaqi ? RING_GUAQI
      : (isFei ? (yangOfUse ? RING_FEI_YANG : RING_FEI_YIN) : RING_ZHUAN);
    const godDir = isFei ? 1 : (yangOfUse ? 1 : -1);

    /* --- 天盘九星（值符随时干） --- */
    const shiGan = TG[hSt];
    const gp = (shiGan === "甲") ? g0 : ganPal[shiGan];
    const gpRing = jigongPalace(gp, opts.jigong);
    const shift = ((ring.indexOf(gpRing) - ring.indexOf(g0p)) % 8 + 8) % 8;
    const starAt = {}, tianGan = {};
    for (let i = 0; i < 8; i++) {
      const p = ring[i], hp = ring[(i - shift + 8) % 8];
      if (isGuaqi) {                       // 卦气飞越：九星固定布宫，不随值符旋转
        starAt[p] = STAR_GUAQI[p];
        tianGan[p] = palGan[p] + (p === 2 ? "、" + palGan[5] : "");
      } else if (hp === 2) {
        starAt[p] = "天芮·禽"; tianGan[p] = palGan[2] + "、" + palGan[5];
      } else { starAt[p] = STAR_HOME[hp]; tianGan[p] = palGan[hp]; }
    }

    /* --- 值使门 --- */
    const dHome = g0p;
    const zhiShiName = isGuaqi ? DOOR_GUAQI[dHome] : DOOR_HOME[dHome];
    const nSteps = hI % 10;
    let land = ((dHome - 1 + (yangOfUse ? 1 : -1) * nSteps) % 9 + 9) % 9 + 1;
    let zhushiNote = null;
    if (land === 5) {
      const jn = { kun2:"寄坤二宫", erba:"寄二八宫", siwei:"寄四维随时令", fei:"飞盘不寄（仍留中五）" }[opts.jigong];
      zhushiNote = "值使落中五宫，按「" + jn + "」处理";
      land = jigongPalace(5, opts.jigong);
    }
    const doorAt = {};
    if (isGuaqi) {
      for (const p of ring) doorAt[p] = DOOR_GUAQI[p];   // 卦气飞越八门亦不旋转
    } else {
      const dShift = ((ring.indexOf(land) - ring.indexOf(dHome)) % 8 + 8) % 8;
      for (let i = 0; i < 8; i++) doorAt[ring[i]] = DOOR_HOME[ring[(i - dShift + 8) % 8]];
    }

    /* --- 八神 --- */
    const gods = ["值符","腾蛇","太阴","六合","白虎","玄武","九地","九天"];
    const s0 = ring.indexOf(gpRing);
    const godAt = {};
    for (let k = 0; k < 8; k++) godAt[ring[((s0 + godDir * k) % 8 + 8) % 8]] = gods[k];

    /* --- 基础标记（完整判定见 geju / fenxi） --- */
    const tags = [];
    if (shift === 0) tags.push("伏吟局：天盘地盘相同，诸事宜静不宜动");
    if (shift === 4) tags.push("反吟局：天地盘对冲，事多反复曲折");

    return {
      input: { y, mo, d, h, mi },
      method: { dingju: opts.dingju, pan: opts.pan, zishi: opts.zishi, jigong: opts.jigong,
                calendar: opts.calendar, solarNote, crossShichen, crossDay },
      metadata: meta,
      siZhu: { year: gzName(yIdx), month: gzName(mIdx60), day: gzName(dayIdx), hour: gzName(hI) },
      term, termForJu: useTerm, yuan: yuanName, dun: dunForJu, ju,
      yinpan: yinpanResult,
      fu: fuInfo,
      xun: { name: xunName, gan: xunGan, palace: g0 },
      zhiFu: { star: (g0 === 5) ? "天禽(寄天芮)" : STAR_HOME[g0], palace: gpRing },
      zhiShi: { door: zhiShiName, palace: land, note: zhushiNote },
      palGan, ganPal, tianGan, starAt, doorAt, godAt, ring,
      kongWang, maXing, maPalace,
      dayStem: TG[((dayIdx % 10) + 10) % 10], hourZhi: hZhi, shift, isGuaqi
    };
  }

  /* ============ 五家大势 ============ */
  function dashi(y, mo, d, h, mi) {
    const ti = termIndex(y, mo, d, h, mi);
    const yr = (ti >= 22 || (ti === 21 && mo === 1)) ? y - 1 : y;
    const yIdx = ((yr - 4) % 60 + 60) % 60;
    const yGz = gzName(yIdx), yZhi = DZ[yIdx % 12];
    const yCycle = ((yr - 1984) % 180 + 180) % 180;
    const yYuanIdx = yCycle < 60 ? 0 : yCycle < 120 ? 1 : 2;
    const YS = [1, 4, 7];
    const nian = {
      gz: yGz, yuan: ["上元","中元","下元"][yYuanIdx],
      startPalace: YS[yYuanIdx], startPalaceName: PAL_NAME[YS[yYuanIdx]],
      ziBai: ZI_BAI[YS[yYuanIdx]], dun: "阴遁",
      note: "年家奇门三元共一百八十年，均为阴遁局，逆布六仪、顺布三奇。"
    };
    const MENG = ["寅","申","巳","亥"], ZHONG = ["子","午","卯","酉"];
    let season = "季";
    if (MENG.indexOf(yZhi) > -1) season = "孟"; else if (ZHONG.indexOf(yZhi) > -1) season = "仲";
    const mYuanIdx = season === "孟" ? 0 : season === "仲" ? 1 : 2;
    const mIdx = Math.floor(ti / 2);
    const monthNo = ((mIdx % 12) + 12) % 12 + 1;
    const ziNum = ((MONTH_ZI[season] - 1 - (monthNo - 1)) % 9 + 9) % 9 + 1;
    const mBrArr = ["寅","卯","辰","巳","午","未","申","酉","戌","亥","子","丑"];
    const mSt2 = ((yIdx % 10 % 5) * 2 + 2 + mIdx) % 10;
    const yue = {
      gz: gzName(gzIdx(mSt2, DZ.indexOf(mBrArr[mIdx]))), season,
      yuan: ["上元","中元","下元"][mYuanIdx],
      startPalace: YS[mYuanIdx], startPalaceName: PAL_NAME[YS[mYuanIdx]],
      monthNo, ziBai: ZI_BAI[ziNum],
      note: "月家奇门五年一元，依年支孟仲季分三元；入中宫用月紫白（正月孟二黑、仲八白、季五黄，逐月逆行）。"
    };
    const dayIdx = ((jdn(y, mo, d) + (h >= 23 ? 1 : 0) + 49) % 60 + 60) % 60;
    const ds = dayIdx % 10;
    const fuIdx = ((dayIdx - Math.min(ds, (ds + 5) % 10)) % 60 + 60) % 60;
    const dYuanIdx = [0, 2, 1][((fuIdx % 12) + 12) % 12 % 3];
    const yang = (ti >= 21 || ti <= 8);
    const ri = {
      gz: gzName(dayIdx), term: TERMS[ti], dun: yang ? "阳遁" : "阴遁",
      yuan: ["上元","中元","下元"][dYuanIdx],
      ju: (JU[yang ? "阳遁" : "阴遁"][TERMS[ti]] || [null,null,null])[dYuanIdx],
      note: "日家每日一局，多用于具体事务择日；此处沿用节气三元定局以便对照。"
    };
    return { nian, yue, ri };
  }

  /* ============ 盘差分（M4-5） ============ */
  function diffCharts(a, b) {
    const fields = [], palaces = [];
    if (a.dun + a.ju !== b.dun + b.ju)
      fields.push({ key:"局数", a:a.dun + a.ju + "局", b:b.dun + b.ju + "局" });
    if (a.termForJu !== b.termForJu || a.yuan !== b.yuan)
      fields.push({ key:"定局节气", a:a.termForJu + "·" + a.yuan, b:b.termForJu + "·" + b.yuan });
    if (a.zhiFu.star !== b.zhiFu.star || a.zhiFu.palace !== b.zhiFu.palace)
      fields.push({ key:"值符星", a:a.zhiFu.star + "落" + a.zhiFu.palace + "宫", b:b.zhiFu.star + "落" + b.zhiFu.palace + "宫" });
    if (a.zhiShi.door !== b.zhiShi.door || a.zhiShi.palace !== b.zhiShi.palace)
      fields.push({ key:"值使门", a:a.zhiShi.door + "落" + b.zhiShi.palace, b:b.zhiShi.door + "落" + b.zhiShi.palace });
    for (let p = 1; p <= 9; p++) {
      if (p === 5) continue;
      const ch = [];
      if (a.starAt[p] !== b.starAt[p]) ch.push("九星 " + a.starAt[p] + " → " + b.starAt[p]);
      if (a.doorAt[p] !== b.doorAt[p]) ch.push("八门 " + a.doorAt[p] + " → " + b.doorAt[p]);
      if (a.godAt[p]  !== b.godAt[p])  ch.push("八神 " + a.godAt[p] + " → " + b.godAt[p]);
      if (a.tianGan[p] !== b.tianGan[p]) ch.push("天盘干 " + a.tianGan[p] + " → " + b.tianGan[p]);
      if (ch.length) palaces.push({ palace:p, name:PAL_NAME[p], changes:ch });
    }
    return { same: fields.length === 0 && palaces.length === 0,
             fields, palaces, diffCount: fields.length + palaces.length };
  }

  /* ============ 真太阳时城市库（M4） ============ */
  const CITY_LON = {
    "北京":116.4,"上海":121.5,"广州":113.3,"深圳":114.1,"天津":117.2,"重庆":106.5,
    "成都":104.1,"杭州":120.2,"南京":118.8,"武汉":114.3,"西安":108.9,"长沙":112.9,
    "郑州":113.6,"济南":117.0,"青岛":120.4,"沈阳":123.4,"哈尔滨":126.6,"长春":125.3,
    "昆明":102.7,"贵阳":106.6,"南宁":108.4,"海口":110.3,"兰州":103.8,"西宁":101.8,
    "银川":106.3,"乌鲁木齐":87.6,"拉萨":91.1,"呼和浩特":111.7,"太原":112.5,"石家庄":114.5,
    "合肥":117.3,"福州":119.3,"厦门":118.1,"南昌":115.9,"香港":114.2,"澳门":113.5,
    "台北":121.5,"苏州":120.6,"无锡":120.3,"宁波":121.6,"温州":120.7,"东莞":113.8
  };

  const api = {
    paipan, dashi, diffCharts, metadataOf, toTrueSolar, setCalendarProvider, termStartJD, termIndex, eqOfTime,
    hoursToTermBoundary, jigongPalace, CITY_LON, QmError, DEFAULTS, SCHEMA, BASE_LON,
    TG, DZ, TERMS, RING_ZHUAN, RING_FEI_YANG, RING_FEI_YIN, RING_GUAQI,
    // 向后兼容别名：v2 的 app.js / test_engine.js 仍在引用
    CIRCLE: RING_ZHUAN,
    PAL_NAME, PAL_BAGUA, PAL_WX, PAL_DIR, WX_SHENG, WX_KE,
    STAR_HOME, STAR_WX, DOOR_HOME, DOOR_WX, DOOR_GUAQI, STAR_GUAQI, ZI_BAI, JU,
    // v3.1 农历转换
    solarToLunar, LUNAR_INFO,
    gzName, jdn, fromJdn
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.QM = api;
})(typeof window !== "undefined" ? window : globalThis);
