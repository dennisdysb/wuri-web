#!/usr/bin/env python3
"""v1.3.9 (24) 六条修复冒烟：headless Chrome + 纯 stdlib CDP，file:// 直读。
复用 wuri-app/smoke-test.py 的 WS/CDP 客户端。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_lib", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
lib = importlib.util.module_from_spec(spec)
sys.modules["smoke_lib"] = lib
# 只借类定义，不跑它的 main：该文件 main 在 __main__ 守卫下，正常 import 安全
spec.loader.exec_module(lib)

WWW = os.path.expanduser("~/workspace/wuri-web/www")
PORT = lib.free_port()

def ws_connect(url):
    return lib.WS(url)

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
        cdp = lib.CDP(ws_connect(ws_url))
        cdp.call("Page.enable"); cdp.call("Runtime.enable")
        cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
        for _ in range(40):
            if cdp.evaluate("document.readyState") == "complete":
                break
            time.sleep(0.5)
        time.sleep(2.0)

        results = []
        def run(name, js):
            try:
                v = cdp.evaluate(js)
                ok = bool(v.get("ok")) if isinstance(v, dict) else bool(v)
                detail = "" if ok else " -> " + json.dumps(v, ensure_ascii=False)[:300]
                print(("PASS " if ok else "FAIL ") + name + detail)
                results.append(ok)
            except Exception as e:
                print("FAIL " + name + " -> EXC " + str(e)[:200])
                results.append(False)

        run("修1 图鉴首页数字=七十四（动态）", """(() => {
          const el = document.getElementById('deities-count-cn');
          const n = (window.DEITIES_DATA && window.DEITIES_DATA.deities) ? window.DEITIES_DATA.deities.length : -1;
          return { ok: !!el && el.textContent === '七十四' && n === 74, txt: el && el.textContent, n };
        })()""")

        run("修2 ICS 定时事件 07:30 + 三种提醒偏移", """(() => {
          const r = window.WuriICSGen.generate({ ming:true, anwu:true, baidou:true, chuyishiwu:true,
            shendan:true, gengshen:true, jiazi:true, bajie:true, sanyuan:true, wula:true,
            timings:['day1','today','custom:3'], remindTime:'07:30' });
          const t = r.text;
          return { ok: r.count > 200 && t.includes('T073000') && t.includes('T080000')
            && !t.includes('VALUE=DATE') && t.includes('TRIGGER:-P1D')
            && t.includes('TRIGGER:PT0S') && t.includes('TRIGGER:-P3D'), count: r.count };
        })()""")

        run("修2b ICS 默认时间回落 08:00", """(() => {
          const r = window.WuriICSGen.generate({ ming:true, timings:['today'] });
          return { ok: r.text.includes('T080000') && r.text.includes('T083000'), count: r.count };
        })()""")

        run("修4 JingTitleOf 返回经文名而非编号", """(() => {
          const t2 = window.JingTitleOf ? window.JingTitleOf('s02') : null;
          const t1 = window.JingTitleOf ? window.JingTitleOf('s01') : null;
          return { ok: !!t2 && t2 !== 's02' && !!t1 && t1 !== 's01', t1, t2 };
        })()""")

        run("修5 myday-label 不换行且宽 64px", """(() => {
          const el = document.querySelector('.myday-label');
          const cs = getComputedStyle(el);
          return { ok: cs.whiteSpace === 'nowrap' && cs.width === '64px', ws: cs.whiteSpace, w: cs.width };
        })()""")

        run("修6 to-top 按钮 bottom=118px", """(() => {
          const el = document.querySelector('.jing-back-fab.to-top');
          const cs = el ? getComputedStyle(el) : null;
          return { ok: !!cs && cs.bottom === '118px', b: cs && cs.bottom };
        })()""")

        run("修3 冥想背景图全部真实加载", """(() => {
          const imgs = Array.from(document.querySelectorAll('#med-bg-stack img'));
          const bad = imgs.filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.src.split('/').pop());
          return { ok: imgs.length === 10 && bad.length === 0, n: imgs.length, bad };
        })()""")

        run("版本显示 (24)", """(() => {
          const el = document.querySelector('[data-i18n="me_ver"]');
          return { ok: !!el && el.textContent.includes('（24）'), txt: el && el.textContent };
        })()""")

        exc = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
        print(("PASS " if not exc else "FAIL ") + "无未捕获 JS 异常" + ("" if not exc else " -> " + json.dumps(exc[0])[:300]))
        results.append(not exc)

        print("== %d/%d passed ==" % (sum(results), len(results)))
        return 0 if all(results) else 1
    finally:
        chrome.terminate()

if __name__ == "__main__":
    sys.exit(main())
