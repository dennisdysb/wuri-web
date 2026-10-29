#!/usr/bin/env python3
# 专项冒烟（2026-10-29）：经文正文简繁跟随语言设置。
# 口径：简体模式一律 t2s；繁体模式按底本分流——繁体底本（s23/KR）直出原字、
# 简体底本（s01/s02/s11 等 18 部）走 s2t 显示层转换。数据层/注音/锚点不动。
# 查：注音对齐（ruby 基字串 == 转换后正文）、切语言即时重渲不丢位、两态划线
# 偏移一致、背诵整句转换、目录/每日一经/标记引文跟随、三态＋360 无横溢。
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
WWW = os.path.expanduser("~/workspace/.wt/t2s-display/www")
PASS, FAIL = [], []
def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("PASS " if cond else "FAIL ") + label)

class Sess:
    def __init__(self, vw=360, vh=740):
        port = base.free_port(); prof = "/tmp/chrome-t2s-%d" % port
        env = dict(os.environ); env["TZ"] = "America/Toronto"
        self.proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
            "--allow-file-access-from-files",
            "--hatch-webgl-allowed-domains-file=" + _WG, "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
            "--remote-debugging-port=%d" % port,
            "--user-data-dir=" + prof, "--window-size=500,1000",
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
        seed = r"""
window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});
try{ localStorage.setItem('wuri_pro_redeem','1'); }catch(e){}
"""
        self.c.call("Page.addScriptToEvaluateOnNewDocument", {"source": seed})
        self.c.call("Emulation.setDeviceMetricsOverride", {"width": vw, "height": vh, "deviceScaleFactor": 2, "mobile": True})
        self.c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    def ev(self, expr):
        r = self.c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True}, timeout=60)
        if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:400])
        return r["result"].get("value")
    def waitfor(self, x, t=60):
        t0 = time.time()
        while time.time() - t0 < t:
            try:
                if self.ev(x): return True
            except Exception: pass
            time.sleep(0.4)
        return False
    def close(self):
        try: self.proc.terminate()
        except Exception: pass

def set_lang(s, lang):
    s.ev("(function(){ if (typeof setLangPref === 'function') setLangPref(%s); })()" % json.dumps(lang))
    time.sleep(0.9)

STRIP_RT = """function stripRt(el){ var c=el.cloneNode(true); c.querySelectorAll('rt').forEach(function(x){x.remove();}); return c.textContent; }"""

s = Sess()
try:
    ok(s.waitfor("!!document.querySelector('[data-tab=\"tab-jing\"]')"), "S0 应用就绪")
    s.ev("document.querySelector('[data-tab=\"tab-jing\"]').click()")
    ok(s.waitfor("!!document.querySelector('.jing-item[data-jing=\"s02\"]')"), "S0b 经文架就绪")

    # ---------- 单元级：转换器（不依赖书籍载入） ----------
    u = s.ev("""(function(){
      var r = {};
      r.s2tType = typeof window.s2t;
      r.spots = [window.s2t('斗姥宝诰'), window.s2t('干支'), window.s2t('头发'), window.s2t('干净'),
        window.s2t('余语汝'), window.s2t('数千里'), window.s2t('咸得光鲜'), window.s2t('旋斗历箕'),
        window.s2t('谷神不死'), window.s2t('后土'), window.s2t('三台星君')];
      r.basePre = { s40: window.wuriBookSimpBase('s40'), kr: window.wuriBookSimpBase('KR5a0220') };
      return r; })()""")
    ok(u["s2tType"] == "function", "U1 s2t 已加载")
    exp = ['斗姥寶誥','干支','頭髮','乾淨','余語汝','數千里','咸得光鮮','旋斗歷箕','谷神不死','后土','三台星君']
    ok(u["spots"] == exp, "U2 高危词组抽核全对 %s" % (u["spots"] == exp or u["spots"]))
    ok(u["basePre"] == {"s40": False, "kr": False}, "U3a KR 来源未载入先判繁体底本 %s" % u["basePre"])

    # 逐本开卷触发载入后，再判底本/等长/锚点偏移
    for bid in ['s01', 's02', 's11', 's23', 's18']:
        s.ev("window.JingOpenReader(%s)" % json.dumps(bid))
        ok(s.waitfor("window._jingCurrentId===%s" % json.dumps(bid), 30), "U-open %s 开卷" % bid)
    u2 = s.ev("""(function(){
      var r = {};
      r.base = { s01: window.wuriBookSimpBase('s01'), s02: window.wuriBookSimpBase('s02'),
        s11: window.wuriBookSimpBase('s11'), s23: window.wuriBookSimpBase('s23'),
        s18: window.wuriBookSimpBase('s18') };
      var bad = 0, n = 0;
      ['s02','s11','s23','s18'].forEach(function(id){
        var d = window.JINGWEN[id]; if(!d) return;
        d.sections.forEach(function(sec){ (sec.paras||[]).forEach(function(p){
          var t = typeof p === 'string' ? p : (p.t||''); if(!t) return; n++;
          if (window.t2s(t).length !== t.length) bad++;
          if (window.s2t(t).length !== t.length) bad++;
        });});
      });
      r.lenAudit = { n: n, bad: bad };
      var off = [], d11 = window.JINGWEN['s11'];
      if (d11) { outer: for (var si=0; si<d11.sections.length; si++) {
        var ps = d11.sections[si].paras||[];
        for (var pi=0; pi<ps.length; pi++) {
          var t = typeof ps[pi]==='string'?ps[pi]:(ps[pi].t||'');
          ['余语','为','鲲'].forEach(function(kw){
            var i0=t.indexOf(kw); if(i0<0) return;
            off.push({kw:kw, raw:i0, simp:window.t2s(t).indexOf(window.t2s(kw)), trad:window.s2t(t).indexOf(window.s2t(kw))});
          });
          if (off.length>=3) break outer;
        }
      } }
      r.offsets = off;
      return r; })()""")
    ok(u2["base"] == {"s01": True, "s02": True, "s11": True, "s23": False, "s18": False},
       "U3 底本判定（简：s01/s02/s11；繁：s23/s18）%s" % u2["base"])
    ok(u2["lenAudit"]["bad"] == 0 and u2["lenAudit"]["n"] > 500, "U4 等长审计 %s" % u2["lenAudit"])
    ok(len(u2["offsets"]) >= 3 and all(o["raw"] == o["simp"] == o["trad"] for o in u2["offsets"]),
       "U5 划线锚点三态偏移一致 %s" % u2["offsets"])

    # ---------- 繁体模式 ----------
    set_lang(s, 'zh-TW')
    ok(s.waitfor("window.curLang && curLang()==='zh-TW'"), "T0 切繁体生效")
    cat = s.ev("""(function(){ var el=document.querySelector('.jing-item[data-jing="s02"] .jing-title');
      var el1=document.querySelector('.jing-item[data-jing="s01"] .jing-title'); var tp=window.txPoem;
      return { s02: el?el.textContent:'', s01: el1?el1.textContent:'',
        poemSimpBase: tp('全真早晚功课经'), poemTradBase: tp('靈寶無量度人上品妙經') }; })()""")
    ok("功課經" in cat["s02"], "T1 目录 s02 书名繁体 %s" % cat["s02"])
    ok("功課經" in cat["s01"], "T1b 目录 s01 书名繁体 %s" % cat["s01"])
    ok(cat["poemSimpBase"] == "全真早晚功課經" and cat["poemTradBase"] == "靈寶無量度人上品妙經",
       "T1c txPoem 片段分流（简底本转/繁底本直出）")

    s.ev("window.JingOpenReader('s02')")
    ok(s.waitfor("window._jingCurrentId==='s02' && document.querySelectorAll('#jing-content .jing-para').length>0", 30), "T2 s02 开卷")
    rd = s.ev("""(function(){
      var title=document.getElementById('jing-title').textContent;
      var h=document.querySelector('#jing-content .jing-sec-h, #jing-content h3, #jing-content .dz-sec-h');
      var note=document.getElementById('jing-srcnote');
      var para=document.querySelector('#jing-content .jing-para');
      return { title:title, head: h?h.textContent:'', note: note?note.textContent:'',
        para0: para?para.textContent.slice(0,60):'' }; })()""")
    ok("功課經" in rd["title"], "T2b 读题繁体 %s" % rd["title"])
    ok("香讚" in rd["head"] or "香讚" in rd["para0"] or "讚" in rd["para0"], "T2c 正文/节题繁体（讚）head=%s para=%s" % (rd["head"][:20], rd["para0"][:30]))
    # s02 书头本无 note 字段（精选书头无底本框为 v352 既定口径）：注记分支无挂载点、
    # 只断言不回归（srcnote 保持隐藏）＋转换判定在位（U3 已验 bookSimpBase）
    ok(s.ev("document.getElementById('jing-srcnote').hidden") is True,
       "T2d s02 无 note 书头不回归（srcnote 隐藏，与改前一致）")

    # 注音对齐：前 3 个带 ruby 的段，基字串须逐字等于转换后正文
    al = s.ev("""(function(){
      var out=[]; var paras=document.querySelectorAll('#jing-content .jing-para');
      for (var i=0;i<paras.length && out.length<3;i++){
        var el=paras[i]; if(!el.querySelector('ruby')) continue;
        var si=+el.getAttribute('data-sec'), pi=+el.getAttribute('data-para');
        var raw=window.JINGWEN['s02'].sections[si].paras[pi]; var t=typeof raw==='string'?raw:(raw.t||'');
        var vis=''; el.childNodes.forEach(function(n){
          if(n.nodeType===3) vis+=n.textContent;
          else if(n.tagName==='RUBY'){ var b=''; n.childNodes.forEach(function(c){ if(c.tagName!=='RT') b+=c.textContent; }); vis+=b; }
          else if(n.tagName!=='RT') vis+=n.textContent; });
        out.push({ eq: vis===window.wuriTxFor(t,'s02'), visLen: vis.length, rawLen: t.length });
      } return out; })()""")
    ok(len(al) == 3 and all(x["eq"] for x in al), "T3 注音 ruby 基字与转换后正文逐字对齐 %s" % al)

    # 繁体底本书直出原字
    s.ev("window.JingOpenReader('s23')")
    ok(s.waitfor("window._jingCurrentId==='s23' && document.querySelectorAll('#jing-content .jing-para').length>0", 30), "T4 s23 开卷")
    idn = s.ev("""(function(){
      %s
      var el=document.querySelector('#jing-content .jing-para'); if(!el) return null;
      var si=+el.getAttribute('data-sec'), pi=+el.getAttribute('data-para');
      var raw=window.JINGWEN['s23'].sections[si].paras[pi]; var t=typeof raw==='string'?raw:(raw.t||'');
      var vis=stripRt(el);
      return { eq: vis===t, head: vis.slice(0,20), raw: t.slice(0,20) }; })()""" % STRIP_RT)
    ok(idn and idn["eq"], "T4b 繁体底本 s23 正文直出原字 %s" % (idn and idn["head"]))

    # ---------- 读中切语言：即时重渲不丢位 ----------
    s.ev("window.JingOpenReader('s02')")
    ok(s.waitfor("window._jingCurrentId==='s02' && document.querySelectorAll('#jing-content .jing-para').length>0", 30), "T5 回到 s02")
    s.ev("window.scrollTo(0, 2600)")
    time.sleep(0.6)
    before = s.ev("""(function(){ %s var els=document.querySelectorAll('#jing-content .jing-para'); var vis=null, key=null;
      for(var i=0;i<els.length;i++){ var r=els[i].getBoundingClientRect(); if(r.bottom>80){ vis=stripRt(els[i]); key=els[i].getAttribute('data-sec')+'/'+els[i].getAttribute('data-para'); break; } }
      return { y: window.scrollY, vis: vis, key: key }; })()""" % STRIP_RT)
    set_lang(s, 'zh-CN')
    after = s.ev("""(function(){ %s var els=document.querySelectorAll('#jing-content .jing-para'); var vis=null, key=null, exp=null;
      for(var i=0;i<els.length;i++){ var r=els[i].getBoundingClientRect(); if(r.bottom>80){ vis=stripRt(els[i]);
        key=els[i].getAttribute('data-sec')+'/'+els[i].getAttribute('data-para');
        var raw=window.JINGWEN['s02'].sections[+els[i].getAttribute('data-sec')].paras[+els[i].getAttribute('data-para')];
        exp=window.t2s(typeof raw==='string'?raw:(raw.t||'')); break; } }
      return { y: window.scrollY, vis: vis, key: key, exp: exp, title: document.getElementById('jing-title').textContent,
        open: window._jingCurrentId==='s02' && !document.getElementById('jing-reader').hidden }; })()""" % STRIP_RT)
    ok(after["open"] and "功课经" in after["title"], "T5b 切简体后仍在 s02、题转简 %s" % after["title"])
    _bk = (before["key"] or "0/0").split("/"); _ak = (after["key"] or "0/0").split("/")
    ok(_bk[0] == _ak[0] and abs(int(_ak[1]) - int(_bk[1])) <= 2 and after["vis"] == after["exp"],
       "T5c 可见段同节±2段内（%s→%s，锚点=滚动位+展开集、版高随字形微变）且简体渲染==t2s(原文)" % (before["key"], after["key"]))
    ok(abs(after["y"] - before["y"]) <= 400, "T5d 滚动位置基本不丢 before=%s after=%s" % (before["y"], after["y"]))

    # ---------- 背诵整句转换（繁体） ----------
    set_lang(s, 'zh-TW')
    s.ev("window.JingOpenReader('s11')")
    ok(s.waitfor("window._jingCurrentId==='s11' && document.querySelectorAll('#jing-content .jing-para').length>0", 30), "T6 s11 开卷")
    s.ev("document.getElementById('jing-recite').click()")
    time.sleep(0.8)
    rec = s.ev("""(function(){ %s var sens=document.querySelectorAll('#jing-content .recite-sen'); var hit=null, n=sens.length;
      sens.forEach(function(x){ var tx=stripRt(x); if(!hit && tx.indexOf('余')>=0 && tx.indexOf('汝')>=0) hit=tx; });
      return { n:n, hit:hit }; })()""" % STRIP_RT)
    ok(rec["n"] > 50 and rec["hit"] and "余語汝" in rec["hit"], "T6b 背诵整句转换（余語汝）%s" % (rec["hit"] and rec["hit"][:26]))

    # ---------- 我的标记：种子高亮引文跟随 ----------
    s.ev("""(function(){ var arr=[{id:'hl_smoke1', sid:'s02', sec:0, para:0, start:0, end:8,
      text:'灵宝天尊，安慰身形', color:'yellow', ts: Date.now()}];
      localStorage.setItem('wuri_jing_highlights', JSON.stringify(arr)); })()""")
    s.ev("window.__wuriOpenMarks && window.__wuriOpenMarks('lines')")
    time.sleep(1.0)
    mk = s.ev("""(function(){ var el=document.querySelector('.hl-text'); return el?el.textContent:''; })()""")
    ok("靈寶天尊" in mk, "T7 标记引文繁体跟随 %s" % mk[:20])

    # ---------- 目录搜索：繁体词命中简体底本书名 ----------
    s.ev("(function(){ var b=document.querySelector('#jing-marks .jing-back, #jing-back-fab'); if(b) b.click(); })()")
    time.sleep(0.6)
    s.ev("""(function(){ var q=document.getElementById('jing-q'); if(q){ q.value='功課'; q.dispatchEvent(new Event('input',{bubbles:true})); } })()""")
    time.sleep(2.2)
    sr = s.ev("""(function(){ var box=document.getElementById('jing-results'); return box?box.textContent.slice(0,120):''; })()""")
    ok("功課經" in sr or "功课经" in sr, "T8 繁体查询命中 s02 %s" % sr[:40])

    # ---------- 三态 + 360 ----------
    for label, setup in [
        ("夜间", "document.documentElement.setAttribute('data-theme','night')"),
        ("红光", "(window.WuriRedlight&&WuriRedlight.set)?WuriRedlight.set(true):document.body.classList.add('sky-red')"),
    ]:
        s.ev(setup); time.sleep(0.3)
        s.ev("window.JingOpenReader('s02')")
        s.waitfor("window._jingCurrentId==='s02' && document.querySelectorAll('#jing-content .jing-para').length>0", 30)
        v = s.ev("""(function(){ %s var p=document.querySelector('#jing-content .jing-para');
          return { sw: document.documentElement.scrollWidth, t: p?stripRt(p).slice(0,16):'',
            title: document.getElementById('jing-title').textContent }; })()""" % STRIP_RT)
        ok(v["sw"] <= 360 and "功課經" in v["title"] and ("讚" in v["t"] or "靈" in v["t"] or "麼" in v["t"]),
           "T9 三态-%s 繁体正文+无横溢 sw=%s %s" % (label, v["sw"], v["t"][:16]))
    errs = s.ev("window.__errs || []")
    ok(not errs, "T10 无 JS 异常 %s" % (errs[:2] if errs else ""))
finally:
    s.close()
print("\n==== %d PASS / %d FAIL ====" % (len(PASS), len(FAIL)))
if FAIL:
    print("FAIL:", FAIL); sys.exit(1)
