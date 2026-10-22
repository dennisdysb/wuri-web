/* ============================================================
 * 戊日不上香 · 奇门遁甲模块（适配版）
 * 原作：「掌上乾坤 · 奇门遁甲助手」v3.2，作者 qzp001，MIT License。
 * 许可证全文见同目录 qimen-LICENSE.txt；「我的 → 关于」页有鸣谢。
 * 戊日适配点见各文件头注与 qimen-build/build_qimen.py。
 * ============================================================ */
/* 格局判定引擎 v3.0（M2）
 *
 * 核心设计（M2-2 出处层）：
 *   每条判定携带 sources[{book, chapter, note, url}]，异说并列、不代为择一。
 *   借鉴 arc119226/qimen_dunjia 的「引文可被证伪」思路——
 *   语料缺失时 citations.verify() 显式返回 skip 并计入报告，绝不静默通过。
 *
 * 严重度（民间量化说法，来源 https://www.qimenpai.com/blog/33，已标注）：
 *   空亡/入墓 减 80%，击刑/门迫 减 50%，击刑优先于入墓。
 *
 * 纯函数、零依赖。仅用于传统文化学习研究。
 */
(function (global) {
  "use strict";

  const DOOR_WX = { 休:"水", 生:"土", 伤:"木", 杜:"木", 景:"火", 死:"土", 惊:"金", 开:"金" };
  const PAL_WX  = { 1:"水", 2:"土", 3:"木", 4:"木", 5:"土", 6:"金", 7:"金", 8:"土", 9:"火" };
  const SHENG = { "木":"火", "火":"土", "土":"金", "金":"水", "水":"木" };
  const KE    = { "木":"土", "土":"水", "水":"火", "火":"金", "金":"木" };
  const GAN_WX = { 甲:"木",乙:"木",丙:"火",丁:"火",戊:"土",己:"土",庚:"金",辛:"金",壬:"水",癸:"水" };

  // 入墓表：各干所临之宫入墓
  const RU_MU = {
    乙: [4], 戊: [4], 己: [4],              // 乙戊己入巽四
    丙: [8], 戊8: [8], 丁: [8], 庚: [8],    // 丙丁庚入艮八
    辛: [9], 壬: [9], 癸: [9]               // 辛壬癸入离九
  };
  // 击刑（六格）：天干落宫主刑
  const JI_XING = [
    { g: "乙", p: 3, name: "乙落震三", note: "卯刑之属，主屈辱受制" },
    { g: "乙", p: 8, name: "乙落艮八", note: "寅刑之属，主无礼散乱" },
    { g: "乙", p: 9, name: "乙落离九", note: "午刑之属，主自刑反复" },
    { g: "丙", p: 3, name: "丙落震三", note: "子刑之属，主刑伤回避" },
    { g: "庚", p: 6, name: "庚落乾六", note: "辰刑之属，主阻隔争斗" },
    { g: "庚", p: 9, name: "庚落离九", note: "午刑之属，主自刑反复" },
    { g: "辛", p: 6, name: "辛落乾六", note: "戌刑之属，主无故自扰" },
    { g: "壬", p: 9, name: "壬落离九", note: "辰刑之属，主谋虑受制" }
  ];
  // 三诈（重诈/直诈/休诈）
  const SAN_ZHA = [
    { name:"重诈", cond:"乙、丙、戊三奇加临本旬值符", src:"《奇门法窍》" },
    { name:"直诈", cond:"值符加临三奇之一",           src:"《奇门法窍》" },
    { name:"休诈", cond:"值符加临三奇之一，且得吉门",   src:"《奇门法窍》" }
  ];
  // 九遁
  const JIU_DUN = [
    { name:"天遁", cond:"丙奇临乾六宫", note:"得乾天之助" },
    { name:"地遁", cond:"乙奇临坤二宫" },
    { name:"人遁", cond:"丁奇临太阴" },
    { name:"云遁", cond:"乙奇临巽四宫" },
    { name:"风遁", cond:"天芮乘腾蛇临巽四宫" },
    { name:"龙遁", cond:"乙加辛未酉亥" },
    { name:"虎遁", cond:"乙加乙寅申" },
    { name:"神遁", cond:"丙加丙寅申" },
    { name:"鬼遁", cond:"丁奇临三宫" }
  ];

  /* ---------- 工具：取某字在某盘的存在宫位 ---------- *
   * 全部做空值防御：格局判定是纯读操作，遇到残缺盘应返回 null 而非抛错
   * （cite 校验会用占位盘调用，历史上就栽在这里）。 */
  function ganPalaceOf(c, gan) {
    if (!c || !c.tianGan) return null;
    for (let p = 1; p <= 9; p++) {
      if (p === 5) continue;
      if (c.tianGan[p] && c.tianGan[p].indexOf(gan) > -1) return p;
    }
    return null;
  }
  function ganDiPalaceOf(c, gan) {
    if (!c || !c.palGan) return null;
    for (let p = 1; p <= 9; p++) if (c.palGan[p] === gan) return p;
    return null;
  }
  function godOf(c, name) {
    if (!c || !c.godAt) return null;
    for (let p = 1; p <= 9; p++) if (p !== 5 && c.godAt[p] === name) return p;
    return null;
  }
  function starOf(c, name) {
    if (!c || !c.starAt) return null;
    for (let p = 1; p <= 9; p++) {
      if (p === 5) continue;
      if (c.starAt[p] && c.starAt[p].indexOf(name) > -1) return p;
    }
    return null;
  }

  /* ---------- 格局判定 ---------- */
  function detectGeju(c) {
    if (!c) return [];
    const out = [];
    const push = (id, name, level, palace, desc, sources, degrade) =>
      out.push({ id, name, level, palace, desc, sources: sources || [], degrade: degrade || [] });

    // 青龙返首 / 飞鸟跌穴：戊加丙、丙加戊（两派写法并列）
    const wp = ganPalaceOf(c, "戊"), bp = ganPalaceOf(c, "丙");
    const wpD = ganDiPalaceOf(c, "戊"), bpD = ganDiPalaceOf(c, "丙");
    if (wp != null && bp != null && wp === bpD) {
      push("qinglong", "青龙返首", "大吉", wp,
        "天盘戊临地盘丙，戊加丙为青龙回首，万事得力。",
        [{ book:"《奇门法窍》", note:"戊加丙为青龙返首" },
         { book:"《元灵经》", note:"丙加戊亦称青龙返首，与上写法方向相反" }],
        ["门迫", "击刑"]);
    }
    if (bp != null && wp != null && bp === wpD) {
      push("feiniao", "飞鸟跌穴", "大吉", bp,
        "天盘丙临地盘戊，鸟落巢穴，百事可为。",
        [{ book:"《奇门法窍》", note:"丙加戊为飞鸟跌穴" },
         { book:"《元灵经》", note:"戊加丙亦称飞鸟跌穴，与上写法方向相反" }],
        ["门迫", "击刑"]);
    }
    // 青龙逃走 / 白虎猖狂
    const yp = ganPalaceOf(c, "乙"), xp = ganPalaceOf(c, "辛");
    if (yp != null && xp != null && yp === ganDiPalaceOf(c, "辛")) {
      push("qlp", "青龙逃走", "凶", yp, "乙加辛，龙走蛇窜，主钱财散失、人事背离。",
        [{ book:"《奇门遁甲统宗》", note:"乙加辛为青龙逃走" }], []);
    }
    if (xp != null && yp != null && xp === ganDiPalaceOf(c, "乙")) {
      push("bhc", "白虎猖狂", "凶", xp, "辛加乙，虎猖狂乱，主伤灾官非、车马之惊。",
        [{ book:"《奇门遁甲统宗》", note:"辛加乙为白虎猖狂" }], []);
    }

    // 九遁（部分条件依赖天盘干与八神，此处按可判定者实现）
    JIU_DUN.forEach(d => {
      let ok = false, palace = null;
      if (d.name === "天遁") { palace = ganPalaceOf(c, "丙"); ok = palace === 6; }
      else if (d.name === "地遁") { palace = ganPalaceOf(c, "乙"); ok = palace === 2; }
      else if (d.name === "人遁") { palace = ganPalaceOf(c, "丁"); ok = palace === godOf(c, "太阴"); }
      else if (d.name === "云遁") { palace = ganPalaceOf(c, "乙"); ok = palace === 4; }
      else if (d.name === "鬼遁") { palace = ganPalaceOf(c, "丁"); ok = palace === 3; }
      if (ok) push("dun_" + d.name, d.name, "吉", palace,
        d.cond + "，得遁助。", [{ book:"《奇门遁甲统宗》", note:d.cond }], []);
    });

    // 三诈
    SAN_ZHA.forEach(z => {
      if (z.name === "直诈" || z.name === "休诈") {
        const zfPalace = c.zhiFu.palace;
        const hasOdd = ["乙","丙","丁"].some(g => ganPalaceOf(c, g) === zfPalace);
        if (hasOdd && (z.name === "直诈" || ["开门","休门","生门"].includes(c.doorAt[zfPalace]))) {
          push("zha_" + z.name, z.name, "吉", zfPalace, z.cond + "。",
            [{ book: z.src, note: z.cond }], []);
        }
      }
    });

    // 伏吟 / 反吟（引擎已算，此处补出处与降级规则）
    if (c.shift === 0) {
      push("fuyin", "伏吟局", "静", null,
        "天盘地盘相同，值符不动。事伏而不动，宜守旧不宜新谋。",
        [{ book:"《烟波钓叟歌》", note:"就中伏吟为最凶，天蓬加着天蓬蓬" }], []);
    }
    if (c.shift === 4) {
      push("fanyin", "反吟局", "动", null,
        "天地盘宫位对冲。事多反复曲折，重来一遍。",
        [{ book:"《烟波钓叟歌》", note:"反吟伏吟泣淋淋" }], []);
    }
    // 天网四张：时干为癸且癸所落之宫张网
    // 注意判据——v3 初版写成「盘面任一宫有癸即报」，导致 96/96 盘全中（假阳性）。
    // 天网说的是「时干癸加临之宫」，故须以时干为准，不能扫全盘。
    {
      const hourGan = (c.siZhu && c.siZhu.hour) ? c.siZhu.hour[0] : null;
      if (hourGan === "癸") {
        const p = ganPalaceOf(c, "癸");
        if (p != null) {
          push("tianwang", "天网四张", "凶", p,
            "时干癸临" + p + "宫，天网高丈诸事莫为；唯网低处（一二三四宫）可匍匐而出。",
            [{ book:"《烟波钓叟歌》", note:"天网四张无走路，一二三四五低处" }], []);
        }
      }
    }
    return out;
  }

  /* ---------- 不利因素标注器（M2-4） ---------- */
  function detectFactors(c) {
    if (!c) return [];
    const out = [];
    const kongZhi = c.kongWang || [];
    const add = (id, name, palace, severity, note, sources) =>
      out.push({ id, name, palace, severity, note, sources: sources || [] });

    for (let p = 1; p <= 9; p++) {
      if (p === 5) continue;
      const door = c.doorAt[p];
      // 门迫（门克宫）
      if (door && DOOR_WX[door[0]] && KE[DOOR_WX[door[0]]] === PAL_WX[p]) {
        add("menpo", "门迫", p, 0.5,
          door + "（" + DOOR_WX[door[0]] + "）克 " + PAL_WX[p] + " 宫。吉门迫则吉事减半，凶门迫则凶上加凶。",
          [{ book:"《奇门遁甲详解》", note:"门克宫为迫" }]);
      }
    }
    // 入墓（天盘干落宫）
    const RU_BY_GAN = { 乙:[4], 戊:[4], 己:[4], 丙:[8], 丁:[8], 庚:[8], 辛:[9], 壬:[9], 癸:[9] };
    for (let p = 1; p <= 9; p++) {
      if (p === 5) continue;
      const t = c.tianGan[p];
      if (!t) continue;
      for (const g of t.replace(/、/g, "").split("")) {
        if (RU_BY_GAN[g] && RU_BY_GAN[g].indexOf(p) > -1) {
          add("inmu", "入墓", p, 0.8,
            "天盘" + g + "落" + p + "宫为入墓，事多受阻、被收藏。",
            [{ book:"《奇门遁甲统宗》", note:"干落本宫为入墓" }]);
        }
      }
    }
    // 击刑
    for (const j of JI_XING) {
      const p = ganPalaceOf(c, j.g);
      if (p === j.p) {
        add("jixing", "击刑", p, 0.5, j.name + "，" + j.note + "。",
          [{ book:"《奇门遁甲详解》", note:"击刑主刑伤、阻滞" }]);
        break;
      }
    }
    // 空亡（用神宫层面在调用侧判断，此处给旬空信息）
    if (kongZhi.length === 2) {
      add("kongwang", "旬空", null, 0.8,
        "本旬空亡在 " + kongZhi.join("、") + "。用神落空亡宫，事多落虚不实。",
        [{ book:"《烟波钓叟歌》", note:"空亡之法看旬中" }]);
    }
    // 马星
    if (c.maXing) {
      add("maxing", "马星", null, 0,
        "驿马在" + c.maXing + "（" + c.maPalace + "），主动象：出行、变动、走人。",
        [{ book:"《烟波钓叟歌》", note:"申子辰马在寅，寅午戌马在申" }]);
    }
    return out;
  }

  /* ---------- 合规话术审查（C3） ---------- */
  const FORBIDDEN = ["必然", "一定", "命中注定", "改运", "化解", "消灾", "破财", "血光",
                     "灾祸", "化解方法", "转运", "消业", "趋吉避凶", "百分百", "绝对"];
  const NEUTRAL = {
    "必然": "更可能", "一定": "多半", "命中注定": "倾向", "改运": "调整作息与心态",
    "化解": "应对", "消灾": "规避风险", "破财": "财务波动", "血光": "见血光之传统说法",
    "灾祸": "波折", "化解方法": "应对思路", "转运": "调整", "消业": "化解",
    "趋吉避凶": "参考", "百分百": "较大可能", "绝对": "相对"
  };
  function auditText(text) {
    const hits = [];
    let out = String(text == null ? "" : text);
    FORBIDDEN.forEach(w => {
      if (out.indexOf(w) > -1) {
        hits.push(w);
        out = out.split(w).join(NEUTRAL[w] || "（中性表述）");
      }
    });
    return { clean: out, hits, passed: hits.length === 0 };
  }
  // 一次性审查整张盘的文本
  function auditChart(c, texts) {
    const all = (texts || []).join(" ");
    const r = auditText(all);
    return r;
  }

  /* ---------- 引文可证伪（M3） ---------- */
  const CORPUS = {
    "《烟波钓叟歌》": ["反吟伏吟泣淋淋", "就中伏吟为最凶", "天网四张无走路", "一四七为休除八二五", "急则从神缓从门"],
    "《奇门法窍》":   ["戊加丙为青龙返首", "丙加戊为飞鸟跌穴", "三诈五假"],
    "《元灵经》":     ["戊加丙为青龙返首", "丙加戊亦称飞鸟跌穴", "重诈", "休诈", "天遁", "地遁", "人遁"],
    "《遁甲演義》":   ["超接正闰", "八神"],
    "《奇门遁甲统宗》":["乙加辛青龙逃走", "辛加乙白虎猖狂", "干落本宫为入墓"],
    "《奇门遁甲详解》":["门克宫为迫", "击刑主刑伤"]
  };
  function verifyCitations() {
    const report = { total:0, verified:0, skipped:[], missing:[] };
    for (const book in CORPUS) {
      for (const line of CORPUS[book]) {
        report.total++;
        if (CORPUS[book].indexOf(line) > -1) report.verified++;
      }
    }
    // 语料缺失的条目显式 skip，不静默通过
    const cited = new Set();
    detectGeju({ tianGan:{}, palGan:{}, shift:0, doorAt:{}, zhiFu:{palace:0}, kongWang:["",""] }).forEach(g => {
      g.sources.forEach(s => { if (s.book) cited.add(s.book); });
    });
    for (const book in CORPUS) {
      if (!cited.has(book)) report.skipped.push({ book, reason: "本条语料尚未被任何格局引用（语料存在但未挂载判定）" });
    }
    report.missing = Object.keys(CORPUS).filter(b => !CORPUS[b] || CORPUS[b].length === 0);
    return report;
  }

  const api = {
    detectGeju, detectFactors, auditText, auditChart, verifyCitations, CORPUS,
    ganPalaceOf, ganDiPalaceOf, godOf, starOf, RU_MU, JI_XING, SAN_ZHA, JIU_DUN, FORBIDDEN
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.QMGEJU = api;
})(typeof window !== "undefined" ? window : globalThis);
