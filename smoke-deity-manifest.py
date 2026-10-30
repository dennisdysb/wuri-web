#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""图鉴素材清单驱动专项冒烟（v2.1.1 合并批 ④）
断言：①静态：gen-deity-manifest.py 在位；www/img/deities/manifest.json 与
feed 名单×磁盘字节重算严格一致（count/totalBytes/逐文件）；运行时代码读清单
（fetch＋LS 缓存键＋deityPaintDesc）且设置页文案元素带 id。
②运行时：设置页「图鉴素材」栏显示的张数/MB 与清单计算值严格相等。
③管线演练：临时加一张图（＋feed 临时条目）→ 重跑生成器 → 清单变化 →
页面刷新后数字跟随（基线＋1 张）；恢复后回到基线张数。演练文件全程备份还原。
跑法：python3 smoke-deity-manifest.py
"""
import importlib.util, json, os, re, shutil, subprocess, sys, time, urllib.request, base64 as b64mod
import hashlib
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

ROOT = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(ROOT, "www")
FEED = os.path.join(WWW, "content", "deities.json")
IMG_DIR = os.path.join(WWW, "img", "deities")
MANIFEST = os.path.join(IMG_DIR, "manifest.json")
RES = []
def ok(name, cond, extra=""):
    RES.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))

def fmt_mb(b): return "%.1f MB" % (b / 1048576)

def expected():
    feed = json.load(open(FEED, encoding="utf-8"))
    names, seen = [], set()
    for d in feed.get("deities", []):
        imgs = d.get("images") or ([d["image"]] if d.get("image") else [])
        for img in imgs:
            if img and img not in seen:
                seen.add(img); names.append(img)
    files = {n: os.path.getsize(os.path.join(IMG_DIR, n)) for n in names}
    n_deities = sum(1 for d in feed.get("deities", [])
                    if (d.get("images") or ([d["image"]] if d.get("image") else [])))
    return {"count": len(files), "deities": n_deities, "totalBytes": sum(files.values()), "files": files}

# ---------- 静态 ----------
gen = os.path.join(ROOT, "gen-deity-manifest.py")
ok("静态 生成器在位", os.path.isfile(gen))
man = json.load(open(MANIFEST, encoding="utf-8")) if os.path.isfile(MANIFEST) else None
exp0 = expected()
ok("静态 清单与重算严格一致（count/total/逐文件）",
   man is not None and man["count"] == exp0["count"] and man["totalBytes"] == exp0["totalBytes"] and man["files"] == exp0["files"],
   "manifest=%s expected=%s" % (man and (man["count"], man["totalBytes"]), (exp0["count"], exp0["totalBytes"])))
odl = open(os.path.join(WWW, "js", "offline-download.js"), encoding="utf-8").read()
idx = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
ok("静态 运行时读清单（fetch＋LS 缓存＋回落推导＋文案渲染）",
   "img/deities/manifest.json" in odl and "wuri_deity_manifest_v1" in odl
   and "deityFallbackManifest" in odl and "deityPaintDesc" in odl and 'id="deity-dl-desc"' in idx)

# ---------- 运行时＋演练 ----------
PORT = base.free_port()
chrome = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                           "--allow-file-access-from-files",
                           "--hatch-webgl-allowed-domains-file=" + _WG,
                           "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
                           "--user-data-dir=/tmp/chrome-deityman-%d" % PORT,
                           "--remote-debugging-port=%d" % PORT, "about:blank"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
feed_backup = open(FEED, "rb").read()
drill_file = os.path.join(IMG_DIR, "zz-drill.webp")
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
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v
    def waitfor(js, timeout=25.0, step=0.4):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if ev(js): return True
            except Exception: pass
            time.sleep(step)
        return False
    def load_and_read_desc():
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
        assert waitfor("!!window.WuriSkyAR")
        ev("document.querySelector('[data-tab=\"tab-me\"]').click(); true", 0.8)
        got = waitfor("(()=>{const e=document.getElementById('deity-dl-desc'); return e && e.textContent.indexOf('（约') > 0;})()")
        if not got: return None
        return ev("document.getElementById('deity-dl-desc').textContent")
    def parse_desc(txt):
        m1 = re.search(r"全部 (\d+) 位", txt or "")
        m3 = re.search(r"的 (\d+) 张", txt or "")
        m2 = re.search(r"约 ([\d.]+ MB)", txt or "")
        return (int(m1.group(1)) if m1 else None,
                int(m3.group(1)) if m3 else None,
                m2.group(1) if m2 else None)
    import json as _json
    n_deities0 = len(_json.loads(feed_backup.decode("utf-8"))["deities"])

    txt = load_and_read_desc()
    cnt, img_n, mb = parse_desc(txt)
    ok("运行时 设置页数字＝位数（%d 位）＋清单计算值（%d 张 · %s）" % (n_deities0, exp0["count"], fmt_mb(exp0["totalBytes"])),
       cnt == n_deities0 and img_n == exp0["count"] and mb == fmt_mb(exp0["totalBytes"]), str(txt)[:80])

    # ---- 管线演练：加一张图 → 重跑生成 → 页面数字跟随 ----
    src_webp = min(exp0["files"], key=lambda k: exp0["files"][k])
    shutil.copyfile(os.path.join(IMG_DIR, src_webp), drill_file)
    feed = json.loads(feed_backup.decode("utf-8"))
    feed["deities"].append({"id": "zz-drill", "name": "演练临时神像", "image": "zz-drill.webp"})
    with open(FEED, "w", encoding="utf-8") as f:
        json.dump(feed, f, ensure_ascii=False)
    r = subprocess.run([sys.executable, gen], capture_output=True, text=True)
    man2 = json.load(open(MANIFEST, encoding="utf-8"))
    exp2 = expected()
    ok("演练 重跑生成后清单变化且自洽（%d 张）" % exp2["count"],
       r.returncode == 0 and man2["count"] == exp0["count"] + 1 and man2 == exp2,
       (r.stdout + r.stderr)[:120])
    txt2 = load_and_read_desc()
    cnt2, img_n2, mb2 = parse_desc(txt2)
    ok("演练 页面数字跟随清单（%d 位 · %d 张 · %s）" % (n_deities0 + 1, exp2["count"], fmt_mb(exp2["totalBytes"])),
       cnt2 == n_deities0 + 1 and img_n2 == exp2["count"] and mb2 == fmt_mb(exp2["totalBytes"]), str(txt2)[:80])
finally:
    # 恢复演练现场（无论成败）：删临时图、还原 feed、重跑生成回到基线
    try:
        if os.path.exists(drill_file): os.remove(drill_file)
        with open(FEED, "wb") as f: f.write(feed_backup)
        subprocess.run([sys.executable, gen], capture_output=True, text=True)
    except Exception as e:
        print("恢复异常：", e)
    try: chrome.kill()
    except Exception: pass

man3 = json.load(open(MANIFEST, encoding="utf-8"))
ok("演练后恢复基线（清单回到 %d 张 · %d 字节）" % (exp0["count"], exp0["totalBytes"]),
   man3["count"] == exp0["count"] and man3["totalBytes"] == exp0["totalBytes"] and man3["files"] == exp0["files"])

print("\n==== deity-manifest smoke %d/%d PASS ====" % (sum(RES), len(RES)))
sys.exit(0 if all(RES) and RES else 1)
