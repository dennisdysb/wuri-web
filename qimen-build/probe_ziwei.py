#!/usr/bin/env python3
"""紫微宫名量测（②）：390px 下找含「交友」宫格，量宫名行是否单行、格内各行是否被挤压，
并截全盘图（双主题）留档；点该宫查详情头古名注。"""
import importlib.util, json, os, subprocess, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port
WWW = os.path.expanduser("~/workspace/wuri-web/www")
URL = "file://" + WWW + "/index.html"
OUT = os.path.expanduser("~/workspace/wuri-web/qimen-build/shots-zw")
os.makedirs(OUT, exist_ok=True)

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
        cdp = CDP(WS(ws_url))
        cdp.call("Page.enable"); cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        cdp.call("Page.addScriptToEvaluateOnNewDocument",
                 {"source": "try { localStorage.setItem('wuri_pro_redeem','1'); } catch(e) {}"})
        cdp.call("Page.navigate", {"url": URL})
        time.sleep(3.5)
        ev = lambda expr: cdp.evaluate(expr)

        def shot(name):
            r = cdp.call("Page.captureScreenshot", {"format": "png"})
            import base64
            open(os.path.join(OUT, name + ".png"), "wb").write(base64.b64decode(r["data"]))

        ev("document.getElementById('ziwei-enter').click(); 'ok'"); time.sleep(1.0)
        ev("document.getElementById('zw-date').value='1990-01-01'; document.getElementById('zw-time').value='23:30'; 'ok'")
        ev("document.getElementById('zw-go').click(); 'ok'")
        time.sleep(1.6)
        for theme in ("day", "night"):
            ev(f"document.documentElement.setAttribute('data-theme','{theme}'); 'ok'"); time.sleep(0.5)
            m = ev("""(() => {
              const cells = [...document.querySelectorAll('.zw-cell')];
              const target = cells.find(c => { const n = c.querySelector('.zw-pname-pro'); return n && n.textContent.includes('交友'); });
              if (!target) return { found: false, names: cells.map(c => { const n = c.querySelector('.zw-pname-pro'); return n ? n.textContent : '?'; }) };
              const nm = target.querySelector('.zw-pname-pro');
              const nr = nm.getBoundingClientRect(), cr = target.getBoundingClientRect();
              const range = document.createRange(); range.selectNodeContents(nm);
              const lines = range.getClientRects().length;
              const rows = [...target.children].map(ch => ({ cls: ch.className, h: +ch.getBoundingClientRect().height.toFixed(1),
                                                             w: +ch.getBoundingClientRect().width.toFixed(1) }));
              const old = nm.querySelector('.zw-pname-old');
              return { found: true, text: nm.textContent, lines, nameW: +nr.width.toFixed(1), cellW: +cr.width.toFixed(1),
                       cellH: +cr.height.toFixed(1), oldFs: old ? getComputedStyle(old).fontSize : null, rows,
                       scrollW: target.scrollWidth, clientW: target.clientWidth };
            })()""")
            print(theme, json.dumps(m, ensure_ascii=False))
            ev("document.getElementById('view-ziwei').scrollTop = 0; 'ok'"); time.sleep(0.3)
            shot(f"{theme}-ziwei")
            if theme == "day":
                ev("""(() => { const cells = [...document.querySelectorAll('.zw-cell')];
                  const t = cells.find(c => { const n = c.querySelector('.zw-pname-pro'); return n && n.textContent.includes('交友'); });
                  if (t) t.click(); return 'ok'; })()""")
                time.sleep(0.6)
                head = ev("document.getElementById('zw-pal-info').textContent.slice(0, 60)")
                print("palace detail head:", head)
                shot("day-ziwei-detail")
        errs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
        print("JS exceptions:", len(errs))
    finally:
        chrome.terminate()

if __name__ == "__main__":
    main()
