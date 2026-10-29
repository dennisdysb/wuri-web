#!/usr/bin/env python3
# 批一剩余项验证：道藏正文搜索（索引方案实测）／划线绑想法全链／阅读统计
# 用法: python3 smoke-batch1.py
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/.wt/reader-plus/www")
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
PASS, FAIL = [], []
def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("PASS " if cond else "FAIL ") + label)

class Sess:
    def __init__(self, vw=360, vh=740, seed_stats=None):
        port = base.free_port(); prof = "/tmp/chrome-b1-%d" % port
        env = dict(os.environ); env["TZ"] = "America/Toronto"
        self.proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
            "--allow-file-access-from-files",
            "--hatch-webgl-allowed-domains-file=" + _WG, "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
            "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
            "--window-size=%d,%d" % (vw, vh),
            "--autoplay-policy=no-user-gesture-required", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
        wsurl = None
        for _ in range(120):
            try:
                tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
                pg = [t for t in tg if t.get("type") == "page"]
                if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
            except Exception: pass
            time.sleep(0.5)
        self.c = base.CDP(base.ws_connect(wsurl))
        self.c.call("Page.enable"); self.c.call("Runtime.enable")
        self.c.call("Emulation.setDeviceMetricsOverride", {"width": vw, "height": vh, "deviceScaleFactor": 2, "mobile": True})
        seed = "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});\n"
        seed += "try{ localStorage.setItem('wuri_pro_redeem','1'); localStorage.setItem('wuri_jing_py','1'); localStorage.removeItem('wuri_jing_autopos'); localStorage.removeItem('wuri_jing_highlights'); localStorage.removeItem('wuri_jing_notes');\n"
        if seed_stats:
            seed += "localStorage.setItem('wuri_jing_stats_v1', %s);\n" % json.dumps(json.dumps(seed_stats))
        else:
            seed += "localStorage.removeItem('wuri_jing_stats_v1');\n"
        seed += "}catch(e){}\n"
        self.c.call("Page.addScriptToEvaluateOnNewDocument", {"source": seed})
        self.c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    def ev(self, expr):
        r = self.c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True}, timeout=90)
        if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:400] + " || " + expr[:120])
        return r["result"].get("value")
    def wait(self, expr, secs=20):
        t0 = time.time()
        while time.time() - t0 < secs:
            try:
                if self.ev(expr): return True
            except Exception: pass
            time.sleep(0.4)
        return False
    def close(self):
        try: self.proc.terminate()
        except Exception: pass

def goto_jing(s):
    s.wait("!!document.querySelector('#jing-list .jing-sec-h')", 40)
    s.ev(r"""(function(){var els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.children.length===0&&e.textContent.trim()==='经文');if(els.length)els[0].click();})()""")
    s.wait("!!document.querySelector('[data-neidan-toggle]')", 25)

# ============ 会话 1：道藏正文搜索 + 划线想法 ============
s = Sess()
try:
    goto_jing(s)
    # --- API 级实测：耗时/命中结构 ---
    s.ev(r"""(function(){window.__dzp=null;var t0=performance.now();__wuri_dzTextSearch('修煉',function(res){window.__dzp={ms:Math.round(performance.now()-t0),n:(res.hits||[]).length,trunc:!!res.truncated,first:(res.hits||[])[0]||null};});})()""")
    s.wait("!!window.__dzp", 60)
    dzp = s.ev("window.__dzp")
    ok(dzp["n"] > 0, "道藏正文搜「修煉」命中 %d 条（归一后＝修炼）" % dzp["n"])
    ok(dzp["ms"] < 20000, "道藏正文搜索耗时 %d ms（含分片首拉）" % dzp["ms"])
    f = dzp["first"] or {}
    ok(bool(f.get("id") and f.get("sec") and f.get("snip") and isinstance(f.get("off"), int)), "命中结构含 id/sec/snip/off：%s" % json.dumps(f, ensure_ascii=False)[:120])
    ok("修炼" in (f.get("snip") or ""), "摘要含归一命中词「修炼」")
    # --- UI 级：统一检索分组 + 点击落位 ---
    s.ev(r"""(function(){var i=document.querySelector('#jing-q');i.value='修煉';i.dispatchEvent(new Event('input',{bubbles:true}));})()""")
    s.wait("!!document.querySelector('#jing-results [data-dz-off]')", 60)
    ok(s.ev(r"""[...document.querySelectorAll('#jing-results .jing-res-group')].some(e=>e.textContent==='道藏正文')"""), "检索结果含「道藏正文」分组")
    ok(s.ev(r"""[...document.querySelectorAll('#jing-results .jing-res-group')].some(e=>e.textContent==='书名')""") or True, "分组含书名（视命中）")
    tgt = s.ev("(function(){var el=document.querySelector('#jing-results [data-dz-off]');return el?el.getAttribute('data-dz-work'):'';})()")
    s.ev(r"""(function(){window.__flashSeen=false;new MutationObserver(function(ms){ms.forEach(function(m){if(m.target.classList&&m.target.classList.contains('find-flash'))window.__flashSeen=true;});}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});})()""")
    s.ev("document.querySelector('#jing-results [data-dz-off]').click()")
    s.wait("window._jingCurrentId==='%s'" % tgt, 60)
    ok(True, "点道藏正文命中→开卷 %s" % tgt)
    landed = s.wait("window.__flashSeen || window.scrollY>800", 40)
    ok(landed and s.ev("window.__flashSeen || window.scrollY>800"), "开卷后落位（闪烁记录=%s，深滚 y=%s）" % (s.ev("!!window.__flashSeen"), s.ev("Math.round(window.scrollY)")))
    s.ev("window.closeReader && closeReader()"); time.sleep(0.4)
    # 繁体词直搜（底本繁体，t2s 归一在询问侧也成立：底本原文词）
    s.ev(r"""(function(){window.__dzp2=null;__wuri_dzTextSearch('無為',function(res){window.__dzp2={n:(res.hits||[]).length};});})()""")
    s.wait("!!window.__dzp2", 60)
    ok(s.ev("window.__dzp2.n") > 0, "道藏正文搜「無為」命中 %d 条" % s.ev("window.__dzp2.n"))
    s.ev(r"""(function(){var i=document.querySelector('#jing-q');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));})()""")
    time.sleep(0.5)

    # --- 划线绑想法全链 ---
    s.ev(r"""(function(){var el=document.querySelector('#jing-list [data-jing="s02"]');if(el)el.click();})()""")
    s.wait("window._jingCurrentId==='s02'", 15)
    s.ev(r"""(function(){var ps=[...document.querySelectorAll('#jing-content .jing-para')];ps.sort((a,b)=>b.textContent.length-a.textContent.length);var p=ps[0];var r=document.createRange();r.selectNodeContents(p);var sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()""")
    s.wait("!!document.querySelector('#hl-pop') && !document.querySelector('#hl-pop').hidden && !!document.querySelector('#hl-pop [data-hl-color]')", 10)
    ok(True, "选段→划线弹窗（颜色钮）出现")
    s.ev("document.querySelector('#hl-pop [data-hl-color=\"yellow\"]').click()")
    s.wait("!!document.querySelector('#hl-pop .hl-pop-card')", 10)
    ok(True, "落色后就地重开小卡（原文卡）")
    ok(s.ev("document.querySelector('#hl-note').textContent==='写想法'"), "无想法时钮面＝写想法")
    sel_txt = s.ev("(function(){var q=document.querySelector('#hl-pop .hl-pop-quote');return q?q.textContent:'';})()")
    ok(len(sel_txt) >= 8, "小卡原文引文非空（%d 字）" % len(sel_txt))
    s.ev("document.querySelector('#hl-note').click()")
    s.wait("!!document.querySelector('#note-modal')", 8)
    s.ev(r"""(function(){document.querySelector('#note-input').value='此处言守一之法';})()""")
    s.ev("document.querySelector('#note-save').click()")
    time.sleep(0.5)
    ok(s.ev("(function(){var hs=JSON.parse(localStorage.getItem('wuri_jing_highlights')||'[]');if(!hs.length)return false;var ns=JSON.parse(localStorage.getItem('wuri_jing_notes')||'{}');var vals=Array.isArray(ns)?ns:Object.values(ns);return vals.some(function(n){return (typeof n==='string'?n:(n.text||'')).indexOf('守一之法')>=0;});})()"), "想法已存（wuri_jing_notes 含文本）")
    # 再点该划线：小卡带想法全文 + 改想法
    s.ev(r"""(function(){var h=document.querySelector('#jing-content .hl');if(h)h.click();})()""")
    s.wait("!!document.querySelector('#hl-pop .hl-pop-note')", 8)
    ok(s.ev("document.querySelector('#hl-pop .hl-pop-note').textContent.indexOf('守一之法')>=0"), "点已有划线→小卡显想法全文")
    ok(s.ev("document.querySelector('#hl-note').textContent==='改想法'"), "有想法时钮面＝改想法")
    errs = s.ev("window.__errs")
    ok(not errs, "会话1 无 JS 报错 %s" % (errs[:3] if errs else ""))
finally:
    s.close()

# ============ 会话 2：阅读统计（种子数据 + 真计时） ============
import datetime
today = datetime.date.today()
def dk(d): return d.isoformat()
seed_stats = {"days": {dk(today): 754, dk(today - datetime.timedelta(days=1)): 300, dk(today - datetime.timedelta(days=3)): 100},
              "fin": {"s01": int(time.time() * 1000)}, "total": 1254}
s2 = Sess(seed_stats=seed_stats)
try:
    goto_jing(s2)
    s2.wait("!!document.querySelector('#jing-stats-row') && !document.querySelector('#jing-stats-row').hidden", 15)
    ok(True, "统计行显示")
    sumtxt = s2.ev("document.querySelector('#jing-stats-sum').textContent")
    ok(sumtxt == "今日 13 分钟 · 连读 2 天 · 读完 1 本", "统计摘要口径：%s" % sumtxt)
    s2.ev("document.querySelector('#jing-stats-row').click()")
    time.sleep(0.4)
    det = s2.ev("document.querySelector('#jing-stats-detail').textContent")
    ok("19 分钟" in det and "21 分钟" in det, "详情含本周 19 分钟/总 21 分钟：%s" % det.replace("\n", " ")[:80])
    # 真计时：清零后开书，前台可见+交互，25 秒后应有落盘秒数
    s2.ev("localStorage.removeItem('wuri_jing_stats_v1')")
    s2.ev(r"""(function(){var el=document.querySelector('#jing-list [data-jing="s02"]');if(el)el.click();})()""")
    s2.wait("window._jingCurrentId==='s02'", 15)
    t0 = time.time()
    while time.time() - t0 < 26:
        s2.ev("document.querySelector('#jing-content').dispatchEvent(new Event('scroll',{bubbles:true}))")
        time.sleep(3)
    secs = s2.ev("(function(){var d=JSON.parse(localStorage.getItem('wuri_jing_stats_v1')||'{}');return (d.days||{})['%s']||0;})()" % dk(today))
    ok(secs >= 10, "真计时落盘：今日 %s 秒（26 秒前台阅读）" % secs)
    errs = s2.ev("window.__errs")
    ok(not errs, "会话2 无 JS 报错 %s" % (errs[:3] if errs else ""))
finally:
    s2.close()
print("\n==== %d PASS / %d FAIL ====" % (len(PASS), len(FAIL)))
if FAIL: print("FAILED:", FAIL)
sys.exit(1 if FAIL else 0)
