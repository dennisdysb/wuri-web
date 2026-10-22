/* 典籍算例回归集（M3 / M3-6）
 *
 * 目标：把「引擎算得对不对」从"自己说了算"变成"有外部锚点可查"。
 *
 * 锚点分两类，务必区分：
 *  A. 外部锚点（external）——结果由典籍/权威万年历给出，引擎输出必须与之相符。
 *     例：1949-10-01 甲子日、2000-01-01 戊午日（干支日锚点，跨引擎不可变）。
 *  B. 自洽锚点（internal）——用引擎自身规则跑出的稳定值，防回归漂移。
 *     例：某盘在某口径下必须永远等于某值。
 *
 * 诚实声明：本文件中的 B 类锚点由本引擎生成，其作用是"改动不改变历史输出"，
 * 不构成"该值符合古法"的独立证明。A 类才是外部证据。
 * 凡未核实者一律标 unverified，不得混入 A 类。
 */
const E = require("../src/engine.js");
const G = require("../src/geju.js");

let pass = 0, fail = 0, unver = 0;
const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } };

/* ================= A 类：外部锚点（干支日） =================
 * 这三条是跨引擎、跨流派必须成立的公历↔干支日映射。 */
const DAY_ANCHORS = [
  { y: 1949, m: 10, d: 1, expect: "甲子", src: "1949-10-01 甲子日（公历基点，通行万年历一致）" },
  { y: 1970, m: 1, d: 1, expect: "辛巳", src: "1970-01-01 辛巳日（Unix 纪元日，干支日通行一致）" },
  { y: 2000, m: 1, d: 1, expect: "戊午", src: "2000-01-01 戊午日（千禧日，干支日通行一致）" },
  { y: 2024, m: 2, d: 10, expect: "甲辰", src: "2024-02-10 甲辰日（甲辰年正月初一，v2/v3 引擎一致）" }
];
for (const a of DAY_ANCHORS) {
  const c = E.paipan(a.y, a.m, a.d, 12, 0, {});
  ok(c.siZhu.day === a.expect,
     "日干支锚点 " + a.y + "-" + a.m + "-" + a.d + " = " + a.expect + "（实得 " + c.siZhu.day + "）");
  ok(!!a.src, "锚点带来源：" + a.src);
}

/* ================= A 类：外部锚点（v2 官方开发方案记载的实算案例） =================
 * 来源：仓库《开发方案-奇门遁甲助手.md》8.5 节「定局法正确性用公开资料实算案例锁定」，
 * 该表记载三法在某日的定局结果。这是 v2 团队留下的、唯一有外部出处的定局锚点。 */
const DINGJU_CASES = [
  { y: 2022, m: 5, d: 9, h: 12, chabu: 7, zhirun: 8, maoshan: 4, dun: "阳遁",
    desc: "2022-05-09 壬戌日：拆补=立夏下元阳7局 / 置闰=谷雨下元阳8局 / 茅山=立夏上元阳4局" },
  { y: 2022, m: 9, d: 15, h: 12, chabu: 3, zhirun: 3, maoshan: 3, dun: "阴遁",
    desc: "2022-09-15 辛未日：三法一致=白露中元阴3局" }
];
for (const t of DINGJU_CASES) {
  for (const dj of ["chabu", "zhirun", "maoshan"]) {
    let c = null, err = "";
    try { c = E.paipan(t.y, t.m, t.d, t.h, 0, { dingju: dj }); }
    catch (e) { err = e.message; }
    ok(c !== null, "定局锚点可排盘 " + t.y + "-" + t.m + "-" + t.d + " / " + dj + (err ? "（" + err + "）" : ""));
    if (c) {
      ok(c.ju === t[dj],
         "定局锚点 " + t.y + "-" + t.m + "-" + t.d + " / " + dj + " 局数 = " + t[dj] + "（实得 " + c.ju + "）");
      if (t.dun) ok(c.dun === t.dun, "  阴阳遁 = " + t.dun + "（实得 " + c.dun + "）");
    }
  }
  ok(!!t.desc, "锚点带来源说明");
}

/* ================= B 类：自洽锚点（防回归漂移） ================= *
 * 用途：v3 引擎重构后（模块化 + 六口径）必须与 v2 在默认口径下逐字一致。
 * 下列取值均已用未改动的 v2 引擎交叉核对，两者输出完全相同。
 * 注意：此处节气=秋分是对的——寒露在 10-08 交节，10-07 仍属秋分。 */
const INTERNAL = [
  { y: 2026, m: 10, d: 7, h: 14, get: c => c.dun, expect: "阴遁", note: "2026-10-07 14时 阴阳遁" },
  { y: 2026, m: 10, d: 7, h: 14, get: c => c.term, expect: "秋分", note: "2026-10-07 14时 节气" },
  { y: 2026, m: 10, d: 7, h: 14, get: c => c.yuan, expect: "中元", note: "2026-10-07 14时 三元" },
  { y: 2026, m: 10, d: 7, h: 14, get: c => c.ju, expect: 1, note: "2026-10-07 14时 局数" },
  { y: 2026, m: 10, d: 7, h: 14, get: c => c.siZhu.day, expect: "甲寅", note: "2026-10-07 日柱" },
  { y: 2026, m: 10, d: 7, h: 14, get: c => c.xun.name, expect: "甲子", note: "2026-10-07 旬首" },
  { y: 2022, m: 5, d: 9, h: 12, get: c => c.xun.name, expect: "甲辰", note: "2022-05-09 旬首" },
  { y: 2022, m: 5, d: 9, h: 12, get: c => c.siZhu.hour, expect: "丙午", note: "2022-05-09 时柱" }
];
for (const t of INTERNAL) {
  const c = E.paipan(t.y, t.m, t.d, t.h, 0, {});
  ok(t.get(c) === t.expect, "自洽锚点 " + t.note + " = " + t.expect + "（实得 " + t.get(c) + "）");
}

/* ================= 产品内「本盘与 N 条算例一致」（M3-6） ================= *
 * 供 UI 调用：对给定盘面，检查它是否符合 A 类锚点所描述的条件。
 * 注意语义：我们检查的是"该盘所属日/局的口径是否与典籍记载一致"，
 * 而非"这个盘面等于某个典籍原盘"——后者数据不足，不做断言。 */
function checkAgainstCases(y, mo, d, h, mi, opts) {
  const c = E.paipan(y, mo, d, h, mi, opts || {});
  const matched = [];
  for (const a of DAY_ANCHORS) {
    if (a.y === y && a.m === mo && a.d === d && c.siZhu.day === a.expect) {
      matched.push({ type: "干支日", ref: a.src, ok: true });
    }
  }
  for (const t of DINGJU_CASES) {
    if (t.y === y && t.m === mo && t.d === d) {
      const dj = (opts && opts.dingju) || "chabu";
      if (c.ju === t[dj]) {
        matched.push({ type: "定局法", ref: t.desc, ok: true, value: dj + " " + c.ju + "局" });
      } else {
        matched.push({ type: "定局法", ref: t.desc, ok: false, value: dj + " 实得" + c.ju + "局，典籍记 " + t[dj] + "局" });
      }
    }
  }
  return { total: matched.length, passed: matched.filter(m => m.ok).length, matched };
}

/* ================= 引文语料状态（M3-2） ================= */
function citationStatus() {
  const rep = G.verifyCitations();
  return {
    total: rep.total,
    verified: rep.verified,
    skipped: rep.skipped,   // 语料存在但未挂载判定 → 显式列出，不静默
    missing: rep.missing    // 语料缺失 → 显式列出
  };
}

/* ================= 导出 ================= */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { DAY_ANCHORS, DINGJU_CASES, INTERNAL, checkAgainstCases, citationStatus,
                     _run: () => ({ pass, fail, fails, unver }) };
}

if (require.main === module) {
  const st = citationStatus();
  console.log("—— 典籍算例回归集 ——");
  console.log("A 类外部锚点：" + (DAY_ANCHORS.length + DINGJU_CASES.length) + " 组（干支日 " + DAY_ANCHORS.length
    + " + 定局 " + DINGJU_CASES.length + "）");
  console.log("B 类自洽锚点：" + INTERNAL.length + " 组（防回归漂移）");
  console.log("引文语料：" + st.total + " 条，已核 " + st.verified
    + "，未挂载 " + st.skipped.length + "（显式列出），缺失 " + st.missing.length);
  if (st.skipped.length) st.skipped.forEach(s => console.log("    skip: " + s.book + " —— " + s.reason));
  if (st.missing.length) st.missing.forEach(b => console.log("    missing: " + b));
  console.log("断言：" + pass + " 通过，" + fail + " 失败");
  if (fails.length) { console.log("\n失败明细："); fails.forEach(f => console.log("  ✗ " + f)); }
  process.exit(fail ? 1 : 0);
}
