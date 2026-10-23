#!/usr/bin/env python3
"""v2.0.0 (2) 专项冒烟（本地 file:// + CDP）：
神图外置（统一解析/占位替换/呈现版规格/预取收口/下载引擎*)、导航回来源
（区页/图鉴主页/星君链/步天歌四路＋滚动恢复）、月相双主题对比度＋双相位截图、
简图标签避让（密集样本盒两两不交＋无口径后缀）与上下文模式（阴德/幸臣/天乙/钩钤）。
* 下载引擎在 file:// 下以内存 Cache 垫片跑通全流程（真 Cache API 不收 file 协议，
  线上由 smoke-v2002-live.py 对双线实测）。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/v2002-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 静态断言 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
assets = sw.split("const ASSETS = [")[1].split("];")[0]
report("SW v95 缓存名", "wuri-v95-20261023-v200-6" in sw)
report("SW 预缓存不含图鉴全图", "img/deities/" not in assets)
report("SW 含图鉴全图分支（豁免缓存优先）", "isDeityFull" in sw and "OFFLINE_CACHE" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("设置页图鉴素材卡在位", 'id="deity-dl-btn"' in html and 'id="deity-dl-status"' in html)
report("CSS ?v=95 与版本 (6)", "css/style.css?v=95" in html and "v2.0.0 (6)" in html)
_fy_web = open(os.path.join(WWW, "data/fenye.json"), "rb").read()
_fy_src = open(os.path.expanduser("~/workspace/wuri-app/star-module/fenye.json"), "rb").read()
report("fenye.json 与备料逐字节一致", _fy_web == _fy_src)
report("步罡脚本与入口在位", 'id="bugang-open"' in html and 'id="bugang-view"' in html
       and os.path.exists(os.path.join(WWW, "js/bugang.js")))
od = open(os.path.join(WWW, "js/offline-download.js"), encoding="utf-8").read()
report("音频预取只带缩略图", "rels.push('img/deities/' + d.image)" not in od)

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
    cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        import base64
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    def waitfor(js, timeout=15.0, step=0.4):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if ev(js): return True
            time.sleep(step)
        return False

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)

    # ---------- 图鉴：网格只缩略图 + 详情占位→全图（呈现版 800 宽） ----------
    ev("(document.getElementById('deities-enter').click(), true)", 1.2)
    grid_full = ev("Array.from(document.querySelectorAll('#deities-groups img')).filter(i=>!/thumbs\\//.test(i.getAttribute('src')||'')).length")
    grid_n = ev("document.querySelectorAll('#deities-groups img').length")
    report("图鉴网格 102 卡全用缩略图", grid_n == 102 and grid_full == 0, "n=%s full=%s" % (grid_n, grid_full))
    ev("document.getElementById('view-deities').scrollTop = 500; true")
    ev("(document.querySelector('[data-deity=\"jiaomujiao\"]').click(), true)", 0.3)
    ok = waitfor("!document.getElementById('deity-detail-img').hidden && /deities\\/jiaomujiao\\.webp/.test(document.getElementById('deity-detail-img').currentSrc) && document.getElementById('deity-detail-img').naturalWidth > 0")
    dw = ev("document.getElementById('deity-detail-img').naturalWidth")
    report("详情全图无缝替换（呈现版宽 800）", ok and dw == 800, "w=%s" % dw)
    report("详情占位层已收起", ev("document.getElementById('view-deity-detail').querySelector('.deity-img-box').classList.contains('ph-off')"))
    shot("deity-detail-jiaomujiao-day")

    # 返回图鉴主页 + 滚动恢复
    ev("(document.getElementById('deity-detail-back').click(), true)", 0.5)
    st = ev("document.getElementById('view-deities').scrollTop")
    report("导航：图鉴主页→详情→返回＝主页＋滚动恢复", ev("!document.getElementById('view-deities').hidden && document.getElementById('view-deity-detail').hidden") and abs(st - 500) <= 40, "scroll=%s" % st)

    # ---------- 全图被阻断：停在缩略图占位（不裂图） ----------
    ev("window.WURI_IMG_BASE = 'https://invalid.example/'; true")
    ev("(document.querySelector('[data-deity=\"doumu\"]').click(), true)", 2.0)
    blocked_src = ev("document.getElementById('deity-detail-img').currentSrc")
    blocked_nat = ev("document.getElementById('deity-detail-img').naturalWidth")
    blocked_hidden = ev("document.getElementById('deity-detail-img').hidden")
    report("全图不可达：停在缩略图（可见、不裂图）",
           "/thumbs/" in (blocked_src or "") and blocked_nat > 0 and not blocked_hidden,
           "src=%s nat=%s hidden=%s" % (blocked_src, blocked_nat, blocked_hidden))
    ev("(document.getElementById('deity-detail-back').click(), true)", 0.3)
    ev("window.WURI_IMG_BASE = ''; true")

    # ---------- 星象导航四路 ----------
    ev("(document.querySelector('#tabbar button[data-tab=\"tab-stars\"]').click(), true)", 0.5)
    waitfor("window.Stars && document.querySelectorAll('#sx-home .sx-card, #sx-home .sx-group').length > 0")
    # 区页（紫微垣）→ 对应神祇卡（紫微大帝）→ 详情 → 返回＝区页
    ev("Stars.openRegion('紫微垣'); true", 0.8)
    ev("document.getElementById('view-star-region').scrollTop = 260; true")
    ev("(document.querySelector('[data-sx-deity=\"ziwei\"]').click(), true)", 0.8)
    report("紫微垣→对应卡→神祇详情（紫微大帝）",
           ev("!document.getElementById('view-deity-detail').hidden && document.getElementById('deity-detail-name').textContent.includes('紫微')"))
    ev("(document.getElementById('deity-detail-back').click(), true)", 0.6)
    rst = ev("document.getElementById('view-star-region').scrollTop")
    report("导航：区页→对应卡→详情→返回＝区页＋滚动恢复",
           ev("!document.getElementById('view-star-region').hidden && document.getElementById('view-deities').hidden && document.getElementById('view-deity-detail').hidden")
           and abs(rst - 260) <= 40, "scroll=%s" % rst)
    ev("(document.getElementById('star-region-back').click(), true)", 0.3)

    # 星官详情（角宿·角）→ 星君卡 → 神祇详情 → 返回＝星官详情（区页在栈下）
    key_jiao = ev("""(async () => { const d = await (await fetch('data/xingguan.json')).json();
      const a = d.asterisms.find(x => x.section === '角宿' && x.name === '角');
      return a.id || (a.section + '|' + a.name); })()""")
    ev("Stars.openRegion('角宿'); true", 0.6)
    ev("Stars.openDetail(%s); true" % json.dumps(key_jiao), 0.8)
    ev("(document.querySelector('#sx-detail [data-sx-deity=\"jiaomujiao\"]').click(), true)", 0.8)
    report("星官详情→星君卡→神祇详情（角木蛟）",
           ev("!document.getElementById('view-deity-detail').hidden && document.getElementById('deity-detail-name').textContent.includes('角木蛟')"))
    ev("(document.getElementById('deity-detail-back').click(), true)", 0.6)
    report("导航：星君链→详情→返回＝星官详情（区页同栈恢复）",
           ev("!document.getElementById('view-star-detail').hidden && !document.getElementById('view-star-region').hidden && document.getElementById('view-deity-detail').hidden"))
    ev("(document.getElementById('star-detail-back').click(), true)", 0.4)
    report("对称：星官详情返回→区页", ev("!document.getElementById('view-star-region').hidden && document.getElementById('view-star-detail').hidden"))
    ev("(document.getElementById('star-region-back').click(), true)", 0.3)

    # 步天歌 → 逐句签 → 星官详情 → 返回＝步天歌
    ev("Stars.openButiange('角宿'); true", 0.8)
    ev("(document.querySelector('#sx-book [data-sx-detail]').click(), true)", 0.8)
    report("步天歌逐句签→星官详情", ev("!document.getElementById('view-star-detail').hidden"))
    ev("(document.getElementById('star-detail-back').click(), true)", 0.4)
    report("对称：星官详情返回→步天歌", ev("!document.getElementById('view-butiange').hidden && document.getElementById('view-star-detail').hidden"))
    ev("(document.getElementById('butiange-back').click(), true)", 0.3)

    # ---------- 经文库步天歌分架 →「本区图鉴 ›」( (3) 真机修复：典籍页盖住区页 ) ----------
    ev("(document.querySelector('#tabbar button[data-tab=\"tab-jing\"]').click(), true)", 0.6)
    report("经文标签步天歌分架入口在位", ev("!!document.getElementById('sx-jing-shelf')"))
    ev("(document.getElementById('sx-jing-shelf').click(), true)", 0.8)
    report("分架点开步天歌典籍页", ev("!document.getElementById('view-butiange').hidden"))
    key_txt = ev("document.querySelector('#sx-sec-牛宿 .sx-toregion') ? document.querySelector('#sx-sec-牛宿 .sx-toregion').textContent.trim() : ''")
    report("入口键文案＝本区图鉴 ›", key_txt == "本区图鉴 ›", key_txt)
    ev("document.getElementById('view-butiange').scrollTop = 300; true")
    ev("(document.querySelector('#sx-sec-牛宿 .sx-toregion').click(), true)", 0.8)
    reg_txt = ev("document.getElementById('sx-region').textContent") or ""
    report("硬断言：分架→本区图鉴→实际落到牛宿区页（区页可见＋典籍页已收起＋区页含牛宿）",
           ev("!document.getElementById('view-star-region').hidden && document.getElementById('view-butiange').hidden")
           and "牛宿" in reg_txt, reg_txt[:80])
    TOPMOST = """(() => { const el = document.elementFromPoint(Math.floor(innerWidth/2), Math.floor(innerHeight/2));
      if (!el) return 'none';
      const inV = id => { const v = document.getElementById(id); return v && !v.hidden && v.contains(el); };
      if (inV('view-star-region')) return 'region';
      if (inV('view-star-detail')) return 'detail';
      if (inV('view-butiange')) return 'butiange';
      if (inV('view-deity-detail')) return 'deity-detail';
      const ts = document.getElementById('tab-stars'); if (ts && ts.contains(el)) return 'stars-home';
      return 'other:' + el.tagName; })()"""
    report("硬断言：区页为最上层（中心点命中区页、未被其他全屏视图遮盖）", ev(TOPMOST) == "region", ev(TOPMOST))
    # ---------- (6) 区页返回＝回到来处：路径①步天歌→区页→返回＝步天歌＋滚动恢复 ----------
    ev("(document.getElementById('star-region-back').click(), true)", 0.5)
    bst = ev("document.getElementById('view-butiange').scrollTop")
    report("硬断言(6)：区页返回→回到步天歌（典籍页可见＋区页已收＋最上层＝典籍页＋滚动恢复）",
           ev("!document.getElementById('view-butiange').hidden && document.getElementById('view-star-region').hidden && document.getElementById('view-star-detail').hidden")
           and ev(TOPMOST) == "butiange" and abs(bst - 300) <= 40,
           "topmost=%s scroll=%s" % (ev(TOPMOST), bst))
    ev("(document.getElementById('butiange-back').click(), true)", 0.3)
    ev("(document.querySelector('#tabbar button[data-tab=\"tab-stars\"]').click(), true)", 0.4)
    # ---------- (6) 路径②：图鉴索引页胶囊→区页→返回＝索引页 ----------
    waitfor("document.querySelector('#sx-home [data-sx-region=\"角宿\"]')")
    ev("(document.querySelector('#sx-home [data-sx-region=\"角宿\"]').click(), true)", 0.8)
    report("硬断言(6)：索引页胶囊→角宿区页（区页可见＋最上层＝区页）",
           ev("!document.getElementById('view-star-region').hidden") and ev(TOPMOST) == "region", ev(TOPMOST))
    ev("(document.getElementById('star-region-back').click(), true)", 0.5)
    report("硬断言(6)：索引页来源区页返回→落回索引页（三星象子视图全收＋最上层＝索引页）",
           ev("document.getElementById('view-star-region').hidden && document.getElementById('view-butiange').hidden && document.getElementById('view-star-detail').hidden")
           and ev(TOPMOST) == "stars-home", ev(TOPMOST))

    # ---------- 月相：双主题对比度 + 双相位夜间截图 ----------
    def moon_measure(theme):
        ev("document.documentElement.setAttribute('data-theme', '%s'); true" % theme)
        ev("Stars.renderTodaySky(); true", 0.3)
        return ev("""(() => {
          const lit = document.querySelector('.sx-moon-lit'), dark = document.querySelector('.sx-moon-dark'), rim = document.querySelector('.sx-moon-rim');
          if (!lit || !dark) return null;
          const csL = getComputedStyle(lit), csD = getComputedStyle(dark);
          const parse = s => { const m = /[\\d.]+/g; const v = s.match(m).map(Number); return v; };
          const L = rgb => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
            return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
          const lc = parse(csL.fill), dc = parse(csD.fill), op = parseFloat(csD.opacity);
          const eff = dc.map((c, i) => c * op + lc[i] * (1 - op));
          return { ratio: (L(lc) + 0.05) / (L(eff) + 0.05), rim: rim ? getComputedStyle(rim).stroke : null };
        })()""")
    ev("""(() => { window.__findMoon = (lo, hi, wax) => {
        for (let i = 0; i < 400; i++) {
          const d = new Date(2026, 8, 1 + i, 21, 0);
          const m = WuriTodaySky.moonPhaseOf(d);
          if (m.illumination >= lo && m.illumination <= hi && ((m.elongationDeg <= 180) === wax)) return d.getTime();
        } return null; }; return true; })()""")
    gib = ev("window.__findMoon(0.88, 0.95, true)")
    wan = ev("window.__findMoon(0.25, 0.40, false)")
    report("找到盈凸/残月样本日期", bool(gib) and bool(wan))
    for label, ts in (("盈凸", gib), ("残月", wan)):
        ev("window.solarNow = function () { return new Date(%d); }; Stars.renderTodaySky(); true" % ts, 0.3)
        ev("document.documentElement.setAttribute('data-theme', 'night'); Stars.renderTodaySky(); true", 0.3)
        shot("moon-night-" + ("gibbous" if label == "盈凸" else "waning"))
    m_day = moon_measure("day")
    m_night = moon_measure("night")
    report("月相对比度·日间 ≥1.8 且描边在", m_day and m_day["ratio"] >= 1.8 and m_day["rim"] not in (None, "none"), m_day)
    report("月相对比度·夜间 ≥3.0 且描边在", m_night and m_night["ratio"] >= 3.0 and m_night["rim"] not in (None, "none"), m_night)
    print("  moon ratios: day=%s night=%s" % (m_day and round(m_day["ratio"], 2), m_night and round(m_night["ratio"], 2)))

    # ---------- 简图：标签避让 + 上下文模式 ----------
    async_key = """(async () => { const d = await (await fetch('data/xingguan.json')).json();
      const a = d.asterisms.find(x => x.section === %s && x.name === %s);
      return a.id || (a.section + '|' + a.name); })()"""
    def open_plot(section, name):
        k = ev(async_key % (json.dumps(section), json.dumps(name)))
        ev("Stars.openDetail(%s); true" % json.dumps(k), 0.7)
        return ev("!!document.querySelector('#sx-detail svg.sx-plot')")
    def label_check():
        return ev("""(() => {
          const svg = document.querySelector('#sx-detail svg.sx-plot');
          if (!svg) return { err: 'no svg' };
          const gs = Array.from(svg.querySelectorAll('g.sx-label'));
          const boxes = gs.map(g => { const b = g.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
          let worst = 0;
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const ox = Math.max(0, Math.min(boxes[i].x + boxes[i].w, boxes[j].x + boxes[j].w) - Math.max(boxes[i].x, boxes[j].x));
            const oy = Math.max(0, Math.min(boxes[i].y + boxes[i].h, boxes[j].y + boxes[j].h) - Math.max(boxes[i].y, boxes[j].y));
            worst = Math.max(worst, ox * oy);
          }
          const texts = gs.map(g => g.querySelector('text').textContent);
          return { n: gs.length, worst: worst, badSuffix: texts.filter(t => /共有|（清）|口径/.test(t)) };
        })()""")
    for section, name, tag in (("紫微垣", "紫微左垣", "zuoyuan"), ("紫微垣", "紫微右垣", "youyuan"),
                               ("紫微垣", "尚书", "shangshu"), ("紫微垣", "华盖", "huagai"),
                               ("昴宿", "昴", "mao"), ("虚宿", "天垒城", "tianleicheng")):
        okp = open_plot(section, name)
        lc = label_check()
        report("简图标签避让 %s·%s（%s 标签）" % (section, name, lc.get("n")),
               okp and lc.get("n", 0) > 0 and lc.get("worst", 99) <= 1.0 and not lc.get("badSuffix"),
               lc)
        if tag in ("zuoyuan", "youyuan"):
            shot("plot-" + tag + "-day")
    # 阴德：双星实线、非常规上下文
    okp = open_plot("紫微垣", "阴德")
    yd = ev("""(() => { const svg = document.querySelector('#sx-detail svg.sx-plot'); if (!svg) return {};
      return { focal: svg.querySelectorAll('.sx-star').length,
               solid: svg.querySelectorAll('line.sx-plot-line:not(.ctx), polyline.sx-plot-line:not(.ctx)').length,
               ctxStars: svg.querySelectorAll('.sx-star.ctx').length }; })()""")
    report("阴德（XHIP 回填后）：双星＋实线直连、无上下文邻官", okp and yd.get("solid", 0) >= 1 and yd.get("ctxStars", -1) == 0, yd)
    shot("plot-yinde-day")
    # 幸臣：单星上下文模式
    okp = open_plot("太微垣", "幸臣")
    xc = ev("""(() => { const svg = document.querySelector('#sx-detail svg.sx-plot'); if (!svg) return {};
      return { focal: svg.querySelectorAll('.sx-star.focal').length,
               ctxStars: svg.querySelectorAll('.sx-star.ctx').length,
               ctxLines: svg.querySelectorAll('line.sx-plot-line.ctx').length,
               ctxLabels: svg.querySelectorAll('.sx-plot-t.ctx').length }; })()""")
    report("幸臣（单星）：上下文模式（本官强调＋邻官灰点虚线小字）",
           okp and xc.get("focal") == 1 and xc.get("ctxStars", 0) >= 3 and xc.get("ctxLines", 0) >= 1 and xc.get("ctxLabels", 0) >= 2, xc)
    # 天乙：单星上下文；钩钤：近零跨度上下文
    okp = open_plot("紫微垣", "天乙")
    ty = ev("document.querySelectorAll('#sx-detail svg.sx-plot .sx-star.ctx').length")
    report("天乙（单星）：上下文模式", okp and ty >= 3, "ctx=%s" % ty)
    okp = open_plot("房宿", "钩钤")
    gq = ev("""(() => { const svg = document.querySelector('#sx-detail svg.sx-plot'); if (!svg) return {};
      return { focal: svg.querySelectorAll('.sx-star.focal').length, ctx: svg.querySelectorAll('.sx-star.ctx').length }; })()""")
    report("钩钤（跨度 0.2°）：上下文模式", okp and gq.get("focal") == 2 and gq.get("ctx", 0) >= 3, gq)
    # ---------- 同区星官片区：标题 + 人话说明（(4) 真机反馈：北极页底一墙胶囊无标题） ----------
    okp = open_plot("紫微垣", "北极")
    sib = ev("""(() => {
      const secs = Array.from(document.querySelectorAll('#sx-detail .sx-sec'));
      const title = secs.find(e => e.textContent.includes('同区星官'));
      const note = document.querySelector('#sx-detail .sx-sec-note');
      const chips = document.querySelector('#sx-detail .sx-chips');
      if (!title || !chips) return { found: false };
      return { found: true, title: title.textContent.trim(),
               note: note ? note.textContent.trim() : '',
               before: !!(title.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING),
               noteBefore: note ? !!(note.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING) : false,
               n: chips.querySelectorAll('.sx-chip').length };
    })()""")
    report("同区星官片区：标题「同区星官 · 紫微垣」紧贴胶囊区之前",
           okp and sib.get("found") and "同区星官 · 紫微垣" in sib.get("title", "")
           and sib.get("before") and sib.get("n", 0) >= 30, sib)
    report("同区星官片区：人话说明（按区动态生成）",
           sib.get("note") == "同属紫微垣区的其他星官，点按直达各自详情" and sib.get("noteBefore"), sib)
    ev("document.documentElement.setAttribute('data-theme', 'night'); true")
    open_plot("太微垣", "幸臣")
    shot("plot-xingchen-night")
    open_plot("紫微垣", "紫微右垣")
    shot("plot-youyuan-night")

    # ---------- 贯通批 (5)：值神互链 / 太阳躔宿 / 分野卡 / 步罡跟练 ----------
    ev("document.documentElement.setAttribute('data-theme', 'day'); true")
    ev("(document.querySelector('#tabbar button[data-tab=\"tab-home\"]').click(), true)", 0.6)
    ok = waitfor("document.getElementById('sun-line').textContent.includes('太阳所在')", 10)
    sun_txt = ev("document.getElementById('sun-line').textContent")
    report("首页太阳躔宿行（宿＋次＋入宿度）", ok and "宿" in sun_txt and "之次" in sun_txt and "约" in sun_txt, sun_txt)
    # 日值宿段 → 本宿星官详情（同名星官）
    xiu_home = ev("document.querySelector('#zhishen-line [data-zs=\"mansion\"]').getAttribute('data-xiu')")
    ev("(document.querySelector('#zhishen-line [data-zs=\"mansion\"]').click(), true)")
    ok = waitfor("!document.getElementById('view-star-detail').hidden", 10)
    det_name = ev("document.querySelector('#sx-detail .sx-title').textContent")
    report("值神日段→本宿星官详情", ok and xiu_home and xiu_home in det_name, "xiu=%s det=%s" % (xiu_home, det_name))
    ev("(document.getElementById('star-detail-back').click(), true)", 0.5)
    # 月将段 → 太阳躔宿区页
    ev("(document.querySelector('#zhishen-line [data-zs=\"sun\"]').click(), true)")
    ok = waitfor("!document.getElementById('view-star-region').hidden", 10)
    reg_t = ev("document.querySelector('#sx-region .sx-title').textContent")
    sun_sec = ev("window.__sunSec || ''")
    report("值神月段→太阳躔宿区页", ok and "宿" in reg_t, reg_t)
    ev("(document.getElementById('star-region-back').click(), true)", 0.5)
    # 黄历详情：日躔行 + 日段互链
    ev("(document.querySelector('#tabbar button[data-tab=\"tab-cal\"]').click(), true)", 0.6)
    ev("""(() => { const cells = Array.from(document.querySelectorAll('#cal-grid .day:not(.other)'));
      const t = cells.find(c => c.classList.contains('today')) || cells[14]; if (t) t.click(); return true; })()""", 0.6)
    ok = waitfor("document.getElementById('detail-sun').textContent.includes('太阳所在')", 10)
    dsun = ev("document.getElementById('detail-sun').textContent")
    report("黄历详情日躔行有值", ok and "宿" in dsun, dsun)
    ev("(document.querySelector('#detail-zhishen [data-zs=\"mansion\"]').click(), true)")
    ok = waitfor("!document.getElementById('view-star-detail').hidden", 10)
    report("黄历值神日段→本宿星官详情", ok)
    ev("(document.getElementById('star-detail-back').click(), true)", 0.5)
    # 今日星象卡互链：本宿星官 / 北斗 / 斗姆
    ev("(document.querySelector('#tabbar button[data-tab=\"tab-stars\"]').click(), true)", 0.6)
    waitfor("document.getElementById('sx-sky-xiu').textContent.length > 0", 10)
    xiu_sky = ev("document.getElementById('sx-sky-xiu').textContent")
    ev("(document.getElementById('sx-sky-to-ast').click(), true)")
    ok = waitfor("!document.getElementById('view-star-detail').hidden", 10)
    det2 = ev("document.querySelector('#sx-detail .sx-title').textContent")
    report("今日卡本宿星官→详情", ok and xiu_sky and xiu_sky[0] in det2, "sky=%s det=%s" % (xiu_sky, det2))
    ev("(document.getElementById('star-detail-back').click(), true)", 0.5)
    ev("(document.getElementById('sx-sky-beidou').click(), true)")
    ok = waitfor("!document.getElementById('view-star-detail').hidden", 10)
    det3 = ev("document.querySelector('#sx-detail .sx-title').textContent")
    report("今日卡北斗链→北斗星官详情", ok and "北斗" in det3, det3)
    ev("(document.getElementById('star-detail-back').click(), true)", 0.5)
    ev("(document.getElementById('sx-sky-doumu').click(), true)")
    ok = waitfor("!document.getElementById('view-deity-detail').hidden", 10)
    dm = ev("document.getElementById('deity-detail-name').textContent")
    report("今日卡斗姆链→斗姆元君详情", ok and "斗姆" in dm, dm)
    ev("(document.getElementById('deity-detail-back').click(), true)", 0.5)
    # 分野卡：危宿（玄枵/齐/青州）/ 胃宿（汉志独缺）/ 紫微垣（三垣不入分野）
    ev("Stars.openRegion('危宿'); true", 0.8)
    fy1 = ev("document.querySelector('#sx-region .sx-fenye') ? document.querySelector('#sx-region .sx-fenye').textContent : ''")
    report("危宿区页分野卡（玄枵·齐·青州）", "玄枵" in fy1 and "齐" in fy1 and "青州" in fy1, fy1[:120])
    ev("Stars.openRegion('胃宿'); true", 0.8)
    fy2 = ev("document.querySelector('#sx-region .sx-fenye') ? document.querySelector('#sx-region .sx-fenye').textContent : ''")
    report("胃宿区页分野卡（汉志独缺此宿）", "独缺此宿" in fy2, fy2[:160])
    ev("Stars.openRegion('紫微垣'); true", 0.8)
    fy3 = ev("document.querySelector('#sx-region').textContent")
    report("紫微垣区页：三垣不入分野注记", "不入分野体系" in fy3 and "不配国、州" in fy3, fy3[:200])
    ev("(document.getElementById('star-region-back').click(), true)", 0.5)
    shot("fenye-weisuset")
    # 步罡踏斗跟练
    ev("(document.querySelector('#tabbar button[data-tab=\"tab-home\"]').click(), true)", 0.5)
    ev("(document.getElementById('practice-entry-card').click(), true)", 0.8)
    ev("(document.getElementById('bugang-open').click(), true)", 0.6)
    bg0 = ev("document.getElementById('bg-now').textContent")
    report("步罡开场：天枢·贪狼·左足先", not ev("document.getElementById('bugang-view').hidden")
           and "天枢" in bg0 and "贪狼" in bg0 and "左足" in bg0, bg0)
    fu = ev("""(() => { const svg = document.querySelector('#bg-stage svg'); if (!svg) return {};
      return { fu: svg.querySelectorAll('.bg-fu').length, steps: svg.querySelectorAll('.bg-step-n').length,
               fuText: Array.from(svg.querySelectorAll('text')).some(el => el.textContent === '辅') }; })()""")
    report("步罡图：辅星只标不步（无步号）＋本匝 7 落点号", fu.get("fu") == 1 and fu.get("fuText") and fu.get("steps") == 7, fu)
    shot("bugang-step1-day")
    for _ in range(21):
        ev("(document.getElementById('bg-next').click(), true)", 0.05)
    bgd = ev("document.getElementById('bg-now').textContent + '|' + document.getElementById('bg-progress').textContent")
    report("步罡走满 21 步＋收功→三匝已毕", "三匝已毕" in bgd and "三匝完成" in bgd, bgd)
    ev("(document.getElementById('bg-reset').click(), true)", 0.3)
    ev("(document.getElementById('bg-foot-right').click(), true)", 0.3)
    bg1 = ev("document.getElementById('bg-now').textContent")
    report("步罡足别切换：右足先→第一步右足", "右足" in bg1 and "天枢" in bg1, bg1)
    ev("(document.getElementById('bg-auto').click(), true)")
    ok = waitfor("parseInt((document.getElementById('bg-progress').textContent.match(/第 (\\d+) \\//) || [0, 1])[1], 10) > 1", 6)
    ev("(document.getElementById('bg-auto').click(), true)", 0.2)
    report("步罡自动推进（约 2.6 秒/步）", ok, ev("document.getElementById('bg-progress').textContent"))
    ev("(document.getElementById('bugang-back').click(), true)", 0.4)
    report("步罡关闭回修行页", ev("document.getElementById('bugang-view').hidden && !document.getElementById('practice-view').hidden"))

    # ---------- 下载引擎（内存 Cache 垫片跑全流程，数据裁到 5 位） ----------
    ev("""(() => {
      window.__store = new Map();
      const abs = u => new URL(u, location.href).href;  /* 真 Cache API 以绝对 URL 存键，垫片同口径 */
      const shim = { open: async () => ({
        match: async (req) => { const v = window.__store.get(abs(typeof req === 'string' ? req : req.url));
          return v ? v.clone() : undefined; },
        put: async (req, res) => { window.__store.set(abs(typeof req === 'string' ? req : req.url), res.clone()); },
        keys: async () => Array.from(window.__store.keys()).map(u => ({ url: u })),
        delete: async (req) => window.__store.delete(abs(typeof req === 'string' ? req : req.url))
      }) };
      /* window.caches 是只读属性，直接赋值不生效，必须 defineProperty */
      Object.defineProperty(window, 'caches', { value: shim, configurable: true, writable: true });
      window.__fullDeities = window.DEITIES_DATA.deities;
      window.DEITIES_DATA.deities = window.__fullDeities.slice(0, 5);
      return true; })()""")
    ev("window.WuriDeityDl.start(); true")
    ok = waitfor("window.WuriDeityDl && !WuriDeityDl.isRunning() && WuriDeityDl.state() && WuriDeityDl.state().status === 'done'", 60)
    cnt = ev("(async () => (await WuriDeityDl.stats()).count)()")
    report("图鉴素材下载引擎：5/5 完成＋状态 done", ok and cnt == 5, "count=%s" % cnt)
    ev("(async () => { await WuriDeityDl.deleteAll(); return true; })()", 0.5)
    cnt2 = ev("(async () => (await WuriDeityDl.stats()).count)()")
    report("图鉴素材删除：缓存清零", cnt2 == 0, "count=%s" % cnt2)
    ev("window.DEITIES_DATA.deities = window.__fullDeities; true")

    # ---------- 零溢出（390 日 / 412 夜，星官详情与神祇详情） ----------
    def overflow():
        return ev("Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) <= window.innerWidth + 1")
    ev("document.documentElement.setAttribute('data-theme', 'day'); true")
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    open_plot("紫微垣", "华盖")
    report("390 日间：星官详情零溢出", overflow())
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
    ev("document.documentElement.setAttribute('data-theme', 'night'); true")
    ev("(document.querySelector('[data-deity=\"yuanshi\"]') ? (window.__wuri_openDeity('yuanshi'), true) : true)", 1.0)
    report("412 夜间：神祇详情零溢出", overflow())

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    logerr = [e for e in cdp.events if e.get("method") == "Log.entryAdded"
              and e.get("params", {}).get("entry", {}).get("level") == "error"
              and "invalid.example" not in e.get("params", {}).get("entry", {}).get("url", "")]  # 故意阻断全图的预期网络错误不计
    report("全程无 JS 异常", len(excs) == 0 and len(logerr) == 0, (excs + logerr)[:1])

finally:
    chrome.terminate()

bad = [n for n, ok in results if not ok]
print("\n==== %d/%d PASS ====" % (len(results) - len(bad), len(results)))
if bad:
    print("FAILED:", bad)
    sys.exit(1)
