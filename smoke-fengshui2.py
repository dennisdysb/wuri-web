#!/usr/bin/env python3
"""风水第二批真点击冒烟：八宅＋玄空飞星。
覆盖：非 Pro 门控（卡点击弹墙/页内直达拦截）、Pro 全流程、金标准盘面断言
（1992 男艮命西四、坎宅巽生气、八运子山午向双星到向＋七星真打劫）、
档案联动（换档案重进出新盘）、流年/流月视图、三态截图＋红光 computed 检查。
用法：python3 smoke-fengshui2.py [www目录]   结果与截图落 fs2-shots/。"""
import base64, importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location(
    "smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

HERE = os.path.dirname(os.path.abspath(__file__))
WWW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "www")
SHOTS = os.path.join(HERE, "fs2-shots")
os.makedirs(SHOTS, exist_ok=True)
RESULTS = []

def note(name, ok, extra=""):
    RESULTS.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))

def main():
    port = base.free_port()
    prof = "/tmp/fs2smoke-%d" % port
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen(
        [base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
         "--allow-file-access-from-files",
         "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
         "--window-size=500,1000", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    try:
        wsurl = None
        for _ in range(40):
            try:
                tg = json.load(urllib.request.urlopen(
                    "http://127.0.0.1:%d/json" % port, timeout=3))
                pg = [t for t in tg if t.get("type") == "page"]
                if pg:
                    wsurl = pg[0]["webSocketDebuggerUrl"]; break
            except Exception:
                pass
            time.sleep(0.5)
        c = base.CDP(base.ws_connect(wsurl))
        c.call("Page.enable"); c.call("Runtime.enable")
        c.call("Emulation.setDeviceMetricsOverride",
               {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})
        c.call("Page.addScriptToEvaluateOnNewDocument", {"source":
            "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e.error))});"})
        c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
        time.sleep(3.5)

        def ev(expr):
            r = c.call("Runtime.evaluate",
                       {"expression": expr, "returnByValue": True, "awaitPromise": True})
            if r.get("exceptionDetails"):
                raise RuntimeError(str(r["exceptionDetails"])[:300])
            return r["result"].get("value")

        def click_at(sel):
            info = ev("""(() => { const el = document.querySelector(%s);
              if (!el) return null;
              el.scrollIntoView({block:'center'});
              const r = el.getBoundingClientRect();
              const cx = r.left + r.width/2, cy = r.top + r.height/2;
              const top = document.elementFromPoint(cx, cy);
              return {x: cx, y: cy, ok: !!(top && (top === el || el.contains(top)))};
            })()""" % json.dumps(sel))
            assert info and info["ok"], "elementFromPoint 断言失败: " + sel
            c.call("Input.dispatchMouseEvent",
                   {"type": "mousePressed", "x": info["x"], "y": info["y"],
                    "button": "left", "clickCount": 1})
            c.call("Input.dispatchMouseEvent",
                   {"type": "mouseReleased", "x": info["x"], "y": info["y"],
                    "button": "left", "clickCount": 1})
            time.sleep(0.45)

        def visible(sel):
            return ev("(() => { const el = document.querySelector(%s);"
                      " if (!el) return false; const r = el.getBoundingClientRect();"
                      " const cs = getComputedStyle(el);"
                      " return !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden'"
                      "        && r.width > 0 && r.height > 0; })()" % json.dumps(sel))

        def shot(name):
            r = c.call("Page.captureScreenshot", {"format": "png"})
            open(os.path.join(SHOTS, name), "wb").write(base64.b64decode(r["data"]))
            print("shot:", name)

        for _ in range(30):
            if ev("!!(window.WuriPro && window.__wuriFs2 && document.getElementById('fengshui-entry-card'))"):
                break
            time.sleep(0.5)
        # ---------- 非 Pro 门控 ----------
        note("初始非 Pro", ev("window.WuriPro && !WuriPro.isPro()") is True)
        click_at("#fengshui-entry-card")
        note("专页打开", visible("#view-fengshui"))
        click_at("#fs-card-bazhai")
        note("非Pro 点八宅卡弹付费墙", visible("#paywall"))
        note("非Pro 八宅页未打开", not visible("#view-bazhai"))
        click_at('#paywall [data-pro-act="close"]')
        click_at("#fs-card-xuankong")
        note("非Pro 点飞星卡弹付费墙", visible("#paywall"))
        note("非Pro 飞星页未打开", not visible("#view-xuankong"))
        click_at('#paywall [data-pro-act="close"]')
        ev("window.__wuriFs2.openBazhai()")
        note("非Pro 直达 openBazhai 被拦", (not visible("#view-bazhai")) and visible("#paywall"))
        click_at('#paywall [data-pro-act="close"]')
        ev("localStorage.setItem('wuri_pro_redeem','1')")
        note("置 Pro 标记", ev("WuriPro.isPro()") is True)

        # ---------- 八宅（Pro） ----------
        click_at("#fs-card-bazhai")
        note("Pro 八宅页打开", visible("#view-bazhai"))
        note("无档案提示可见", visible("#fs2-bz-noarch"))
        ev("(() => { const y = document.getElementById('fs2-bz-year');"
           " y.value = '1992'; y.dispatchEvent(new Event('change', {bubbles:true})); })()")
        time.sleep(0.3)
        summ = ev("document.getElementById('fs2-bz-summary').innerText")
        note("1992 男 → 艮命西四", ("艮" in summ and "西四" in summ),
             summ.replace("\n", " / ")[:80])
        cells = ev("(() => Array.from(document.querySelectorAll('#fs2-bz-grid .fs2-cell'))"
                   ".map(c => c.innerText.replace(/\\n/g,'|')))()")
        note("八宅九宫 9 格", len(cells) == 9, str(len(cells)))
        xun = [x for x in cells if "巽" in x]
        note("坐子坎宅：巽宫生气", bool(xun) and "生气" in xun[0], xun[0] if xun else "")
        lst = ev("document.querySelectorAll('#fs2-bz-list .fs2-li').length")
        note("游年列表 8 条", lst == 8, str(lst))
        click_at('#fs2-bz-viewseg [data-v="life"]')
        cells2 = ev("(() => Array.from(document.querySelectorAll('#fs2-bz-grid .fs2-cell'))"
                    ".map(c => c.innerText.replace(/\\n/g,'|')))()")
        zhen = [x for x in cells2 if "震" in x]
        note("切命卦游年盘重排", bool(zhen) and cells2 != cells, zhen[0] if zhen else "")
        shot("bz-day.png")

        # 去罗盘量入口
        click_at("#fs2-bz-measure")
        note("页内入口进罗盘", visible("#view-compass"))
        click_at("#fs-compass-back")
        note("回专页", visible("#view-fengshui") and not visible("#view-compass"))

        # ---------- 玄空飞星（Pro） ----------
        click_at("#fs-card-xuankong")
        note("Pro 飞星页打开", visible("#view-xuankong"))
        ev("(() => { const y = document.getElementById('fs2-xk-year');"
           " y.value = '2010'; y.dispatchEvent(new Event('change', {bubbles:true})); })()")
        time.sleep(0.3)
        head = ev("document.getElementById('fs2-xk-head').innerText")
        note("子山午向 · 双星到向", ("子山午向" in head and "双星到向" in head), head)
        xcells = ev("(() => Array.from(document.querySelectorAll('#fs2-xk-grid .fs2-xcell'))"
                    ".map(c => c.innerText.replace(/\\n/g,'|')))()")
        li = [x for x in xcells if "离" in x]
        note("离宫山8向8", bool(li) and "山8" in li[0] and "向8" in li[0],
             li[0] if li else "")
        combos = ev("document.getElementById('fs2-xk-combos').innerText")
        note("格局含七星真打劫", "七星真打劫" in combos,
             combos.replace("\n", " / ")[:90])
        shot("xk-day.png")
        click_at('#fs2-xk-tabs [data-v="annual"]')
        headA = ev("document.getElementById('fs2-xk-head').innerText")
        ctr = ev("(() => { const el = document.querySelector('#fs2-xk-grid .fs2-tcell.center .fs2-cell-big');"
                 " return el ? el.textContent : ''; })()")
        expect = ev("String(WuriSoulFs.annualFlyingStarCenter(2026))")
        note("流年视图", ("流年飞星" in headA and ctr == expect),
             headA + " ctr=" + str(ctr))
        click_at('#fs2-xk-tabs [data-v="monthly"]')
        headM = ev("document.getElementById('fs2-xk-head').innerText")
        note("流月视图", "流月飞星" in headM, headM)
        click_at('#fs2-xk-tabs [data-v="natal"]')

        # ---------- 档案联动 ----------
        ev("localStorage.setItem('wuri_fs_house_v1', JSON.stringify("
           "{facingDeg:180,facing:'午',sitting:'午',ts:Date.now()}))")
        click_at("#fs-xuankong-back")
        click_at("#fs-card-xuankong")
        head2 = ev("document.getElementById('fs2-xk-head').innerText")
        note("档案 sit=午 → 午山子向盘", "午山子向" in head2, head2)
        note("有档案时提示隐藏", not visible("#fs2-xk-noarch"))
        click_at("#fs-xuankong-back")
        click_at("#fs-card-bazhai")
        sel = ev("document.getElementById('fs2-bz-sitting').value")
        note("八宅坐向同步为午", sel == "午", sel)
        click_at("#fs-bazhai-back")

        # ---------- 三态 ----------
        click_at("#fs-card-bazhai")
        ev("document.documentElement.setAttribute('data-theme','night')")
        time.sleep(0.3); shot("bz-night.png")
        ev("document.body.classList.add('sky-red')")
        time.sleep(0.3); shot("bz-red.png")
        comp = ev("(() => { const cell = document.querySelector('#fs2-bz-grid .fs2-cell.good .fs2-cell-star');"
                  " return {star: getComputedStyle(cell).color}; })()")
        note("红光 computed：吉星色随变量变红",
             comp["star"] == "rgb(194, 67, 42)", str(comp))  # --gold-deep 红光覆写 #c2432a
        ev("document.body.classList.remove('sky-red');"
           "document.documentElement.setAttribute('data-theme','day')")

        errs = ev("window.__errs || []")
        note("全程无 JS 错误", len(errs) == 0, "; ".join(errs[:3]))
    finally:
        proc.terminate()

    fails = [r for r in RESULTS if not r[1]]
    with open(os.path.join(SHOTS, "smoke-result.txt"), "w") as f:
        for n, ok, x in RESULTS:
            f.write(("PASS " if ok else "FAIL ") + n + ((" | " + str(x)) if x else "") + "\n")
        f.write("\n%d/%d PASS\n" % (len(RESULTS) - len(fails), len(RESULTS)))
    print("\n%d/%d PASS" % (len(RESULTS) - len(fails), len(RESULTS)))
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
