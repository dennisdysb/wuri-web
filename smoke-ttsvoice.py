#!/usr/bin/env python3
# 诵读面板 TTS 语音选择两修冒烟（2026-10-29 真机反馈）：
#  1 布局：语音组并入朗读行——系统朗读＋语速＋语音 360 档同排一行、不出界
#  2 空下拉：voices 替身三态——(A) 即时有中文（列出/可选/选中生效）
#     (B) 迟到（先空→占位「加载中…」→超时定型隐藏→voiceschanged 迟到补填复显）
#     (C) 有语音无中文（整组隐藏、行不塌、朗读回落默认语音）
# 用法: python3 smoke-ttsvoice.py
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/.wt/tts-voice/www")
SHOTS = os.path.expanduser("~/workspace/.wt/tts-voice/ttsvoice-shots")
os.makedirs(SHOTS, exist_ok=True)
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
PASS, FAIL = [], []
def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("PASS " if cond else "FAIL ") + label)

def stub(late):
    return r"""
window.__ttsCalls=[]; window.__ttsUtter=[];
var fakeSS={ _v:__V0__, _h:[],
 getVoices:function(){return this._v;},
 addEventListener:function(t,f){ if(t==='voiceschanged') this._h.push(f); },
 removeEventListener:function(){},
 speak:function(u){window.__ttsCalls.push(u.text); window.__ttsUtter.push(u);
   u._t=setTimeout(function(){ if(u.onend) u.onend(); },40);},
 cancel:function(){window.__ttsUtter.forEach(function(u){ if(u._t) clearTimeout(u._t); });},
 pause:function(){}, resume:function(){}, speaking:false, pending:false, paused:false };
try{ Object.defineProperty(window,'speechSynthesis',{value:fakeSS,configurable:true}); }catch(e){ window.speechSynthesis=fakeSS; }
window.SpeechSynthesisUtterance=function(t){this.text=t;this.lang='';this.rate=1;this.voice=null;this.onend=null;this.onerror=null;};
window.__setVoices=function(v){ fakeSS._v=v; fakeSS._h.forEach(function(f){ try{f();}catch(e){} }); };
""".replace("__V0__", "[]" if late else
  "[{name:'中文语音甲',lang:'zh-CN',voiceURI:'fake-zh-a'},"
  "{name:'中文语音乙',lang:'zh-TW',voiceURI:'fake-zh-b'},"
  "{name:'English US',lang:'en-US',voiceURI:'fake-en'}]")

STUB_NOZH = stub(False).replace(
  "[{name:'中文语音甲',lang:'zh-CN',voiceURI:'fake-zh-a'},"
  "{name:'中文语音乙',lang:'zh-TW',voiceURI:'fake-zh-b'},"
  "{name:'English US',lang:'en-US',voiceURI:'fake-en'}]",
  "[{name:'English US',lang:'en-US',voiceURI:'fake-en'},"
  "{name:'日本語',lang:'ja-JP',voiceURI:'fake-ja'}]")

class Sess:
    def __init__(self, seed_js="", vw=360, vh=740):
        port = base.free_port(); prof = "/tmp/chrome-ttsv-%d" % port
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
        src = ("window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});\n"
               "try{ localStorage.setItem('wuri_pro_redeem','1'); localStorage.setItem('wuri_jing_py','1'); }catch(e){}\n" + seed_js)
        self.c.call("Page.addScriptToEvaluateOnNewDocument", {"source": src})
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
    def shot(self, name):
        r = self.c.call("Page.captureScreenshot", {"format": "png"})
        import base64
        open(os.path.join(SHOTS, name), "wb").write(base64.b64decode(r["data"]))
    def close(self):
        try: self.proc.terminate()
        except Exception: pass

def goto_jing(s):
    s.wait("!!document.querySelector('#jing-list .jing-sec-h')", 40)
    s.ev(r"""(function(){var els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.children.length===0&&e.textContent.trim()==='经文');if(els.length)els[0].click();})()""")
    s.wait("!!document.querySelector('[data-neidan-toggle]')", 25)

def open_tts_panel(s):
    s.ev("window.__wuri_dzOpenWork('KR5a0001')")
    s.wait("window._jingCurrentId==='KR5a0001'", 30)
    s.wait("!!document.querySelector('#jing-content .jing-sec')", 30)
    time.sleep(0.8)
    s.ev("document.querySelector('#jing-read-btn').click()")
    time.sleep(0.6)

GEO = r"""(function(){
  var g=document.querySelector('#jing-tts-grp'), row=document.querySelector('#jing-tts-voice-row'),
      sel=document.querySelector('#jing-tts-voice'), btn=document.querySelector('#jing-tts-btn'),
      spd=document.querySelector('#jing-tts-speed'), panel=document.querySelector('#jing-play-panel');
  function R(e){ return e?e.getBoundingClientRect():null; }
  var rb=R(btn), rs=R(spd), rv=R(sel), rp=R(panel), rr=R(row);
  return { grpHidden:g?g.hidden:null,
    rowHidden:row?row.hidden:null, rowDisplay:row?getComputedStyle(row).display:null,
    selDisabled:sel?sel.disabled:null,
    opts:sel?[...sel.options].map(o=>o.textContent):[],
    tops:{btn:rb?Math.round(rb.top):null, spd:rs?Math.round(rs.top):null, voice:rv?Math.round(rv.top):null},
    voiceRight:rv?Math.round(rv.right):null, panelRight:rp?Math.round(rp.right):null,
    panelSW:panel?panel.scrollWidth:null, panelCW:panel?panel.clientWidth:null,
    rowH:rr?Math.round(rr.height):null };
})()"""

# ================= 会话 A：即时有中文语音 =================
s = Sess(seed_js=stub(False))
try:
    goto_jing(s)
    open_tts_panel(s)
    m = s.ev(GEO)
    ok(m and not m["grpHidden"], "A 无录音书读面板显系统朗读组")
    ok(m and not m["rowHidden"] and m["rowDisplay"] != "none", "A 语音组可见（display=%s）" % (m and m["rowDisplay"]))
    ok(m and m["opts"] == ["中文语音甲", "中文语音乙"], "A 语音选项＝中文语音照原名 %s" % (m and m["opts"]))
    ok(m and not m["selDisabled"], "A 语音下拉可用")
    tp = m["tops"] if m else {}
    ok(m and None not in tp.values() and max(tp.values()) - min(tp.values()) <= 2,
       "A 三控件同排一行 tops=%s" % tp)
    ok(m and m["panelSW"] <= m["panelCW"] + 1, "A 面板无横向溢出 sw=%s cw=%s" % (m and m["panelSW"], m and m["panelCW"]))
    ok(m and m["voiceRight"] <= m["panelRight"] + 1, "A 语音下拉不出面板右界 r=%s/%s" % (m and m["voiceRight"], m and m["panelRight"]))
    s.shot("a-day.png")
    # 夜态＋红光：结构不塌、仍一行
    s.ev("document.documentElement.setAttribute('data-theme','night')")
    time.sleep(0.3)
    m2 = s.ev(GEO)
    tp2 = m2["tops"] if m2 else {}
    ok(m2 and m2["rowDisplay"] != "none" and max(tp2.values()) - min(tp2.values()) <= 2, "A 夜态仍一行可见 tops=%s" % tp2)
    s.ev("document.body.classList.add('sky-red')")
    time.sleep(0.3)
    m3 = s.ev(GEO)
    tp3 = m3["tops"] if m3 else {}
    ok(m3 and m3["rowDisplay"] != "none" and max(tp3.values()) - min(tp3.values()) <= 2, "A 红光仍一行可见 tops=%s" % tp3)
    s.shot("a-red.png")
    s.ev("document.body.classList.remove('sky-red');document.documentElement.setAttribute('data-theme','day')")
    # 选中生效：改选乙 → 持久化 → 起读下一句用乙
    s.ev(r"""(function(){var sel=document.querySelector('#jing-tts-voice'); sel.value='fake-zh-b'; sel.dispatchEvent(new Event('change',{bubbles:true}));})()""")
    ok(s.ev("localStorage.getItem('wuri_jing_tts_voice')") == "fake-zh-b", "A 语音选择已持久化")
    s.ev("document.querySelector('#jing-tts-btn').click()")
    ok(s.wait("window.__ttsCalls.length>0", 10), "A TTS 起读")
    time.sleep(0.4)
    ok(s.ev("(function(){var u=window.__ttsUtter[window.__ttsUtter.length-1]; return u&&u.voice?u.voice.voiceURI:'';})()") == "fake-zh-b",
       "A 朗读用所选语音 fake-zh-b")
    s.ev("if(window.__wuriTTSStop)window.__wuriTTSStop()")
    errs = s.ev("window.__errs")
    ok(not errs, "A 无 JS 报错 %s" % (errs[:3] if errs else ""))
finally:
    s.close()

# ================= 会话 B：语音迟到 =================
s = Sess(seed_js=stub(True))
try:
    # 页面刚载入、语音表未到：占位态（下拉禁用＋「加载中…」、组可见）
    # ——以状态谓词等待而非墙钟（init 填充时点随页面载入浮动）
    ok(s.wait("(function(){var sel=document.querySelector('#jing-tts-voice'),row=document.querySelector('#jing-tts-voice-row');"
              "return sel&&row&&!row.hidden&&sel.disabled&&sel.options.length===1&&sel.options[0].textContent==='加载中…';})()", 20),
       "B 未定型先占位（禁用＋加载中…）")
    # 2.5s 后仍无表 → 定型隐藏（不留假占位）
    ok(s.wait("(function(){var row=document.querySelector('#jing-tts-voice-row');return row&&row.hidden===true;})()", 12),
       "B 超时无表定型隐藏")
    # 迟到：中文语音到达＋voiceschanged → 补填复显
    s.ev("window.__setVoices([{name:'中文语音甲',lang:'zh-CN',voiceURI:'fake-zh-a'},{name:'中文语音乙',lang:'zh-TW',voiceURI:'fake-zh-b'}])")
    time.sleep(0.4)
    late = s.ev(r"""(function(){var sel=document.querySelector('#jing-tts-voice'),row=document.querySelector('#jing-tts-voice-row');
      return {rowHidden:row.hidden, dis:sel.disabled, opts:[...sel.options].map(o=>o.textContent)};})()""")
    ok(late and not late["rowHidden"] and not late["dis"] and late["opts"] == ["中文语音甲", "中文语音乙"],
       "B 迟到补填复显 %s" % (late,))
    # 开面板实测一行
    goto_jing(s)
    open_tts_panel(s)
    m = s.ev(GEO)
    tp = m["tops"] if m else {}
    ok(m and m["rowDisplay"] != "none" and max(tp.values()) - min(tp.values()) <= 2, "B 面板内一行可见 tops=%s" % tp)
    s.shot("b-late.png")
    errs = s.ev("window.__errs")
    ok(not errs, "B 无 JS 报错 %s" % (errs[:3] if errs else ""))
finally:
    s.close()

# ================= 会话 C：有语音、无中文 =================
s = Sess(seed_js=STUB_NOZH)
try:
    goto_jing(s)
    open_tts_panel(s)
    m = s.ev(GEO)
    ok(m and not m["grpHidden"], "C 系统朗读组可见")
    ok(m and m["rowHidden"] and m["rowDisplay"] == "none",
       "C 无中文语音整组隐藏（display=%s）" % (m and m["rowDisplay"]))
    tp = m["tops"] if m else {}
    ok(m and tp["btn"] is not None and tp["spd"] is not None and abs(tp["btn"] - tp["spd"]) <= 2,
       "C 余下控件仍一行 tops=%s" % tp)
    ok(m and m["panelSW"] <= m["panelCW"] + 1, "C 面板无横向溢出 sw=%s cw=%s" % (m and m["panelSW"], m and m["panelCW"]))
    sr = s.ev(r"""(function(){var r=document.querySelector('#jing-tts-grp .jmp-row');var b=r?r.getBoundingClientRect():null;
      return b?Math.round(b.height):null;})()""")
    ok(sr is not None and sr <= 52, "C 朗读行单行高不塌 h=%s" % sr)
    s.shot("c-nozh.png")
    # 无中文语音仍可朗读（回落默认语音 voice=null）
    s.ev("document.querySelector('#jing-tts-btn').click()")
    ok(s.wait("window.__ttsCalls.length>0", 10), "C TTS 仍可起读")
    time.sleep(0.3)
    ok(s.ev("(function(){var u=window.__ttsUtter[window.__ttsUtter.length-1]; return u?String(u.voice):'none';})()") == "null",
       "C 回落默认语音（voice=null）")
    s.ev("if(window.__wuriTTSStop)window.__wuriTTSStop()")
    errs = s.ev("window.__errs")
    ok(not errs, "C 无 JS 报错 %s" % (errs[:3] if errs else ""))
finally:
    s.close()

print("\n==== ttsvoice smoke: PASS %d / FAIL %d ====" % (len(PASS), len(FAIL)))
for f in FAIL: print("  FAILED: " + f)
sys.exit(1 if FAIL else 0)
