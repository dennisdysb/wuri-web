#!/usr/bin/env python3
"""v2.1.1 (4) 专项冒烟：区页总览星图（本区星官一图总览＋可点进详情）。

用户需求（2026-10-25）：点进任一区（28 宿＋三垣共 31 区）应有一幅星图
总览，展示本区各星官的星星排列；图可点击，点星官的星/名牌跳详情页。
位置由用户指定：区页内、搜索框正上方。

断言：
①三类代表区图渲染且星点/星官组数与数据逐一对账：
  角宿（小跨度宿区·心射）、紫微垣（环极缠绕·极心立体，含北天极注记、
  北极组近图心）、天市垣（大跨度垣·心射）。
②手性与详情简图一致：角宿 角宿一/二 的相对方位符号合数据；
  紫微垣 北斗三星（天枢/天璇/摇光）三角形向与板面约定（−赤经, −赤纬）
  同号——防投影镜像。
③真点击（CDP 真实鼠标事件，非 .click()）：先 elementFromPoint 断言
  命中点最上层属目标星官组，再点星点命中圈 → 打开正确详情；
  名牌同法点一次 → 打开对应详情。
④返回回区页且区页滚动恢复（点击前记录 scrollTop，回程逐值对）。
⑤含不可绘星官的区（轸宿 3 官）图下有小字注明；可绘组数对账。
⑥390 与 412 两档：名牌盒全在 viewBox 内、零重叠名牌占比 ≥80%、
  SVG 不溢出容器；红光模式下图被压红（computed filter 非 none）。
沙箱边界：file:// 直读本地树；真机触控手感须用户复测。
"""
import importlib.util, json, os, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/v2113-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- 数据期望（现算，不写死） ----------
XG = json.load(open(os.path.join(WWW, "data/xingguan.json"), encoding="utf-8"))
def has(s): return isinstance(s.get("ra_deg"), (int, float)) and isinstance(s.get("dec_deg"), (int, float))
def sec_stats(sec):
    groups = stars = unplot = 0
    for a in XG["asterisms"]:
        if a["section"] != sec: continue
        st = [s for s in (a.get("stars") or []) if has(s)]
        if st: groups += 1; stars += len(st)
        else: unplot += 1
    return groups, stars, unplot
def ast(sec, name):
    for a in XG["asterisms"]:
        if a["section"] == sec and a["name"] == name: return a
    raise KeyError(sec + name)
def key_of(a): return a.get("id") or (a["section"] + "|" + a["name"])

# ---------- 静态断言 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v109 缓存名", "wuri-v109-20261025-v211-4" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("四件套：CSS ?v=108＋版本 v2.1.1 (4)", "css/style.css?v=109" in html and "v2.1.1 (4)" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简繁 v2.1.1 (4)", i18n.count("v2.1.1 (4)") >= 2)
report("总览文案简繁齐", i18n.count("sx_map_note:") >= 2 and i18n.count("sx_map_note_polar") >= 2
       and i18n.count("sx_map_unplotted") >= 2)
sjs = open(os.path.join(WWW, "js/stars.js"), encoding="utf-8").read()
report("总览图实现在位", "regionMapHTML" in sjs and "sx-rmap" in sjs and "polar" in sjs
       and "data-sx-detail" in sjs)
css = open(os.path.join(WWW, "css/style.css"), encoding="utf-8").read()
report("总览图 CSS 在位", ".sx-rmap-hit" in css and ".sx-rmap-g" in css)

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

    def ev(js, wait=0.0):
        v = cdp.evaluate(js)
        if wait: time.sleep(wait)
        return v

    def shot(name):
        r = cdp.call("Page.captureScreenshot", {"format": "png"})
        open(os.path.join(SHOTS, name + ".png"), "wb").write(base64.b64decode(r["data"]))

    def real_click(x, y):
        cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
        time.sleep(0.7)

    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true", 0.5)
    for _ in range(30):
        if ev("!!document.querySelector('#sx-home .sx-yuan-name')"): break
        time.sleep(0.5)

    MAPQ = "document.querySelector('#sx-region svg.sx-rmap')"
    def open_region(sec):
        ev("window.Stars.openRegion(%s); true" % json.dumps(sec), 0.9)

    def label_stats():
        return ev("""(() => { const svg = %s; if (!svg) return null;
          const vb = svg.viewBox.baseVal;
          const boxes = [...svg.querySelectorAll('text.sx-plot-t')].map(tx => { const b = tx.getBBox();
            return {x: b.x, y: b.y, w: b.width, h: b.height}; });
          let free = 0;
          boxes.forEach((b, i) => { let ov = 0;
            boxes.forEach((o, j) => { if (i === j) return;
              ov += Math.max(0, Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x)) *
                    Math.max(0, Math.min(b.y + b.h, o.y + o.h) - Math.max(b.y, o.y)); });
            if (ov === 0) free++; });
          const inside = boxes.every(b => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= vb.width + 0.5 && b.y + b.h <= vb.height + 0.5);
          const r = svg.getBoundingClientRect();
          const view = document.getElementById('view-star-region');
          return { n: boxes.length, freeRatio: boxes.length ? free / boxes.length : 1, inside,
                   overflow: r.right > view.clientWidth + 1 || r.width > view.clientWidth + 1 }; })()""" % MAPQ)

    # ---------- 角宿（心射·小跨度） ----------
    g_e, s_e, _ = sec_stats("角宿")
    open_region("角宿")
    r = ev("""(() => { const svg = %s; const inp = document.getElementById('sx-region-q');
      return { has: !!svg,
        aboveSearch: !!(svg && inp && (svg.compareDocumentPosition(inp) & Node.DOCUMENT_POSITION_FOLLOWING)),
        groups: svg ? svg.querySelectorAll('g.sx-rmap-g').length : 0,
        stars: svg ? svg.querySelectorAll('circle.sx-star').length : 0,
        hits: svg ? svg.querySelectorAll('.sx-rmap-hit').length : 0 }; })()""" % MAPQ)
    report("角宿 总览图渲染且在搜索框正上方", r["has"] and r["aboveSearch"], r)
    report("角宿 星官组/星点数对账", r["groups"] == g_e and r["stars"] == s_e, (r, g_e, s_e))
    report("角宿 每星有命中圈", r["hits"] >= r["stars"], r)
    shot("region-jiao-390")

    ja = ast("角宿", "角"); jstars = [s for s in ja["stars"] if has(s)]
    r = ev("""(() => { const g = document.querySelector('#sx-region g.sx-rmap-g[data-sx-detail=%s]');
      const cs = [...g.querySelectorAll('circle.sx-star')];
      return cs.map(c => ({x: +c.getAttribute('cx'), y: +c.getAttribute('cy')})); })()"""
           % json.dumps(key_of(ja)))
    s1, s2 = jstars[0], jstars[1]
    exp_x = (r[1]["x"] - r[0]["x"]) * (s2["ra_deg"] - s1["ra_deg"]) < 0   # 赤经大者居左
    exp_y = (r[1]["y"] - r[0]["y"]) * (s2["dec_deg"] - s1["dec_deg"]) < 0  # 赤纬高者居上
    report("角宿 角宿一/二相对方位合数据（赤经左增·赤纬上增）", exp_x and exp_y, (r, s1, s2))

    ls = label_stats()
    report("角宿 名牌全在图内＋零重叠≥80%＋不溢出", ls and ls["inside"] and ls["freeRatio"] >= 0.8 and not ls["overflow"], ls)

    # 真点击星点 → 详情；先记录区页滚动
    pt = ev("""(() => { const g = document.querySelector('#sx-region g.sx-rmap-g[data-sx-detail=%s]');
      const hit = g.querySelector('.sx-rmap-hit');
      hit.scrollIntoView({block: 'center'});
      const view = document.getElementById('view-star-region');
      const r = hit.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const grp = top && top.closest ? top.closest('[data-sx-detail]') : null;
      return { x: cx, y: cy, topKey: grp ? grp.getAttribute('data-sx-detail') : null,
               scroll: view.scrollTop }; })()""" % json.dumps(key_of(ja)))
    report("角宿 星点命中点最上层属本组（elementFromPoint）", pt["topKey"] == key_of(ja), pt)
    real_click(pt["x"], pt["y"])
    r = ev("""(() => ({ detail: !document.getElementById('view-star-detail').hidden,
      title: (document.querySelector('#sx-detail .sx-title') || {}).textContent || '' }))()""")
    report("角宿 真点星点打开「角」详情", r["detail"] and "角" in r["title"], r)
    ev("document.getElementById('star-detail-back').click(); true", 0.5)
    r = ev("""(() => ({ detailHidden: document.getElementById('view-star-detail').hidden,
      region: !document.getElementById('view-star-region').hidden,
      scroll: document.getElementById('view-star-region').scrollTop }))()""")
    report("角宿 返回回区页且滚动恢复", r["detailHidden"] and r["region"] and abs(r["scroll"] - pt["scroll"]) <= 2, (r, pt))

    # 真点击名牌 → 详情（页内找一张最上层确属自家的名牌）
    lab = ev("""(() => { const svg = %s;
      const gs = [...svg.querySelectorAll('g.sx-rmap-g')];
      for (const g of gs) {
        const rect = g.querySelector('rect.sx-rmap-hit'); if (!rect) continue;
        rect.scrollIntoView({block: 'center'});
        const r = rect.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        const grp = top && top.closest ? top.closest('[data-sx-detail]') : null;
        if (grp && grp.getAttribute('data-sx-detail') === g.getAttribute('data-sx-detail'))
          return { x: cx, y: cy, key: g.getAttribute('data-sx-detail'),
                   name: (g.querySelector('text.sx-plot-t') || {}).textContent || '' };
      }
      return null; })()""" % MAPQ)
    report("角宿 存在可点名牌（最上层属自家组）", bool(lab), lab)
    if lab:
        real_click(lab["x"], lab["y"])
        r = ev("""(() => ({ detail: !document.getElementById('view-star-detail').hidden,
          title: (document.querySelector('#sx-detail .sx-title') || {}).textContent || '' }))()""")
        report("角宿 真点名牌打开对应详情", r["detail"] and lab["name"] and lab["name"] in r["title"], (r, lab))
        ev("document.getElementById('star-detail-back').click(); true", 0.5)

    # 红光：图被压红
    r = ev("""(() => { window.WuriRedlight.set(true);
      const svg = %s; const f = svg ? getComputedStyle(svg).filter : '';
      window.WuriRedlight.set(false);
      return { red: document.body.classList.contains('sky-red') || true, filter: f }; })()""" % MAPQ)
    report("角宿 红光模式下总览图被压红", r["filter"] and r["filter"] != "none", r)

    # ---------- 紫微垣（极心立体·环极） ----------
    g_e, s_e, _ = sec_stats("紫微垣")
    open_region("紫微垣")
    r = ev("""(() => { const svg = %s; if (!svg) return { has: false };
      const txt = [...svg.querySelectorAll('text')].map(t => t.textContent).join(' ');
      const bg = svg.querySelector('g.sx-rmap-g[data-sx-detail=%s]');
      const bj = svg.querySelector('g.sx-rmap-g[data-sx-detail=%s]');
      let centroid = null, poleNear = false;
      if (bj) { const cs = [...bj.querySelectorAll('circle.sx-star')];
        const cx = cs.reduce((a, c) => a + +c.getAttribute('cx'), 0) / cs.length;
        const cy = cs.reduce((a, c) => a + +c.getAttribute('cy'), 0) / cs.length;
        centroid = { x: cx, y: cy };
        const vb = svg.viewBox.baseVal;
        poleNear = Math.abs(cx - vb.width / 2) < vb.width * 0.25 && Math.abs(cy - vb.height / 2) < vb.height * 0.25; }
      return { has: true, polarNote: txt.includes('北天极'), groups: svg.querySelectorAll('g.sx-rmap-g').length,
        stars: svg.querySelectorAll('circle.sx-star').length, centroid, poleNear }; })()"""
           % (MAPQ, json.dumps("紫微垣|北斗"), json.dumps(key_of(ast("紫微垣", "北极")))))
    report("紫微垣 总览图渲染（极心立体注记）", r["has"] and r["polarNote"], r)
    report("紫微垣 星官组/星点数对账", r["groups"] == g_e and r["stars"] == s_e, (r, g_e, s_e))
    report("紫微垣 北极组近图心（环极成形）", r["poleNear"], r)
    shot("region-ziwei-390")

    bd = ast("紫微垣", "北斗"); bstars = [s for s in bd["stars"] if has(s)]
    idx = {n: i for i, s in enumerate(bstars) for n in [s["cn_name"]]}
    i1, i2, i3 = idx["天樞"], idx["天璇"], idx["搖光"]  # 数据星名为繁体字形
    p = [bstars[i1], bstars[i2], bstars[i3]]
    def area(pts):  # 屏幕系（y 向下）有向面积
        (x1, y1), (x2, y2), (x3, y3) = pts
        return (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)
    exp_area = area([(-s["ra_deg"], -s["dec_deg"]) for s in p])
    r = ev("""(() => { const g = document.querySelector('#sx-region g.sx-rmap-g[data-sx-detail=%s]');
      const cs = [...g.querySelectorAll('circle.sx-star')];
      return [%d, %d, %d].map(i => ({ x: +cs[i].getAttribute('cx'), y: +cs[i].getAttribute('cy') })); })()"""
           % (json.dumps(key_of(bd)), i1, i2, i3))
    got_area = area([(q["x"], q["y"]) for q in r])
    report("紫微垣 北斗三星手性与详情简图同向（非镜像）",
           exp_area != 0 and got_area != 0 and (exp_area > 0) == (got_area > 0), (exp_area, got_area, r))
    ls = label_stats()
    report("紫微垣 名牌全在图内＋零重叠≥80%＋不溢出", ls and ls["inside"] and ls["freeRatio"] >= 0.8 and not ls["overflow"], ls)

    # ---------- 天市垣（心射·大跨度垣） ----------
    g_e, s_e, _ = sec_stats("天市垣")
    open_region("天市垣")
    r = ev("""(() => { const svg = %s;
      return { has: !!svg, groups: svg ? svg.querySelectorAll('g.sx-rmap-g').length : 0,
        stars: svg ? svg.querySelectorAll('circle.sx-star').length : 0 }; })()""" % MAPQ)
    report("天市垣 总览图渲染＋组/星数对账", r["has"] and r["groups"] == g_e and r["stars"] == s_e, (r, g_e, s_e))
    shot("region-tianshi-390")

    # ---------- 轸宿（不可绘星官注记） ----------
    g_e, s_e, u_e = sec_stats("轸宿")
    open_region("轸宿")
    r = ev("""(() => { const reg = document.getElementById('sx-region');
      const svg = """ + MAPQ + """;
      return { has: !!svg, groups: svg ? svg.querySelectorAll('g.sx-rmap-g').length : 0,
        note: reg.textContent.includes('暂无定星位置'), noteN: reg.textContent.includes('另有 """ + str(u_e) + """ 个星官') }; })()""")
    report("轸宿 不可绘星官小字注明（%d 官）" % u_e, r["has"] and r["note"] and r["noteN"] and r["groups"] == g_e, r)

    # ---------- 412 档复核（角宿） ----------
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
    open_region("角宿")
    ls = label_stats()
    report("412档 角宿 名牌全在图内＋零重叠≥80%＋不溢出", ls and ls["inside"] and ls["freeRatio"] >= 0.8 and not ls["overflow"], ls)
    shot("region-jiao-412")

    excs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    report("全程无未捕获 JS 异常", not excs, excs[:1])
finally:
    chrome.terminate()

n_ok = sum(1 for _, ok in results if ok)
print("=== smoke-v2113: %d/%d ===" % (n_ok, len(results)))
sys.exit(0 if n_ok == len(results) else 1)
