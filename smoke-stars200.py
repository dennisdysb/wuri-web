#!/usr/bin/env python3
"""v2.0.0 中国星象模块专项冒烟（本地 file:// + CDP）。
断言：首页四卡序/星象卡底图、今日星空卡三值与值神行同源、图鉴 102 位、
星官图鉴 287/31 与徽标统计、区页折叠+搜索、详情简图/双表/分歧/合咏注、
互链双向（星官↔星君↔神祇强链）、步天歌分架与逐句跳详情、双主题双宽度零溢出、无 JS 异常。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
# 只借类与连接函数，不跑其 main（main 在 __main__ 下才跑；保险起见拦截）
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/stars200-shots")
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
            if pages:
                ws_url = pages[0]["webSocketDebuggerUrl"]; break
        except Exception:
            pass
        time.sleep(0.5)
    assert ws_url, "chrome CDP 未就绪"
    cdp = base.CDP(base.ws_connect(ws_url))
    cdp.call("Page.enable"); cdp.call("Runtime.enable")
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        import base64
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)

    # ---------- 首页 ----------
    r = ev("""(() => {
      const ids = ['practice-entry-card','shushu-entry-card','deities-entry-card','stars-entry-card'];
      const order = ids.map(id => { const el = document.getElementById(id);
        return el ? [...document.querySelectorAll('.hero2')].indexOf(el) : -1; });
      const card = document.getElementById('stars-entry-card');
      const bg = getComputedStyle(card.querySelector('.h2-bg')).backgroundImage;
      return { order, bgStarmap: bg.includes('starmap.webp'),
               visible: !!(card.offsetParent) }; })()""")
    report("首页四卡顺序 修行<术数<图鉴<星象", r["order"] == sorted(r["order"]) and -1 not in r["order"], r)
    report("星象卡夜间底图 starmap.webp", r["bgStarmap"] and r["visible"], r)

    # ---------- 今日星空卡 ----------
    r = ev("""(() => {
      const zs = (document.getElementById('zhishen-line') || {}).textContent || '';
      const xiu = (document.getElementById('sx-sky-xiu') || {}).textContent || '';
      const zm = zs.match(/日值神\s*(\S)/);
      return { zsXiu: zm ? zm[1] : '', cardXiu: xiu.trim(),
        dipper: (document.getElementById('sx-sky-dipper-big') || {}).textContent || '',
        dipperSub: (document.getElementById('sx-sky-dipper-sub') || {}).textContent || '',
        moonBig: (document.getElementById('sx-sky-moon-big') || {}).textContent || '',
        moonSub: (document.getElementById('sx-sky-moon-sub') || {}).textContent || '',
        compassSvg: !!document.querySelector('#sx-sky-compass svg'),
        moonSvg: !!document.querySelector('#sx-sky-moon svg, #sx-sky-moon canvas'),
        lordImg: (document.getElementById('sx-sky-img') || {}).naturalWidth > 0 }; })()""")
    report("今日卡值日宿与值神行同源（宿字起首）", r["zsXiu"] and r["cardXiu"].startswith(r["zsXiu"]), r)
    report("今日卡斗柄方位+月建支", bool(r["dipper"]) and bool(r["dipperSub"]), r)
    report("今日卡月相名+照亮%+月龄", bool(r["moonBig"]) and "%" in r["moonSub"] and "月龄" in r["moonSub"], r)
    report("今日卡罗盘/月形 SVG 与星君图", r["compassSvg"] and r["moonSvg"] and r["lordImg"], r)
    shot("today-sky-390-day")

    # ---------- 进星官图鉴 ----------
    ev("document.getElementById('stars-entry-card').click(); true", 0.4)
    for _ in range(30):
        if ev("!!document.querySelector('#sx-home .sx-yuan-name')"): break
        time.sleep(0.5)
    r = ev("""(() => { const home = document.getElementById('sx-home');
      const txt = home.textContent;
      return { vis: !document.getElementById('view-stars').hidden,
        has287: txt.includes('287'), has39: (txt.match(/39/g) || []).length,
        yuanCards: home.querySelectorAll('.sx-yuan-card, [data-sx-region]').length,
        chips: home.querySelectorAll('.sx-chips [data-sx-region]').length,
        lordImgOk: [...home.querySelectorAll('img')].every(i => i.naturalWidth > 0),
        overflow: document.documentElement.scrollWidth <= window.innerWidth + 1 }; })()""")
    report("s1 星官图鉴打开+懒加载渲染", r["vis"] and r["has287"], r)
    report("s1 宿签 28 枚", r["chips"] == 28, r)
    report("s1 造像图全加载/零溢出", r["lordImgOk"] and r["overflow"], r)
    shot("s1-390-day")

    # ---------- 区页：紫微垣 折叠+搜索 ----------
    ev("window.Stars.openRegion('紫微垣'); true", 0.8)
    r = ev("""(() => { const reg = document.getElementById('sx-region');
      return { vis: !document.getElementById('view-star-region').hidden,
        rows: reg.querySelectorAll('[data-sx-detail]').length,
        hasSearch: !!reg.querySelector('input'),
        hasMore: !!reg.querySelector('[data-sx-more]'),
        lordCard: !!reg.querySelector('[data-sx-todaylord], .sx-lord-head') }; })()""")
    report("s2 紫微垣区页打开（首屏 13 行+折叠钮+搜索框）", r["vis"] and r["hasSearch"] and r["hasMore"] and r["rows"] >= 13, r)
    ev("""(() => { const inp = document.querySelector('#sx-region input');
        inp.value = '北斗'; inp.dispatchEvent(new Event('input', {bubbles:true})); return true; })()""", 0.5)
    r = ev("""(() => { const reg = document.getElementById('sx-region');
      const rows = [...reg.querySelectorAll('[data-sx-detail]')];
      return { n: rows.length, names: rows.map(x => x.textContent.slice(0,4)) }; })()""")
    report("s2 区内搜索「北斗」命中且收窄", 1 <= r["n"] <= 3 and any("北斗" in n for n in r["names"]), r)
    ev("""(() => { const inp = document.querySelector('#sx-region input');
        inp.value = ''; inp.dispatchEvent(new Event('input', {bubbles:true}));
        const m = document.querySelector('#sx-region [data-sx-more]'); if (m) m.click(); return true; })()""", 0.6)
    r = ev("document.querySelectorAll('#sx-region [data-sx-detail]').length")
    report("s2 展开全部 = 37 行", r == 37, r)

    # ---------- 详情：南门（双口径+存疑+星君卡） ----------
    ev("window.Stars.openDetail('角宿|南门'); true", 0.8)
    r = ev("""(() => { const d = document.getElementById('sx-detail') || document.getElementById('view-star-detail');
      const txt = d.textContent;
      return { vis: !document.getElementById('view-star-detail').hidden,
        svg: !!d.querySelector('svg'), tables: d.querySelectorAll('.sx-calib').length, stars: txt.includes('南门一') && txt.includes('ξ') && txt.includes('α Cen'),
        dual: txt.includes('双口径'), doubt: txt.includes('存疑'),
        dispute: txt.includes('为何双口径') || txt.includes('分歧'),
        lord: txt.includes('角木蛟'), shared: txt.includes('共有') }; })()""")
    report("s3 南门详情：简图+双表+徽标+分歧+星君卡", r["vis"] and r["svg"] and r["tables"] == 2 and r["stars"] and r["dual"] and r["doubt"] and r["dispute"] and r["lord"], r)
    shot("s3-390-day")

    # 星君互链 → 神祇详情
    ev("""(() => { const el = document.querySelector('#view-star-detail [data-sx-deity]');
        if (el) { el.click(); return 'clicked'; } return 'none'; })()""", 0.8)
    r = ev("""(() => { const dv = document.getElementById('view-deity-detail');
      return { vis: dv && !dv.hidden,
        name: (document.getElementById('deity-detail-name') || {}).textContent || '',
        starLink: !!document.querySelector('#deity-star-link button') }; })()""")
    report("互链：南门→角木蛟详情+「本宿星官」签", r["vis"] and "角木蛟" in r["name"] and r["starLink"], r)
    ev("document.querySelector('#deity-star-link button').click(); true", 0.8)
    r = ev("""(() => ({ region: !document.getElementById('view-star-region').hidden,
        txt: (document.getElementById('sx-region') || {}).textContent.slice(0, 60) }))()""")
    report("互链回程：星君详情→角宿区页", r["region"] and "角宿" in r["txt"], r)

    # ---------- 强链：北斗 → 北斗星君/斗姆 ----------
    ev("window.Stars.openDetail('紫微垣|北斗'); true", 0.8)
    r = ev("""(() => { const d = document.getElementById('view-star-detail');
      const cards = [...d.querySelectorAll('[data-sx-deity]')].map(e => e.textContent);
      return { cards, n: cards.length }; })()""")
    report("强链：北斗详情出北斗星君+斗姆两卡", r["n"] >= 2 and any("斗姆" in c or "北斗" in c for c in r["cards"]), r)

    # ---------- 合咏注：华盖 ----------
    ev("window.Stars.openDetail('紫微垣|华盖'); true", 0.8)
    r = ev("(document.getElementById('view-star-detail').textContent.match(/合咏[^<]{0,40}/) || [''])[0]")
    report("合咏注：华盖详情有合咏十六星小字", "十六" in r, r)

    # ---------- 图鉴 102 ----------
    ev("window.__wuri_openDeity && document.getElementById('stars-back').click(); true", 0.3)
    ev("""(() => { const b = document.querySelector('[data-tab="tab-home"]'); if (b) b.click(); return true; })()""", 0.5)
    ev("document.getElementById('deities-entry-card').click(); true", 0.8)
    r = ev("""(() => { const g = document.getElementById('deities-groups');
      const titles = [...g.querySelectorAll('.deity-group-title')].map(e => e.textContent);
      return { cards: g.querySelectorAll('.deity-card').length,
        lastGroup: titles[titles.length - 1],
        countCn: (document.getElementById('deities-count-cn') || {}).textContent }; })()""")
    report("图鉴 102 位+末组二十八宿星君+首页计数一百零二", r["cards"] == 102 and "二十八宿星君" in (r["lastGroup"] or "") and r["countCn"] == "一百零二", r)
    ev("""(() => { const c = document.querySelector('[data-deity="niujinniu"]'); if (c) c.click(); return !!c; })()""", 0.8)
    r = ev("""(() => { const pos = (document.getElementById('deity-detail-pos') || {}).textContent || '';
      const bSec = document.querySelectorAll('.deity-sec');
      const hiddenSecs = [...bSec].filter(s => s.hidden).length;
      return { pos, hiddenSecs,
        name: (document.getElementById('deity-detail-name') || {}).textContent || '' }; })()""")
    report("星君详情：位次 /102 + 空圣诞行隐藏", "/ 102" in r["pos"] and "牛金牛" in r["name"] and r["hiddenSecs"] >= 1, r)
    shot("deity-niujinniu-390-day")
    ev("document.getElementById('deity-back') ? document.getElementById('deity-back').click() : true; true", 0.4)

    # ---------- 经文库分架 + 步天歌 ----------
    ev("""(() => { const b = document.querySelector('[data-tab="tab-jing"]'); if (b) b.click(); return true; })()""", 0.8)
    r = ev("""(() => { const list = document.getElementById('jing-list');
      const shelf = list.querySelector('#sx-jing-shelf');
      return { shelf: !!shelf, txt: shelf ? shelf.textContent : '' }; })()""")
    report("经文库「典籍·天文」分架在位", r["shelf"] and "步天歌" in r["txt"], r)
    ev("document.getElementById('sx-jing-shelf').click(); true", 0.8)
    r = ev("""(() => { const v = document.getElementById('view-butiange');
      return { vis: v && !v.hidden,
        toc: [...new Set([...v.querySelectorAll('[data-sx-toc]')].map(e => e.getAttribute('data-sx-toc')))].length,
        tags: v.querySelectorAll('[data-sx-detail]').length }; })()""")
    report("s5 步天歌页：31 区目录+逐句签", r["vis"] and r["toc"] == 31 and r["tags"] > 50, r)
    shot("s5-390-day")
    ev("""(() => { const tg = document.querySelector('#view-butiange [data-sx-detail]');
        if (tg) tg.click(); return true; })()""", 0.8)
    r = ev("!document.getElementById('view-star-detail').hidden")
    report("s5 逐句签→星官详情跳转", r is True, r)

    # ---------- 切 tab 后新视图全隐藏 ----------
    ev("""(() => { const b = document.querySelector('[data-tab="tab-home"]'); if (b) b.click(); return true; })()""", 0.5)
    r = ev("""(() => ['view-stars','view-star-region','view-star-detail','view-butiange']
        .every(id => document.getElementById(id).hidden))()""")
    report("切 tab 后星象四视图全隐藏", r is True, r)

    # ---------- 夜间 + 412 复验 ----------
    ev("""(() => { const b = document.querySelector('[data-theme-toggle]');
        for (let i = 0; i < 3 && document.documentElement.getAttribute('data-theme') !== 'night'; i++) b.click();
        return document.documentElement.getAttribute('data-theme'); })()""", 0.5)
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
    time.sleep(0.4)
    r = ev("""(() => { const card = document.getElementById('stars-entry-card');
      const bg = getComputedStyle(card.querySelector('.h2-bg')).backgroundImage;
      return { night: document.documentElement.getAttribute('data-theme'),
        bgNight: bg.includes('heroes/starmap.webp'),
        overflow: document.documentElement.scrollWidth <= window.innerWidth + 1 }; })()""")
    report("夜间 412：星象卡夜图+零溢出", r["night"] == "night" and r["bgNight"] and r["overflow"], r)
    shot("home-412-night")
    ev("window.Stars.openHome(); true", 0.9)
    r = ev("document.documentElement.scrollWidth <= window.innerWidth + 1")
    report("夜间 412：s1 零溢出", r is True, r)
    shot("s1-412-night")
    ev("window.Stars.openDetail('角宿|南门'); true", 0.8)
    r = ev("document.documentElement.scrollWidth <= window.innerWidth + 1")
    report("夜间 412：s3 零溢出", r is True, r)
    shot("s3-412-night")

    # ---------- JS 异常 ----------
    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    report("全程无 JS 异常", len(excs) == 0, json.dumps(excs)[:200] if excs else "")

finally:
    chrome.terminate()

fails = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(fails), len(results)))
if fails:
    print("FAILED:", fails); sys.exit(1)
