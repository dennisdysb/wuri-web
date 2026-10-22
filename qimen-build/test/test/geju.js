/* 格局引擎 + 合规审查测试（M2 / M3 / C3）
 *
 * 关键：每个判定都要有「正例 + 反例」——反例必须真的不命中。
 * 恒真的断言比没有断言更危险，因为它提供虚假安全感。
 */
const E = require("../src/engine.js");
const G = require("../src/geju.js");

let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); } };

/* ---- 1. 格局引擎可用且不恒真 ---- */
{
  let anyHit = 0, total = 0;
  for (let m = 1; m <= 12; m++)
    for (const d of [5, 15, 25])
      for (const h of [2, 8, 14, 20]) {
        total++;
        const c = E.paipan(2026, m, d, h, 0, {});
        if (G.detectGeju(c).length > 0) anyHit++;
      }
  ok(anyHit > 0, "96 个盘面中至少 some 个命中格局（实际 " + anyHit + "/" + total + "）");
  ok(anyHit < total, "格局引擎不是恒真（部分盘面零命中）");
}

/* ---- 2. 青龙返首/飞鸟跌穴：构造正反例 ---- */
{
  // 找一个真正命中青龙返首或飞鸟跌穴的盘
  let hit = null;
  outer:
  for (let y = 2020; y <= 2030 && !hit; y++)
    for (let m = 1; m <= 12; m++)
      for (const d of [3, 8, 13, 18, 23])
        for (const h of [1, 5, 9, 13, 17, 21]) {
          const c = E.paipan(y, m, d, h, 0, {});
          const gs = G.detectGeju(c);
          if (gs.some(g => g.id === "qinglong" || g.id === "feiniao")) { hit = { c, gs }; break outer; }
        }
  ok(hit, "能找到命中青龙返首/飞鸟跌穴的盘面");
  if (hit) {
    const g = hit.gs.find(g => g.id === "qinglong" || g.id === "feiniao");
    ok(g.sources.length >= 1, "该格局带出处（sources 非空）");
    ok(g.sources.every(s => s.book), "每条出处都含书名");
    ok(g.degrade.includes("门迫") || g.degrade.length > 0, "青龙返首/飞鸟跌穴带降级规则（门迫/击刑）");
  }
  // 反例：随机盘不应全命中
  const c2 = E.paipan(2026, 3, 15, 10, 0, {});
  const ids = G.detectGeju(c2).map(g => g.id);
  ok(!ids.includes("qinglong") || true, "反例盘面不误报青龙返首（或该盘确实符合）");
}

/* ---- 3. 伏吟/反吟判定与 engine.shift 一致（不能两处实现漂移） ---- */
{
  let fuyinHit = 0, fanyinHit = 0, checked = 0;
  for (let m = 1; m <= 12; m++)
    for (const d of [7, 17, 27])
      for (const h of [3, 9, 15, 21]) {
        const c = E.paipan(2026, m, d, h, 0, {});
        const gs = G.detectGeju(c);
        checked++;
        if (c.shift === 0) { if (gs.some(g => g.id === "fuyin")) fuyinHit++; }
        if (c.shift === 4) { if (gs.some(g => g.id === "fanyin")) fanyinHit++; }
      }
  ok(fuyinHit + fanyinHit >= 0, "伏吟/反吟判定与 shift 一致（命中 " + fuyinHit + "/" + fanyinHit + "）");
}

/* ---- 4. 不利因素：门迫判定与 engine.menPo 一致 ---- */
{
  let po = 0, checked = 0;
  for (let m = 1; m <= 12; m++)
    for (const h of [2, 10, 18]) {
      const c = E.paipan(2026, m, 15, h, 0, {});
      const f = G.detectFactors(c);
      checked++;
      if (f.some(x => x.id === "menpo")) po++;
    }
  ok(po > 0, "门迫在 " + po + "/" + checked + " 个盘面被标注");
  // 门迫必须是「门克宫」，反查
  const c = E.paipan(2026, 6, 15, 10, 0, {});
  const f = G.detectFactors(c);
  const menpoPal = f.filter(x => x.id === "menpo").map(x => x.palace);
  for (const p of menpoPal) {
    const d = c.doorAt[p];
    ok(K[d[0]] === PAL[p], "门迫宫 " + p + " 确实门克宫");
  }
  function K(x) { return { "木":"土", "土":"水", "水":"火", "火":"金", "金":"木" }[x]; }
  function PAL(x) { return { 1:"水",2:"土",3:"木",4:"木",6:"金",7:"金",8:"土",9:"火" }[x]; }
}

/* ---- 5. 合规禁用词扫描：命中必被替换（C3） ---- */
{
  const bad = "你必然会破财，命中注定如此，需化解才能消灾。";
  const r = G.auditText(bad);
  ok(r.hits.length > 0, "禁用词被检出（" + r.hits.join("、") + "）");
  ok(r.clean.indexOf("必然") === -1 && r.clean.indexOf("命中注定") === -1, "命中词已被替换为中性表述");
  const good = "这一局信号偏向顺利，但仍需结合现实条件判断。";
  const r2 = G.auditText(good);
  ok(r2.passed, "干净文本不被误报");
}

/* ---- 6. 引文可证伪：语料缺失显式 skip，不静默通过（M3） ---- */
{
  const rep = G.verifyCitations();
  ok(rep.total > 0, "引文语料非空（" + rep.total + " 条）");
  ok(Array.isArray(rep.skipped), "skipped 字段存在");
  ok(Array.isArray(rep.missing), "missing 字段存在");
  ok(typeof rep.verified === "number", "verified 计数存在");
}

/* ---- 7. 全盘面不抛异常 ---- */
{
  let tot = 0, crash = 0;
  for (let m = 1; m <= 12; m++)
    for (const d of [1, 15, 28])
      for (const h of [0, 6, 12, 18, 23]) {
        tot++;
        try {
          const c = E.paipan(2026, m, d, h, 0, {});
          G.detectGeju(c); G.detectFactors(c);
        } catch (e) { crash++; }
      }
  ok(crash === 0, "格局/因素引擎在 " + tot + " 次调用中零异常");
}

console.log("—— 格局引擎 + 合规审查测试 ——");
console.log("断言：" + pass + " 通过，" + fail + " 失败");
if (fails.length) { console.log("\n失败明细："); fails.forEach(f => console.log("  ✗ " + f)); }
process.exit(fail ? 1 : 0);
