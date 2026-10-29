#!/usr/bin/env python3
# 专项冒烟：选字范围收口（2026-10-29 用户真机定）
# ① 界面层禁选：底栏钮/状态行/书头/悬浮钮/三格 computed user-select=none
# ② 注音 rt 禁选：选区字符串纯汉字（无拼音串）、复制纯汉字
# ③ 划线不回归：带注音段选字→色板→落色，存储偏移/文本与 .hl 逐字对齐
# ④ 三类书各 1 例（常见带注音 s02／内丹 s18／道藏 KR5a0220）＋三态
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/.wt/sel-scope/www")
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:300]), flush=True)

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
css = rd("css/style.css")
report("S1 style.css 选字收口规则在位",
       "#jing-reader, #jing-trio" in css and ".jing-content ruby rt" in css
       and css.count("-webkit-user-select: none") >= 2 and "#jing-reader #jing-content" in css)

port = base.free_port(); prof = f"/tmp/chrome-sel-{port}"
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
cdp.call("Emulation.setFocusEmulationEnabled", {"enabled": True})
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
def us(sel):
    return ev("var el=document.querySelector(%s); el ? getComputedStyle(el).userSelect : null" % json.dumps(sel))

# ---------- 进经文页：三格禁选 ----------
ev("(function(){var t=document.querySelector('[data-tab=\"tab-jing\"]'); if(t) t.click(); return 'ok';})()")
time.sleep(1.2)
report("T1 三格 computed user-select=none", us("#jing-trio") == "none" and us("#jing-mymarks") == "none",
       (us("#jing-trio"), us("#jing-mymarks")))
ev("localStorage.setItem('wuri_pro_redeem','1'); 'pro-seeded'"); time.sleep(0.3)

def open_book(bid, wait=14):
    ev("window.JingWen.openReader(%s); 'ok'" % json.dumps(bid))
    for _ in range(wait * 2):
        if ev("window._jingCurrentId") == bid and ev("document.querySelectorAll('#jing-content .jing-para').length") > 0:
            time.sleep(0.6); return True
        time.sleep(0.5)
    return False

# 在当前书内找一个含足够 ruby 的段落，按 app 同口径（跳 RT）映射偏移→DOM 点，
# 选 [start,end) 内容字，返回选区实况。mode: 'info' 只找段 / 'sel' 真选
PICK_JS = r"""
(function(){
  var paras = document.querySelectorAll('#jing-content .jing-para');
  function plain(para){
    var w = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, null, false), n, out = [];
    while ((n = w.nextNode())) { if (n.parentNode && n.parentNode.tagName === 'RT') continue; out.push(n); }
    return out;
  }
  for (var i = 0; i < paras.length; i++) {
    var para = paras[i];
    if (!para.getClientRects().length) continue; /* 折叠节内段落不可见，选区序列化为空，非测试对象 */
    var rubys = para.querySelectorAll('ruby').length;
    var nodes = plain(para);
    var total = nodes.reduce(function(a, n){ return a + n.textContent.length; }, 0);
    if (total < 12) continue;
    var start = Math.min(2, total - 8), end = Math.min(total, start + 8);
    if (rubys >= 4 && end - start < 6) continue;
    var full = nodes.map(function(n){ return n.textContent; }).join('');
    function point(off){
      var acc = 0;
      for (var k = 0; k < nodes.length; k++) {
        if (off <= acc + nodes[k].textContent.length) return [nodes[k], off - acc];
        acc += nodes[k].textContent.length;
      }
      var last = nodes[nodes.length - 1]; return [last, last.textContent.length];
    }
    var p1 = point(start), p2 = point(end);
    var range = document.createRange();
    range.setStart(p1[0], p1[1]); range.setEnd(p2[0], p2[1]);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    return { sec: +(para.getAttribute('data-sec') || 0), para: +(para.getAttribute('data-para') || 0),
             paraIdx: i, rubys: rubys, total: total, start: start, end: end,
             expect: full.substring(start, end), got: sel.toString() };
  }
  return null;
})()
"""
# 复制核对：headless 下 execCommand('copy') 不触发事件；copy 事件的
# clipboardData 又只写不可读。故走真链：CDP 可信 Ctrl+C 让浏览器把选区
# 默认序列化写入剪贴板（不拦截），再在临时 textarea 中 Ctrl+V、于 paste
# 事件里读回 text/plain——即用户实际能粘出的内容。
def key(k, code, vk):
    cdp.call("Input.dispatchKeyEvent", {"type": "keyDown", "key": k, "code": code, "modifiers": 2, "windowsVirtualKeyCode": vk})
    cdp.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": k, "code": code, "modifiers": 2, "windowsVirtualKeyCode": vk})

def do_copy():
    key("c", "KeyC", 67)
    time.sleep(0.35)
    ev("window.__paste = null;"
       "var ta = document.createElement('textarea'); ta.id = '__paste_ta';"
       "ta.style.cssText = 'position:fixed;left:0;top:0;width:50px;height:20px;opacity:0';"
       "document.body.appendChild(ta); ta.focus();"
       "document.addEventListener('paste', function h(e){"
       " try { window.__paste = e.clipboardData.getData('text/plain'); } catch (err) { window.__paste = 'ERR:' + err; }"
       " e.preventDefault(); document.removeEventListener('paste', h, true); }, true); 'armed'")
    key("v", "KeyV", 86)
    v = None
    for _ in range(12):
        v = ev("window.__paste")
        if v is not None: break
        time.sleep(0.25)
    ev("var ta = document.getElementById('__paste_ta'); if (ta) ta.remove(); 'cleaned'")
    return v

def ui_layer_checks(tag):
    vals = {
        "dock-btn": us("#jing-recite"), "font-btn": us("#jing-font-btn"),
        "statusbar": us("#jing-statusbar"), "title": us("#jing-title"),
        "qing": us("#qing-btn"), "backfab": us("#jing-back-fab"),
        "findinput": us("#jing-find-q"), "para": us("#jing-content .jing-para"),
    }
    rt = ev("var r=document.querySelector('#jing-content ruby rt'); r ? getComputedStyle(r).userSelect : 'NO_RT'")
    ok = all(vals[k] == "none" for k in ["dock-btn", "font-btn", "statusbar", "title", "qing", "backfab"]) \
         and vals["findinput"] == "text" and vals["para"] == "text"
    report(f"{tag} 界面层禁选＋正文/输入框可选", ok, json.dumps(vals, ensure_ascii=False))
    return rt

# ---------- 常见带注音 s02 ----------
ok = open_book("s02")
report("B1 打开 s02（功课经）", ok, ev("window._jingCurrentId"))
if ev("document.querySelector('#jing-content').classList.contains('no-py')"):
    click("#jing-pybtn"); time.sleep(0.8)
rt = ui_layer_checks("B1")
report("B1 注音 rt computed user-select=none", rt == "none", rt)
pick = ev(PICK_JS)
report("B2 带注音段选区字符串纯汉字（与内容字期望逐字相等）",
       bool(pick) and pick["got"] == pick["expect"] and pick["rubys"] >= 4,
       json.dumps(pick, ensure_ascii=False)[:260])
clip = do_copy()
report("B3 复制结果纯汉字",
       bool(pick) and clip == pick["expect"],
       json.dumps({"clip": clip, "expect": pick and pick["expect"]}, ensure_ascii=False)[:260])

# ---------- 划线端到端（偏移映射核对） ----------
if pick:
    ev(PICK_JS)  # 重建选区（复制不影响选区，保险再选一次）
    pop_ok = False
    for _ in range(16):
        if vis("#hl-pop") and ev("!!document.querySelector('#hl-pop [data-hl-color]')"):
            pop_ok = True; break
        time.sleep(0.5)
    report("B4 选字后高亮色板弹出", pop_ok, vis("#hl-pop"))
    if pop_ok:
        click("#hl-pop [data-hl-color]")
        hl = None
        for _ in range(20):
            hl = ev("(function(){var a=JSON.parse(localStorage.getItem('wuri_jing_highlights')||'[]');"
                    "var f=a.filter(function(h){return h.sid==='s02';}); return f.length?f[f.length-1]:null;})()")
            if hl: break
            time.sleep(0.5)
        exp_trim = (pick["expect"] or "").strip()
        report("B5 高亮存储：sec/para/start/end/text 与所选汉字逐字对齐",
               bool(hl) and hl["sec"] == pick["sec"] and hl["para"] == pick["para"]
               and hl["start"] == pick["start"] and hl["end"] == pick["end"] and hl["text"] == exp_trim,
               json.dumps({"hl": hl, "pick": {k: pick[k] for k in ("sec", "para", "start", "end")}, "exp": exp_trim}, ensure_ascii=False)[:300])
        hl_txt = None
        for _ in range(20):
            hl_txt = ev("""(function(){
              var para = document.querySelectorAll('#jing-content .jing-para')[%d];
              if (!para) return null;
              var spans = para.querySelectorAll('.hl'); if (!spans.length) return '';
              var out = '';
              spans.forEach(function(s){ var c = s.cloneNode(true);
                c.querySelectorAll('rt, rp').forEach(function(n){ n.remove(); }); out += c.textContent; });
              return out; })()""" % pick["paraIdx"])
            if hl_txt: break
            time.sleep(0.5)
        report("B6 落色后 .hl 包裹文本＝所选汉字（逐字）", hl_txt == exp_trim,
               json.dumps({"hl_txt": hl_txt, "exp": exp_trim}, ensure_ascii=False)[:220])

# ---------- 三态（在 s02 上抽查机制不失效） ----------
ev("(function(){var t=document.querySelector('[data-theme-toggle]'); if(t) t.click(); return 'night';})()"); time.sleep(0.6)
rt_n = ev("var r=document.querySelector('#jing-content ruby rt'); r ? getComputedStyle(r).userSelect : 'NO_RT'")
report("B7 夜态 rt/底栏仍禁选", rt_n == "none" and us("#jing-recite") == "none", (rt_n, us("#jing-recite")))
ev("document.body.classList.add('sky-red'); 'red'"); time.sleep(0.4)
rt_r = ev("var r=document.querySelector('#jing-content ruby rt'); r ? getComputedStyle(r).userSelect : 'NO_RT'")
report("B8 红光态 rt/底栏仍禁选", rt_r == "none" and us("#jing-recite") == "none", (rt_r, us("#jing-recite")))
ev("document.body.classList.remove('sky-red'); (function(){var t=document.querySelector('[data-theme-toggle]'); if(t) t.click(); return 'day';})()"); time.sleep(0.4)

# ---------- 无注音内丹 s18 ----------
ok = open_book("s18")
report("C1 打开 s18（内丹）", ok, ev("window._jingCurrentId"))
nruby = ev("document.querySelectorAll('#jing-content ruby').length")
pick2 = ev(PICK_JS)
report("C2 无注音书选区字符串与期望逐字相等", bool(pick2) and pick2["got"] == pick2["expect"],
       json.dumps(pick2, ensure_ascii=False)[:220] + f" rubys={nruby}")
report("C3 s18 底栏仍禁选", us("#jing-recite") == "none", us("#jing-recite"))

# ---------- 道藏 KR5a0220 ----------
ok = open_book("KR5a0220", wait=40)
report("D1 打开 KR5a0220（道藏·度人上经大法）", ok, ev("window._jingCurrentId"))
if ok:
    if ev("document.querySelector('#jing-content').classList.contains('no-py')"):
        click("#jing-pybtn"); time.sleep(0.8)
    # 道藏开卷为折叠态：点全展开让段落可见（隐藏段选区序列化为空，非 App 之误）
    fb = ev("var b=document.querySelector('#jing-foldall'); b && !b.hidden ? b.textContent.trim() : null")
    if fb and "全展开" in str(fb):
        click("#jing-foldall"); time.sleep(1.2)
    rt = ui_layer_checks("D1")
    report("D1 道藏 rt 禁选", rt == "none" or rt == "NO_RT", rt)
    pick3 = ev(PICK_JS)
    report("D2 道藏带注音段选区纯汉字", bool(pick3) and pick3["got"] == pick3["expect"],
           json.dumps(pick3, ensure_ascii=False)[:260])
    clip3 = do_copy()
    report("D3 道藏复制纯汉字", bool(pick3) and clip3 == pick3["expect"],
           json.dumps({"clip": clip3, "expect": pick3 and pick3["expect"]}, ensure_ascii=False)[:220])

errs = ev("window.__errs || []")
report("Z0 全程无 JS 异常", not errs, errs)
fails = [n for n, ok in R if not ok]
print(f"\n==== {len(R) - len(fails)}/{len(R)} PASS" + (f"  FAILS: {fails}" if fails else ""), flush=True)
try: proc.kill()
except Exception: pass
sys.exit(1 if fails else 0)
