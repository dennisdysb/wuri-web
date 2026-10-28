#!/usr/bin/env python3
# 专项冒烟（道藏目录行排版定版 2026-10-28）：取消右侧固定元信息列，经名占满整行；
# 眷属小字（类签/卷·字数/读进度）：经名单行→独占第二行（.dz-meta-block），
# 经名断行（≥2 行）→行内接经名末行尾顺排（Range 量测行数切换，fonts/resize 复测）。
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/.wt/dzrowflow/www")
OUT = os.path.expanduser("~/workspace/.wt/dzrowflow/dzrowflow-shots"); os.makedirs(OUT, exist_ok=True)
results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else " :: " + str(extra)[:400]))

def launch(width):
    port = base.free_port(); prof = f"/tmp/chrome-dzr-{port}-{width}"
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                             "--allow-file-access-from-files",
                             "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
                             "--window-size=500,1000", "about:blank"],
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
    c.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": 915, "deviceScaleFactor": 1, "mobile": True})
    c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    time.sleep(3.5)
    return proc, c

def ev(c, expr):
    r = c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:300])
    return r["result"].get("value")

def click_wait(c, sel, tries=24):
    for _ in range(tries):
        ok = ev(c, "(function(){var e=document.querySelector(%s); if(!e) return false; e.click(); return true;})()" % json.dumps(sel))
        if ok: return True
        time.sleep(0.5)
    raise RuntimeError("selector never appeared: " + sel)

def shot(c, name):
    r = c.call("Page.captureScreenshot", {"format": "png"})
    open(os.path.join(OUT, name), "wb").write(base64.b64decode(r["data"]))

def open_app(width):
    last = None
    for _ in range(3):
        proc, c = launch(width)
        try:
            ev(c, "1+1")
            return proc, c
        except Exception as e:
            last = e
            try: proc.terminate()
            except Exception: pass
            time.sleep(1.5)
    raise last

def click1(c, sel):
    return ev(c, "(function(){var e=document.querySelector(%s); if(!e) return false; e.click(); return true;})()" % json.dumps(sel))

def goto_jing(c):
    for _ in range(6):
        click1(c, '[data-tab="tab-jing"]'); time.sleep(1.5)
        if ev(c, "(function(){var t=document.getElementById('tab-jing'); return t? !t.hidden : null;})()"):
            return True
    return False

def open_dz(c):
    for _ in range(6):
        if ev(c, "(function(){var b=document.querySelector('[data-dz-body]'); return b? !b.hidden : null;})()"):
            return True
        click1(c, '[data-dz-toggle]'); time.sleep(1.5)
    return False

def bu_state(c, bu):
    return ev(c, """(function(){ var w=document.querySelector('[data-dz-works="%s"]');
      if(!w) return {ex:false};
      var r=w.querySelector('.dz-work');
      return {ex:true, hidden:w.hidden, h: r?Math.round(r.getBoundingClientRect().height):0}; })()""" % bu)

def open_bu(c, bu):
    """只在 wrap 处于 hidden 时才点（点=切换，多点会把已展开的关掉）；未 hidden 但暂无布局只等。"""
    for _ in range(10):
        st = bu_state(c, bu)
        if st and st.get("h", 0) > 0: return True
        if st and st.get("ex") and st.get("hidden"):
            click1(c, '[data-dz-bu="%s"]' % bu)
        elif not (st and st.get("ex")):
            click_wait(c, '[data-dz-bu="%s"]' % bu, tries=4)
        time.sleep(1.2)
    st = bu_state(c, bu)
    return bool(st and st.get("h", 0) > 0)

MEASURE = """(function(bu, mode, arg){
  function linesOf(el){ var rg=document.createRange(); rg.selectNodeContents(el); var rs=rg.getClientRects(), tops=[];
    for(var i=0;i<rs.length;i++){ var t=rs[i].top, seen=false;
      for(var j=0;j<tops.length;j++) if(Math.abs(tops[j]-t)<3){seen=true;break;}
      if(!seen) tops.push(t); }
    return {n: tops.length||1, firstTop: rs.length?rs[0].top:0, lastTop: rs.length?rs[rs.length-1].top:0,
            firstRight: rs.length?rs[0].right:0, left: rs.length?rs[0].left:0}; }
  function meas(row){ if(!row) return null;
    var wt=row.querySelector('.dz-wt'), meta=row.querySelector('.dz-wmeta'), wm=row.querySelector('.dz-wm');
    var wx=row.querySelector('.dz-wtext');
    var L=linesOf(wt); var mr=meta.getClientRects(); var rr=row.getBoundingClientRect(); var wr=wx.getBoundingClientRect();
    var prog=row.querySelector('.read-prog');
    return {title: wt.textContent, lines: L.n, block: row.classList.contains('dz-meta-block'),
      metaDisplay: getComputedStyle(meta).display,
      metaTop: mr.length?Math.round(mr[0].top):null, metaLeft: mr.length?Math.round(mr[0].left):null,
      titleFirstTop: Math.round(L.firstTop), titleLastTop: Math.round(L.lastTop),
      titleLeft: Math.round(L.left), titleFirstRight: Math.round(L.firstRight),
      rowRight: Math.round(rr.right), rowW: Math.round(rr.width),
      wtextW: Math.round(wr.width), wtextRightGap: Math.round(rr.right - wr.right),
      wmText: wm?wm.textContent:null, progInMeta: !!(prog && meta.contains(prog)), progText: prog?prog.textContent:null};
  }
  var rows=[].slice.call(document.querySelectorAll('[data-dz-works="' + bu + '"] .dz-work'));
  var byTitle=function(t){ return rows.filter(function(r){return r.querySelector('.dz-wt').textContent===t;})[0]; };
  var byId=function(id){ return rows.filter(function(r){return r.getAttribute('data-dz-work')===id;})[0]; };
  if(mode==='byTitle') return meas(byTitle(arg));
  if(mode==='byId') return meas(byId(arg));
  var oneLine=null, multiLine=null;
  rows.forEach(function(r){ var m=meas(r); if(!m) return;
    if(m.lines===1 && !oneLine) oneLine=m; if(m.lines>=2 && !multiLine) multiLine=m; });
  return {oneLine: oneLine, multiLine: multiLine, nRows: rows.length,
          durian: meas(byTitle('灵宝无量度人上品妙经')), dadong: meas(byTitle('大洞玉经'))};
})"""

for width in (412, 390):
    proc, c = open_app(width)
    try:
        report(f"{width} 切到经文视图", goto_jing(c))
        report(f"{width} 展开道藏全集", open_dz(c))
        ok = open_bu(c, "洞真部")
        if not ok:
            diag = ev(c, """(function(){ var w=document.querySelector('[data-dz-works="洞真部"]');
              var row=w?w.querySelector('.dz-work'):null; var chain=[]; var e=row;
              while(e && chain.length<12){ chain.push(e.tagName+'.'+(typeof e.className==='string'?e.className:'')+' hidden='+e.hidden+' disp='+getComputedStyle(e).display); e=e.parentElement; }
              var tj=document.getElementById('tab-jing');
              return {wrapHidden: w?w.hidden:null, nRows: w?w.querySelectorAll('.dz-work').length:0,
                      tabJingHidden: tj?tj.hidden:null, chain: chain}; })()""")
            print("DIAG", width, json.dumps(diag, ensure_ascii=False))
        report(f"{width} 洞真部展开有布局", ok)
        # 给度人经种一个进度（读 0%），验证胶囊落进小字流
        ev(c, """(function(){ var id=null;
          document.querySelectorAll('[data-dz-works="洞真部"] .dz-work').forEach(function(r){
            if(r.querySelector('.dz-wt').textContent==='灵宝无量度人上品妙经') id=r.getAttribute('data-dz-work'); });
          if(id){ var m={}; m[id]={frac:0}; localStorage.setItem('wuri_jing_autopos', JSON.stringify(m));
            window.__wuriDecorateProgress(); }
          return id; })()""")
        time.sleep(0.4)
        m = ev(c, MEASURE + "('洞真部','all')")
        print(width, json.dumps({k: m[k] for k in ("durian", "oneLine", "multiLine", "nRows")}, ensure_ascii=False))
        d = m["durian"]
        report(f"{width} 度人经：进度胶囊在小字流内", d and d["progInMeta"] and d["progText"] == "读 0%", d)
        report(f"{width} 经名容器占满整行（wtext 宽≥行宽 78% 且右界贴行右）",
               d and d["wtextW"] >= d["rowW"] * 0.78 and d["wtextRightGap"] <= 6, d)
        o = m["oneLine"]
        report(f"{width} 单行经名→小字独占第二行", o and o["block"] and o["metaDisplay"] == "block"
               and o["metaTop"] > o["titleFirstTop"] and abs(o["metaLeft"] - o["titleLeft"]) <= 2, o)
        # 长名样本：洞玄部 30 字经名（KR5b0070）
        ok2 = open_bu(c, "洞玄部")
        ml = ev(c, MEASURE + "('洞玄部','byId','KR5b0070')") if ok2 else None
        print(width, "long:", json.dumps(ml, ensure_ascii=False))
        report(f"{width} 长名（30 字）断行→小字接末行尾顺排", ml and ml["lines"] >= 2 and (not ml["block"])
               and ml["metaDisplay"] == "inline" and abs(ml["metaTop"] - ml["titleLastTop"]) <= 4, ml)
        if ok2:
            ev(c, "document.querySelector('[data-dz-work=\"KR5b0070\"]').scrollIntoView({block:'center'})"); time.sleep(0.5)
            shot(c, f"long-{width}.png")
        if width == 412:
            # resize 复测：412→330 变窄，原单行经名（17 字四注本）应断行且小字随之改行内
            ev(c, "document.querySelector('[data-dz-works=\"洞真部\"]').scrollIntoView()")
            before = ev(c, MEASURE + "('洞真部','byTitle','元始无量度人上品妙经四注（附释音）')")
            c.call("Emulation.setDeviceMetricsOverride", {"width": 330, "height": 915, "deviceScaleFactor": 1, "mobile": True})
            time.sleep(0.8)
            after = ev(c, MEASURE + "('洞真部','byTitle','元始无量度人上品妙经四注（附释音）')")
            print("resize:", json.dumps({"before": before, "after": after}, ensure_ascii=False))
            report("resize 复测：变窄断行后小字由第二行改接末行尾",
                   before and after and before["lines"] == 1 and before["block"]
                   and after["lines"] >= 2 and not after["block"] and after["metaDisplay"] == "inline",
                   {"before": before, "after": after})
            c.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 1, "mobile": True})
            time.sleep(0.8)
        ev(c, "document.querySelector('[data-dz-bu=\"洞真部\"]').scrollIntoView({block:'start'})"); time.sleep(0.5)
        shot(c, f"day-{width}.png")
        if width == 412:
            ev(c, "document.documentElement.setAttribute('data-theme','night')"); time.sleep(0.4)
            shot(c, "night-412.png")
            ev(c, "document.body.classList.add('sky-red')"); time.sleep(0.4)
            shot(c, "red-412.png")
    finally:
        proc.terminate()

print("TOTAL", sum(1 for _, ok in results if ok), "/", len(results))
sys.exit(0 if all(ok for _, ok in results) else 1)
