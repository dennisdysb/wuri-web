#!/usr/bin/env python3
# 原生弹窗全量换自有弹窗（WuriDlg）冒烟（2026-10-29）：
#  A 组件语义：confirm 取消/确定/遮罩三路、alert 单钮、prompt 输入/取消/遮罩、
#    串行排队不叠层、三态（日/夜/红光）样式在位
#  B 真实调用点逐个 DOM 触发：我的标记删高亮（截图场景）、阅读统计重置、
#    八字校验 alert×2、ICS 时机 alert、我的日子删除、打卡删习惯、
#    冥想预设改名 prompt、六爻占问 prompt
#  全程装原生弹窗间谍（window.alert/confirm/prompt 计数），结束须为 0。
# 用法: python3 smoke-dialogs.py
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/.wt/dialogs/www")
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
PASS, FAIL = [], []
def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("PASS " if cond else "FAIL ") + label)

SEED = r"""
window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});
window.__nativeCalls=0;
['alert','confirm','prompt'].forEach(function(k){
  window[k]=function(){ window.__nativeCalls++; return k==='confirm'?false:null; };
});
try{
  localStorage.setItem('wuri_pro_redeem','1');
  localStorage.setItem('wuri_jing_highlights', JSON.stringify([
    {id:'hl_smoke1', sid:'s02', color:'red', text:'冒烟测试高亮', ts:Date.now()}]));
  localStorage.setItem('wuri_jing_stats_v1', JSON.stringify({days:{}, fin:{}, total:600}));
  localStorage.setItem('wuri_mydays', JSON.stringify([
    {id:'md1', name:'冒烟日子', cal:'solar', m:1, d:1, icon:'', remind:{on:false,kinds:['today'],customDays:0,time:'08:00'}}]));
  localStorage.setItem('wuri_daka_habits', JSON.stringify([
    {id:'hab_smoke1', name:'冒烟习惯', type:'count', icon:'✦', preset:false}]));
  localStorage.setItem('wuri_daka_habits_init','1');
}catch(e){}
"""

class Sess:
    def __init__(self, vw=360, vh=740):
        port = base.free_port(); prof = "/tmp/chrome-dlg-%d" % port
        env = dict(os.environ); env["TZ"] = "America/Toronto"
        self.proc = subprocess.Popen([base.CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
            "--allow-file-access-from-files",
            "--hatch-webgl-allowed-domains-file=" + _WG, "--hatch-webgl-allowed-domains-sha256=" + _WG_SHA,
            "--remote-debugging-port=%d" % port, "--user-data-dir=" + prof,
            "--window-size=%d,%d" % (vw, vh),
            "--autoplay-policy=no-user-gesture-required", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
        wsurl = None
        for _ in range(120):
            try:
                tg = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port, timeout=3))
                pg = [t for t in tg if t.get("type") == "page"]
                if pg: wsurl = pg[0]["webSocketDebuggerUrl"]; break
            except Exception: pass
            time.sleep(0.5)
        self.c = base.CDP(base.ws_connect(wsurl))
        self.c.call("Page.enable"); self.c.call("Runtime.enable")
        self.c.call("Emulation.setDeviceMetricsOverride", {"width": vw, "height": vh, "deviceScaleFactor": 2, "mobile": True})
        self.c.call("Page.addScriptToEvaluateOnNewDocument", {"source": SEED})
        self.c.call("Page.navigate", {"url": "file://" + WWW + "/index.html"})
    def ev(self, expr):
        r = self.c.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True}, timeout=90)
        if r.get("exceptionDetails"): raise RuntimeError(str(r["exceptionDetails"])[:400] + " || " + expr[:120])
        return r["result"].get("value")
    def wait(self, expr, secs=20):
        t0 = time.time()
        while time.time() - t0 < secs:
            try:
                if self.ev(expr): return True
            except Exception: pass
            time.sleep(0.3)
        return False
    def close(self):
        try: self.proc.terminate()
        except Exception: pass

MASK = "document.querySelector('.wdlg-mask')"
def main():
    s = Sess()
    try:
        ok(s.wait("typeof window.WuriDlg==='object' && document.readyState==='complete'", 40), "页面就绪＋WuriDlg 在位")

        # ---------- A 组件语义 ----------
        s.ev("window.__r='pending'; WuriDlg.confirm('删除这条高亮？它的心得也会一起删除。','删除').then(function(v){window.__r=v;}); 'x'")
        ok(s.wait(MASK + " && " + MASK + ".querySelector('.hd-pick-title').textContent.indexOf('删除这条高亮')>=0", 8), "A1 confirm 弹层出现且文案对")
        ok(s.ev(MASK + ".querySelector('#wdlg-ok').textContent") == "删除", "A2 确定钮文案=删除")
        ok(s.ev(MASK + ".querySelector('#wdlg-ok').classList.contains('hd-dlg-danger')"), "A3 确定钮为朱砂危险样式")
        ok(s.ev(MASK + ".querySelector('#wdlg-cancel').textContent") == "取消", "A4 取消钮在位")
        ok(s.ev("getComputedStyle(" + MASK + ").zIndex") in ("100200",), "A5 弹层 z 序 100200")
        bg = s.ev("getComputedStyle(" + MASK + ".querySelector('.hd-pick-sheet')).backgroundColor")
        ok(bg == "rgb(252, 250, 242)", "A6 日间卡面=宣纸卡色（" + str(bg) + "）")
        s.ev(MASK + ".querySelector('#wdlg-cancel').click(); 'x'")
        ok(s.wait("window.__r===false", 6), "A7 点取消→false")
        ok(s.wait("!" + MASK, 6), "A8 弹层已撤")

        s.ev("window.__r='pending'; WuriDlg.confirm('删除这条心得？','删除').then(function(v){window.__r=v;}); 'x'")
        s.wait(MASK, 8); s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'")
        ok(s.wait("window.__r===true", 6), "A9 点确定→true")

        s.ev("window.__r='pending'; WuriDlg.confirm('遮罩测试','删除').then(function(v){window.__r=v;}); 'x'")
        s.wait(MASK, 8); s.ev("var m=" + MASK + "; m.dispatchEvent(new MouseEvent('click',{bubbles:true})); 'x'")
        ok(s.wait("window.__r===false", 6), "A10 点遮罩→false（取消语义）")

        s.ev("window.__r='pending'; WuriDlg.alert('请填写名称').then(function(){window.__r='done';}); 'x'")
        ok(s.wait(MASK + " && !" + MASK + ".querySelector('#wdlg-cancel')", 8), "A11 alert 只有单钮")
        ok(s.ev(MASK + ".querySelector('#wdlg-ok').textContent") == "确定", "A12 alert 钮文案=确定")
        s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'")
        ok(s.wait("window.__r==='done' && !document.querySelector('.wdlg-mask')", 6), "A13 alert 点确定→关闭并 resolve")

        s.ev("window.__r='pending'; WuriDlg.prompt('预设名（如：晚课前）','','保存').then(function(v){window.__r=v;}); 'x'")
        ok(s.wait("!!(" + MASK + " && " + MASK + ".querySelector('#wdlg-inp'))", 8), "A14 prompt 带输入框")
        s.ev("var i=" + MASK + ".querySelector('#wdlg-inp'); i.value='晚课前'; " + MASK + ".querySelector('#wdlg-ok').click(); 'x'")
        ok(s.wait("window.__r==='晚课前'", 6), "A15 prompt 输入→确定返回输入值")
        s.ev("window.__r='pending'; WuriDlg.prompt('占问事由','旧值','保存').then(function(v){window.__r=(v===null?'NULL':v);}); 'x'")
        s.wait(MASK, 8)
        ok(s.ev(MASK + ".querySelector('#wdlg-inp').value") == "旧值", "A16 prompt 默认值回填")
        s.ev(MASK + ".querySelector('#wdlg-cancel').click(); 'x'")
        ok(s.wait("window.__r==='NULL'", 6), "A17 prompt 取消→null（与原生一致）")

        # 串行排队：confirm 与 alert 同时发起，只许一层在场
        s.ev("window.__q=[]; WuriDlg.confirm('第一层','删除').then(function(v){window.__q.push('c'+v);});"
             "WuriDlg.alert('第二层').then(function(){window.__q.push('a');}); 'x'")
        s.wait(MASK, 8); time.sleep(0.6)
        ok(s.ev("document.querySelectorAll('.wdlg-mask').length") == 1, "A18 双弹窗串行不叠层")
        s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'")
        ok(s.wait(MASK + " && " + MASK + ".textContent.indexOf('第二层')>=0", 8), "A19 第一层关闭后第二层接续")
        s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'")
        ok(s.wait("window.__q.length===2 && !document.querySelector('.wdlg-mask')", 6), "A20 队列两层依次走完")

        # 夜态
        s.ev("document.documentElement.setAttribute('data-theme','night');"
             "window.__r='pending'; WuriDlg.confirm('夜态测试','删除').then(function(v){window.__r=v;}); 'x'")
        s.wait(MASK, 8)
        bg2 = s.ev("getComputedStyle(" + MASK + ".querySelector('.hd-pick-sheet')).backgroundColor")
        ok(bg2 == "rgb(14, 14, 18)", "A21 夜态卡面=玄黑卡色（" + str(bg2) + "）")
        s.ev(MASK + ".querySelector('#wdlg-cancel').click(); 'x'"); s.wait("window.__r===false", 6)
        # 红光态
        s.ev("document.documentElement.setAttribute('data-theme','day'); document.body.classList.add('sky-red');"
             "window.__r='pending'; WuriDlg.confirm('红光测试','删除').then(function(v){window.__r=v;}); 'x'")
        s.wait(MASK, 8)
        ok(s.ev("!!" + MASK + " && " + MASK + ".querySelector('#wdlg-ok').offsetParent!==null"), "A22 红光态弹层可见")
        s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'"); s.wait("window.__r===true", 6)
        s.ev("document.body.classList.remove('sky-red'); 'x'")

        # ---------- B 真实调用点 ----------
        # B1 我的标记删高亮（用户截图场景）
        s.ev("document.querySelector('#tabbar [data-tab=\"tab-jing\"]').click(); 'x'")
        s.wait("window.JingShowMarks", 10)
        s.ev("window.JingShowMarks('highlight'); 'x'")
        ok(s.wait("!!document.querySelector('[data-del-hl=\"hl_smoke1\"]')", 10), "B1 标记页高亮条渲染")
        s.ev("document.querySelector('[data-del-hl=\"hl_smoke1\"]').click(); 'x'")
        ok(s.wait(MASK + " && " + MASK + ".textContent.indexOf('删除这条高亮')>=0", 8), "B1 点删除→自有弹窗（非原生）")
        s.ev(MASK + ".querySelector('#wdlg-cancel').click(); 'x'")
        ok(s.wait("JSON.parse(localStorage.getItem('wuri_jing_highlights')).length===1", 6), "B1 取消→高亮保留")
        s.ev("document.querySelector('[data-del-hl=\"hl_smoke1\"]').click(); 'x'")
        s.wait(MASK, 8); s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'")
        ok(s.wait("JSON.parse(localStorage.getItem('wuri_jing_highlights')).length===0", 8), "B1 确定→高亮删除")

        # B2 阅读统计重置
        s.ev("document.querySelector('#tabbar [data-tab=\"tab-me\"]').click(); 'x'")
        s.wait("document.getElementById('settings-open')", 10)
        s.ev("document.getElementById('settings-open').click(); 'x'")
        ok(s.wait("document.getElementById('stats-reset-btn') && !document.getElementById('view-settings').hidden", 10), "B2 设置页打开")
        s.ev("document.getElementById('stats-reset-btn').click(); 'x'")
        ok(s.wait(MASK + " && " + MASK + ".textContent.indexOf('重置阅读统计')>=0", 8), "B2 点重置→自有弹窗")
        ok(s.ev(MASK + ".querySelector('#wdlg-ok').textContent") == "重置", "B2 确定钮文案=重置")
        s.ev(MASK + ".querySelector('#wdlg-cancel').click(); 'x'")
        ok(s.wait("(JSON.parse(localStorage.getItem('wuri_jing_stats_v1')||'{}').total||0)===600", 6), "B2 取消→统计不动")
        s.ev("document.getElementById('stats-reset-btn').click(); 'x'")
        s.wait(MASK, 8); s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'")
        ok(s.wait("!localStorage.getItem('wuri_jing_stats_v1') || (JSON.parse(localStorage.getItem('wuri_jing_stats_v1')||'{}').total||0)===0", 10), "B2 确定→统计清零")

        # B3 八字校验 alert ×2
        s.ev("document.getElementById('bazi-enter').click(); 'x'")
        ok(s.wait("!document.getElementById('bazi-view').hidden", 10), "B3 八字视图打开")
        s.ev("document.getElementById('bz-date').value=''; document.getElementById('bz-go').click(); 'x'")
        ok(s.wait(MASK + " && " + MASK + ".textContent.indexOf('请选择出生日期')>=0", 8), "B3 空日期→自有 alert")
        s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'"); s.wait("!" + MASK, 6)
        s.ev("document.getElementById('bz-date').value='2999-01-01'; document.getElementById('bz-go').click(); 'x'")
        ok(s.wait(MASK + " && " + MASK + ".textContent.indexOf('出生日期不能是未来')>=0", 8), "B3 未来日期→自有 alert")
        s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'"); s.wait("!" + MASK, 6)

        # B4 ICS 时机 alert（tab-remind）
        s.ev("document.querySelector('#tabbar [data-tab=\"tab-remind\"]').click(); 'x'")
        s.wait("document.getElementById('ics-gen-btn')", 10)
        s.ev("document.getElementById('ics-timing-today').checked=false;"
             "var d1=document.getElementById('ics-timing-day1'); if(d1) d1.checked=false;"
             "var cu=document.getElementById('ics-timing-custom'); if(cu) cu.checked=false;"
             "document.getElementById('ics-gen-btn').click(); 'x'")
        ok(s.wait(MASK + " && " + MASK + ".textContent.indexOf('请至少选择一种提醒时机')>=0", 8), "B4 无时机→自有 alert")
        s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'"); s.wait("!" + MASK, 6)

        # B5 我的日子删除（同在 tab-remind）
        ok(s.wait("!!document.querySelector('.myday-item [data-act=\"del\"]')", 10), "B5 我的日子条渲染")
        s.ev("document.querySelector('.myday-item [data-act=\"del\"]').click(); 'x'")
        ok(s.wait(MASK + " && " + MASK + ".textContent.indexOf('删除这个日子吗')>=0", 8), "B5 点删→自有弹窗")
        s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'")
        ok(s.wait("JSON.parse(localStorage.getItem('wuri_mydays')||'[]').length===0", 8), "B5 确定→日子删除")

        # B6 打卡删习惯（首页入口开修行视图后渲染）
        s.ev("document.querySelector('#tabbar [data-tab=\"tab-home\"]').click(); 'x'")
        s.wait("document.getElementById('practice-enter')", 10)
        s.ev("document.getElementById('practice-enter').click(); 'x'")
        ok(s.wait("!!document.querySelector('#daka-habit-list [data-dact=\"del\"]')", 12), "B6 习惯条渲染")
        s.ev("document.querySelector('#daka-habit-list [data-dact=\"del\"]').click(); 'x'")
        ok(s.wait(MASK + " && " + MASK + ".textContent.indexOf('冒烟习惯')>=0", 8), "B6 点删→自有弹窗含习惯名")
        s.ev(MASK + ".querySelector('#wdlg-cancel').click(); 'x'")
        ok(s.wait("JSON.parse(localStorage.getItem('wuri_daka_habits')).some(function(h){return h.id==='hab_smoke1';})", 6), "B6 取消→习惯保留")
        s.ev("document.querySelector('#daka-habit-list [data-dact=\"del\"]').click(); 'x'")
        s.wait(MASK, 8); s.ev(MASK + ".querySelector('#wdlg-ok').click(); 'x'")
        ok(s.wait("!JSON.parse(localStorage.getItem('wuri_daka_habits')).some(function(h){return h.id==='hab_smoke1';})", 8), "B6 确定→习惯删除")

        # B7 冥想预设改名 prompt
        s.ev("window.Meditation.open(); 'x'")
        ok(s.wait("!!document.querySelector('.med-preset-save')", 12), "B7 冥想视图＋存当前钮渲染")
        s.ev("document.querySelector('.med-preset-save').click(); 'x'")
        ok(s.wait("!!(" + MASK + " && " + MASK + ".querySelector('#wdlg-inp'))", 8), "B7 点存当前→自有输入弹窗")
        s.ev("var i=" + MASK + ".querySelector('#wdlg-inp'); i.value='冒烟预设'; " + MASK + ".querySelector('#wdlg-ok').click(); 'x'")
        ok(s.wait("(JSON.parse(localStorage.getItem('wuri_med_presets')||'[]')).some(function(p){return p.name==='冒烟预设';})", 8), "B7 输入名→预设已存")
        s.ev("document.querySelector('.med-preset-save').click(); 'x'")
        s.wait(MASK, 8); s.ev(MASK + ".querySelector('#wdlg-cancel').click(); 'x'")
        ok(s.wait("JSON.parse(localStorage.getItem('wuri_med_presets')||'[]').length===1", 6), "B7 取消→不新增预设")
        s.ev("if(window.Meditation&&Meditation.back)Meditation.back(); 'x'")

        # B8 六爻占问 prompt
        s.ev("var v=document.getElementById('view-liuyao'); if(v) v.hidden=false;"
             "document.getElementById('ly-shake-all').click(); 'x'")
        ok(s.wait("!!document.getElementById('ly-zhanwen-disp')", 25), "B8 一键出六爻→卦头渲染")
        time.sleep(0.5)
        s.ev("document.getElementById('ly-zhanwen-disp').click(); 'x'")
        ok(s.wait("!!(" + MASK + " && " + MASK + ".querySelector('#wdlg-inp'))", 10), "B8 点占问→自有输入弹窗")
        s.ev("var i=" + MASK + ".querySelector('#wdlg-inp'); i.value='冒烟占问'; " + MASK + ".querySelector('#wdlg-ok').click(); 'x'")
        ok(s.wait("localStorage.getItem('wuri_ly_zhanwen')==='冒烟占问'", 8), "B8 输入→占问事由已存")
        ok(s.ev("document.getElementById('ly-zhanwen-disp').textContent") == "冒烟占问", "B8 占问显示已更新")

        # 全程总账
        ok(s.ev("window.__nativeCalls") == 0, "Z1 全程原生弹窗调用=0")
        errs = s.ev("window.__errs")
        ok(not errs, "Z2 全程无 JS 异常" + ("" if not errs else "：" + str(errs)[:200]))
    finally:
        s.close()
    print("\n==== %d PASS / %d FAIL ====" % (len(PASS), len(FAIL)))
    if FAIL:
        print("FAIL:", FAIL); sys.exit(1)

if __name__ == "__main__":
    main()
