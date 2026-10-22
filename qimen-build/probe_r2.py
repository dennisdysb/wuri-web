#!/usr/bin/env python3
"""第二轮反馈探针：几何/空白/动画实测（只读，不改代码）。390x844 双主题。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port
WWW = os.path.expanduser("~/workspace/wuri-web/www")
URL = "file://" + WWW + "/index.html"

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
        cdp.call("Page.enable"); cdp.call("Runtime.enable"); cdp.call("Log.enable")
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        cdp.call("Page.addScriptToEvaluateOnNewDocument",
                 {"source": "try { localStorage.setItem('wuri_pro_redeem','1'); localStorage.removeItem('qm_lite'); } catch(e) {}"})
        cdp.call("Page.navigate", {"url": URL})
        time.sleep(3.5)
        ev = lambda expr: cdp.evaluate(expr)
        for _ in range(20):
            n = ev("document.querySelectorAll('#qm-wenGrid .wen-item').length")
            if n and n > 0: break
            time.sleep(0.5)
        ev("document.getElementById('qimen-enter').click(); 'ok'"); time.sleep(1.0)
        ev("document.querySelector('#qm-root .tabbtn[data-t=\"pan\"]').click(); 'ok'"); time.sleep(0.8)
        ev("document.getElementById('qm-dt').value='2024-12-25T14:00'; document.getElementById('qm-btnCast').click(); 'ok'")
        time.sleep(1.2)

        def probe(theme):
            ev(f"document.documentElement.setAttribute('data-theme','{theme}'); 'ok'"); time.sleep(0.5)
            r = ev("""(() => {
              const R = el => { if (!el) return null; const b = el.getBoundingClientRect();
                return {x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1),
                        top:+b.top.toFixed(1), bottom:+b.bottom.toFixed(1)}; };
              const root = document.getElementById('qm-root');
              const out = { theme: document.documentElement.getAttribute('data-theme'),
                rootCls: root.className, motion: root.getAttribute('data-motion'),
                sizhu: null, cells: [], gapPan: null, anim: {} };
              const sz = document.getElementById('qm-sizhu');
              const szcs = getComputedStyle(sz);
              out.sizhu = { rect: R(sz), fontSize: szcs.fontSize, letterSpacing: szcs.letterSpacing,
                            lineHeight: szcs.lineHeight, text: sz.textContent };
              document.querySelectorAll('#qm-grid .cell').forEach(c => {
                const f = c.querySelector('.cell-face');
                const door = f.querySelector('.door'), god = f.querySelector('.god');
                const b0 = f.querySelector('.badge.b0');
                const dcs = getComputedStyle(door);
                const range = document.createRange(); range.selectNodeContents(door);
                out.cells.push({ p: c.dataset.p, cell: R(c), face: R(f), door: R(door),
                  doorText: door.textContent, doorRects: range.getClientRects().length,
                  doorFont: dcs.fontSize, doorLH: dcs.lineHeight,
                  god: R(god), godText: god.textContent, badge0: R(b0), badge0Text: b0.textContent,
                  badge0Font: getComputedStyle(b0).fontSize });
              });
              // 空白：brief 最后一张卡底 -> disc-foot 卡顶（同一滚动坐标系，用 offset 累加）
              const view = document.getElementById('view-qimen');
              const brief = document.getElementById('qm-brief');
              const lastCard = brief.lastElementChild;
              const discCard = view.querySelector('details.disc-foot').closest('section');
              const tp = document.getElementById('qm-tab-pan');
              out.gapPan = { briefBottom: lastCard ? lastCard.getBoundingClientRect().bottom : null,
                discTop: discCard.getBoundingClientRect().top,
                gap: lastCard ? +(discCard.getBoundingClientRect().top - lastCard.getBoundingClientRect().bottom).toFixed(1) : null,
                tabpagePadB: getComputedStyle(tp).paddingBottom,
                scopePadB: getComputedStyle(root).paddingBottom,
                discCardMarginTop: getComputedStyle(discCard).marginTop };
              // 动画
              const wash = root.querySelector('.sky-wash');
              const wcs = getComputedStyle(wash);
              const plateInner = root.querySelector('.plate-inner');
              const sky = document.getElementById('qm-sky');
              let skyVar = null;
              try { const ctx = sky.getContext('2d'); const d = ctx.getImageData(0,0,Math.min(390,sky.width),Math.min(300,sky.height)).data;
                let s = new Set(); for (let i=3;i<d.length;i+=997) s.add(d[i-3]+','+d[i]); skyVar = s.size; } catch(e) { skyVar = 'err:'+e.message; }
              out.anim = { washName: wcs.animationName, washDur: wcs.animationDuration,
                washPlay: wcs.animationPlayState, washTransform: wcs.transform,
                plateTransform: getComputedStyle(plateInner).transform,
                plateRxVar: getComputedStyle(root).getPropertyValue('--rx'),
                skySize: [sky.width, sky.height], skyUniqueSample: skyVar,
                skyDisplay: getComputedStyle(sky).display };
              return out; })()""")
            # wash transform 采样两次（间隔 2.4s）看漂移
            t1 = ev("getComputedStyle(document.querySelector('#qm-root .sky-wash')).transform")
            time.sleep(2.4)
            t2 = ev("getComputedStyle(document.querySelector('#qm-root .sky-wash')).transform")
            r["anim"]["washT1"] = t1; r["anim"]["washT2"] = t2; r["anim"]["washMoved"] = (t1 != t2)
            print(json.dumps(r, ensure_ascii=False, indent=1))

        probe("day")
        probe("night")
        errs = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
        print("JS exceptions:", len(errs))
    finally:
        chrome.terminate()

if __name__ == "__main__":
    main()
