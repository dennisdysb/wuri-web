#!/usr/bin/env python3
"""缘分测试「可分享结果页」冒烟：
A. 静态专属页抽 5 页 × 390/412：OG/title/CTA 在位、整屏海报、无横向溢出、截图；
B. App 分享三路：系统分享(navigator.share mock)、复制链接(clipboard stub+toast)、
   分享结果在无 share 环境回退复制；生成分享卡入口与小红书提示行在位；
C. 深链 ?yuanfen=1 落地打开图鉴视图。
路径按脚本位置推导（worktree/主仓都可跑）。截图落 qimen-build/shots-share/"""
import base64
import importlib.util
import json
import os
import subprocess
import time
import urllib.request

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, "www")
OUT = os.path.join(ROOT, "qimen-build", "shots-share")
os.makedirs(OUT, exist_ok=True)
fails = []


def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))
    if not ok:
        fails.append(name)


def boot(width, inject=None):
    port = free_port()
    chrome = subprocess.Popen(
        ["/opt/meta-chromium/chrome", "--headless=old", "--no-sandbox", "--disable-gpu",
         "--allow-file-access-from-files", f"--remote-debugging-port={port}",
         "--remote-debugging-address=127.0.0.1", f"--window-size={width},1000", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for _ in range(50):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2) as r:
                pages = json.loads(r.read())
            ws_url = pages[0]["webSocketDebuggerUrl"]
            break
        except Exception:
            time.sleep(0.4)
    cdp = CDP(WS(ws_url))
    cdp.call("Page.enable")
    cdp.call("Runtime.enable")
    cdp.call("Log.enable")
    cdp.call("Emulation.setDeviceMetricsOverride",
             {"width": width, "height": 915, "deviceScaleFactor": 2, "mobile": True})
    src = "window.__errs=[]; window.addEventListener('error', function(e){ window.__errs.push(String(e.message||e.error)); });"
    if inject:
        src += inject
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": src})
    ev = lambda expr: cdp.evaluate(expr)

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(OUT, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    return chrome, cdp, ev, shot


def nav(cdp, url, wait=2.2):
    cdp.call("Page.navigate", {"url": url})
    time.sleep(wait)


def do(ev, expr):
    """动作型表达式（click/setItem/reload 等无返回值）统一包成返回 true，避免 CDP evaluate 形状报错。"""
    return ev(f"(() => {{ {expr}; return true; }})()")


# ---------------- A. 静态分享页 ----------------
PAGES = ["baosheng", "fengdu", "taisui", "mazu", "zaojun"]
deities = {d["id"]: d for d in json.load(open(os.path.join(WWW, "content", "deities.json")))["deities"]}
for width in (412, 390):
    chrome, cdp, ev, shot = boot(width)
    try:
        for slug in PAGES:
            d = deities[slug]
            nav(cdp, "file://" + os.path.join(WWW, "yuanfen", slug + ".html"))
            info = ev("""(() => {
              const g = p => { const m = document.querySelector('meta[property="' + p + '"]'); return m ? m.getAttribute('content') : null; };
              const cta = document.querySelector('a.cta');
              const fr = document.querySelector('.frame').getBoundingClientRect();
              return { title: document.title, ogt: g('og:title'), ogi: g('og:image'), ogu: g('og:url'),
                       ogd: g('og:description'), tw: !!document.querySelector('meta[name="twitter:card"]'),
                       cta: cta ? cta.getAttribute('href') : null,
                       sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
                       fh: Math.round(fr.height), ih: window.innerHeight,
                       imgOk: (() => { const i = document.querySelector('.imgbox img'); return i && i.complete && i.naturalWidth > 0; })() };
            })()""")
            tag = f"A[{slug}@{width}]"
            check(tag + " title", info["title"] == f"我的神仙缘分：{d['name']} · 戊日不上香", info["title"])
            check(tag + " og:title", info["ogt"] == f"我的神仙缘分：{d['name']}")
            check(tag + " og:image", info["ogi"] == f"https://wuri.shengboyu.ca/img/deities/{d['image']}", info["ogi"])
            check(tag + " og:url", info["ogu"] == f"https://wuri.shengboyu.ca/yuanfen/{slug}.html")
            check(tag + " og:desc+twitter", bool(info["ogd"]) and info["tw"])
            check(tag + " CTA", info["cta"] == "https://wuri.shengboyu.ca/?yuanfen=1", info["cta"])
            check(tag + " 无横向溢出", info["sw"] <= info["cw"] + 1, f"{info['sw']} vs {info['cw']}")
            check(tag + " 整屏海报", info["fh"] >= info["ih"] * 0.85, f"frame {info['fh']} / vh {info['ih']}")
            check(tag + " 造像加载", info["imgOk"])
            check(tag + " 零JS异常", ev("window.__errs.length") == 0, ev("window.__errs"))
            if width == 412:
                shot(f"page-{slug}-412")
    finally:
        chrome.terminate()

# ---------------- B. App 分享三路 ----------------
SEED = """localStorage.setItem('wuri_affinity_result', JSON.stringify({a:[0,0,0,0,0,0,0,0,0,0,0,0], main:'baosheng', subs:['taiyi','mazu']}));"""

# B1: navigator.share 在位 → 系统分享
inject_share = """
window.__shareCalls = [];
try { Object.defineProperty(window.navigator, 'share', { configurable: true,
  value: function (p) { window.__shareCalls.push(p); return Promise.resolve(); } }); } catch (e) {}
"""
chrome, cdp, ev, shot = boot(412, inject_share)
try:
    nav(cdp, "file://" + os.path.join(WWW, "index.html"), 3.5)
    do(ev, SEED)
    do(ev, "location.reload()")
    time.sleep(3.5)
    do(ev, "document.getElementById('deities-enter').click()")
    time.sleep(0.4)
    do(ev, "document.getElementById('affinity-enter').click()")
    time.sleep(0.6)
    check("B1 结果页打开", ev("!document.getElementById('view-affinity-result').hidden"))
    check("B1 主缘为保生大帝", ev("document.getElementById('aff-main-name').textContent").strip() == "保生大帝")
    do(ev, "document.getElementById('aff-share-link').click()")
    time.sleep(0.4)
    calls = ev("window.__shareCalls")
    check("B1 系统分享被调用", bool(calls) and len(calls) == 1, calls)
    if calls:
        check("B1 分享URL为主缘专属页", calls[0].get("url") == "https://wuri.shengboyu.ca/yuanfen/baosheng.html", calls[0].get("url"))
        check("B1 分享title带名号", "保生大帝" in (calls[0].get("title") or ""), calls[0].get("title"))
    check("B1 复制链接按钮在位", ev("!!document.getElementById('aff-copy-link')"))
    check("B1 生成分享卡按钮在位", ev("!!document.getElementById('aff-share')"))
    check("B1 小红书提示行", "小红书" in (ev("document.querySelector('.aff-save-hint').textContent") or ""))
    shot("app-result-share-412")
finally:
    chrome.terminate()

# B2: 无 navigator.share + clipboard stub → 复制链接 & 分享结果回退
inject_copy = """
window.__clip = [];
try { Object.defineProperty(window.navigator, 'share', { configurable: true, value: undefined }); } catch (e) {}
try { Object.defineProperty(window.navigator, 'clipboard', { configurable: true,
  value: { writeText: function (t) { window.__clip.push(t); return Promise.resolve(); } } }); } catch (e) {}
"""
chrome, cdp, ev, shot = boot(412, inject_copy)
try:
    nav(cdp, "file://" + os.path.join(WWW, "index.html"), 3.5)
    do(ev, SEED)
    do(ev, "location.reload()")
    time.sleep(3.5)
    do(ev, """window.__toasts = []; (() => { const _t = window.toast;
      window.toast = function (m) { window.__toasts.push(String(m)); if (_t) _t(m); }; })()""")
    do(ev, "document.getElementById('deities-enter').click()")
    time.sleep(0.4)
    do(ev, "document.getElementById('affinity-enter').click()")
    time.sleep(0.6)
    do(ev, "document.getElementById('aff-copy-link').click()")
    time.sleep(0.5)
    clip = ev("window.__clip")
    check("B2 复制链接写入剪贴板", clip == ["https://wuri.shengboyu.ca/yuanfen/baosheng.html"], clip)
    toasts = ev("window.__toasts")
    check("B2 复制后toast", bool(toasts) and any("复制" in t for t in toasts), toasts)
    do(ev, "document.getElementById('aff-share-link').click()")
    time.sleep(0.5)
    clip2 = ev("window.__clip")
    check("B2 分享结果无share时回退复制", len(clip2) == 2 and clip2[1] == clip[0], clip2)
finally:
    chrome.terminate()

# ---------------- C. 深链落地 ----------------
chrome, cdp, ev, shot = boot(412)
try:
    nav(cdp, "file://" + os.path.join(WWW, "index.html") + "?yuanfen=1", 3.5)
    check("C 图鉴视图已打开", ev("!document.getElementById('view-deities').hidden"))
    vis = ev("""(() => { const e = document.getElementById('affinity-entry');
      const r = e.getBoundingClientRect(); return r.height > 0; })()""")
    check("C 缘分入口卡可见", vis)
    check("C 参数已清", ev("location.search") == "", ev("location.search"))
    shot("app-deeplink-412")
finally:
    chrome.terminate()

print()
print("FAILS:", fails if fails else "none")
raise SystemExit(1 if fails else 0)
