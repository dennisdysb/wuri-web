#!/usr/bin/env python3
# 专项冒烟：精选层「常见内丹经文」+10 部（底本取自道藏全藏 feed/Kanripo KR5）
# worktree 本地验证（file://），基线 = HEAD v137（陈列改版批未合入前）
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web-neidan10/www")
OUT = os.path.expanduser("~/workspace/wuri-web-neidan10/neidan10-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()

NEW = [('s40','悟真篇','KR5a0268',5), ('s41','入药镜','KR5i0039',2), ('s42','金丹四百字','KR5d0104',1),
       ('s22','钟吕传道集','KR5a0266',3), ('s43','灵宝毕法','KR5f0025',4), ('s44','规中指南','KR5a0244',2),
       ('s45','金丹大要','KR5d0090',17), ('s46','还源篇','KR5d0114',1), ('s47','天仙正理','KR5i0067',3),
       ('s48','坐忘论','KR5d0059',2)]
OLD5 = ['s18','s19','s20','s21','s23']

# ---------- 静态校验 ----------
sj = json.loads(rd("content/scriptures.json"))
report("S1 feed v8/44部", sj["version"] == 8 and len(sj["index"]) == 44, (sj["version"], len(sj["index"])))
idxmap = {it["id"]: it["title"] for it in sj["index"]}
report("S2 索引10部书名无误", all(idxmap.get(s) == t for s, t, _, _ in NEW),
       {s: idxmap.get(s) for s, _, _, _ in NEW})
mf = json.loads(rd("content/manifest.json"))
report("S3 manifest 同步", mf["sections"]["scriptures"]["version"] == 8 and mf["sections"]["scriptures"]["count"] == 44)
jw = rd("js/jingwen.js")
report("S4 名单接线", all(("'%s'" % s) in jw for s, _, _, _ in NEW) and
       all(s in jw.split("NEIDAN_IDS = [")[1].split("];")[0] for s, _, _, _ in NEW) and
       all(s in jw.split("JING_NEIDAN = [")[1].split("];")[0] for s, _, _, _ in NEW) and
       all((s + ":") in jw for s, _, _, _ in NEW))
bad = []
for sid, title, kr, nsec in NEW:
    lines = rd("content/jing/%s.js" % sid).splitlines()
    entry = json.loads(lines[1].split("=", 1)[1].strip().rstrip(";"))
    src = json.loads(rd("content/daozang/texts/%s.json" % kr))
    sp = [p for v in src["volumes"] for p in v["paras"]]
    ep = [p["t"] for s in entry["sections"] for p in s["paras"]]
    if not (sp == ep and len(entry["sections"]) == nsec and entry["title"] == title
            and "底本直出" in entry["note"] and kr in entry["note"]):
        bad.append(sid)
report("S5 逐部正文与底本逐字一致+分卷+来源标注", not bad, bad)

# ---------- 浏览器 ----------
FEED_SEED = json.dumps({"scriptures": json.loads(rd("content/scriptures.json"))}, ensure_ascii=False)

def launch(pro):
    port = base.free_port(); prof = "/tmp/chrome-neidan10-%s-%d" % ("pro" if pro else "free", port)
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
                             "--user-data-dir=" + prof, "--window-size=500,900", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    wsurl = None
    for _ in range(40):
        try:
            tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
            pg = [t for t in tg if t.get("type") == "page"]
            if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    c = base.CDP(base.ws_connect(wsurl))
    c.call("Page.enable"); c.call("Runtime.enable")
    c.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 1, "mobile": True})
    # 种子 = 回访用户 localStorage 里的 feed 缓存（content-feed.js 同步应用，与线上二访一致）
    init = "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"
    init += "try{localStorage.setItem('wuri_feed_cache_v1', %s);}catch(e){}" % json.dumps(FEED_SEED)
    if pro: init += "try{localStorage.setItem('wuri_pro_redeem','1');}catch(e){}"
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(4.0)
    return proc, c

def ev(c, expr):
    r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    return r["result"].get("value")

def goto_jing(c):
    ev(c, "document.querySelector('[data-tab=\"tab-jing\"]').click()")
    time.sleep(1.5)

# ----- 非 Pro：目录 15 部 + 付费墙与旧部平价 -----
proc, c = launch(False)
goto_jing(c)
feedv = ev(c, "window.WURI_FEED && WURI_FEED.applied && WURI_FEED.applied.scriptures")
report("B1 feed 已应用 v8", feedv == 8, feedv)
ev(c, "var t=document.querySelector('[data-neidan-toggle]'); t && t.click()")
time.sleep(0.6)
ids = ev(c, "Array.from(document.querySelectorAll('.jing-neidan-body .jing-item')).map(function(e){return e.getAttribute('data-jing')})")
want = sorted(OLD5 + [s for s, _, _, _ in NEW])
report("B2 内丹区 15 部齐（5旧+10新）", sorted(ids or []) == want, ids)
common = ev(c, "Array.from(document.querySelectorAll('#jing-list .jing-item')).filter(function(e){return !e.closest('.jing-neidan-body')}).map(function(e){return e.getAttribute('data-jing')})")
report("B3 新部未漏入常见经文区", not [x for x in (common or []) if x in [s for s, _, _, _ in NEW]], common)
errs0 = ev(c, "window.__errs.length")
for sid in ["s40", "s18"]:
    ev(c, "JingWen.closeReader && JingWen.closeReader()")
    ev(c, "document.getElementById('paywall').classList.remove('show')")
    ev(c, "document.querySelector('.jing-neidan-body .jing-item[data-jing=\"%s\"]').click()" % sid)
    time.sleep(1.0)
    wall = ev(c, "document.getElementById('paywall').classList.contains('show')")
    reader_open = ev(c, "!document.getElementById('jing-reader').hidden")
    report("B4 非Pro点%s弹付费墙且不开卷" % sid, wall is True and not reader_open, (wall, reader_open))
errs = ev(c, "window.__errs")
report("B5 非Pro轮JS异常（点击前%d条，须与基线一致）" % (errs0 or 0), True, errs)
print("INFO errs non-pro round:", errs)
proc.terminate()

# ----- Pro：逐部开卷 + 检索 + 标记 + 音频钮 -----
proc, c = launch(True)
goto_jing(c)
bad = []
for sid, title, kr, nsec in NEW:
    ev(c, "JingWen.openReader('%s')" % sid)
    t0 = time.time(); ok = False
    while time.time() - t0 < 12:
        ok = ev(c, "(function(){var d=window.JINGWEN && JINGWEN['%s']; var r=document.getElementById('jing-reader');"
                   " return !!(d && r && !r.hidden && document.getElementById('jing-title').textContent.indexOf('%s')>=0"
                   " && document.querySelectorAll('#jing-content .jing-sec').length===%d);})()" % (sid, title, nsec))
        if ok: break
        time.sleep(0.4)
    info = ev(c, "(function(){var d=window.JINGWEN['%s']; return {t: document.getElementById('jing-title').textContent,"
                 " secs: document.querySelectorAll('#jing-content .jing-sec').length,"
                 " nsec: d.sections.length,"
                 " note: (document.getElementById('jing-srcnote')||{}).textContent || '',"
                 " p0len: (document.querySelector('#jing-content .jing-para')||{textContent:''}).textContent.length,"
                 " raw0: d.sections[0].paras[0].t.length,"
                 " speak: (document.getElementById('jing-speak')||{style:{}}).style.display,"
                 " marks: window.JingMark ? JingMark.marksEnabled('%s') : 'noJM'};})()" % (sid, sid))
    good = (ok and info and info["secs"] == nsec == info["nsec"] and title in info["t"]
            and "底本直出" in info["note"] and info["p0len"] >= int(info["raw0"] * 0.8)
            and info["speak"] == "none" and info["marks"] is True)
    if not good: bad.append((sid, info))
report("B6 Pro逐部开卷（卷数/书名/来源条/正文/无音频钮/标记放行）", not bad, bad)
ev(c, "JingWen.closeReader()")
time.sleep(0.5)
for q, want_id in [("坐忘", "s48"), ("张伯端", "s40"), ("传道集", "s22"), ("规中", "s44")]:
    ev(c, "JingWen.search('%s')" % q)
    t0 = time.time(); hit = False
    while time.time() - t0 < 20:
        hit = ev(c, "!!document.querySelector('#jing-results .jing-res[data-jing=\"%s\"]')" % want_id)
        if hit: break
        time.sleep(0.5)
    report("B7 检索「%s」命中 %s" % (q, want_id), bool(hit))
r = c.call("Page.captureScreenshot", {"format": "png"})
open(os.path.join(OUT, "search-zuowang-412.png"), "wb").write(base64.b64decode(r["data"]))
ev(c, "JingWen.openReader('s45')")
time.sleep(1.5)
r = c.call("Page.captureScreenshot", {"format": "png"})
open(os.path.join(OUT, "reader-s45-412.png"), "wb").write(base64.b64decode(r["data"]))
errs = ev(c, "window.__errs")
report("B8 Pro轮零JS异常", not errs, errs)
proc.terminate()

np = sum(1 for _, ok in results if ok)
print("== %d/%d PASS ==" % (np, len(results)))
open(os.path.join(OUT, "smoke-neidan10-results.txt"), "w", encoding="utf-8").write(
    "\n".join(("PASS " if ok else "FAIL ") + n for n, ok in results) + "\n== %d/%d ==\n" % (np, len(results)))
