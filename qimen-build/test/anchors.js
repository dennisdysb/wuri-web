/* 戊日适配锚点断言：评估报告手验值 + lunar 精确节气判别 + 四柱与 lunar 全量对照。
* 由 runner.js 装配全局（window/Solar/QM+历法提供者）后运行。 */
const Q = global.QM, Solar = global.Solar;
let pass = 0, fail = 0;
function eq(a, e, msg) {
if (String(a) === String(e)) pass++;
else { fail++; console.log(`✗ ${msg}: 期望=${e} 实际=${a}`);}
}
function sec(name) { console.log("\n");}

sec("作者公开锚点 2022-05-09 12:00 三种定局法");
let c = Q.paipan(2022, 5, 9, 12, 0, { dingju: "chabu"});
eq(c.dun + c.ju, "阳遁7", "拆补局数"); eq(c.termForJu, "立夏", "拆补节气"); eq(c.yuan, "下元", "拆补三元");
c = Q.paipan(2022, 5, 9, 12, 0, { dingju: "zhirun"});
eq(c.dun + c.ju, "阳遁8", "置闰局数"); eq(c.termForJu, "谷雨", "置闰节气"); eq(c.yuan, "下元", "置闰三元");
c = Q.paipan(2022, 5, 9, 12, 0, { dingju: "maoshan"});
eq(c.dun + c.ju, "阳遁4", "茅山局数"); eq(c.termForJu, "立夏", "茅山节气"); eq(c.yuan, "上元", "茅山三元");

sec("手验例 A：2024-12-25 14:00 阳遁四局");
c = Q.paipan(2024, 12, 25, 14, 0);
eq([c.siZhu.year, c.siZhu.month, c.siZhu.day, c.siZhu.hour].join("/"), "甲辰/丙子/癸亥/己未", "四柱");
eq(c.dun + c.ju, "阳遁4", "局数"); eq(c.termForJu, "冬至", "节气"); eq(c.yuan, "下元", "三元");
eq(c.fu.name, "己未", "符头"); eq(c.xun.name, "甲寅", "旬首"); eq(c.xun.gan, "癸", "旬遁");
eq(c.zhiFu.star, "天英", "值符星"); eq(c.zhiFu.palace, 2, "值符宫");
eq(c.zhiShi.door, "景门", "值使门"); eq(c.zhiShi.palace, 2, "值使宫");
eq(c.kongWang.join(""), "子丑", "空亡"); eq(c.maXing, "巳", "马星");

sec("手验例 B：2025-07-10 09:00 阴遁八局");
c = Q.paipan(2025, 7, 10, 9, 0);
eq([c.siZhu.year, c.siZhu.month, c.siZhu.day, c.siZhu.hour].join("/"), "乙巳/癸未/庚辰/辛巳", "四柱");
eq(c.dun + c.ju, "阴遁8", "局数"); eq(c.termForJu, "小暑", "节气"); eq(c.yuan, "上元", "三元");
eq(c.fu.name, "己卯", "符头"); eq(c.xun.name, "甲戌", "旬首"); eq(c.xun.gan, "己", "旬遁");
eq(c.zhiFu.star, "天柱", "值符星"); eq(c.zhiFu.palace, 2, "值符宫");
eq(c.zhiShi.door, "惊门", "值使门"); eq(c.zhiShi.palace, 9, "值使宫");
eq(c.kongWang.join(""), "申酉", "空亡"); eq(c.maXing, "亥", "马星");

sec("lunar 精确节气判别（近似公式在 14:40 才翻转，精确交节 14:29:17）");
eq(Q.paipan(2026, 10, 8, 14, 20).term, "秋分", "14:20 交节前");
eq(Q.paipan(2026, 10, 8, 14, 35).term, "寒露", "14:35 交节后（近似公式会误判秋分）");
const b = Q.hoursToTermBoundary(2026, 10, 8, 14, 35);
eq(b.near, true, "交节临界标记");
eq(Math.abs(b.since - (5 + 43 / 60) / 60) < 0.01, true, "距交节小时数≈0.096（实际 " + b.since.toFixed(3) + "）");

sec("真太阳时新口径（仅经度差、无均时差）");
const t1 = Q.toTrueSolar(2026, 9, 27, 12, 30, 116.4);
eq(t1.delta, -14, "北京 116.4 修正 = (116.4-120)*4 = -14（旧口径含均时差约 -24）");
eq(t1.h + ":" + t1.mi, "12:16", "换算时刻");
const t2 = Q.toTrueSolar(2026, 9, 27, 12, 30, -79.4, -60);
eq(t2.delta, -78, "多伦多经度/子午线修正");
const cLon = Q.paipan(2024, 12, 25, 14, 0, { lon: 116.4, baseLon: 120});
eq(cLon.method.solarNote!= null, true, "paipan 带真太阳时说明");
eq(cLon.input.h, 13, "换算后小时 14:00-14分→13:46 时");

sec("四柱与 lunar-javascript 全量对照（随机 300 时刻 + 边界）");
let mism = 0, samples = 0;
function checkEC(y, mo, d, h, mi) {
samples++;
const cc = Q.paipan(y, mo, d, h, mi);
const ec = Solar.fromYmdHms(y, mo, d, h, mi, 0).getLunar().getEightChar();
try { ec.setSect(1);} catch (e) {}
const want = [ec.getYear(), ec.getMonth(), ec.getDay(), ec.getTime()].join("/");
const got = [cc.siZhu.year, cc.siZhu.month, cc.siZhu.day, cc.siZhu.hour].join("/");
if (want!== got) { mism++; if (mism <= 5) console.log(` 四柱不符 ${y}-${mo}-${d} ${h}:${mi} 期望 ${want} 实际 ${got}`);}
}
let seed = 42;
function rnd(n) { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n;}
for (let k = 0; k < 300; k++) checkEC(2023 + rnd(4), 1 + rnd(12), 1 + rnd(28), rnd(24), rnd(60));
checkEC(2026, 2, 4, 3, 0); checkEC(2026, 2, 4, 5, 0); // 立春交节前后（年/月柱）
checkEC(2026, 9, 27, 23, 30); checkEC(2025, 1, 1, 23, 59); // 子初换日
checkEC(2026, 10, 8, 14, 35); checkEC(2024, 12, 21, 17, 25); // 交节临界（冬至 17:20:35 后）
eq(mism, 0, `四柱对照 ${samples} 例不符数`);

console.log(`\n anchors: ${pass} 通过 / ${fail} 失败`);
process.exit(fail? 1: 0);
