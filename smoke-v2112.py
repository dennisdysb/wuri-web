#!/usr/bin/env python3
"""v2.1.1 (2) 专项冒烟：对齐两层（WMM2025 磁偏角自动修正＋一键天体对齐）。

背景：v2.1.1 (1) 修好事件源后真机复测（2026-10-24 21:48 对月）HUD 读
方位 158°/高度 45°，引擎真值 137.9°/47.1°——方位残差大头是磁偏角：
安卓 deviceorientationabsolute 的 α 以磁北为零点（蒙特利尔一带磁偏角
现约 −13.7°，WMM2025 官方模型；民间「约 15°W」为旧值），余数是罗盘
本身误差，靠第二层一键对齐收尾。

断言（全部从原始 DeviceOrientationEvent 事件层注入，延续 v2111 纪律）：
①磁偏角函数值域：St-Hubert ∈ [−14.2,−13.2]、伦敦 ∈ [0.2,2.2]、
  悉尼 ∈ [11.8,13.8]；NCEI 官方测试点 2025.0：(80,0)=1.28、(0,120)=
  −0.16、(−80,240)=68.78（±0.15，240° 与 −120° 同经线）。
②安卓绝对事件（磁北口径 α）→ pose 方位被磁偏角修正：正北姿态读
  ≈360+δ、对月姿态 (229,133,0) 读 ≈131+δ（δ 取页面 declination 现场值）。
③iOS 风格事件（webkitCompassHeading 在位）不被二次修正：读数仍 ≈90。
④对齐全流程：注入读数偏（方位 −20°、高度 +2°）的绝对姿态 → AR 里点
  「对齐」→ 目标表月亮置顶 → 选月亮 → 指引态（.guide 紧凑条）→ 点
  「已对准」→ 存储偏移 ≈(−20,+2)（容差 1.5°）、src.body=moon、HUD 出
  「已对齐·月亮」、月亮标记回到画面中心附近（≤25px）。
⑤过大偏差（方位 −100°）点「已对准」被拒：存储不落盘（仍为④的值）、
  HUD 出「偏差过大」提示。
⑥「对星归零」后存储偏移清零、src 清除。
沙箱边界：相机为 captureStream 图案帧替身；真机罗盘实测精度须用户复测。
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/v2112-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 静态断言 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v108 缓存名", "wuri-v108-20261025-v211-3" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("四件套：CSS ?v=107＋版本 v2.1.1 (2)", "css/style.css?v=108" in html and "v2.1.1 (3)" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简繁 v2.1.1 (2)", i18n.count("v2.1.1 (3)") >= 2)
report("对齐文案简繁齐", i18n.count("sx2_ar_aligned") >= 2 and i18n.count("sx2_ar_align_too_big") >= 2
       and i18n.count("sx2_ar_align_guide") >= 2)
eng = open(os.path.join(WWW, "js/sky-engine.js"), encoding="utf-8").read()
report("引擎 declination＋WMM2025 系数表在位", "declination: declination" in eng and "WMM2025" in eng and "-29351.8" in eng)
arjs = open(os.path.join(WWW, "js/sky-ar.js"), encoding="utf-8").read()
report("磁偏角 ingest＋对齐流程在位", "oriSource" in arjs and "currentDecl" in arjs
       and "alignpick" in arjs and "doAlign" in arjs and "wuri_sky_ar_cal_v1" in arjs)

STUB = r"""
(() => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const x = c.getContext('2d');
  x.fillStyle = '#3a4a3a'; x.fillRect(0, 0, 640, 480);
  x.fillStyle = '#d8e2c8'; x.fillRect(270, 190, 100, 100);
  const stream = c.captureStream(30);
  const md = { getUserMedia: async () => stream };
  try { Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true }); }
  catch (e) { navigator.mediaDevices = md; }
  window.__fireOri = (type, a, b, g, abs, compass) => {
    let ev = null;
    try { ev = new DeviceOrientationEvent(type, { alpha: a, beta: b, gamma: g, absolute: !!abs }); } catch (e) {}
    if (!ev || ev.alpha == null) {
      ev = document.createEvent('Event'); ev.initEvent(type, true, true);
      ev.alpha = a; ev.beta = b; ev.gamma = g; ev.absolute = !!abs;
    }
    if (compass != null) {
      try { Object.defineProperty(ev, 'webkitCompassHeading', { value: compass }); }
      catch (e) { try { ev.webkitCompassHeading = compass; } catch (e2) {} }
    }
    window.dispatchEvent(ev);
    return { alpha: ev.alpha, absolute: ev.absolute, compass: ev.webkitCompassHeading };
  };
})();
"""

chrome = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                           "--allow-file-access-from-files",
                           "--remote-debugging-port=%d" % PORT, "about:blank"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    ws_url = None
    for _ in range(40):
        try:
            targets = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=3))
            pages = [t for t in targets if t.get("type") == "page"]
            if pages: ws_url = pages[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    assert ws_url, "chrome CDP 未就绪"
    cdp = base.CDP(base.ws_connect(ws_url))
    cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": STUB})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def waitfor(js, timeout=20.0, step=0.4):
        end = time.time() + timeout
        while time.time() < end:
            if ev(js): return True
            time.sleep(step)
        return False

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    def fire(typ, a, b, g, abs_=None, compass=None, n=3):
        for _ in range(n):
            ev("window.__fireOri(%s, %s, %s, %s, %s, %s); true" % (
                json.dumps(typ), a, b, g,
                "true" if abs_ else "false",
                "null" if compass is None else compass))
            time.sleep(0.12)

    def state():
        return ev("window.WuriSkyAR._state()") or {}

    def open_ar():
        ev("document.querySelector('#tabbar button[data-tab=\"tab-stars\"]').click(); true", 1.0)
        assert waitfor("!document.getElementById('sx-ar-fab').hidden")
        ev("document.getElementById('sx-ar-fab').click(); true", 0.5)
        assert waitfor("!!document.querySelector('#ar-panel [data-ar=\"start\"]')")
        ev("document.querySelector('#ar-panel [data-ar=\"start\"]').click(); true", 0.3)
        assert waitfor("window.WuriSkyAR._state().running")

    def angdiff(x, y):
        return abs((x - y + 180) % 360 - 180)

    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    assert waitfor("!!window.WuriSkyAR && !!window.WuriSky && !!WuriSky.declination")
    # 干净起点：清掉校准与观测地存档（默认 St-Hubert）
    ev("localStorage.removeItem('wuri_sky_ar_cal_v1'); localStorage.removeItem('wuri_sky_obs_v1'); true")

    # ---- ① 磁偏角函数值域＋官方测试点 ----
    dv = ev("(() => { const D = WuriSky.declination, now = new Date(); return {"
            " hub: D(45.5044, -73.3974, now), hubEng: D(45.5122, -73.4253, now),"
            " lon: D(51.5074, -0.1278, now), syd: D(-33.8688, 151.2093, now),"
            " t1: D(80, 0, new Date(2025,0,1)), t2: D(0, 120, new Date(2025,0,1)),"
            " t3: D(-80, -120, new Date(2025,0,1)) }; })()") or {}
    report("① St-Hubert 磁偏角 ∈ [−14.2,−13.2]", -14.2 <= dv.get("hub", 0) <= -13.2 and -14.2 <= dv.get("hubEng", 0) <= -13.2, dv)
    report("① 伦敦磁偏角 ∈ [0.2,2.2]", 0.2 <= dv.get("lon", -9) <= 2.2, dv.get("lon"))
    report("① 悉尼磁偏角 ∈ [11.8,13.8]", 11.8 <= dv.get("syd", -9) <= 13.8, dv.get("syd"))
    report("① NCEI 官方测试点 (80,0)=1.28", abs(dv.get("t1", 99) - 1.28) <= 0.15, dv.get("t1"))
    report("① NCEI 官方测试点 (0,120)=−0.16", abs(dv.get("t2", 99) + 0.16) <= 0.15, dv.get("t2"))
    report("① NCEI 官方测试点 (−80,240)=68.78", abs(dv.get("t3", 99) - 68.78) <= 0.15, dv.get("t3"))
    DECL = dv.get("hubEng")

    open_ar()

    # ---- ② 安卓绝对事件：方位被磁偏角修正 ----
    fire("deviceorientationabsolute", 0, 90, 0, abs_=True)
    time.sleep(0.8)
    st = state()
    exp_north = (360 + DECL) % 360
    report("② 正北姿态读数 ≈360+δ（磁偏角已修正）",
           st.get("centerAz") is not None and angdiff(st["centerAz"], exp_north) <= 1.5,
           (st.get("centerAz"), exp_north, DECL))
    report("② _state 暴露当前磁偏角", st.get("decl") is not None and abs(st["decl"] - DECL) <= 0.05, st.get("decl"))
    fire("deviceorientationabsolute", 229, 133, 0, abs_=True)
    time.sleep(0.8)
    st = state()
    exp_moon = (131 + DECL) % 360
    report("② 对月姿态方位 ≈131+δ", st.get("centerAz") is not None and angdiff(st["centerAz"], exp_moon) <= 1.5,
           (st.get("centerAz"), exp_moon))
    report("② 对月姿态高度 ≈43（不受磁偏角影响）", st.get("centerAlt") is not None and abs(st["centerAlt"] - 43) <= 1.0, st.get("centerAlt"))

    # ---- ③ iOS 风格事件：不二次修正 ----
    fire("deviceorientation", 270, 90, 0, abs_=False, compass=90)
    time.sleep(0.8)
    st = state()
    report("③ iOS 事件方位 ≈90（未被磁偏角二次修正）",
           st.get("centerAz") is not None and abs(st["centerAz"] - 90) <= 1.0, st.get("centerAz"))

    # ---- ④ 一键对齐全流程 ----
    moon = ev("(() => { const o = WuriSky.DEFAULT_OBS; const p = WuriSky.bodyPos(new Date(), o, 'moon');"
              " return p ? { alt: p.alt, az: p.az } : null; })()")
    assert moon and moon["alt"] > 5, "月亮不在地平线上方，无法跑对齐流程: %s" % moon
    # 读数目标：方位 = 月亮真方位 −20、高度 = 真高度 +2。
    # 事件 α 与读数关系（γ=0、竖屏）：读方位 = −(α − δ)、读高度 = β − 90。
    a_inj = (20 - moon["az"] + DECL) % 360
    b_inj = 92 + moon["alt"]
    fire("deviceorientationabsolute", round(a_inj, 2), round(b_inj, 2), 0, abs_=True)
    okc = waitfor("window.WuriSkyAR._state().centerAz != null", timeout=10)
    time.sleep(0.6)
    st = state()
    report("④ 注入姿态读数偏（方位 −20）", okc and st.get("centerAz") is not None
           and angdiff(st["centerAz"], (moon["az"] - 20) % 360) <= 1.5, (st.get("centerAz"), moon))
    report("④ 注入姿态读数偏（高度 +2）", st.get("centerAlt") is not None and abs(st["centerAlt"] - (moon["alt"] + 2)) <= 1.5,
           (st.get("centerAlt"), moon["alt"]))
    dims = ev("(() => { const c = document.getElementById('ar-canvas'); return { w: c.clientWidth, h: c.clientHeight }; })()")
    def moon_off():
        st2 = state()
        for b in st2.get("bodies") or []:
            if b.get("id") == "moon":
                return abs(b["x"] - dims["w"] / 2), abs(b["y"] - dims["h"] / 2)
        return None
    off0 = moon_off()
    report("④ 对齐前月亮标记明显偏离中心（>60px）", off0 is not None and max(off0) > 60, off0)
    # 点「对齐」钮（先验最上层命中＝钮自身，按真点击纪律）
    hit = ev("(() => { const b = document.querySelector('#sx-ar [data-ar=\"align\"]'); if (!b) return false;"
             " const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);"
             " return el === b || b.contains(el); })()")
    report("④ 「对齐」钮最上层可点", hit is True)
    ev("document.querySelector('#sx-ar [data-ar=\"align\"]').click(); true", 0.4)
    first = ev("document.querySelector('#ar-panel [data-ar=\"alignpick\"]') ? "
               "document.querySelector('#ar-panel [data-ar=\"alignpick\"]').getAttribute('data-id') : null")
    report("④ 目标表面板打开且月亮置顶", first == "moon", first)
    has_moon_alt = ev("(() => { const b = document.querySelector('#ar-panel [data-ar=\"alignpick\"][data-id=\"moon\"]');"
                      " return b ? b.textContent.indexOf('月亮') >= 0 : false; })()")
    report("④ 月亮目标钮带名称与高度", has_moon_alt is True)
    ev("document.querySelector('#ar-panel [data-ar=\"alignpick\"][data-id=\"moon\"]').click(); true", 0.4)
    guide = ev("(() => { const p = document.getElementById('ar-panel');"
               " return { guide: p.classList.contains('guide'), tgt: window.WuriSkyAR._state().alignTarget,"
               "          txt: p.textContent }; })()") or {}
    report("④ 指引态：紧凑条＋目标=月亮＋文案含目标名", guide.get("guide") is True and guide.get("tgt") == "moon"
           and "月亮" in (guide.get("txt") or ""), guide)
    shot("ar-align-guide-390")
    ev("document.querySelector('#ar-panel [data-ar=\"alignok\"]').click(); true", 0.3)
    saved = ev("JSON.parse(localStorage.getItem('wuri_sky_ar_cal_v1') || 'null')") or {}
    report("④ 存储偏移 ≈(−20,+2)（容差 1.5°）", abs(saved.get("az", 99) + 20) <= 1.5 and abs(saved.get("alt", 99) - 2) <= 1.5, saved)
    report("④ 存储附来源 src.body=moon", (saved.get("src") or {}).get("body") == "moon", saved.get("src"))
    hud_ok = waitfor("document.getElementById('ar-hud').textContent.indexOf('已对齐') >= 0 && "
                     "document.getElementById('ar-hud').textContent.indexOf('月亮') >= 0", timeout=3)
    report("④ HUD 明示「已对齐·月亮（方位…高度…)」", hud_ok, ev("document.getElementById('ar-hud').textContent"))
    time.sleep(0.8)
    off1 = moon_off()
    report("④ 对齐后月亮标记回到画面中心附近（≤25px）", off1 is not None and off1[0] <= 25 and off1[1] <= 25, off1)
    shot("ar-aligned-390")

    # ---- ⑤ 过大偏差被拒 ----
    a_big = (100 - moon["az"] + DECL) % 360
    fire("deviceorientationabsolute", round(a_big, 2), round(90 + moon["alt"], 2), 0, abs_=True)
    time.sleep(0.7)
    st = state()
    report("⑤ 注入大偏差姿态（方位 −100）", st.get("centerAz") is not None
           and angdiff(st["centerAz"], (moon["az"] - 100) % 360) <= 1.5, st.get("centerAz"))
    ev("document.querySelector('#sx-ar [data-ar=\"align\"]').click(); true", 0.4)
    ev("document.querySelector('#ar-panel [data-ar=\"alignpick\"][data-id=\"moon\"]').click(); true", 0.3)
    ev("document.querySelector('#ar-panel [data-ar=\"alignok\"]').click(); true", 0.3)
    saved2 = ev("JSON.parse(localStorage.getItem('wuri_sky_ar_cal_v1') || 'null')") or {}
    report("⑤ 过大偏差被拒、存储未落盘（仍为④的值）",
           abs(saved2.get("az", 99) + 20) <= 1.5 and abs(saved2.get("alt", 99) - 2) <= 1.5, saved2)
    hud2 = waitfor("document.getElementById('ar-hud').textContent.indexOf('偏差过大') >= 0", timeout=3)
    report("⑤ HUD 出「偏差过大」提示", hud2, ev("document.getElementById('ar-hud').textContent"))

    # ---- ⑥ 对星归零清零 ----
    ev("document.querySelector('#sx-ar [data-ar=\"calreset\"]').click(); true", 0.3)
    saved3 = ev("JSON.parse(localStorage.getItem('wuri_sky_ar_cal_v1') || 'null')") or {}
    report("⑥ 对星归零后偏移清零且 src 清除",
           saved3.get("az") == 0 and saved3.get("alt") == 0 and not saved3.get("src"), saved3)

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    logerr = [e for e in cdp.events if e.get("method") == "Log.entryAdded" and e.get("params", {}).get("entry", {}).get("level") == "error"]
    report("全程无 JS 异常", len(excs) == 0 and len(logerr) == 0, (excs + logerr)[:1])
finally:
    chrome.terminate()

fails = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(fails), len(results)))
if fails: print("FAIL:", fails)
sys.exit(1 if fails else 0)
