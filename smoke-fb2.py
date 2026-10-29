#!/usr/bin/env python3
# 阅读器真机反馈第二批（items 1-9）逐项冒烟：
#  1 划线弹窗去原文引文＋恒居中＋两行制（按钮一行/八色一行）
#  2 播放胶囊 opacity .55（CSS 值＋实播 opportunistically）
#  3 底栏改名 诵读/跟读＋排版，360 档六钮一行
#  4 TTS 悬浮胶囊（暂停冻结看门狗/继续/停止，面板钮面同步）
#  5 TTS 中文语音选择（列名照原样、持久化、下一句生效）
#  6 道藏 KR 书无底本框（精选 s40 回归仍显）
#  7 经文页三行收一行三格
#  8 每周阅读总结（上周种子、弹一次、回看、分享出图）
#  9 阅读统计上云（页内假服务端双设备分桶合并：相加/max 防双计/不膨胀/登出本地照常）
# 用法: python3 smoke-fb2.py
import importlib.util, json, os, subprocess, sys, time, urllib.request, hashlib, datetime
spec = importlib.util.spec_from_file_location("smoke_base", os.path.expanduser("~/workspace/wuri-app/smoke-test.py"))
base = importlib.util.module_from_spec(spec); sys.modules["smoke_base"] = base; spec.loader.exec_module(base)
WWW = os.path.expanduser("~/workspace/.wt/reader-fb2/www")
SHOTS = os.path.expanduser("~/workspace/.wt/reader-fb2/fb2-shots")
os.makedirs(SHOTS, exist_ok=True)
_WG = "/tmp/wuri-webgl-policy.txt"
open(_WG, "w").write("hatch-webgl-all-origins-v1\n")
_WG_SHA = hashlib.sha256(open(_WG, "rb").read()).hexdigest()
PASS, FAIL = [], []
def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("PASS " if cond else "FAIL ") + label)

# 上周（本地周一起）日期锚：今天往回找到本周一，再减 7 天
today = datetime.date.today()
monday_this = today - datetime.timedelta(days=(today.weekday()))
mon_last = monday_this - datetime.timedelta(days=7)
def dk(d): return d.strftime("%Y-%m-%d")
WK_WED = dk(mon_last + datetime.timedelta(days=2))
WK_FRI = dk(mon_last + datetime.timedelta(days=4))
WK_THU_TS = int(datetime.datetime.combine(mon_last + datetime.timedelta(days=3), datetime.time(12, 0)).timestamp() * 1000)
TODAYK = dk(today)

TTS_STUB = r"""
window.__ttsCalls=[]; window.__ttsUtter=[];
var fakeSS={ _v:[
  {name:'中文语音甲',lang:'zh-CN',voiceURI:'fake-zh-a'},
  {name:'中文语音乙',lang:'zh-TW',voiceURI:'fake-zh-b'},
  {name:'English US',lang:'en-US',voiceURI:'fake-en'}],
 getVoices:function(){return this._v;},
 addEventListener:function(){}, removeEventListener:function(){},
 speak:function(u){window.__ttsCalls.push(u.text); window.__ttsUtter.push(u);
   u._t=setTimeout(function(){ if(u.onend) u.onend(); },40);},
 cancel:function(){window.__ttsUtter.forEach(function(u){ if(u._t) clearTimeout(u._t); });},
 pause:function(){}, resume:function(){}, speaking:false, pending:false, paused:false };
try{ Object.defineProperty(window,'speechSynthesis',{value:fakeSS,configurable:true}); }catch(e){ window.speechSynthesis=fakeSS; }
window.SpeechSynthesisUtterance=function(t){this.text=t;this.lang='';this.rate=1;this.voice=null;this.onend=null;this.onerror=null;};
window.__dl=0;
try{ var _oc=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){ window.__dl++; }; }catch(e){}
"""

class Sess:
    def __init__(self, seed_js="", vw=360, vh=740):
        port = base.free_port(); prof = "/tmp/chrome-fb2-%d" % port
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
        src = ("window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message||e));});\n"
               "window.__dl=0; try{ HTMLAnchorElement.prototype.click=function(){ window.__dl++; }; }catch(e){}\n"
               "try{ localStorage.setItem('wuri_pro_redeem','1'); localStorage.setItem('wuri_jing_py','1'); }catch(e){}\n" + seed_js)
        self.c.call("Page.addScriptToEvaluateOnNewDocument", {"source": src})
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
            time.sleep(0.4)
        return False
    def shot(self, name):
        r = self.c.call("Page.captureScreenshot", {"format": "png"})
        import base64
        open(os.path.join(SHOTS, name), "wb").write(base64.b64decode(r["data"]))
    def close(self):
        try: self.proc.terminate()
        except Exception: pass

def goto_jing(s):
    s.wait("!!document.querySelector('#jing-list .jing-sec-h')", 40)
    s.ev(r"""(function(){var els=[...document.querySelectorAll('button,a,div,span')].filter(e=>e.children.length===0&&e.textContent.trim()==='经文');if(els.length)els[0].click();})()""")
    s.wait("!!document.querySelector('[data-neidan-toggle]')", 25)

# ================= 会话 A：items 7 / 3 / 1 / 2 =================
s = Sess()
try:
    goto_jing(s)
    # ---------- item 7：一行三格 ----------
    trio = s.ev(r"""(function(){var t=document.querySelector('#jing-trio');if(!t)return null;
      var cs=[...t.querySelectorAll('.jing-trio-cell')];
      return {n:cs.length, tops:cs.map(c=>Math.round(c.getBoundingClientRect().top)),
        w:Math.round(t.getBoundingClientRect().width), sw:t.scrollWidth,
        sum:(document.querySelector('#jing-stats-sum')||{}).textContent||'',
        vc:(document.querySelector('#jing-vocab-count')||{}).textContent||'',
        mc:(document.querySelector('#jing-marks-count')||{}).textContent||''};})()""")
    ok(trio and trio["n"] == 3, "item7 三格齐（%s）" % (trio and trio["n"]))
    ok(trio and max(trio["tops"]) - min(trio["tops"]) <= 2, "item7 三格同一行 tops=%s" % (trio and trio["tops"]))
    ok(trio and trio["w"] <= 360 and trio["sw"] <= 362, "item7 整行不溢出 w=%s sw=%s" % (trio and trio["w"], trio and trio["sw"]))
    ok(trio and trio["sum"].startswith("今日"), "item7 统计格短文案「%s」" % (trio and trio["sum"]))
    ok(trio and "词" in trio["vc"] and "条" in trio["mc"], "item7 生词/标记格数字「%s」「%s」" % (trio and trio["vc"], trio and trio["mc"]))
    s.ev("document.querySelector('#jing-stats-row').click()")
    ok(s.wait("!!document.querySelector('#jing-stats-detail') && !document.querySelector('#jing-stats-detail').hidden && !!document.querySelector('#jing-wk-review')", 6),
       "item7 点统计格→明细展开且含「上周总结」入口")
    s.ev("document.querySelector('#jing-stats-row').click()")
    s.ev("document.querySelector('#jing-vocab-row').click()")
    ok(s.wait("!!document.querySelector('#jing-vocab-panel') && !document.querySelector('#jing-vocab-panel').hidden", 6), "item7 点生词格→生词面板展开")
    s.ev("document.querySelector('#jing-vocab-row').click()")
    s.shot("trio-day.png")

    # ---------- item 3 + 2：开 s07《道德真经》（多节＋有注音→六钮全显） ----------
    s.ev(r"""(function(){var el=document.querySelector('#jing-list [data-jing="s07"]');if(el)el.click();})()""")
    ok(s.wait("window._jingCurrentId==='s07'", 15), "item3 开 s07 道德真经")
    time.sleep(1.2)
    dock = s.ev(r"""(function(){var m=document.querySelector('#jing-dock-main');if(!m)return null;
      var bs=[...m.querySelectorAll('.jd-btn')].filter(b=>!b.hidden && b.getBoundingClientRect().width>0);
      return {labels:bs.map(b=>b.textContent.trim()),
        tops:bs.map(b=>Math.round(b.getBoundingClientRect().top)),
        sw:m.scrollWidth, cw:m.clientWidth,
        fabOp:getComputedStyle(document.querySelector('#jing-play-fab')).opacity};})()""")
    ok(dock and "诵读/跟读" in dock["labels"], "item3 钮面「诵读/跟读」在列 %s" % (dock and dock["labels"]))
    ok(dock and "排版" in dock["labels"], "item3 钮面「排版」在列 %s" % (dock and dock["labels"]))
    ok(dock and len(dock["labels"]) == 6 and max(dock["tops"]) - min(dock["tops"]) <= 2,
       "item3 底栏六钮一排 tops=%s" % (dock and dock["tops"]))
    ok(dock and dock["sw"] <= dock["cw"] + 1, "item3 底栏无横向溢出 sw=%s cw=%s" % (dock and dock["sw"], dock and dock["cw"]))
    ok(dock and dock["fabOp"] == "0.55", "item2 播放胶囊 computed opacity=%s" % (dock and dock["fabOp"]))
    s.ev("document.querySelector('#jing-read-btn').click()")
    time.sleep(0.6)
    errs = s.ev("window.__errs")
    ok(not errs, "会话A 无 JS 报错 %s" % (errs[:3] if errs else ""))
finally:
    s.close()

# ================= 会话 A2：item 1 划线弹窗 =================
s = Sess()
try:
    goto_jing(s)
    s.ev(r"""(function(){var el=document.querySelector('#jing-list [data-jing="s02"]');if(el)el.click();})()""")
    s.wait("window._jingCurrentId==='s02'", 15)
    time.sleep(1.0)
    s.ev(r"""(function(){var ps=[...document.querySelectorAll('#jing-content .jing-para')];ps.sort((a,b)=>b.textContent.length-a.textContent.length);var p=ps[0];var r=document.createRange();r.selectNodeContents(p);var sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()""")
    s.wait("!!document.querySelector('#hl-pop') && !document.querySelector('#hl-pop').hidden && !!document.querySelector('#hl-pop [data-hl-color]')", 10)
    pop = s.ev(r"""(function(){var p=document.querySelector('#hl-pop');var r=p.getBoundingClientRect();
      var rows=[...p.querySelectorAll('.hl-pop-row')];
      var cols=[...p.querySelectorAll('[data-hl-color]')];
      return {quote:!!p.querySelector('.hl-pop-quote'), card:!!p.querySelector('.hl-pop-card'),
        rows:rows.length,
        row1:rows.length?[...rows[0].querySelectorAll('button')].map(b=>b.textContent.trim()):[],
        nCol:cols.length, colTops:cols.map(c=>Math.round(c.getBoundingClientRect().top)),
        cx:Math.round(r.left+r.width/2), w:Math.round(r.width)};})()""")
    ok(pop and not pop["quote"] and not pop["card"], "item1 新选区态无原文引文区")
    ok(pop and pop["rows"] == 2 and pop["row1"] == ["分享", "图卡", "取消"], "item1 按钮一行 %s" % (pop and pop["row1"]))
    ok(pop and pop["nCol"] == 8 and max(pop["colTops"]) - min(pop["colTops"]) <= 2, "item1 八色一行 tops=%s" % (pop and pop["colTops"]))
    ok(pop and abs(pop["cx"] - 180) <= 8 and pop["w"] <= 360, "item1 弹窗居中 cx=%s w=%s" % (pop and pop["cx"], pop and pop["w"]))
    s.shot("hlpop-new.png")
    s.ev("document.querySelector('#hl-pop [data-hl-color=\"yellow\"]').click()")
    s.wait("!!document.querySelector('#hl-pop #hl-note')", 8)
    pop2 = s.ev(r"""(function(){var p=document.querySelector('#hl-pop');
      return {quote:!!p.querySelector('.hl-pop-quote'),
        noteBtn:(document.querySelector('#hl-note')||{}).textContent||'',
        hasDel:!!document.querySelector('#hl-del'),
        nRe:[...p.querySelectorAll('[data-hl-recolor]')].length};})()""")
    ok(pop2 and not pop2["quote"], "item1 落色重开小卡仍无原文引文")
    ok(pop2 and pop2["noteBtn"] == "写想法" and pop2["hasDel"] and pop2["nRe"] == 8, "item1 已有态：写想法/删除/八色换色齐 %s" % pop2)
    # 写想法 → 再点划线：想法显、引文不显、居中
    s.ev("document.querySelector('#hl-note').click()")
    s.wait("!!document.querySelector('#note-modal')", 8)
    s.ev(r"""(function(){document.querySelector('#note-input').value='此处言守一之法';})()""")
    s.ev("document.querySelector('#note-save').click()")
    time.sleep(0.6)
    s.ev(r"""(function(){var h=document.querySelector('#jing-content .hl');if(h)h.click();})()""")
    s.wait("!!document.querySelector('#hl-pop .hl-pop-note')", 8)
    if not s.wait("(function(){var p=document.querySelector('#hl-pop');return p && !p.hidden && p.getBoundingClientRect().width>0;})()", 6):
        s.ev(r"""(function(){var h=document.querySelector('#jing-content .hl');if(h)h.click();})()""")
        s.wait("(function(){var p=document.querySelector('#hl-pop');return p && !p.hidden && p.getBoundingClientRect().width>0;})()", 6)
    pop3 = s.ev(r"""(function(){var p=document.querySelector('#hl-pop');var r=p.getBoundingClientRect();
      return {note:(p.querySelector('.hl-pop-note')||{}).textContent||'',
        quote:!!p.querySelector('.hl-pop-quote'),
        noteBtn:(document.querySelector('#hl-note')||{}).textContent||'',
        cx:Math.round(r.left+r.width/2),
        rows:[...p.querySelectorAll('.hl-pop-row')].length};})()""")
    ok(pop3 and "守一之法" in pop3["note"], "item1 点已有划线→想法仍显「%s」" % (pop3 and pop3["note"][:20]))
    ok(pop3 and not pop3["quote"] and pop3["noteBtn"] == "改想法", "item1 点已有划线→无引文＋钮面改想法")
    ok(pop3 and abs(pop3["cx"] - 180) <= 8 and pop3["rows"] == 2, "item1 点开态恒居中 cx=%s 两行" % (pop3 and pop3["cx"]))
    s.shot("hlpop-existing.png")
    errs = s.ev("window.__errs")
    ok(not errs, "会话A2 无 JS 报错 %s" % (errs[:3] if errs else ""))
finally:
    s.close()

# ================= 会话 B：items 8 / 9 =================
seed_stats = json.dumps({"days": {WK_WED: 1500, WK_FRI: 900}, "fin": {"s1": WK_THU_TS}, "total": 2400})
seed_js = ("try{ localStorage.setItem('wuri_jing_stats_v1', %s); localStorage.removeItem('wuri_jing_wk_shown'); }catch(e){}\n" % json.dumps(seed_stats))
s = Sess(seed_js=seed_js)
try:
    goto_jing(s)
    time.sleep(0.8)
    # ---------- item 8：新周首开弹上周总结 ----------
    wk = s.ev(r"""(function(){var c=document.querySelector('#jing-wk-card');if(!c)return null;
      return {hidden:c.hidden, text:c.textContent.replace(/\s+/g,' ')};})()""")
    ok(wk and not wk["hidden"], "item8 新周首开总结卡弹出")
    ok(wk and "40 分钟" in wk["text"] and "2 天" in wk["text"] and "读完 1 本" in wk["text"],
       "item8 卡面数据＝种子（40分钟/2天/读完1本）「%s」" % (wk and wk["text"][:60]))
    s.shot("wkcard-day.png")
    s.ev("document.querySelector('#jing-wk-close').click()")
    ok(s.ev("document.querySelector('#jing-wk-card').hidden"), "item8 关闭后隐藏")
    s.ev("window.__wuriStats.render()")
    time.sleep(0.4)
    ok(s.ev("document.querySelector('#jing-wk-card').hidden"), "item8 本周内不再弹（旗标生效）")
    # 统计明细回看入口
    s.ev("document.querySelector('#jing-stats-row').click()")
    s.wait("!!document.querySelector('#jing-wk-review')", 6)
    s.ev("document.querySelector('#jing-wk-review').click()")
    time.sleep(0.4)
    ok(s.ev("!!document.querySelector('#jing-wk-card') && !document.querySelector('#jing-wk-card').hidden"),
       "item8 统计明细「上周总结」可回看")
    # 分享出图（走等图标管线→无 navigator.share 时回落下载锚点击）
    dl0 = s.ev("window.__dl")
    s.ev("document.querySelector('#jing-wk-share').click()")
    t0 = time.time()
    while time.time() - t0 < 10 and s.ev("window.__dl") <= dl0: time.sleep(0.5)
    ok(s.ev("window.__dl") > dl0, "item8 分享→图卡生成并触发下载/分享（dl=%s）" % s.ev("window.__dl"))
    ok(s.ev("(function(){var f=localStorage.getItem('wuri_jing_wk_shown');return !!f;})()"), "item8 旗标已落盘")

    # ---------- item 9：双设备分桶合并（页内假服务端） ----------
    s.ev(r"""(function(){
      window.__srv={};
      var mk=function(dev){ return {
        _deviceId:function(){ return dev.id; },
        _syncEnabled:function(){ return dev.on; },
        _syncPushItems:function(items){ items.forEach(function(it){ window.__srv[it.dataset+'|'+it.key]={value:it.value,updated_at:it.updated_at}; }); return Promise.resolve({status:200,body:{ok:true}}); },
        _syncPullAll:function(){ var out=[]; Object.keys(window.__srv).forEach(function(k){ var p=k.split('|'); out.push({dataset:p[0],key:p[1],value:window.__srv[k].value,updated_at:window.__srv[k].updated_at,deleted:0}); }); return Promise.resolve(out); }
      };};
      window.__devA={id:'dev-A',on:true}; window.__devB={id:'dev-B',on:true};
      window.__mkAcct=mk;
      window.WuriAccount=mk(window.__devA);
    })()""")
    today_seed = json.dumps({"days": {TODAYK: 600}, "fin": {"s1": int(time.time() * 1000)}, "total": 600})
    s.ev("(function(){localStorage.setItem('wuri_jing_stats_v1', %s); localStorage.removeItem('wuri_jing_stats_remote_v1');})()" % json.dumps(today_seed))
    s.ev("window.__wuriStats.push()")
    time.sleep(0.5)
    ok(s.ev("!!window.__srv['jing.stats|dev-A']"), "item9 设备A 桶已推上服务端")
    # 切设备 B（本地另一份统计＋清远程缓存模拟新设备）
    b_seed = json.dumps({"days": {TODAYK: 300}, "fin": {"sX": int(time.time() * 1000)}, "total": 300})
    s.ev("(function(){window.WuriAccount=window.__mkAcct(window.__devB); localStorage.setItem('wuri_jing_stats_v1', %s); localStorage.removeItem('wuri_jing_stats_remote_v1');})()" % json.dumps(b_seed))
    s.ev("window.__wuriStats.push()")
    time.sleep(0.5)
    s.ev("window.__wuriStats.pull()")
    ok(s.wait("(function(){var m=window.__wuriStats.merged(); return m.days['%s']===900;})()" % TODAYK, 8),
       "item9 双设备同日合并相加 600+300=900")
    ok(s.ev("(function(){var m=window.__wuriStats.merged(); return Object.keys(m.fin).length;})()") == 2,
       "item9 读完按书 id 并集去重（2 本）")
    # B 重复同步不膨胀
    s.ev("window.__wuriStats.push()")
    time.sleep(0.4)
    s.ev("window.__wuriStats.pull()")
    time.sleep(0.6)
    ok(s.ev("(function(){var m=window.__wuriStats.merged(); return m.days['%s'];})()" % TODAYK) == 900,
       "item9 重复同步不膨胀（仍 900）")
    # 回到设备 A：自家桶 max 不双计（600 本地 + 自家远端 600 → 取 600，再加 B 的 300 = 900）
    s.ev("(function(){window.WuriAccount=window.__mkAcct(window.__devA); localStorage.setItem('wuri_jing_stats_v1', %s); localStorage.removeItem('wuri_jing_stats_remote_v1');})()" % json.dumps(today_seed))
    s.ev("window.__wuriStats.pull()")
    ok(s.wait("(function(){var m=window.__wuriStats.merged(); return m.days['%s']===900;})()" % TODAYK, 8),
       "item9 自家桶 max 防双计（回 A 仍 900 而非 1500）")
    # 登出（同步关）：push 短路、本地照常记账显示
    s.ev("(function(){window.__devA.on=false; var before=JSON.stringify(window.__srv); window.__wuriStats.push(); window.__srvFrozen=(JSON.stringify(window.__srv)===before);})()")
    time.sleep(0.4)
    ok(s.ev("window.__srvFrozen"), "item9 登出/关同步后 push 短路（服务端不变）")
    s.ev("window.__wuriStats.render()")
    ok(s.ev("(function(){return document.querySelector('#jing-stats-sum').textContent;})()") == "今日 10 分钟",
       "item9 登出后本地照常显示（今日 10 分钟）")
    # 周结读合并视图（种子在本地 + 远程空时不回归）
    errs = s.ev("window.__errs")
    ok(not errs, "会话B 无 JS 报错 %s" % (errs[:3] if errs else ""))
finally:
    s.close()

# ================= 会话 C：items 6 / 4 / 5 =================
s = Sess(seed_js=TTS_STUB)
try:
    goto_jing(s)
    # ---------- item 6：道藏 KR 书无底本框 ----------
    s.ev("window.__wuri_dzOpenWork('KR5a0001')")
    s.wait("window._jingCurrentId==='KR5a0001'", 30)
    s.wait("!!document.querySelector('#jing-content .jing-sec')", 30)
    time.sleep(1.0)
    dz = s.ev(r"""(function(){var sn=document.querySelector('#jing-srcnote'), st=document.querySelector('#jing-subtitle');
      return {snHidden:sn?sn.hidden:null, snText:sn?sn.textContent:'', stHidden:st?st.hidden:null,
        secs:document.querySelectorAll('#jing-content .jing-sec').length};})()""")
    ok(dz and dz["snHidden"] and dz["stHidden"], "item6 KR 书书头无底本框/无副题行")
    ok(dz and dz["secs"] > 0, "item6 KR 书正文首节正常（%s 节）" % (dz and dz["secs"]))
    s.shot("dz-nobase.png")
    # 精选回归：s40 悟真篇来源标注仍在（不在本条范围）
    s.ev("window.JingWen.openReader('s40')")
    s.wait("window._jingCurrentId==='s40'", 20)
    time.sleep(1.0)
    s40 = s.ev(r"""(function(){var sn=document.querySelector('#jing-srcnote');
      return {hidden:sn?sn.hidden:null, text:sn?sn.textContent:''};})()""")
    ok(s40 and not s40["hidden"] and "底本" in s40["text"], "item6 精选 s40 来源标注回归不变「%s」" % (s40 and s40["text"][:30]))

    # ---------- items 4/5：回 KR 书走 TTS ----------
    s.ev("window.__wuri_dzOpenWork('KR5a0001')")
    s.wait("window._jingCurrentId==='KR5a0001'", 30)
    time.sleep(1.0)
    s.ev("document.querySelector('#jing-read-btn').click()")
    time.sleep(0.7)
    grp = s.ev(r"""(function(){var g=document.querySelector('#jing-tts-grp');
      var sel=document.querySelector('#jing-tts-voice');
      var row=document.querySelector('#jing-tts-voice-row');
      return {grpHidden:g?g.hidden:null, rowHidden:row?row.hidden:null,
        opts:sel?[...sel.options].map(o=>o.textContent):[]};})()""")
    ok(grp and not grp["grpHidden"], "item4/5 无录音书读面板显系统朗读组")
    ok(grp and not grp["rowHidden"] and grp["opts"] == ["中文语音甲", "中文语音乙"],
       "item5 语音列表＝设备中文语音照原名 %s" % (grp and grp["opts"]))
    s.ev("document.querySelector('#jing-tts-btn').click()")
    ok(s.wait("window.__ttsCalls.length>0", 10), "item4 TTS 起读（调用链通）")
    time.sleep(0.5)
    fab = s.ev(r"""(function(){var f=document.querySelector('#jing-tts-fab');
      return {hidden:f.hidden, op:getComputedStyle(f).opacity,
        panel:(document.querySelector('#jing-tts-btn')||{}).textContent||''};})()""")
    ok(fab and not fab["hidden"] and fab["op"] == "0.55", "item4 TTS 胶囊出现且半透明 .55")
    ok(fab and fab["panel"] == "暂停朗读", "item4 朗读中面板钮面＝暂停朗读")
    s.shot("tts-fab.png")
    # 暂停：基线在暂停落定后取（点击前在途句不计），3.2s 内 idx/调用数冻结
    # （越过看门狗下限 2.5s 仍不推进＝看门狗已撤、当前句回调已作废）
    s.ev("document.querySelector('#jing-tts-pause').click()")
    time.sleep(0.4)
    ok(s.ev("(function(){var st=window.__wuriTTSState(); return st.on && st.paused;})()"), "item4 胶囊暂停生效")
    ok(s.ev("(function(){return document.querySelector('#jing-tts-btn').textContent;})()") == "继续朗读",
       "item4 胶囊暂停后面板钮面同步＝继续朗读")
    ok(s.ev("(function(){return document.querySelector('#jing-tts-pause').textContent;})()") == "继续",
       "item4 胶囊钮面＝继续")
    idx0 = s.ev("(function(){var st=window.__wuriTTSState(); return st.on?st.idx:-1;})()")
    n0 = s.ev("window.__ttsCalls.length")
    time.sleep(3.2)
    idx1 = s.ev("(function(){var st=window.__wuriTTSState(); return st.on?st.idx:-1;})()")
    n1 = s.ev("window.__ttsCalls.length")
    ok(idx1 == idx0 and n1 == n0, "item4 暂停 3.2s 不推进（idx %s→%s, calls %s→%s）" % (idx0, idx1, n0, n1))
    # 改语音：持久化＋下一句生效
    s.ev(r"""(function(){var sel=document.querySelector('#jing-tts-voice'); sel.value='fake-zh-b'; sel.dispatchEvent(new Event('change',{bubbles:true}));})()""")
    ok(s.ev("localStorage.getItem('wuri_jing_tts_voice')") == "fake-zh-b", "item5 语音选择已持久化")
    s.ev("document.querySelector('#jing-tts-pause').click()")  # 继续
    ok(s.wait("window.__ttsCalls.length>%d" % n1, 8), "item4 胶囊继续→恢复朗读")
    time.sleep(0.4)
    ok(s.ev("(function(){var u=window.__ttsUtter[window.__ttsUtter.length-1]; return u&&u.voice?u.voice.voiceURI:'';})()") == "fake-zh-b",
       "item5 新语音下一句起生效")
    ok(s.ev("(function(){return document.querySelector('#jing-tts-btn').textContent;})()") == "暂停朗读",
       "item4 继续后面板钮面回＝暂停朗读")
    # 停止（胶囊）
    s.ev("document.querySelector('#jing-tts-stop').click()")
    time.sleep(0.4)
    st = s.ev(r"""(function(){return {on:window.__wuriTTSState().on,
      fabHidden:document.querySelector('#jing-tts-fab').hidden,
      panel:document.querySelector('#jing-tts-btn').textContent};})()""")
    ok(st and not st["on"] and st["fabHidden"] and st["panel"] == "系统朗读", "item4 胶囊停止→状态清/胶囊隐/面板钮面复位")
    errs = s.ev("window.__errs")
    ok(not errs, "会话C 无 JS 报错 %s" % (errs[:3] if errs else ""))
finally:
    s.close()

print("\n==== fb2 smoke: PASS %d / FAIL %d ====" % (len(PASS), len(FAIL)))
for f in FAIL: print("  FAILED: " + f)
sys.exit(1 if FAIL else 0)
