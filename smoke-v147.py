#!/usr/bin/env python3
# 专项冒烟（SW v147）：道藏标点 batch-003 合入（punct 75→191）＋ dzSecMap 高亮投影修复——
# 入药镜 s41(KR5i0039)/天仙正理 s47(KR5i0067) 底本含制表符残留，旧 dzSecMap 单侧口径
# 比对失败致整卷不投影（高亮走回退）；修复后含 \t 段的高亮须能投影且往返内容一致。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
OUT = os.path.expanduser("~/workspace/wuri-web/punct147-shots")
os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:500]))

def rd(p): return open(os.path.join(WWW, p), encoding="utf-8").read()

# ---------- 静态检查 ----------
sw, html, i18n = rd("sw.js"), rd("index.html"), rd("js/i18n.js")
report("S1 四件套 v147", "wuri-v147" in sw and "style.css?v=147" in sw and "style.css?v=147" in html
       and "内部 v147" in html and i18n.count("内部 v147") + i18n.count("內部 v147") >= 2)
idx = json.loads(rd("content/daozang/index.json"))
report("S2 feed v3/punct191/partial", idx.get("version") == 3 and len(idx.get("punct") or []) == 191
       and idx.get("punctPartial") == {"KR5a0001": 6})
report("S3 texts-punct 191 片齐", len([f for f in os.listdir(os.path.join(WWW, "content/daozang/texts-punct")) if f.endswith(".json")]) == 191)
dzjs = rd("js/daozang.js")
report("S4 dzSecMap 两侧同口径+oPos", "dzStripPunct(pJoin) === dzStripPunct(oJoin)" in dzjs and "oPos" in dzjs
       and "__wuri_dzHlToDisp" in dzjs and "__wuri_dzHlToOrig" in dzjs)

def launch(pro):
    port = base.free_port(); prof = f"/tmp/chrome-v147-{port}"
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                             "--allow-file-access-from-files",
                             "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=%d" % port,
                             "--user-data-dir=" + prof, "--window-size=500,1000", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    wsurl = None
    for _ in range(40):
        try:
            tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
            pg = [t for t in tg if t.get("type") == "page"]
            if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    c = base.CDP(base.ws_connect(wsurl))
    c.call("Page.enable"); c.call("Runtime.enable")
    c.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 1, "mobile": True})
    init = "window.__errs=[]; addEventListener('error',function(e){window.__errs.push(String(e.message||e.error));});"
    if pro: init += "try{localStorage.setItem('wuri_pro_redeem','1');}catch(e){}"
    c.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(4)
    return proc, c

def ev(c, expr):
    r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    return r["result"].get("value")

def wait_for(c, expr, secs=25):
    t0 = time.time()
    while time.time() - t0 < secs:
        try:
            if ev(c, expr): return True
        except Exception: pass
        time.sleep(0.4)
    return False

HL_TEST = r"""(function(id){
  var PUNCT='。，、；：？！·…—「」『』﹝﹞（）《》〈〉“”‘’％';
  function strip(s){var o='';for(var i=0;i<s.length;i++){var ch=s[i];if(PUNCT.indexOf(ch)<0&&!/\s/.test(ch))o+=ch;}return o;}
  var e=window.JINGWEN&&window.JINGWEN[id];
  if(!e) return {err:'no entry'};
  var out={punctMode:!!e.punctMode, secs:(e.sectionsOrig||[]).length, tabParas:0, projOK:0, rtOK:0, secMapOK:0, fails:[]};
  (e.sectionsOrig||[]).forEach(function(oSec,si){
    // 整卷映射存在性：取首个长段全段投影
    var done=false;
    for(var pi=0;pi<oSec.paras.length&&!done;pi++){
      var t=oSec.paras[pi].t;
      if(strip(t).length>=8){
        var d=window.__wuri_dzHlToDisp(id,{sec:si,para:pi,start:0,end:t.length});
        if(d&&d.length) out.secMapOK++;
        done=true;
      }
    }
    oSec.paras.forEach(function(p,pi2){
      var t=p.t, ti=t.indexOf('\t');
      if(ti<0) return;
      out.tabParas++;
      var pos=[];
      for(var i=0;i<t.length;i++){var ch=t[i];if(PUNCT.indexOf(ch)<0&&!/\s/.test(ch))pos.push(i);}
      // 候选窗口：(a) 原始跨度内含制表符的 6 内容字窗口（跨空白残留投影）
      // (b) 末 6 内容字窗口（段尾制表符情形：旧口径整卷映射失败，此窗口亦应可投影）
      var wins=[];
      for(var k=0;k+5<pos.length;k++){
        if(t.substring(pos[k],pos[k+5]+1).indexOf('\t')>=0){ wins.push([pos[k],pos[k+5]+1]); break; }
      }
      if(pos.length>=3){
        var tw=[pos[Math.max(0,pos.length-6)], pos[pos.length-1]+1];
        if(!wins.length || wins[0][0]!==tw[0] || wins[0][1]!==tw[1]) wins.push(tw);
      }
      if(!wins.length){ out.fails.push('nowin@'+si+'/'+pi2); return; }
      wins.forEach(function(w){
      var start=w[0], end=w[1];
      out.tested=(out.tested||0)+1;
      var origSub=strip(t.substring(start,end));
      var disp=window.__wuri_dzHlToDisp(id,{sec:si,para:pi2,start:start,end:end});
      if(!disp||!disp.length){ out.fails.push('null@'+si+'/'+pi2); return; }
      var dTxt='', pSec=e.sectionsPunct[si];
      disp.forEach(function(sg){ dTxt+=pSec.paras[sg.para].t.substring(sg.start,sg.end); });
      if(strip(dTxt)!==origSub){ out.fails.push('mismatch@'+si+'/'+pi2+':'+strip(dTxt)+' vs '+origSub); return; }
      out.projOK++;
      // 往返：逐投影段回投原文，拼接内容应与原选区一致
      var rTxt='';
      disp.forEach(function(sg){
        var back=window.__wuri_dzHlToOrig(id,sg);
        if(back) back.forEach(function(bs){ rTxt+=e.sectionsOrig[bs.sec].paras[bs.para].t.substring(bs.start,bs.end); });
      });
      if(strip(rTxt)===origSub) out.rtOK++; else out.fails.push('rt@'+si+'/'+pi2+':'+strip(rTxt)+' vs '+origSub);
      });
    });
  });
  return out;
})"""

proc, c = launch(True)
try:
    report("P0 Pro 基线", ev(c, "!!(window.WuriPro && WuriPro.isPro())") is True)
    ev(c, "document.querySelector('[data-tab=\"tab-jing\"]').click()"); time.sleep(1.0)
    for sid, nm in (("s41", "入药镜"), ("s47", "天仙正理")):
        ev(c, "window.JingWen && JingWen.openReader(%s)" % json.dumps(sid))
        ok = wait_for(c, "!!(window.JINGWEN && JINGWEN['%s'] && JINGWEN['%s'].sectionsPunct)" % (sid, sid), 30)
        report(f"R-{sid} {nm} 打开且标点数据就位", ok)
        if ok:
            time.sleep(0.6)
            r = ev(c, HL_TEST + "(%s)" % json.dumps(sid))
            report(f"H-{sid} {nm} 含制表符段投影+往返", r.get("tabParas", 0) > 0 and r.get("tested", 0) >= 1
                   and r.get("projOK") == r.get("tested")
                   and r.get("rtOK") == r.get("tested") and r.get("secMapOK") == r.get("secs"), json.dumps(r, ensure_ascii=False))
            print("   ", json.dumps(r, ensure_ascii=False)[:300])
        ev(c, "document.getElementById('jing-back').click()"); time.sleep(0.8)
    # batch-003 新标部渲染：西昇經 KR5c0047（洞神部）——走 v144 open_work 同款目录流
    if not ev(c, "!!document.querySelector('[data-dz-work=\"KR5c0047\"]')"):
        ev(c, "document.querySelector('[data-dz-toggle]').click()"); time.sleep(0.6)
    if not ev(c, "!!document.querySelector('[data-dz-work=\"KR5c0047\"]')"):
        ev(c, "document.querySelector('[data-dz-bu=\"洞神部\"]').click()"); time.sleep(0.6)
    ev(c, "document.querySelector('[data-dz-work=\"KR5c0047\"]').click()")
    ok = wait_for(c, "!document.getElementById('jing-reader').hidden && document.querySelectorAll('#jing-content .jing-para').length>0")
    report("B1 西昇經 KR5c0047 打开", ok)
    if ok:
        time.sleep(0.8)
        chk = ev(c, """(function(){var e=window.JINGWEN&&JINGWEN['KR5c0047'];
          var txt=document.getElementById('jing-content').textContent||'';
          return {punctMode: e?!!e.punctMode:null, hasPeriod: txt.indexOf('。')>=0, len: txt.length};})()""")
        report("B2 西昇經 默认标点版渲染", chk.get("punctMode") is True and chk.get("hasPeriod") is True and chk.get("len", 0) > 500, json.dumps(chk))
    errs = ev(c, "window.__errs || []")
    report("Z 零 JS 异常", len(errs) == 0, errs[:3])
finally:
    try: proc.terminate()
    except Exception: pass

bad = [n for n, ok in results if not ok]
print("== %d/%d PASS ==" % (len(results) - len(bad), len(results)))
sys.exit(1 if bad else 0)
