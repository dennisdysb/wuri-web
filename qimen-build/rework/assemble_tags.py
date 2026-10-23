#!/usr/bin/env python3
"""合并二审裁决（样本5定版＋6 批 decisions）→ 新标签表 qimen-build/affinity-tags.json。
硬校验：needs 逐位不变；标签只出自现行池；合计 ≤7（超限报警）；每条新增的 quote
必须逐字命中该位证据原文（图鉴 domain/intro/appearance/temple＋专诰＋s02 诸真宝诰对应段）。"""
import json, os, sys, importlib.util

ROOT = os.path.expanduser("~/workspace/wuri-web-rework")
RW = os.path.join(ROOT, "qimen-build/rework")
orig = json.load(open(os.path.expanduser("~/workspace/wuri-ios-reposition/deities/affinity/affinity-tags.json")))
deities = {d["id"]: d for d in json.load(open(os.path.join(ROOT, "www/content/deities.json")))["deities"]}

# ---- 证据原文汇编（核验用） ----
dec = json.JSONDecoder()
def load_jing(fid):
    raw = open(os.path.expanduser(f"~/workspace/wuri-web/www/content/jing/{fid}.js"), encoding="utf-8").read()
    marker = f"JINGWEN['{fid}'] = "
    i = raw.index(marker) + len(marker)
    d, _ = dec.raw_decode(raw[i:]); return d
s01 = load_jing("s01"); s02 = load_jing("s02"); s28 = load_jing("s28")
sec01 = {s.get("h"): s for s in s01["sections"]}
sec02 = {s.get("h"): s for s in s02["sections"]}
def ptext(sec): return "\n".join(p["t"] for p in sec.get("paras", []) if p.get("t"))
GAO_MAP = {
    "yuanshi": ("早坛·玉清宝诰",), "lingbao": ("早坛·上清宝诰",), "daode": ("早坛·太清宝诰",),
    "yuhuang": ("早坛·玉皇宝诰",), "gouchen": ("早坛·天皇宝诰",), "ziwei": ("早坛·星主宝诰",),
    "houtu": ("早坛·后土宝诰",), "changsheng": ("早坛·南极宝诰",), "taiyi": ("早坛·救苦宝诰", "晚坛·太乙宝诰"),
    "doumu": ("早坛·斗姥宝诰", "晚坛·斗姥宝诰"), "zhenwu": ("早坛·玄天宝诰", "晚坛·玄天宝诰"),
    "zhangdaoling": ("早坛·老祖天师诰", "晚坛·祖天师宝诰"), "gexuan": ("早坛·葛仙翁诰", "晚坛·葛仙翁宝诰"),
    "xuxun": ("早坛·许真君诰", "晚坛·许真君宝诰"), "dongyue": ("早坛·东岳宝诰", "晚坛·东岳宝诰"),
    "puhua": ("早坛·普化宝诰",), "sashoujian": ("晚坛·萨祖宝诰",), "sanmao": ("晚坛·三茅真君宝诰",),
    "wanglingguan": ("晚坛·王帅诰",), "tianguan": ("早坛·三官宝诰", "晚坛·三官宝诰"),
    "diguan": ("早坛·三官宝诰", "晚坛·三官宝诰"), "shuiguan": ("早坛·三官宝诰", "晚坛·三官宝诰"),
}
corpus = {}
for did, d in deities.items():
    parts = [d["domain"], d["intro"], d["appearance"], d["temple"], d["title"]]
    for h in GAO_MAP.get(did, ()): 
        if h in sec01: parts.append(ptext(sec01[h]))
    corpus[did] = "\n".join(parts)
# s02 诸真宝诰分段归属
zz = ptext(sec02["晚坛·诸真宝诰"])
SEG2 = {"斗母诰": "doumu", "三官诰": None, "玄天诰": "zhenwu", "吕祖诰": "lvdongbin",
        "萨真君诰": "sashoujian", "王灵官诰": "wanglingguan", "救苦诰": "taiyi"}
heads = sorted(SEG2, key=lambda h: zz.find(h))
for idx, h in enumerate(heads):
    st = zz.find(h); en = zz.find(heads[idx + 1]) if idx + 1 < len(heads) else len(zz)
    seg = zz[st:en]
    tgt = SEG2[h]
    if tgt: corpus[tgt] += "\n" + seg
    else:
        for t3 in ("tianguan", "diguan", "shuiguan"): corpus[t3] += "\n" + seg
corpus["linshui"] += "\n" + ptext(s28["sections"][0])

# ---- 载入裁决 ----
spec = importlib.util.spec_from_file_location("s5", os.path.join(RW, "sample5_final.py"))
s5 = importlib.util.module_from_spec(spec); spec.loader.exec_module(s5)
decisions = {k: {"name": None, "final_traits": v["traits"], "final_motifs": v["motifs"],
                 "adds": v.get("adds", []), "deletes": v.get("deletes", []),
                 "rejected": v.get("rejected", []), "note": ""}
             for k, v in s5.SAMPLE5.items()}
for b in range(1, 7):
    p = os.path.join(RW, f"decisions/batch{b}.json")
    if os.path.exists(p):
        for k, v in json.load(open(p)).items():
            assert k not in decisions, f"重复裁决 {k}"
            decisions[k] = v
missing = set(deities) - set(decisions)
if missing:
    print("缺裁决:", sorted(missing)); sys.exit(2)

TRAITS = {"慈悲仁厚","温厚守成","刚正威严","英武果决","豪迈仗义","聪慧机敏","沉稳谋略",
          "清净淡泊","孤高清峻","坚毅苦修","逍遥洒脱","纯真活泼"}
MOTIFS = {"母仪守护","行医济世","冤屈昭雪","守职尽责","镇妖除害","护民救劫","点化众生",
          "少年英才","技艺成名","苦修成道","放下执念","漂泊历练"}

errors, warns, ledger = [], [], []
new_deities = []
for d in orig["deities"]:
    did = d["id"]; dec_d = decisions[did]
    ft, fm = dec_d["final_traits"], dec_d["final_motifs"]
    if set(ft) - TRAITS: errors.append(f"{did} 气质越池: {set(ft)-TRAITS}")
    if set(fm) - MOTIFS: errors.append(f"{did} 母题越池: {set(fm)-MOTIFS}")
    if len(ft) + len(fm) > 7: warns.append(f"{did} 合计 {len(ft)+len(fm)} 条超上限 7")
    # 增删与 final 一致性
    old_t, old_m = set(d["traits"]), set(d["motifs"])
    added = (set(ft) - old_t) | (set(fm) - old_m)
    removed = (old_t - set(ft)) | (old_m - set(fm))
    dec_added = {a["tag"] for a in dec_d.get("adds", [])}
    dec_removed = {x["tag"] for x in dec_d.get("deletes", [])}
    if added != dec_added: errors.append(f"{did} 新增账实不符: final 多 {added-dec_added} / 裁决多 {dec_added-added}")
    if removed != dec_removed: errors.append(f"{did} 删除账实不符: final 少 {removed-dec_removed} / 裁决多 {dec_removed-removed}")
    # 出处核验
    for a in dec_d.get("adds", []):
        if a["quote"] not in corpus[did]:
            errors.append(f"{did} 新增「{a['tag']}」出处未逐字命中原文: {a['quote'][:40]}")
    nd = dict(d); nd["traits"] = ft; nd["motifs"] = fm
    new_deities.append(nd)
    ledger.append((did, d["name"], len(old_t) + len(old_m), len(ft) + len(fm),
                   len(dec_d.get("adds", [])), len(dec_d.get("deletes", []))))

for e in errors: print("ERROR", e)
for w in warns: print("WARN", w)
if errors: sys.exit(1)
out = dict(orig); out["deities"] = new_deities
out["version"] = (orig.get("version") or 1) + 1
json.dump(out, open(os.path.join(ROOT, "qimen-build/affinity-tags.json"), "w"), ensure_ascii=False, indent=1)
ta = sum(x[4] for x in ledger); td = sum(x[5] for x in ledger)
print(f"OK 已写 qimen-build/affinity-tags.json：74 位，新增合计 {ta} 条、删除合计 {td} 条")
for row in ledger: print(f"  {row[1]}({row[0]}): {row[2]} → {row[3]} 条（+{row[4]} −{row[5]}）")
