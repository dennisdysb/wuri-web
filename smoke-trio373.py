#!/usr/bin/env python3
# 专项冒烟：三格 toggle＋底栏单字名＋面板钮 toggle 变色（2026-10-29 晚批）
# ① #jing-mymarks 可开合（回列表＋滚动恢复）、三格互切不叠开
# ② 底栏 读/背/字 单字、读/字面板 toggle＋.on、背诵 toggle＋.on（恒「背」）、
#    目录钮 toggle＋.on 同步（closeToc 撤）
# ③ 三类书矩阵：目录/读/背/字 恒显、全展开＝(节数>1)、注音＝bookHasPy 数据判定
# ④ 360 档三态（日/夜/红光 body.sky-red）钮文字不出界
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/.wt/trio-toggle/www")
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:300]), flush=True)

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
idx, jw, i18n = rd("index.html"), rd("js/jingwen.js"), rd("js/i18n.js")

report("S1 三格标记格无内联 onclick（防双触发抵消 toggle）",
       'id="jing-mymarks"' in idx and 'onclick="if(window.JingShowMarks)' not in idx)
report("S2 底栏静态钮名单字（读/背/字）",
       'id="jing-read-btn" aria-expanded="false">读<' in idx
       and 'id="jing-recite" data-i18n="jing_recite">背<' in idx
       and 'id="jing-font-btn" aria-expanded="false">字<' in idx)
report("S3 i18n jing_recite 简繁均单字背",
       "jing_recite: '背'," in i18n and i18n.count("jing_recite: '背',") >= 2)
report("S4 jingwen.js toggle 链在位",
       all(x in jw for x in ["function trioToggleMarks()", "window.__wuriCloseMarksToList = closeMarksToList",
                             "rb.classList.toggle('on', reciteMode)", "rb.textContent = t('jing_recite');",
                             "tbOn.classList.add('on')", "tbOff.classList.remove('on')",
                             "__wuriMarksIsOpen()"]))

port = base.free_port(); prof = f"/tmp/chrome-trio-{port}"
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
            if '"type": "undefined"' in str(e): return None
            last = e; time.sleep(1)
    raise last
for _ in range(120):
    try:
        if ev("document.readyState") == "complete" and ev("!!(window.JingWen && window.JingToggleMarks)"): break
    except Exception: pass
    time.sleep(0.5)
time.sleep(1.0)

def click(sel):
    return ev("var el=document.querySelector(%s); if(!el) false; else {el.click(); true}" % json.dumps(sel))
def vis(sel):
    return ev("var el=document.querySelector(%s); !!el && !el.hidden && getComputedStyle(el).display!=='none'" % json.dumps(sel))

# ---------- 进经文页 ----------
ev("(function(){var t=document.querySelector('[data-tab=\"tab-jing\"]'); if(t) t.click(); return 'ok';})()")
time.sleep(1.2)
report("T0 经文页在场、三格可见", vis("#jing-trio") and vis("#jing-list"), ev("document.querySelectorAll('.jing-trio-cell').length"))

# ---------- ① 三格 toggle ----------
ev("window.scrollTo(0, 900); 'ok'"); time.sleep(0.4)
y0 = ev("window.scrollY")
report("T1 列表已滚下（造滚动位）", (y0 or 0) > 200, y0)
click("#jing-mymarks"); time.sleep(0.8)
report("T2 点我的标记→标记页开、列表隐", vis("#jing-marks") and not vis("#jing-list"),
       (vis("#jing-marks"), vis("#jing-list")))
click("#jing-mymarks"); time.sleep(0.8)
y1 = ev("window.scrollY")
report("T3 再点我的标记→合回列表", vis("#jing-list") and not vis("#jing-marks"), (vis("#jing-list"), vis("#jing-marks")))
report("T4 滚动位置恢复（±6px）", y1 is not None and abs(y1 - (y0 or 0)) <= 6, (y0, y1))
# 互切：开标记 → 点统计（标记应收、统计展开）
click("#jing-mymarks"); time.sleep(0.7)
click("#jing-stats-row"); time.sleep(0.7)
report("T5 开标记时点统计→标记收、统计明细开", vis("#jing-list") and not vis("#jing-marks") and vis("#jing-stats-detail"),
       (vis("#jing-marks"), vis("#jing-stats-detail")))
click("#jing-stats-row"); time.sleep(0.5)
report("T6 再点统计→明细合（原 toggle 不回归）", not vis("#jing-stats-detail"), vis("#jing-stats-detail"))
# 生词本 toggle 本体＋互切
click("#jing-vocab-row"); time.sleep(0.5)
report("T7 点生词本→面板开", vis("#jing-vocab-panel"), vis("#jing-vocab-panel"))
click("#jing-mymarks"); time.sleep(0.7)
report("T8 开生词时点标记→生词收、标记开", vis("#jing-marks") and not vis("#jing-vocab-panel"),
       (vis("#jing-marks"), vis("#jing-vocab-panel")))
click("#jing-vocab-row"); time.sleep(0.7)
report("T9 开标记时点生词→标记收、生词开", vis("#jing-vocab-panel") and not vis("#jing-marks") and vis("#jing-list"),
       (vis("#jing-vocab-panel"), vis("#jing-marks")))
click("#jing-vocab-row"); time.sleep(0.5)
report("T10 再点生词→合", not vis("#jing-vocab-panel"), vis("#jing-vocab-panel"))
# 返回目录钮路径（走 closeMarksToList，滚动亦恢复）
ev("window.scrollTo(0, 700); 'ok'"); time.sleep(0.3)
y2 = ev("window.scrollY")
click("#jing-mymarks"); time.sleep(0.7)
click("#marks-back"); time.sleep(0.7)
y3 = ev("window.scrollY")
report("T11 标记页‹返回目录→回列表＋滚动恢复", vis("#jing-list") and not vis("#jing-marks") and y3 is not None and abs(y3 - (y2 or 0)) <= 6,
       (vis("#jing-list"), y2, y3))

# ---------- ②③ 开书矩阵＋底栏 toggle ----------
# 沙箱档案种 Pro（与 v371 批冒烟同口径）：内丹/道藏正文为高级版门控，
# 不种会被锁卡拦住、开不了书
ev("localStorage.setItem('wuri_pro_redeem','1'); 'pro-seeded'"); time.sleep(0.4)
def open_book(bid, wait=14):
    ev("window.JingWen.openReader(%s); 'ok'" % json.dumps(bid))
    for _ in range(wait * 2):
        if ev("window._jingCurrentId") == bid and ev("document.querySelectorAll('#jing-content .jing-para').length") > 0:
            time.sleep(0.6); return True
        time.sleep(0.5)
    return False

def dock_state():
    return ev("""(function(){
      var out = {};
      document.querySelectorAll('#jing-dock-main .jd-btn').forEach(function(b){
        var r = b.getBoundingClientRect();
        out[b.id] = { text: b.textContent.trim(), vis: !b.hidden && r.width > 0,
                      on: b.classList.contains('on'), sw: b.scrollWidth, cw: b.clientWidth,
                      right: Math.round(r.right) };
      });
      return out;
    })()""")

def book_facts(bid):
    return ev("""(function(){
      var d = window.JINGWEN && JINGWEN[%s]; if(!d) return null;
      var hasPy = false;
      (d.sections||[]).forEach(function(s){ (s.paras||[]).forEach(function(p){
        if (p && p.py && p.py.some(function(x){ return x; })) hasPy = true; }); });
      return { secs: (d.sections||[]).length, hasPy: hasPy };
    })()""" % json.dumps(bid))

MATRIX = [
    ("s02", "常见经文（功课经）"),
    ("s18", "内丹"),
    ("KR5c0002", "KR 挂靠常见"),
    ("KR5a0220", "道藏全集（度人上经大法）"),
    ("s33", "常见单节（阴符经）"),
]
first_book = True
for bid, label in MATRIX:
    ok = open_book(bid, wait=40 if bid.startswith("KR5a") else 14)
    if not ok:
        report(f"M[{bid}] 打开《{label}》", False, ev("window._jingCurrentId"))
        continue
    f = book_facts(bid)
    st = dock_state()
    base_ok = all(st.get(k, {}).get("vis") for k in ["jing-toc-btn", "jing-read-btn", "jing-recite", "jing-font-btn"])
    names_ok = (st.get("jing-read-btn", {}).get("text") == "读" and st.get("jing-recite", {}).get("text") == "背"
                and st.get("jing-font-btn", {}).get("text") == "字" and st.get("jing-toc-btn", {}).get("text") == "目录")
    fold_ok = st.get("jing-foldall", {}).get("vis") == bool(f and f["secs"] > 1)
    py_ok = st.get("jing-pybtn", {}).get("vis") == bool(f and f["hasPy"])
    fit_ok = all((v["sw"] <= v["cw"] + 1 and v["right"] <= 361) for v in st.values() if v["vis"])
    report(f"M[{bid}] {label}：四钮恒显＋名单字", base_ok and names_ok, json.dumps(st, ensure_ascii=False)[:220])
    report(f"M[{bid}] 全展开显隐＝节数>1（{f and f['secs']} 节）", fold_ok, json.dumps(st.get("jing-foldall"), ensure_ascii=False))
    report(f"M[{bid}] 注音显隐＝有注音数据（{f and f['hasPy']}）", py_ok, json.dumps(st.get("jing-pybtn"), ensure_ascii=False))
    report(f"M[{bid}] 360 档可见钮文字不出界", fit_ok, json.dumps({k: (v["sw"], v["cw"], v["right"]) for k, v in st.items() if v["vis"]}, ensure_ascii=False))

    if first_book:
        first_book = False
        # 读面板 toggle＋变色
        click("#jing-read-btn"); time.sleep(0.5)
        st = dock_state()
        report("D1 点读→播放面板开＋钮 .on", vis("#jing-play-panel") and st["jing-read-btn"]["on"], json.dumps(st["jing-read-btn"]))
        click("#jing-read-btn"); time.sleep(0.5)
        st = dock_state()
        report("D2 再点读→面板合＋.on 撤", not vis("#jing-play-panel") and not st["jing-read-btn"]["on"], json.dumps(st["jing-read-btn"]))
        # 字面板 toggle＋与读互斥
        click("#jing-font-btn"); time.sleep(0.5)
        st = dock_state()
        report("D3 点字→显示面板开＋钮 .on", vis("#jing-font-panel") and st["jing-font-btn"]["on"], json.dumps(st["jing-font-btn"]))
        click("#jing-read-btn"); time.sleep(0.5)
        st = dock_state()
        report("D4 开字时点读→字合读开（互斥不回归）", vis("#jing-play-panel") and not vis("#jing-font-panel")
               and st["jing-read-btn"]["on"] and not st["jing-font-btn"]["on"], "")
        click("#jing-read-btn"); time.sleep(0.4)
        # 背诵 toggle＋变色＋恒字
        click("#jing-recite"); time.sleep(0.9)
        st = dock_state()
        rec_on = ev("document.getElementById('jing-content').classList.contains('recite-on')")
        report("D5 点背→背诵开＋钮 .on＋钮面恒「背」", rec_on and st["jing-recite"]["on"] and st["jing-recite"]["text"] == "背",
               json.dumps(st["jing-recite"]) + " recite-on=" + str(rec_on))
        click("#jing-recite"); time.sleep(0.9)
        st = dock_state()
        rec_off = ev("document.getElementById('jing-content').classList.contains('recite-on')")
        report("D6 再点背→背诵退＋.on 撤＋钮面仍「背」", (not rec_off) and not st["jing-recite"]["on"] and st["jing-recite"]["text"] == "背",
               json.dumps(st["jing-recite"]))
        # 目录：钮开→.on；程序态再点（click() 直调，绕覆盖层）→关＋撤 .on
        click("#jing-toc-btn"); time.sleep(0.6)
        st = dock_state()
        report("D7 点目录→抽屉开＋钮 .on", vis("#jing-toc") and st["jing-toc-btn"]["on"], json.dumps(st["jing-toc-btn"]))
        ev("document.getElementById('jing-toc-btn').click(); 'ok'"); time.sleep(0.5)
        st = dock_state()
        report("D8 目录已开再点钮→抽屉合＋.on 撤", not vis("#jing-toc") and not st["jing-toc-btn"]["on"], json.dumps(st["jing-toc-btn"]))
        # 遮罩关目录路径 .on 同步
        click("#jing-toc-btn"); time.sleep(0.5)
        ev("(function(){var b=document.querySelector('#jing-toc [data-toc-close]'); if(b) b.click(); return 'ok';})()"); time.sleep(0.5)
        st = dock_state()
        report("D9 遮罩关目录→.on 同步撤", not vis("#jing-toc") and not st["jing-toc-btn"]["on"], json.dumps(st["jing-toc-btn"]))
    # 关书回列表
    ev("if(window.JingWen && JingWen.closeReader) JingWen.closeReader(); 'ok'")
    time.sleep(0.7)

# ---------- 三态下底栏出界复验（夜＋红光） ----------
ok = open_book("s02")
if ok:
    ev("(function(){var t=document.querySelector('[data-theme-toggle]'); if(t) t.click(); return 'night';})()"); time.sleep(0.6)
    st = dock_state()
    fit_n = all((v["sw"] <= v["cw"] + 1 and v["right"] <= 361) for v in st.values() if v["vis"])
    report("N1 夜间态 360 档底栏不出界", fit_n, json.dumps({k: (v["sw"], v["cw"]) for k, v in st.items() if v["vis"]}))
    ev("document.body.classList.add('sky-red'); 'red'"); time.sleep(0.4)
    st = dock_state()
    fit_r = all((v["sw"] <= v["cw"] + 1 and v["right"] <= 361) for v in st.values() if v["vis"])
    on_ok = ev("getComputedStyle(document.getElementById('jing-read-btn')).backgroundColor") is not None
    report("N2 红光态（body.sky-red）360 档底栏不出界", fit_r, json.dumps({k: (v["sw"], v["cw"]) for k, v in st.items() if v["vis"]}))
    click("#jing-read-btn"); time.sleep(0.4)
    st = dock_state()
    report("N3 红光态读钮 .on 仍可置位", st["jing-read-btn"]["on"], json.dumps(st["jing-read-btn"]))
else:
    report("N1-N3 三态复验（重开 s02）", False, ev("window._jingCurrentId"))

errs = ev("window.__errs || []")
report("E0 全程无 JS 异常", not errs, errs)
fails = [n for n, ok in R if not ok]
print(f"\n== SMOKE {'ALL PASS' if not fails else 'FAIL: ' + str(fails)} ({len(R) - len(fails)}/{len(R)}) ==")
try: proc.terminate()
except Exception: pass
sys.exit(1 if fails else 0)
