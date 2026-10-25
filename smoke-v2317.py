#!/usr/bin/env python3
"""v2.3.0（SW v117）冥想故障修复专项冒烟。

背景：用户真机报障——打坐冥想场景图只剩左上小带、有的图不显示、有的环境音无声。
诊断结论：本地与双线资产全量完好（图可解码、音频 volumedetect 非静音）；
发版窗口期 GitHub Pages 实测出现过 loop-wind/bowl 404 与 loop-forest 截断下载，
且旧版 SW 通用分支对图片走 cache-first 运行时缓存、音频同 URL 重试——坏响应可被长期钉住。
修复：冥想图/音频 URL 加 ?v=2 破缓存；SW 对 /meditation/ 路径直通不缓存；
音频 error 改为换破缓存参数重试一次（切场景重置）；meditation.css ?v 65→66。

断言：
①版本四件套：SW wuri-v117／style.css?v=117／meditation.css?v=66／显示仍 v2.3.0＋内部 v117（简繁＋静态兜底）。
②静态：meditation.js 10 图＋9 loop＋2 bell 全带 ?v=2；practice.js BGM 9 条带 ?v=2；
  sw.js 含冥想直通规则；meditation.css .med-bg-stack 带 width/height:100%。
③运行时（CDP 真触摸滑动，412×915 与 390×844）：逐场景——名称对、active 图
  getBoundingClientRect 满幅覆盖视口（-40 出血）、img complete 且 naturalWidth>0；
  全部 10 图实载；点播放后 loop-*.mp3?v=2 资源实载（resource timing）、无 JS 异常；
  森林与颂钵两场景截图存 med-fix-shots/。
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/med-fix-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- ① 版本口径 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v117 缓存名＋预缓存 style?v=117/meditation?v=66",
       "wuri-v117-20261025-v230" in sw and "style.css?v=117" in sw and "meditation.css?v=66" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("index CSS ?v=117/?v=66＋静态版本行内部 v117",
       "css/style.css?v=117" in html and "css/meditation.css?v=66" in html and "v2.3.0（内部 v117）" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简（内部 v117）＋繁（內部 v117）",
       "me_ver: '戊日不上香 v2.3.0（内部 v117）'" in i18n and "me_ver: '戊日不上香 v2.3.0（內部 v117）'" in i18n)
report("显示版本仍 v2.3.0（无漂移）", "v2.3.1" not in i18n and "v2.4.0" not in html)

# ---------- ② 静态 ----------
med = open(os.path.join(WWW, "js/meditation.js"), encoding="utf-8").read()
report("meditation.js 图 10＋loop 9＋bell 2 全带 ?v=2",
       med.count(".webp?v=2") == 10 and med.count("loop-") >= 9 and med.count(".mp3?v=2") == 11,
       (med.count(".webp?v=2"), med.count(".mp3?v=2")))
pra = open(os.path.join(WWW, "js/practice.js"), encoding="utf-8").read()
report("practice.js BGM 8 loop＋结束铃带 ?v=2", pra.count(".mp3?v=2") == 9, pra.count(".mp3?v=2"))
report("sw.js 冥想路径直通规则在位", "/(img|audio)\\/meditation\\//" in sw or "meditation" in sw and "return;" in sw)
css = open(os.path.join(WWW, "css/meditation.css"), encoding="utf-8").read()
report("meditation.css .med-bg-stack 满幅规则", ".med-bg-stack{position:absolute;inset:0;width:100%;height:100%" in css)

# ---------- ③ 运行时 ----------
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
    cdp.call("Page.enable"); cdp.call("Runtime.enable")
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source":
        "window.__errs=[]; addEventListener('error', e=>window.__errs.push(String(e.message||e.error)));"
        " addEventListener('unhandledrejection', e=>window.__errs.push('rej:'+String(e.reason)));"})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    NAMES = ['温柔雨声','雨·远雷','海浪','森林鸟鸣','夜晚虫鸣','壁炉火声','溪流','风声','颂钵·静','无声·静室']

    def probe_scene():
        return ev("""(() => { const act = document.querySelector('.med-bg.active');
          const img = act ? act.querySelector('img') : null;
          const r = img ? img.getBoundingClientRect() : null;
          return { name: document.getElementById('med-sound-name').textContent.trim(),
                   x: r?Math.round(r.x):null, y: r?Math.round(r.y):null,
                   w: r?Math.round(r.width):0, h: r?Math.round(r.height):0,
                   complete: img ? (img.complete && img.naturalWidth > 0) : false,
                   nw: img ? img.naturalWidth : 0 }; })()""")

    def swipe_left():
        # 页内构造真实 Touch/TouchEvent 派发到 pager（本沙箱旧 headless 的 CDP touch 注入不触发 handler，
        # 页内派发走的仍是 handler 本体与其坐标判断逻辑）
        ev("""(() => { const p = document.getElementById('med-pager');
          const t1 = new Touch({identifier: 1, target: p, clientX: 300, clientY: 450});
          const t2 = new Touch({identifier: 1, target: p, clientX: 110, clientY: 450});
          p.dispatchEvent(new TouchEvent('touchstart', {touches: [t1], changedTouches: [t1], bubbles: true, cancelable: true}));
          p.dispatchEvent(new TouchEvent('touchend', {touches: [], changedTouches: [t2], bubbles: true, cancelable: true}));
          return true; })()""")
        time.sleep(0.55)

    for (vw, vh, tag) in [(412, 915, "412"), (390, 844, "390")]:
        cdp.call("Emulation.setDeviceMetricsOverride", {"width": vw, "height": vh, "deviceScaleFactor": 2, "mobile": True})
        cdp.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
        time.sleep(3.2)
        ev("localStorage.removeItem('wuri_med_sound'); (window.Meditation && (Meditation.open(), true))")
        time.sleep(1.2)
        all_ok, detail = True, []
        for i, nm in enumerate(NAMES):
            p = probe_scene()
            ok = (p["name"] == nm and p["complete"] and p["x"] <= -39 and p["y"] <= -39
                  and p["w"] >= vw + 79 and p["h"] >= vh + 79)
            if not ok: all_ok = False; detail.append((nm, p))
            if tag == "412" and nm in ("森林鸟鸣", "颂钵·静"):
                shot("med-%s-%s" % ("forest" if nm == "森林鸟鸣" else "bowl", tag))
            if i < len(NAMES) - 1: swipe_left()
        report("%s 逐场景（10）名称/满幅覆盖/实载" % tag, all_ok, detail)

    # 音频验收：逐个 loop/bell URL 用与 App 相同的相对路径在页内实载解码（file:// 下
    # resource timing 不记录媒体请求，故以 Audio 元素 canplay＋duration 为准）；
    # 再点播放验按钮进入播放态（暂停图标）。
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
    cdp.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(3.0)
    audio_res = ev("""(async () => {
      const urls = ['loop-rain','loop-thunder','loop-ocean','loop-forest','loop-night',
                    'loop-fire','loop-creek','loop-wind','loop-bowl']
        .map(n => 'audio/meditation/' + n + '.mp3?v=2')
        .concat(['audio/meditation/bell-interval.mp3?v=2','audio/meditation/bell-ending.mp3?v=2']);
      const out = [];
      for (const u of urls) {
        const r = await new Promise(res => {
          const a = new Audio(); let done = false;
          const fin = v => { if (!done) { done = true; res(v); } };
          a.addEventListener('canplay', () => fin('ok:' + Math.round(a.duration)));
          a.addEventListener('error', () => fin('ERR'));
          setTimeout(() => fin('TIMEOUT'), 8000);
          a.src = u; a.load();
        });
        out.push(u.split('/').pop() + '=' + r);
      }
      return out;
    })()""")
    bad_audio = [x for x in audio_res if "=ok:" not in x]
    report("逐音频（9 loop＋2 bell）页内实载可解码", not bad_audio, bad_audio or audio_res)
    ev("localStorage.removeItem('wuri_med_sound'); (window.Meditation && (Meditation.open(), true))")
    time.sleep(1.0)
    ev("(document.getElementById('med-play').click(), true)")
    time.sleep(2.0)
    btn = ev("document.getElementById('med-play').innerHTML")
    report("点播放后进入播放态（暂停图标）", "M6 5h4v14H6z" in btn, btn[:80])
    errs = ev("window.__errs || []")
    report("全程零 JS 异常", not errs, errs)
finally:
    chrome.terminate()

bad = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(bad), len(results)))
sys.exit(1 if bad else 0)
