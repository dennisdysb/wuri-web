#!/usr/bin/env python3
"""神仙缘分测试端到端冒烟：入口卡→答题→中途退出续答→结果→分享卡→重测清进度；
与 Python 模型（affinity_model.py）同向量对拍主缘；390/412 × 日/夜，零溢出、零 JS 异常。
用法: python3 qimen-build/smoke_affinity.py — 截图落 qimen-build/shots-aff/"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import affinity_model as AM  # 五边形对拍基准（同答卷同数值）

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port
WWW = os.path.expanduser("~/workspace/wuri-web/www")
URL = "file://" + WWW + "/index.html"
OUT = os.path.expanduser("~/workspace/wuri-web/qimen-build/shots-aff")
os.makedirs(OUT, exist_ok=True)
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))
    if not ok: fails.append(name)

def boot(width, theme):
    port = free_port()
    chrome = subprocess.Popen(["/opt/meta-chromium/chrome", "--headless=old", "--no-sandbox", "--disable-gpu",
        "--allow-file-access-from-files", f"--remote-debugging-port={port}",
        "--remote-debugging-address=127.0.0.1", f"--window-size={width},1000", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for _ in range(50):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2) as r:
                pages = json.loads(r.read())
            ws_url = pages[0]["webSocketDebuggerUrl"]; break
        except Exception:
            time.sleep(0.4)
    cdp = CDP(WS(ws_url))
    cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
    cdp.call("Emulation.setDeviceMetricsOverride",
             {"width": width, "height": 915, "deviceScaleFactor": 2, "mobile": True})
    cdp.call("Page.addScriptToEvaluateOnNewDocument",
             {"source": "window.__errs=[]; window.addEventListener('error', function(e){ window.__errs.push(String(e.message||e.error)); });"})
    cdp.call("Page.navigate", {"url": URL})
    time.sleep(3.5)
    ev = lambda expr: cdp.evaluate(expr)
    if theme == "night":
        ev("document.documentElement.setAttribute('data-theme','night'), true")
    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(OUT, name + ".png"), "wb").write(base64.b64decode(r["data"]))
    return chrome, cdp, ev, shot

def overflow_of(ev, vid):
    return ev(f"(() => {{ const v = document.getElementById('{vid}'); return v.scrollWidth - v.clientWidth; }})()")

def answer_all(ev, vec):
    for oi in vec:
        ev(f"document.querySelectorAll('#affinity-opts .aff-opt')[{oi}].click(), true")
        time.sleep(0.12)

# ---------------- 日间 412：全流程 + 对拍 ----------------
chrome, cdp, ev, shot = boot(412, "day")
try:
    ev("document.getElementById('deities-enter').click(), true")
    time.sleep(0.4)
    st = ev("""(() => { const e = document.getElementById('affinity-entry');
      const g = document.querySelector('.deity-group-title');
      return { listVis: !document.getElementById('view-deities').hidden,
               entryTop: e.getBoundingClientRect().top, groupTop: g.getBoundingClientRect().top,
               btn: document.getElementById('affinity-enter').textContent }; })()""")
    check("[day412] 图鉴列表打开", st["listVis"])
    check("[day412] 入口卡在分组标题之上", st["entryTop"] < st["groupTop"], st)
    check("[day412] 入口按钮=开始测试", st["btn"] == "开始测试", st["btn"])
    check("[day412] 图鉴页零横向溢出", overflow_of(ev, "view-deities") <= 0)

    ev("document.getElementById('affinity-enter').click(), true"); time.sleep(0.3)
    st = ev("""(() => ({ vis: !document.getElementById('view-affinity').hidden,
      step: document.getElementById('affinity-step').textContent,
      nopts: document.querySelectorAll('#affinity-opts .aff-opt').length,
      q: document.getElementById('affinity-q').textContent }))()""")
    check("[day412] 答题页打开·第1题·4选项", st["vis"] and st["step"] == "第 1 / 12 题" and st["nopts"] == 4, st)

    answer_all(ev, [0, 0, 0, 0, 0])  # 答 5 题
    st = ev("document.getElementById('affinity-step').textContent")
    check("[day412] 答5题后到第6题", st == "第 6 / 12 题", st)
    ev("document.getElementById('affinity-back').click(), true"); time.sleep(0.3)
    st = ev("""(() => ({ quizHidden: document.getElementById('view-affinity').hidden,
      sub: document.getElementById('affinity-entry-sub').textContent,
      btn: document.getElementById('affinity-enter').textContent,
      ls: localStorage.getItem('wuri_affinity_progress') }))()""")
    check("[day412] 中途退出·进度已存", st["quizHidden"] and st["ls"] and json.loads(st["ls"])["a"] == [0]*5, st["ls"])
    check("[day412] 入口显示已答5题/继续测试", "已答 5 / 12 题" in st["sub"] and st["btn"] == "继续测试", st)

    ev("document.getElementById('affinity-enter').click(), true"); time.sleep(0.3)
    st = ev("""(() => ({ step: document.getElementById('affinity-step').textContent,
      resumed: !document.getElementById('affinity-resumed').hidden,
      resumedTxt: document.getElementById('affinity-resumed').textContent }))()""")
    check("[day412] 续答恢复到第6题+横幅", st["step"] == "第 6 / 12 题" and st["resumed"] and "第 6 题" in st["resumedTxt"], st)
    check("[day412] 答题页零横向溢出", overflow_of(ev, "view-affinity") <= 0)
    shot("quiz-day-412")

    answer_all(ev, [0, 0, 0, 0, 0, 0, 0])  # 补完 → 全A
    time.sleep(0.4)
    st = ev("""(() => ({ vis: !document.getElementById('view-affinity-result').hidden,
      main: document.getElementById('aff-main-name').textContent,
      why: document.getElementById('aff-main-why').textContent,
      subs: document.querySelectorAll('.aff-sub-card').length,
      subNames: Array.from(document.querySelectorAll('.aff-sub-name')).map(e=>e.textContent),
      honest: document.querySelector('.aff-honest').textContent,
      prog: localStorage.getItem('wuri_affinity_progress'),
      res: localStorage.getItem('wuri_affinity_result') }))()""")
    check("[day412] 结果页打开·进度已清", st["vis"] and st["prog"] is None, st["vis"])
    check("[day412] 全A主缘=保生大帝（与模型对拍）", st["main"] == "保生大帝", st["main"])
    check("[day412] 次缘=药王,神农大帝（与模型对拍）", st["subNames"] == ["药王", "神农大帝"], st["subNames"])
    check("[day412] 相合说明非空且引职掌", len(st["why"]) > 30 and "职掌" in st["why"], st["why"][:60])
    check("[day412] 诚实标注含现代创作+信效度", "现代创作" in st["honest"] and "信效度" in st["honest"])
    check("[day412] 结果页零横向溢出", overflow_of(ev, "view-affinity-result") <= 0)
    shot("result-day-412")

    st = ev("""(() => { const r = document.getElementById('aff-radar');
      return { u: r && r.dataset.user, d: r && r.dataset.deity,
        lg: document.getElementById('aff-radar-deity-name').textContent }; })()""")
    _bid = next(d["id"] for d in AM.TAGS["deities"] if d["name"] == "保生大帝")
    _eu, _ed = AM.radar_user([0] * 12), AM.radar_deity(_bid)
    _ju = [float(x) for x in st["u"].split(",")] if st["u"] else []
    _jd = [float(x) for x in st["d"].split(",")] if st["d"] else []
    check("[day412] 五边形用户值与模型对拍（全A）",
          len(_ju) == 5 and all(abs(a - b) <= 0.011 for a, b in zip(_ju, _eu)), (_ju, _eu))
    check("[day412] 五边形神祇值与模型对拍（保生大帝）",
          len(_jd) == 5 and all(abs(a - b) <= 0.011 for a, b in zip(_jd, _ed)), (_jd, _ed))
    check("[day412] 五边形图例含主缘名号", "保生大帝" in (st["lg"] or ""), st["lg"])

    ev("document.getElementById('aff-share').click(), true"); time.sleep(1.2)
    st = ev("""(() => { const m = document.getElementById('affinity-share-modal');
      const img = document.getElementById('affinity-share-img');
      return { vis: !m.hidden, srcHead: (img.src||'').slice(0,22), nw: img.naturalWidth, nh: img.naturalHeight }; })()""")
    check("[day412] 分享卡生成（带码版 PNG 750×1450）", st["vis"] and st["srcHead"].startswith("data:image/png") and st["nw"] == 750 and st["nh"] == 1450, st)
    shot("share-day-412")
    ev("document.getElementById('affinity-share-close').click(), true")

    ev("document.getElementById('aff-share-xhs').click(), true"); time.sleep(1.2)
    st = ev("""(() => { const m = document.getElementById('affinity-share-modal');
      const img = document.getElementById('affinity-share-img');
      return { vis: !m.hidden, srcHead: (img.src||'').slice(0,22), nw: img.naturalWidth, nh: img.naturalHeight }; })()""")
    check("[day412] 小红书版分享卡生成（无码 PNG 750×1450）", st["vis"] and st["srcHead"].startswith("data:image/png") and st["nw"] == 750 and st["nh"] == 1450, st)
    shot("share-xhs-day-412")
    ev("document.getElementById('affinity-share-close').click(), true")

    ev("document.getElementById('aff-retake').click(), true"); time.sleep(0.3)
    st = ev("""(() => ({ quiz: !document.getElementById('view-affinity').hidden,
      step: document.getElementById('affinity-step').textContent,
      res: localStorage.getItem('wuri_affinity_result') }))()""")
    check("[day412] 再测一次清结果回第1题", st["quiz"] and st["step"] == "第 1 / 12 题" and st["res"] is None, st)

    answer_all(ev, [2]*12)  # 全C → 月老
    time.sleep(0.4)
    st = ev("document.getElementById('aff-main-name').textContent")
    check("[day412] 全C主缘=月老（与模型对拍）", st == "月老", st)
    ev("document.getElementById('affinity-result-back').click(), true"); time.sleep(0.2)
    answer_all(ev, [])  # no-op
    # 纯悟道画像对拍：清掉结果再走入口重测
    ev("document.getElementById('affinity-enter').click(), true"); time.sleep(0.3)  # 有结果→结果页
    ev("document.getElementById('aff-retake').click(), true"); time.sleep(0.3)
    answer_all(ev, [3, 2, 1, 2, 2, 2, 3, 2, 2, 0, 2, 1])
    time.sleep(0.4)
    st = ev("document.getElementById('aff-main-name').textContent")
    check("[day412] 悟道画像主缘=东华帝君（与模型对拍）", st == "东华帝君", st)
    errs = ev("window.__errs")
    check("[day412] 零 JS 异常", errs == [], errs)
finally:
    chrome.terminate()

# ---------------- 夜间 390：快速全程 + 截图 ----------------
chrome, cdp, ev, shot = boot(390, "night")
try:
    ev("document.getElementById('deities-enter').click(), true"); time.sleep(0.4)
    ev("document.getElementById('affinity-enter').click(), true"); time.sleep(0.3)
    check("[night390] 答题页零横向溢出", overflow_of(ev, "view-affinity") <= 0)
    shot("quiz-night-390")
    answer_all(ev, [1]*12)  # 全B → 魁星（2026-10-22 权重调整后，模型对拍）
    time.sleep(0.4)
    st = ev("""(() => ({ vis: !document.getElementById('view-affinity-result').hidden,
      main: document.getElementById('aff-main-name').textContent,
      subs: document.querySelectorAll('.aff-sub-card').length }))()""")
    check("[night390] 全B主缘=魁星（与模型对拍）", st["vis"] and st["main"] == "魁星" and st["subs"] == 2, st)
    check("[night390] 结果页零横向溢出", overflow_of(ev, "view-affinity-result") <= 0)
    shot("result-night-390")
    errs = ev("window.__errs")
    check("[night390] 零 JS 异常", errs == [], errs)
finally:
    chrome.terminate()

# ---------------- 日间 390：入口+结果截图 ----------------
chrome, cdp, ev, shot = boot(390, "day")
try:
    ev("document.getElementById('deities-enter').click(), true"); time.sleep(0.4)
    shot("deities-day-390")
    ev("document.getElementById('affinity-enter').click(), true"); time.sleep(0.3)
    answer_all(ev, [3]*12)  # 全D → 骊山老母
    time.sleep(0.4)
    st = ev("document.getElementById('aff-main-name').textContent")
    check("[day390] 全D主缘=骊山老母（与模型对拍）", st == "骊山老母", st)
    check("[day390] 结果页零横向溢出", overflow_of(ev, "view-affinity-result") <= 0)
    shot("result-day-390")
    errs = ev("window.__errs")
    check("[day390] 零 JS 异常", errs == [], errs)
finally:
    chrome.terminate()

# ---------------- 页眉几何：三档宽度标题与两钮零重叠、钮位不漂移（2026-10-22 修复验收） ----------------
HDR_JS = """(() => { const R = el => { const b = el.getBoundingClientRect();
    return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; };
  const back = R(document.getElementById('%s')), title = R(document.querySelector('#%s .brand-title'));
  const rstEl = document.getElementById('affinity-restart');
  return { back, title, rst: rstEl ? R(rstEl) : null, vw: window.innerWidth }; })()"""
def hdr_check(tag, g, vw, with_rst):
    check(f"[{tag}] 页眉左钮贴左缘(12px)", abs(g["back"]["l"] - 12) <= 1.5, g["back"])
    check(f"[{tag}] 页眉标题不压左钮", g["title"]["l"] >= g["back"]["r"] - 0.5, g)
    check(f"[{tag}] 页眉标题全幅在视口内", g["title"]["l"] >= 0 and g["title"]["r"] <= vw + 0.5, g["title"])
    if with_rst:
        check(f"[{tag}] 页眉标题不压右钮「从头开始」", g["title"]["r"] <= g["rst"]["l"] + 0.5, g)
        check(f"[{tag}] 页眉右钮贴右缘(12px)", abs(g["rst"]["r"] - (vw - 12)) <= 1.5, g["rst"])

for W in (360, 390, 412):
    chrome, cdp, ev, shot = boot(W, "day")
    try:
        ev("document.getElementById('deities-enter').click(), true"); time.sleep(0.4)
        ev("document.getElementById('affinity-enter').click(), true"); time.sleep(0.3)
        ev("document.getElementById('affinity-restart').hidden = false, true")  # 强制右钮在场再量
        g = ev(HDR_JS % ("affinity-back", "view-affinity"))
        hdr_check(f"hdr{W}", g, W, True)
        shot(f"quiz-hdr-{W}")
        answer_all(ev, [0]*12); time.sleep(0.4)  # 走到结果页量其页眉（左钮+标题，无右钮）
        g2 = ev(HDR_JS % ("affinity-result-back", "view-affinity-result"))
        hdr_check(f"hdrRes{W}", g2, W, False)
        errs = ev("window.__errs")
        check(f"[hdr{W}] 零 JS 异常", errs == [], errs)
    finally:
        chrome.terminate()

# 夜间 390 页眉（夜间字距 .34em 亦须被覆盖）
chrome, cdp, ev, shot = boot(390, "night")
try:
    ev("document.getElementById('deities-enter').click(), true"); time.sleep(0.4)
    ev("document.getElementById('affinity-enter').click(), true"); time.sleep(0.3)
    ev("document.getElementById('affinity-restart').hidden = false, true")
    g = ev(HDR_JS % ("affinity-back", "view-affinity"))
    hdr_check("hdrNight390", g, 390, True)
    shot("quiz-hdr-night-390")
finally:
    chrome.terminate()

# ---------------- 日间 412：六位原「从未主缘」贴题画像对拍（2026-10-22 权重调整验收） ----------------
NEW_PERSONAS = [
    ("南极长生大帝", [1, 0, 1, 0, 1, 1, 3, 0, 0, 1, 1, 0]),
    ("太阳星君",     [1, 3, 0, 0, 1, 2, 1, 2, 0, 2, 1, 0]),
    ("酆都大帝",     [1, 2, 3, 1, 0, 0, 1, 2, 1, 3, 0, 2]),
    ("北斗星君",     [1, 1, 2, 1, 1, 0, 2, 0, 0, 3, 3, 2]),
    ("王灵官",       [1, 3, 1, 1, 0, 3, 2, 0, 0, 0, 0, 3]),
    ("太岁殷元帅",   [1, 2, 0, 0, 2, 0, 0, 1, 0, 3, 1, 1]),
]
chrome, cdp, ev, shot = boot(412, "day")
try:
    ev("document.getElementById('deities-enter').click(), true"); time.sleep(0.4)
    ev("document.getElementById('affinity-enter').click(), true"); time.sleep(0.3)
    for i, (want, vec) in enumerate(NEW_PERSONAS):
        if i > 0:
            ev("document.getElementById('aff-retake').click(), true"); time.sleep(0.3)
        answer_all(ev, vec)
        time.sleep(0.4)
        st = ev("document.getElementById('aff-main-name').textContent")
        check(f"[personas] 画像主缘={want}（与模型对拍）", st == want, st)
    errs = ev("window.__errs")
    check("[personas] 零 JS 异常", errs == [], errs)
finally:
    chrome.terminate()

print("\n==== " + ("ALL PASS" if not fails else f"FAILURES: {fails}") + " ====")
raise SystemExit(1 if fails else 0)
