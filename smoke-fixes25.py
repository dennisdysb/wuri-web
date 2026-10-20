#!/usr/bin/env python3
"""v1.3.9 (25) 提醒时间行排版修复冒烟：标签不折行、说明独立一行、版本 (25)。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_lib", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
lib = importlib.util.module_from_spec(spec)
sys.modules["smoke_lib"] = lib
spec.loader.exec_module(lib)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
PORT = lib.free_port()

def main():
    chrome = subprocess.Popen([lib.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
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
        cdp = lib.CDP(lib.WS(ws_url))
        cdp.call("Page.enable"); cdp.call("Runtime.enable")
        # 模拟手机宽度（iPhone 逻辑宽 393）
        cdp.call("Emulation.setDeviceMetricsOverride",
                 {"width": 393, "height": 852, "deviceScaleFactor": 2, "mobile": True})
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
        for _ in range(40):
            if cdp.evaluate("document.readyState") == "complete":
                break
            time.sleep(0.5)
        time.sleep(1.5)
        # 先切到「提醒」页让表单可见，否则 rect 全为 0（隐藏元素量不到）
        cdp.evaluate("(() => { document.querySelector('[data-tab=\"tab-remind\"]').click(); return true; })()")
        time.sleep(0.8)

        results = []
        def run(name, js):
            try:
                v = cdp.evaluate(js)
                ok = bool(v.get("ok")) if isinstance(v, dict) else bool(v)
                print(("PASS " if ok else "FAIL ") + name + ("" if ok else " -> " + json.dumps(v, ensure_ascii=False)[:300]))
                results.append(ok)
            except Exception as e:
                print("FAIL " + name + " -> EXC " + str(e)[:200])
                results.append(False)

        run("提醒时间标签单行不折行", """(() => {
          const lab = document.querySelector('.ics-time-label');
          const cs = getComputedStyle(lab);
          const r = lab.getBoundingClientRect();
          return { ok: cs.whiteSpace === 'nowrap' && r.height < 30 && lab.textContent === '提醒时间',
                   h: r.height, w: r.width };
        })()""")

        run("时间行只含标签+输入框，间距≥10px", """(() => {
          const row = document.querySelector('.ics-time-row');
          const lab = row.querySelector('.ics-time-label').getBoundingClientRect();
          const inp = row.querySelector('#ics-remind-time').getBoundingClientRect();
          return { ok: row.children.length === 2 && (inp.left - lab.right) >= 10,
                   gap: Math.round(inp.left - lab.right) };
        })()""")

        run("说明文字是独立 hint 行", """(() => {
          const row = document.querySelector('.ics-time-row');
          const p = row.nextElementSibling;
          return { ok: !!p && p.tagName === 'P' && p.classList.contains('hint')
                   && p.textContent.includes('事件建在当天这个时间'), tag: p && p.tagName };
        })()""")

        run("ICS 生成仍带时刻（回归）", """(() => {
          const inp = document.getElementById('ics-remind-time');
          const r = window.WuriICSGen.generate({ ming:true, timings:['today'], remindTime: inp.value || '08:00' });
          return { ok: r.text.includes('T080000') && !r.text.includes('VALUE=DATE'), count: r.count };
        })()""")

        run("版本显示 (25)", """(() => {
          const el = document.querySelector('[data-i18n="me_ver"]');
          return { ok: !!el && el.textContent.includes('（25）'), txt: el && el.textContent };
        })()""")

        print("== %d/%d passed ==" % (sum(results), len(results)))
        return 0 if all(results) else 1
    finally:
        chrome.terminate()

if __name__ == "__main__":
    sys.exit(main())
