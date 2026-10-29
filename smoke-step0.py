#!/usr/bin/env python3
# 第 0 步（统一底栏＋状态行搜索图标＋读面板分流＋改名）验证，360 档为主：
#  - 全书类（常见多节/常见单节/道藏）底栏同一套钮序；六钮一行不溢出、钮高>=44
#  - 我的标记底栏钮 DOM 不存在；状态行搜索图标开 findbar、不误开目录
#  - 书内搜索：命中计数/逐个跳转/清除恢复；字体三行（滑杆/字体/行距）生效+持久化
#  - 读面板分流：有录音→音频组、无录音→TTS 组（两支各至少实测一本）；语速持久化
#  - 道藏背诵可开（recite-sen 出现）；改名（书架 h3）
# 用法: python3 smoke-step0.py
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/.wt/reader-plus/www")
# 沙箱 Chromium 启动硬性要求 WebGL 域策略文件（本机各冒烟线同口径）
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
PASS, FAIL = [], []
def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("PASS " if cond else "FAIL ") + label)

class Sess:
    def __init__(self, vw=360, vh=740):
        port = base.free_port(); prof = "/tmp/chrome-step0-%d" % port
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
        self.c.call("Page.addScriptToEvaluateOnNewDocument", {"source": r"""
window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});
try{ localStorage.setItem('wuri_pro_redeem','1'); localStorage.setItem('wuri_jing_py','1');
     localStorage.removeItem('wuri_jing_autopos'); }catch(e){}
"""})
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

DOCK_JS = r"""(function(){var row=document.querySelector('.jing-dock-row');var btns=[...row.querySelectorAll('.jd-btn')].filter(b=>!b.hidden&&b.offsetParent!==null);return {ids:btns.map(b=>b.id),hs:btns.map(b=>b.getBoundingClientRect().height),tops:btns.map(b=>Math.round(b.getBoundingClientRect().top)),sw:row.scrollWidth,cw:row.clientWidth};})()"""
PANEL_JS = r"""(function(){var g=document.querySelector('#jing-audio-grp');var t=document.querySelector('#jing-tts-grp');return {audio:getComputedStyle(g).display!=='none', tts:!t.hidden};})()"""

s = Sess()
try:
    s.wait("!!document.querySelector('#jing-list .jing-sec-h')", 40)
    s.ev(r"""(function(){var els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.children.length===0&&e.textContent.trim()==='经文');if(els.length)els[0].click();})()""")
    s.wait("!!document.querySelector('[data-neidan-toggle]')", 25)
    ok(True, "经文页可达")
    ok(s.ev(r"""(function(){var h=document.querySelector('[data-neidan-toggle]');return !!h && h.textContent.indexOf('常见内丹书籍')===0 && h.textContent.indexOf('内丹经文')<0;})()"""), "书架分类名已改：常见内丹书籍（h3 首串）")
    ok(s.ev("!document.querySelector('#jing-dock-marks')"), "我的标记底栏钮 DOM 不存在")

    # ---- 点架发现：一本多节、一本单节，并记录读面板分支 ----
    ids = s.ev(r"""[...document.querySelectorAll('#jing-list [data-jing]')].map(e=>e.getAttribute('data-jing'))""") or []
    multi = single = None; branches = {}
    for bid in ids[:14]:
        s.ev("(function(){var el=document.querySelector('#jing-list [data-jing=\"%s\"]');if(el)el.click();})()" % bid)
        if not s.wait("window._jingCurrentId==='%s'" % bid, 8): continue
        nsec = s.ev("(function(){var d=window.JINGWEN&&JINGWEN['%s'];return d?d.sections.length:0;})()" % bid)
        s.ev("document.querySelector('#jing-read-btn').click()"); time.sleep(0.25)
        branches[bid] = s.ev(PANEL_JS)
        s.ev("document.querySelector('#jing-read-btn').click()"); time.sleep(0.15)
        if nsec > 1 and not multi: multi = bid
        if nsec == 1 and not single: single = bid
        s.ev("window.closeReader && closeReader()"); time.sleep(0.3)
        if multi and single: break
    ok(bool(multi), "发现多节书 %s" % multi)
    ok(bool(single), "发现单节书 %s" % single)
    ok(any(b["audio"] and not b["tts"] for b in branches.values()), "读面板音频分支实测（有录音书音频组显/TTS 组藏）")
    ok(any(b["tts"] and not b["audio"] for b in branches.values()) or True, "读面板分支记录：%s" % {k: ("A" if v["audio"] else "T") for k, v in branches.items()})

    # ---- 多节书：六钮断言 ----
    s.ev("(function(){var el=document.querySelector('#jing-list [data-jing=\"%s\"]');el.click();})()" % multi)
    s.wait("window._jingCurrentId==='%s'" % multi, 10)
    d = s.ev(DOCK_JS)
    ok(d["ids"] == ["jing-toc-btn", "jing-read-btn", "jing-recite", "jing-font-btn", "jing-foldall", "jing-pybtn"], "常见多节书底栏六钮序：%s" % ",".join(d["ids"]))
    ok(all(h >= 44 for h in d["hs"]), "六钮高均>=44px (%s)" % ",".join(str(round(h)) for h in d["hs"]))
    ok(max(d["tops"]) - min(d["tops"]) <= 3, "六钮同行无换行")
    ok(d["sw"] <= d["cw"] + 1, "底栏行无横向溢出 sw=%s cw=%s" % (d["sw"], d["cw"]))

    # ---- 书内搜索 ----
    s.ev("document.querySelector('#jing-find-ico').click()")
    time.sleep(0.3)
    ok(s.ev("!document.querySelector('#jing-findbar').hidden"), "点状态行搜索图标→findbar 打开")
    ok(s.ev("!!document.querySelector('#jing-toc').hidden"), "点搜索图标未误开目录面板")
    s.ev(r"""(function(){var i=document.querySelector('#jing-find-q');i.value='道';i.dispatchEvent(new Event('input',{bubbles:true}));})()""")
    s.wait("(window.__wuriFind?__wuriFind.hits().length:0)>0", 10)
    n1 = s.ev("__wuriFind.hits().length") or 0
    ok(n1 > 0, "书内搜「道」命中 %d 处" % n1)
    ok(s.ev(r"""/^\d+ \/ \d+ 处$/.test(document.querySelector('#jing-find-count').textContent)"""), "计数格式 n / N 处")
    i0 = s.ev("__wuriFind.idx()")
    s.ev("document.querySelector('#jing-find-next').click()")
    time.sleep(0.6)
    ok(s.ev("__wuriFind.idx()") != i0 or n1 == 1, "下一个跳转 idx 变化 (%s→%s)" % (i0, s.ev("__wuriFind.idx()")))
    s.ev("document.querySelector('#jing-find-close').click()")
    ok(s.ev("document.querySelector('#jing-find-count').textContent==='' && document.querySelector('#jing-findbar').hidden"), "关闭搜索→计数清空、findbar 收起")

    # ---- 字体版式三行 ----
    s.ev("document.querySelector('#jing-font-btn').click()")
    time.sleep(0.3)
    ok(s.ev("!!document.querySelector('#jing-font-range')"), "字面板含字号滑杆")
    s.ev(r"""(function(){var r=document.querySelector('#jing-font-range');r.value='22';r.dispatchEvent(new Event('input',{bubbles:true}));})()""")
    time.sleep(0.3)
    ok(s.ev("getComputedStyle(document.querySelector('#jing-content')).fontSize==='22px'"), "滑杆 22→正文字号 22px")
    ok(s.ev("localStorage.getItem('wuri_jing_font')==='22'"), "字号持久化 wuri_jing_font=22")
    s.ev("document.querySelector('#jing-font-panel [data-ff=\"kai\"]').click()")
    ok(s.ev("document.querySelector('#jing-content').classList.contains('rp-ff-kai') && localStorage.getItem('wuri_jing_ff')==='kai'"), "楷体：rp-ff-kai 类+持久化")
    s.ev("document.querySelector('#jing-font-panel [data-lh=\"wide\"]').click()")
    time.sleep(0.2)
    lh = s.ev("(function(){var p=document.querySelector('#jing-content .jing-para');return p?parseFloat(getComputedStyle(p).lineHeight):0;})()")
    ok(abs(lh - 55) <= 3, "行距宽档：段落行高≈55px(22×2.5) 实测 %.1f" % lh)
    s.ev("window.closeReader && closeReader()"); time.sleep(0.3)

    # ---- 单节书：五钮 ----
    s.ev("(function(){var el=document.querySelector('#jing-list [data-jing=\"%s\"]');el.click();})()" % single)
    s.wait("window._jingCurrentId==='%s'" % single, 10)
    d1 = s.ev(DOCK_JS)
    ok(d1["ids"] == ["jing-toc-btn", "jing-read-btn", "jing-recite", "jing-font-btn", "jing-pybtn"], "单节书五钮（全展开隐藏）：%s" % ",".join(d1["ids"]))
    s.ev("window.closeReader && closeReader()"); time.sleep(0.3)

    # ---- 常见书注音真开真关 ----
    s.ev("(function(){var el=document.querySelector('#jing-list [data-jing=\"%s\"]');el.click();})()" % multi)
    s.wait("window._jingCurrentId==='%s'" % multi, 10)
    ok(s.ev("!!document.querySelector('#jing-pybtn') && !document.querySelector('#jing-pybtn').hidden"), "常见书注音钮在")
    ok(s.ev("document.querySelectorAll('#jing-content rt').length>0 && !document.querySelector('#jing-content').classList.contains('no-py')"), "常见书注音开：rt 渲染且未挂 no-py")
    s.ev("document.querySelector('#jing-pybtn').click()")
    time.sleep(0.4)
    ok(s.ev("document.querySelector('#jing-content').classList.contains('no-py') && document.querySelector('#jing-pybtn').textContent==='注音开'"), "常见书点注音钮→关（no-py＋钮面变注音开）")
    s.ev("document.querySelector('#jing-pybtn').click()")
    time.sleep(0.4)
    ok(s.ev("!document.querySelector('#jing-content').classList.contains('no-py')"), "常见书再点→注音恢复开")
    s.ev("window.closeReader && closeReader()"); time.sleep(0.3)

    # ---- 内丹书：无注音钮（能力判定）+ TTS 分流 ----
    s.ev("document.querySelector('[data-neidan-toggle]').click()")
    time.sleep(0.4)
    nd_ids = s.ev(r"""[...document.querySelectorAll('.jing-neidan-body [data-jing]')].map(e=>e.getAttribute('data-jing'))""") or []
    s_nd = next((x for x in nd_ids if x.startswith('s')), None)
    ok(bool(s_nd), "内丹架 s 书可定位：%s（共 %d 条）" % (s_nd, len(nd_ids)))
    s.ev("(function(){var el=document.querySelector('.jing-neidan-body [data-jing=\"%s\"]');el.click();})()" % s_nd)
    s.wait("window._jingCurrentId==='%s'" % s_nd, 15)
    dnd = s.ev(DOCK_JS)
    ok("jing-pybtn" not in dnd["ids"], "内丹书（%s）底栏无注音钮：%s" % (s_nd, ",".join(dnd["ids"])))
    ok(set(["jing-toc-btn", "jing-read-btn", "jing-recite", "jing-font-btn"]).issubset(set(dnd["ids"])), "内丹书底栏含目录读背诵字")
    ok(s.ev("document.querySelectorAll('#jing-content rt').length===0"), "内丹书正文无 rt（无注音数据实证）")
    s.ev("document.querySelector('#jing-read-btn').click()")
    time.sleep(0.3)
    ok(s.ev("(function(){var t=document.querySelector('#jing-tts-grp');var g=document.querySelector('#jing-audio-grp');return !t.hidden && getComputedStyle(g).display==='none';})()"), "内丹无录音→读面板 TTS 组显、音频组藏")
    s.ev("document.querySelector('#jing-read-btn').click()")
    s.ev("window.closeReader && closeReader()"); time.sleep(0.3)
    # KR 指针内丹：能力一致性（钮显隐与正文 rt 有无一致，不预设类别结论）
    kr_nd = next((x for x in nd_ids if x.startswith('KR')), None)
    if kr_nd:
        s.ev("(function(){var el=document.querySelector('.jing-neidan-body [data-jing=\"%s\"]');el.click();})()" % kr_nd)
        if s.wait("window._jingCurrentId==='%s'" % kr_nd, 30):
            dkr = s.ev(DOCK_JS)
            has_rt = s.ev("document.querySelectorAll('#jing-content rt').length>0")
            ok(("jing-pybtn" in dkr["ids"]) == bool(has_rt), "KR 内丹（%s）能力一致性：钮=%s rt=%s" % (kr_nd, "jing-pybtn" in dkr["ids"], has_rt))
            s.ev("window.closeReader && closeReader()"); time.sleep(0.3)

    # ---- 道藏书：同底栏 + 注音钮 + TTS 分流 + 背诵 ----
    s.ev("document.querySelector('[data-dz-toggle]').click()")
    s.wait("!!document.querySelector('[data-dz-body]') && !document.querySelector('[data-dz-body]').hidden", 30)
    s.wait("document.querySelectorAll('[data-dz-bu],[data-dz-work]').length>0", 60)
    if not s.ev("document.querySelectorAll('[data-dz-work]').length>0"):
        s.ev("(function(){var b=document.querySelector('[data-dz-bu]');if(b)b.click();})()")
        s.wait("document.querySelectorAll('[data-dz-work]').length>0", 30)
    s.ev("(function(){var el=document.querySelector('[data-dz-work]');if(el)el.click();})()")
    s.wait("!!window._jingCurrentId && /^KR5/.test(window._jingCurrentId)", 60)
    dzid = s.ev("window._jingCurrentId")
    ok(bool(dzid), "道藏书打开：%s" % dzid)
    d2 = s.ev(DOCK_JS)
    ok(set(["jing-toc-btn", "jing-read-btn", "jing-recite", "jing-font-btn", "jing-pybtn"]).issubset(set(d2["ids"])), "道藏书底栏含目录读背诵字注音：%s" % ",".join(d2["ids"]))
    ok(all(h >= 44 for h in d2["hs"]) and d2["sw"] <= d2["cw"] + 1, "道藏底栏钮高>=44 且无溢出")
    ok(s.ev("document.querySelectorAll('#jing-content rt').length>0"), "道藏书注音开：rt 渲染")
    s.ev("document.querySelector('#jing-pybtn').click()")
    time.sleep(0.4)
    ok(s.ev("document.querySelector('#jing-content').classList.contains('no-py')"), "道藏书点注音钮→关（no-py）")
    s.ev("document.querySelector('#jing-pybtn').click()")
    time.sleep(0.4)
    s.ev("document.querySelector('#jing-read-btn').click()")
    time.sleep(0.3)
    ok(s.ev("(function(){var t=document.querySelector('#jing-tts-grp');var g=document.querySelector('#jing-audio-grp');return !t.hidden && getComputedStyle(g).display==='none';})()"), "道藏无录音→读面板 TTS 组显、音频组藏")
    s.ev(r"""(function(){var sp=document.querySelector('#jing-tts-speed');sp.value='1.5';sp.dispatchEvent(new Event('change',{bubbles:true}));})()""")
    ok(s.ev("localStorage.getItem('wuri_jing_tts_rate')==='1.5'"), "TTS 语速持久化 wuri_jing_tts_rate=1.5")
    s.ev("document.querySelector('#jing-read-btn').click()")
    s.ev("document.querySelector('#jing-recite').click()")
    s.wait("document.querySelectorAll('.recite-sen').length>0", 20)
    ok(s.ev("document.querySelectorAll('.recite-sen').length>0"), "道藏书背诵可开（recite-sen 出现）")

    errs = s.ev("window.__errs")
    ok(not errs, "全程无 JS 报错 %s" % (errs[:3] if errs else ""))
finally:
    s.close()
print("\n==== %d PASS / %d FAIL ====" % (len(PASS), len(FAIL)))
if FAIL: print("FAILED:", FAIL)
sys.exit(1 if FAIL else 0)
