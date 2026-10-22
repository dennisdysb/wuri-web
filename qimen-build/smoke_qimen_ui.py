#!/usr/bin/env python3
"""奇门 UI 修复批冒烟（2026-10-22）：CDP + file://，390x844。
查：①流派对照「对照维度」标签单行 ②奇门跟随全站亮/暗主题（变量值/视图底色/导航选中色/FAB）
    ③底部导航戊日风格 ④起盘锚点与 (38) 一致 ⑤免责声明页（我的→关于）双主题
    ⑥四工具页脚折叠块 ⑦奇门关于方法页精简版 ⑧零横向溢出/零 JS 异常/全站回归。
截图存 qimen-build/shots-ui/。"""
import importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
CDP, WS, free_port = smoke.CDP, smoke.WS, smoke.free_port

WWW = os.path.expanduser("~/workspace/wuri-web/www")
SHOTS = os.path.expanduser("~/workspace/wuri-web/qimen-build/shots-ui")
os.makedirs(SHOTS, exist_ok=True)
URL = "file://" + WWW + "/index.html"
FAILS = []
def check(name, cond, extra=""):
    print(("✓ " if cond else "✗ ") + name + ((" | " + str(extra)[:170]) if extra else ""))
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
        cdp.call("Page.addScriptToEvaluateOnNewDocument",
                 {"source": "try { localStorage.setItem('wuri_pro_redeem','1'); } catch(e) {}"})
        cdp.call("Page.navigate", {"url": URL})
        time.sleep(3.5)
        ev = lambda expr: cdp.evaluate(expr)

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

        def set_theme(t):
            ev(f"document.documentElement.setAttribute('data-theme','{t}'); 'ok'")
            time.sleep(0.4)

        LABEL_JS = """(() => { const l = document.querySelector('#qm-tab-vs label.fld');
          if (!l) return { found: false };
          const tn = [...l.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
          const r = document.createRange(); r.selectNodeContents(tn);
          const sel = l.querySelector('select');
          return { found: true, lines: r.getClientRects().length,
                   text: tn.textContent.trim(),
                   selW: sel ? sel.getBoundingClientRect().width : 0 }; })()"""

        # 等奇门模块初始化完成（问事卡渲染出来）再操作，避免慢机下点击早于绑定
        for _ in range(20):
            n = ev("document.querySelectorAll('#qm-wenGrid .wen-item').length")
            if n and n > 0: break
            time.sleep(0.5)

        def open_qimen():
            for _ in range(6):
                ev("document.getElementById('qimen-enter').click(); 'ok'")
                time.sleep(0.8)
                if ev("!document.getElementById('view-qimen').hidden"): return True
            return False

        def qm_tab(t):
            for _ in range(4):
                ev(f"document.querySelector('#qm-root .tabbtn[data-t=\"{t}\"]').click(); 'ok'")
                time.sleep(0.6)
                vis = ev(f"getComputedStyle(document.getElementById('qm-tab-{t}')).display !== 'none'")
                if vis: return True
            return False

        # ================= 日间（宣纸） =================
        set_theme("day")
        opened = open_qimen()
        r = ev("""(() => { const v = document.getElementById('view-qimen');
          const root = document.getElementById('qm-root');
          const fab = v.querySelector('.jing-back-fab');
          return { open: !v.hidden, viewBg: getComputedStyle(v).backgroundColor,
                   gold: getComputedStyle(root).getPropertyValue('--gold').trim(),
                   fabBg: getComputedStyle(fab).backgroundColor,
                   wenCards: document.querySelectorAll('#qm-wenGrid .wen-item').length,
                   overflow: Math.max(document.documentElement.scrollWidth, v.scrollWidth) }; })()""")
        check("[日] 奇门视图打开、问事卡渲染", opened and r["open"] and r["wenCards"] >= 6, r)
        check("[日] 视图底色=宣纸 #F5F1E5", r["viewBg"] == "rgb(245, 241, 229)", r["viewBg"])
        check("[日] --gold=宣纸金 #A2813B", r["gold"] == "#A2813B", r["gold"])
        check("[日] 返回 FAB=全站黛青深 #2A5044", r["fabBg"] == "rgb(42, 80, 68)", r["fabBg"])
        check("[日] 问事页无横向溢出", r["overflow"] <= 391, r["overflow"])
        shot("day-01-qimen-wen.png")

        # 盘面 + 锚点
        qm_tab("pan")
        ev("""document.getElementById('qm-dt').value = '2024-12-25T14:00';
              document.getElementById('qm-btnCast').click(); 'ok'""")
        time.sleep(1.0)
        r = ev("""(() => { const sz = document.getElementById('qm-sizhu').textContent;
          document.getElementById('qm-metaToggle').click();
          const mp = document.getElementById('qm-metaPro').textContent;
          const cells = [...document.querySelectorAll('#qm-grid .cell')];
          const vis = cells.filter(c => { const x = c.getBoundingClientRect(); return x.width > 30 && x.height > 30; }).length;
          const nav = document.querySelector('#qm-root nav');
          const onBtn = document.querySelector('#qm-root .tabbtn.on');
          return { sizhu: sz, meta: mp.slice(0, 160), cells: cells.length, vis,
                   navPos: getComputedStyle(nav).position,
                   onColor: getComputedStyle(onBtn).color }; })()""")
        check("[日] 锚点四柱含癸亥", "癸亥" in r["sizhu"], r["sizhu"][:70])
        check("[日] 锚点阳遁4局/天英/景门", all(k in r["meta"] for k in ["阳遁4局", "天英", "景门"]), r["meta"][:110])
        check("[日] 九宫格 9 格可见", r["cells"] == 9 and r["vis"] == 9, r)
        check("[日] 底部导航 fixed", r["navPos"] == "fixed", r["navPos"])
        check("[日] 导航选中色=黛青深 #2A5044", r["onColor"] == "rgb(42, 80, 68)", r["onColor"])
        ev("document.querySelector('#qm-tab-pan .plate').scrollIntoView({block:'center'}); 'ok'")
        time.sleep(0.5)
        shot("day-02-qimen-pan.png")

        # 流派对照：标签单行
        qm_tab("vs")
        r = ev(LABEL_JS)
        check("[日] 「对照维度」标签单行", r["found"] and r["lines"] == 1, r)
        check("[日] 对照下拉有可用宽度(>120px)", r["selW"] > 120, r["selW"])
        ev("document.getElementById('view-qimen').scrollTop = 0; 'ok'")
        time.sleep(0.3)
        shot("day-03-qimen-vs.png")

        # 关于方法页精简版
        qm_tab("gy")
        r = ev("""(() => { const gy = document.getElementById('qm-tab-gy');
          return { txt: gy.textContent.includes('我的 → 关于 → 使用说明与免责声明'),
                   noOld: !document.getElementById('qm-noUseList') && !document.getElementById('qm-disList'),
                   lite: document.getElementById('qm-root').classList.contains('lite') }; })()""")
        check("[日] 关于方法页=精简版+指引统一声明", r["txt"] and r["noOld"], r)
        check("[日] 奇门未触发降级 lite", not r["lite"], r)
        ev("""(() => { const h = [...document.querySelectorAll('#qm-tab-gy h3')].pop();
          if (h) h.scrollIntoView({block:'start'}); return 'ok'; })()""")
        time.sleep(0.4)
        shot("day-05-qimen-gy.png")

        # ================= 夜间（玄黑） =================
        set_theme("night")
        qm_tab("wen")
        r = ev("""(() => { const v = document.getElementById('view-qimen');
          const root = document.getElementById('qm-root');
          const onBtn = document.querySelector('#qm-root .tabbtn.on');
          return { viewBg: getComputedStyle(v).backgroundColor,
                   gold: getComputedStyle(root).getPropertyValue('--gold').trim(),
                   onColor: getComputedStyle(onBtn).color,
                   overflow: Math.max(document.documentElement.scrollWidth, v.scrollWidth) }; })()""")
        check("[夜] 视图底色=玄黑 #060608", r["viewBg"] == "rgb(6, 6, 8)", r["viewBg"])
        check("[夜] --gold=原深色金 #D4AF37", r["gold"] == "#D4AF37", r["gold"])
        check("[夜] 导航选中色=鎏金 #C9A86A", r["onColor"] == "rgb(201, 168, 106)", r["onColor"])
        check("[夜] 无横向溢出", r["overflow"] <= 391, r["overflow"])
        shot("night-01-qimen-wen.png")
        qm_tab("pan")
        ev("document.querySelector('#qm-tab-pan .plate').scrollIntoView({block:'center'}); 'ok'")
        time.sleep(0.4)
        shot("night-02-qimen-pan.png")
        qm_tab("vs")
        r = ev(LABEL_JS)
        check("[夜] 「对照维度」标签单行", r["found"] and r["lines"] == 1, r)
        shot("night-03-qimen-vs.png")
        ev("document.getElementById('qimen-back').click(); 'ok'")
        time.sleep(0.5)

        # ================= 免责声明页 =================
        set_theme("day")
        ev("document.querySelector('[data-tab=\"tab-me\"]').click(); 'ok'")
        time.sleep(0.8)
        ev("document.getElementById('disclaimer-open').scrollIntoView({block:'center'}); 'ok'")
        time.sleep(0.3)
        ev("document.getElementById('disclaimer-open').click(); 'ok'")
        time.sleep(0.7)
        r = ev("""(() => { const v = document.getElementById('view-disclaimer');
          return { open: !v.hidden, t: v.textContent.includes('互联网信息服务管理办法')
                   && v.textContent.includes('未成年人请在监护人陪同下')
                   && v.textContent.includes('不预测胎儿性别'),
                   overflow: v.scrollWidth }; })()""")
        check("声明页打开且正本齐全（法规/未成年/不做清单）", r["open"] and r["t"], r)
        check("声明页无横向溢出", r["overflow"] <= 391, r["overflow"])
        ev("""(() => { const ds = document.querySelectorAll('#view-disclaimer .disc-group details');
          ds.forEach(d => d.open = true); return ds.length; })()""")
        time.sleep(0.3)
        shot("day-04-disclaimer.png")
        set_theme("night")
        ev("document.getElementById('view-disclaimer').scrollTop = 0; 'ok'")
        time.sleep(0.3)
        shot("night-04-disclaimer.png")
        ev("document.getElementById('disclaimer-back').click(); 'ok'")
        time.sleep(0.4)
        r = ev("({ closed: document.getElementById('view-disclaimer').hidden })")
        check("声明页返回关闭", r["closed"], r)

        # ================= 四工具页脚简版 =================
        set_theme("day")
        for vid, enter, shotname in [
            ("view-liuyao", "liuyao-enter", "disc-liuyao.png"),
            ("view-ziwei", "ziwei-enter", "disc-ziwei.png"),
        ]:
            ev(f"document.getElementById('{enter}').click(); 'ok'")
            time.sleep(1.0)
            r = ev(f"""(() => {{ const v = document.getElementById('{vid}');
              const d = v.querySelector('details.disc-foot');
              if (!d) return {{ found: false }};
              d.open = true;
              v.scrollTop = v.scrollHeight;
              const rc = d.getBoundingClientRect();
              return {{ found: true, open: d.open, h: d.offsetHeight,
                        guide: d.textContent.includes('我的 → 关于 → 使用说明与免责声明'),
                        bottom: rc.bottom }}; }})()""")
            check(f"页脚简版-{vid} 存在/可展开/含指引", r["found"] and r["open"] and r["h"] > 120 and r["guide"], r)
            time.sleep(0.4)
            shot(shotname)
            ev(f"document.getElementById('{vid}').hidden = true; 'ok'")
            time.sleep(0.3)
        # 八字：真实打开视图后展开页脚块
        ev("document.getElementById('bazi-enter').click(); 'ok'")
        time.sleep(1.0)
        r = ev("""(() => { const v = document.getElementById('bazi-view');
          const d = v.querySelector('details.disc-foot');
          if (!d) return { found: false };
          d.open = true; v.scrollTop = v.scrollHeight;
          return { found: true, open: d.open, h: d.offsetHeight,
                   guide: d.textContent.includes('我的 → 关于 → 使用说明与免责声明') }; })()""")
        check("页脚简版-八字 存在/可展开/含指引", r["found"] and r["open"] and r["h"] > 120 and r["guide"], r)
        time.sleep(0.4)
        shot("disc-bazi.png")
        ev("document.getElementById('bazi-back').click(); 'ok'")
        time.sleep(0.5)
        # 奇门：重开视图，滚到底展开页脚块（该块在 #qm-root 外、走全站样式）
        opened2 = open_qimen()
        r = ev("""(() => { const v = document.getElementById('view-qimen');
          const d = v.querySelector('details.disc-foot');
          if (!d) return { found: false };
          d.open = true; v.scrollTop = v.scrollHeight;
          return { found: true, open: d.open, h: d.offsetHeight,
                   outsideRoot: !document.getElementById('qm-root').contains(d),
                   cardBg: getComputedStyle(d.closest('section')).backgroundColor }; })()""")
        check("页脚简版-奇门 存在/可展开（qm-root 外全站样式）", opened2 and r["found"] and r["open"] and r["h"] > 120 and r["outsideRoot"], r)
        time.sleep(0.4)
        shot("disc-qimen.png")
        ev("document.getElementById('qimen-back').click(); 'ok'")
        time.sleep(0.5)

        # ================= 全站回归 =================
        ev("document.querySelector('[data-tab=\"tab-home\"]').click(); 'ok'"); time.sleep(0.8)
        ok = ev("document.getElementById('tab-home').classList.contains('active')")
        check("回归-首页 tab", ok is True, ok)
        ev("document.querySelector('[data-tab=\"tab-jing\"]').click(); 'ok'"); time.sleep(1.0)
        ok = ev("document.querySelectorAll('#jing-list .jing-item, #jing-list > *').length > 0")
        check("回归-经文列表", ok is True, ok)
        ev("document.querySelector('[data-tab=\"tab-me\"]').click(); 'ok'"); time.sleep(0.8)
        r = ev("({ ack: document.body.textContent.includes('掌上乾坤'), discBtn: !!document.getElementById('disclaimer-open') })")
        check("回归-我的页鸣谢+声明入口", r["ack"] and r["discBtn"], r)

        errs = page_errors()
        check("全程无 JS 异常/控制台 error", len(errs) == 0, errs[:3])
        print("\n冒烟结论:", "全过" if not FAILS else f"失败 {len(FAILS)}: {FAILS}")
        return 1 if FAILS else 0
    finally:
        chrome.terminate()

if __name__ == "__main__":
    sys.exit(main())
