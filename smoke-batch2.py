#!/usr/bin/env python3
# 批二验证：生词本（查字入本/去重/翻看/删）／自动滚动（起停/触停/速度档）／
# 系统朗读 TTS（stub 语音合成验调用链与状态机）／分享图卡（Canvas 出图+宣纸像素）
# 用法: python3 smoke-batch2.py
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
    def __init__(self, vw=360, vh=740):
        port = base.free_port(); prof = "/tmp/chrome-b2-%d" % port
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
     localStorage.removeItem('wuri_jing_autopos'); localStorage.removeItem('wuri_jing_vocab');
     localStorage.removeItem('wuri_jing_highlights'); }catch(e){}
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

SEL4_JS = r"""(function(){var ps=[...document.querySelectorAll('#jing-content .jing-para')].filter(p=>p.textContent.length>=12);if(!ps.length)return false;var para=ps[0];var walker=document.createTreeWalker(para,NodeFilter.SHOW_TEXT,{acceptNode:function(x){return (x.parentElement&&x.parentElement.closest('rt,rp'))?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});var nodes=[],nd;while((nd=walker.nextNode())){if(nd.nodeValue.trim())nodes.push(nd);}if(nodes.length<3)return false;var r=document.createRange();r.setStart(nodes[0],0);var last=nodes[Math.min(3,nodes.length-1)];r.setEnd(last,last.nodeValue.length);var sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);para.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return sel.toString();})()"""

s = Sess()
try:
    s.wait("!!document.querySelector('#jing-list .jing-sec-h')", 40)
    s.ev(r"""(function(){var els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.children.length===0&&e.textContent.trim()==='经文');if(els.length)els[0].click();})()""")
    s.wait("!!document.querySelector('[data-neidan-toggle]')", 25)

    # ---------- 生词本 ----------
    s.ev(r"""(function(){var el=document.querySelector('#jing-list [data-jing="s02"]');if(el)el.click();})()""")
    s.wait("window._jingCurrentId==='s02'", 15)
    sel = s.ev(SEL4_JS)
    ok(bool(sel), "正文选字：%s" % sel)
    s.wait("!!document.querySelector('#dict-fab') && !document.querySelector('#dict-fab').hidden", 8)
    s.ev("document.querySelector('#dict-fab').click()")
    s.wait("!!document.querySelector('#dict-card') && !document.querySelector('#dict-card').hidden", 15)
    s.wait("__wuriVocab.list().length>=1", 10)
    vb = s.ev("__wuriVocab.list()")
    ok(len(vb) >= 1, "查字后自动入生词本：%s" % json.dumps(vb[0], ensure_ascii=False)[:110] if vb else "空")
    if vb:
        e0 = vb[0]
        ok(bool(e0.get("py") or e0.get("def")), "词条含读音或释义")
        ok(bool(e0.get("book")), "词条含出处书名：%s" % e0.get("book"))
        ok(bool(e0.get("sentence")), "词条含原句节选")
        w0 = e0["word"]
        # 重复查同词：只更新不重复建条
        s.ev(SEL4_JS)
        s.wait("!!document.querySelector('#dict-fab') && !document.querySelector('#dict-fab').hidden", 8)
        s.ev("document.querySelector('#dict-fab').click()")
        time.sleep(2.5)
        ok(s.ev("__wuriVocab.list().filter(function(x){return x.word==='%s';}).length" % w0) == 1, "同词重复查不重复建条")
    s.ev("window.closeReader && closeReader()"); time.sleep(0.4)
    s.ev("document.querySelector('#jing-vocab-row').click()")
    time.sleep(0.4)
    ok(s.ev("!!document.querySelector('#jing-vocab-panel') && !document.querySelector('#jing-vocab-panel').hidden && !!document.querySelector('.vocab-item')"), "经文页生词本入口打开列表")
    s.ev("document.querySelector('.vocab-del').click()")
    time.sleep(0.4)
    ok(s.ev("__wuriVocab.list().length") == 0, "生词可删（删后 0 条）")

    # ---------- 自动滚动 ----------
    s.ev(r"""(function(){var el=document.querySelector('#jing-list [data-jing="s02"]');if(el)el.click();})()""")
    s.wait("window._jingCurrentId==='s02'", 15)
    s.wait("document.querySelectorAll('#jing-content .jing-para').length>100", 20)
    s.ev("window.scrollTo(0,0)")
    time.sleep(0.5)
    s.ev("__wuriAutoScroll.start()")
    time.sleep(3.2)
    y1 = s.ev("Math.round(window.scrollY)")
    ok(s.ev("__wuriAutoScroll.on()") and y1 >= 40, "自动滚动慢档 3.2 秒下移 %d px 且保持开" % y1)
    s.ev("document.querySelector('#jing-content').dispatchEvent(new TouchEvent('touchstart',{bubbles:true}))")
    time.sleep(0.3)
    ok(not s.ev("__wuriAutoScroll.on()"), "手指触碰正文即停")
    s.ev("__wuriAutoScroll.setSpeed('mid')")
    ok(s.ev("localStorage.getItem('wuri_jing_as_speed')==='mid'"), "速度档持久化（中）")
    s.ev("__wuriAutoScroll.start()")
    time.sleep(2.2)
    y2 = s.ev("Math.round(window.scrollY)")
    ok(y2 > y1 + 50, "中档滚动更快（+%d px / 2.2s）" % (y2 - y1))
    s.ev("__wuriAutoScroll.stop()")
    s.ev("window.closeReader && closeReader()"); time.sleep(0.4)

    # ---------- 系统朗读 TTS（stub 合成器） ----------
    s.ev(r"""(function(){
      window.__ttsLog=[]; window.__curU=null;
      var ss=window.speechSynthesis;
      ss.getVoices=function(){return [{lang:'zh-CN',name:'FakeZH'}];};
      ss.speak=function(u){window.__ttsLog.push(u.text);window.__curU=u;};
      ss.cancel=function(){window.__ttsLog.push('__cancel__');};
    })()""")
    s.ev("document.querySelector('[data-neidan-toggle]').click()")
    time.sleep(0.4)
    s.ev(r"""(function(){var el=document.querySelector('.jing-neidan-body [data-jing="s41"]');if(el)el.click();})()""")
    s.wait("window._jingCurrentId==='s41'", 20)
    s.ev("document.querySelector('#jing-read-btn').click()")
    time.sleep(0.3)
    ok(s.ev("!!document.querySelector('#jing-tts-btn') && !document.querySelector('#jing-tts-grp').hidden"), "内丹无录音书：系统朗读入口在")
    s.ev("document.querySelector('#jing-tts-btn').click()")
    s.wait("__wuriTTSState().on", 10)
    tst = s.ev("__wuriTTSState()")
    ok(tst["on"] and tst["total"] >= 1, "TTS 启动：当前节句子队列 %s 句" % tst.get("total"))
    ok(s.ev("window.__ttsLog.length") >= 1, "合成器收到首句朗读请求")
    ok(s.ev("!!document.querySelector('#jing-content .jing-para.follow-cur')"), "首句段落高亮（follow-cur）")
    ok(s.ev("document.querySelector('#jing-tts-btn').textContent==='停止朗读'"), "朗读中钮面＝停止朗读")
    s.ev("window.__curU.onend()")
    s.wait("__wuriTTSState().idx>=1", 8)
    ok(True, "onend 推进到下一句（idx=%s）" % s.ev("__wuriTTSState().idx"))
    s.ev("__wuriTTSStop()")
    ok(s.ev("!__wuriTTSState().on && window.__ttsLog.indexOf('__cancel__')>=0"), "停止→cancel 且状态关")
    s.ev("window.closeReader && closeReader()"); time.sleep(0.4)

    # ---------- 分享图卡 ----------
    s.ev(r"""(function(){var el=document.querySelector('#jing-list [data-jing="s02"]');if(el)el.click();})()""")
    s.wait("window._jingCurrentId==='s02'", 15)
    s.ev(r"""(function(){var ps=[...document.querySelectorAll('#jing-content .jing-para')];ps.sort((a,b)=>b.textContent.length-a.textContent.length);var p=ps[0];var r=document.createRange();r.selectNodeContents(p);var sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()""")
    s.wait("!!document.querySelector('#hl-pop [data-hl-color]') && !document.querySelector('#hl-pop').hidden", 10)
    ok(s.ev("!!document.querySelector('#hl-card')"), "选字弹窗含图卡钮（分享旁）")
    card = s.ev("__wuriMakeCard()")
    ok(bool(card) and card["w"] == 750 and card["h"] > 300, "图卡尺寸 750×%s" % (card or {}).get("h"))
    ok(bool(card) and card["dataUrl"].startswith("data:image/png") and len(card["dataUrl"]) > 15000, "图卡 PNG 数据 %s KB" % (len(card["dataUrl"]) // 1024 if card else 0))
    px = s.ev(r"""(function(){return new Promise(function(res){var img=new Image();img.onload=function(){var cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;var cx=cv.getContext('2d');cx.drawImage(img,0,0);var d=cx.getImageData(30,30,1,1).data;res([d[0],d[1],d[2]]);};img.src=__wuriMakeCard().dataUrl;});})()""")
    ok(px and abs(px[0] - 246) <= 8 and abs(px[1] - 239) <= 8 and abs(px[2] - 219) <= 8, "图卡底色＝宣纸 #f6efdb（实测 %s）" % px)
    errs = s.ev("window.__errs")
    ok(not errs, "全程无 JS 报错 %s" % (errs[:3] if errs else ""))
finally:
    s.close()
print("\n==== %d PASS / %d FAIL ====" % (len(PASS), len(FAIL)))
if FAIL: print("FAILED:", FAIL)
sys.exit(1 if FAIL else 0)
