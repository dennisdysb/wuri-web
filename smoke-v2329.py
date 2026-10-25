# -*- coding: utf-8 -*-
"""v2.3.0 (SW v129) 专项冒烟：时区串用修复——「当下」跟随手机、与排盘时区解耦。
背景：app.js now() 曾按 CFG.tz（排盘时区）把当前时刻整体平移到北京时间，
多伦多用户排盘时区选北京时，首页 19:02 显示 07:02、时柱丙辰（北京次日）。
修复：now()/baseMeridian() 不再读 CFG.tz；CFG.tz 仅保留给奇门排盘换算。
矩阵（时刻冻结、独立参照 lunar-javascript Node 计算）：
  A 设备 TZ=America/Toronto × 排盘=beijing × 冻结 2026-10-25T23:02:30Z
    → 本地 19:02:30，壬申日·庚戌时；切换排盘时区 auto/beijing 整卡不变；黄历 today=25。
  B 设备 TZ=America/Toronto × 排盘=beijing × 冻结 2026-10-31T16:00:00Z（本地正午，戊寅日）
    → 状态卡「今日戊日 · 不上香」（北京口径会算成 11/1 己卯、非戊）。
  C 设备 TZ=Asia/Shanghai × 排盘=beijing × 同 A 瞬间 → 本地 2026-10-26 07:02:30，
    癸酉日·丙辰时（在上海这是正确结果，证明整卡随系统走）。
结果落盘 tz129-shots/smoke-v2329-results.txt，零 JS 异常为硬性项。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request
from datetime import datetime, timezone

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/tz129-shots")
os.makedirs(OUT, exist_ok=True)
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)) if (extra and not ok) else ""))

# ---------- 静态断言 ----------
app_src = open(os.path.join(WWW, "js/app.js"), encoding="utf-8").read()
qm_src = open(os.path.join(WWW, "js/qimen-app.js"), encoding="utf-8").read()
sw_src = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
idx_src = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
i18n_src = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("S1 app.js 不再有 CFG.tz==='beijing' 分支", "CFG.tz === 'beijing'" not in app_src)
report("S2 app.js now() 为设备时间直通", "function now() { return new Date(); }" in app_src)
report("S3 奇门保留排盘时区基准经线（排盘侧唯一消费者）", 'c.tz === "beijing" ? 120' in qm_src)
report("S4 四件套 v129", "wuri-v129" in sw_src and "style.css?v=129" in sw_src
       and "style.css?v=129" in idx_src and "（内部 v129）" in idx_src
       and "（内部 v129）" in i18n_src and "（內部 v129）" in i18n_src)
report("S5 tz_hint 新文案（简繁）且旧文案清除", "只作用于排盘换算" in i18n_src
       and "只作用於排盤換算" in i18n_src and "老黄历对照" not in i18n_src
       and "老黃曆對照" not in i18n_src and "老黄历对照" not in idx_src)

FREEZE_A = int(datetime(2026, 10, 25, 23, 2, 30, tzinfo=timezone.utc).timestamp() * 1000)
FREEZE_B = int(datetime(2026, 10, 31, 16, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)

def launch(tzname, fixed_ms, tag):
    port = base.free_port()
    prof = "/tmp/chrome-tz129-%s-%d" % (tag, port)
    env = dict(os.environ); env["TZ"] = tzname
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                             "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
                             "--window-size=390,844", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    wsurl = None
    for _ in range(40):
        try:
            tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
            pg = [t for t in tg if t.get("type") == "page"]
            if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    cdp = base.CDP(base.ws_connect(wsurl))
    cdp.call("Page.enable"); cdp.call("Runtime.enable")
    inject = (
        "window.__errs=[]; addEventListener('error', function(e){ window.__errs.push(String(e.message||e.error)); });"
        "var _RD = window.Date; var FIXED = %d;"
        "class FD extends _RD { constructor(){ if (arguments.length) super(...arguments); else super(FIXED); }"
        " static now(){ return FIXED; } }"
        "window.Date = FD;"
        "try { localStorage.setItem('wuri_cfg_v1', JSON.stringify({tz:'beijing', timebase:'true', lon:''})); } catch(e){}"
    ) % fixed_ms
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": inject})
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    time.sleep(3.2)
    return proc, cdp

def ev(cdp, expr):
    r = cdp.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    return (r.get("result") or {}).get("value")

def txt(cdp, sel):
    return ev(cdp, "(function(){var e=document.querySelector(%s);return e?e.textContent:null;})()" % json.dumps(sel))

def click_el(cdp, sel):
    r = ev(cdp, "(function(){var e=document.querySelector(%s);if(!e)return null;var b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()" % json.dumps(sel))
    if not r: raise RuntimeError("not found: " + sel)
    for typ in ("mouseMoved", "mousePressed", "mouseReleased"):
        kw = {"type": typ, "x": r["x"], "y": r["y"]}
        if typ != "mouseMoved": kw.update({"button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", kw)
    time.sleep(0.8)

def shot(cdp, name):
    r = cdp.call("Page.captureScreenshot", {"format": "png"})
    p = os.path.join(OUT, name)
    open(p, "wb").write(__import__("base64").b64decode(r["data"]))
    return p

# ---------- Run A：Toronto × 排盘北京 × 19:02 ----------
proc, cdp = launch("America/Toronto", FREEZE_A, "a")
try:
    report("A0 设备时区生效（Toronto, getTimezoneOffset=240）",
           ev(cdp, "new _RD0()" if False else "(function(){return new Date(2026,9,25).getTimezoneOffset();})()") == 240,
           ev(cdp, "new Date(2026,9,25).getTimezoneOffset()"))
    report("A1 时钟=19:02:30（本地）", txt(cdp, "#clock") == "19:02:30", txt(cdp, "#clock"))
    dl = txt(cdp, "#home-date-line") or ""
    report("A2 日期行=10月25日", "10月25日" in dl, dl)
    report("A3 日柱=壬申", "壬申" in (txt(cdp, "#pz-day") or ""), txt(cdp, "#pz-day"))
    pt = txt(cdp, "#pz-time") or ""
    report("A4 时柱=庚戌（非丙辰）", "庚戌" in pt and "丙辰" not in pt, pt)
    zs = txt(cdp, "#zhishen-line") or ""
    report("A5 四值神行已渲染（含时值神）", "时值神" in zs and len(zs) > 8, zs)
    today_cell = ev(cdp, "(function(){var e=document.querySelector('#cal-grid .day.today');return e?e.textContent.trim().slice(0,2):null;})()")
    report("A6 黄历 today 格=25", today_cell == "25", today_cell)
    shot(cdp, "home-toronto-beijing-390.png")
    # 切排盘时区 → auto → 再回 beijing，整卡必须纹丝不动
    click_el(cdp, "#tabbar button[data-tab='tab-me']")
    click_el(cdp, "#settings-open")
    click_el(cdp, "input[name='tz'][value='auto']")
    report("A7 切 auto 后时钟仍 19:02:30", txt(cdp, "#clock") == "19:02:30", txt(cdp, "#clock"))
    report("A8 切 auto 后日柱/时柱不变", "壬申" in (txt(cdp, "#pz-day") or "") and "庚戌" in (txt(cdp, "#pz-time") or ""))
    click_el(cdp, "input[name='tz'][value='beijing']")
    report("A9 切回 beijing 后整卡仍不变", txt(cdp, "#clock") == "19:02:30" and "庚戌" in (txt(cdp, "#pz-time") or ""))
    hint = ev(cdp, "(function(){var e=document.querySelector('[data-i18n=\"tz_hint\"]');return e?e.textContent:null;})()")
    report("A10 设置页 tz_hint 为新文案", bool(hint) and "只作用于排盘换算" in hint, hint)
    errs = ev(cdp, "window.__errs")
    report("A11 零 JS 异常", not errs, errs)
finally:
    proc.terminate()

# ---------- Run B：Toronto × 排盘北京 × 戊寅日正午 ----------
proc, cdp = launch("America/Toronto", FREEZE_B, "b")
try:
    st = txt(cdp, "#status-title") or ""
    report("B1 戊日判定按本地：状态卡=今日戊日", st == "今日戊日 · 不上香", st)
    dl = txt(cdp, "#home-date-line") or ""
    report("B2 日期行=10月31日", "10月31日" in dl, dl)
    errs = ev(cdp, "window.__errs")
    report("B3 零 JS 异常", not errs, errs)
finally:
    proc.terminate()

# ---------- Run C：Shanghai × 同一瞬间 → 整卡随系统 ----------
proc, cdp = launch("Asia/Shanghai", FREEZE_A, "c")
try:
    report("C1 时钟=07:02:30（上海本地）", txt(cdp, "#clock") == "07:02:30", txt(cdp, "#clock"))
    dl = txt(cdp, "#home-date-line") or ""
    report("C2 日期行=10月26日", "10月26日" in dl, dl)
    report("C3 日柱=癸酉", "癸酉" in (txt(cdp, "#pz-day") or ""), txt(cdp, "#pz-day"))
    report("C4 时柱=丙辰（上海口径正确）", "丙辰" in (txt(cdp, "#pz-time") or ""), txt(cdp, "#pz-time"))
    errs = ev(cdp, "window.__errs")
    report("C5 零 JS 异常", not errs, errs)
finally:
    proc.terminate()

passed = sum(1 for _, ok in results if ok)
line = "SMOKE v2329: %d/%d passed" % (passed, len(results))
print(line)
with open(os.path.join(OUT, "smoke-v2329-results.txt"), "w", encoding="utf-8") as f:
    for n, ok in results: f.write(("PASS " if ok else "FAIL ") + n + "\n")
    f.write(line + "\n")
sys.exit(0 if passed == len(results) else 1)
