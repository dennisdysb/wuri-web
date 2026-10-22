/* 排盘引擎验证：干支锚点 + 手工推演案例断言 */
const Q = require("./src/engine.js");
let pass = 0, fail = 0;
function eq(actual, expect, msg) {
  if (String(actual) === String(expect)) { pass++; }
  else { fail++; console.log(`✗ ${msg}: 期望=${expect} 实际=${actual}`); }
}

// --- 干支锚点 ---
eq(Q.paipan(1949, 10, 1, 12, 0).siZhu.day, "甲子", "1949-10-01 日柱");
eq(Q.paipan(1970, 1, 1, 12, 0).siZhu.day, "辛巳", "1970-01-01 日柱");
eq(Q.paipan(2000, 1, 1, 12, 0).siZhu.day, "戊午", "2000-01-01 日柱");
eq(Q.paipan(2026, 9, 27, 12, 30).siZhu.day, "甲辰", "2026-09-27 日柱");

// --- 晚子时规则：2026-09-27 23:30 应作 9-28 乙巳日 丙子时 ---
let t = Q.paipan(2026, 9, 27, 23, 30);
eq(t.siZhu.day, "乙巳", "23点日柱进位");
eq(t.siZhu.hour, "丙子", "晚子时时柱");

// --- 手工推演案例：2026-09-27 12:30（庚午时）---
// 四柱丙午年 丁酉月 甲辰日 庚午时；秋分 下元 阴遁四局；旬首甲子(戊)
// 值符天辅落坤二宫；值使杜门落兑七宫
t = Q.paipan(2026, 9, 27, 12, 30);
eq(t.siZhu.year, "丙午", "年柱");
eq(t.siZhu.month, "丁酉", "月柱");
eq(t.siZhu.hour, "庚午", "时柱");
eq(t.term, "秋分", "节气");
eq(t.dun, "阴遁", "阴阳遁");
eq(t.ju, 4, "局数");
eq(t.yuan, "下元", "三元");
eq(t.xun.name + "/" + t.xun.gan, "甲子/戊", "旬首");
eq(t.zhiFu.star + "@" + t.zhiFu.palace, "天辅@2", "值符星落宫");
eq(t.zhiShi.door + "@" + t.zhiShi.palace, "杜门@7", "值使门落宫");
// 九星：芮禽落乾六
eq(t.starAt[2], "天辅", "天辅落2宫");
eq(t.starAt[9], "天冲", "天冲落9宫");
eq(t.starAt[6], "天芮·禽", "芮禽落6宫");
// 天盘干：时干庚随芮禽（自坤二起，带地盘庚、乙）落乾六宫
eq(t.tianGan[9], "己", "天盘己落9宫（天冲自3宫带己）");
eq(t.tianGan[2], "戊", "天盘戊落2宫（值符宫）");
eq(t.tianGan[4], "癸", "天盘癸落4宫（天任自8宫带癸）");
eq(t.tianGan[6].indexOf("庚") > -1, true, "天盘庚随芮禽落6宫");
// 八门：值使杜门落7；开门落3
eq(t.doorAt[7], "杜门", "杜门落7宫");
eq(t.doorAt[3], "开门", "开门落3宫");
eq(t.doorAt[1], "死门", "死门落1宫");
// 八神（阴遁逆行）：值符2、腾蛇9、玄武1
eq(t.godAt[2], "值符", "值符神落2宫");
eq(t.godAt[9], "腾蛇", "腾蛇落9宫");
eq(t.godAt[1], "玄武", "玄武落1宫");
// 空亡（甲子旬空戌亥）
eq(t.kongWang.join(""), "戌亥", "空亡");
// 马星：午时 → 寅午戌马在申
eq(t.maXing, "申", "马星");

// --- 结构自检：任一时辰，天盘必含时干、八神值符必落时干宫 ---
const samples = [[2024, 6, 1, 8, 15], [2025, 12, 21, 20, 45], [2026, 3, 15, 5, 5], [2026, 9, 27, 14, 11], [2023, 2, 4, 11, 0]];
for (const s of samples) {
  const c = Q.paipan(...s);
  const hGan0 = c.siZhu.hour[0];
  // 甲遁于六仪：时干为甲时用旬首遁干检验
  const hGan = (hGan0 === "甲") ? c.xun.gan : hGan0;
  const inTian = Q.CIRCLE.some(p => c.tianGan[p].indexOf(hGan) > -1);
  eq(inTian, true, `时干(或遁干)${hGan}必现于天盘 (${s.join("-")})`);
  eq(c.godAt[c.zhiFu.palace], "值符", `值符神随值符星落宫 (${s.join("-")})`);
  const d0 = c.siZhu.day[0];
  const d = (d0 === "甲") ? c.xun.gan : d0;
  const dayOk = Q.CIRCLE.some(p => c.tianGan[p].indexOf(d) > -1) || Object.values(c.palGan).includes(d);
  eq(dayOk, true, `日干(或遁干)可寻 (${s.join("-")})`);
  // 冬至~芒种为阳遁
  const ti = Q.TERMS.indexOf(c.term);
  eq(c.dun, (ti >= 21 || ti <= 8) ? "阳遁" : "阴遁", `阴阳遁与节气一致 (${s.join("-")})`);
}

console.log(`\n测试完成：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
