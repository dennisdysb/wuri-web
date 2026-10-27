#!/usr/bin/env python3
"""相机认星·标签密度三档＋拍照洁净 专项冒烟（worktree www + CDP + 假相机/注入姿态）：
胶囊在位与文案、三档循环（智能→全标→精简→智能）与各档标签数/构成断言、
localStorage wuri_sky_label_mode_v1 持久化（重载恢复）、三档截图、
拍照合成洁净（中心十字臂带奶油色像素：预览画布应 >0、照片应 ≈0）、
红光态胶囊同规、无 JS 异常、零溢出。
沙箱边界同 skyar210：姿态合成注入、相机为 Chrome 假设备，真机手感不在覆盖内。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web-arlabel/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web-arlabel/arlabel-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 静态断言 ----------
arjs = open(os.path.join(WWW, "js/sky-ar.js"), encoding="utf-8").read()
report("静态：状态键/三档/大星官表/forPhoto 在位", all(x in arjs for x in
       ["wuri_sky_label_mode_v1", "MAJOR_LABELS", "forPhoto", "ar-labelchip", "'smart'", "'all'", "'major'"]))
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("静态：i18n 新键简繁各一份", i18n.count("sx2_ar_label_all") == 2 and i18n.count("sx2_ar_label_major") == 2)
css = open(os.path.join(WWW, "css/style.css"), encoding="utf-8").read()
report("静态：胶囊样式＋红光变体", ".ar-labelchip" in css and ".ar-stage.red .ar-labelchip" in css)

chrome = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                           "--allow-file-access-from-files",
                           "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
                           "--remote-debugging-port=%d" % PORT, "about:blank"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    ws_url = None
    for _ in range(40):
        try:
            targets = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=3))
            pages = [t for t in targets if t.get("type") == "page"]
            if pages:
                ws_url = pages[0]["webSocketDebuggerUrl"]; break
        except Exception:
            pass
        time.sleep(0.5)
    assert ws_url, "chrome CDP 未就绪"
    cdp = base.CDP(base.ws_connect(ws_url))
    cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def waitfor(js, timeout=25.0, step=0.4):
        end = time.time() + timeout
        while time.time() < end:
            if ev(js): return True
            time.sleep(step)
        return False

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        import base64
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    def mouse(x, y, kind, btn="left", click_count=1):
        cdp.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": btn, "clickCount": click_count})

    def click_el(sel):
        r = ev("(() => { const el = document.querySelector('%s'); if (!el) return null; const b = el.getBoundingClientRect(); return {x: b.x + b.width/2, y: b.y + b.height/2}; })()" % sel)
        assert r, "找不到元素 " + sel
        mouse(r["x"], r["y"], "mousePressed"); mouse(r["x"], r["y"], "mouseReleased")
        time.sleep(0.6)

    def open_ar_and_start():
        ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 1.2)
        assert waitfor("!!document.querySelector('[data-sxar=\"open\"]')"), "AR 入口未注入"
        ev("document.querySelector('[data-sxar=\"open\"]').click(); true", 0.5)
        ev("document.querySelector('#ar-panel [data-ar=\"start\"]').click(); true", 0.3)
        assert waitfor("window.WuriSkyAR && WuriSkyAR._state().running"), "AR 未运行"
        ev("window.WuriSkyAR._injectPose(135, 115, 0); true", 1.6)

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    ev("localStorage.removeItem('wuri_sky_label_mode_v1'); localStorage.setItem('wuri_pro_redeem', '1'); true")

    open_ar_and_start()
    st = ev("window.WuriSkyAR._state()")
    chip = ev("(() => { const c = document.getElementById('ar-labelchip'); return c ? {hidden: c.hidden, text: c.textContent} : null; })()")
    report("胶囊露面＋默认智能", chip and not chip["hidden"] and chip["text"] == "标签：智能" and st["labelMode"] == "smart", (chip, st.get("labelMode")))
    L_smart = len([x for x in st["labels"] if x.get("key")])
    report("智能档有星官标签", L_smart >= 3, L_smart)
    shot("mode-smart-390")

    # ---------- 全标 ----------
    click_el("#ar-labelchip")
    st = ev("window.WuriSkyAR._state()")
    chip = ev("document.getElementById('ar-labelchip').textContent")
    saved = ev("localStorage.getItem('wuri_sky_label_mode_v1')")
    L_all = len([x for x in st["labels"] if x.get("key")])
    report("全标：文案/状态/存档一致且标签不少于智能", chip == "标签：全标" and st["labelMode"] == "all" and saved == "all" and L_all >= L_smart,
           (chip, st["labelMode"], saved, L_smart, L_all))
    shot("mode-all-390")
    # 全标的实质＝无视星等阈值：默认 6 等下星官最亮星几乎全过阈、两档接近；
    # 把星等压到 3 等后智能应锐减、全标应纹丝不动（magLim 逐帧读档、免重开）
    ev("localStorage.setItem('wuri_sky_maglim_v1', '3'); true", 1.2)
    L_all3 = len([x for x in ev("window.WuriSkyAR._state()")["labels"] if x.get("key")])
    report("全标@星等3：不受阈值影响（与 6 等时持平）", L_all3 == L_all, (L_all, L_all3))

    # ---------- 精简 ----------
    click_el("#ar-labelchip")
    time.sleep(0.8)
    st = ev("window.WuriSkyAR._state()")
    chip = ev("document.getElementById('ar-labelchip').textContent")
    MAJOR = set("角 亢 氐 房 心 尾 箕 斗 牛 女 虚 危 室 壁 奎 娄 胃 昴 毕 觜 参 井 鬼 柳 星 张 翼 轸 紫微左垣 紫微右垣 太微左垣 太微右垣 天市左垣 天市右垣".split())
    names = [x["key"].split("|")[1] for x in st["labels"] if x.get("key")]
    L_major = len(names)
    report("精简：文案/状态一致、标签只剩大星官且少于智能",
           chip == "标签：精简" and st["labelMode"] == "major" and 1 <= L_major < L_smart and all(n in MAJOR for n in names),
           (chip, st["labelMode"], names))
    shot("mode-major-390")

    # ---------- 循环回智能 ----------
    click_el("#ar-labelchip")
    st = ev("window.WuriSkyAR._state()")
    L_smart3 = len([x for x in st["labels"] if x.get("key")])
    report("三档循环闭合回智能", st["labelMode"] == "smart" and ev("localStorage.getItem('wuri_sky_label_mode_v1')") == "smart", st["labelMode"])
    report("智能@星等3：受阈值约束锐减（小于全标同场数）", 1 <= L_smart3 < L_all3, (L_smart3, L_all3))
    ev("localStorage.removeItem('wuri_sky_maglim_v1'); true", 1.0)

    # ---------- 拍照洁净（十字臂带奶油像素：预览 >0、照片 ≈0） ----------
    ARMCOUNT = """(src) => { const img = src; const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height; const x = c.getContext('2d');
      x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
      const cx = Math.floor(c.width/2), cy = Math.floor(c.height/2), ratio = c.width / img.dataset.cssw;
      let n = 0;
      const probe = (px, py) => { const i = (py * c.width + px) * 4;
        if (d[i] > 235 && d[i+1] > 222 && d[i+2] > 185 && d[i+3] > 90) n++; };
      for (let o = Math.round(3*ratio); o <= Math.round(9*ratio); o++)
        for (let w = -Math.round(ratio); w <= Math.round(ratio); w++) {
          probe(cx - o, cy + w); probe(cx + o, cy + w); probe(cx + w, cy - o); probe(cx + w, cy + o); }
      return n; }"""
    counts = ev("""(async () => {
      const cv = document.getElementById('ar-canvas');
      const prev = new Image(); await new Promise(r => { prev.onload = r; prev.src = cv.toDataURL(); });
      prev.dataset.cssw = cv.clientWidth;
      const url = await window.WuriSkyAR._captureDataURL();
      if (!url) return {err: 'capture null'};
      const pho = new Image(); await new Promise(r => { pho.onload = r; pho.src = url; });
      pho.dataset.cssw = cv.clientWidth;
      window.__capurl = url;
      const f = %s;
      return {prev: f(prev), photo: f(pho), pw: prev.width, cw: pho.width};
    })()""" % ARMCOUNT)
    report("拍照洁净：预览十字在位（臂带计数 >0）", counts and counts.get("prev", 0) > 0, counts)
    report("拍照洁净：照片无十字（臂带计数 ≤2）", counts and counts.get("photo", 99) <= 2, counts)
    # 存下照片原图备查
    ev("""(() => { const a = document.createElement('a'); a.href = window.__capurl; a.download = 'x'; return true; })()""")
    import base64 as _b64
    dataurl = ev("window.__capurl")
    if dataurl and "," in dataurl:
        open(os.path.join(SHOTS, "capture-photo.png"), "wb").write(_b64.b64decode(dataurl.split(",", 1)[1]))

    # ---------- 持久化：重载恢复全标 ----------
    click_el("#ar-labelchip")  # smart -> all
    ev("window.WuriSkyAR._stop(); true", 0.3)
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    open_ar_and_start()
    st = ev("window.WuriSkyAR._state()")
    chip = ev("document.getElementById('ar-labelchip').textContent")
    report("重载后档位恢复为全标", st["labelMode"] == "all" and chip == "标签：全标", (st["labelMode"], chip))

    # ---------- 红光态 ----------
    ev("document.querySelector('.ar-bar [data-ar=\"red\"]').click(); true", 0.4)
    redok = ev("document.getElementById('ar-stage').classList.contains('red') && !document.getElementById('ar-labelchip').hidden")
    report("红光态：舞台红谱＋胶囊仍在位", redok)
    shot("mode-red-390")
    ev("document.querySelector('.ar-bar [data-ar=\"red\"]').click(); true", 0.3)

    report("390：AR 页零横向溢出",
           ev("document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1"))
    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    report("全程无 JS 异常", len(excs) == 0, json.dumps(excs)[:300] if excs else "")
finally:
    chrome.terminate()

bad = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(bad), len(results)))
if bad:
    print("FAILED:", bad); sys.exit(1)
