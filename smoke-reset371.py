#!/usr/bin/env python3
# 专项冒烟：阅读器两项裁定（内部 v371）——①统计重置（设置页底部低调入口）
# ②常见经文区撤来源标注（#jing-srcnote）
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64, hashlib
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/.wt/reader-reset-370/www")
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:300]), flush=True)

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
idx, jw = rd("index.html"), rd("js/jingwen.js")

report("S1 设置页含重置入口且位于图鉴卡之后（底部次级区）",
       'id="stats-reset-btn"' in idx and idx.index('id="stats-reset-btn"') > idx.index('id="deity-dl-btn"')
       and 'id="stats-reset-msg"' in idx and 'class="mini-btn" id="stats-reset-btn"' in idx)
report("S2 jingwen.js 重置链源码在位（屏障/tombstone/导出/接线）",
       all(x in jw for x in ["rpResetStats", "RP_RESET_KEY = 'wuri_jing_stats_reset_at'",
                             "deleted: true", "reset: rpResetStats", "stats-reset-btn",
                             "localStorage.removeItem(RP_STATS_KEY)", "localStorage.removeItem(WK_SHOWN_KEY)"]))
report("S3 常见区判定与 srcnote 条件在位",
       "function isCommonShelf(d)" in jw and "!isKrSourced(d) && !isCommonShelf(d)" in jw)

port = base.free_port(); prof = f"/tmp/chrome-reset370-{port}"
proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
    "--allow-file-access-from-files",
    "--hatch-webgl-allowed-domains-file=" + _WG, "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
    f"--remote-debugging-port={port}",
    f"--user-data-dir={prof}", "--window-size=360,740", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    env={**os.environ, "TZ": "America/Toronto"})
ws = None
for _ in range(40):
    try:
        tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=3))
        pages = [t for t in tabs if t["type"] == "page"]
        if pages: ws = pages[0]["webSocketDebuggerUrl"]; break
    except Exception: pass
    time.sleep(0.5)
assert ws, "chrome CDP 未就绪"
cdp = base.CDP(base.ws_connect(ws))
cdp.call("Page.enable"); cdp.call("Runtime.enable")
cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source":
  "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e.error))});"})
cdp.call("Emulation.setDeviceMetricsOverride", {"width": 360, "height": 740, "deviceScaleFactor": 2, "mobile": True})
cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})

def ev(expr):
    last = None
    for _ in range(4):
        try: return cdp.evaluate(expr)
        except Exception as e:
            if '"type": "undefined"' in str(e): return None  # 语句式表达式无返回值
            last = e; time.sleep(1)
    raise last
for _ in range(120):
    try:
        if ev("document.readyState") == "complete" and ev("!!(window.JingWen && window.__wuriStats)"): break
    except Exception: pass
    time.sleep(0.5)
time.sleep(1.0)

# ---------- ① 造数 ----------
seed = ev("""(function(){
  var devId = (window.WuriAccount && WuriAccount._deviceId) ? WuriAccount._deviceId() : '';
  var today = new Date(); var y = new Date(Date.now()-86400000);
  function k(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  var stats = {days:{}, fin:{s1: 1760000000000, s33: 1760000100000}, total: 5400};
  stats.days[k(today)] = 3600; stats.days[k(y)] = 1800;
  localStorage.setItem('wuri_jing_stats_v1', JSON.stringify(stats));
  var remote = {}; remote[devId] = {days:{}, fin:{s1: 1760000000000}}; remote[devId].days[k(today)] = 3600;
  remote['other-dev-xyz'] = {days:{}, fin:{s07: 1760000200000}}; remote['other-dev-xyz'].days[k(today)] = 600;
  localStorage.setItem('wuri_jing_stats_remote_v1', JSON.stringify(remote));
  localStorage.setItem('wuri_jing_wk_shown', '2099-01-04');
  localStorage.setItem('wuri_jing_autopos', JSON.stringify({s1:{sec:2,frac:0.5,ts:1}}));
  localStorage.setItem('wuri_jing_pos_s1', '12345');
  localStorage.setItem('wuri_jing_bookmarks', JSON.stringify([{id:'s1',sec:0,para:1,ts:1}]));
  localStorage.setItem('wuri_jing_highlights', JSON.stringify([{id:'hl1',sid:'s1'}]));
  localStorage.setItem('wuri_jing_vocab', JSON.stringify([{w:'道',ts:1}]));
  return devId;
})()""")
report("R1 造数完成（设备 id 取得）", bool(seed), seed)
m0 = ev("window.__wuriStats.merged()")
report("R2 重置前合并统计非零", m0 and m0.get("total", 0) >= 5400 and len(m0.get("fin", {})) >= 2, m0)

# 取消路径：confirm=false 时不得动数据
ev("window.confirm = function(t){ window.__confirmText = t; return false; }; document.getElementById('stats-reset-btn').click();")
time.sleep(0.3)
report("R3 取消确认 → 数据不动＋弹窗文案含关键句",
       ev("!!localStorage.getItem('wuri_jing_stats_v1')")
       and "不可恢复" in (ev("window.__confirmText") or "") and "不受影响" in (ev("window.__confirmText") or ""))

# 确认路径
snap_unrel = ev("""(function(){ return ['wuri_jing_autopos','wuri_jing_pos_s1','wuri_jing_bookmarks','wuri_jing_highlights','wuri_jing_vocab'].map(function(k){return localStorage.getItem(k);}).join('|'); })()""")
ev("window.confirm = function(t){ window.__confirmText = t; return true; }; document.getElementById('stats-reset-btn').click();")
time.sleep(0.6)
report("R4 本机统计键已清", ev("localStorage.getItem('wuri_jing_stats_v1')") is None)
m1 = ev("window.__wuriStats.merged()")
report("R5 合并视图归零", m1 and m1.get("total", -1) == 0 and len(m1.get("fin", {})) == 0 and len(m1.get("days", {})) == 0, m1)
rem = ev("JSON.parse(localStorage.getItem('wuri_jing_stats_remote_v1') || '{}')")
report("R6 远端缓存：本设备桶除、他设备桶留",
       isinstance(rem, dict) and seed not in rem and "other-dev-xyz" in rem, rem)
report("R7 周结旗标复位＋屏障已立",
       ev("localStorage.getItem('wuri_jing_wk_shown')") is None
       and int(ev("localStorage.getItem('wuri_jing_stats_reset_at')") or 0) > 0)
snap_unrel2 = ev("""(function(){ return ['wuri_jing_autopos','wuri_jing_pos_s1','wuri_jing_bookmarks','wuri_jing_highlights','wuri_jing_vocab'].map(function(k){return localStorage.getItem(k);}).join('|'); })()""")
report("R8 进度/书签/划线/生词本逐字未动", snap_unrel == snap_unrel2)
report("R9 反馈文案（未登录分支）", ev("document.getElementById('stats-reset-msg').textContent") == "已重置：本机阅读统计已清零。",
       ev("document.getElementById('stats-reset-msg').textContent"))
report("R10 统计行归零显示", "0 分钟" in (ev("document.getElementById('jing-stats-sum').textContent") or ""),
       ev("document.getElementById('jing-stats-sum').textContent"))

# 设置页 360 档无横溢（只显设置视图量 scrollWidth）
ev("document.querySelectorAll('.view').forEach(function(v){ v.hidden = v.id !== 'view-settings'; });")
time.sleep(0.3)
report("R11 设置页 360 档无横向溢出", ev("document.documentElement.scrollWidth") <= 362,
       ev("document.documentElement.scrollWidth"))

# ---------- ② 来源标注 ----------
ev("localStorage.setItem('wuri_pro_redeem','1');")
def open_book(bid):
    ev("window.JingWen.openReader(%s);" % json.dumps(bid))
    for _ in range(40):
        if ev("!!(window._jingCurrentId === %s && document.getElementById('jing-title').textContent)" % json.dumps(bid)):
            break
        time.sleep(0.5)
    time.sleep(0.4)
open_book("s33")
report("R12 常见本地书 s33 书头无来源行",
       ev("document.getElementById('jing-srcnote').hidden") is True
       and ev("document.getElementById('jing-reader').hidden") is False)
# 给常见书注入 note（模拟带来源数据）→ 仍须隐藏
ev("window.JINGWEN['s33'].note = '底本：冒烟测试来源标注';")
open_book("s33")
report("R13 常见书带 note 注入 → 来源行仍隐藏（本批改动点）",
       ev("document.getElementById('jing-srcnote').hidden") is True)
# 内丹本地书注入 note → 照旧显示（证明只按区收、非全灭）
open_book("s18")
ev("window.JINGWEN['s18'].note = '底本：冒烟测试来源标注';")
open_book("s18")
report("R14 内丹本地书 s18 来源行照旧显示（回归）",
       ev("document.getElementById('jing-srcnote').hidden") is False
       and "冒烟测试来源标注" in (ev("document.getElementById('jing-srcnote').textContent") or ""))
# KR 挂靠常见书 → 隐藏（v352 口径回归）
try:
    open_book("KR5c0002")
    kr_ok = ev("document.getElementById('jing-srcnote').hidden") is True and ev("window._jingCurrentId") == "KR5c0002"
    report("R15 KR 挂靠常见书 KR5c0002 来源行隐藏（回归）", kr_ok, ev("window._jingCurrentId"))
except Exception as e:
    report("R15 KR 挂靠常见书 KR5c0002 来源行隐藏（回归）", False, str(e)[:200])

# ---------- 三态 ----------
ev("document.querySelector('input[name=theme][value=night]').click(); true")
time.sleep(1.2)
r16 = cdp.call("Runtime.evaluate", {"expression": "window.JingWen.openReader('s33'); 'opened'", "returnByValue": True})
print("三态段 openReader 原始回执:", json.dumps(r16)[:600])
for _ in range(40):
    if ev("window._jingCurrentId") == "s33": break
    time.sleep(0.5)
time.sleep(0.5)
night_ok = ev("document.getElementById('jing-srcnote').hidden") is True
ev("var __rbt = document.getElementById('sky-red-toggle-me'); if (__rbt && !__rbt.checked) __rbt.click(); true")
time.sleep(0.4)
open_book("s33")
red_ok = ev("document.getElementById('jing-srcnote').hidden") is True
report("R16 夜间＋红光态来源行仍隐藏", night_ok and red_ok)
errs = ev("window.__errs || []")
report("R17 全程无 JS 异常", errs == [], errs)

fails = [n for n, ok in R if not ok]
print("\n结果: PASS %d / FAIL %d %s" % (len(R) - len(fails), len(fails), fails))
try: proc.terminate()
except Exception: pass
sys.exit(1 if fails else 0)
