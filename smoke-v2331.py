# -*- coding: utf-8 -*-
"""v2.3.0 (SW v131) 专项冒烟：奇门起局跟设备时间（用户 2026-10-25 19:37 裁定）。
背景：qimen-app.js wuriSolarCfg 是 v129 解耦后唯一保留读 CFG.tz（排盘时区）的
消费者——排盘时区=北京时，奇门真太阳时基准经线取东经 120°。本批改为与
app.js baseMeridian() 同口径：按设备时区推中央经线，起局跟手机系统时间；
排盘时区自此只作用于排盘输入换算本身。tz_hint 文案同步改准（简繁＋index）。
矩阵（冻结 2026-10-25T23:02:30Z；设备 TZ=America/Toronto → 本地 19:02:30 EDT；
CFG：排盘时区=beijing、timebase=true、lon=-73.4）：
  设备经线 -60（EDT 中央经线）→ 修正 round((-73.4+60)*4) = -54 分钟 → 18:08 酉时
  旧北京经线 120 → 修正 -774 分钟 → 06:08 卯时（癸卯时柱，本批必须消失）
  Node 独立参照（引擎直算）：baseLon=-60 → 阴遁8局·己酉时·修正 -54 分钟；
                              baseLon=120 → 阴遁8局·癸卯时·修正 -774 分钟。
  断言：盘面 = 设备口径（-54/己酉/阴遁8局）；设置页切排盘时区 beijing→auto 后
  重起盘，三项纹丝不动；首页此刻干支不回归（时钟 19:02:30、日柱壬申、
  时柱己酉——solarNow 同为设备经线口径）。零 JS 异常为硬性项。
结果落盘 qm131-shots/smoke-v2331-results.txt。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request
from datetime import datetime, timezone

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/qm131-shots")
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
report("S1 奇门不再读 CFG.tz 定基准经线", 'c.tz === "beijing" ? 120' not in qm_src)
report("S2 奇门基准经线改设备时区公式", "const meridian = -new Date().getTimezoneOffset() / 4;" in qm_src)
report("S3 app.js v129 口径未动（now 直通/baseMeridian 设备）",
       "function now() { return new Date(); }" in app_src and "function baseMeridian()" in app_src)
report("S4 四件套 v131", "wuri-v131" in sw_src and "style.css?v=131" in sw_src
       and "style.css?v=131" in idx_src and "（内部 v131）" in idx_src
       and "（内部 v131）" in i18n_src and "（內部 v131）" in i18n_src)
report("S5 tz_hint 新文案（简繁＋index）且旧文案清除",
       "奇门起局等「当下」时间始终跟随手机" in i18n_src
       and "奇門起局等「當下」時間始終跟隨手機" in i18n_src
       and "奇门起局等「当下」时间始终跟随手机" in idx_src
       and "按此时区定基准经线" not in i18n_src and "按此時區定基準經線" not in i18n_src
       and "按此时区定基准经线" not in idx_src)

FREEZE = int(datetime(2026, 10, 25, 23, 2, 30, tzinfo=timezone.utc).timestamp() * 1000)

port = base.free_port()
prof = "/tmp/chrome-qm131-%d" % port
env = dict(os.environ); env["TZ"] = "America/Toronto"
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
    "try { localStorage.setItem('wuri_cfg_v1', JSON.stringify({tz:'beijing', timebase:'true', lon:'-73.4'})); } catch(e){}"
) % FREEZE
cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": inject})
cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
time.sleep(3.5)

def ev(expr):
    r = cdp.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    return (r.get("result") or {}).get("value")

def txt(sel):
    return ev("(function(){var e=document.querySelector(%s);return e?e.textContent:null;})()" % json.dumps(sel))

def click_el(sel):
    r = ev("(function(){var e=document.querySelector(%s);if(!e)return null;var b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()" % json.dumps(sel))
    if not r: raise RuntimeError("not found: " + sel)
    for typ in ("mouseMoved", "mousePressed", "mouseReleased"):
        kw = {"type": typ, "x": r["x"], "y": r["y"]}
        if typ != "mouseMoved": kw.update({"button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", kw)
    time.sleep(0.8)

try:
    report("Q0 设备时区生效（Toronto, offset=240）",
           ev("(function(){return new Date(2026,9,25).getTimezoneOffset();})()") == 240)
    # 奇门脚本加载即自动起盘（qm-dt=nowStr 冻结时刻，CFG 经度 -73.4）
    meta = txt("#qm-metaPro") or ""
    sizhu = txt("#qm-sizhu") or ""
    report("Q1 盘面真太阳时修正=-54 分钟（设备经线 -60）", "修正 -54 分钟" in meta, meta[:200])
    report("Q2 旧北京口径 -774 分钟已消失", "-774" not in meta, meta[:200])
    report("Q3 时柱=己酉（18:08 酉时，非癸卯）", "己酉" in sizhu and "癸卯" not in sizhu, sizhu)
    report("Q4 局数=阴遁8局（与 Node 参照一致）", "阴遁8局" in meta, meta[:120])
    report("Q5 四柱日=壬申", "壬申" in sizhu, sizhu)
    # 首页不回归（同为设备口径：solarNow 修正 -53.6 分 → 18:08 酉时己酉）
    report("H1 首页时钟=19:02:30", txt("#clock") == "19:02:30", txt("#clock"))
    report("H2 首页日柱=壬申", "壬申" in (txt("#pz-day") or ""), txt("#pz-day"))
    pt = txt("#pz-time") or ""
    report("H3 首页时柱=己酉（设备经线口径）", "己酉" in pt, pt)
    # 切排盘时区 beijing → auto，奇门重起盘必须纹丝不动
    click_el("#tabbar button[data-tab='tab-me']")
    click_el("#settings-open")
    click_el("input[name='tz'][value='auto']")
    ev("document.querySelector('#qm-btnCast').click();")
    time.sleep(1.0)
    meta2 = txt("#qm-metaPro") or ""
    sizhu2 = txt("#qm-sizhu") or ""
    report("Q6 切 auto 后修正仍 -54 分钟", "修正 -54 分钟" in meta2 and "-774" not in meta2, meta2[:200])
    report("Q7 切 auto 后局数/时柱不变", "阴遁8局" in meta2 and "己酉" in sizhu2, (meta2[:120], sizhu2))
    hint = ev("(function(){var e=document.querySelector('[data-i18n=\"tz_hint\"]');return e?e.textContent:null;})()")
    report("Q8 设置页 tz_hint 为新文案", bool(hint) and "奇门起局等「当下」时间" in hint, hint)
    r = cdp.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, "qimen-toronto-device-390.png"), "wb").write(__import__("base64").b64decode(r["data"]))
    errs = ev("window.__errs")
    report("Z1 零 JS 异常", not errs, errs)
finally:
    proc.terminate()

passed = sum(1 for _, ok in results if ok)
line = "SMOKE v2331: %d/%d passed" % (passed, len(results))
print(line)
with open(os.path.join(OUT, "smoke-v2331-results.txt"), "w", encoding="utf-8") as f:
    for n, ok in results: f.write(("PASS " if ok else "FAIL ") + n + "\n")
    f.write(line + "\n")
sys.exit(0 if passed == len(results) else 1)
