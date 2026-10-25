#!/usr/bin/env python3
"""定本重建·总包最终核查（《漫步中国星空》增订版，全 31 区）。

断言终值：条目 289／格 283／传统 1464／歌诀 361；新立三师、太阳守；
改名 13 处＋裁定项全落地；十二国 scatter、羽林军小簇群、五帝座放射等
图式在区页总览图与详情简图同源呈现；文库新本（紫微 52／天市 23／轸补末二句／女并句）；
平面星图、今夜可见回归；关于鸣谢；无 JS 异常。
截图存 dingben-final-shots/（390×844）。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/dingben-final-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:260]) if not ok and extra != "" else ""))

chrome = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                           "--allow-file-access-from-files",
                           "--remote-debugging-port=%d" % PORT, "about:blank"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    ws_url = None
    for _ in range(40):
        try:
            targets = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=3))
            pages = [t for t in targets if t.get("type") == "page"]
            if pages: ws_url = pages[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    assert ws_url, "chrome CDP 未就绪"
    cdp = base.CDP(base.ws_connect(ws_url))
    cdp.call("Page.enable"); cdp.call("Runtime.enable")
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source":
        "window.__errs=[]; addEventListener('error', e=>window.__errs.push(String(e.message||e.error)));"
        " addEventListener('unhandledrejection', e=>window.__errs.push('rej:'+String(e.reason)));"})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)

    ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 0.5)
    for _ in range(40):
        if ev("!!document.querySelector('#sx-home .sx-yuan-name')"): break
        time.sleep(0.5)

    # ① 首页计数终值＋31 区 chip 全表
    r = ev("""(() => { const h = document.getElementById('sx-home');
      const chips = {}; document.querySelectorAll('#sx-home .sx-chip').forEach(c => {
        const i = c.querySelector('i'); chips[c.textContent.replace(i.textContent,'')] = i ? i.textContent : ''; });
      return { sub: (h.querySelector('.sx-sub')||{}).textContent || '', chips }; })()""")
    report("首页副题：283 星官＋传统星数 1464 星", "283 星官" in r["sub"] and "传统星数 1464 星" in r["sub"], r["sub"])
    want = {"角": "11", "亢": "7", "氐": "11", "房": "7", "心": "2", "尾": "5", "箕": "3",
            "斗": "10", "牛": "11", "女": "8", "虚": "10", "危": "10", "室": "10", "壁": "6",
            "奎": "9", "娄": "6", "胃": "7", "昴": "9", "毕": "14", "觜": "3", "参": "6",
            "井": "19", "鬼": "7", "柳": "2", "星": "5", "张": "2", "翼": "2", "轸": "5"}
    got = {k: r["chips"].get(k) for k in want}
    report("28 宿 chip 并格计数全表（三垣走区页副题另验）", got == want, {k: (got[k], want[k]) for k in want if got[k] != want[k]})
    shot("01-home")

    def region(sec, wait=1.0):
        ev("window.Stars.openRegion(%s); true" % json.dumps(sec), wait)

    def region_probe():
        return ev("""(() => { const root = document.getElementById('sx-region');
          const sub = (root.querySelector('.sx-sub')||{}).textContent || '';
          const rows = Array.from(root.querySelectorAll('.sx-row')).map(x => ({
            name: (x.querySelector('.sx-row-name')||{}).textContent || '',
            cls: x.className, sub: (x.querySelector('.sx-row-subtag')||{}).textContent || '',
            n: (x.querySelector('.sx-row-n')||{}).textContent || '', badge: x.textContent }));
          const groups = {}; document.querySelectorAll('#sx-region svg.sx-rmap g.sx-rmap-g').forEach(g => {
            const k = g.getAttribute('data-sx-detail');
            groups[k] = { lines: g.querySelectorAll('line.sx-plot-line,line.sx-plot-dash').length,
                          polys: g.querySelectorAll('polyline').length,
                          circles: g.querySelectorAll('circle.sx-star').length }; });
          return { sub, rows, groups }; })()""")

    def back():
        ev("document.getElementById('star-region-back').click(); true", 0.7)

    # ② 紫微垣区页：新官＋并格（行列表默认折叠后 26 官，先展开）
    region("紫微垣")
    ev("""(() => { const b = Array.from(document.querySelectorAll('#sx-region *')).find(x => x.children.length === 0 && /余下 \\d+ 官/.test(x.textContent || ''));
      if (b) b.click(); return !!b; })()""", 1.0)
    r = region_probe()
    names = [x["name"] for x in r["rows"]]
    report("紫微垣副题 37 星官", "37 星官" in r["sub"], r["sub"])
    report("三师、太阳守行在位", "三师" in names and "太阳守" in names, names)
    gang = [x for x in r["rows"] if x["name"] == "杠"]
    fu = [x for x in r["rows"] if x["name"] == "辅"]
    report("杠附华盖格、辅附北斗格呈现",
           gang and "附华盖格" in gang[0]["sub"] and fu and "附北斗格" in fu[0]["sub"], {"杠": gang, "辅": fu})
    shot("02-region-ziwei")
    back()

    # ③ 女宿区页：十二国 scatter
    region("女宿")
    r = region_probe()
    g = r["groups"].get("女宿|十二国", {})
    report("区页总览图：十二国 0 线 16 点（散点）", g.get("lines") == 0 and g.get("polys") == 0 and g.get("circles") == 16, g)
    shot("03-region-nv")
    back()

    # ④ 室宿区页：羽林军小簇群＋离宫附格
    region("室宿")
    r = region_probe()
    g = r["groups"].get("室宿|羽林军", {})
    report("区页总览图：羽林军 24 边小簇群（非单长链）", g.get("lines") == 24, g)
    lg = [x for x in r["rows"] if x["name"] == "离宫"]
    report("离宫行附室格呈现", lg and "附室格" in lg[0]["sub"], lg)
    shot("04-region-shi")
    back()

    # ⑤ 危宿区页：臼附杵格＋人星改名
    region("危宿")
    r = region_probe()
    names = [x["name"] for x in r["rows"]]
    jiu = [x for x in r["rows"] if x["name"] == "臼"]
    report("危宿：人星在位、臼附杵格", "人星" in names and jiu and "附杵格" in jiu[0]["sub"], {"names": names, "臼": jiu})
    back()

    # ⑥ 毕宿区页：柱改名
    region("毕宿")
    r = region_probe()
    names = [x["name"] for x in r["rows"]]
    report("毕宿：柱行在位（三柱已改名）", "柱" in names and "三柱" not in names, names)
    back()

    def detail(key, wait=1.0):
        ev("window.Stars.openDetail(%s); true" % json.dumps(key), wait)
        return ev("""(() => { const v = document.getElementById('view-star-detail');
          const svg = v.querySelector('svg.sx-plot');
          return { vis: !!v && !v.hidden,
            lines: svg ? svg.querySelectorAll('line.sx-plot-line').length : -1,
            pts: svg ? svg.querySelectorAll('circle.sx-star:not(.ghost)').length : -1 }; })()""")

    # ⑦ 详情简图同源：十二国 0 线 16 点／羽林军 24 边
    r = detail("女宿|十二国")
    report("十二国详情：0 线 16 点", r["vis"] and r["lines"] == 0 and r["pts"] == 16, r)
    ev("document.getElementById('star-detail-back').click(); true", 0.7)
    r = detail("室宿|羽林军")
    report("羽林军详情：24 边小簇群", r["vis"] and r["lines"] == 24, r)
    shot("05-detail-yulinjun")
    ev("document.getElementById('star-detail-back').click(); true", 0.7)

    # ⑧ 文库新本
    ev("window.Stars.openButiange(%s); true" % json.dumps("紫微垣"), 1.0)
    r = ev("document.getElementById('view-butiange').textContent")
    report("文库紫微垣：三师句＋辅星句在北斗句前",
           "文昌之下曰三师" in r and "文昌之下曰三公" not in r and "上宰少尉两相对" in r
           and r.index("辅星近着开阳淡") < r.index("北斗之宿七星明"), "")
    shot("06-butiange-ziwei")
    ev("window.Stars.openButiange(%s); true" % json.dumps("天市垣"), 1.0)
    r = ev("document.getElementById('view-butiange').textContent")
    report("文库天市垣：书外 8 句已删、通论四句在位",
           "河中河间晋郑周" not in r and "请君熟记有何难" not in r and "以此次第有五行吟" in r, "")
    ev("window.Stars.openButiange(%s); true" % json.dumps("轸宿"), 1.0)
    r = ev("document.getElementById('view-butiange').textContent")
    report("文库轸宿：末二句已补", "已上便为太微宫" in r and "黄道向上看取是" in r, "")
    ev("window.Stars.openButiange(%s); true" % json.dumps("女宿"), 1.0)
    r = ev("document.getElementById('view-butiange').textContent")
    report("文库女宿：败瓜瓠瓜并句新文", "败瓜珠上瓠瓜明" in r and "败瓜之上瓠瓜生" not in r, "")
    ev("document.getElementById('butiange-back').click(); true", 0.7)

    # ⑨ 数据层终值断言（星图/AR 同源路径）
    r = ev("""(async () => { const d = await window.WuriSky.starData();
      const bt = await window.WuriSky.loadJSON('data/butiange.json');
      const find = k => d.xg.asterisms.find(a => a.section+'|'+a.name === k);
      const LM = {}; (d.lines.asterisms||[]).forEach(e => LM[e.section+'|'+e.name] = e);
      return { trad: d.xg.counts.tradition_star_sum, total: d.xg.counts.asterisms,
        sanshi: find('紫微垣|三师') && [find('紫微垣|三师').star_count_tradition, find('紫微垣|三师').stars.length],
        taiyang: find('紫微垣|太阳守') && [find('紫微垣|太阳守').star_count_tradition, find('紫微垣|太阳守').stars.length],
        tianji: !!find('鬼宿|天纪'), tianjiOld: !!find('鬼宿|天记'),
        names: ['角宿|平星','斗宿|建星','危宿|人星','昴宿|刍藁','毕宿|柱','参宿|屏星','井宿|狼星','鬼宿|积尸气',
                '紫微垣|天一','紫微垣|太一','紫微垣|相','天市垣|宗星'].map(k => !!find(k)),
        shier: LM['女宿|十二国'].status, yulinEdges: LM['室宿|羽林军'].edges.length,
        wudi: [LM['太微垣|五帝座'].status, LM['太微垣|五帝座'].edges.length],
        btTotal: bt.total_lines,
        btSec: Object.fromEntries(bt.sections.map(s => [s.section, s.line_count])) }; })()""", 0.3)
    report("数据层终值：trad 1464／条目 289／歌诀 361",
           r["trad"] == 1464 and r["total"] == 289 and r["btTotal"] == 361, r)
    report("三师（3 星 0 定）／太阳守（1 星 0 定）立条", r["sanshi"] == [3, 0] and r["taiyang"] == [1, 0], r)
    report("鬼宿天纪改回（天记无残留）", r["tianji"] and not r["tianjiOld"], r)
    report("改名 12 处抽查全在位", all(r["names"]), r["names"])
    report("十二国 scatter／羽林军 24 边／五帝座 lined 4 边",
           r["shier"] == "scatter" and r["yulinEdges"] == 24 and r["wudi"] == ["lined", 4], r)
    report("文库分区句数：紫微 52／太微 24／天市 23／女 19／轸 10／奎 10",
           r["btSec"].get("紫微垣") == 52 and r["btSec"].get("太微垣") == 24 and r["btSec"].get("天市垣") == 23
           and r["btSec"].get("女宿") == 19 and r["btSec"].get("轸宿") == 10 and r["btSec"].get("奎宿") == 10, r["btSec"])

    # ⑩ 平面星图＋今夜可见回归
    ev("window.WuriSkyChart.openChart(); true", 1.5)
    r = ev("""(() => { const el = document.getElementById('sx-chart'); const v = document.getElementById('view-sky-chart');
      return { vis: !!v && !v.hidden, circles: el ? el.querySelectorAll('circle').length : 0,
               txt: el ? el.textContent : '' }; })()""")
    report("平面星图渲染（新数据）", r["vis"] and r["circles"] > 50 and "加载失败" not in r["txt"], {"circles": r["circles"]})
    shot("07-chart")
    ev("document.getElementById('sky-chart-back').click(); true", 0.7)
    ev("window.WuriSkyChart.openTonight(); true", 1.2)
    r = ev("""(() => { const el = document.getElementById('sx-tonight'); const v = document.getElementById('view-sky-tonight');
      return { vis: !!v && !v.hidden, txt: el ? el.textContent : '' }; })()""")
    report("今夜可见打开无失败文案", r["vis"] and "加载失败" not in r["txt"] and len(r["txt"]) > 30, r["txt"][:120])
    ev("document.getElementById('sky-tonight-back').click(); true", 0.7)

    # ⑪ 关于页鸣谢
    ev("document.querySelector('[data-tab=\"tab-me\"]').click(); true", 0.8)
    r = ev("""(() => { const hints = Array.from(document.querySelectorAll('#tab-me .hint, .hint')).map(x => x.textContent);
      return hints.filter(x => x.includes('漫步中国星空')); })()""")
    report("关于页定本鸣谢在位（含占位标记）", len(r) == 1 and "灵台秘苑" in r[0] and "待补" in r[0], r)

    # ⑫ JS 异常
    errs = ev("window.__errs || []")
    report("无 JS 异常", len(errs) == 0, errs[:5])
finally:
    chrome.terminate()

n_ok = sum(1 for _, ok in results if ok)
print("== smoke-dingben-final: %d/%d ==" % (n_ok, len(results)))
sys.exit(0 if n_ok == len(results) else 1)
