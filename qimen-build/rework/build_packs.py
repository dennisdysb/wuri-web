#!/usr/bin/env python3
"""二审证据包生成：每位神祇 = 图鉴正文（职掌/介绍/形象/道场）+ 现行标签 + 宝诰（App 内有专诰者）。
宝诰来源：s01《正一早晚功课经》各专诰段、s02《全真早晚功课经》晚坛·诸真宝诰、s28《临水夫人宝诰》。
输出 qimen-build/rework/packs/batchN.md（6 批）供二审使用。"""
import json, os

ROOT = os.path.expanduser("~/workspace/wuri-web-rework")
OUT = os.path.join(ROOT, "qimen-build/rework/packs")
os.makedirs(OUT, exist_ok=True)

deities = {d["id"]: d for d in json.load(open(os.path.join(ROOT, "www/content/deities.json")))["deities"]}
tags = {d["id"]: d for d in json.load(open(os.path.expanduser(
    "~/workspace/wuri-ios-reposition/deities/affinity/affinity-tags.json")))["deities"]}

dec = json.JSONDecoder()
def load_jing(fid):
    raw = open(os.path.expanduser(f"~/workspace/wuri-web/www/content/jing/{fid}.js"), encoding="utf-8").read()
    marker = f"JINGWEN['{fid}'] = "
    i = raw.index(marker) + len(marker)
    data, _ = dec.raw_decode(raw[i:])
    return data

def paras_text(sec):
    return "\n".join(p["t"] for p in sec.get("paras", []) if p.get("t"))

s01 = load_jing("s01"); s02 = load_jing("s02"); s28 = load_jing("s28")
sec01 = {s.get("h"): s for s in s01["sections"]}
sec02 = {s.get("h"): s for s in s02["sections"]}

GAO_MAP = {  # deity id -> (来源, 段名)
    "yuanshi": ("s01", "早坛·玉清宝诰"), "lingbao": ("s01", "早坛·上清宝诰"),
    "daode": ("s01", "早坛·太清宝诰"), "yuhuang": ("s01", "早坛·玉皇宝诰"),
    "gouchen": ("s01", "早坛·天皇宝诰"), "ziwei": ("s01", "早坛·星主宝诰"),
    "houtu": ("s01", "早坛·后土宝诰"), "changsheng": ("s01", "早坛·南极宝诰"),
    "taiyi": ("s01", "早坛·救苦宝诰"), "doumu": ("s01", "早坛·斗姥宝诰"),
    "zhenwu": ("s01", "早坛·玄天宝诰"), "zhangdaoling": ("s01", "早坛·老祖天师诰"),
    "gexuan": ("s01", "早坛·葛仙翁诰"), "xuxun": ("s01", "早坛·许真君诰"),
    "dongyue": ("s01", "早坛·东岳宝诰"), "puhua": ("s01", "早坛·普化宝诰"),
    "sashoujian": ("s01", "晚坛·萨祖宝诰"), "sanmao": ("s01", "晚坛·三茅真君宝诰"),
    "wanglingguan": ("s01", "晚坛·王帅诰"),
    "tianguan": ("s01", "早坛·三官宝诰"), "diguan": ("s01", "早坛·三官宝诰"),
    "shuiguan": ("s01", "早坛·三官宝诰"),
}
gao = {}
for did, (src, h) in GAO_MAP.items():
    sec = (sec01 if src == "s01" else sec02).get(h)
    if sec: gao.setdefault(did, []).append((f"{src}《{'正一' if src=='s01' else '全真'}早晚功课经》·{h}", paras_text(sec)))
gao.setdefault("linshui", []).append(("s28《临水夫人宝诰》", paras_text(s28["sections"][0])))
# s02 诸真宝诰整段另存，供涉吕祖等位引用时查对（吕洞宾已在样本中定版，此处仅备查）
zhuzhen = paras_text(sec02.get("晚坛·诸真宝诰", {}))
open(os.path.join(OUT, "s02-zhuzhen-gao.txt"), "w").write(zhuzhen)

DONE5 = {"taiyi", "bigan", "lvdongbin", "gexuan", "chenghuang"}
BATCHES = [
    ["yuanshi", "lingbao", "daode", "yuhuang", "wangmu", "ziwei", "gouchen", "houtu", "doumu", "donghua", "puhua"],
    ["tianguan", "diguan", "shuiguan", "dongyue", "fengdu", "changsheng", "taiyang", "taiyin", "nandou", "beidou", "taisui", "longwang"],
    ["xiyue", "nanyue", "zhongyue", "beiyue", "zhangdaoling", "wangchongyang", "zhangsanfeng", "qiuchuji", "sanmao", "xuxun", "sashoujian"],
    ["zhenwu", "guandi", "erlang", "nezha", "wanglingguan", "huaguang", "wenqiong", "zhongkui", "zhaogongming", "wenchang", "kuixing"],
    ["mazu", "bixia", "linshui", "hexiangu", "xuannv", "magu", "lishan", "zhusheng", "hehe", "yuelao", "tudi", "zaojun"],
    ["tieguai", "zhongli", "zhangguolao", "lancaihe", "hanxiangzi", "caoguojiu", "liuhai", "yaowang", "baosheng", "shennong", "luban", "guangze"],
]
allids = [i for b in BATCHES for i in b]
assert len(allids) == 69 and not (set(allids) & DONE5) and set(allids) | DONE5 == set(tags), (len(allids))

for bi, batch in enumerate(BATCHES, 1):
    lines = [f"# 二审证据包 · 第 {bi} 批（{len(batch)} 位）\n"]
    for did in batch:
        d, t = deities[did], tags[did]
        lines.append(f"## {d['name']}（{did}）")
        lines.append(f"- 现行标签：气质 {t['traits']}；母题 {t['motifs']}（合计 {len(t['traits'])+len(t['motifs'])} 条）")
        lines.append(f"- 所求（不动）：主 {t['needs']['primary']}；次 {t['needs']['secondary']}")
        lines.append(f"- 称号：{d['title']}；道场：{d['temple']}")
        lines.append(f"- 职掌：{d['domain']}")
        lines.append(f"- 介绍：{d['intro']}")
        lines.append(f"- 形象：{d['appearance']}")
        if did in gao:
            for src, txt in gao[did]:
                lines.append(f"- 宝诰（{src}）：{txt}")
        else:
            lines.append("- 宝诰：App 内无专诰文本（证据只取职掌/介绍/形象）")
        lines.append("")
    open(os.path.join(OUT, f"batch{bi}.md"), "w").write("\n".join(lines))
    print(f"batch{bi}: {len(batch)} 位, {sum(1 for i in batch if i in gao)} 位有宝诰")
print("packs done")
