/* ============================================================
 * 戊日不上香 · 奇门遁甲模块（适配版）
 * 原作：「掌上乾坤 · 奇门遁甲助手」v3.2，作者 qzp001，MIT License。
 * 许可证全文见同目录 qimen-LICENSE.txt；「我的 → 关于」页有鸣谢。
 * 戊日适配点见各文件头注与 qimen-build/build_qimen.py。
 * ============================================================ */
/* UI 逻辑 v3.2：问事 / 盘面（六口径 + 格局 + 出处）/ 盘差分 / 学习中心 / 合规
 *
 * v3.2 相对 v3.1 的运行层改动（业务逻辑与文案零改动）：
 *   1. 九宫格改为「建一次、只改差异」，不再每次 innerHTML 重建
 *   2. 事件委托替代逐格绑定
 *   3. 全局错误边界：UI 异常不再白屏，降级为简洁模式
 *   4. 启动自检：三个干支锚点不符则公开告警
 *   5. 键盘可达：宫格可 Tab / 回车，弹窗焦点锁
 *   6. 起盘序号锁：异步化后不会出现旧结果覆盖新结果
 */
(function () {
  const Q = window.QM, G = window.QMGEJU, D = window.QMDATA, CASES = window.QMCASES;
  /* 戊日适配：全部选择器作用域限定在 #qm-root 内，不触碰戊日其他视图 */
  const ROOT = document.getElementById("qm-root");
  const $ = s => ROOT.querySelector(s), $$ = s => Array.from(ROOT.querySelectorAll(s));
  /* 戊日适配：真太阳时取全站全局设置（我的 → 设置：时间基准 + 经度），与八字/值神共用：
   * 仅经度差修正（每度 4 分钟，不计均时差），基准经线与 app.js solarNow() 同口径 */
  function wuriSolarCfg() {
    try {
      const c = (window.__wuriGetCfg && window.__wuriGetCfg()) || {};
      if ((c.timebase || "true") !== "true") return null;
      const lon = parseFloat(c.lon);
      if (!Number.isFinite(lon)) return null;
      const meridian = c.tz === "beijing" ? 120 : -new Date().getTimezoneOffset() / 4;
      return { lon: lon, meridian: meridian };
    } catch (e) { return null; }
  }
  const FX = window.QMFX || { add: fn => fn(0), stop() {}, trapFocus() {}, cap: {}, lite: false, no3d: false };
  let CHART = null, SCEN = null, GEOJU = [], FACTORS = [], LAST_ERROR = null;

  // 六项口径（M1-5）
  const CFG = { dingju: "chabu", pan: "zhuan", zishi: "zichu", jigong: "kun2",
                calendar: "diti", city: "", lon: "" };
  const DJ_NAME = { chabu: "拆补法", zhirun: "置闰法", maoshan: "茅山法", yinpan: "阴盘奇门" };
  const PAN_NAME = { zhuan: "转盘", fei_tiaojian: "飞盘·九宫跳涧", fei_guaqi: "飞盘·卦气飞越" };

  /* ---------- 通用 ---------- */
  const pad = x => String(x).padStart(2, "0");
  function toast(msg) {
    const t = $("#qm-toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("on"), 2600);
  }
  function showModal(html) {
    $("#qm-modal .sheet").innerHTML = '<button class="x" title="关闭" aria-label="关闭">×</button>' + html;
    $("#qm-modal").classList.add("on");
    FX.trapFocus(true);
  }
  function closeModal() {
    const m = $("#qm-modal");
    if (!m.classList.contains("on")) return;
    m.classList.remove("on");
    FX.trapFocus(false);
  }
  $("#qm-modal").addEventListener("click", e => {
    if (e.target.id === "qm-modal" || e.target.classList.contains("x")) closeModal();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  function showTab(t) {
    $$(".tabbtn").forEach(x => {
      const on = x.dataset.t === t;
      x.classList.toggle("on", on);
      x.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".tabpage").forEach(p => p.classList.toggle("on", p.id === "qm-tab-" + t));
    if (t === "vs") renderCompare();
    if (t === "pan") requestAnimationFrame(() => paintGrid());
    const vw3 = document.getElementById("view-qimen"); if (vw3) vw3.scrollTop = 0;
  }
  $$(".tabbtn").forEach(b => {
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => showTab(b.dataset.t));
    b.addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const list = $$(".tabbtn");
      const i = list.indexOf(b);
      const n = e.key === "ArrowRight" ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[n].focus();
      showTab(list[n].dataset.t);
    });
  });

  // C3：所有进入界面的文本过一遍禁用词扫描
  function guard(html) {
    if (!G || !G.auditText) return html;
    const r = G.auditText(html);
    if (r.hits.length) console.warn("[合规扫描] 命中并已中性化：", r.hits);
    return r.clean;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, m =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  /* ---------- 错误边界（v3.2 新增） ---------- */
  let degraded = false;
  function degradeToPlain(code, msg) {
    if (degraded) return;
    const vw = document.getElementById("view-qimen");
    if (vw && vw.hidden) return;   /* 戊日适配：其他视图报错不触发本模块降级 */
    degraded = true;
    ROOT.classList.add("lite");
    ROOT.setAttribute("data-motion", "off");
    let el = ROOT.querySelector("#qm-errBox");
    if (!el) return;
    el.innerHTML = '<div class="errbox"><b>界面渲染出现异常，已切换简洁模式</b>' +
      '<p>错误码：' + escapeHtml(code) + '</p>' +
      '<p class="dim">页面其余功能仍可使用。若反复出现，请刷新页面重试（本地计算，无任何数据外发）。</p></div>';
  }
  window.addEventListener("error", e => {
    if (!e || e.target !== window) return;   // 资源加载错误不当作运行时异常
    degradeToPlain("UI_RUNTIME", e.message);
  });
  window.addEventListener("unhandledrejection", e => {
    degradeToPlain("UI_PROMISE", String((e && e.reason) || ""));
  });

  /* ---------- 启动自检（v3.2 新增） ---------- */
  function selfCheck() {
    const anchors = [[1949, 10, 1, "甲子"], [1970, 1, 1, "辛巳"], [2000, 1, 1, "戊午"]];
    let bad = 0, detail = "";
    for (const [y, m, d, gz] of anchors) {
      try {
        const c = Q.paipan(y, m, d, 12, 0, {});
        if (String(c.siZhu.day).indexOf(gz) === -1) { bad++; detail = `${y}-${pad(m)}-${pad(d)} 期望 ${gz}`; }
      } catch (e) { bad++; detail = `${y}-${pad(m)}-${pad(d)} 抛错`; }
    }
    if (bad) {
      const main = ROOT;
      const el = document.createElement("div");
      el.className = "warnbox";
      el.id = "qm-healthBox";
      el.innerHTML = '<p>⚠ <b>引擎自检未通过（' + bad + '/3 失败）</b>：' + escapeHtml(detail) +
        '。本页排盘结果可能不可信，建议刷新页面。</p>';
      main.insertBefore(el, main.firstChild);
    }
  }

  /* ---------- 时间控制 ---------- */
  function nowStr() {
    const n = new Date();
    return n.getFullYear() + "-" + pad(n.getMonth() + 1) + "-" + pad(n.getDate()) + "T" + pad(n.getHours()) + ":" + pad(n.getMinutes());
  }
  function parseDT(v) {
    const m = (v || "").match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return m ? { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] } : null;
  }
  function shiftHour(min) {
    const o = parseDT($("#qm-dt").value); if (!o) return;
    const t = new Date(o.y, o.mo - 1, o.d, o.h + min, o.mi);
    $("#qm-dt").value = t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate()) + "T" + pad(t.getHours()) + ":" + pad(t.getMinutes());
    cast();
  }
  function currentOpts() {
    const o = { dingju: CFG.dingju, pan: CFG.pan, zishi: CFG.zishi, jigong: CFG.jigong, calendar: CFG.calendar };
    const g = wuriSolarCfg();
    if (g) { o.lon = g.lon; o.baseLon = g.meridian; }
    return o;
  }
  function renderSolarInfo() {
    const box = $("#qm-solarInfo");
    if (!box) return;
    let txt = "";
    try {
      const c = (window.__wuriGetCfg && window.__wuriGetCfg()) || {};
      const lon = parseFloat(c.lon);
      if ((c.timebase || "true") !== "true") txt = "真太阳时：关（全站时间基准为当地平太阳时，在「我的 → 设置」可切换）";
      else if (!Number.isFinite(lon)) txt = "真太阳时：未填经度，暂按钟表时间（在「我的 → 设置」填写经度后生效）";
      else txt = "真太阳时：开 · 经度 " + lon + "°（按全站时间基准换算，不计均时差；在「我的 → 设置」可改）";
    } catch (e) {}
    box.textContent = txt;
  }

  // 起盘序号锁：即使将来引入异步，也不会出现旧结果覆盖新结果
  let castSeq = 0;
  function cast() {
    const my = ++castSeq;
    const o = parseDT($("#qm-dt").value);
    if (!o) { toast("请选择有效的时间"); return; }
    LAST_ERROR = null;
    $("#qm-errBox").innerHTML = "";
    let chart;
    try {
      chart = Q.paipan(o.y, o.mo, o.d, o.h, o.mi, currentOpts());
    } catch (e) {
      // M0-2：结构化错误可读展示，不白屏
      LAST_ERROR = e;
      CHART = null;
      const code = e.code || e.name;
      const d = e.detail || {};
      $("#qm-errBox").innerHTML =
        `<div class="errbox"><b>排盘未完成</b><p>${escapeHtml(e.message || String(e))}</p>
         <p class="dim">错误码：${escapeHtml(code)}${d.term ? "　节气：" + escapeHtml(d.term) : ""}${d.dun ? "　遁：" + escapeHtml(d.dun) : ""}${d.yuan ? "　元：" + escapeHtml(d.yuan) : ""}</p>
         <p class="dim">这类情况多由口径组合在该时刻无对应定局造成。请到「口径面板」换一个定局法，或换个时刻再试。</p></div>`;
      GEOJU = []; FACTORS = [];
      renderBrief();
      renderKjNow();
      paintGrid(true);
      return;
    }
    if (my !== castSeq) return;
    CHART = chart;
    try {
      GEOJU = G.detectGeju(CHART);
      FACTORS = G.detectFactors(CHART);
    } catch (e) {
      GEOJU = []; FACTORS = [];
      degradeToPlain("GEJU_LAYER", e && e.message);
    }
    renderPan(); renderBrief(); renderWen(); renderKjNow();
  }
  $("#qm-btnCast").addEventListener("click", cast);
  $("#qm-btnNow").addEventListener("click", () => { $("#qm-dt").value = nowStr(); cast(); });
  $("#qm-btnPrev").addEventListener("click", () => shiftHour(-2));
  $("#qm-btnNext").addEventListener("click", () => shiftHour(2));

  // 口径面板事件
  function bindSel(sel, key, msg) {
    $(sel).addEventListener("change", e => { CFG[key] = e.target.value; cast(); toast(msg + "：" + e.target.selectedOptions[0].textContent.split("（")[0]); });
  }
  bindSel("#qm-selDingju", "dingju", "定局法");
  bindSel("#qm-selPan", "pan", "盘法");
  bindSel("#qm-selZishi", "zishi", "子时换日派");
  bindSel("#qm-selJigong", "jigong", "中五宫寄宫");
  $("#qm-kjToggle").addEventListener("click", () => {
    const b = $("#qm-kjBody"), on = b.style.display === "none";
    b.style.display = on ? "block" : "none";
    $("#qm-kjToggle").textContent = on ? "收起口径面板 ▴" : "展开口径面板 ▾";
    $("#qm-kjToggle").setAttribute("aria-expanded", on ? "true" : "false");
  });

  function renderKjNow() {
    const box = $("#qm-kjNow");
    if (!CHART) { box.textContent = CHART === null && LAST_ERROR ? "当前口径下排盘未完成。" : "请先起盘。"; renderSolarInfo(); return; }
    const m = CHART.metadata;
    box.innerHTML = "当前口径：<b>" + DJ_NAME[m.dingju] + " · " + PAN_NAME[m.pan] + " · "
      + m.zishiName.split("——")[0] + " · " + m.jigongName.split("（")[0] + " · "
      + (m.calendar === "diti" ? "定气历" : "平气历") + " · " + (m.trueSolar === "true" ? "真太阳时" : "钟表时间") + "</b>";
    renderSolarInfo();
  }

  /* ---------- 白话翻译层 ---------- */
  const DOOR_PLAIN = { "开门": "这扇门是开着的——事情有出路、有开端", "休门": "宜谈判、休整、找人帮忙的吉门",
    "生门": "生机和财气最旺的一扇门", "伤门": "容易有损伤、磕碰、变动的门",
    "杜门": "这扇门堵着——沟通不畅、宜守不宜进", "景门": "热闹但偏表面，利文书考试",
    "死门": "这扇门是关死的，别硬敲", "惊门": "容易生口舌、惊吓、是非的门" };
  const GOD_GOOD = { "值符": "有贵人、领导级的助力坐镇", "太阴": "有暗中的助力、女性贵人在帮衬",
    "六合": "有人牵线搭桥，合作谈成的土壤好", "九天": "势头高远，适合主动出击、放开手脚",
    "九地": "根基稳，适合固守、慢慢来" };
  const GOD_BAD = { "白虎": "同宫带煞，防冲突、磕碰、硬碰硬", "玄武": "同宫主暗昧，防丢东西、被蒙、被糊弄",
    "腾蛇": "同宫主虚惊反复，事情容易绕来绕来" };
  const DOOR_LV = { "开门": "ji", "休门": "ji", "生门": "ji", "景门": "ping", "伤门": "xiong", "杜门": "xiong", "死门": "xiong", "惊门": "xiong" };
  function lvScore(dn) { const lv = DOOR_LV[dn]; return lv === "ji" ? 1 : lv === "xiong" ? -1 : 0; }

  function toneOfChart() {
    const c = CHART; let s = 0;
    s += lvScore(c.doorAt[c.zhiFu.palace]);
    s += lvScore(c.zhiShi.door);
    if (c.menPo && c.menPo[c.zhiFu.palace]) s -= 1;
    (c.tags || []).forEach(t => { if (t.indexOf("伏吟") > -1 || t.indexOf("反吟") > -1) s -= 1; });
    if (s >= 2) return { cls: "good", word: "向好", line: "核心宫位开的都是吉门，整体顺风，可以顺势推进。" };
    if (s === 1) return { cls: "good", word: "偏吉", line: "大面是顺的，个别地方有点小坎，稳着走没问题。" };
    if (s === 0) return { cls: "mid", word: "平稳", line: "不好不坏，事在人为，把功课做足就好。" };
    return { cls: "bad", word: "受阻", line: "这一局阻力偏大，宜缓宜守，别硬冲。" };
  }
  function wxRelText(srcWx, myWx) {
    if (srcWx === myWx) return "它和你气场比和——不温不火，平常心对待";
    const SHENG = { "木": "火", "火": "土", "土": "金", "金": "水", "水": "木" };
    const KE = { "木": "土", "土": "水", "水": "火", "火": "金", "金": "木" };
    if (SHENG[srcWx] === myWx) return "它主动生你——事情向着你来，顺水推舟就行";
    if (SHENG[myWx] === srcWx) return "你在生它——要你主动付出、多花心思经营";
    if (KE[srcWx] === myWx) return "它压着你——环境不利，硬来吃亏，宜缓";
    return "主动权在你手里——能拿下，但得费点力气";
  }
  function findGod(g) {
    const c = CHART;
    if (!c) return null;
    if (g.t === "door") { for (const p of c.ring) if (c.doorAt[p] === g.v) return { p, src: "八门" }; }
    if (g.t === "star") { for (const p of c.ring) if (c.starAt[p] && c.starAt[p].indexOf(g.v) > -1) return { p, src: "九星" }; }
    if (g.t === "god") { for (const p of c.ring) if (c.godAt[p] === g.v) return { p, src: "八神" }; }
    if (g.t === "gan") {
      let v = g.v;
      if (v === "日干") v = c.dayStem;
      else if (v === "时干") v = c.siZhu.hour[0];
      else if (v === "年干") v = c.siZhu.year[0];
      else if (v === "月干") v = c.siZhu.month[0];
      if (v === "甲") { for (const p of c.ring) if (c.tianGan[p] && c.tianGan[p].indexOf(c.xun.gan) > -1) return { p, src: "天盘干（甲遁）" }; }
      for (const p of c.ring) if (c.tianGan[p] && c.tianGan[p].indexOf(v) > -1) return { p, src: "天盘干" };
      for (let i = 1; i <= 9; i++) if (c.palGan[i] === v) return { p: i, src: "地盘干" };
    }
    return null;
  }
  function myPalace() { return findGod({ t: "gan", v: "日干" }); }
  function dirOf(p) { return (Q.PAL_DIR && Q.PAL_DIR[p]) || (Q.PAL_NAME[p].split("·")[1]) || "中宫"; }

  /* ---------- 问事 ---------- */
  $("#qm-wenGrid").innerHTML = D.SCENARIOS.map(s =>
    `<button class="wen-item" data-id="${s.id}"><b>${s.name}</b><span>${s.desc}</span></button>`).join("");
  $("#qm-wenGrid").addEventListener("click", e => {
    const b = e.target.closest(".wen-item");
    if (!b) return;
    $$("#qm-wenGrid .wen-item").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    SCEN = D.SCENARIOS.find(s => s.id === b.dataset.id);
    renderWen(true);
  });

  function scoreScenario(sc) {
    const c = CHART, me = myPalace(); let score = 0; const parts = [];
    for (const g of sc.gods) {
      const r = findGod(g);
      if (!r) { parts.push({ g, r: null }); continue; }
      const door = D.DOORS.find(x => x.n === c.doorAt[r.p]);
      const ji = door && door.lv.indexOf("吉") > -1, xiong = door && door.lv.indexOf("凶") > -1;
      score += ji ? 1 : xiong ? -1 : 0;
      if (c.menPo && c.menPo[r.p]) score -= 1;
      if (GOD_GOOD[c.godAt[r.p]]) score += 1;
      if (GOD_BAD[c.godAt[r.p]]) score -= 1;
      parts.push({ g, r });
    }
    return { score, parts, me };
  }
  function renderWen(scroll) {
    const box = $("#qm-wenResult");
    if (!SCEN) { box.innerHTML = '<p class="dim empty">👆 选一个事项开始，不用懂任何术语</p>'; return; }
    if (!CHART) { box.innerHTML = '<p class="dim empty">当前口径下未能起盘，请到「盘面」页调整口径或换时刻</p>'; return; }
    const c = CHART, { score, parts, me } = scoreScenario(SCEN);
    let vBig, vCls, vOne;
    if (score >= 3) { vBig = "顺 · 可以行动"; vCls = "good"; vOne = "这一局的信号整体向好，想做的事可以推起来。"; }
    else if (score >= 1) { vBig = "偏顺 · 稳着来"; vCls = "good"; vOne = "好消息比坏消息多，稳扎稳打就行。"; }
    else if (score === 0) { vBig = "平 · 看你操作"; vCls = "mid"; vOne = "吉凶各半，事在人为——准备充分就能赢一半。"; }
    else if (score >= -2) { vBig = "偏阻 · 缓一缓"; vCls = "bad"; vOne = "这一局阻力偏大，先放一放、换个时机再问。"; }
    else { vBig = "不利 · 别硬来"; vCls = "bad"; vOne = "信号偏差，宜静守调整，等下一局再说。"; }
    const reasons = parts.map(({ g, r }) => {
      if (!r) return `<li><b>${g.label}</b>：这一局里没露面——此事象不显，随缘即可，不用强求。</li>`;
      const door = D.DOORS.find(x => x.n === c.doorAt[r.p]);
      let s = `<b>${g.label}</b>（${Q.PAL_NAME[r.p]}）：${DOOR_PLAIN[door.n] || ""}`;
      if (c.menPo && c.menPo[r.p]) s += `；不过它跟宫位相冲（术语叫"门迫"），力量要打对折`;
      if (GOD_GOOD[c.godAt[r.p]]) s += `；${GOD_GOOD[c.godAt[r.p]]}`;
      if (GOD_BAD[c.godAt[r.p]]) s += `；${GOD_BAD[c.godAt[r.p]]}`;
      const bad = FACTORS.filter(f => f.palace === r.p);
      if (bad.length) s += `；此宫另有 ${bad.map(f => f.name).join("、")}`;
      if (me && me.p !== r.p && r.src.indexOf("地盘") === -1) s += `。和你本人的关系：${wxRelText(Q.PAL_WX[r.p], Q.PAL_WX[me.p])}`;
      return `<li>${s}。</li>`;
    }).join("");
    const dirs = parts.filter(x => x.r).map(x => dirOf(x.r.p));
    const m = c.metadata;
    const html =
      `<div class="wen-card">
        <div class="v-head ${vCls}"><span class="v-big">${vBig}</span><span class="v-one">${vOne}</span></div>
        <h4>为什么这么说</h4>
        <ol class="reasons">${reasons}</ol>
        <div class="v-actions">
          <div class="dir-chip">🧭 相关方位：${[...new Set(dirs)].join("、") || "—"}</div>
          <button class="act" id="qm-goPan">看专业盘面 →</button>
          <button class="act" id="qm-goVs">换口径对照看看 →</button>
        </div>
        <div class="tip">📖 小知识：${SCEN.tip}</div>
        <p class="dim" style="margin-top:8px">当前口径：${DJ_NAME[m.dingju]} · ${PAN_NAME[m.pan]}${c.method.solarNote ? " · " + c.method.solarNote : " · 钟表时间"}。换一种口径结论可能不同。</p>
        <p class="dis">⚠ 由传统奇门规则自动推演，仅供传统文化学习参考，<b>不构成医疗、投资、法律或婚恋建议</b>。应期若涉及推断，只是候选时间范围，不是必然结果。</p>
      </div>`;
    box.innerHTML = guard(html);
    const gp = $("#qm-goPan"), gv = $("#qm-goVs");
    if (gp) gp.addEventListener("click", () => showTab("pan"));
    if (gv) gv.addEventListener("click", () => showTab("vs"));
    if (scroll) box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ---------- 盘面：增量渲染（v3.2 核心改动） ---------- */
  const CELL_ORDER = [4, 9, 2, 3, 5, 7, 8, 1, 6];

  function mountGrid() {
    const grid = $("#qm-grid");
    if (grid.dataset.mounted) return;
    grid.innerHTML = CELL_ORDER.map(p => {
      const isC = p === 5;
      return `<div class="cell${isC ? " center" : ""}" data-p="${p}"
        ${isC ? 'aria-hidden="true"' : 'tabindex="0" role="button" aria-label="' + escapeHtml(Q.PAL_NAME[p] || "") + '，按回车看详解"'}>
        <div class="cell-face">
          <span class="badge b0" aria-hidden="true"></span>
          <span class="badge zu b1" aria-hidden="true"></span>
          <span class="badge po b2" aria-hidden="true"></span>
          <div class="god"></div>
          <div class="star"></div>
          <div class="gan-tian"></div>
          <div class="gan-di"></div>
          <div class="door"></div>
          <div class="zhu"></div>
          <div class="bagua"></div>
        </div>
      </div>`;
    }).join("");
    grid.dataset.mounted = "1";
  }

  function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }

  let lastSig = "";
  function paintGrid(force) {
    const grid = $("#qm-grid");
    if (!grid) return;
    mountGrid();
    const c = CHART;
    if (!c) {
      if (!force && lastSig === "__empty__") return;
      lastSig = "__empty__";
      Array.from(grid.children).forEach(el => {
        const f = el.querySelector(".cell-face");
        if (!f) return;
        f.querySelector(".god").textContent = "";
        f.querySelector(".star").textContent = "";
        f.querySelector(".gan-tian").textContent = "—";
        f.querySelector(".gan-di").textContent = "";
        f.querySelector(".door").textContent = "";
        f.querySelector(".zhu").textContent = "";
        f.querySelector(".bagua").textContent = "";
        el.querySelectorAll(".badge").forEach(b => { b.textContent = ""; b.style.display = "none"; });
      });
      return;
    }
    const sig = [c.siZhu.day, c.siZhu.hour, c.ju, c.dun, c.zhiFu.star, c.zhiFu.palace,
                 c.zhiShi.door, c.zhiShi.palace, FACTORS.length, (c.tags || []).join(",")].join("|");
    if (!force && sig === lastSig) return;
    lastSig = sig;

    Array.from(grid.children).forEach(el => {
      const p = +el.dataset.p;
      const f = el.querySelector(".cell-face");
      if (!f) return;
      const b = el.querySelectorAll(".badge");

      if (p === 5) {
        b.forEach(x => { x.textContent = ""; x.style.display = "none"; });
        setText(f.querySelector(".god"), "");
        setText(f.querySelector(".star"), "");
        const gt5 = f.querySelector(".gan-tian");
        gt5.classList.remove("multi");
        setText(gt5, "·");
        setText(f.querySelector(".gan-di"), c.palGan[5]);
        const door5 = f.querySelector(".door");
        door5.className = "door";
        door5.style.display = "none";   // 中宫无门，不留空占位
        setText(door5, "");
        setText(f.querySelector(".zhu"), "天禽寄坤二");
        setText(f.querySelector(".bagua"), "中五");
        return;
      }

      const lv = DOOR_LV[c.doorAt[p]];
      const bad = FACTORS.filter(x => x.palace === p);

      // 槽 0：宜 / 中 / 慎
      b[0].className = "badge b0 " + (lv === "ji" ? "yi" : lv === "ping" ? "zhong" : "shen");
      setText(b[0], lv === "ji" ? "宜" : lv === "ping" ? "中" : "慎");
      b[0].style.display = "";
      // 槽 1：门迫
      if (c.menPo && c.menPo[p]) { b[1].className = "badge zu b1"; setText(b[1], "阻"); b[1].style.display = ""; }
      else { b[1].style.display = "none"; }
      // 槽 2：不利因素
      if (bad.length) {
        b[2].className = "badge po b2";
        setText(b[2], bad[0].name[0]);
        b[2].title = bad.map(x => x.name).join("、");
        b[2].style.display = "";
      } else { b[2].style.display = "none"; b[2].title = ""; }

      setText(f.querySelector(".god"), c.godAt[p]);
      setText(f.querySelector(".star"), c.starAt[p]);
      const gt = f.querySelector(".gan-tian");
      const gtv = String(c.tianGan[p] || "");
      gt.classList.toggle("multi", gtv.length > 1);
      setText(gt, gtv);
      setText(f.querySelector(".gan-di"), c.palGan[p]);
      const door = f.querySelector(".door");
      door.style.display = "";
      door.className = "door " + lv;
      setText(door, c.doorAt[p] + (c.menPo && c.menPo[p] ? "迫" : ""));
      setText(f.querySelector(".zhu"), "");
      setText(f.querySelector(".bagua"), (Q.PAL_BAGUA[p] || "") + p);
      el.setAttribute("aria-label", (Q.PAL_NAME[p] || "") + "，" + c.doorAt[p] + "，" + c.starAt[p] + "，按回车看详解");
    });
  }

  function renderPan() {
    const c = CHART, tone = toneOfChart(), m = c.metadata;
    $("#qm-sizhu").textContent = `${c.siZhu.year}年 · ${c.siZhu.month}月 · ${c.siZhu.day}日 · ${c.siZhu.hour}时`;
    $("#qm-metaPlain").innerHTML =
      `这一盘整体基调：<b class="${tone.cls === "good" ? "red" : tone.cls === "bad" ? "blue" : "mid"}">${tone.word}</b>。${tone.line}<br>` +
      `<span class="dim">盘面由 <b>${c.zhiFu.star}</b> 主事、<b>${c.zhiShi.door}</b> 把门。想深入可以点九宫格任意一格看详解，或展开下面的专业信息。</span>`;
    $("#qm-metaPro").innerHTML =
      `<b>${c.dun}${c.ju}局</b>` +
      (c.yinpan
        ? `（阴盘 · 农历 ${c.yinpan.lunar.month}月${c.yinpan.lunar.day}日 · 年支${c.yinpan.yz}+${c.yinpan.lunar.month}+${c.yinpan.lunar.day}+时支${c.yinpan.hz}=${c.yinpan.sum}）`
        : `（${c.termForJu} · ${c.yuan}）`)
      + `｜定局 <b>${DJ_NAME[m.dingju]}</b>　盘法 <b>${PAN_NAME[m.pan]}</b>　`
      + `子时 <b>${m.zishiName.split("——")[0]}</b>　寄宫 <b>${m.jigongName.split("（")[0]}</b>` +
      (c.method.solarNote ? `　<span class="note">${c.method.solarNote}</span>` : "") + `<br>` +
      `符头 <b>${c.fu.name || "（不用符头）"}</b>${c.fu.name ? `（距今 ${c.fu.offset} 天${m.dingju === "zhirun" ? "，三元按符头起算" : ""}）` : ""}`
      + `　｜旬首 <b>${c.xun.name}</b>（遁${c.xun.gan}，落${c.xun.palace}宫）`
      + `｜值符 <b>${c.zhiFu.star}</b> 落${c.zhiFu.palace}宫｜值使 <b>${c.zhiShi.door}</b> 落${c.zhiShi.palace}宫`
      + (c.zhiShi.note ? `<span class="note">${c.zhiShi.note}</span>` : "")
      + `｜旬空 <b>${c.kongWang.join("")}</b>｜马星 <b>${c.maXing}</b>（${c.maPalace}）`;

    // 交节临界 + 真太阳时跨时辰提示
    const warns = [];
    const t = Q.hoursToTermBoundary(c.input.y, c.input.mo, c.input.d, c.input.h, c.input.mi);
    if (t.near) warns.push(`⚠ <b>交节临界</b>：本时刻距交节约 ${Math.min(t.since, t.until).toFixed(1)} 小时。节气已按全站历法库的精确交节时刻计算；不同历法口径在此窗口内仍可能差一局。`);
    if (c.method.crossShichen) warns.push("⚠ <b>真太阳时校正后已跨时辰</b>：时辰归属可能因此改变。");
    if (c.method.crossDay) warns.push("⚠ <b>真太阳时校正后已跨日</b>：日柱可能因此改变。");
    if (c.method.pan === "fei_tiaojian") warns.push("⚠ <b>九宫跳涧属民间说法</b>，未见古籍依据；古籍所载飞盘为「卦气飞越」，可在上方盘法切换。");
    if (c.palGan && c.palGan[5] && c.zhiShi.palace === 5) warns.push("⚠ 值使落中五宫且寄宫方案设为「飞盘不寄」，此盘处理方式各家无定说。");
    $("#qm-warnBox").innerHTML = warns.length
      ? `<div class="warnbox">${warns.map(w => `<p>${w}</p>`).join("")}</div>` : "";

    $("#qm-tags").innerHTML = (c.tags || []).map(t2 => `<span class="tag">${t2}</span>`).join("");
    paintGrid(true);
    renderGeju(); renderFactors();
  }

  // 宫格事件：容器级委托，只绑一次
  $("#qm-grid").addEventListener("click", e => {
    const cell = e.target.closest(".cell");
    if (!cell || cell.classList.contains("center")) return;
    cellModal(+cell.dataset.p);
  });
  $("#qm-grid").addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const cell = e.target.closest(".cell");
    if (!cell || cell.classList.contains("center")) return;
    e.preventDefault();
    cellModal(+cell.dataset.p);
  });

  $("#qm-metaToggle").addEventListener("click", () => {
    const pro = $("#qm-metaPro"), on = pro.style.display === "none";
    pro.style.display = on ? "block" : "none";
    $("#qm-metaToggle").textContent = on ? "◂ 收起专业信息" : "显示专业信息 ▸";
    $("#qm-metaToggle").setAttribute("aria-expanded", on ? "true" : "false");
  });

  /* ---------- 格局卡（M2） ---------- */
  function renderGeju() {
    const box = $("#qm-gejuBox");
    if (!GEOJU.length) {
      box.innerHTML = '<div class="gbox"><h4>本盘格局</h4><p class="dim">当前盘面未命中已实现的格局判定。'
        + '这属正常——奇门格局出现的概率本就不高（实测约九成盘面零命中），不是判定失效。</p></div>';
      return;
    }
    const cards = GEOJU.map(g => {
      const lvCls = g.level.indexOf("吉") > -1 || g.level === "大吉" ? "red" : g.level.indexOf("凶") > -1 ? "blue" : "";
      const dataLv = lvCls === "red" ? "ji" : lvCls === "blue" ? "xiong" : "ping";
      const srcs = g.sources.map(s =>
        `<li><b>${escapeHtml(s.book)}</b>${s.chapter ? "·" + escapeHtml(s.chapter) : ""}：${escapeHtml(s.note || "")}`
        + (s.url ? ` <span class="src">${escapeHtml(s.url)}</span>` : "") + `</li>`).join("");
      const multi = g.sources.length > 1;
      return `<div class="gcard" data-lv="${dataLv}">
        <div class="ghead"><b class="${lvCls}">${escapeHtml(g.name)}</b><span class="glv ${lvCls}">${escapeHtml(g.level)}</span>
        ${g.palace ? `<span class="gpal">落 ${Q.PAL_NAME[g.palace]}</span>` : ""}</div>
        <p class="gdesc">${escapeHtml(g.desc)}</p>
        <details class="gsrc"><summary>依据 ${g.sources.length} 条${multi ? "（异说并列，本工具不代为择一）" : ""}</summary>
          <ul>${srcs}</ul>
          ${g.degrade && g.degrade.length ? `<p class="gdeg">降级规则：遇 ${g.degrade.join("、")} 则吉事成凶。</p>` : ""}
        </details></div>`;
    }).join("");
    box.innerHTML = `<div class="gbox"><h4>本盘格局 · ${GEOJU.length} 条</h4>
      <p class="dim">每条判定都带书名与说法来源。标注多条依据者，说明各家说法不同——本工具<b>并陈异说、不代为择一</b>。</p>
      ${cards}</div>`;
  }

  /* ---------- 不利因素（M2-4） ---------- */
  function renderFactors() {
    const box = $("#qm-factorBox");
    if (!FACTORS.length) { box.innerHTML = ""; return; }
    const byPal = {};
    FACTORS.forEach(f => {
      const k = f.palace == null ? "全局" : Q.PAL_NAME[f.palace];
      (byPal[k] = byPal[k] || []).push(f);
    });
    const rows = Object.keys(byPal).map(k => {
      const items = byPal[k];
      const worst = Math.max.apply(null, items.map(i => i.severity));
      const sevCls = worst >= 0.8 ? "sev-high" : worst >= 0.5 ? "sev-mid" : "sev-low";
      return `<div class="frow"><div class="fpal">${escapeHtml(k)}</div>
        <div class="fitems">${items.map(f => {
          const meta = D.FACTOR_META ? D.FACTOR_META[f.id] : null;
          return `<span class="fchip" title="${escapeHtml(f.note)}">
            <b>${escapeHtml(f.name)}</b>${f.severity ? `<i class="${sevCls}">折减 ${Math.round(f.severity * 100)}%</i>` : ""}
            ${meta ? `<u title="${escapeHtml(meta.src)}">${escapeHtml(meta.src)}</u>` : ""}</span>`;
        }).join("")}</div></div>`;
    }).join("");
    box.innerHTML = `<div class="fbox"><h4>不利因素 · ${FACTORS.length} 项</h4>
      <p class="dim">折减系数为<b>民间量化说法</b>，非古法明确数值，来源见下方出处标注。仅作参考，不宜当作计算结果使用。</p>
      ${rows}</div>`;
  }

  function awkWx(g) { return { "甲": "木", "乙": "木", "丙": "火", "丁": "火", "戊": "土", "己": "土", "庚": "金", "辛": "金", "壬": "水", "癸": "水" }[g]; }
  function relText(a, b) {
    const SHENG = { "木": "火", "火": "土", "土": "金", "金": "水", "水": "木" }, KE = { "木": "土", "土": "水", "水": "火", "火": "金", "金": "木" };
    if (a === b) return "五行比和，平顺相当";
    if (SHENG[a] === b) return `${a}生${b}，相生有情、助力顺遂`;
    if (KE[a] === b) return `${a}克${b}，有克制之力、可施压掌控`;
    return "五行不接，各自安好";
  }
  function cellModal(p) {
    const c = CHART;
    if (!c) return;
    if (p === 5) {
      showModal(`<h3>中五宫</h3><p>洛书中宫，不独立设星门。<b>天禽星寄坤二宫</b>同行（当前寄宫方案：${escapeHtml(c.metadata.jigongName)}）。</p><p>地盘干：<b class="gold">${c.palGan[5]}</b></p>`);
      return;
    }
    const door = D.DOORS.find(x => x.n === c.doorAt[p]);
    const starName = c.starAt[p].replace("·禽", "");
    const star = D.STARS.find(x => x.n === starName);
    const god = D.GODS.find(x => x.n === c.godAt[p]);
    const tg = (c.tianGan[p] || "").replace("、", "");
    const tgInfo = D.GANS.find(x => x.n === tg[0]);
    const dgInfo = D.GANS.find(x => x.n === c.palGan[p]);
    const po = (c.menPo && c.menPo[p]) ? `<p class="warn">⚠ 此宫<b>门迫</b>（${door.wx}门克${Q.PAL_WX[p]}宫）：吉门迫则吉事减半，凶门迫则凶上加凶。</p>` : "";
    const fac = FACTORS.filter(f => f.palace === p);
    const facHtml = fac.length ? `<p class="warn"><b>此宫不利因素</b>：${fac.map(f => escapeHtml(f.name) + (f.severity ? `（折减 ${Math.round(f.severity * 100)}%，民间量化说法）` : "")).join("、")}</p>` : "";
    const gj = GEOJU.filter(g => g.palace === p);
    const gjHtml = gj.length ? `<p><b>此宫格局</b>：${gj.map(g => escapeHtml(g.name)).join("、")}</p>` : "";
    showModal(`<h3>${Q.PAL_NAME[p]}</h3>
      <table class="kv">
        <tr><td>一句话</td><td><b>${DOOR_PLAIN[door.n] || ""}</b></td></tr>
        <tr><td>八神</td><td><b>${c.godAt[p]}</b>　<span class="dim">${god ? god.d : ""}</span></td></tr>
        <tr><td>九星</td><td><b>${c.starAt[p]}</b>（${star ? star.wx : ""}）　<span class="dim">${star ? star.d : ""}</span></td></tr>
        <tr><td>天盘干</td><td><b class="gold">${c.tianGan[p]}</b>　<span class="dim">${tgInfo ? tgInfo.d : ""}</span></td></tr>
        <tr><td>地盘干</td><td><b>${c.palGan[p]}</b>　<span class="dim">${dgInfo ? dgInfo.d : ""}</span></td></tr>
        <tr><td>八门</td><td><b>${c.doorAt[p]}</b>（${door ? door.wx : ""}·${door ? door.lv : ""}）　<span class="dim">${door ? door.d : ""}</span></td></tr>
      </table>${po}${facHtml}${gjHtml}
      <p><b>天地盘组合</b>：天盘${tg[0] || ""}临地盘${c.palGan[p]}，${relText(awkWx(tg[0]), awkWx(c.palGan[p]))}。</p>
      <p class="dis">白话小结：${c.godAt[p]}临${Q.PAL_NAME[p].split("·")[0]}宫，${c.starAt[p]}坐镇，${c.doorAt[p]}把门${(c.menPo && c.menPo[p]) ? "，但门迫受阻" : ""}。方位：${dirOf(p)}。以上均为传统规则推演，仅供文化参考。</p>`);
  }

  /* ---------- 流派对照：盘差分（M4-5） ---------- */
  function vsCombos(dim) {
    const base = currentOpts();
    const mk = o => Object.assign({}, base, o);
    if (dim === "pan") return [
      { label: "转盘奇门", o: mk({ pan: "zhuan" }) },
      { label: "飞盘·九宫跳涧（民间）", o: mk({ pan: "fei_tiaojian" }) },
      { label: "飞盘·卦气飞越（古籍）", o: mk({ pan: "fei_guaqi" }) }
    ];
    if (dim === "dingju") return [
      { label: "拆补法（阳盘）", o: mk({ dingju: "chabu" }) },
      { label: "置闰法（阳盘）", o: mk({ dingju: "zhirun" }) },
      { label: "茅山法（阳盘）", o: mk({ dingju: "maoshan" }) },
      { label: "阴盘奇门", o: mk({ dingju: "yinpan" }) }
    ];
    if (dim === "solar") return [
      { label: "戊日全局设置（真太阳时）", o: mk({}) },
      { label: "钟表时间（不换算）", o: mk({ lon: null }) },
      { label: "东经 120° 标准时", o: mk({ lon: 120, baseLon: 120 }) }
    ];
    // core
    return [
      { label: "转盘·拆补", o: mk({ pan: "zhuan", dingju: "chabu" }) },
      { label: "转盘·置闰", o: mk({ pan: "zhuan", dingju: "zhirun" }) },
      { label: "转盘·茅山", o: mk({ pan: "zhuan", dingju: "maoshan" }) },
      { label: "转盘·阴盘", o: mk({ pan: "zhuan", dingju: "yinpan" }) },
      { label: "飞盘跳涧·拆补", o: mk({ pan: "fei_tiaojian", dingju: "chabu" }) },
      { label: "飞盘跳涧·置闰", o: mk({ pan: "fei_tiaojian", dingju: "zhirun" }) },
      { label: "飞盘跳涧·茅山", o: mk({ pan: "fei_tiaojian", dingju: "maoshan" }) },
      { label: "飞盘卦气·拆补", o: mk({ pan: "fei_guaqi", dingju: "chabu" }) },
      { label: "飞盘卦气·置闰", o: mk({ pan: "fei_guaqi", dingju: "zhirun" }) },
      { label: "飞盘卦气·茅山", o: mk({ pan: "fei_guaqi", dingju: "maoshan" }) }
    ];
  }
  function renderCompare() {
    const o = parseDT($("#qm-dt").value);
    if (!o) return;
    const dim = $("#qm-vsDim").value;
    const combos = vsCombos(dim);
    const charts = [];
    for (const cb of combos) {
      try { charts.push({ label: cb.label, c: Q.paipan(o.y, o.mo, o.d, o.h, o.mi, cb.o) }); }
      catch (e) { charts.push({ label: cb.label, c: null, err: e.message }); }
    }
    const valid = charts.filter(x => x.c);
    if (!valid.length) { $("#qm-vsBox").innerHTML = '<p class="dim">该时刻在各口径下均未能起盘，请换时刻或换定局法。</p>'; return; }
    const ref = valid[0];
    const rows = charts.map(x => {
      if (!x.c) return `<tr class="bad"><td>${escapeHtml(x.label)}</td><td colspan="4">该口径下未能起盘：${escapeHtml(x.err || "")}</td></tr>`;
      const d = Q.diffCharts(ref.c, x.c);
      return `<tr class="${x.label.indexOf(PAN_NAME[CFG.pan]) > -1 && x.label.indexOf(DJ_NAME[CFG.dingju]) > -1 ? "cur" : ""}">
        <td>${escapeHtml(x.label)}</td>
        <td><b>${x.c.dun}${x.c.ju}局</b></td>
        <td>${x.c.termForJu}·${x.c.yuan}</td>
        <td>${x.c.zhiFu.star}落${x.c.zhiFu.palace}</td>
        <td>${x.c.zhiShi.door}落${x.c.zhiShi.palace}</td>
        <td>${d.same ? '<span class="same">与基准一致</span>' : `<span class="diff">差 ${d.diffCount} 处</span>`}</td>
      </tr>`;
    }).join("");
    // 差异摘要：与基准不同者
    const diffs = valid.slice(1).map(x => ({ label: x.label, d: Q.diffCharts(ref.c, x.c) })).filter(x => !x.d.same);
    const diffHtml = diffs.length ? diffs.map(x => {
      const fs = x.d.fields.map(f => `<li><b>${escapeHtml(f.key)}</b>：基准「${escapeHtml(f.a)}」→ 本口径「${escapeHtml(f.b)}」</li>`).join("");
      const ps = x.d.palaces.map(p => `<li><b>${escapeHtml(p.name)}</b>：${p.changes.map(escapeHtml).join("；")}</li>`).join("");
      return `<details class="vdetail"><summary>${escapeHtml(x.label)}　<span class="diff">差 ${x.d.diffCount} 处</span></summary>
        ${fs ? `<h5>关键项</h5><ul>${fs}</ul>` : ""}
        ${ps ? `<h5>受影响宫位</h5><ul>${ps}</ul>` : ""}</details>`;
    }).join("") : '<p class="dim">所有口径在这一刻算出了相同的盘。</p>';

    const ds = Q.dashi(o.y, o.mo, o.d, o.h, o.mi);
    const cal = CASES && CASES.checkAgainstCases ? CASES.checkAgainstCases(o.y, o.mo, o.d, o.h, o.mi, currentOpts()) : null;
    const cite = CASES && CASES.citationStatus ? CASES.citationStatus() : null;
    const calHtml = cal && cal.total
      ? `<div class="vs-why"><h4>与典籍算例的对照</h4>
          <p>本时刻命中 ${cal.total} 组算例，其中一致 <b>${cal.passed}</b> 组。</p>
          <ul>${cal.matched.map(m2 => `<li>【${escapeHtml(m2.type)}】${m2.ok ? "✅" : "⚠"} ${escapeHtml(m2.ref)}${m2.value ? "　当前：" + escapeHtml(m2.value) : ""}</li>`).join("")}</ul>
          <p class="dim">诚实说明：这些是<b>日干支与定局</b>层面的对照，不是"本盘等于某典籍原盘"的证明。</p></div>`
      : "";
    const citeHtml = cite
      ? `<div class="vs-why"><h4>引文语料状态</h4>
          <p>语料共 ${cite.total} 条，已核 ${cite.verified} 条。
          ${cite.missing.length ? `缺失 ${cite.missing.length} 条。` : "无缺失。"}
          ${cite.skipped.length ? `未挂载判定 ${cite.skipped.length} 条。` : "全部已挂载。"}</p>
          ${cite.skipped.length ? `<ul>${cite.skipped.map(s => `<li>${escapeHtml(s.book)} —— ${escapeHtml(s.reason)}</li>`).join("")}</ul>
            <p class="dim">语料缺失或未挂载会<b>显式列出</b>，不静默通过。</p>` : ""}</div>`
      : "";

    $("#qm-vsBox").innerHTML = guard(`
      <div class="vs-head"><span class="vs-big">差异摘要</span>
        <p>以第一种口径为基准，只列出<b>哪里不一样</b>——你关心的是差异，不是把六张图看六遍。</p></div>
      <table class="vs-table">
        <thead><tr><th>口径</th><th>局数</th><th>节气·三元</th><th>值符星</th><th>值使门</th><th>与基准比</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="vs-diff"><h4>逐项差异</h4>${diffHtml}</div>
      ${calHtml}
      ${citeHtml}
      <div class="vs-why">
        <h4>为什么会不一样？</h4>
        <p><b>① 定局法之争</b>：一年 24 节气、每节气 15 天；而六十甲子每 60 天一轮、每 5 天一元。两套周期<b>天生对不齐</b>。拆补以节气为准，置闰让干支走完整，茅山干脆不看干支。实测拆补 vs 置闰 <b>45.6%</b> 的时刻局数不同，拆补 vs 茅山 <b>73.9%</b>。</p>
        <p><b>② 盘法之争</b>：转盘按八卦顺时针环轮转；飞盘则分两种——<b>九宫跳涧</b>（民间说法，无典籍依据）与<b>卦气飞越</b>（《奇门法窍》所载，八门固定布宫、不入中五）。实测转盘 vs 飞盘星门神落宫 <b>100%</b> 不同。</p>
        <p><b>③ 时间口径</b>：子时换日派（23:00 / 00:00）、是否用真太阳时（经度不同可差两小时）、寄宫方案，都会改变结果。</p>
      </div>
      <div class="vs-why">
        <h4>那到底该信哪个？</h4>
        <p>本工具<b>不替你选边</b>，因为奇门遁甲从来就没有被公认的权威标准——历代流派并存，各执一说，<b>没有官方认证，也没有可重复验证的实验依据</b>。</p>
        <p>建议：<b>把它当成一套自洽的符号思维游戏，而不是一套物理定律</b>。用来整理思路、换个角度看问题可以；用来替代现实判断、医疗诊断或投资决策，不可以。</p>
        <p class="dis">若某项功能涉及<b>应期</b>推断，给出的是「可能的时间范围」，属<b>候选窗口</b>，而非「某日必然成功」的保证。
        本页差异摘要仅描述不同口径下的算法输出差异，<b>不构成任何决策建议</b>。</p>
      </div>
      <h3 class="vs-h">同一时刻 · 五家大势</h3>
      <div class="da-grid">
        <div class="da-card"><h4>年家 · ${ds.nian.gz}年</h4>
          <p><b>${ds.nian.yuan}</b>　起${ds.nian.startPalaceName}　<b class="gold">${ds.nian.ziBai}</b>入中宫　${ds.nian.dun}</p>
          <p class="dim">${ds.nian.note}用于看长周期大势。</p></div>
        <div class="da-card"><h4>月家 · ${ds.yue.gz}月（${ds.yue.monthNo}月）</h4>
          <p><b>${ds.yue.yuan}</b>（年支${ds.yue.season}）　起${ds.yue.startPalaceName}　<b class="gold">${ds.yue.ziBai}</b>入中宫</p>
          <p class="dim">${ds.yue.note}</p></div>
        <div class="da-card"><h4>日家 · ${ds.ri.gz}日</h4>
          <p>${ds.ri.term}　<b>${ds.ri.dun}${ds.ri.ju}局</b>　${ds.ri.yuan}</p>
          <p class="dim">${ds.ri.note}</p></div>
      </div>
      <p class="dis">年家、月家、日家的完整盘面各派说法不一，本工具只呈现古籍中规则明确且可核对的部分，不臆造完整盘面。</p>`);
  }
  $("#qm-btnVs").addEventListener("click", renderCompare);
  $("#qm-vsDim").addEventListener("change", renderCompare);

  /* ---------- 简报 ---------- */
  function renderBrief() {
    if (!CHART) {
      $("#qm-brief").innerHTML = '<div class="b-item"><h4>整体基调</h4><p class="dim">当前口径未能起盘，请调整口径或更换时刻。</p></div>';
      $("#qm-gejuBox").innerHTML = ""; $("#qm-factorBox").innerHTML = "";
      return;
    }
    const c = CHART, tone = toneOfChart();
    $("#qm-brief").innerHTML =
      `<div class="b-item"><h4>整体基调</h4><p><b class="${tone.cls === "good" ? "red" : tone.cls === "bad" ? "blue" : "mid"}">${tone.word}</b>——${tone.line}</p></div>` +
      `<div class="b-item"><h4>今日顺风方向</h4><p>${c.jiMen || [] .length ? "" : ""}${(c.jiMen || ["开门","休门","生门"].map(n => ({ door: n, palace: null }))).map(j => j.palace == null ? j.door : `<b class="red">${j.door}</b>（${DOOR_PLAIN[j.door]}）在 <b>${dirOf(j.palace)}</b>`).join("<br>")}</p><p class="dim">出行、谈判、办事可以优先往这些方向走。这是传统择方之说，实际请以现实条件为准。</p></div>` +
      `<div class="b-item"><h4>接下来玩什么</h4><p>① 回顶部「<b>问 事</b>」选一件你想问的事（共 ${D.SCENARIOS.length} 类），直接出大白话结论；② 去「<b>流派对照</b>」看不同口径差在哪里；③ 点九宫格任意一格看详解与依据。</p></div>`;
  }

  /* ---------- 学习中心 ---------- */
  function cards(list) {
    return `<div class="cards">` + list.map(x =>
      `<div class="card"><h4>${x.n}${x.lv ? `<span class="lv ${x.lv.indexOf('吉') > -1 ? 'red' : x.lv === '平' ? '' : 'blue'}">${x.wx ? x.wx + " · " : ""}${x.lv}</span>` : x.wx ? `<span class="lv">${x.wx}</span>` : ""}</h4><p>${x.d}</p></div>`).join("") + `</div>`;
  }
  const SCHOOL_CARDS = (arr, title, note) =>
    `<h3>${title}</h3>` + (note ? `<p class="dim">${note}</p>` : "") + cards(arr.map(s => ({ n: s.name, lv: s.caveat ? "民间说法" : (s.src ? "古籍所载" : ""), wx: s.short || "", d: s.desc + (s.use ? "　<b>常见用法</b>：" + s.use : "") })));
  $("#qm-xueContent").innerHTML =
    `<h3>八门图鉴 <span class="dim">（人事的八条路径）</span></h3>${cards(D.DOORS)}` +
    `<h3>九星图鉴 <span class="dim">（天时之气）</span></h3>${cards(D.STARS)}` +
    `<h3>八神图鉴 <span class="dim">（冥冥中的八种力量）</span></h3>${cards(D.GODS)}` +
    `<h3>三奇六仪 <span class="dim">（天干写成的密码）</span></h3>${cards(D.GANS)}` +
    `<h3>常用格局速查 <span class="dim">（说明用；本盘实际命中见「盘面」页）</span></h3>${cards(D.GEJU)}` +
    SCHOOL_CARDS(D.SCHOOLS.dingju, "定局法四派（阳盘三派 + 阴盘）", "阳盘三派以节气与六十甲子定局；阴盘按太阴历起局，两者是不同体系。") +
    SCHOOL_CARDS(D.SCHOOLS.pan, "盘法 · 含两种「飞盘」", "注意：九宫跳涧是民间说法，卦气飞越才是《奇门法窍》所载。") +
    SCHOOL_CARDS(D.SCHOOLS.zishi, "子时换日三派", "日柱一翻则旬首、符首、值符值使全改。") +
    SCHOOL_CARDS(D.SCHOOLS.jigong, "中五宫寄宫四说", "《统宗》书内即自相异说——这是「异说并列」的典型样本。") +
    `<h3>《烟波钓叟歌》精句</h3>` +
    `<div class="song">${D.SONG.map(s => `<div class="song-item"><p class="o">「${s.o}」</p><p class="j">${s.j}</p></div>`).join("")}</div>` +
    (window.__PALM_IMG ? `<img class="palm" src="${window.__PALM_IMG}" alt="掌诀图">` : `<p class="dim" style="margin-top:18px">掌诀图源文件未随本构建打包，故此处留空——不影响任何排盘与判定功能。</p>`);
  $("#qm-dictSearch").addEventListener("input", e => {
    const k = e.target.value.trim();
    $("#qm-dictList").innerHTML = D.DICT.filter(x => !k || x.t.indexOf(k) > -1 || x.d.indexOf(k) > -1)
      .map(x => `<div class="dict-item"><b>${x.t}</b>　<span class="dim">${x.d}</span></div>`).join("") || '<p class="dim">没有匹配的词条</p>';
  });
  $("#qm-dictSearch").dispatchEvent(new Event("input"));

  /* ---------- 合规区块 ---------- */
  $("#qm-noUseList").innerHTML = D.NO_USE.map(x => `<li>${x}</li>`).join("");
  $("#qm-disList").innerHTML = D.DISCLAIMER_ITEMS.map(x => `<li>${x}</li>`).join("");
  $("#qm-privacyNote").textContent = D.PRIVACY_NOTE;
  $("#qm-ageNote").textContent = D.AGE_NOTE;
  $("#qm-notEvidence").textContent = D.NOT_EVIDENCE;

  /* ---------- 启动 ---------- */
  mountGrid();
  selfCheck();
  $("#qm-dt").value = nowStr();
  cast();
})();


/* ================= 戊日适配：入口与视图开关 =================
 * 与八字/六爻同模式：首页入口卡 → requirePro 门控 → 显示 #view-qimen 覆盖层 */
(function () {
  function open() {
    if (window.WuriPro && !WuriPro.isPro()) { WuriPro.requirePro("qimen"); return; }
    var v = document.getElementById("view-qimen");
    if (!v) return;
    v.hidden = false;
    ["view-liuyao", "view-ziwei", "view-deities", "view-deity-detail", "bazi-view"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
    v.scrollTop = 0;
    if (typeof updateFloatingButtons === "function") updateFloatingButtons();
  }
  function close() {
    var v = document.getElementById("view-qimen");
    if (v) v.hidden = true;
    document.getElementById("tab-home").classList.add("active");
    if (typeof updateFloatingButtons === "function") updateFloatingButtons();
  }
  document.addEventListener("DOMContentLoaded", function () {
    var e = document.getElementById("qimen-enter");
    if (e) e.addEventListener("click", open);
    var b = document.getElementById("qimen-back");
    if (b) b.addEventListener("click", close);
  });
})();
