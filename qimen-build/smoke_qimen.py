#!/usr/bin/env python3
"""奇门上线冒烟：CDP + file://，390x844。
查：付费墙门控 / 问事流程 / 指定时刻排盘锚点 / 盘面可见性 / 3D / 弹窗 / 横向溢出 /
    全站主要页面回归 / JS 异常。截图存 qimen-build/shots/。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port

WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/qimen-build/shots")
os.makedirs(SHOTS, exist_ok=True)
URL = "file://" + WWW + "/index.html"
FAILS = []
def check(name, cond, extra=""):
    print(("✓ " if cond else "✗ ") + name + ((" | " + str(extra)[:160]) if extra else ""))
    if not cond: FAILS.append(name)

def main():
    port = free_port()
    chrome = subprocess.Popen(["/opt/meta-chromium/chrome", "--headless=old", "--no-sandbox", "--disable-gpu",
        "--allow-file-access-from-files", f"--remote-debugging-port={port}",
        "--remote-debugging-address=127.0.0.1", "--window-size=390,844", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        for _ in range(50):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2) as r:
                    pages = json.loads(r.read())
                ws_url = pages[0]["webSocketDebuggerUrl"]; break
            except Exception:
                time.sleep(0.4)
        assert ws_url, "CDP 未就绪"
        cdp = CDP(WS(ws_url))
        cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        cdp.call("Page.navigate", {"url": URL})
        time.sleep(3.5)
        ev = lambda expr: cdp.evaluate(expr)

        # 收集页面异常
        def page_errors():
            errs = []
            for e in cdp.events:
                m = e.get("method", "")
                if m == "Runtime.exceptionThrown":
                    errs.append("exc: " + json.dumps(e["params"].get("exceptionDetails", {}))[:200])
                elif m == "Log.entryAdded" and e["params"]["entry"].get("level") == "error":
                    errs.append("log: " + e["params"]["entry"].get("text", "")[:200])
                elif m == "Runtime.consoleAPICalled" and e["params"].get("type") == "error":
                    errs.append("console: " + json.dumps(e["params"].get("args", []))[:200])
            return errs

        def shot(name):
            r = cdp.call("Page.captureScreenshot", {"format": "png"})
            import base64
            with open(os.path.join(SHOTS, name), "wb") as f:
                f.write(base64.b64decode(r["data"]))
            print("  截图:", name)

        # —— 入口卡可见（v1.4.0 封版批新路径：首页「术数排盘」卡 → 子页奇门块；
        #    旧 enter 钮按设计隐藏保留，下方付费墙/开盘仍以程序化 click 直达） ——
        r = ev("""(() => { const c = document.getElementById('shushu-entry-card');
          const rc = c.getBoundingClientRect();
          return { w: rc.width, h: rc.height, vis: rc.width > 0 && rc.height > 0 }; })()""")
        check("首页术数排盘入口卡可见", r["vis"], r)
        ev("document.getElementById('shushu-entry-card').click(); 'ok'")
        time.sleep(0.5)
        r = ev("""(() => { const c = document.getElementById('ss-qimen');
          const rc = c.getBoundingClientRect();
          return { open: !document.getElementById('view-shushu').hidden,
                   vis: rc.width > 0 && rc.height > 0 }; })()""")
        check("术数子页内奇门块可见", r["open"] and r["vis"], r)
        ev("document.getElementById('shushu-back').click(); 'ok'")
        time.sleep(0.3)

        # —— 未激活点入口 → 付费墙 ——
        ev("localStorage.removeItem('wuri_pro_redeem'); document.getElementById('qimen-enter').click(); 'ok'")
        time.sleep(0.6)
        r = ev("""(() => { const l = document.getElementById('paywall');
          const rc = l.getBoundingClientRect();
          return { hidden: document.getElementById('view-qimen').hidden,
                   lockShown: l.classList.contains('show') && rc.height > 0,
                   lockText: l.textContent.includes('奇门遁甲排盘') }; })()""")
        check("未激活弹付费墙（视图未打开）", r["lockShown"] and r["hidden"], r)
        check("付费墙清单含奇门一条", r["lockText"], r)
        shot("01-paywall.png")
        ev("document.getElementById('paywall').classList.remove('show'); 'ok'")

        # —— 激活后进入（pro 状态有内存缓存，走真实路径：新文档注入标记后重载） ——
        cdp.call("Page.addScriptToEvaluateOnNewDocument",
                 {"source": "try { localStorage.setItem('wuri_pro_redeem','1'); } catch(e) {}"})
        cdp.call("Page.navigate", {"url": URL})
        time.sleep(3.0)
        ev("document.getElementById('qimen-enter').click(); 'ok'")
        time.sleep(1.2)
        r = ev("""(() => { const v = document.getElementById('view-qimen');
          return { open: !v.hidden, wenCards: document.querySelectorAll('#qm-wenGrid .wen-item').length,
                   rootBg: getComputedStyle(document.getElementById('qm-root')).backgroundColor }; })()""")
        check("激活后奇门视图打开、问事卡渲染", r["open"] and r["wenCards"] >= 6, r)
        shot("02-qimen-wen.png")

        # —— 问事流程 ——
        ev("document.querySelector('#qm-wenGrid .wen-item').click(); 'ok'")
        time.sleep(0.8)
        r = ev("""(() => { const w = document.getElementById('qm-wenResult');
          const card = w.querySelector('.wen-card');
          const rc = card ? card.getBoundingClientRect() : { height: 0 };
          return { hasCard: !!card, h: rc.height, txt: w.textContent.slice(0, 60) }; })()""")
        check("问事出结论卡（真实可见）", r["hasCard"] and r["h"] > 40, r)
        shot("03-qimen-wen-result.png")

        # —— 排盘锚点：2024-12-25 14:00 ——
        ev("""document.querySelector('#qm-root .tabbtn[data-t="pan"]').click();
              document.getElementById('qm-dt').value = '2024-12-25T14:00';
              document.getElementById('qm-btnCast').click(); 'ok'""")
        time.sleep(1.0)
        r = ev("""(() => { const sz = document.getElementById('qm-sizhu').textContent;
          document.getElementById('qm-metaToggle').click();
          const mp = document.getElementById('qm-metaPro').textContent;
          const cells = [...document.querySelectorAll('#qm-grid .cell')];
          const visCells = cells.filter(c => { const x = c.getBoundingClientRect(); return x.width > 30 && x.height > 30; }).length;
          const t = getComputedStyle(document.querySelector('.plate-inner')).transform;
          return { sizhu: sz, meta: mp.slice(0, 200), cells: cells.length, visCells, transform: t,
                   overflow: document.documentElement.scrollWidth }; })()""")
        check("四柱含癸亥（lunar 口径）", "癸亥" in r["sizhu"], r["sizhu"][:80])
        check("专业信息含阳遁4局/天英/景门", all(k in r["meta"] for k in ["阳遁4局", "天英", "景门"]), r["meta"][:120])
        check("九宫格 9 格真实可见", r["cells"] == 9 and r["visCells"] == 9, r)
        check("3D 盘 transform 含 matrix3d", "matrix3d" in r["transform"], r["transform"][:60])
        check("390 宽无横向溢出", r["overflow"] <= 391, r["overflow"])
        shot("04-qimen-pan.png")

        # —— 点宫格弹窗 ——
        ev("document.querySelector('#qm-grid .cell').click(); 'ok'")
        time.sleep(0.6)
        r = ev("""(() => { const m = document.getElementById('qm-modal');
          return { open: getComputedStyle(m).display === 'flex', txt: m.querySelector('.sheet').textContent.slice(0, 40) }; })()""")
        check("点宫格弹详解", r["open"] and len(r["txt"]) > 5, r)
        shot("05-qimen-modal.png")
        ev("document.getElementById('qm-modal').classList.remove('on'); 'ok'")

        # —— 返回 ——
        ev("document.getElementById('qimen-back').click(); 'ok'")
        time.sleep(0.5)
        r = ev("({ qmHidden: document.getElementById('view-qimen').hidden, home: !document.getElementById('tab-home').hidden })")
        check("返回键回首页", r["qmHidden"] and r["home"], r)

        # —— 全站回归 ——
        for vid, open_expr, probe in [
            ("八字", "document.getElementById('bazi-enter').click()",
             "!!document.querySelector('#bazi-view .bazi-grid') || document.getElementById('bazi-view').offsetHeight > 100"),
            ("紫微", "document.getElementById('ziwei-enter').click()",
             "document.querySelectorAll('#zw-grid .zw-cell').length === 12 || document.getElementById('view-ziwei').offsetHeight > 100"),
            ("六爻", "document.getElementById('liuyao-enter').click()",
             "document.getElementById('view-liuyao').offsetHeight > 100"),
        ]:
            ev(open_expr + "; 'ok'"); time.sleep(1.0)
            ok = ev("(() => { try { return !!(" + probe + "); } catch(e) { return 'ERR ' + e.message; } })()")
            check(f"回归-{vid}页可打开渲染", ok is True, ok)
            ev("""document.querySelectorAll('.view').forEach(v => v.hidden = true);
                  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                  document.getElementById('tab-home').classList.add('active'); 'ok'""")
            time.sleep(0.3)
        ev("document.querySelector('[data-tab=\"tab-jing\"]').click(); 'ok'"); time.sleep(1.0)
        ok = ev("document.querySelectorAll('#jing-list .jing-item, #jing-list > *').length > 0")
        check("回归-经文列表", ok is True, ok)
        ev("document.getElementById('deities-enter').click(); 'ok'"); time.sleep(1.2)
        ok = ev("document.querySelectorAll('#deity-grid > *, .deity-grid > *').length > 10")
        check("回归-图鉴网格", ok is True, ok)
        ev("document.querySelector('[data-tab=\"tab-me\"]').click(); 'ok'"); time.sleep(0.8)
        r = ev("""(() => { const t = document.body.textContent;
          return { ver: t.includes('戊日不上香 v'), ack: t.includes('掌上乾坤') }; })()""")
        check("我的页版本号与鸣谢行", r["ver"] and r["ack"], r)
        shot("06-me-ack.png")

        errs = page_errors()
        check("全程无 JS 异常/控制台 error", len(errs) == 0, errs[:3])
        print("\n冒烟结论:", "全过" if not FAILS else f"失败 {len(FAILS)}: {FAILS}")
        return 1 if FAILS else 0
    finally:
        chrome.terminate()

if __name__ == "__main__":
    sys.exit(main())
