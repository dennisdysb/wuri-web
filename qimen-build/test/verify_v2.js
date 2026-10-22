/* v2 新增能力验证：定局法三选一 / 飞盘 / 真太阳时 / 五家大势
 * 定局法期望值来自公开资料中的实算对照案例 */
const Q = require("./src/engine.js");
let pass = 0, fail = 0;
function eq(a, e, msg) {
  if (String(a) === String(e)) { pass++; console.log(`  ✓ ${msg} = ${a}`); }
  else { fail++; console.log(`  ✗ ${msg}: 期望=${e} 实际=${a}`); }
}

console.log("【案例A】2022-05-09 12:00（壬戌日，立夏第5天）");
console.log("资料对照：拆补=立夏下元阳7局 / 置闰=谷雨下元阳8局 / 茅山=立夏上元阳4局");
let a1 = Q.paipan(2022, 5, 9, 12, 0, { dingju: "chabu" });
let a2 = Q.paipan(2022, 5, 9, 12, 0, { dingju: "zhirun" });
let a3 = Q.paipan(2022, 5, 9, 12, 0, { dingju: "maoshan" });
eq(a1.siZhu.day, "壬戌", "A日柱");
eq(a1.dun + a1.ju + "局/" + a1.yuan, "阳遁7局/下元", "A拆补法");
eq(a2.dun + a2.ju + "局/" + a2.yuan, "阳遁8局/下元", "A置闰法");
eq(a2.termForJu, "谷雨", "A置闰法用符头日节气");
eq(a3.dun + a3.ju + "局/" + a3.yuan, "阳遁4局/上元", "A茅山法");

console.log("\n【案例B】2022-09-15 12:00（辛未日，白露第9天）");
console.log("资料对照：拆补=白露中元阴3局 / 置闰=白露中元阴3局 / 茅山=白露中元阴3局");
let b1 = Q.paipan(2022, 9, 15, 12, 0, { dingju: "chabu" });
let b2 = Q.paipan(2022, 9, 15, 12, 0, { dingju: "zhirun" });
let b3 = Q.paipan(2022, 9, 15, 12, 0, { dingju: "maoshan" });
eq(b1.siZhu.day, "辛未", "B日柱");
eq(b1.dun + b1.ju + "局/" + b1.yuan, "阴遁3局/中元", "B拆补法");
eq(b2.dun + b2.ju + "局/" + b2.yuan, "阴遁3局/中元", "B置闰法");
eq(b3.dun + b3.ju + "局/" + b3.yuan, "阴遁3局/中元", "B茅山法");

console.log("\n【飞盘】结构自检：星门神必覆盖八宫，且值符神随值符星");
const samples = [[2024, 6, 1, 8, 15], [2025, 12, 21, 20, 45], [2026, 3, 15, 5, 5], [2026, 9, 27, 14, 11]];
for (const s of samples) {
  for (const dj of ["chabu", "zhirun", "maoshan"]) {
    for (const pn of ["zhuan", "fei"]) {
      const c = Q.paipan(s[0], s[1], s[2], s[3], s[4], { dingju: dj, pan: pn });
      const okStar = c.ring.every(p => c.starAt[p]);
      const okDoor = c.ring.every(p => c.doorAt[p]);
      const okGod = c.ring.every(p => c.godAt[p]);
      const okTg = c.ring.every(p => c.tianGan[p]);
      const okFu = c.godAt[c.zhiFu.palace] === "值符";
      const ok = okStar && okDoor && okGod && okTg && okFu;
      eq(ok, true, `${s.join("-")} ${dj}/${pn} 八宫完整且值符神同位`);
      // 门去重：八门各出现一次
      const uniq = new Set(c.ring.map(p => c.doorAt[p]));
      eq(uniq.size, 8, `${s.join("-")} ${dj}/${pn} 八门不重不漏`);
    }
  }
}

console.log("\n【飞盘 vs 转盘】同一时刻应有可见差异或一致（结构合法即可）");
const z = Q.paipan(2026, 9, 27, 12, 30, { pan: "zhuan" });
const f = Q.paipan(2026, 9, 27, 12, 30, { pan: "fei" });
console.log("  转盘 值符:", z.zhiFu.star + "@" + z.zhiFu.palace, "值使:", z.zhiShi.door + "@" + z.zhiShi.palace);
console.log("  飞盘 值符:", f.zhiFu.star + "@" + f.zhiFu.palace, "值使:", f.zhiShi.door + "@" + f.zhiShi.palace);
eq(z.zhiFu.palace === f.zhiFu.palace && z.zhiShi.palace === f.zhiShi.palace, true, "两法值符值使落宫一致（定局相同）");
const diffCells = Q.RING_ZHUAN.filter(p => z.starAt[p] !== f.starAt[p]).length;
console.log(`  九星布宫不同的宫位数：${diffCells}/8（>0 说明飞盘确实换了一套布法）`);
eq(diffCells > 0, true, "飞盘与转盘九星布法不同");

console.log("\n【真太阳时】北京东经116.4° 换算");
const t1 = Q.toTrueSolar(2026, 9, 27, 12, 30, 116.4);
console.log(`  2026-09-27 12:30 北京 → ${t1.y}-${t1.mo}-${t1.d} ${t1.h}:${t1.mi}（修正 ${t1.delta} 分钟）`);
eq(Math.abs(t1.delta) < 20, true, "北京时差修正量在合理区间（±20分钟内）");
const t2 = Q.toTrueSolar(2026, 9, 27, 12, 30, 120);
eq(t2.delta === 0 || Math.abs(t2.delta) <= 16, true, "东经120°仅剩时差方程项");
const cLon = Q.paipan(2026, 9, 27, 12, 30, { lon: 116.4 });
eq(cLon.method.solarNote != null, true, "传入经度后带真太阳时说明");
eq(Q.paipan(2026, 9, 27, 12, 30).method.solarNote, null, "默认不做真太阳时校正（保持 v1 行为）");

console.log("\n【五家大势】2026-09-27 12:30");
const ds = Q.dashi(2026, 9, 27, 12, 30);
console.log("  年家:", JSON.stringify(ds.nian));
console.log("  月家:", JSON.stringify(ds.yue));
console.log("  日家:", JSON.stringify(ds.ri));
eq(ds.nian.yuan, "上元", "年家三元（1984起上元，2026在上元内）");
eq(ds.nian.startPalace, 1, "年家上元起坎一宫");
eq(ds.nian.ziBai, "一白", "年家上元一白入中宫");
eq(ds.nian.dun, "阴遁", "年家均为阴遁局");
eq(ds.yue.season, "仲", "月家孟仲季（2026丙午年支午→四仲→仲）");
eq(ds.yue.monthNo, 8, "月家节气月序（秋分前为八月）");
eq(ds.yue.ziBai, "一白", "月紫白逆行：仲年正月八白→八月一白");
eq(ds.yue.startPalace, 4, "月家仲年起巽四宫");
eq(ds.ri.dun, "阴遁", "日家阴阳遁与当日节气一致");
eq(ds.ri.term, "秋分", "日家节气");

console.log(`\n测试完成：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
