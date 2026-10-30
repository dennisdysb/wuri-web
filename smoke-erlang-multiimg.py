#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""二郎神多图条目专项冒烟（2026-10-29 批）
断言：①静态：feed 与包内 deities-data 的 erlang 条目同带 images[erlang.webp,
erlang-2.webp]、两图与两缩略图实体在盘、manifest 含两图且总数 103；
仅 erlang 一条带 images（通用逻辑靠数据、无特例代码，deities.js 无 erlang 字样）。
②运行时（360×740）：详情默认显第一张（erlang.webp 全图）、切图箭头显形且落在
图下缘左右角不溢出；点右箭头→第二张、再点→循环回第一张、点左箭头→第二张；
单图条目（关帝）无切图箭头；红光（body.sky-red）下箭头随变量链变色、图正常显。
跑法：python3 smoke-erlang-multiimg.py
"""
import hashlib, importlib.util, json, os, subprocess, sys, time, urllib.request
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()

ROOT = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(ROOT, "www")
RES = []
def ok(name, cond, extra=""):
    RES.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))

# ---------- 静态 ----------
feed = json.load(open(os.path.join(WWW, "content/deities.json"), encoding="utf-8"))
fe = [d for d in feed["deities"] if d["id"] == "erlang"][0]
ok("静态 feed erlang images 两张且第一张=image", fe.get("images") == ["erlang.webp", "erlang-2.webp"] and fe.get("image") == "erlang.webp")
ok("静态 feed 仅 erlang 带 images（其余单图零变化）",
   [d["id"] for d in feed["deities"] if d.get("images")] == ["erlang"])
datajs = open(os.path.join(WWW, "js/deities-data.js"), encoding="utf-8").read()
ok("静态 包内数据 erlang images 同步", '"erlang-2.webp"' in datajs)
for p in ["img/deities/erlang.webp", "img/deities/erlang-2.webp",
          "img/deities/thumbs/erlang.webp", "img/deities/thumbs/erlang-2.webp"]:
    ok("静态 实体在盘 " + p, os.path.getsize(os.path.join(WWW, p)) > 5000)
man = json.load(open(os.path.join(WWW, "img/deities/manifest.json"), encoding="utf-8"))
ok("静态 manifest 103 张含两张二郎图", man["count"] == 103 and "erlang.webp" in man["files"] and "erlang-2.webp" in man["files"],
   "count=%s total=%s" % (man["count"], man["totalBytes"]))
djs = open(os.path.join(WWW, "js/deities.js"), encoding="utf-8").read()
ok("静态 deities.js 通用多图（deityImages＋切图箭头绑定、无 erlang 特例）",
   "deityImages" in djs and "deity-img-prev" in djs and "erlang" not in djs)
idx = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
ok("静态 index 含两枚切图箭头（初始 hidden）", 'id="deity-img-prev"' in idx and 'id="deity-img-next"' in idx)
odl = open(os.path.join(WWW, "js/offline-download.js"), encoding="utf-8").read()
ok("静态 下载名单含多图（deityNames 走 images）", "d.images" in odl)

# ---------- 运行时 ----------
PORT = base.free_port()
chrome = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                           "--allow-file-access-from-files",
                           "--hatch-webgl-allowed-domains-file=" + _WG,
                           "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
                           "--user-data-dir=/tmp/chrome-erlang-%d" % PORT,
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
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 360, "height": 740, "deviceScaleFactor": 2, "mobile": True})
    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v
    def waitfor(js, timeout=30.0, step=0.4):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if ev(js): return True
            except Exception: pass
            time.sleep(step)
        return False

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    assert waitfor("!!window.Deities && !!window.DEITIES_DATA")
    ev("window.Deities.openDetail('erlang'); true", 0.3)
    ok("运行时 详情默认第一张全图 erlang.webp",
       waitfor("(()=>{const i=document.getElementById('deity-detail-img'); return i && /img\\/deities\\/erlang\\.webp$/.test(i.src);})()"))
    geo = ev("(()=>{const b=document.querySelector('.deity-img-box').getBoundingClientRect();"
             "const p=document.getElementById('deity-img-prev').getBoundingClientRect();"
             "const n=document.getElementById('deity-img-next').getBoundingClientRect();"
             "const hp=document.getElementById('deity-img-prev').hidden, hn=document.getElementById('deity-img-next').hidden;"
             "return JSON.stringify({bw:b.width,bh:b.height,pl:p.left-b.left,pr:b.right-n.right,"
             "pb:b.bottom-p.bottom, pw:p.width, hp:hp, hn:hn, sw:document.documentElement.scrollWidth});})()")
    g = json.loads(geo)
    ok("运行时 切图箭头显形·图下缘左右角·30px·不溢出",
       (not g["hp"]) and (not g["hn"]) and 0 <= g["pl"] <= 12 and 0 <= g["pr"] <= 12
       and 4 <= g["pb"] <= 16 and g["pw"] == 30 and g["sw"] <= 361, geo)
    ev("document.getElementById('deity-img-next').click(); true")
    ok("运行时 点右箭头→第二张 erlang-2.webp",
       waitfor("(()=>{const i=document.getElementById('deity-detail-img'); return i && /erlang-2\\.webp$/.test(i.src);})()"))
    ev("document.getElementById('deity-img-next').click(); true")
    ok("运行时 再点右箭头→循环回第一张",
       waitfor("(()=>{const i=document.getElementById('deity-detail-img'); return i && /\\/erlang\\.webp$/.test(i.src) && !/erlang-2/.test(i.src);})()"))
    ev("document.getElementById('deity-img-prev').click(); true")
    ok("运行时 点左箭头→第二张",
       waitfor("(()=>{const i=document.getElementById('deity-detail-img'); return i && /erlang-2\\.webp$/.test(i.src);})()"))
    # 单图条目零变化
    ev("window.Deities.openDetail('guandi'); true", 0.3)
    assert waitfor("(()=>{const i=document.getElementById('deity-detail-img'); return i && /guandi\\.webp$/.test(i.src);})()")
    ok("运行时 单图条目（关帝）无切图箭头",
       ev("document.getElementById('deity-img-prev').hidden && document.getElementById('deity-img-next').hidden") is True)
    # 红光三态：箭头走变量链变色、图仍在显
    ev("window.Deities.openDetail('erlang'); true", 0.3)
    assert waitfor("(()=>{const i=document.getElementById('deity-detail-img'); return i && /erlang\\.webp$/.test(i.src);})()")
    c_before = ev("getComputedStyle(document.getElementById('deity-img-next')).backgroundColor")
    ev("document.body.classList.add('sky-red'); true", 0.4)
    c_after = ev("getComputedStyle(document.getElementById('deity-img-next')).backgroundColor")
    vis = ev("(()=>{const i=document.getElementById('deity-detail-img'); return !i.hidden && i.complete && i.naturalWidth>0;})()")
    ok("运行时 红光下箭头随变量链变色且图正常显示", c_before != c_after and vis is True,
       "%s -> %s" % (c_before, c_after))
    ev("document.body.classList.remove('sky-red'); true")
finally:
    try: chrome.kill()
    except Exception: pass

print("\n==== erlang-multiimg smoke %d/%d PASS ====" % (sum(RES), len(RES)))
sys.exit(0 if all(RES) and RES else 1)
