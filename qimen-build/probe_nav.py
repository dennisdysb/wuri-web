#!/usr/bin/env python3
"""奇门底栏几何探针：在 360/390/412/432 四档宽度量 nav 各子项的框与文字范围。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port
URL = "file://" + os.path.expanduser("~/workspace/wuri-web/www") + "/index.html"

MEASURE = """(() => {
  const nav = document.querySelector('.qm-scope nav');
  if (!nav) return null;
  const items = [...nav.children].map(el => {
    const r = el.getBoundingClientRect();
    let tr = null;
    const node = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (node) { const rg = document.createRange(); rg.selectNodeContents(node); tr = rg.getBoundingClientRect(); }
    return { label: el.textContent.trim(), x: +r.left.toFixed(1), w: +r.width.toFixed(1),
             tx: tr ? +tr.left.toFixed(1) : null, tw: tr ? +tr.width.toFixed(1) : null,
             ml: getComputedStyle(el).marginLeft, flex: getComputedStyle(el).flex };
  });
  const gaps = [], tgaps = [];
  for (let i = 0; i + 1 < items.length; i++) {
    gaps.push(+(items[i+1].x - (items[i].x + items[i].w)).toFixed(1));
    if (items[i].tx != null && items[i+1].tx != null)
      tgaps.push(+(items[i+1].tx - (items[i].tx + items[i].tw)).toFixed(1));
  }
  const centers = items.map(it => +(it.x + it.w / 2).toFixed(1));
  const csteps = [];
  for (let i = 0; i + 1 < centers.length; i++) csteps.push(+(centers[i+1] - centers[i]).toFixed(1));
  return { navW: +nav.getBoundingClientRect().width.toFixed(1), items, gaps, tgaps, centers, csteps };
})()"""

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
        cdp.call("Page.addScriptToEvaluateOnNewDocument",
                 {"source": "try { localStorage.setItem('wuri_pro_redeem','1'); } catch(e) {}"})
        cdp.call("Page.navigate", {"url": URL})
        time.sleep(3.5)
        for _ in range(20):
            n = cdp.evaluate("document.querySelectorAll('#qm-wenGrid .wen-item').length")
            if n and n > 0: break
            time.sleep(0.5)
        cdp.evaluate("document.getElementById('qimen-enter').click(); 'ok'")
        time.sleep(1.2)
        for w in (360, 390, 412, 432):
            cdp.call("Emulation.setDeviceMetricsOverride",
                     {"width": w, "height": 844, "deviceScaleFactor": 2, "mobile": True})
            time.sleep(0.5)
            m = cdp.evaluate(MEASURE)
            print(f"== width {w} ==")
            print(json.dumps(m, ensure_ascii=False))
    finally:
        chrome.terminate()

if __name__ == "__main__":
    main()
