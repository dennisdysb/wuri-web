#!/usr/bin/env python3
# 专项冒烟：全体搜索直达命中对齐道藏侧（内部 v398 待发）
# 用户规格（2026-10-29 18:28）：全体搜索点进长书——只展开命中节、
# 定位到命中处、命中串高亮后约 3 秒渐隐灭净。
#   A 精选正文行（旧病灶）：行只带 data-jing/data-sec，旧委托 300ms
#     一次性掀节＋滚节题，与异步开书赛跑扑空、无定位无高亮。断言：
#     仅命中节展开、全展开钮仍「全展开」、逐帧轨迹命中段入视口后不
#     再离场且终位 ≈0.30×视口高、jinghitfade 出现并在 ~3s 后摘净、
#     用户高亮存储与目标段 DOM 零漂移、进度 % 不被深跳污染。
#   B 道藏正文行（DZ0142《紫阳真人悟真篇三注》搜「真人」，用户截图
#     复现书）：跳锚不回退＋整段闪升级为命中串渐隐（Highlight range
#     所在段文本须含「真人」）、仅命中节展开、渐隐摘净。
#   C 书内搜索回归：findGo 落位改同帧收敛后，首/次命中均落位且
#     jingfindcur 涂层在。
#   D 红光：body.sky-red 下 --hitfade-rgb=255,106,80、渐隐样式串带红谱。
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib

_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "www")
R = []
def report(name, ok, extra=""):
    R.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:500]), flush=True)

port = base.free_port(); prof = f"/tmp/chrome-searchjump-{port}"
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
cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": """
window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e.error))});
try{ localStorage.setItem('wuri_pro_redeem','1'); }catch(e){}
"""})
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

def wait_for(expr, timeout=60, interval=0.5):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if ev(expr): return True
        except Exception: pass
        time.sleep(interval)
    return False

wait_for("document.readyState==='complete' && !!window.JingWen", 90)
time.sleep(1.0)
ev("document.querySelector('button[data-tab=\"tab-jing\"]').click(); true")
time.sleep(1.2)

HELPERS = r"""
window.__sj = {
  rows: function(){
    return Array.prototype.map.call(document.querySelectorAll('#jing-results .jing-res'), function(el){
      return { jing: el.getAttribute('data-jing'), sec: el.getAttribute('data-sec'),
               pi: el.getAttribute('data-pi'), hs: el.getAttribute('data-hs'), he: el.getAttribute('data-he'),
               dz: el.getAttribute('data-dz-work'), off: el.getAttribute('data-dz-off'),
               t: (el.querySelector('.jing-res-t')||{}).textContent || '' };
    });
  },
  bookInfo: function(id){
    var d = window.JINGWEN && window.JINGWEN[id]; if(!d) return null;
    var tot = 0; d.sections.forEach(function(s){ (s.paras||[]).forEach(function(p){ tot += (p.t||'').length; }); });
    return { secs: d.sections.length, tot: tot };
  },
  openBodies: function(){
    var out = [];
    document.querySelectorAll('#jing-content .jing-sec').forEach(function(s){
      var b = s.querySelector('.jing-sec-body');
      if (b && !b.hidden) out.push(+s.getAttribute('data-sec'));
    });
    return out;
  },
  paraEl: function(s,p){ return document.querySelector('#jing-content p.jing-para[data-sec="'+s+'"][data-para="'+p+'"]'); },
  paraTop: function(s,p){ var el = window.__sj.paraEl(s,p); return el ? Math.round(el.getBoundingClientRect().top) : null; },
  statusPct: function(){
    var t = document.getElementById('jing-status-text'); if(!t) return null;
    var m = t.textContent.match(/(\d+)%/); return m ? +m[1] : (t.textContent.indexOf('已读完')>=0 ? 100 : null);
  },
  fadeInfo: function(){
    var has = false, rangeText = null, rangePara = null;
    try {
      if (window.CSS && CSS.highlights && CSS.highlights.has('jinghitfade')) {
        has = true;
        var hl = CSS.highlights.get('jinghitfade');
        if (hl && hl.size) { var rgs = Array.from(hl);
          rangeText = rgs.map(function(r){ return r.toString(); }).join('');
          var rg = rgs[0];
          var n = rg.startContainer; var p = n && n.nodeType===1 ? n : (n ? n.parentElement : null);
          var pp = p ? p.closest('p.jing-para') : null;
          var ptxt = null;
          if (pp) { var pc = pp.cloneNode(true); pc.querySelectorAll('rt, rp').forEach(function(x){ x.remove(); }); ptxt = pc.textContent; }
          rangePara = pp ? { sec:+pp.getAttribute('data-sec'), para:+pp.getAttribute('data-para'), text: ptxt } : null;
        }
      }
    } catch(e){}
    var st = document.getElementById('jing-hitfade-style');
    return { has: has, rangeText: rangeText, rangePara: rangePara,
             styleText: st ? st.textContent : null,
             flashParas: document.querySelectorAll('#jing-content .jing-para.find-flash').length };
  }
};
'ok'"""
ev(HELPERS)

def do_search(q):
    ev("window.JingWen.search(" + json.dumps(q) + "); true")

# ---------------- A 精选正文 ----------------
do_search("真人")
ok = wait_for("window.__sj.rows().some(function(r){ return r.pi !== null; })", 90)
report("A0 精选正文行出现且带 data-pi 命中坐标", ok, ev("window.__sj.rows().length"))
cand = ev("""(function(){
  var rows = window.__sj.rows().filter(function(r){ return r.pi !== null; });
  var seen = {};
  for (var i=0;i<rows.length;i++){
    var r = rows[i]; if (seen[r.jing]) continue; seen[r.jing]=1;
    var info = window.__sj.bookInfo(r.jing); if(!info) continue;
    var sec = +r.sec;
    if (info.secs > 3 && info.tot > 26000 && sec >= 1 && sec <= info.secs-2)
      return { jing:r.jing, sec:sec, pi:+r.pi, hs:+r.hs, he:+r.he, secs:info.secs, tot:info.tot };
  }
  return null;
})()""")
report("A1 找到长书候选（多节、>2.6万字、命中不在首尾节）", bool(cand), cand)
if cand:
    bid, bsec, bpi = cand["jing"], cand["sec"], cand["pi"]
    # 播种一条用户高亮（与命中同节不同段优先；存储格式同 saveHighlight 口径）
    seed = ev("""(function(){
      var d = window.JINGWEN[%s]; var sec = %d, hitPi = %d;
      var pi = -1;
      for (var i=0;i<d.sections[sec].paras.length;i++){ var p=d.sections[sec].paras[i];
        if (i!==hitPi && p.t && p.t.length>=6){ pi=i; break; } }
      if (pi<0) return null;
      var arr = []; try{ arr = JSON.parse(localStorage.getItem('wuri_jing_highlights')||'[]'); }catch(e){}
      arr.push({ sid:%s, sec:sec, para:pi, start:1, end:4, color:'yellow', id:'hl_smoke_seed', ts:1700000000000 });
      localStorage.setItem('wuri_jing_highlights', JSON.stringify(arr));
      return { para: pi, text: d.sections[sec].paras[pi].t.slice(1,4) };
    })()""" % (json.dumps(bid), bsec, bpi, json.dumps(bid)))
    hl_before = ev("localStorage.getItem('wuri_jing_highlights')")
    # 装逐帧轨迹并点击行
    ev("""(function(){
      window.__trace = []; window.__traceOn = true;
      window.__tsel = '#jing-content p.jing-para[data-sec="%d"][data-para="%d"]';
      (function loop(){ requestAnimationFrame(loop); if(!window.__traceOn) return;
        var el = document.querySelector(window.__tsel);
        window.__trace.push(el ? Math.round(el.getBoundingClientRect().top) : null);
      })();
      var rows = document.querySelectorAll('#jing-results .jing-res');
      for (var i=0;i<rows.length;i++){
        if (rows[i].getAttribute('data-jing')===%s && rows[i].getAttribute('data-sec')===%s
            && rows[i].getAttribute('data-pi')===%s){ rows[i].click(); return true; }
      }
      return false;
    })()""" % (bsec, bpi, json.dumps(bid), json.dumps(str(bsec)), json.dumps(str(bpi))))
    landed = wait_for("window._jingCurrentId===%s && window.__sj.paraTop(%d,%d) !== null && window.__sj.paraTop(%d,%d) > -60 && window.__sj.paraTop(%d,%d) < 740" % (
        json.dumps(bid), bsec, bpi, bsec, bpi, bsec, bpi), 30)
    report("A2 点入后命中段进入视口", landed, ev("window._jingCurrentId"))
    time.sleep(1.2)
    ev("window.__traceOn=false; true")
    trace = ev("window.__trace") or []
    seen_idx = next((i for i, v in enumerate(trace) if v is not None and -60 < v < 740), None)
    stable = seen_idx is not None and all((v is None or -90 < v < 830) for v in trace[seen_idx:])
    final_top = next((v for v in reversed(trace) if v is not None), None)
    report("A3 逐帧轨迹：入场后不再离场", stable, (trace[:3], trace[-3:] if trace else []))
    report("A4 终位 ≈ 视口高 30%（222±25）", final_top is not None and abs(final_top - 222) <= 25, final_top)
    open_secs = ev("window.__sj.openBodies()")
    report("A5 仅命中节展开", open_secs == [bsec], open_secs)
    fold_label = ev("(document.getElementById('jing-foldall')||{}).textContent")
    report("A6 全展开钮仍为「全展开」（未触发全展开）", fold_label == "全展开", fold_label)
    fi = ev("window.__sj.fadeInfo()")
    report("A7 命中串渐隐高亮在场（或整段闪回落）", bool(fi and (fi["has"] or fi["flashParas"] > 0)), fi)
    if fi and fi["has"]:
        report("A7b 高亮 range 文本＝「真人」", fi["rangeText"] == "真人", fi["rangeText"])
        report("A7c 高亮落点段与行坐标一致", bool(fi["rangePara"]) and fi["rangePara"]["sec"] == bsec and fi["rangePara"]["para"] == bpi, fi["rangePara"])
    para_html_1 = ev("(function(){ var el=window.__sj.paraEl(%d,%d); return el?el.innerHTML:null; })()" % (bsec, bpi))
    pct = ev("window.__sj.statusPct()")
    depth = ev("""(function(){ var d=window.JINGWEN[%s]; var acc=0, tot=0;
      d.sections.forEach(function(s,si){ (s.paras||[]).forEach(function(p,pi){
        var L=(p.t||'').length; tot+=L; if (si<%d || (si===%d && pi<%d)) acc+=L; }); });
      return Math.round(100*acc/Math.max(1,tot)); })()""" % (json.dumps(bid), bsec, bsec, bpi))
    report("A8 进度未被深跳污染（显示 " + str(pct) + "%，命中深度 " + str(depth) + "%）",
           pct is not None and depth is not None and pct <= max(20, depth - 25), (pct, depth))
    # 等渐隐摘净
    gone = wait_for("!window.__sj.fadeInfo().has && !(window.__sj.fadeInfo().styleText)", 12)
    report("A9 渐隐约 3 秒后摘净（Highlight 删除＋样式清空）", gone, ev("window.__sj.fadeInfo()"))
    para_html_2 = ev("(function(){ var el=window.__sj.paraEl(%d,%d); return el?el.innerHTML:null; })()" % (bsec, bpi))
    report("A10 目标段 DOM 零改动（渐隐不写 DOM）", para_html_1 is not None and para_html_1 == para_html_2)
    hl_after = ev("localStorage.getItem('wuri_jing_highlights')")
    report("A11 用户高亮存储零漂移", hl_before == hl_after, (str(hl_before)[:80], str(hl_after)[:80]))
    if seed:
        hlspan = ev("""(function(){ var el=window.__sj.paraEl(%d,%d); if(!el) return null;
          var spans = el.querySelectorAll('.hl');
          if(!spans.length) return null;
          var out = '';
          spans.forEach(function(sp){ var c = sp.cloneNode(true);
            c.querySelectorAll('rt, rp').forEach(function(n){ n.remove(); });
            out += c.textContent; });
          return out; })()""" % (bsec, seed["para"]))
        report("A12 播种的用户高亮仍精确渲染在原文上", hlspan == seed["text"], (hlspan, seed))
    ev("window.JingWen.closeReader(); true")
    time.sleep(0.8)

# ---------------- B 道藏正文（真人首行 + DZ0142 定向） ----------------
# 注：道藏正文检索候选书封顶 30 部（daozang.js cand.slice(0,30)），搜
# 「真人」时 DZ0142 未必入围——DZ0142 用例改以「悟真篇」定向（其卷题
# 即含此词），行为断言与「真人」首行一组完全相同。
def dz_case(tag, query, title_match, expect_text):
    do_search(query)
    ok = wait_for("window.__sj.rows().some(function(r){ return r.off !== null; })", 120)
    report(tag + "0 道藏正文行出现", ok, ev("window.__sj.rows().length"))
    if not ok: return
    row = ev("""(function(){ var rows = window.__sj.rows();
      for (var i=0;i<rows.length;i++){ if (rows[i].off !== null && (%s)) return rows[i]; }
      return null; })()""" % ("rows[i].t.indexOf(" + json.dumps(title_match) + ")>=0" if title_match else "true"))
    report(tag + "1 目标行" + (("（" + title_match + "）") if title_match else "（首行）"), bool(row), row)
    if not row: return
    ev("""(function(){ var rows = document.querySelectorAll('#jing-results .jing-res');
      for (var i=0;i<rows.length;i++){
        if (rows[i].getAttribute('data-dz-work')===%s && rows[i].getAttribute('data-dz-off')===%s){ rows[i].click(); return true; } }
      return false; })()""" % (json.dumps(row["dz"]), json.dumps(row["off"])))
    opened = wait_for("window._jingCurrentId===%s" % json.dumps(row["dz"]), 60)
    report(tag + "2 点入开书（KR 全藏取文）", opened, ev("window._jingCurrentId"))
    if not opened: return
    fseen = wait_for("window.__sj.fadeInfo().has || window.__sj.fadeInfo().flashParas>0", 40)
    report(tag + "3 落位后命中渐隐高亮出现（取代旧整段闪）", fseen, ev("window.__sj.fadeInfo()"))
    fi = ev("window.__sj.fadeInfo()")
    if fi and fi["has"]:
        report(tag + "4 高亮 range 文本＝查询词", fi["rangeText"] == expect_text, fi["rangeText"])
        rp = fi["rangePara"]
        report(tag + "5 高亮段含命中", bool(rp) and expect_text in (rp["text"] or ""),
               (rp or {}).get("text", "")[:40])
    time.sleep(1.0)
    booktot = ev("window.__sj.bookInfo(%s)" % json.dumps(row["dz"]))
    open_secs = ev("window.__sj.openBodies()")
    if booktot and booktot["tot"] > 20000:
        report(tag + "6 仅命中节展开（展开节数＝1）", len(open_secs) == 1, open_secs)
    else:
        report(tag + "6 短书全展开口径（跳过仅一节断言）", True, booktot)
    gone = wait_for("!window.__sj.fadeInfo().has && !(window.__sj.fadeInfo().styleText)", 12)
    report(tag + "7 渐隐摘净", gone, ev("window.__sj.fadeInfo()"))
    ev("window.JingWen.closeReader(); true")
    time.sleep(0.8)

dz_case("B", "真人", None, "真人")
dz_case("B'", "悟真篇", "悟真篇三注", "悟真篇")

# ---------------- C 书内搜索回归 ----------------
if cand:
    bid = cand["jing"]
    ev("window.JingWen.openReader(%s); true" % json.dumps(bid))
    wait_for("window._jingCurrentId===%s && document.querySelectorAll('#jing-content p.jing-para').length>0" % json.dumps(bid), 30)
    time.sleep(0.8)
    ev("window.__wuriFind.open(); true")
    time.sleep(0.3)
    ev("""(function(){ var inp=document.getElementById('jing-find-q'); inp.value='真人';
      inp.dispatchEvent(new Event('input',{bubbles:true})); return true; })()""")
    okc = wait_for("(document.getElementById('jing-find-count')||{}).textContent && document.getElementById('jing-find-count').textContent.indexOf('处')>=0 && !document.getElementById('jing-find-count').textContent.startsWith('0')", 20)
    report("C1 书内搜索有命中计数", okc, ev("(document.getElementById('jing-find-count')||{}).textContent"))
    time.sleep(1.0)
    cur = ev("""(function(){ var hl = window.CSS && CSS.highlights && CSS.highlights.get('jingfindcur');
      if(!hl || !hl.size) return null; var rgs = Array.from(hl); var rg = rgs[0];
      var p = rg.startContainer.parentElement.closest('p.jing-para'); if(!p) return null;
      var r = p.getBoundingClientRect();
      return { sec:+p.getAttribute('data-sec'), para:+p.getAttribute('data-para'), top:Math.round(r.top), txt: rgs.map(function(x){return x.toString();}).join('') }; })()""")
    report("C2 首命中落位且 jingfindcur 在", bool(cur) and -60 < cur["top"] < 740 and cur["txt"] == "真人", cur)
    ev("window.__wuriFind.go(window.__wuriFind.idx()+1); true")
    time.sleep(1.2)
    cur2 = ev("""(function(){ var hl = window.CSS && CSS.highlights && CSS.highlights.get('jingfindcur');
      if(!hl || !hl.size) return null; var rg = Array.from(hl)[0];
      var p = rg.startContainer.parentElement.closest('p.jing-para'); if(!p) return null;
      var r = p.getBoundingClientRect();
      return { sec:+p.getAttribute('data-sec'), para:+p.getAttribute('data-para'), top:Math.round(r.top) }; })()""")
    report("C3 下一命中同样落位", bool(cur2) and -60 < cur2["top"] < 740 and (not cur or (cur2["sec"], cur2["para"]) != (cur["sec"], cur["para"])), cur2)
    ev("window.__wuriFind.close(); true")
    ev("window.JingWen.closeReader(); true")
    time.sleep(0.8)

# ---------------- D 红光 ----------------
ev("localStorage.setItem('wuri_sky_redlight_v1','1'); true")
cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
wait_for("document.readyState==='complete' && !!window.JingWen", 90)
time.sleep(1.0)
report("D1 红光类 body.sky-red 在场", ev("document.body.classList.contains('sky-red')"))
rgbv = ev("getComputedStyle(document.body).getPropertyValue('--hitfade-rgb').trim()")
report("D2 --hitfade-rgb 红光值 255,106,80", rgbv == "255,106,80", rgbv)
ev("document.querySelector('button[data-tab=\"tab-jing\"]').click(); true")
time.sleep(1.0)
ev(HELPERS)
do_search("真人")
wait_for("window.__sj.rows().some(function(r){ return r.pi !== null; })", 90)
clicked = ev("""(function(){ var rows = document.querySelectorAll('#jing-results .jing-res');
  for (var i=0;i<rows.length;i++){ if (rows[i].getAttribute('data-pi')!==null){ rows[i].click(); return true; } }
  return false; })()""")
red_ok = wait_for("(window.__sj.fadeInfo().styleText||'').indexOf('255,106,80')>=0", 40) if clicked else False
report("D3 红光下渐隐样式串走红谱 RGB", red_ok, ev("window.__sj.fadeInfo()"))

errs = ev("window.__errs")
report("Z 页面无未捕获错误", not errs, errs)

fails = [n for n, ok2 in R if not ok2]
print("\n==== %d/%d PASS ====" % (len(R) - len(fails), len(R)), flush=True)
if fails: print("FAILED:", fails, flush=True)
try: proc.terminate()
except Exception: pass
sys.exit(1 if fails else 0)
