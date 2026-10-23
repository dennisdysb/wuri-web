#!/usr/bin/env python3
"""v2.0.0 双线线上验活（桥框架复用 offline34_test.py）：SW v89 激活、关于版 v2.0.0、
首页第四卡、今日星空卡实值、图鉴 102 位（feed 覆盖后仍 102）、星官图鉴懒加载 287 渲染。"""
import importlib.util, os, sys, time

spec = importlib.util.spec_from_file_location("t34", os.path.expanduser("~/workspace/wuri-web/offline34_test.py"))
t34 = importlib.util.module_from_spec(spec)
sys.modules["t34"] = t34
spec.loader.exec_module(t34)
Browser, report, wait_sw_active = t34.Browser, t34.report, t34.wait_sw_active
t34.SHOTS = os.path.expanduser("~/workspace/wuri-web/stars200-live-shots")
os.makedirs(t34.SHOTS, exist_ok=True)


def run(base, tag):
    b = Browser()
    try:
        b.nav(base)
        report(tag + " SW 激活", wait_sw_active(b))
        caches = b.ev("(async () => await caches.keys())()")
        report(tag + " SW 缓存 v89", any("wuri-v89" in c for c in caches), caches)
        ver = b.ev("document.querySelector('[data-i18n=\"me_ver\"]').textContent")
        report(tag + " 关于版本 v2.0.0", "v2.0.0" in ver, ver)
        r = b.ev("""(() => { const ids = ['practice-entry-card','shushu-entry-card','deities-entry-card','stars-entry-card'];
          return { cards: ids.every(id => !!document.getElementById(id)),
            xiu: (document.getElementById('sx-sky-xiu') || {}).textContent || '',
            moon: (document.getElementById('sx-sky-moon-sub') || {}).textContent || '' }; })()""")
        report(tag + " 首页四卡+今日卡实值", r["cards"] and bool(r["xiu"]) and "%" in r["moon"], r)
        # 图鉴（等 feed 应用后再数）
        b.ev("document.getElementById('deities-entry-card').click(); true")
        ok102 = b.wait("document.querySelectorAll('#deities-groups .deity-card').length === 102", 30)
        grp = b.ev("""(() => { const t = [...document.querySelectorAll('.deity-group-title')];
          return t.length ? t[t.length - 1].textContent : ''; })()""")
        report(tag + " 图鉴 102 位+末组星君", ok102 and "二十八宿星君" in grp, grp)
        b.ev("document.querySelector('[data-tab=\"tab-home\"]').click(); true")
        time.sleep(0.6)
        # 星官图鉴（懒加载走真实网络）
        b.ev("document.getElementById('stars-entry-card').click(); true")
        ok287 = b.wait("(document.getElementById('sx-home') || {}).textContent.includes('287')", 40)
        chips = b.ev("document.querySelectorAll('#sx-home .sx-chips [data-sx-region]').length")
        report(tag + " 星官图鉴 287+宿签28", ok287 and chips == 28, chips)
        b.shot("live-" + tag)
    finally:
        b.close()


import sys as _s
if "CF" not in _s.argv: run(t34.GH, "GH")
if "GH" not in _s.argv: run(t34.CF, "CF")
print("\n==== live %d/%d PASS ====" % (sum(t34.RESULTS), len(t34.RESULTS)))
if not all(t34.RESULTS):
    sys.exit(1)
