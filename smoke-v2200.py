#!/usr/bin/env python3
"""v2.2.0 专项冒烟：全端统一版本号（用户 2026-10-25 拍板）。

内容与 v2.1.1 (5) 完全相同，只改版本号相关的串：显示版本 v2.2.0
（不再带括号号）、SW 缓存名 v111、CSS ?v=111。本脚本由 smoke-v2115
克隆：②③④ 的 Pro 文案/门控对账断言原样保留（防统一版本号时误伤），
①与运行时版本断言更新为 2.2.0 口径。

断言：
①四件套：SW v111 / CSS ?v=111 / 显示与 me_ver 简繁均 v2.2.0。
②代码门控对账（静态）：全仓 requirePro/showPaywall 目标集合恰为
  {bazi, ziwei, liuyao, qimen, year, jingwen}，且付费墙 7 条与之逐项对应
  （jingwen 拆内丹经阅读＋诵读音频离线下载两条）。
③静态文案：index.html 清单与 i18n zh-CN 字典逐字一致；zh-TW 字典 7 条齐备；
  pro_card_hint 简繁均含离线下载；旧死键 pro_feat_* 已除；
  清单不含免费功能字样（修行日程/小组件/数据备份/星象/图鉴）。
④运行时真点击：点「我的」页解锁按钮（elementFromPoint 最上层断言＋
  CDP 真实鼠标事件）打开付费墙，7 条渲染与字典一致、价格与说明在位；
  切 zh-TW 后 7 条与入口副文案均变繁体；全程零 JS 异常。
"""
import importlib.util, json, os, re, subprocess, sys, time, urllib.request

spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/wuri-web/www")
PORT = base.free_port()

results = []
def report(name, ok, extra=""):
    results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ((" -> " + str(extra)[:300]) if not ok and extra != "" else ""))

# ---------- ① 四件套 ----------
sw = open(os.path.join(WWW, "sw.js"), encoding="utf-8").read()
report("SW v111 缓存名", "wuri-v111-20261025-v220" in sw)
html = open(os.path.join(WWW, "index.html"), encoding="utf-8").read()
report("CSS ?v=111＋显示版本 2.2.0", "css/style.css?v=111" in html and "v2.2.0" in html)
i18n = open(os.path.join(WWW, "js/i18n.js"), encoding="utf-8").read()
report("me_ver 简繁 2.2.0", i18n.count("v2.2.0") >= 2)

# ---------- ② 代码门控对账 ----------
targets = set()
for fn in os.listdir(os.path.join(WWW, "js")):
    if not fn.endswith(".js") or fn == "pro.js":
        continue
    src = open(os.path.join(WWW, "js", fn), encoding="utf-8").read()
    targets |= set(re.findall(r"requirePro\(['\"](\w+)['\"]\)", src))
    targets |= set(re.findall(r"showPaywall\(['\"](\w+)['\"]\)", src))
report("门控目标集合恰为六键", targets == {"bazi", "ziwei", "liuyao", "qimen", "year", "jingwen"}, targets)
jing = open(os.path.join(WWW, "js/jingwen.js"), encoding="utf-8").read()
m = re.search(r"JING_NEIDAN = \[([^\]]+)\]", jing)
neidan_ids = re.findall(r"'(\w+)'", m.group(1)) if m else []
report("内丹锁定名单恰五部", neidan_ids == ["s18", "s19", "s20", "s21", "s23"], neidan_ids)
off = open(os.path.join(WWW, "js/offline-download.js"), encoding="utf-8").read()
report("离线下载门控在位（jingwen 单部＋offline 一键）",
       "requirePro('jingwen')" in jing and "requirePro('jingwen')" in off)

# ---------- ③ 静态文案 ----------
def dict_block(lang):
    seg = i18n.split("'%s': {" % lang, 1)[1]
    return seg.split("\n},\n", 1)[0] if lang == "zh-CN" else seg

FEATS_CN = [
    "内丹经五部全文：《黄庭内景经》《周易参同契》《太乙金华宗旨》《太清元道真经》《性命圭旨》",
    "八字排盘 · 完整功能：四柱起盘、大运流年、流月流日、五行力量、命宫身宫胎元",
    "紫微斗数 · 完整功能：十二宫命盘、运限逐层下钻、三方四正、飞化自化",
    "六爻排盘：铜钱起卦、纳甲装卦、结构断卦判读",
    "奇门遁甲排盘：问事起局、九宫格局判定",
    "年历总览：一整年戊日、节日与干支纵览",
    "经文诵读音频离线下载：26 部有声经文、男女双声一次下完，断网也能听",
]
FEATS_TW = [
    "內丹經五部全文：《黃庭內景經》《周易參同契》《太乙金華宗旨》《太清元道真經》《性命圭旨》",
    "八字排盤 · 完整功能：四柱起盤、大運流年、流月流日、五行力量、命宮身宮胎元",
    "紫微斗數 · 完整功能：十二宮命盤、運限逐層下鑽、三方四正、飛化自化",
    "六爻排盤：銅錢起卦、納甲裝卦、結構斷卦判讀",
    "奇門遁甲排盤：問事起局、九宮格局判定",
    "年曆總覽：一整年戊日、節日與干支縱覽",
    "經文誦讀音頻離線下載：26 部有聲經文、男女雙聲一次下完，斷網也能聽",
]
for i, t in enumerate(FEATS_CN, 1):
    report("zh-CN pay_f%d 与清单一致" % i, ("pay_f%d: '%s'" % (i, t)) in i18n and t in html)
for i, t in enumerate(FEATS_TW, 1):
    report("zh-TW pay_f%d 齐备" % i, ("pay_f%d: '%s'" % (i, t)) in i18n)
joined = "".join(FEATS_CN)
for kw in ("修行日程", "小组件", "數據備份", "数据备份", "星象", "图鉴", "神祇"):
    report("清单不冒充免费功能：%s" % kw, kw not in joined)
report("pro_card_hint 简繁含离线下载",
       "诵读音频离线下载，一次买断" in i18n and "誦讀音頻離線下載，一次買斷" in i18n)
report("旧死键 pro_feat_* 已除", "pro_feat_" not in i18n)
for title in ("黄庭内景经", "周易参同契", "太乙金华宗旨", "太清元道真经", "性命圭旨"):
    report("内丹五部点名：%s" % title, title in FEATS_CN[0])
for kw in ("运限逐层下钻", "三方四正", "飞化自化"):
    report("紫微卖点点名：%s" % kw, kw in FEATS_CN[2])
report("六爻卖点点名：结构断卦判读", "结构断卦判读" in FEATS_CN[3])

# ---------- ④ 运行时真点击 ----------
chrome = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
                           "--allow-file-access-from-files",
                           "--remote-debugging-port=%d" % PORT, "about:blank"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    ws_url = None
    for _ in range(40):
        try:
            targets2 = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=3))
            pages = [t for t in targets2 if t.get("type") == "page"]
            if pages: ws_url = pages[0]["webSocketDebuggerUrl"]; break
        except Exception: pass
        time.sleep(0.5)
    assert ws_url, "chrome CDP 未就绪"
    cdp = base.CDP(base.ws_connect(ws_url))
    cdp.call("Page.enable"); cdp.call("Runtime.enable")
    cdp.call("Page.navigate", {"url": "file://" + os.path.join(WWW, "index.html")})
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)

    def ev(js):
        return cdp.evaluate(js)

    def real_click(sel):
        box = ev("""(() => { const e = document.querySelector(%s);
          if (!e) return null; e.scrollIntoView({block:'center'});
          const r = e.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
          return {x: r.left + r.width/2, y: r.top + r.height/2,
                  topOk: top === e || e.contains(top)}; })()""" % json.dumps(sel))
        if not box: return False
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": box["x"], "y": box["y"]})
        cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": box["x"], "y": box["y"], "button": "left", "clickCount": 1})
        return box["topOk"]

    report("页面加载", ev("!!document.querySelector('#tab-me') && !!window.WuriPro"))
    ok_top = real_click('#tabbar [data-tab="tab-me"]')
    time.sleep(0.6)
    report("真点击进「我的」页（最上层断言）", bool(ok_top) and ev("(() => { const t = document.querySelector('#tab-me'); return getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().height > 0; })()"))
    ok_top2 = real_click('[data-pro-act="paywall"][data-pro-from="me"]')
    time.sleep(0.8)
    state = ev("""(() => { const m = document.querySelector('#paywall');
      const lis = Array.from(m.querySelectorAll('.pay-feats li')).map(li => li.textContent.trim());
      const buy = m.querySelector('[data-pro-act="buy"]');
      const note = m.querySelector('[data-pro-paynote]');
      return {shown: m.classList.contains('show'), lis: lis,
              buy: buy ? buy.textContent.trim() : '', note: note ? note.textContent.trim() : ''};
    })()""")
    report("付费墙打开（真点击＋最上层）", bool(ok_top2) and state and state["shown"], state and state.get("shown"))
    report("付费墙 7 条渲染与字典逐字一致", state and state["lis"] == FEATS_CN, state and state["lis"])
    report("价格与付款说明保留", state and "4.99" in state["buy"] and len(state["note"]) > 10, state and (state["buy"], state["note"][:40]))
    ver = ev("document.querySelector('[data-i18n=\"me_ver\"]').textContent")
    report("关于显示 v2.2.0", ver and "v2.2.0" in ver, ver)

    ev("localStorage.setItem('wuri_lang_v1','zh-TW'); location.reload(); true")
    for _ in range(40):
        if cdp.evaluate("document.readyState") == "complete": break
        time.sleep(0.5)
    time.sleep(2.0)
    ok_top3 = real_click('#tabbar [data-tab="tab-me"]')
    time.sleep(0.6)
    real_click('[data-pro-act="paywall"][data-pro-from="me"]')
    time.sleep(0.8)
    state2 = ev("""(() => { const m = document.querySelector('#paywall');
      const lis = Array.from(m.querySelectorAll('.pay-feats li')).map(li => li.textContent.trim());
      const hint = document.querySelector('[data-i18n="pro_card_hint"]');
      return {shown: m.classList.contains('show'), lis: lis, hint: hint ? hint.textContent.trim() : ''};
    })()""")
    report("繁体付费墙 7 条齐备", state2 and state2["lis"] == FEATS_TW, state2 and state2["lis"])
    report("繁体入口副文案含離線下載", state2 and "離線下載" in state2["hint"], state2 and state2["hint"])

    exc = [e for e in cdp.events if e.get("method") == "Runtime.exceptionThrown"]
    report("全程零 JS 异常", len(exc) == 0, json.dumps(exc[0])[:250] if exc else "")
finally:
    chrome.terminate()

bad = [n for n, ok in results if not ok]
print("\n==== SMOKE v2200: %d/%d PASS ====" % (len(results) - len(bad), len(results)))
sys.exit(1 if bad else 0)
