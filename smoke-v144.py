#!/usr/bin/env python3
# 专项冒烟（SW v144）：真机反馈三修——
# 一、全藏多卷本「全部展开」补回＋渐进渲染（度人经 61 卷验收：总耗时/最大帧间隙/中途可滚）
# 二、标点切换钮移除：有标点版一律默认标点版（全藏＋精选内丹），无标点版原文；偏好键停读
# 三、检索分阶段＋时序令牌：冷首查书名先行（不等 ensureAll）、连查不串味、检索中态、清空稳定
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/fixes144-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:500]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()

# ---------- 静态检查 ----------
sw, html, i18n = rd("sw.js"), rd("index.html"), rd("js/i18n.js")
report("S1 四件套 v144", "wuri-v144" in sw and "style.css?v=144" in sw and "style.css?v=144" in html
       and "内部 v144" in html and i18n.count("内部 v144") + i18n.count("內部 v144") >= 2)
dzjs, jwjs = rd("js/daozang.js"), rd("js/jingwen.js")
report("S2 标点钮与偏好全清", "jing-punctbtn" not in html and "jing-punctbtn" not in jwjs
       and "__wuri_dzTogglePunct" not in dzjs and "dzPunctPref" not in dzjs and "jpPunctPref" not in jwjs
       and "getItem('wuri_dz_punct')" not in dzjs and "getItem('wuri_dz_punct')" not in jwjs
       and "setItem('wuri_dz_punct'" not in dzjs and "setItem('wuri_dz_punct'" not in jwjs)
report("S3 渐进展开接线", "expandAllProgressive" in jwjs and "展开中…" in jwjs and "fab2.hidden" not in jwjs)
report("S4 检索令牌+预加载", "searchSeq" in jwjs and "__wuri_dzPreload" in dzjs and "检索中…" in jwjs
       and "searchTimer" in jwjs)
idx = json.loads(rd("content/daozang/index.json"))
PUNCT = set(idx.get("punct") or [])
DUREN = [w for w in idx["works"] if w["id"] == "KR5a0001"][0]
UNPUNCT = [w for w in idx["works"] if w["id"] not in PUNCT and w["juan"] >= 2][0]

def launch(pro, extra_init=""):
    port = base.free_port(); prof = f"/tmp/chrome-v144-{port}"
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                             "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
                             "--user-data-dir=" + prof, "--window-size=500,1000", "about:blank"],
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
    init = "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"
    if pro: init += "try{localStorage.setItem('wuri_pro_redeem','1');}catch(e){}"
    init += extra_init
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(4)
    return proc, c

def ev(c, expr):
    r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    return r["result"].get("value")

def shot(c, name):
    r = c.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

def wait_for(c, expr, secs=25):
    t0 = time.time()
    while time.time() - t0 < secs:
        try:
            if ev(c, expr): return True
        except Exception: pass
        time.sleep(0.4)
    return False

def set_q(c, v):
    ev(c, """(function(){var q=document.getElementById('jing-q'); q.focus(); q.value=%s;
      q.dispatchEvent(new Event('input',{bubbles:true}));})()""" % json.dumps(v))

SNAP = """(function(){var box=document.getElementById('jing-results');
  var rows=box?box.querySelectorAll('.jing-res'):[];
  var titles=[]; rows.forEach(function(r){var t=r.querySelector('.jing-res-t'); titles.push(t?t.textContent:'');});
  return {hidden: box?box.hidden:true, n: rows.length, first: titles[0]||'',
    daodeTitle: titles.some(function(t){return t.indexOf('道德真經')>=0||t.indexOf('道德真经')>=0;}),
    loading: box? (box.textContent.indexOf('检索中')>=0) : false,
    notFound: box? (box.textContent.indexOf('未找到')>=0) : false,
    loadedCount: window.JINGWEN? Object.keys(window.JINGWEN).length : 0};})()"""

def open_tab_jing(c):
    ev(c, "document.querySelector('[data-tab=\"tab-jing\"]').click()"); time.sleep(1.0)

def open_work(c, bu, wid):
    if not ev(c, "!!document.querySelector('[data-dz-work=\"%s\"]')" % wid):
        ev(c, "document.querySelector('[data-dz-toggle]').click()"); time.sleep(0.6)
    if not ev(c, "!!document.querySelector('[data-dz-work=\"%s\"]')" % wid):
        ev(c, "document.querySelector('[data-dz-bu=\"%s\"]').click()" % bu); time.sleep(0.6)
    ev(c, "document.querySelector('[data-dz-work=\"%s\"]').click()" % wid)
    ok = wait_for(c, "!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>0")
    ev(c, """(function(){var b=document.querySelector('#jing-content .jing-sec[data-sec="0"] .jing-sec-body');
      if(b&&b.hidden){var h=document.querySelector('#jing-content .jing-sec[data-sec="0"] [data-fold]'); if(h)h.click();}})()""")
    time.sleep(0.8)
    return ok

def back(c):
    ev(c, "document.getElementById('jing-back').click()"); time.sleep(0.8)

# ================= Profile 1（Pro）：检索 A1/A4/A3 ＋ 阅读器 B/C =================
proc, c = launch(True)
try:
    report("P0 Pro 基线", ev(c, "!!(window.WuriPro && WuriPro.isPro())") is True)
    open_tab_jing(c)
    # A1 冷首查：书名命中先行（出现时应仍未等齐 44 部全文）
    t0 = time.time(); set_q(c, "道德经")
    first_ms, snap1 = None, None
    while time.time() - t0 < 20:
        s = ev(c, SNAP)
        if s["n"] > 0: first_ms = (time.time() - t0) * 1000; snap1 = s; break
        time.sleep(0.025)
    report("A1 冷首查首行耗时", first_ms is not None and first_ms < 2500, first_ms)
    report("A1b 首行出时全文未加载齐（书名先行）", snap1 is not None and snap1["loadedCount"] < 44, snap1)
    ok = False
    t0 = time.time()
    while time.time() - t0 < 30:
        s = ev(c, SNAP)
        if s["daodeTitle"] and not s["loading"]: ok = True; break
        time.sleep(0.2)
    report("A1c 道德经结果齐", ok, s)
    print("  [A1] first_row_ms=%.0f loadedAtFirst=%s" % (first_ms or -1, snap1 and snap1["loadedCount"]))
    shot(c, "search-daode-412.png")
    # A4 不存在词：最终「未找到」而非卡在检索中
    set_q(c, "不存在的经xyz")
    ok = wait_for(c, """(function(){var b=document.getElementById('jing-results');
      return b.textContent.indexOf('未找到')>=0;})()""", 40)
    report("A4 无结果终态未找到", ok)
    # A3 清空稳定＋二次查询（走内存）
    ev(c, "document.getElementById('jing-q-clear').click()"); time.sleep(0.4)
    s = ev(c, SNAP)
    report("A3 清空回目录", s["hidden"] and ev(c, "!document.getElementById('jing-list').hidden"), s)
    t0 = time.time(); set_q(c, "道德经")
    warm_ms = None
    while time.time() - t0 < 15:
        s = ev(c, SNAP)
        if s["n"] > 0 and s["daodeTitle"]: warm_ms = (time.time() - t0) * 1000; break
        time.sleep(0.025)
    report("A3b 二次查询命中（内存）", warm_ms is not None, warm_ms)
    print("  [A3] warm_first_ms=%.0f" % (warm_ms or -1))

    # C1 全藏道德真经：默认标点版、无切换钮
    report("C1 开道德真经（全藏）", open_work(c, "洞神部", "KR5c0045"))
    r = ev(c, """(function(){
      function baseText(el){ var s='',w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null,false),n;
        while((n=w.nextNode())){ if(n.parentNode&&n.parentNode.tagName==='RT') continue; s+=n.textContent; } return s; }
      var sec0=document.querySelector('#jing-content .jing-sec[data-sec="0"]');
      return {punctBtn: !!document.getElementById('jing-punctbtn'),
        cls: document.getElementById('jing-content').classList.contains('dz-punct'),
        hasPunct: baseText(sec0).indexOf('。')>=0,
        note: document.getElementById('jing-srcnote').textContent,
        foldHidden: document.getElementById('jing-foldall').hidden};
    })()""")
    report("C1 默认标点版+无钮", r and r["cls"] and r["hasPunct"] and not r["punctBtn"], r)
    report("C1b 来源条机器标点", r and "机器标点 · 未经校订" in r["note"], r and r["note"])
    shot(c, "daode-punct-default-412.png")
    back(c)
    # C2 无标点版：原文呈现、无机器标点字样
    report("C2 开无标点部 " + UNPUNCT["id"], open_work(c, UNPUNCT["bu"], UNPUNCT["id"]))
    r = ev(c, """(function(){ return {
      cls: document.getElementById('jing-content').classList.contains('dz-punct'),
      note: document.getElementById('jing-srcnote').textContent,
      paras: document.querySelectorAll('#jing-content .jing-para').length,
      foldHidden: document.getElementById('jing-foldall').hidden}; })()""")
    report("C2 原文呈现", r and not r["cls"] and "机器标点" not in r["note"] and r["paras"] > 0, r)
    report("C2b 多卷本全部展开钮在", r and not r["foldHidden"], r)
    back(c)
    # B4 精选多节经：全部展开即时全开
    ev(c, "document.querySelector('[data-jing=\"s07\"]').click()")
    ok = wait_for(c, "!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-sec-body').length>1")
    report("B4 开精选道德真经", ok)
    ev(c, "document.getElementById('jing-foldall').click()"); time.sleep(0.6)
    r = ev(c, """(function(){var bs=document.querySelectorAll('#jing-content .jing-sec-body');
      var open=0; bs.forEach(function(b){ if(!b.hidden) open++; });
      return {total: bs.length, open: open, btn: document.getElementById('jing-foldall').textContent};})()""")
    report("B4 全部展开（精选）", r and r["total"] > 1 and r["open"] == r["total"] and r["btn"] == "全部折叠", r)
    back(c)
    # C3 内丹 s45 默认标点版
    ev(c, "document.querySelector('[data-neidan-toggle]').click()"); time.sleep(0.5)
    ev(c, "document.querySelector('[data-jing=\"s45\"]').click()")
    ok = wait_for(c, "!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>0")
    r = ev(c, """(function(){ return {
      cls: document.getElementById('jing-content').classList.contains('dz-punct'),
      note: document.getElementById('jing-srcnote').textContent,
      punctBtn: !!document.getElementById('jing-punctbtn')}; })()""")
    report("C3 内丹金丹大要默认标点版", ok and r and r["cls"] and "机器标点 · 未经校订" in r["note"] and not r["punctBtn"], r)
    shot(c, "neidan-s45-punct-412.png")
    back(c)
    # C4 内丹 s18（旧五部，无标点数据）：正常开卷、无 dz-punct
    ev(c, "document.querySelector('[data-jing=\"s18\"]').click()")
    ok = wait_for(c, "!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>0")
    r = ev(c, "document.getElementById('jing-content').classList.contains('dz-punct')")
    report("C4 内丹黄庭内景经原文常态", ok and r is False, r)
    back(c)

    # B 度人经 61 卷：全部展开渐进渲染验收
    report("B1 开度人经", open_work(c, DUREN["bu"], "KR5a0001"))
    r = ev(c, """(function(){ return {
      foldHidden: document.getElementById('jing-foldall').hidden,
      secs: document.querySelectorAll('#jing-content .jing-sec-body').length,
      note: document.getElementById('jing-srcnote').textContent}; })()""")
    report("B1 61卷+钮可见+部分标点注", r and r["secs"] == 61 and not r["foldHidden"] and "已标 6/61 卷" in r["note"], r)
    ev(c, """window.__gaps={max:0,last:performance.now(),run:true};
      (function tick(){ if(!window.__gaps.run) return; var n=performance.now();
        var g=n-window.__gaps.last; if(g>window.__gaps.max) window.__gaps.max=g;
        window.__gaps.last=n; requestAnimationFrame(tick); })();""")
    t0 = time.time()
    ev(c, "document.getElementById('jing-foldall').click()")
    time.sleep(0.35)
    mid = ev(c, """(function(){var b=document.getElementById('jing-foldall');
      return {txt: b.textContent, dis: b.disabled};})()""")
    report("B2 展开中态（文案+禁用）", mid and mid["txt"] == "展开中…" and mid["dis"], mid)
    scrolled = None; total_ms = None; maxgap = None
    while time.time() - t0 < 300:
        s = ev(c, """(function(){var bs=document.querySelectorAll('#jing-content .jing-sec-body');
          var open=0; bs.forEach(function(b){ if(!b.hidden) open++; });
          return {open: open, lazy: document.querySelectorAll('#jing-content [data-lazy]').length,
                  btn: document.getElementById('jing-foldall').textContent};})()""")
        if scrolled is None and s["open"] >= 30:
            scrolled = ev(c, """(function(){var d=document.scrollingElement;
              d.scrollTop = 3000; return d.scrollTop;})()""")
        if s["open"] >= 61 and s["lazy"] == 0:
            total_ms = (time.time() - t0) * 1000; break
        time.sleep(0.5)
    maxgap = ev(c, "(window.__gaps.run=false, Math.round(window.__gaps.max))")
    report("B2 全展开完成（61/61 无懒卷）", total_ms is not None, {"total_ms": total_ms})
    report("B2b 中途可滚动", scrolled is not None and scrolled > 1000, scrolled)
    print("  [B2] expand_total_ms=%.0f max_frame_gap_ms=%s scrolled=%s" % (total_ms or -1, maxgap, scrolled))
    shot(c, "duren-fully-expanded-412.png")
    ev(c, "document.getElementById('jing-foldall').click()"); time.sleep(0.5)
    r = ev(c, """(function(){var bs=document.querySelectorAll('#jing-content .jing-sec-body');
      var open=0; bs.forEach(function(b){ if(!b.hidden) open++; });
      return {open: open, btn: document.getElementById('jing-foldall').textContent};})()""")
    report("B3 全部折叠", r and r["open"] == 0 and r["btn"] == "全部展开", r)
    ev(c, "document.getElementById('jing-foldall').click()")
    ok = wait_for(c, """(function(){var bs=document.querySelectorAll('#jing-content .jing-sec-body');
      var open=0; bs.forEach(function(b){ if(!b.hidden) open++; }); return open>=61;})()""", 60)
    report("B3b 二次展开（已填充直开）", ok)
    report("P1 零 JS 异常", ev(c, "window.__errs.length") == 0, ev(c, "window.__errs"))
finally:
    proc.terminate()

# ================= Profile 2（Pro＋预置高亮）：标点版高亮投影回归 =================
hl = json.dumps([{"sid": "KR5c0045", "sec": 0, "para": 1, "start": 0, "end": 3, "color": "yellow", "id": "t144"}])
proc, c = launch(True, "try{localStorage.setItem('wuri_jing_highlights', %s);}catch(e){}" % json.dumps(hl))
try:
    open_tab_jing(c)
    report("H1 开道德真经（全藏）", open_work(c, "洞神部", "KR5c0045"))
    r = ev(c, """(function(){var sec0=document.querySelector('#jing-content .jing-sec[data-sec="0"]');
      return {hl: sec0.querySelectorAll('.hl').length,
              cls: document.getElementById('jing-content').classList.contains('dz-punct')};})()""")
    report("H1 标点版高亮落点在", r and r["cls"] and r["hl"] > 0, r)
    report("H2 零 JS 异常", ev(c, "window.__errs.length") == 0, ev(c, "window.__errs"))
finally:
    proc.terminate()

# ================= Profile 3（冷启动连查）：不串味 =================
proc, c = launch(True)
try:
    open_tab_jing(c)
    set_q(c, "道德经")
    time.sleep(0.08)
    t0 = time.time(); set_q(c, "度人经")
    crosstalk = False; first_duren = None; settled = None
    while time.time() - t0 < 30:
        s = ev(c, SNAP)
        if s["daodeTitle"]: crosstalk = True
        if first_duren is None and s["first"] and "度人" in s["first"]:
            first_duren = (time.time() - t0) * 1000
        if first_duren is not None and (time.time() - t0) * 1000 > first_duren + 2500:
            settled = s; break
        time.sleep(0.05)
    if settled is None: settled = ev(c, SNAP)
    report("A2 连查不串味", not crosstalk, settled)
    report("A2b 首条为度人类", settled is not None and "度人" in settled["first"], settled)
    print("  [A2] first_duren_ms=%.0f" % (first_duren or -1))
    shot(c, "search-duren-nomix-412.png")
    report("A2c 零 JS 异常", ev(c, "window.__errs.length") == 0, ev(c, "window.__errs"))
finally:
    proc.terminate()

fails = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(fails), len(results)))
if fails: print("FAIL:", fails)
with open(os.path.join(OUT, "smoke-v144-results.txt"), "w", encoding="utf-8") as f:
    for n, ok in results: f.write(("PASS " if ok else "FAIL ") + n + "\n")
    f.write("==== %d/%d PASS ====\n" % (len(results) - len(fails), len(results)))
sys.exit(1 if fails else 0)
