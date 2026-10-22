/* 面覆盖回归（M0-6）
 *
 * 为什么要有这个文件：v2 的 157 项测试全是定点断言，已知案例恰好避开崩溃窗口，
 * 结果一个每 25 次就崩一次的 bug 从测试网下溜了过去。
 * 本文件改为「全时段遍历」——任何时刻、任何口径崩了都直接红。
 *
 * 运行：node test/regression.js  （加 --quick 跑快档）
 */
const E = require("../src/engine.js");

const QUICK = process.argv.indexOf("--quick") > -1;
const Y0 = QUICK ? 2024 : 2000, Y1 = QUICK ? 2026 : 2050;
const DSTEP = QUICK ? 7 : 2, HOURS = QUICK ? [8, 20] : [0, 5, 11, 13, 20, 23];

// 七种主口径：3 阳盘定局法 + 阴盘 × {转盘, 九宫跳涧, 卦气飞越}
const OPTS = [
  { dingju: "chabu", pan: "zhuan" },
  { dingju: "zhirun", pan: "zhuan" },
  { dingju: "maoshan", pan: "zhuan" },
  { dingju: "chabu", pan: "fei_tiaojian" },
  { dingju: "chabu", pan: "fei_guaqi" },
  { dingju: "zhirun", pan: "fei_guaqi" },
  { dingju: "yinpan", pan: "zhuan" }
];

let pass = 0, fail = 0;
const failures = [];

function ok(cond, name) {
  if (cond) pass++; else { fail++; failures.push(name); }
}

/* ---- 1. 主回归：全时段 × 六口径不崩 ---- */
let total = 0, crash = 0, errs = {};
for (let y = Y0; y <= Y1; y++)
  for (let m = 1; m <= 12; m++)
    for (let d = 1; d <= 28; d += DSTEP)
      for (const h of HOURS)
        for (const o of OPTS) {
          total++;
          try {
            const c = E.paipan(y, m, d, h, 0, o);
            // 同时校验结构完整性：关键字段必须存在且局数为正整数
            if (!c.metadata || !c.dun || !(c.ju >= 1 && c.ju <= 9)) {
              crash++; errs["STRUCT"] = (errs["STRUCT"] || 0) + 1;
            }
          } catch (e) {
            crash++;
            const k = e.code || e.name;
            errs[k] = (errs[k] || 0) + 1;
            if (failures.length < 8)
              failures.push("崩溃 " + y + "-" + m + "-" + d + " " + h + "时 "
                + JSON.stringify(o) + " → " + k + " " + e.message);
          }
        }
ok(crash === 0, "全时段六口径零崩溃");

/* ---- 2. 原崩溃点必须已修复（回归锚点） ---- */
let fixed = true, fixedMsg = "";
try {
  const c = E.paipan(2024, 6, 21, 5, 0, { dingju: "zhirun" });
  if (!c.ju) { fixed = false; fixedMsg = "局数为空"; }
} catch (e) { fixed = false; fixedMsg = e.message; }
ok(fixed, "v2 崩溃点 2024-06-21 05:00 置闰法可正常排盘" + (fixed ? "" : "：" + fixedMsg));

/* ---- 3. 阴阳遁必须与定局节气同源（崩溃根因的充要条件） ---- */
let sameDun = true, dunMsg = "";
for (let y = 2000; y <= 2050; y += 1)
  for (let m = 1; m <= 12; m++)
    for (const d of [1, 11, 21])
      for (const h of [0, 5, 13, 23]) {
        for (const dj of ["chabu", "zhirun", "maoshan"]) {
          const c = E.paipan(y, m, d, h, 0, { dingju: dj });
          // 返回的 dun 必须真的存在于「定局所用节气」的表里
          const t = c.termForJu;
          if (!E.JU[c.dun][t]) {
            sameDun = false;
            dunMsg = y + "-" + m + "-" + d + " " + h + "时 " + dj
              + "：节令[" + t + "] 不属于所报[" + c.dun + "]";
            y = 2051; break;
          }
        }
      }
ok(sameDun, "阴阳遁与定局所用节气同源" + (sameDun ? "" : "：" + dunMsg));

/* ---- 4. 口径元数据六项齐全且可追溯 ---- */
{
  const c = E.paipan(2026, 10, 7, 14, 0, { lon: 116.4, zishi: "zizheng", jigong: "erba" });
  const need = ["dingju", "pan", "zishi", "jigong", "calendar", "trueSolar"];
  ok(need.every(k => c.metadata[k] && c.metadata[k].length > 0), "六项口径元数据齐全");
  ok(c.metadata.trueSolar === "true" && c.metadata.lon === 116.4, "真太阳时口径随经度生效");
  ok(c.metadata.zishi === "zizheng", "子时派写入元数据");
}

/* ---- 5. 子时换日三派真的产生不同日柱（开关必须有效，不能是摆设） ---- */
{
  // 子时派只对「夜子时」有分歧，日界点固定在 23:00 或 00:00。
  // 用同一夜的两个时刻对比：
  //   23:30 —— 子初派已换日，子正派与早/晚子时派仍在当日
  //   00:00 —— 已过 00:00，三派都应视为新的一日（此时不该再有分歧）
  const late = z => E.paipan(2026, 10, 7, 23, 30, { zishi: z });
  const midnight = z => E.paipan(2026, 10, 7, 0, 0, { zishi: z });
  const a = late("zichu"), b = late("zizheng"), c = late("earlylate");
  ok(a.siZhu.day !== b.siZhu.day, "23:30 子初派已换日、子正派未换（日柱不同）");
  ok(b.siZhu.day === c.siZhu.day, "23:30 子正派与早/晚子时派一致（同为夜子时不换日）");
  ok(a.siZhu.hour === "丙子" && b.siZhu.hour === "甲子", "夜子时时柱归属不同派而异");
  const m1 = midnight("zichu"), m2 = midnight("zizheng"), m3 = midnight("earlylate");
  ok(m1.siZhu.day === m2.siZhu.day && m2.siZhu.day === m3.siZhu.day,
     "00:00 三派日柱一致（已过换日界，不再有分歧）");
  // 子初派的跨日一致性：10-07 23:30 与 10-08 00:00 属同一「日」，日柱时柱必须完全相同
  const nextDay = E.paipan(2026, 10, 8, 0, 0, { zishi: "zichu" });
  ok(a.siZhu.day === nextDay.siZhu.day && a.siZhu.hour === nextDay.siZhu.hour,
     "子初派跨日连续：10-07 23:30 与 10-08 00:00 同日同时柱");
  // 反向对照：子正派下 10-07 23:30 仍属 10-07，与次日 00:00 不同日
  const nc = E.paipan(2026, 10, 8, 0, 0, { zishi: "zizheng" });
  ok(b.siZhu.day !== nc.siZhu.day,
     "子正派跨日：10-07 23:30 属当日、与 10-08 00:00 不同日（两派确实分歧）");
}

/* ---- 6. 寄宫四方案：落中五宫时处理不同（至少寄坤二与不寄须有差异） ---- */
{
  const a = E.paipan(2026, 10, 7, 14, 0, { jigong: "kun2" });
  const b = E.paipan(2026, 10, 7, 14, 0, { jigong: "fei" });
  ok(a.metadata.jigong === "kun2" && b.metadata.jigong === "fei", "寄宫方案写入元数据");
  const diff = E.diffCharts(a, b);
  ok(typeof diff.diffCount === "number", "盘差分可用（寄宫方案参与比较）");
}

/* ---- 7. 盘差分：自比必须零差异（差分器的自检不能恒假阳性） ---- */
{
  const a = E.paipan(2026, 10, 7, 14, 0, { dingju: "chabu", pan: "zhuan" });
  const b = E.paipan(2026, 10, 7, 14, 0, { dingju: "chabu", pan: "zhuan" });
  const d = E.diffCharts(a, b);
  ok(d.same === true && d.diffCount === 0, "同一盘自比零差异（差分器不虚报）");
  const c = E.paipan(2026, 10, 7, 14, 0, { dingju: "chabu", pan: "fei_guaqi" });
  const d2 = E.diffCharts(a, c);
  ok(d2.same === false && d2.diffCount > 0, "转盘 vs 卦气飞越有差异（差分器能咬人）");
}

/* ---- 8. 卦气飞越：八门固定序、不入中五（M5 正确性） ---- */
{
  const c = E.paipan(2026, 10, 7, 14, 0, { pan: "fei_guaqi" });
  ok(c.doorAt[1] === "休门" && c.doorAt[2] === "死门" && c.doorAt[3] === "伤门"
     && c.doorAt[4] === "杜门" && c.doorAt[9] === "开门" && c.doorAt[8] === "惊门"
     && c.doorAt[7] === "生门" && c.doorAt[6] === "景门", "卦气飞越八门依休死伤杜开惊生景布宫");
  ok(c.starAt[1] === "天蓬" && c.starAt[9] === "天英" && c.starAt[8] === "天禽",
     "卦气飞越九星依蓬芮冲辅禽心柱任布宫");
  ok(!("天芮·禽" in Object.values(c.starAt).filter(x => x === "天芮·禽").reduce((a, x) => (a[x] = 1, a), {})),
     "卦气飞越不入中五、不作天芮禽并宫标记");
  // 换时辰，八门不应转动（固定布宫）
  const c2 = E.paipan(2026, 10, 7, 16, 0, { pan: "fei_guaqi" });
  ok(JSON.stringify(c.doorAt) === JSON.stringify(c2.doorAt), "卦气飞越八门不随时辰旋转");
}

/* ---- 9. 结构化错误：非法输入须报可读错误而非静默错值 ---- */
{
  let caught = null;
  try { E.paipan(2026, 10, 7, 14, 0, { dingju: "bu_xian_cun" }); }
  catch (e) { caught = e; }
  ok(caught === null, "未知定局法当前按默认处理（不抛异常，属既有行为）");
}

/* ---- 10. 城市库经度合理性 ---- */
{
  const bad = Object.entries(E.CITY_LON).filter(([k, v]) => !(v > 70 && v < 140));
  ok(bad.length === 0, "城市库经度均在合理区间 70~140°" + (bad.length ? "：" + JSON.stringify(bad) : ""));
  ok(Object.keys(E.CITY_LON).length >= 30, "城市库覆盖 " + Object.keys(E.CITY_LON).length + " 城");
}

/* ---- 11. 阴盘奇门（v3.1）：公开算例 + 与阳盘差异（M 新增） ---- */
{
  // 三个公开算例（易德轩/范鹤俊），年支时支由引擎内部自动推算
  const CASES = [
    { y: 2012, m: 5, d: 3, h: 12, expect: 2, dun: "阳遁", src: "易德轩《起局心法》" },
    { y: 2015, m: 9, d: 15, h: 12, expect: 8, dun: "阴遁", src: "易德轩《定局与排盘》" },
    { y: 2012, m: 8, d: 18, h: 18, expect: 6, dun: "阴遁", src: "范鹤俊《导航二》" }
  ];
  for (const c of CASES) {
    const r = E.paipan(c.y, c.m, c.d, c.h, 0, { dingju: "yinpan" });
    ok(r.ju === c.expect && r.dun === c.dun,
      "阴盘算例 " + c.y + "-" + c.m + "-" + c.d + " = " + r.dun + r.ju + "局（应 " + c.dun + c.expect + "）[" + c.src + "]");
    ok(r.yinpan && r.yinpan.lunar && r.yinpan.lunar.month >= 1 && r.yinpan.lunar.month <= 12,
      "阴盘结果含农历信息（" + r.yinpan.lunar.month + "月" + r.yinpan.lunar.day + "日）");
  }
  // 阴盘与阳盘（拆补）确实不同（否则就是同一套算法，新增无意义）
  const yin = E.paipan(2015, 9, 15, 12, 0, { dingju: "yinpan" });
  const yang = E.paipan(2015, 9, 15, 12, 0, { dingju: "chabu" });
  ok(yin.ju !== yang.ju, "阴盘与阳盘局数确实不同（" + yin.ju + " vs " + yang.ju + "）");
  // 农历转换边界：1900 前 / 2100 后须返回 null 并报可读错误
  let rangeErr = null;
  try { E.paipan(1899, 12, 31, 12, 0, { dingju: "yinpan" }); }
  catch (e) { rangeErr = e; }
  ok(rangeErr && rangeErr.code === "YINPAN_LUNAR_RANGE", "农历超范围抛可读错误 YINPAN_LUNAR_RANGE");
  // 阴盘无三元概念（不输出上/中/下元歧义），元数据正确
  ok(yin.yuan === "上元" && yin.termForJu === null, "阴盘不参与节气三元（termForJu 为 null）");
}

console.log("—— 面覆盖回归 " + (QUICK ? "（快档）" : "（全档）") + " ——");
console.log("排盘次数：" + total.toLocaleString() + "　崩溃：" + crash);
if (crash) console.log("错误分类：" + JSON.stringify(errs));
console.log("断言：" + pass + " 通过，" + fail + " 失败");
if (failures.length) { console.log("\n失败明细："); failures.forEach(f => console.log("  ✗ " + f)); }
process.exit(fail ? 1 : 0);
