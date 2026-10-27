#!/usr/bin/env python3
"""风水小修验收冒烟（2026-10-27）：八宅关联单一真相＋玄空元运年份区间。
覆盖：选宅→坐向带入＋关联小字；选住户→年份/性别带入＋关联小字＋命卦；
手改年份→关联解除、下拉回手输、命卦按新年份重算；手改坐向→宅关联小字消失；
重选住户→再带入再关联；玄空元运选项带年份区间＋现盘说明新文案；三态截图。
用法：python3 smoke-fengfix.py [www目录]   结果与截图落 fengfix-shots/。"""
import base64, importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location(
    "smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

HERE = os.path.dirname(os.path.abspath(__file__))
WWW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "www")
SHOTS = os.path.join(HERE, "fengfix-shots")
os.makedirs(SHOTS, exist_ok=True)
RESULTS = []

def note(name, ok, extra=""):
    RESULTS.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))

def main():
    port = base.free_port()
    prof = "/tmp/fengfix-%d" % port
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

        def set_select(sel_id, val):
            ev("(() => { const s = document.getElementById(%s);"
               " s.value = %s; s.dispatchEvent(new Event('change', {bubbles:true})); })()"
               % (json.dumps(sel_id), json.dumps(str(val))))
            time.sleep(0.6)

        for _ in range(30):
            if ev("!!(window.WuriPro && window.__wuriFs2 && window.__wuriHouse && __wuriHouse.db)"):
                break
            time.sleep(0.5)
        ev("localStorage.setItem('wuri_pro_redeem','1')")
        note("置 Pro 标记", ev("WuriPro.isPro()") is True)

        # ---------- 种子：宅（卯山定稿）＋住户（于圣博 1986 男） ----------
        seed = ev("""(async () => {
          const db = __wuriHouse.db;
          await db.houses.clear(); await db.residents.clear(); await db.measurements.clear();
          const hid = await db.houses.add({name:'测试宅', address:'', client:'', created: Date.now()});
          await db.measurements.add({houseId: hid, ts: Date.now(), facingDeg: 90,
            facing: '酉', sitting: '卯', point: '大门', fixed: true});
          const rid = await db.residents.add({houseId: hid, name: '于圣博', rel: '本人',
            birthYear: 1986, birthMonth: 11, birthDay: 7, gender: 'male'});
          return {hid: hid, rid: rid};
        })()""")
        note("种子写入", bool(seed and seed["hid"] and seed["rid"]), str(seed))

        # ---------- 八宅：选宅带入 ----------
        click_at("#fengshui-entry-card")
        click_at("#fs-card-bazhai")
        note("八宅页打开", visible("#view-bazhai"))
        note("未选时两条关联小字都隐藏",
             (not visible("#fs2-bz-houselink")) and (not visible("#fs2-bz-reslink")))
        set_select("fs2-bz-house", seed["hid"])
        sit = ev("document.getElementById('fs2-bz-sitting').value")
        note("选宅→坐向带入定稿卯", sit == "卯", sit)
        hl = ev("document.getElementById('fs2-bz-houselink').innerText")
        note("选宅→关联小字出现（含宅名）",
             visible("#fs2-bz-houselink") and "测试宅" in hl and "定稿" in hl, hl)

        # ---------- 选住户带入 ----------
        opts = ev("Array.from(document.getElementById('fs2-bz-resident').options).map(o => o.textContent)")
        note("住户下拉含于圣博", any("于圣博" in o for o in opts), str(opts))
        set_select("fs2-bz-resident", seed["rid"])
        yr = ev("document.getElementById('fs2-bz-year').value")
        note("选住户→年份带入 1986", str(yr) == "1986", str(yr))
        rl = ev("document.getElementById('fs2-bz-reslink').innerText")
        note("选住户→关联小字出现（含姓名）",
             visible("#fs2-bz-reslink") and "于圣博" in rl, rl)
        summ = ev("document.getElementById('fs2-bz-summary').innerText")
        note("1986 男→坤·西四命（与真机一致）",
             ("坤" in summ and "西四" in summ), summ.replace("\n", " / ")[:80])
        life_on = ev("document.querySelector('#fs2-bz-viewseg [data-v=\"life\"]').classList.contains('on')")
        note("选住户→自动切命卦游年视图", life_on is True)
        shot("bz-linked-day.png")

        # ---------- 手改年份→解联＋重算 ----------
        ev("(() => { const y = document.getElementById('fs2-bz-year');"
           " y.value = '1990'; y.dispatchEvent(new Event('change', {bubbles:true})); })()")
        time.sleep(0.4)
        rsel = ev("document.getElementById('fs2-bz-resident').value")
        note("改年份→住户下拉回手输", rsel == "", repr(rsel))
        note("改年份→住户关联小字消失", not visible("#fs2-bz-reslink"))
        summ2 = ev("document.getElementById('fs2-bz-summary').innerText")
        note("改年份→命卦按 1990 男重算（坎）",
             ("坎" in summ2 and "坤" not in summ2.split("宅卦")[0]),
             summ2.replace("\n", " / ")[:80])
        note("改年份→宅关联不受影响（仍在）", visible("#fs2-bz-houselink"))

        # ---------- 手改性别→保持解联、按新性别算 ----------
        click_at('#fs2-bz-gender [data-g="female"]')
        summ3 = ev("document.getElementById('fs2-bz-summary').innerText")
        note("改性别→仍无住户关联", not visible("#fs2-bz-reslink"))
        # 1990 女：数字根 1，女命 4+1=5 五黄寄艮 → 艮（五黄寄宫口径，引擎为据）
        note("改性别→命卦随 1990 女变（艮）", "艮" in summ3,
             summ3.replace("\n", " / ")[:80])

        # ---------- 重选住户→再带入 ----------
        set_select("fs2-bz-resident", seed["rid"])
        yr2 = ev("document.getElementById('fs2-bz-year').value")
        gon = ev("document.querySelector('#fs2-bz-gender [data-g=\"male\"]').classList.contains('on')")
        note("重选住户→年份/性别再带入",
             str(yr2) == "1986" and gon is True, "year=%s maleOn=%s" % (yr2, gon))
        note("重选住户→关联小字再现", visible("#fs2-bz-reslink"))

        # ---------- 手改坐向→宅关联解除 ----------
        set_select("fs2-bz-sitting", "子")
        note("改坐向→宅关联小字消失", not visible("#fs2-bz-houselink"))
        note("改坐向→住户关联不受影响", visible("#fs2-bz-reslink"))
        shot("bz-unlinked-day.png")

        # ---------- 三态（关联态下） ----------
        set_select("fs2-bz-house", seed["hid"])
        time.sleep(0.4)
        note("重选宅→坐向再取定稿卯＋关联小字再现",
             ev("document.getElementById('fs2-bz-sitting').value") == "卯"
             and visible("#fs2-bz-houselink"))
        ev("document.documentElement.setAttribute('data-theme','night')")
        time.sleep(0.3); shot("bz-linked-night.png")
        ev("document.body.classList.add('sky-red')")
        time.sleep(0.3); shot("bz-linked-red.png")
        comp = ev("(() => { const el = document.getElementById('fs2-bz-reslink');"
                  " return getComputedStyle(el).color; })()")
        note("红光 computed：关联小字随变量变红", comp == "rgb(194, 67, 42)", str(comp))
        ev("document.body.classList.remove('sky-red');"
           "document.documentElement.setAttribute('data-theme','day')")
        click_at("#fs-bazhai-back")

        # ---------- 玄空：元运选项年份区间 ----------
        click_at("#fs-card-xuankong")
        note("飞星页打开", visible("#view-xuankong"))
        popts = ev("Array.from(document.getElementById('fs2-xk-period').options).map(o => o.textContent)")
        note("元运 10 个选项", len(popts) == 10, str(popts))
        note("自动项保持", "自动" in popts[0], popts[0])
        note("一运带 1864–1883", "1864" in popts[1] and "1883" in popts[1], popts[1])
        note("七运带 1984–2003", "1984" in popts[7] and "2003" in popts[7], popts[7])
        note("九运带 2024–2043", "2024" in popts[9] and "2043" in popts[9], popts[9])
        ev("(() => { const y = document.getElementById('fs2-xk-year');"
           " y.value = '1992'; y.dispatchEvent(new Event('change', {bubbles:true})); })()")
        time.sleep(0.4)
        eff = ev("document.getElementById('fs2-xk-eff').innerText")
        note("现盘说明新文案（七运 · 1984–2003）",
             ("七运" in eff and "1984–2003" in eff and "年一运" not in eff and "·" in eff), eff)
        shot("xk-period-day.png")
        set_select("fs2-xk-period", 8)
        eff8 = ev("document.getElementById('fs2-xk-eff').innerText")
        note("手选八运→说明同步八运 2004–2023",
             ("八运" in eff8 and "2004–2023" in eff8), eff8)
        ev("document.documentElement.setAttribute('data-theme','night')")
        time.sleep(0.3); shot("xk-night.png")
        ev("document.body.classList.add('sky-red')")
        time.sleep(0.3); shot("xk-red.png")
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
