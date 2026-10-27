#!/usr/bin/env python3
"""金锁玉关验收冒烟（2026-10-27）：种子宅＝卯山酉向定稿（facing 270°）＋
带砂水构件的户型（立极 5,4）＋住户于伊一（子女·女·2020-09-07）。
几何预期（扇形分宫，bearing = 270 + atan2(dx,-dy)）：
  震（南·书桌砂）得位 / 艮（东南角无房）缺角 / 乾（厨房+灶）火烧天门 /
  坤（卫生间+马桶）厕所落宫 / 兑（主卧+床）见砂失位；
  于伊一：六亲宫兑（少女）、属相鼠→本宫坎、对宫离、选房首选兑。
覆盖：引擎断言、DOM 断言、外局标记＋形煞勾选＋落盘、拍照向导衔接、
住户卡、三态（日/夜/红光，红光 computed 走变量链）、360/412 两宽。
用法：python3 smoke-jinsuo.py [www目录]   结果与截图落 jinsuo-shots/。"""
import base64, importlib.util, json, os, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location(
    "smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec)
sys.modules["smoke_base"] = base
spec.loader.exec_module(base)

HERE = os.path.dirname(os.path.abspath(__file__))
WWW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "www")
SHOTS = os.path.join(HERE, "jinsuo-shots")
os.makedirs(SHOTS, exist_ok=True)
RESULTS = []

def note(name, ok, extra=""):
    RESULTS.append((name, bool(ok), extra))
    print(("PASS " if ok else "FAIL ") + name + ((" | " + str(extra)) if extra else ""))

def main():
    port = base.free_port()
    prof = "/tmp/jinsuo-%d" % port
    env = dict(os.environ); env["TZ"] = "America/Toronto"
    proc = subprocess.Popen(
        [base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
         "--allow-file-access-from-files",
         "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
         "--window-size=500,1100", "about:blank"],
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

        def shot(name):
            r = c.call("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(SHOTS, name), "wb") as f:
                f.write(base64.b64decode(r["data"]))

        ready = False
        for _ in range(30):
            if ev("!!(window.WuriPro && window.__wuriJinsuo && window.__wuriHouse && __wuriHouse.db && window.JINSUO_DATA)"):
                ready = True; break
            time.sleep(0.5)
        note("模块就绪（jinsuo/house/db/数据）", ready)
        ev("localStorage.setItem('wuri_pro_redeem','1'); localStorage.setItem('wuri_lang_v1','zh-Hans')")

        # ---------------- 种子 ----------------
        seed = ev("""(async () => {
          const db = window.__wuriHouse.db;
          await db.houses.clear(); await db.floors.clear(); await db.plans.clear();
          await db.measurements.clear(); await db.residents.clear();
          await db.guides.clear(); await db.photos.clear();
          const hid = await db.houses.add({name:'种子宅', address:'', client:'', note:'', created: Date.now(), uuid:'seed-js-1'});
          await db.measurements.add({houseId: hid, ts: Date.now(), facingDeg: 270,
            facing:'酉', sitting:'卯', point:'', fixed: true});
          const fid = await db.floors.add({houseId: hid, name:'一层', sort: 0});
          const R = (x,y,w,h,name,type) => ({id: name, x, y, w, h, name, type});
          const rooms = [
            R(0,0,2.4,2.4,'卫生间','bath'), R(3.5,0,3,2.4,'主卧室','master'),
            R(7.6,0,2.4,2.4,'厨房','kitchen'), R(0,2.8,2.4,2.4,'次卧','bedroom'),
            R(7.6,2.8,2.4,2.0,'餐厅','dining'), R(2.9,5.6,2.7,2.4,'客厅','living'),
            R(0,5.6,2.4,2.4,'书房','study')];
          const F = (type,x,y) => ({id: type+x, type, x, y, rot: 0, flip: false});
          const fixtures = [F('toilet',1,1), F('bed',5,1), F('stove',9,1),
            F('kidbed',1.2,4), F('door',9.5,3.8), F('desk',4.4,7.2), F('bookcase',1,7)];
          await db.plans.put({floorId: fid, houseId: hid, updated: Date.now(),
            mPerUnit: 100, rooms, fixtures, trace: null, liji: {x:5,y:4}, lijiLock: true, layers: {}});
          const rid = await db.residents.add({houseId: hid, name:'于伊一', rel:'child',
            gender:'female', birthYear:2020, birthMonth:9, birthDay:7, note:''});
          return {hid, fid, rid};
        })()""")
        note("种子写入", bool(seed and seed["hid"]), str(seed))

        # ---------------- 引擎断言 ----------------
        eng = ev("""(async () => {
          const db = window.__wuriHouse.db;
          const m = (await db.measurements.where('houseId').equals(%d).toArray()).find(x => x.fixed);
          const plan = await db.plans.get(%d);
          const J = window.__wuriJinsuo.compute(m, plan);
          const o = {};
          for (const k in J.palaces) o[k] = J.palaces[k].status;
          return {st: o, qianFire: J.palaces.qian.chufang, kunToilet: J.palaces.kun.cesuo,
                  zhenSha: J.palaces.zhen.shaItems, genRooms: J.palaces.gen.roomsHere};
        })()""" % (seed["hid"], seed["fid"]))
        note("引擎·震宫得位", eng["st"]["zhen"] == "ji", str(eng["st"]))
        note("引擎·艮宫缺角", eng["st"]["gen"] == "missing")
        note("引擎·乾宫厨房专条触发", eng["qianFire"] is True)
        note("引擎·坤宫厕所专条触发", eng["kunToilet"] is True)
        note("引擎·兑宫见砂失位", eng["st"]["dui"] == "xiong")
        note("引擎·汇总 ji2/xiong5/missing1",
             list(eng["st"].values()).count("ji") == 2 and
             list(eng["st"].values()).count("xiong") == 5 and
             list(eng["st"].values()).count("missing") == 1, str(eng["st"]))

        # ---------------- 开页与内局面板 ----------------
        ev("document.getElementById('fs-card-jinsuo').click()")
        time.sleep(1.4)
        note("金锁页打开", ev("!document.getElementById('view-jinsuo').hidden"))
        nei = ev("document.getElementById('js-panel-nei').innerText")
        note("汇总行计数", ("得位 2 宫" in nei and "失位 5 宫" in nei and "缺角 1 宫" in nei),
             nei.split("\n")[1] if "\n" in nei else nei[:80])
        note("乾宫卡含火烧天门", "火烧天门" in nei)
        note("坤宫卡含厕所落宫专条", "厕所落宫" in nei)
        note("艮宫卡含缺角断语", "缺角断语" in nei)
        note("先天叠断出现", "先天叠断" in nei)
        note("坐向定稿小字（卯山酉向）", "卯" in ev("document.getElementById('js-sit-note').innerText")
             and "酉" in ev("document.getElementById('js-sit-note').innerText"))
        shot("nei-day-412.png")
        ev("document.documentElement.setAttribute('data-theme','night')")
        time.sleep(0.3); shot("nei-night-412.png")
        ev("document.body.classList.add('sky-red')")
        time.sleep(0.3); shot("nei-red-412.png")
        comp = ev("(() => { const el = document.querySelector('#js-panel-nei .js-chip.ok');"
                  " return el ? getComputedStyle(el).color : ''; })()")
        note("红光 computed：得位签随变量变红", comp == "rgb(194, 67, 42)", str(comp))
        ev("document.body.classList.remove('sky-red');"
           "document.documentElement.setAttribute('data-theme','day')")

        # ---------------- 外局面板 ----------------
        ev("document.querySelector('#js-tabs button[data-v=\"wai\"]').click()")
        time.sleep(0.5)
        wai = ev("document.getElementById('js-panel-wai').innerText")
        note("外局·形煞清单含路冲煞", "路冲煞" in wai)
        note("外局·拍照向导衔接卡", ("拍照向导" in wai) or ("嚮導" in wai))
        ev("""(() => { const id = JINSUO_DATA.shaxing.shas.find(s => s.name === '路冲煞').id;
          document.querySelector('input[data-sha="' + id + '"]').click(); })()""")
        time.sleep(0.5)
        wai2 = ev("document.getElementById('js-panel-wai').innerText")
        note("外局·勾选展开危害/化解", ("危害" in wai2 and "化解" in wai2))
        ev("document.querySelector('.js-dir-seg[data-dir=\"kan\"] button[data-v=\"sha\"]').click()")
        time.sleep(0.5)
        row = ev("(() => { const seg = document.querySelector('.js-dir-seg[data-dir=\"kan\"]');"
                 " return seg.closest('.js-dir-row').innerText; })()")
        note("外局·坎方标砂→得位", "得位" in row, row.replace("\n", " "))
        saved = ev("localStorage.getItem('wuri_js_waiju_v1') || ''")
        note("外局·标记落盘（含同步键）", ('"kan":"sha"' in saved and "seed-js-1" in saved), saved[:120])
        c.call("Emulation.setDeviceMetricsOverride",
               {"width": 360, "height": 800, "deviceScaleFactor": 2, "mobile": True})
        time.sleep(0.3); shot("wai-day-360.png")
        c.call("Emulation.setDeviceMetricsOverride",
               {"width": 412, "height": 915, "deviceScaleFactor": 2, "mobile": True})

        # ---------------- 住户面板 ----------------
        ev("document.querySelector('#js-tabs button[data-v=\"ren\"]').click()")
        time.sleep(0.5)
        ren = ev("document.getElementById('js-panel-ren').innerText")
        note("住户·于伊一卡", "于伊一" in ren)
        note("住户·六亲宫兑（少女）", ("六亲宫" in ren and "兑宫" in ren))
        note("住户·属相本宫坎（鼠）", ("属相本宫" in ren and "坎宫" in ren))
        note("住户·属相对宫离", ("属相对宫" in ren and "离宫" in ren))
        note("住户·选房首选兑次选艮", ("首选 兑（正西）" in ren and "次选 艮（东北）" in ren),
             [l for l in ren.split("\n") if "首选" in l][:1])
        shot("ren-day-412.png")

        errs = ev("window.__errs || []")
        note("全程无 JS 错误", len(errs) == 0, "; ".join(errs[:3]))
    finally:
        proc.terminate()

    fails = [r for r in RESULTS if not r[1]]
    with open(os.path.join(SHOTS, "smoke-result.txt"), "w") as f:
        for n, ok, x in RESULTS:
            f.write(("PASS " if ok else "FAIL ") + n + ((" | " + str(x)) if x else "") + "\n")
        f.write("TOTAL %d/%d PASS\n" % (len(RESULTS) - len(fails), len(RESULTS)))
    print("TOTAL %d/%d PASS" % (len(RESULTS) - len(fails), len(RESULTS)))
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
