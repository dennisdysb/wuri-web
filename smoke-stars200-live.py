#!/usr/bin/env python3
"""v2.0.0 (7) 双线线上验活（桥框架复用 offline34_test.py）：SW v97 激活、关于版 v2.1.0 (3)、
首页三卡且无今日卡/星象卡、六标签序、星象页今日星象实值、图鉴 102 位（feed 覆盖后仍 102）、星官图鉴懒加载 287 渲染。"""
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
        report(tag + " SW 缓存 v109", any("wuri-v109" in c for c in caches), caches)
        ver = b.ev("document.querySelector('[data-i18n=\"me_ver\"]').textContent")
        report(tag + " 关于版本 v2.1.1", "v2.1.1" in ver, ver)
        r = b.ev("""(() => { const home = document.getElementById('tab-home');
          const ids = ['practice-entry-card','shushu-entry-card','deities-entry-card'];
          return { cards: ids.every(id => !!document.getElementById(id)),
            noOld: !home.querySelector('#today-sky-card') && !home.querySelector('#stars-entry-card'),
            tabs: [...document.querySelectorAll('#tabbar button')].map(x => x.getAttribute('data-tab')) }; })()""")
        report(tag + " 首页三卡+无今日卡/星象卡+六标签序",
               r["cards"] and r["noOld"] and r["tabs"] == ['tab-home', 'tab-cal', 'tab-jing', 'tab-stars', 'tab-remind', 'tab-me'], r)
        # 图鉴（等 feed 应用后再数）
        b.ev("document.getElementById('deities-entry-card').click(); true")
        ok102 = b.wait("document.querySelectorAll('#deities-groups .deity-card').length === 102", 30)
        grp = b.ev("""(() => { const t = [...document.querySelectorAll('.deity-group-title')];
          return t.length ? t[t.length - 1].textContent : ''; })()""")
        report(tag + " 图鉴 102 位+末组星君", ok102 and "二十八宿星君" in grp, grp)
        b.ev("document.querySelector('[data-tab=\"tab-home\"]').click(); true")
        time.sleep(0.6)
        # 星象标签页：首块今日星象实值 + 星官图鉴（懒加载走真实网络）
        b.ev("document.querySelector('[data-tab=\"tab-stars\"]').click(); true")
        ok287 = b.wait("(document.getElementById('sx-home') || {}).textContent.includes('287')", 40)
        chips = b.ev("document.querySelectorAll('#sx-home .sx-chips [data-sx-region]').length")
        sky = b.ev("""(() => { const sky = document.getElementById('today-sky-card');
          const sxHome = document.getElementById('sx-home');
          return { xiu: (document.getElementById('sx-sky-xiu') || {}).textContent || '',
            moon: (document.getElementById('sx-sky-moon-sub') || {}).textContent || '',
            first: !!(sky.compareDocumentPosition(sxHome) & Node.DOCUMENT_POSITION_FOLLOWING) }; })()""")
        report(tag + " 星象页今日星象实值+287+宿签28", ok287 and chips == 28 and bool(sky["xiu"]) and "%" in sky["moon"] and sky["first"], sky)
        # (6) 区页返回回到来处（线上实测路径①）：经文分架→步天歌→本区图鉴→区页→返回＝步天歌
        b.ev("document.querySelector('[data-tab=\"tab-jing\"]').click(); true")
        time.sleep(0.6)
        b.ev("document.getElementById('sx-jing-shelf').click(); true")
        okbtg = b.wait("!document.getElementById('view-butiange').hidden", 20)
        b.ev("(() => { const k = document.querySelector('#sx-sec-牛宿 .sx-toregion'); if (k) k.click(); return !!k; })()")
        okreg = b.wait("!document.getElementById('view-star-region').hidden && document.getElementById('view-butiange').hidden", 20)
        b.ev("document.getElementById('star-region-back').click(); true")
        time.sleep(0.6)
        back = b.ev("!document.getElementById('view-butiange').hidden && document.getElementById('view-star-region').hidden")
        report(tag + " (6)步天歌→区页→返回＝步天歌", okbtg and okreg and back, "btg=%s reg=%s back=%s" % (okbtg, okreg, back))
        # (7) 神祇详情「本宿星官 ›」线上真点击：毕月乌→毕宿区页（最上层）→返回＝毕月乌详情
        b.ev("document.querySelector('[data-tab=\"tab-home\"]').click(); true")
        time.sleep(0.6)
        b.ev("document.getElementById('deities-entry-card').click(); true")
        okcard = b.wait("!!document.querySelector('[data-deity=\"biyuewu\"]')", 20)
        b.ev("document.querySelector('[data-deity=\"biyuewu\"]').click(); true")
        okname = b.wait("!document.getElementById('view-deity-detail').hidden && document.getElementById('deity-detail-name').textContent.includes('毕月乌')", 20)
        haskey = b.ev("!!document.querySelector('#deity-star-link .sx-deity-starlink')")
        b.ev("(() => { const k = document.querySelector('#deity-star-link .sx-deity-starlink'); if (k) k.click(); })()")
        okreg2 = b.wait("!document.getElementById('view-star-region').hidden && (document.querySelector('#sx-region .sx-title') || {}).textContent.includes('毕宿')", 20)
        top2 = b.ev("""(() => { const el = document.elementFromPoint(Math.floor(innerWidth/2), Math.floor(innerHeight/2));
          const rv = document.getElementById('view-star-region'); return !!(el && rv && !rv.hidden && rv.contains(el)); })()""")
        b.ev("document.getElementById('star-region-back').click(); true")
        time.sleep(0.6)
        backd = b.ev("document.getElementById('view-star-region').hidden && !document.getElementById('view-deity-detail').hidden && document.getElementById('deity-detail-name').textContent.includes('毕月乌')")
        report(tag + " (7)详情本宿星官→毕宿区页→返回＝详情", bool(okcard and okname and haskey and okreg2 and top2 and backd),
               "card=%s name=%s key=%s region=%s top=%s back=%s" % (okcard, okname, haskey, okreg2, top2, backd))
        b.ev("document.getElementById('deity-detail-back').click(); true")
        time.sleep(0.4)
        b.shot("live-" + tag)
    finally:
        b.close()


import sys as _s
if "CF" not in _s.argv: run(t34.GH, "GH")
if "GH" not in _s.argv: run(t34.CF, "CF")
print("\n==== live %d/%d PASS ====" % (sum(t34.RESULTS), len(t34.RESULTS)))
if not all(t34.RESULTS):
    sys.exit(1)
