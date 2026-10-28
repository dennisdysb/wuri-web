#!/usr/bin/env python3
# 专项冒烟（提醒页小修批）：①提醒时间框收小（页内 A/B 注入旧规则对量）
# ②每日经文推荐卡删「每日一经」栏目签（池日 reason 应为空、神诞日理由保留）
# ③点卡直达阅读器回归。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web-remindfix/www")
OUT = os.path.expanduser("~/workspace/wuri-web-remindfix/remindfix-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:500]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()

# ---------- S0 静态 ----------
css, app = rd("css/style.css"), rd("js/app.js")
report("S0a 时间框新规则在位", ".ics-time-row input[type=time]{min-width:8.8em;font-size:.97rem;padding:8px 12px}" in css)
report("S0b 卡签抑制逻辑在位", "rec.reason !== '每日一经'" in app)

FAKE_DATE = """
(function(){ var FIXED = new Date('%sT12:00:00').getTime();
  var RD = Date;
  function FD(){ if(arguments.length){ var a=[].slice.call(arguments); return new (Function.prototype.bind.apply(RD,[null].concat(a)))(); }
    return new RD(FIXED); }
  FD.now = function(){ return FIXED; };
  FD.parse = RD.parse; FD.UTC = RD.UTC; FD.prototype = RD.prototype;
  window.Date = FD; })();
"""

def session(tag, width, fake_date=None):
    port = base.free_port(); prof = "/tmp/chrome-remindfix-%s-%d" % (tag, port)
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                             "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required",
                             "--remote-debugging-port=%d" % port,
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
    c.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": 915, "deviceScaleFactor": 1, "mobile": True})
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"})
    if fake_date:
        c.call("Page.addScriptToEvaluateOnNewDocument", {"source": FAKE_DATE % fake_date})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    def ev(expr):
        r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r["result"].get("value")
    # 页面子资源慢，须等 load 完成（标签监听挂载晚于 DOMContentLoaded）
    for _ in range(40):
        try:
            if ev("document.readyState") == "complete": break
        except Exception: pass
        time.sleep(0.75)
    time.sleep(1.0)
    def shot(name):
        r = c.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))
    def goto_remind():
        ev("document.querySelector('[data-tab=\"tab-remind\"]').click()")
        time.sleep(1.2)
    return proc, c, ev, shot, goto_remind

MEASURE = """(()=>{ const el=document.querySelector('#ics-remind-time');
  const card=el.closest('.card'); const r=el.getBoundingClientRect(); const cr=card.getBoundingClientRect();
  return {w:r.width,h:r.height,withinCard:(r.right<=cr.right+0.5 && r.left>=cr.left-0.5),val:el.value}; })()"""
OLD_RULE = """(()=>{ const s=document.createElement('style'); s.id='ab-old';
  s.textContent='.ics-time-row input[type=time]{min-width:9.5em;font-size:1.04rem;padding:10px 14px}';
  document.head.appendChild(s); return true; })()"""
CARD_JS = """(()=>{ const q=s=>document.querySelector(s);
  return { title:(q('#jingrec-title')||{}).textContent, unit:(q('#jingrec-unit')||{}).textContent,
    gloss:(q('#jingrec-gloss')||{}).textContent, reason:(q('#jingrec-reason')||{}).textContent,
    errs: window.__errs||[] }; })()"""

for width in (412, 390):
    proc, c, ev, shot, goto_remind = session("w%d" % width, width)
    goto_remind()
    ev("document.querySelector('#ics-remind-time').scrollIntoView({block:'center'})"); time.sleep(0.5)
    new = ev(MEASURE)
    shot("timebox-after-%d.png" % width)
    ev(OLD_RULE); time.sleep(0.3)
    old = ev(MEASURE)
    shot("timebox-before-%d.png" % width)
    ev("document.querySelector('#ab-old').remove()")
    report("W%d 时间框宽度收小 8%%~20%%" % width, 0.80 <= new["w"]/old["w"] <= 0.92, "new=%s old=%s" % (new, old))
    report("W%d 时间框高度收小" % width, new["h"] < old["h"] - 2, "new=%s old=%s" % (new["h"], old["h"]))
    report("W%d 时间框不溢出卡片且值完好" % width, new["withinCard"] and new["val"] == "08:00", new)
    report("W%d 无 JS 异常" % width, not ev("window.__errs||[]"), ev("window.__errs||[]"))
    proc.terminate()

# 池日 2026-11-05：reason 应为空、点卡直达
proc, c, ev, shot, goto_remind = session("pool", 412, fake_date="2026-11-05")
goto_remind()
card = ev(CARD_JS)
report("池日 卡右下签已删（reason 空）", card["reason"] == "", card)
report("池日 经名/卷章/题解仍在", bool(card["title"]) and bool(card["unit"]) and bool(card["gloss"]), card)
ev("document.querySelector('#jingrec-card').scrollIntoView({block:'center'})"); time.sleep(0.5)
shot("card-pool-after.png")
ev("document.querySelector('#jingrec-go').click()"); time.sleep(3.0)
reader = ev("""(()=>{ const r=document.querySelector('#jing-reader');
  const jingView=document.querySelector('#view-jing');
  return { readerExists: !!r, readerVisible: r ? (r.offsetParent!==null || getComputedStyle(r).display!=='none') : false,
    readerText: r ? r.textContent.length : 0,
    jingActive: jingView ? !jingView.hidden : false }; })()""")
report("池日 点卡直达阅读器打开", reader["readerExists"] and reader["readerVisible"] and reader["readerText"] > 100, reader)
report("池日 无 JS 异常", not card["errs"], card["errs"])
proc.terminate()

# 神诞直配日 2028-01-30（正月初五·五路财神圣诞，s15）：理由保留
proc, c, ev, shot, goto_remind = session("shendan", 412, fake_date="2028-01-30")
goto_remind()
card = ev(CARD_JS)
report("神诞日 右下理由保留（圣诞缘由、非栏目签）", bool(card["reason"]) and "圣诞" in card["reason"], card)
ev("document.querySelector('#jingrec-card').scrollIntoView({block:'center'})"); time.sleep(0.5)
shot("card-shendan-after.png")
proc.terminate()

fails = [n for n, ok in results if not ok]
print("\n== %d/%d PASS ==" % (len(results) - len(fails), len(results)))
sys.exit(1 if fails else 0)
