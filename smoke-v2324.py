#!/usr/bin/env python3
"""v2.3.0（SW v124）神祇图鉴「星图」互链补全专项冒烟。

本批：星空系神祇详情页新增「星图 · <星区> ›」签（规格同星君「本宿星官 ›」）：
紫微大帝/勾陈大帝/斗姆元君/北斗星君 → 紫微垣（斗姆签面作「北斗（紫微垣）」），
南斗星君 → 斗宿。数据驱动字段 star_region（＋斗姆 star_region_label），
feed（content/deities.json）与包内（js/deities-data.js）两处同改。
太阳星君/太阴星君/太岁殷元帅无固定星区，不挂链（负断言）。

断言：
①版本四件套：SW wuri-v124 / CSS ?v=124 / me_ver 简繁带（内部 v124）/ 显示仍 v2.3.0。
②数据层：两文件 star_region 映射恰 5 位且一致；斗姆 label；三位不挂者无 star_region；
  星君 link_key 仍 28。
③真点击（390 日间）：图鉴 102 → 逐位点卡进详情 → 签在位、文案对、elementFromPoint
  命中签本体 → 真点签 → 区页打开且区名对 → 区页返回 → 详情在位且滚动保持 →
  详情返回 → 图鉴列表滚动恢复。
④回归：角木蛟仍「本宿星官 ›」且点开角宿区页；太阳/太岁详情无签。
⑤夜间紫微一链复跑；全程零 JS 异常。截图存 starlink124-shots/。
"""
import importlib.util, json, os, re, subprocess, sys, time, urllib.request, base64

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/starlink124-shots")
os.makedirs(SHOTS, exist_ok=True)
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- ① 版本口径 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v124 缓存名＋CSS ?v=124 在 SW 预缓存", "wuri-v124-20261025-v230" in sw and "style.css?v=124" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("CSS ?v=124＋index 静态版本行带内部号 v124", "css/style.css?v=124" in html and "戊日不上香 v2.3.0（内部 v124）" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简（内部 v124）＋繁（內部 v124）",
       "me_ver: '戊日不上香 v2.3.0（内部 v124）'" in i18n and "me_ver: '戊日不上香 v2.3.0（內部 v124）'" in i18n)
report("显示版本仍 v2.3.0（无漂移）", "v2.3.1" not in i18n and "v2.4.0" not in html)

# ---------- ② 数据层 ----------
EXPECT = {"ziwei": ("紫微垣", None), "gouchen": ("紫微垣", None),
          "doumu": ("紫微垣", "北斗（紫微垣）"), "beidou": ("紫微垣", None),
          "nandou": ("斗宿", None)}
feed = json.load(open(os.path.join(WWW, "content/deities.json"), encoding="utf-8"))
jsrc = open(os.path.join(WWW, "js/deities-data.js"), encoding="utf-8").read()
pack = json.loads(re.search(r"=\s*(\{.*\})\s*;?\s*$", jsrc, re.S).group(1))
for tag, d in (("feed", feed), ("包内", pack)):
    got = {x["id"]: (x.get("star_region"), x.get("star_region_label")) for x in d["deities"] if x.get("star_region")}
    report("%s star_region 映射恰 5 位且对" % tag, got == EXPECT, got)
    none3 = all(not x.get("star_region") for x in d["deities"] if x["id"] in ("taiyang", "taiyin", "taisui"))
    report("%s 太阳/太阴/太岁不挂链" % tag, none3)
    report("%s 星君 link_key 仍 28" % tag, sum(1 for x in d["deities"] if x.get("link_key")) == 28)

# ---------- 浏览器 ----------
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

    def mouse(x, y):
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
        cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})

    def locate(sel):
        ev("""(() => { const e = document.querySelector(%s);
          if (e) e.scrollIntoView({block:'center'}); return !!e; })()""" % json.dumps(sel), 0.35)
        return ev("""(() => { const e = document.querySelector(%s);
          if (!e) return null; const r = e.getBoundingClientRect();
          return {x: r.left + r.width/2, y: r.top + r.height/2}; })()""" % json.dumps(sel))

    def click_sel(sel):
        box = locate(sel)
        if not box: return False
        mouse(box["x"], box["y"]); return True

    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    time.sleep(2.5)

    # 进图鉴
    ev("document.getElementById('deities-entry-card').click(); true", 1.0)
    r = ev("document.querySelectorAll('#deities-groups .deity-card').length")
    report("图鉴列表 102 卡", r == 102, r)

    CASES = [("ziwei", "紫微大帝", "星图 · 紫微垣 ›", "紫微垣"),
             ("gouchen", "勾陈大帝", "星图 · 紫微垣 ›", "紫微垣"),
             ("doumu", "斗姆元君", "星图 · 北斗（紫微垣） ›", "紫微垣"),
             ("beidou", "北斗星君", "星图 · 紫微垣 ›", "紫微垣"),
             ("nandou", "南斗星君", "星图 · 斗宿 ›", "斗宿")]

    def one_case(did, name, label, region, tag):
        # 先定位落定再记滚动位：navOrigin 记的是点击瞬间（卡片居中后）的位置，
        # 返回恢复的正是它——断言以定位后的值作参照。
        cbox = locate('[data-deity="%s"]' % did)
        gscroll = ev("document.getElementById('view-deities').scrollTop")
        ok = bool(cbox)
        if cbox: mouse(cbox["x"], cbox["y"])
        time.sleep(0.9)
        r = ev("""(() => { const b = document.querySelector('#deity-star-link button');
          return { vis: !document.getElementById('view-deity-detail').hidden,
            name: (document.getElementById('deity-detail-name') || {}).textContent || '',
            label: b ? b.textContent : null }; })()""")
        report("%s 详情打开＋星图签文案" % tag, ok and r["vis"] and name in r["name"] and r["label"] == label, r)
        # 定位签（滚动入视）后记下详情滚动位，点签前后对账（返回滚动保持）
        box = locate('#deity-star-link button')
        top = ev("""(() => { const b = document.querySelector('#deity-star-link button');
          if (!b) return null; const r = b.getBoundingClientRect();
          const cx = r.left + r.width/2, cy = r.top + r.height/2;
          const hit = document.elementFromPoint(cx, cy);
          return {x: cx, y: cy, hit: !!hit && (hit === b || b.contains(hit)),
                  st: document.getElementById('view-deity-detail').scrollTop}; })()""")
        report("%s 签 elementFromPoint 命中本体" % tag, bool(top and top["hit"] and box), top)
        dst = top["st"] if top else -1
        if top: mouse(top["x"], top["y"])
        time.sleep(1.0)
        r = ev("""(() => ({ vis: !document.getElementById('view-star-region').hidden,
          txt: (document.getElementById('sx-region') || {}).textContent.slice(0, 80),
          svg: !!document.querySelector('#sx-region svg') }))()""")
        report("%s 点签落地区页 %s" % (tag, region), r["vis"] and region in r["txt"] and r["svg"], r)
        if did == "ziwei": shot("starlink-ziwei-region-390-day")
        ok = click_sel('#star-region-back'); time.sleep(0.7)
        r = ev("""(() => ({ reg: document.getElementById('view-star-region').hidden,
          det: !document.getElementById('view-deity-detail').hidden,
          st: document.getElementById('view-deity-detail').scrollTop }))()""")
        report("%s 区页返回→详情在位＋滚动保持" % tag, ok and r["reg"] and r["det"] and abs(r["st"] - dst) <= 2, (dst, r))
        ev("document.getElementById('deity-detail-back').click(); true", 0.6)
        r = ev("""(() => ({ vis: !document.getElementById('view-deities').hidden,
          st: document.getElementById('view-deities').scrollTop }))()""")
        report("%s 详情返回→图鉴滚动恢复" % tag, r["vis"] and abs(r["st"] - gscroll) <= 2, (gscroll, r))

    for c in CASES:
        one_case(*c, tag=c[1])

    # 负断言：太阳星君 / 太岁殷元帅无签
    for did, name in (("taiyang", "太阳星君"), ("taisui", "太岁殷元帅")):
        click_sel('[data-deity="%s"]' % did); time.sleep(0.9)
        r = ev("""(() => ({ name: (document.getElementById('deity-detail-name') || {}).textContent || '',
          btn: !!document.querySelector('#deity-star-link button'),
          html: (document.getElementById('deity-star-link') || {}).innerHTML }))()""")
        report("%s 详情无星图签（不硬挂）" % name, name in r["name"] and not r["btn"] and not r["html"], r)
        ev("document.getElementById('deity-detail-back').click(); true", 0.5)

    # 回归：角木蛟旧签
    click_sel('[data-deity="jiaomujiao"]'); time.sleep(0.9)
    r = ev("""(() => { const b = document.querySelector('#deity-star-link button');
      return { label: b ? b.textContent : null }; })()""")
    report("回归：角木蛟仍「本宿星官 ›」", r["label"] == "本宿星官 ›", r)
    click_sel('#deity-star-link button'); time.sleep(1.0)
    r = ev("""(() => ({ vis: !document.getElementById('view-star-region').hidden,
      txt: (document.getElementById('sx-region') || {}).textContent.slice(0, 60) }))()""")
    report("回归：角木蛟点签→角宿区页", r["vis"] and "角宿" in r["txt"], r)
    click_sel('#star-region-back'); time.sleep(0.6)
    ev("document.getElementById('deity-detail-back').click(); true", 0.5)

    # 夜间：紫微一链
    ev("document.documentElement.setAttribute('data-theme','night'); document.body.setAttribute('data-theme','night'); true", 0.3)
    one_case("ziwei", "紫微大帝", "星图 · 紫微垣 ›", "紫微垣", "夜间紫微大帝")
    shot("starlink-ziwei-390-night")

    errs = ev("window.__errs || []")
    report("全程零 JS 异常", errs == [], errs)
finally:
    chrome.terminate()

n_ok = sum(1 for _, ok in results if ok)
line = "TOTAL %d/%d" % (n_ok, len(results))
print(line)
open(os.path.join(SHOTS, "smoke-v2324-results.txt"), "w", encoding="utf-8").write(
    "\n".join(("PASS " if ok else "FAIL ") + n for n, ok in results) + "\n" + line + "\n")
sys.exit(0 if n_ok == len(results) else 1)
