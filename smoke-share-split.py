#!/usr/bin/env python3
# 专项冒烟：选区工具条「分享」拆两路（2026-10-29 用户真机定）
# ① 工具条分享区两钮并列、顺序固定：文字分享 → 图卡分享（取消/删除与 8 色行不动）
#    新建态 [文字分享,图卡分享,取消]；已存在态 [写想法,文字分享,图卡分享,删除]
# ② 360/390/412 三档：按钮行单行不换行、弹窗不溢出屏宽
# ③ 文字分享载荷实测：navigator.share 捕获的 text＝所选原文＋「\n——《书名》·节名」
#    无 share 环境回落复制路径不报错（toast 二选一）
# ④ 图卡分享回归：__wuriMakeCard 出 PNG；点钮走保存回落 toast「图卡已保存」
# ⑤ 长/短选区各一例；日/夜/红光三态各验标签与布局；分享动作不触碰划线存储
import importlib.util, json, os, re, subprocess, sys, time, urllib.request, hashlib
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/.wt/share-split/www")
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:300]), flush=True)

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()
jw = rd("js/jingwen.js")
i_share = jw.find('<button id="hl-share">文字分享</button>')
i_card = jw.find('<button id="hl-card">图卡分享</button>')
report("S1 源码：文字分享/图卡分享正名且文字在图卡之前（两处构建点）",
       jw.count('<button id="hl-share">文字分享</button>') == 2
       and jw.count('<button id="hl-card">图卡分享</button>') == 2 and -1 < i_share < i_card)
report("S2 源码：旧裸名「分享」「图卡」钮已无残留",
       '<button id="hl-share">分享</button>' not in jw and '<button id="hl-card">图卡</button>' not in jw)

port = base.free_port(); prof = f"/tmp/chrome-share-{port}"
proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
    "--allow-file-access-from-files",
    "--hatch-webgl-allowed-domains-file=" + _WG, "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
    f"--remote-debugging-port={port}",
    f"--user-data-dir={prof}", "--window-size=412,900", "about:blank"],
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

def ev(expr):
    last = None
    for _ in range(4):
        try: return cdp.evaluate(expr)
        except Exception as e:
            if '"type": "undefined"' in str(e): return None
            last = e; time.sleep(1)
    raise last

def goto(width):
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": 900, "deviceScaleFactor": 2, "mobile": True})
    cdp.call("Emulation.setFocusEmulationEnabled", {"enabled": True})
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(120):
        try:
            if ev("document.readyState") == "complete" and ev("!!(window.JingWen && window.JingWen.openReader)"): break
        except Exception: pass
        time.sleep(0.5)
    time.sleep(0.8)
    ev("(function(){var t=document.querySelector('[data-tab=\"tab-jing\"]'); if(t) t.click(); return 'ok';})()")
    time.sleep(0.8)
    ev("localStorage.setItem('wuri_pro_redeem','1'); 'pro-seeded'")
    ok = False
    for _ in range(30):
        ev("window.JingWen.openReader('s02'); 'ok'")
        for _ in range(20):
            if ev("window._jingCurrentId") == "s02" and (ev("document.querySelectorAll('#jing-content .jing-para').length") or 0) > 0:
                ok = True; break
            time.sleep(0.4)
        if ok: break
        time.sleep(0.5)
    time.sleep(0.6)
    return ok

PICK_JS = r"""
(function(kind){
  var paras = Array.prototype.slice.call(document.querySelectorAll('#jing-content .jing-para'))
    .filter(function(p){ return p.getClientRects().length; });
  function plain(para){
    var w = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, null, false), n, out = [];
    while ((n = w.nextNode())) { if (n.parentNode && n.parentNode.tagName === 'RT') continue; out.push(n); }
    return out;
  }
  function point(nodes, off){
    var acc = 0;
    for (var k = 0; k < nodes.length; k++) {
      if (off <= acc + nodes[k].textContent.length) return [nodes[k], off - acc];
      acc += nodes[k].textContent.length;
    }
    var last = nodes[nodes.length - 1]; return [last, last.textContent.length];
  }
  for (var i = 0; i < paras.length; i++) {
    var nodes = plain(paras[i]);
    var total = nodes.reduce(function(a, n){ return a + n.textContent.length; }, 0);
    if (total < 10) continue;
    var range = document.createRange(), p1, p2, expect = '';
    var all = nodes.map(function(n){ return n.textContent; }).join('');
    if (kind === 'short') {
      var s = 2, e = Math.min(total, s + 5);
      p1 = point(nodes, s); p2 = point(nodes, e);
      range.setStart(p1[0], p1[1]); range.setEnd(p2[0], p2[1]);
      expect = all.substring(s, e);
    } else {
      /* 同节内向后累积段落，直到纯文本 ≥150 字（短句经文需多段） */
      var sec = paras[i].getAttribute('data-sec'), acc = total, j = i, lastNodes = nodes;
      while (acc < 150 && j + 1 < paras.length && paras[j + 1].getAttribute('data-sec') === sec) {
        j++;
        lastNodes = plain(paras[j]);
        acc += lastNodes.reduce(function(a, n){ return a + n.textContent.length; }, 0);
      }
      if (acc < 150) continue;
      var tEnd = lastNodes.reduce(function(a, n){ return a + n.textContent.length; }, 0);
      p1 = point(nodes, 0); p2 = point(lastNodes, tEnd);
      range.setStart(p1[0], p1[1]); range.setEnd(p2[0], p2[1]);
      expect = all;
    }
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    return { kind: kind, expect: expect, len: (sel.toString() || '').length, got: sel.toString() };
  }
  return null;
})
"""

def pick(kind):
    return ev("(%s)(%s)" % (PICK_JS, json.dumps(kind)))

def wait_pop(t=10):
    for _ in range(int(t * 2)):
        if ev("!!(document.querySelector('#hl-pop') && !document.querySelector('#hl-pop').hidden && document.querySelector('#hl-pop [data-hl-color]'))"):
            return True
        time.sleep(0.5)
    return False

POPGEO_JS = r"""
(function(){
  var p = document.querySelector('#hl-pop');
  if (!p || p.hidden) return null;
  var rows = Array.prototype.slice.call(p.querySelectorAll('.hl-pop-row'));
  var r = p.getBoundingClientRect();
  function btns(row){ return Array.prototype.slice.call(row.querySelectorAll('button')).map(function(b){
    var br = b.getBoundingClientRect(); return { t: b.textContent, x: br.left, y: br.top, w: br.width }; }); }
  return { left: r.left, right: r.right, w: r.width, sw: p.scrollWidth, cw: p.clientWidth,
           row1: rows.length ? btns(rows[0]) : [], colors: rows.length > 1 ? rows[1].querySelectorAll('button').length : 0,
           rows: rows.length };
})()
"""

def check_layout(tag, vw, expect_row1):
    g = ev(POPGEO_JS)
    ok = bool(g)
    if ok:
        labels = [b["t"] for b in g["row1"]]
        same_row = max(b["y"] for b in g["row1"]) - min(b["y"] for b in g["row1"]) <= 2
        ok = (labels == expect_row1 and same_row and g["left"] >= -1 and g["right"] <= vw + 1
              and g["sw"] <= g["cw"] + 1 and g["colors"] == 8 and g["rows"] == 2)
    report(tag, ok, json.dumps(g, ensure_ascii=False)[:280] if g else "pop 未现")
    return g

def toast_text():
    return ev("(function(){var t=document.getElementById('jing-toast'); return t ? t.textContent : '';})()")

def wait_toast(sub, t=10):
    for _ in range(int(t * 2)):
        if sub in (toast_text() or ""): return True
        time.sleep(0.5)
    return False

# ---------------- 360 日间：主功能 ----------------
assert goto(360), "s02 打开失败"
ev("window.__sharePayloads=[]; try{Object.defineProperty(navigator,'share',{configurable:true,writable:true,"
   "value:function(d){window.__sharePayloads.push(JSON.parse(JSON.stringify(d)));return Promise.resolve();}});}catch(e){}")
hl_before = ev("localStorage.getItem('wuri_jing_highlights')")

pk = pick("short")
report("A1 短选区建立", bool(pk) and pk["len"] >= 3, json.dumps(pk, ensure_ascii=False)[:200] if pk else None)
report("A2 选字后工具条弹出", wait_pop())
check_layout("A3 360 档新建态：[文字分享,图卡分享,取消] 单行＋8 色＋不溢出", 360, ["文字分享", "图卡分享", "取消"])

ev("document.querySelector('#hl-share').click(); 'x'")
time.sleep(1.0)
pl = ev("window.__sharePayloads")
pay = (pl or [{}])[0].get("text", "") if pl else ""
first = pay.split("\n")[0] if pay else ""
suffix = pay[len(first):] if pay else ""
report("A4 文字分享载荷：正文＝所选原文逐字",
       bool(pl) and first == (pk["expect"] or "").strip(), json.dumps({"pay": pay[:80], "exp": pk["expect"]}, ensure_ascii=False))
report("A5 文字分享载荷：出处行「——《书名》·节名」格式正确",
       bool(re.fullmatch(r"\n——《[^》]{1,30}》(·[^\n]{1,30})?", suffix or "")), json.dumps(suffix, ensure_ascii=False))
report("A6 分享后弹窗收起且无 JS 异常",
       ev("document.querySelector('#hl-pop').hidden") is True and not (ev("window.__errs") or []),
       ev("window.__errs"))

# 回落路径：摘掉 navigator.share
ev("try{Object.defineProperty(navigator,'share',{configurable:true,writable:true,value:undefined});}catch(e){}")
pk2 = pick("short")
wait_pop()
ev("document.querySelector('#hl-share').click(); 'x'")
fb_ok = False
for _ in range(16):
    tt = toast_text() or ""
    if "已复制" in tt or "复制失败" in tt: fb_ok = True; break
    time.sleep(0.5)
report("A7 无 share 环境：回落复制路径走通（toast 提示、无异常）",
       fb_ok and not (ev("window.__errs") or []), {"toast": toast_text(), "errs": ev("window.__errs")})

# 图卡：先恢复 spy（无 canShare → deliver 走保存回落）
ev("try{Object.defineProperty(navigator,'share',{configurable:true,writable:true,"
   "value:function(d){window.__sharePayloads.push({files:!!(d&&d.files)});return Promise.resolve();}});}catch(e){}")
pk3 = pick("short")
wait_pop()
# __wuriMakeCard 返回 Promise，CDP evaluate 不等待——走 then 写入窗口变量
card = None
ev("window.__card=null; window.__wuriMakeCard().then(function(r){window.__card=r;}); 'x'")
for _ in range(24):
    card = ev("window.__card")
    if card: break
    time.sleep(0.5)
report("A8 图卡生成回归：PNG dataUrl＋尺寸有效",
       bool(card) and str(card.get("dataUrl", "")).startswith("data:image/png") and card.get("w", 0) > 200 and card.get("h", 0) > 200,
       json.dumps(card)[:160] if card else "null")
ev("document.querySelector('#hl-card').click(); 'x'")
report("A9 点「图卡分享」：保存回落 toast＋无异常",
       wait_toast("图卡已保存") and not (ev("window.__errs") or []),
       {"toast": toast_text(), "errs": ev("window.__errs")})
report("A10 分享/图卡动作未触碰划线存储",
       ev("localStorage.getItem('wuri_jing_highlights')") == hl_before)

# 长选区
ev("window.__sharePayloads=[]; 'x'")
ev("try{Object.defineProperty(navigator,'share',{configurable:true,writable:true,"
   "value:function(d){window.__sharePayloads.push(JSON.parse(JSON.stringify(d)));return Promise.resolve();}});}catch(e){}")
pkl = pick("long")
report("B1 长选区建立（同节跨段、纯文本 ≥150 字）", bool(pkl) and pkl["len"] >= 150, json.dumps(pkl, ensure_ascii=False)[:160] if pkl else None)
report("B2 长选区工具条弹出", wait_pop())
check_layout("B3 360 档长选区：按钮行仍单行不溢出", 360, ["文字分享", "图卡分享", "取消"])
ev("document.querySelector('#hl-share').click(); 'x'")
time.sleep(1.0)
pll = ev("window.__sharePayloads")
payl = (pll or [{}])[0].get("text", "") if pll else ""
report("B4 长选区文字分享载荷：正文 ≥150 字＋出处、首段吻合",
       len(payl.split("\n——《")[0]) >= 150 and payl.startswith(pkl["expect"][:20]) and "——《" in payl,
       json.dumps({"len": len(payl), "head": payl[:40]}, ensure_ascii=False))

# 已存在态：造一条高亮 → 色板落色后自动转已存在态
pk4 = pick("short")
wait_pop()
ev("document.querySelector('#hl-pop [data-hl-color=\"yellow\"]').click(); 'x'")
ex_ok = False
for _ in range(20):
    if ev("!!document.querySelector('#hl-pop #hl-note')"): ex_ok = True; break
    time.sleep(0.5)
report("C1 落色后转已存在态工具条", ex_ok)
if ex_ok:
    g = ev(POPGEO_JS)
    labels = [b["t"] for b in (g or {}).get("row1", [])]
    report("C2 已存在态：[写想法,文字分享,图卡分享,删除] 顺序与单行",
           labels == ["写想法", "文字分享", "图卡分享", "删除"]
           and max(b["y"] for b in g["row1"]) - min(b["y"] for b in g["row1"]) <= 2
           and g["right"] <= 361 and g["colors"] == 8,
           json.dumps(g, ensure_ascii=False)[:240])
ev("var d=document.querySelector('#hl-del'); if(d) d.click(); 'x'")  # 清理测试高亮
time.sleep(0.5)

# ---------------- 390 / 412 布局 ----------------
for w in (390, 412):
    assert goto(w), f"{w} 打开失败"
    pick("short"); wait_pop()
    check_layout(f"D{w} 档新建态布局", w, ["文字分享", "图卡分享", "取消"])

# ---------------- 夜间（390） ----------------
assert goto(390)
for _ in range(3):
    if ev("document.documentElement.getAttribute('data-theme')") == "night": break
    ev("(function(){var t=document.querySelector('[data-theme-toggle]'); if(t) t.click(); return 1;})()")
    time.sleep(0.5)
report("E1 夜间态就绪", ev("document.documentElement.getAttribute('data-theme')") == "night",
       ev("document.documentElement.getAttribute('data-theme')"))
pick("short"); wait_pop()
check_layout("E2 夜间 390 档布局与标签", 390, ["文字分享", "图卡分享", "取消"])

# ---------------- 红光（390） ----------------
ev("localStorage.setItem('wuri_sky_redlight_v1','1'); 'x'")
assert goto(390)
report("F1 红光 body 类生效", ev("document.body.classList.contains('sky-red')") is True)
pick("short"); wait_pop()
check_layout("F2 红光 390 档布局与标签", 390, ["文字分享", "图卡分享", "取消"])
report("F3 全程无 JS 异常", not (ev("window.__errs") or []), ev("window.__errs"))

try: proc.terminate()
except Exception: pass
fails = [n for n, ok in R if not ok]
print(f"\n==== {len(R) - len(fails)}/{len(R)} PASS" + ("" if not fails else " FAILS: " + " | ".join(fails)))
sys.exit(1 if fails else 0)
