#!/usr/bin/env python3
"""把「掌上乾坤·奇门遁甲助手 v3.2」(MIT, 作者 qzp001) 变换为戊日网页版适配版。

输入：~/workspace/wuri-app/qimen-eval/repo/src/*
输出：
  www/js/qimen-engine.js    引擎（历法换 lunar-javascript 精确节气；真太阳时改戊日口径：仅经度差、不计均时差）
  www/js/qimen-geju.js      格局引擎（原样）
  www/js/qimen-data.js      知识层（原样，仅修两处与戊日实情不符的文案）
  www/js/qimen-cases.js     典籍算例（原样）
  www/js/qimen-cal.js       新增：lunar-javascript 历法提供者（注册进引擎）
  www/js/qimen-render3d.js  渲染层（状态类从 <html> 迁到 #qm-root；元素改 qm- 前缀 id）
  www/js/qimen-app.js       UI（选择器作用域化到 #qm-root；id 全改 qm- 前缀；真太阳时接全站全局设置；删城市库/经度手填/历法基准/假寄宫选项的绑定；末尾附戊日入口开关适配）
  www/css/qimen.css         三份 CSS 合并并作用域化到 .qm-scope（:root→.qm-scope、html.*→.qm-scope.*、其余选择器加前缀）
  qimen-build/fragment.html 供插入 index.html #view-qimen 的内容片段（由 template.html 抽取改造）
  www/js/qimen-LICENSE.txt  原项目 MIT 许可证全文
"""
import os, re, sys

SRC = os.path.expanduser("~/workspace/wuri-app/qimen-eval/repo/src")
REPO = os.path.expanduser("~/workspace/wuri-app/qimen-eval/repo")
WWW = os.path.expanduser("~/workspace/wuri-web/www")
BUILD = os.path.expanduser("~/workspace/wuri-web/qimen-build")

IDS = ["btnLite", "wenGrid", "wenResult", "dt", "btnCast", "btnNow", "btnPrev", "btnNext",
       "kjToggle", "kjBody", "selDingju", "selPan", "selZishi", "selJigong", "selCalendar",
       "selCity", "lon", "btnLon", "kjNow", "solarInfo", "sizhu", "errBox", "meta", "metaPlain",
       "metaPro", "metaToggle", "warnBox", "tags", "grid", "gejuBox", "factorBox", "brief",
       "vsDim", "btnVs", "vsBox", "dictSearch", "dictList", "xueContent", "noUseList", "disList",
       "privacyNote", "ageNote", "notEvidence", "modal", "toast", "sky",
       "tab-wen", "tab-pan", "tab-vs", "tab-xue", "tab-gy", "healthBox", "goPan", "goVs",
       "shiChips", "shiResult"]
IDS.sort(key=len, reverse=True)

def rep(text, old, new, count=1, tag=""):
    n = text.count(old)
    assert n == count, f"[{tag}] 期望出现 {count} 次，实际 {n} 次：{old[:80]!r}"
    return text.replace(old, new)

def rename_ids_js(text):
    for i in IDS:
        text = re.sub(r'#' + re.escape(i) + r'(?![A-Za-z0-9_-])', '#qm-' + i, text)
        text = text.replace(f'getElementById("{i}")', f'getElementById("qm-{i}")')
        text = text.replace(f'id="{i}"', f'id="qm-{i}"')
        text = text.replace(f'id = "{i}"', f'id = "qm-{i}"')
    return text

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

def write(p, s):
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)
    print("wrote", p, len(s))

BANNER = ("/* ============================================================\n"
          " * 戊日不上香 · 奇门遁甲模块（适配版）\n"
          " * 原作：「掌上乾坤 · 奇门遁甲助手」v3.2，作者 qzp001，MIT License。\n"
          " * 许可证全文见同目录 qimen-LICENSE.txt；「我的 → 关于」页有鸣谢。\n"
          " * 戊日适配点见各文件头注与 qimen-build/build_qimen.py。\n"
          " * ============================================================ */\n")

# ================= engine.js =================
eng = read(os.path.join(SRC, "engine.js"))

eng = rep(eng,
"""  function termIndex(y, mo, d, h, mi) {
    const v = Math.floor((((sunLon(relJD(y, mo, d, h, mi)) + 45) % 360 + 360) % 360) / 15);
    return Math.max(0, Math.min(23, v));
  }""",
"""  function termIndex(y, mo, d, h, mi) {
    if (CAL && CAL.termIndex) return CAL.termIndex(y, mo, d, h, mi);
    const v = Math.floor((((sunLon(relJD(y, mo, d, h, mi)) + 45) % 360 + 360) % 360) / 15);
    return Math.max(0, Math.min(23, v));
  }""", tag="termIndex")

eng = rep(eng,
"""  function termStartJD(y, mo, d, h, mi) {
    const jd = relJD(y, mo, d, h, mi);""",
"""  function termStartJD(y, mo, d, h, mi) {
    if (CAL && CAL.termStartRelJD) return CAL.termStartRelJD(y, mo, d, h, mi);
    const jd = relJD(y, mo, d, h, mi);""", tag="termStartJD")

eng = rep(eng,
"""  function hoursToTermBoundary(y, mo, d, h, mi) {
    const cur = relJD(y, mo, d, h, mi);""",
"""  function hoursToTermBoundary(y, mo, d, h, mi) {
    if (CAL && CAL.termBounds) return CAL.termBounds(y, mo, d, h, mi);
    const cur = relJD(y, mo, d, h, mi);""", tag="hoursToTermBoundary")

# 真太阳时改戊日口径：只按经度差（每度 4 分钟），不计均时差；基准经线由 opts.baseLon 传入
eng = rep(eng,
"""  function toTrueSolar(y, mo, d, h, mi, lon) {
    const deltaMin = Math.round((lon - BASE_LON) * 4 + eqOfTime(y, mo, d));""",
"""  function toTrueSolar(y, mo, d, h, mi, lon, meridian) {
    const deltaMin = Math.round((lon - (meridian == null ? BASE_LON : meridian)) * 4);""", tag="toTrueSolar")
eng = rep(eng, "const t = toTrueSolar(y, mo, d, h, mi, +opts.lon);",
          "const t = toTrueSolar(y, mo, d, h, mi, +opts.lon, opts.baseLon);", tag="paipan-tst")

# 历法提供者挂钩（放在历法区之前：插到「结构化错误」段之前）
eng = rep(eng,
"""  /* ============ 结构化错误（M0-2） ============ */""",
"""  /* ============ 戊日适配：历法提供者 ============ *
   * 戊日全站以 lunar-javascript 为唯一历法源（干支/节气精确时刻）。
   * qimen-cal.js 在加载后调用 QM.setCalendarProvider() 注入实现：
   * termIndex / termStartRelJD / termBounds 全部改走精确交节时刻，
   * 替换原引擎的太阳视黄经近似公式（±15 分钟）。未注入时回落原公式。 */
  let CAL = null;
  function setCalendarProvider(p) { CAL = p || null; }

  /* ============ 结构化错误（M0-2） ============ */""", tag="cal-hook")

# 修复上游年柱边界 bug：冬至段 ti=21 跨年——1 月小寒前（仍在冬至段）应属上一年，
# 原式 (ti>=22) 会把 1/1–1/5 的年柱提前一年（上游测试无此窗口用例；戊日 lunar 对照抓出）
eng = rep(eng, "const yr = (ti >= 22) ? y - 1 : y;",
          "const yr = (ti >= 22 || (ti === 21 && mo === 1)) ? y - 1 : y;", count=2, tag="year-fix")

# 口径说明文案：去掉均时差表述
eng = rep(eng,
    'true:"真太阳时——按当地东经与均时差换算，可落入不同时辰。基准经线东经 120°。"',
    'true:"真太阳时——按当地经度与基准经线之差换算（每度 4 分钟，不计均时差），可落入不同时辰。经度与时间基准取自戊日「我的 → 设置」。"',
    tag="schema-tst")

# 导出提供者注册口
eng = rep(eng, "paipan, dashi, diffCharts, metadataOf, toTrueSolar,",
          "paipan, dashi, diffCharts, metadataOf, toTrueSolar, setCalendarProvider,", tag="api-export")

write(os.path.join(WWW, "js/qimen-engine.js"),
      BANNER + "/* 适配点：①历法经 setCalendarProvider 换 lunar-javascript 精确节气（见 qimen-cal.js）；\n"
      " * ②toTrueSolar 改为仅经度差修正（不计均时差），基准经线由调用方传入 opts.baseLon。\n"
      " * 其余排盘算法与原作一致。 */\n" + eng)

# ================= geju.js / cases.js（原样） =================
write(os.path.join(WWW, "js/qimen-geju.js"), BANNER + read(os.path.join(SRC, "geju.js")))
write(os.path.join(WWW, "js/qimen-cases.js"), BANNER + read(os.path.join(SRC, "cases.js")))

# ================= data.js（两处文案修正） =================
dat = read(os.path.join(SRC, "data.js"))
dat = rep(dat,
    '"不设付费墙、不卖「化解」「改运」类服务，全部功能由本地单文件提供"',
    '"不卖「化解」「改运」类服务；全部排盘在本机本地完成，不联网上传"', tag="data-nouser")
dat = rep(dat,
    'const PRIVACY_NOTE = "隐私与计算方式：本页面是单个 HTML 文件，"',
    'const PRIVACY_NOTE = "隐私与计算方式：本功能集成在「戊日不上香」中，"', tag="data-privacy")
write(os.path.join(WWW, "js/qimen-data.js"),
      BANNER + "/* 文案修正：NO_USE 一条与 PRIVACY_NOTE 首句按戊日集成实情改写（原作称单文件/不设付费墙）。 */\n" + dat)

# ================= qimen-cal.js（新增） =================
CAL_JS = BANNER + """/* 历法提供者：把引擎的节气/交节计算接到全站统一的 lunar-javascript。
 * - termIndex：取该时刻「上一个节气」的序号（引擎 TERMS 表顺序：立春=0 … 大寒=23）
 * - termStartRelJD：上一交节的精确时刻，换算成引擎 relJD 标尺
 * - termBounds：距上/下一交节的精确小时数（交节临界提示用）
 * 四柱干支仍由引擎按儒略日推算（与 lunar 输出逐项验证一致，见 qimen-build 测试）。 */
(function () {
  var root = (typeof window !== "undefined" ? window : globalThis);
  var Q = root.QM, Solar = root.Solar;
  if (!Q || !Solar || !Q.setCalendarProvider) return;
  var TERMS = Q.TERMS;
  function jdn(y, m, d) {
    var a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
         - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }
  function relJDOf(s) {
    return (jdn(s.getYear(), s.getMonth(), s.getDay()) - 2451545)
         + (s.getHour() + s.getMinute() / 60 + s.getSecond() / 3600 - 20) / 24;
  }
  function lunarAt(y, mo, d, h, mi) { return Solar.fromYmdHms(y, mo, d, h, mi, 0).getLunar(); }
  Q.setCalendarProvider({
    termIndex: function (y, mo, d, h, mi) {
      var name = lunarAt(y, mo, d, h, mi).getPrevJieQi().getName();
      var i = TERMS.indexOf(name);
      if (i < 0) throw new Error("未知节气名：" + name);
      return i;
    },
    termStartRelJD: function (y, mo, d, h, mi) {
      return relJDOf(lunarAt(y, mo, d, h, mi).getPrevJieQi().getSolar());
    },
    termBounds: function (y, mo, d, h, mi) {
      var l = lunarAt(y, mo, d, h, mi);
      var cur = (jdn(y, mo, d) - 2451545) + (h + mi / 60 - 20) / 24;
      var since = (cur - relJDOf(l.getPrevJieQi().getSolar())) * 24;
      var until = (relJDOf(l.getNextJieQi().getSolar()) - cur) * 24;
      return { since: since, until: until, near: Math.min(since, until) <= 1 };
    }
  });
})();
"""
write(os.path.join(WWW, "js/qimen-cal.js"), CAL_JS)

# ================= render3d.js =================
r3 = read(os.path.join(SRC, "render3d.js"))
r3 = rep(r3, '  "use strict";',
         '  "use strict";\n  /* 戊日适配：原作把 lite/no-3d/no-sky 状态类挂在 <html> 上，戊日里改挂 #qm-root */\n'
         '  function qmRoot() { return document.getElementById("qm-root"); }', tag="r3-helper")
n_doc_el = r3.count("document.documentElement")
assert n_doc_el >= 8, n_doc_el
r3 = r3.replace("document.documentElement", "qmRoot()")
r3 = r3.replace('document.querySelector(".plate")', 'qmRoot().querySelector(".plate")')
r3 = rename_ids_js(r3)
write(os.path.join(WWW, "js/qimen-render3d.js"), BANNER + r3)

# ================= app.js =================
app = read(os.path.join(SRC, "app.js"))

app = rep(app,
"""  const Q = window.QM, G = window.QMGEJU, D = window.QMDATA, CASES = window.QMCASES;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));""",
"""  const Q = window.QM, G = window.QMGEJU, D = window.QMDATA, CASES = window.QMCASES;
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
  }""", tag="app-scope")

# 错误边界：只在本视图可见时降级；状态类挂 ROOT
app = rep(app,
"""  function degradeToPlain(code, msg) {
    if (degraded) return;
    degraded = true;
    document.documentElement.classList.add("lite");
    document.documentElement.setAttribute("data-motion", "off");
    let el = document.getElementById("errBox");""",
"""  function degradeToPlain(code, msg) {
    if (degraded) return;
    const vw = document.getElementById("view-qimen");
    if (vw && vw.hidden) return;   /* 戊日适配：其他视图报错不触发本模块降级 */
    degraded = true;
    ROOT.classList.add("lite");
    ROOT.setAttribute("data-motion", "off");
    let el = ROOT.querySelector("#qm-errBox");""", tag="app-degrade")
app = rep(app, "请重新下载本文件（本地计算，无任何数据外发）", "请刷新页面重试（本地计算，无任何数据外发）", tag="app-degrade-txt")
app = rep(app, 'const main = document.querySelector("main");', "const main = ROOT;", tag="app-selfcheck-main")
app = rep(app, "，建议重新下载本文件。", "，建议刷新页面。", tag="app-selfcheck-txt")

# showTab 滚动目标改为视图容器
app = rep(app, "    window.scrollTo(0, 0);\n  }",
          "    const vw3 = document.getElementById(\"view-qimen\"); if (vw3) vw3.scrollTop = 0;\n  }", tag="app-showtab")

# currentOpts：经度改走全局设置
app = rep(app,
"""  function currentOpts() {
    const o = { dingju: CFG.dingju, pan: CFG.pan, zishi: CFG.zishi, jigong: CFG.jigong, calendar: CFG.calendar };
    const lon = parseFloat($("#lon") ? $("#lon").value : "");
    if (Number.isFinite(lon) && lon > 70 && lon < 140) o.lon = lon;
    return o;
  }""",
"""  function currentOpts() {
    const o = { dingju: CFG.dingju, pan: CFG.pan, zishi: CFG.zishi, jigong: CFG.jigong, calendar: CFG.calendar };
    const g = wuriSolarCfg();
    if (g) { o.lon = g.lon; o.baseLon = g.meridian; }
    return o;
  }
  function renderSolarInfo() {
    const box = $("#solarInfo");
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
  }""", tag="app-opts")

# renderKjNow：两处补 renderSolarInfo + 「北京时间」改「钟表时间」
app = rep(app,
    'if (!CHART) { box.textContent = CHART === null && LAST_ERROR ? "当前口径下排盘未完成。" : "请先起盘。"; return; }',
    'if (!CHART) { box.textContent = CHART === null && LAST_ERROR ? "当前口径下排盘未完成。" : "请先起盘。"; renderSolarInfo(); return; }',
    tag="app-kjnow1")
app = rep(app,
    '+ (m.calendar === "diti" ? "定气历" : "平气历") + " · " + (m.trueSolar === "true" ? "真太阳时" : "北京时间") + "</b>";\n  }',
    '+ (m.calendar === "diti" ? "定气历" : "平气历") + " · " + (m.trueSolar === "true" ? "真太阳时" : "钟表时间") + "</b>";\n    renderSolarInfo();\n  }',
    tag="app-kjnow2")

# 删除城市库/经度手填/历法基准的绑定（对应控件已从面板移除）
i = app.index('  bindSel("#selCalendar", "calendar", "历法基准");')
j = app.index('  $("#kjToggle")')
app = app[:i] + app[j:]
# 城市库填充块在 kjToggle 之后，单独删
i = app.index('  // 城市库\n')
j = app.index('  function renderKjNow()')
app = app[:i] + app[j:]
assert "#selCity" not in app and "#btnLon" not in app and "#selCalendar" not in app, "城市库绑定未删净"

# 流派对照·时间口径维度改戊日口径
app = rep(app,
"""    if (dim === "solar") return [
      { label: "北京时间", o: mk({ lon: null }) },
      { label: "真太阳时（当前经度）", o: mk({}) },
      { label: "东经 120°（基准）", o: mk({ lon: 120 }) }
    ];""",
"""    if (dim === "solar") return [
      { label: "戊日全局设置（真太阳时）", o: mk({}) },
      { label: "钟表时间（不换算）", o: mk({ lon: null }) },
      { label: "东经 120° 标准时", o: mk({ lon: 120, baseLon: 120 }) }
    ];""", tag="app-vs-solar")

# 交节临界提示文案：节气已是精确值
app = rep(app,
    "本引擎节气精度约 ±15 分钟，该窗口内不同历法可能差一局。",
    "节气已按全站历法库的精确交节时刻计算；不同历法口径在此窗口内仍可能差一局。", tag="app-warn")

# 问事卡里的「北京时间」兜底改「钟表时间」
app = rep(app, '" · 北京时间"', '" · 钟表时间"', tag="app-wen-bj")

app = rename_ids_js(app)
app = rep(app, 'e.target.id === "modal"', 'e.target.id === "qm-modal"', tag="app-modal-target")
app = rep(app, 'p.id === "tab-" + t', 'p.id === "qm-tab-" + t', tag="app-tabid")

NAV_ADAPTER = """

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
"""
write(os.path.join(WWW, "js/qimen-app.js"), BANNER + app + NAV_ADAPTER)

# ================= CSS 作用域化 =================
def scope_css(text):
    # 注释先剥离（避免注释里的括号干扰规则解析；版式注释不保留）
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    for i in IDS:
        text = re.sub(r'#' + re.escape(i) + r'(?![A-Za-z0-9_-])', '#qm-' + i, text)
    text = text.replace("html.no-sky", ".qm-scope.no-sky")
    text = text.replace("html.no-3d", ".qm-scope.no-3d")
    text = text.replace("html.lite", ".qm-scope.lite")
    text = text.replace('html[data-motion="off"]', '.qm-scope[data-motion="off"]')
    text = text.replace(":root", ".qm-scope")
    # body 规则 → 容器规则
    text = re.sub(r'(^|[}{])\s*body\s*\{', r'\1.qm-scope {', text)
    # 两处通配重置先行定点改写，避免误伤全站
    text = text.replace("* { box-sizing: border-box; margin: 0; padding: 0; }",
                        ".qm-scope, .qm-scope *, .qm-scope *::before, .qm-scope *::after { box-sizing: border-box; margin: 0; padding: 0; }")
    text = text.replace("*, *::before, *::after {",
                        ".qm-scope *, .qm-scope *::before, .qm-scope *::after {")
    out = []
    i, n = 0, len(text)
    stack = []  # 'group' | 'keyframes' | 'rule'
    buf = ""
    while i < n:
        ch = text[i]
        if ch == "{":
            pre = buf.strip(); buf = ""
            low = pre.lower()
            if low.startswith("@media") or low.startswith("@supports"):
                out.append(pre + " {"); stack.append("group")
            elif low.startswith("@keyframes") or low.startswith("@-webkit-keyframes"):
                out.append(pre + " {"); stack.append("keyframes")
            elif low.startswith("@"):
                out.append(pre + " {"); stack.append("rule")
            elif stack and stack[-1] == "keyframes":
                out.append(pre + " {"); stack.append("rule")
            else:
                sels = []
                for s in pre.split(","):
                    s = s.strip()
                    if not s:
                        continue
                    if s.startswith(".qm-scope"):
                        sels.append(s)
                    else:
                        sels.append(".qm-scope " + s)
                out.append(", ".join(sels) + " {"); stack.append("rule")
            i += 1
        elif ch == "}":
            out.append(buf + "}"); buf = ""
            if stack:
                stack.pop()
            i += 1
        elif ch == ";" and not stack or (ch == ";" and stack and stack[-1] != "rule"):
            out.append(buf + ";"); buf = ""; i += 1
        else:
            buf += ch; i += 1
    if buf.strip():
        out.append(buf)
    return "".join(out)

css = ""
for fn in ["style.css", "tokens.css", "components.css"]:
    css += scope_css(read(os.path.join(SRC, fn))) + "\n"
ADAPTER_CSS = """
/* ===== 戊日适配层：外壳对接（本段为戊日新增，非原作样式） ===== */
#view-qimen.view { background: #0B0E14; }
#view-qimen .appbar { border-bottom: 1px solid rgba(212, 175, 55, .35); }
#view-qimen .appbar .brand-title { color: #E8E2D0; }
#view-qimen .mini-btn { color: #D4AF37; border: 1px solid rgba(212, 175, 55, .5); background: rgba(20, 26, 38, .72); }
#view-qimen .jing-back-fab { background: rgba(20, 26, 38, .88); color: #D4AF37; border: 1px solid rgba(212, 175, 55, .5); }
.qm-scope { position: relative; background: transparent; }
.qm-scope nav .linkbtn { margin-left: auto; align-self: center; }
"""
write(os.path.join(WWW, "css/qimen.css"), BANNER.replace("/* ", "/* ").replace("*/", "*/") + css + ADAPTER_CSS)

# ================= fragment.html =================
tpl = read(os.path.join(SRC, "template.html"))
def seg(a, b, t=tpl):
    i = t.index(a); j = t.index(b, i) + len(b); return t[i:j]
frag = seg('<canvas id="sky"', '</svg>') + "\n"
nav = seg("<nav>", "</nav>")
nav = nav.replace("</nav>", '  <button id="btnLite" class="linkbtn" aria-pressed="false" title="关闭星空与光效，降低耗电">动效：开</button>\n</nav>')
frag += nav + "\n"
main = seg("<main>", "</main>")
main = main[len("<main>"):-len("</main>")]
frag += main + "\n"
assert '<div id="modal"><div class="sheet"></div></div>' in tpl
frag += '<div id="modal"><div class="sheet"></div></div>' + "\n"
frag += '<div id="toast"></div>\n'

# 口径面板删减：历法基准、真太阳时城市选择两项 fld；经度手填行；假寄宫两项
frag = rep(frag, """          <label class="fld">中五宫寄宫
            <select id="selJigong">
              <option value="kun2">寄坤二宫（最通行）</option>
              <option value="erba">寄二八宫</option>
              <option value="siwei">寄四维随时令</option>
              <option value="fei">飞盘不寄</option>
            </select>
          </label>""",
"""          <label class="fld">中五宫寄宫
            <select id="selJigong">
              <option value="kun2">寄坤二宫（最通行）</option>
              <option value="fei">飞盘不寄</option>
            </select>
          </label>""", tag="frag-jigong")
i = frag.index('<label class="fld">历法基准')
j = frag.index("</label>", frag.index('<label class="fld">真太阳时')) + len("</label>")
frag = frag[:i] + frag[j + 1:]
i = frag.index('<div class="controls" style="margin-top:8px">')
j = frag.index('<div id="kjNow"')
frag = frag[:i] + frag[j:]
frag = rep(frag, '<div id="kjNow" class="kj-now dim"></div>',
           '<div id="kjNow" class="kj-now dim"></div>\n        <div id="solarInfo" class="kj-now dim"></div>', tag="frag-solarinfo")
frag = rep(frag, "定气历 · 北京时间。", "定气历 · 真太阳时随戊日全站时间基准设置。", tag="frag-gy-default")
frag = rep(frag,
    "公历 → 儒略日（JDN），以 1949-10-01 甲子日为锚点推干支；\n    太阳视黄经定节气（本引擎精度约 ±15 分钟，恰逢交节前后 15 分钟内会主动提示）；按《阴阳遁局数表》起局；",
    "干支与节气取自与戊日全站一致的历法库（lunar-javascript），交节时刻为精确值；\n    恰逢交节前后一小时内会主动提示；按《阴阳遁局数表》起局；", tag="frag-gy-cal")
frag = rep(frag,
    "可从城市库选择或手填东经度数，按经度时差 4 分/度 + 均时差方程换算。\n    校正后若跨时辰或跨日会明确提示。基准经线固定东经 120°。",
    "随戊日全站时间基准设置（「我的 → 设置」）换算——按经度与基准经线之差、每度 4 分钟，不计均时差。\n    校正后若跨时辰或跨日会明确提示。", tag="frag-gy-tst")
frag = rep(frag, "工具，不设付费墙、不提供任何", "工具，不提供任何", tag="frag-gy-fee")
frag_ids = rename_ids_js(frag)
# 模板里的 header/footer 已剔除；hero 封面图与 BUILD_ID 不进戊日
write(os.path.join(BUILD, "fragment.html"), frag_ids)

# ================= LICENSE =================
write(os.path.join(WWW, "js/qimen-LICENSE.txt"), read(os.path.join(REPO, "LICENSE")))
print("BUILD OK")
