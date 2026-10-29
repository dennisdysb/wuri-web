#!/usr/bin/env python3
# 专项冒烟：「我的标记」全部删除（2026-10-29 用户提议批）
# 造跨两书 8 条标记（书签3＋高亮3＋心得2）→ 页头钮确认弹窗（App 内、
# 非原生）→ 取消/点遮罩不删 → 汇总页「本书」范围删 s02（5 条，手术式、
# s18 不动）→ 正文高亮同步消失 → 页头钮全部删除 → 三键清空、三格计数
# 归零、面板回空态；生词本/统计/阅读位置三只金丝雀不得误伤。
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/.wt/marks-clearall/www")
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:300]), flush=True)

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
jw, css = rd("js/jingwen.js"), rd("css/style.css")
report("S1 JingMark 清空 API 在位且导出",
       all(x in jw for x in ["function clearAllMarks()", "function clearBookMarks(sid)",
                             "clearAllMarks: clearAllMarks", "clearBookMarks: clearBookMarks"]))
report("S2 列表模块：计数/自有弹窗/两钮/委托处理在位",
       all(x in jw for x in ["function marksCounts(JM, sid)", "function showMarksConfirm(opts, onOk)",
                             "id=\"marks-clear-all\"", "id=\"lines-clear\"",
                             "askClearAllMarks(window.JingMark)", "askClearBookMarks(JM3, bookSid3)"]))
report("S3 弹窗 CSS 走变量链（--bg/--line）且有 [hidden] 收起规则",
       ".marks-confirm{position:fixed" in css and "var(--bg,#fff)" in css
       and ".marks-confirm[hidden]{display:none}" in css and ".marks-clear-btn" in css)

port = base.free_port(); prof = f"/tmp/chrome-marks-{port}"
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
        if ev("document.readyState") == "complete" and ev("!!(window.JingWen && window.JingMark && window.JingToggleMarks)"): break
    except Exception: pass
    time.sleep(0.5)
time.sleep(1.0)

def click(sel):
    return ev("var el=document.querySelector(%s); if(!el) false; else {el.click(); true}" % json.dumps(sel))
def vis(sel):
    return ev("var el=document.querySelector(%s); !!el && !el.hidden && getComputedStyle(el).display!=='none'" % json.dumps(sel))
def lsget(k):
    return ev("localStorage.getItem(%s)" % json.dumps(k))

# ---------- 造数：跨两书 8 条标记＋三只金丝雀 ----------
ev("""(function(){
  localStorage.setItem('wuri_pro_redeem','1');
  localStorage.setItem('wuri_jing_bookmarks', JSON.stringify({
    s02: [{id:'bm_t1', ts:1730000000000, off:0, expanded:[], scrollTop:0},
          {id:'bm_t2', ts:1730000060000, off:10, expanded:[], scrollTop:0}],
    s18: [{id:'bm_t3', ts:1730000000000, off:0, expanded:[], scrollTop:0}]
  }));
  localStorage.setItem('wuri_jing_highlights', JSON.stringify([
    {id:'hl_t1', sid:'s02', sec:0, para:0, start:0, end:3, text:'测试甲', color:'yellow', ts:1730000000000},
    {id:'hl_t2', sid:'s02', sec:0, para:1, start:0, end:3, text:'测试乙', color:'red', ts:1730000100000},
    {id:'hl_t3', sid:'s18', sec:0, para:0, start:0, end:3, text:'测试丙', color:'blue', ts:1730000200000}
  ]));
  localStorage.setItem('wuri_jing_notes', JSON.stringify([
    {id:'nt_t1', highlightId:'hl_t1', sid:'s02', bookTitle:'', text:'心得一', createdAt:1730000000000, updatedAt:1730000000000},
    {id:'nt_t2', highlightId:'hl_t3', sid:'s18', bookTitle:'', text:'心得二', createdAt:1730000000000, updatedAt:1730000000000}
  ]));
  localStorage.setItem('wuri_jing_autopos', JSON.stringify({ s02: { ts: Date.now(), y: 0, expanded: [] } }));
  localStorage.setItem('wuri_jing_vocab', JSON.stringify({ '测试词': { ts: 1 } }));
  localStorage.setItem('wuri_jing_stats_v1', JSON.stringify({ canary: 42 }));
  return 'seeded';
})()""")
can_vocab, can_stats = lsget('wuri_jing_vocab'), lsget('wuri_jing_stats_v1')

# ---------- 进经文页：三格计数＝8 ----------
ev("(function(){var t=document.querySelector('[data-tab=\"tab-jing\"]'); if(t) t.click(); return 'ok';})()")
time.sleep(1.2)
report("T1 三格「我的标记」计数＝8 条", ev("document.getElementById('jing-marks-count').textContent") == "8 条",
       ev("document.getElementById('jing-marks-count').textContent"))

# 基线：s02 正文能渲出存量高亮（证明造数坐标有效，后面才谈得上「同步消失」）
ev("window.JingWen.openReader('s02'); 'ok'")
for _ in range(30):
    if ev("window._jingCurrentId") == "s02" and (ev("document.querySelectorAll('#jing-content .jing-para').length") or 0) > 0: break
    time.sleep(0.5)
time.sleep(0.8)
hl0 = ev("document.querySelectorAll('#jing-content .jing-para .hl').length") or 0
report("T2 基线：s02 正文高亮 span ≥1", hl0 >= 1, hl0)
ev("if(window.JingWen && JingWen.closeReader) JingWen.closeReader(); 'ok'"); time.sleep(0.7)

# ---------- 开标记页：页头全部删除钮＋自有确认弹窗 ----------
click("#jing-mymarks"); time.sleep(0.8)
report("T3 标记页开、页头「全部删除」钮在位", vis("#jing-marks") and vis("#marks-clear-all"),
       (vis("#jing-marks"), vis("#marks-clear-all")))
click("#marks-clear-all"); time.sleep(0.5)
mtitle = ev("document.getElementById('marks-confirm-title').textContent")
mtext = ev("document.getElementById('marks-confirm-text').textContent")
report("T4 点全部删除→App 内弹窗出（非原生）、文案含总数与三类条数",
       vis("#marks-confirm") and mtitle == "全部删除"
       and "全部 8 条标记" in (mtext or "") and "书签（3 条）" in (mtext or "")
       and "高亮（3 条）" in (mtext or "") and "心得（2 条）" in (mtext or ""),
       (mtitle, mtext))
click("#marks-confirm-cancel"); time.sleep(0.4)
n_after_cancel = ev("(function(){var b=JSON.parse(localStorage.getItem('wuri_jing_bookmarks')||'{}');"
                    "var h=JSON.parse(localStorage.getItem('wuri_jing_highlights')||'[]');"
                    "var n=JSON.parse(localStorage.getItem('wuri_jing_notes')||'[]');"
                    "var bc=0; Object.keys(b).forEach(function(k){bc+=b[k].length});"
                    "return bc+h.length+n.length;})()")
report("T5 取消→弹窗合、8 条一条不少", not vis("#marks-confirm") and n_after_cancel == 8, n_after_cancel)
click("#marks-clear-all"); time.sleep(0.4)
click("#marks-confirm-backdrop"); time.sleep(0.4)
report("T6 点遮罩→弹窗合、数据仍在", not vis("#marks-confirm")
       and (ev("JSON.parse(localStorage.getItem('wuri_jing_highlights')||'[]').length") == 3), "")

# ---------- 汇总页：范围切换与「删除本书标记」 ----------
click(".marks-tab[data-tab='lines']"); time.sleep(0.7)
lab_all = ev("var b=document.getElementById('lines-clear'); b ? b.textContent : null")
report("T7 汇总页（全部范围）删除钮＝「全部删除」", lab_all == "全部删除", lab_all)
click("[data-lines-scope='book']"); time.sleep(0.7)
lab_book = ev("var b=document.getElementById('lines-clear'); b ? b.textContent : null")
report("T8 切「本书」→删除钮＝「删除本书标记」", lab_book == "删除本书标记", lab_book)
click("#lines-clear"); time.sleep(0.5)
mtitle2 = ev("document.getElementById('marks-confirm-title').textContent")
mtext2 = ev("document.getElementById('marks-confirm-text').textContent")
report("T9 本书弹窗：标题/文案明确本书＋5 条＋三类分布",
       vis("#marks-confirm") and mtitle2 == "删除本书标记"
       and "的全部 5 条标记" in (mtext2 or "") and "这本书的书签（2 条）" in (mtext2 or "")
       and "高亮（2 条）" in (mtext2 or "") and "心得（1 条）" in (mtext2 or ""),
       (mtitle2, mtext2))
click("#marks-confirm-ok"); time.sleep(0.6)
state = ev("""(function(){
  var b=JSON.parse(localStorage.getItem('wuri_jing_bookmarks')||'{}');
  var h=JSON.parse(localStorage.getItem('wuri_jing_highlights')||'[]');
  var n=JSON.parse(localStorage.getItem('wuri_jing_notes')||'[]');
  return { bmS02: !b.s02, bmS18: (b.s18||[]).length, hlIds: h.map(function(x){return x.id}),
           ntIds: n.map(function(x){return x.id}),
           trio: document.getElementById('jing-marks-count').textContent };
})()""")
report("T10 本书删除手术式生效：s02 三类全清、s18 三类俱在、三格计数＝3 条",
       state and state["bmS02"] and state["bmS18"] == 1 and state["hlIds"] == ["hl_t3"]
       and state["ntIds"] == ["nt_t2"] and state["trio"] == "3 条", json.dumps(state, ensure_ascii=False))

# 正文同步：重开 s02，高亮应已消失
click("#marks-back"); time.sleep(0.6)
ev("window.JingWen.openReader('s02'); 'ok'")
for _ in range(30):
    if ev("window._jingCurrentId") == "s02" and (ev("document.querySelectorAll('#jing-content .jing-para').length") or 0) > 0: break
    time.sleep(0.5)
time.sleep(0.8)
hl1 = ev("document.querySelectorAll('#jing-content .jing-para .hl').length") or 0
report("T11 本书删除后 s02 正文高亮 span＝0（同步消失）", hl1 == 0, hl1)
ev("if(window.JingWen && JingWen.closeReader) JingWen.closeReader(); 'ok'"); time.sleep(0.7)

# ---------- 红光态弹窗不溢出（360 档） ----------
click("#jing-mymarks"); time.sleep(0.7)
ev("document.body.classList.add('sky-red'); 'red'"); time.sleep(0.3)
click("#marks-clear-all"); time.sleep(0.4)
box = ev("(function(){var b=document.querySelector('.marks-confirm-box'); if(!b) return null;"
         "var r=b.getBoundingClientRect(); return {l: Math.round(r.left), r: Math.round(r.right)};})()")
report("T12 红光态确认弹窗在 360 视口内不溢出", vis("#marks-confirm") and box and box["l"] >= 0 and box["r"] <= 361,
       json.dumps(box))
click("#marks-confirm-cancel"); time.sleep(0.3)
ev("document.body.classList.remove('sky-red'); 'day'"); time.sleep(0.3)

# ---------- 全部删除收官 ----------
can_pos = lsget('wuri_jing_autopos')  # 全删前一刻取样（开书会正常改写位置记忆）
click("#marks-clear-all"); time.sleep(0.4)
mtext3 = ev("document.getElementById('marks-confirm-text').textContent")
report("T13 全部删除弹窗按剩余实数：3 条", "全部 3 条标记" in (mtext3 or ""), mtext3)
click("#marks-confirm-ok"); time.sleep(0.6)
fin = ev("""(function(){
  return { bm: localStorage.getItem('wuri_jing_bookmarks'), hl: localStorage.getItem('wuri_jing_highlights'),
           nt: localStorage.getItem('wuri_jing_notes'),
           trio: document.getElementById('jing-marks-count').textContent,
           clearBtn: !!document.getElementById('marks-clear-all'),
           emptyHint: (document.getElementById('jing-marks').textContent.indexOf('暂无书签') >= 0) };
})()""")
report("T14 全部删除后：三键清空、三格计数 0 条、页头钮消失、面板回空态",
       fin and fin["bm"] == "{}" and fin["hl"] == "[]" and fin["nt"] == "[]"
       and fin["trio"] == "0 条" and not fin["clearBtn"] and fin["emptyHint"],
       json.dumps(fin, ensure_ascii=False))
report("T15 金丝雀无误伤：生词本/阅读统计/阅读位置原样",
       lsget('wuri_jing_vocab') == can_vocab and lsget('wuri_jing_stats_v1') == can_stats
       and lsget('wuri_jing_autopos') == can_pos,
       (lsget('wuri_jing_vocab'), lsget('wuri_jing_stats_v1'), lsget('wuri_jing_autopos')))

errs = ev("window.__errs || []")
report("E0 全程无 JS 异常", not errs, errs)
fails = [n for n, ok in R if not ok]
print(f"\n== SMOKE {'ALL PASS' if not fails else 'FAIL: ' + str(fails)} ({len(R) - len(fails)}/{len(R)}) ==")
try: proc.terminate()
except Exception: pass
sys.exit(1 if fails else 0)
