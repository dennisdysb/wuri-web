#!/usr/bin/env python3
"""v2.1.1 (1) 专项冒烟：姿态事件源修复（deviceorientationabsolute）。

真机事故（2026-10-24 夜，vivo/安卓 Chrome）：AR 对准月亮 HUD 方位
272°→178°→265° 乱跳（真值 129°），高度却分毫不差；同机自带指南针读
131° 无误。根因：旧管线只监听相对事件 deviceorientation（α 零点任意、
陀螺积分漂移）并当罗盘绝对角用；换算矩阵本身经锚点验算无误。旧冒烟
全部走 _injectPose 注入 (az,alt)/(a,b,g) 结果层，绕过了「原始方向事件
→位姿」这段真实链路，故从未抓到。

本冒烟从**原始事件层**注入：用 window.dispatchEvent 派发真实的
DeviceOrientationEvent（相对/绝对/iOS 风格三类），断言：
①相对事件绝不产生 pose（relSeen 在位、hasPose=false）、HUD 出「相对
  朝向不可靠」提示；②绝对事件多姿态解算：正北直立 (0,90,0)→az0/alt0、
  正东直立 (270,90,0)→az90、朝东南仰 43° 对月姿态 (229,133,0)→
  az131/alt43（即真机事故姿态的真值）、标签产出；③相对事件不得覆盖
  已建立的绝对 pose；④横屏（屏幕角 90°）下同一姿态中心方位/高度不变、
  极点投影偏移方向转 90°；⑤星图跟随共享管线：相对事件航向恒 null、
  绝对事件航向 ≈131；⑥关闭重开后零点不继承（相对仍拒、绝对同值复现，
  误差 ≤0.5°）；⑦带 webkitCompassHeading 的 iOS 风格事件被信任且生效。
沙箱边界同前：相机为 captureStream 图案帧替身；真机最终确认须用户复测。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/v2111-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 静态断言 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v106 缓存名", "wuri-v106-20261024-v211-1" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("四件套：CSS ?v=106＋版本 v2.1.1 (1)", "css/style.css?v=106" in html and "v2.1.1 (1)" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简繁 v2.1.1 (1)", i18n.count("v2.1.1 (1)") >= 2)
report("relnav 文案简繁齐", i18n.count("sx2_ar_relnav") >= 2)
arjs = open(os.path.join(WWW, "js/sky-ar.js"), encoding="utf-8").read()
report("绝对事件监听＋信任判定在位",
       "deviceorientationabsolute" in arjs and "webkitCompassHeading" in arjs and "ingestOri" in arjs)
report("相对事件不再直写 pose（onOri 走 ingest）",
       "function onOri(e) { ingestOri(e, false); }" in arjs)

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

    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    assert waitfor("!!window.WuriSkyAR && !!document.querySelector('#tabbar button[data-tab=\"tab-stars\"]')")
    open_ar()

    # ---- T1 相对事件：绝不产生 pose、relSeen 在位、HUD 明示不可靠 ----
    fire("deviceorientation", 10, 133, 0, abs_=False)
    time.sleep(0.6)
    st = state()
    report("[事件层] 相对事件不产生 pose", st.get("hasPose") is False and st.get("absSeen") is False, st)
    report("[事件层] 相对事件被标记 relSeen", st.get("relSeen") is True, st)
    ok_hud = waitfor("document.getElementById('ar-hud').textContent.indexOf('相对朝向') >= 0", timeout=8)
    report("[事件层] HUD 明示相对朝向不可靠", ok_hud, ev("document.getElementById('ar-hud').textContent"))

    # ---- T2 绝对事件·对月姿态 (229,133,0) → az131/alt43、标签产出 ----
    fire("deviceorientationabsolute", 229, 133, 0, abs_=True)
    ok_lbl = waitfor("window.WuriSkyAR._state().labels.length > 0", timeout=15)
    st = state()
    report("[事件层] 绝对事件产生 pose＋标签", st.get("hasPose") is True and ok_lbl, st.get("labels"))
    report("[事件层] 对月姿态方位 ≈131（真值）", st.get("centerAz") is not None and abs(st["centerAz"] - 131) <= 1.0, st.get("centerAz"))
    report("[事件层] 对月姿态高度 ≈43（真值）", st.get("centerAlt") is not None and abs(st["centerAlt"] - 43) <= 1.0, st.get("centerAlt"))
    pole_t2 = st.get("polePoint")
    az_t2 = st.get("centerAz")
    shot("ar-moon-abs-390")

    # ---- T3 相对事件不得覆盖已建立的绝对 pose ----
    fire("deviceorientation", 0, 0, 0, abs_=False)
    time.sleep(0.8)
    st = state()
    report("[事件层] 相对事件不覆盖绝对 pose", st.get("centerAz") is not None and abs(st["centerAz"] - 131) <= 1.0, st.get("centerAz"))

    # ---- T4/T5 绝对事件·正北/正东直立 ----
    fire("deviceorientationabsolute", 0, 90, 0, abs_=True)
    time.sleep(0.8)
    st = state()
    report("[事件层] 正北直立 az≈0/alt≈0",
           st.get("centerAz") is not None and min(st["centerAz"], 360 - st["centerAz"]) <= 1.0 and abs(st["centerAlt"]) <= 1.0,
           (st.get("centerAz"), st.get("centerAlt")))
    fire("deviceorientationabsolute", 270, 90, 0, abs_=True)
    time.sleep(0.8)
    st = state()
    report("[事件层] 正东直立 az≈90/alt≈0",
           st.get("centerAz") is not None and abs(st["centerAz"] - 90) <= 1.0 and abs(st["centerAlt"]) <= 1.0,
           (st.get("centerAz"), st.get("centerAlt")))

    # ---- T6 横屏：屏幕角 90°，同姿态中心 az/alt 不变、极点偏移转 90° ----
    try:
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True,
                  "screenOrientation": {"type": "landscapePrimary", "angle": 90}})
    except Exception:
        pass
    ang = ev("window.screen && screen.orientation ? screen.orientation.angle : -1")
    if ang != 90:
        ev("(() => { try { Object.defineProperty(window.ScreenOrientation.prototype, 'angle', { configurable: true, get: function () { return 90; } }); } catch (e) {} return true; })()")
        ang = ev("window.screen.orientation.angle")
    report("[事件层] 横屏屏幕角置 90", ang == 90, ang)
    fire("deviceorientationabsolute", 229, 133, 0, abs_=True)
    time.sleep(0.8)
    st = state()
    pole_t6 = st.get("polePoint")
    report("[事件层] 横屏同姿态中心 az/alt 不变",
           st.get("centerAz") is not None and abs(st["centerAz"] - 131) <= 1.0 and abs(st["centerAlt"] - 43) <= 1.0,
           (st.get("centerAz"), st.get("centerAlt")))
    rot_ok = False
    # polePoint 是 drawScene 工作坐标（CSS px），以画布中心为原点比偏移方向角
    dims = ev("(() => { const c = document.getElementById('ar-canvas'); return { w: c.clientWidth, h: c.clientHeight }; })()")
    # 注：pole_t2 在竖屏同尺寸下取得；横屏仅改屏幕角、舞台尺寸不变，可直接比偏移方向
    if pole_t2 and pole_t6 and dims:
        import math
        cx, cy = dims["w"] / 2, dims["h"] / 2
        a1 = math.degrees(math.atan2(pole_t2["y"] - cy, pole_t2["x"] - cx))
        a2 = math.degrees(math.atan2(pole_t6["y"] - cy, pole_t6["x"] - cx))
        d = abs((a2 - a1 + 180) % 360 - 180)
        rot_ok = abs(d - 90) <= 5
    report("[事件层] 横屏极点偏移方向转 ≈90°", bool(rot_ok), (pole_t2, pole_t6))
    try:
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    except Exception:
        pass

    # ---- T7 星图跟随共享管线：相对→零发射、绝对新姿态→新航向 ----
    ev("window.__heads = []; window.WuriSkyAR._watchHeading(function (h) { window.__heads.push(h); }); true", 0.3)
    n0 = len(ev("window.__heads") or [])
    fire("deviceorientation", 0, 0, 0, abs_=False)
    time.sleep(0.5)
    heads = ev("window.__heads") or []
    report("[跟随] 相对事件零航向发射", len(heads) == n0, (n0, heads))
    fire("deviceorientationabsolute", 270, 90, 0, abs_=True)
    time.sleep(0.5)
    heads = ev("window.__heads") or []
    last = heads[-1] if heads else None
    report("[跟随] 绝对新姿态航向 ≈90（活管线）", len(heads) > n0 and last is not None and abs(last - 90) <= 1.5, (n0, last))
    fire("deviceorientationabsolute", 229, 133, 0, abs_=True)
    time.sleep(0.5)
    heads = ev("window.__heads") or []
    last = heads[-1] if heads else None
    report("[跟随] 绝对对月姿态航向 ≈131", last is not None and abs(last - 131) <= 1.5, last)
    ev("window.WuriSkyAR._unwatchHeading(function () {}); true")  # 退订匿名无效亦无妨，页面将重开

    # ---- T8 关闭重开：零点不继承、绝对同值复现 ----
    ev("window.WuriSkyAR._stop(); true", 0.3)
    ev("document.getElementById('sky-ar-back').click(); true", 0.5)
    open_ar()
    fire("deviceorientation", 10, 133, 0, abs_=False)
    time.sleep(0.6)
    st = state()
    report("[重开] 相对事件仍被拒（零点不继承）", st.get("hasPose") is False and st.get("relSeen") is True, st)
    fire("deviceorientationabsolute", 229, 133, 0, abs_=True)
    ok_lbl = waitfor("window.WuriSkyAR._state().labels.length > 0", timeout=15)
    st = state()
    report("[重开] 绝对同姿态方位复现（与首开差 ≤0.5°）",
           ok_lbl and st.get("centerAz") is not None and az_t2 is not None and abs(st["centerAz"] - az_t2) <= 0.5,
           (st.get("centerAz"), az_t2))

    # ---- T9 iOS 风格事件（webkitCompassHeading 在位）被信任 ----
    fire("deviceorientation", 270, 90, 0, abs_=False, compass=90)
    time.sleep(0.8)
    st = state()
    report("[事件层] iOS 风格事件被信任并生效（az 转 90）",
           st.get("centerAz") is not None and abs(st["centerAz"] - 90) <= 1.0, st.get("centerAz"))

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    logerr = [e for e in cdp.events if e.get("method") == "Log.entryAdded" and e.get("params", {}).get("entry", {}).get("level") == "error"]
    report("全程无 JS 异常", len(excs) == 0 and len(logerr) == 0, (excs + logerr)[:1])
finally:
    chrome.terminate()

fails = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(fails), len(results)))
if fails: print("FAIL:", fails)
sys.exit(1 if fails else 0)
