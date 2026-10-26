/* 风水引擎金标准测试（第二批）——对 www/js/vendor/soul-fengshui.js 实跑断言。
 * 三例金标准来自开源扫描实跑验盘（wuri-app/opensource-scan/fengshui-scan.md）；
 * 例一整盘另于 2026-10-26 与 YuanZHAO321/FengShuiCalculators（Apache-2.0，
 * docs/js/flyingstars.js compute(8,'S2')）交叉对读：九宫 ×（运/山/向）三数逐宫全等、
 * 局同判「双星到向」，对读留痕见 fs2-shots/crosscheck-yuanzhao.txt。
 * 用法：node test-fengshui-golden.cjs   （全对才许发版） */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'www/js/vendor/soul-fengshui.js'), 'utf8');
const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const F = ctx.window.WuriSoulFs;
if (!F) { console.error('FAIL: WuriSoulFs 未暴露'); process.exit(1); }

let fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log('  ok', name);
  else { fail++; console.log('FAIL', name, '\n  got ', g, '\n  want', w); }
}

/* 例一：八运子山午向整盘（坐年取八运内 2010；坐山子）
 * 期望格 [运星, 山星, 向星]，与经典盘及 YuanZHAO 实现逐宫一致。 */
console.log('例一 八运子山午向');
const c = F.buildChart(2010, '子');
eq('label 子山午向', c.label, '子山午向');
eq('period 8', c.period, 8);
eq('formation 双星到向', c.formation, '双星到向');
const grid = {};
c.palaces.forEach(p => { grid[p.key] = [p.period, p.mountain, p.water]; });
eq('整盘逐宫', grid, {
  xun: [7, 3, 4], li: [3, 8, 8], kun: [5, 1, 6],
  zhen: [6, 2, 5], center: [8, 4, 3], dui: [1, 6, 1],
  gen: [2, 7, 9], kan: [4, 9, 7], qian: [9, 5, 2],
});
eq('向首宫（离）双 8 到向', [grid.li[1], grid.li[2]], [8, 8]);
eq('格局含七星真打劫', c.combinations.map(x => x.name).includes('七星真打劫'), true);

/* 例二：1992 男 → 艮命西四 */
console.log('例二 1992 男命卦');
const bz = F.buildBaZhai(1992, 'male');
eq('命卦艮', bz.gua.name, '艮');
eq('西四命', bz.gua.group, 'west');

/* 例三：坎命大游年（1990 男为坎命）——巽生气、震天医 */
console.log('例三 坎命游年');
const kan = F.lifeGua(1990, 'male');
eq('1990 男为坎命', kan.name, '坎');
const byKey = {};
F.palacesFor(kan).forEach(p => { byKey[p.key] = p.star.name; });
eq('巽宫生氣', byKey.xun, '生氣');
eq('震宫天醫', byKey.zhen, '天醫');

/* 附：流年入中公式抽查（2024→3、2026→1，与扫描核对一致） */
eq('2024 流年入中 3', F.annualFlyingStarCenter(2024), 3);
eq('2026 流年入中 1', F.annualFlyingStarCenter(2026), 1);

/* 附：宅卦——坐子为坎宅（东四）；宅命相配判定 */
eq('坐子宅卦坎', F.houseGua('子').name, '坎');
eq('艮命×坎宅 不相配（西×东）', F.zhaiMingMatch(bz.gua, F.houseGua('子')).match, false);
eq('坎命×坎宅 相配', F.zhaiMingMatch(kan, F.houseGua('子')).match, true);

console.log(fail ? `\n${fail} 项 FAIL` : '\nALL GOLDEN PASS');
process.exit(fail ? 1 : 0);
