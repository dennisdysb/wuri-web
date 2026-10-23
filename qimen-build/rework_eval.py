#!/usr/bin/env python3
"""缘分改造验收闸评估器（参数化 tags+题库，与 affinity_model.py / affinity.js 同口径）。
用法: python3 rework_eval.py <tags.json> <questions.py> [--label 名] [--jitter] [--n 6000]
questions.py 须定义 Q（同 affinity_model.Q 结构）与可选 PERSONA_EXT（{画像名: [新题答案...]}，
与 affinity_model.personas() 的 18 画像前 12 题答案拼接）。
基线对拍：python3 rework_eval.py --selfcheck（与 affinity_model 在现行数据上逐项核对）。"""
import json, math, random, collections, sys, os, importlib.util

AXES = ["仁厚", "刚正", "灵慧", "清峻", "洒脱"]
TRAIT_AXIS = {
    "慈悲仁厚": "仁厚", "温厚守成": "仁厚",
    "刚正威严": "刚正", "英武果决": "刚正", "豪迈仗义": "刚正",
    "聪慧机敏": "灵慧", "沉稳谋略": "灵慧",
    "清净淡泊": "清峻", "孤高清峻": "清峻", "坚毅苦修": "清峻",
    "逍遥洒脱": "洒脱", "纯真活泼": "洒脱",
}
MOTIF_AXIS = {
    "母仪守护": "仁厚", "行医济世": "仁厚", "冤屈昭雪": "仁厚",
    "守职尽责": "刚正", "镇妖除害": "刚正", "护民救劫": "刚正",
    "点化众生": "灵慧", "少年英才": "灵慧", "技艺成名": "灵慧",
    "苦修成道": "清峻", "放下执念": "清峻",
    "漂泊历练": "洒脱",
}
SUPPLY_IDF_EXP, SLOT_IDF_BETA, NORM_EXP = 0.35, 0.08, 0.52

PERSONAS12 = {
    "纯悟道清修": [3,2,1,2,2,2,3,2,2,0,2,1],
    "刚正护宅":   [1,3,0,1,0,0,0,3,0,3,1,1],
    "求财务实":   [2,3,0,0,1,1,1,0,1,1,0,1],
    "慈悲医者":   [0,0,3,0,1,2,0,3,3,0,3,3],
    "学子文运":   [2,3,1,3,2,1,1,2,1,1,0,0],
    "少年英气":   [1,0,3,1,0,3,0,1,0,1,1,2],
    "元始向清高悟道": [3,2,1,0,2,2,3,2,2,0,2,1],
    "平安解厄":   [1,0,0,1,0,2,3,2,2,3,1,1],
    "家庭和合":   [0,1,2,0,3,2,2,0,3,2,3,0],
    "姻缘":       [3,1,2,2,3,3,2,0,3,2,3,0],
    "子嗣安康":   [0,0,2,0,1,2,0,0,3,0,3,2],
    "消灾解厄":   [1,2,3,2,2,2,3,3,2,3,2,3],
    "南极长生·延寿守成": [1,0,1,0,1,1,3,0,0,1,1,0],
    "太阳·温厚刚正":     [1,3,0,0,1,2,1,2,0,2,1,0],
    "酆都·孤高镇守":     [1,2,3,1,0,0,1,2,1,3,0,2],
    "北斗·延生解厄":     [1,1,2,1,1,0,2,0,0,3,3,2],
    "灵官·护宅镇妖":     [1,3,1,1,0,3,2,0,0,0,0,3],
    "太岁·镇守本命":     [1,2,0,0,2,0,0,1,0,3,1,1],
}
ANCHORS = list(PERSONAS12)[:12]

def deity_weights(d):
    w = {"n": {}, "t": {}, "m": {}}
    fold = 0.0
    for s in d["needs"]["secondary"]:
        if s == "贵人逢源": fold += 0.75
        else: w["n"][s] = 1.5
    for i, p in enumerate(d["needs"]["primary"]):
        w["n"][p] = 3.0 + (fold if i == 0 else 0.0)
    for t in d["traits"]: w["t"][t] = 1.0
    for m in d["motifs"]: w["m"][m] = 0.6
    return w

class Engine:
    def __init__(self, tags, Q):
        self.Q = Q
        self.deities = [(d["id"], d["name"], deity_weights(d)) for d in tags["deities"]]
        self.TOT = {did: sum(sum(ax.values()) for ax in w.values()) for did, _, w in self.deities}
        self.SUPPLY = {"n": collections.Counter(), "t": collections.Counter(), "m": collections.Counter()}
        for _, opts in Q:
            for _, sc in opts:
                for ax, mp in sc.items():
                    for k, v in mp.items(): self.SUPPLY[ax][k] += v
        self.SMAX = max(v for ax in self.SUPPLY.values() for v in ax.values())
        PRI_C, SEC_C = collections.Counter(), collections.Counter()
        for d in tags["deities"]:
            for p in d["needs"]["primary"]: PRI_C[p] += 1
            for s in d["needs"]["secondary"]: SEC_C[s] += 1
        def sf(c): return 1.0 + SLOT_IDF_BETA * math.log(74.0 / c)
        self.EFF = {}
        for d in tags["deities"]:
            w = deity_weights(d); ew = {"n": {}, "t": dict(w["t"]), "m": dict(w["m"])}
            prim = set(d["needs"]["primary"])
            for k, v in w["n"].items():
                ew["n"][k] = v * (sf(PRI_C[k]) if k in prim else sf(SEC_C[k]))
            self.EFF[d["id"]] = ew
        # 五轴
        def axis_sum(tmap, mmap):
            out = {a: 0.0 for a in AXES}
            for k, v in tmap.items(): out[TRAIT_AXIS[k]] += v
            for k, v in mmap.items(): out[MOTIF_AXIS[k]] += v
            return out
        self.USER_REF = {a: 0.0 for a in AXES}
        for _q, opts in Q:
            per = {a: 0.0 for a in AXES}
            for _t, sc in opts:
                s = axis_sum(sc.get("t", {}), {k: v * 0.6 for k, v in sc.get("m", {}).items()})
                for a in AXES: per[a] = max(per[a], s[a])
            for a in AXES: self.USER_REF[a] += per[a]
        self._draw = {d["id"]: axis_sum(deity_weights(d)["t"], deity_weights(d)["m"]) for d in tags["deities"]}
        self.DEITY_REF = {a: max(r[a] for r in self._draw.values()) for a in AXES}
        self.names = {d["id"]: d["name"] for d in tags["deities"]}

    def profile(self, answers):
        p = {"n": collections.Counter(), "t": collections.Counter(), "m": collections.Counter()}
        for qi, oi in enumerate(answers):
            sc = self.Q[qi][1][oi][1]
            for ax, mp in sc.items():
                for k, v in mp.items(): p[ax][k] += v
        return p

    def rank(self, answers):
        p = self.profile(answers)
        up = {ax: {k: v * (self.SMAX / self.SUPPLY[ax][k]) ** SUPPLY_IDF_EXP for k, v in p[ax].items()}
              for ax in ("n", "t", "m")}
        out = []
        for did, name, _w in self.deities:
            w = self.EFF[did]; s = 0.0
            for ax in ("n", "t", "m"):
                for k, dv in w[ax].items(): s += up[ax].get(k, 0) * dv
            out.append((s / self.TOT[did] ** NORM_EXP, did, name))
        out.sort(key=lambda x: (-x[0], x[1]))
        return out

    def radar_user(self, answers):
        p = self.profile(answers)
        raw = {a: 0.0 for a in AXES}
        for k, v in p["t"].items(): raw[TRAIT_AXIS[k]] += v
        for k, v in p["m"].items(): raw[MOTIF_AXIS[k]] += v * 0.6
        return tuple(round(5 * raw[a] / self.USER_REF[a], 4) for a in AXES)

    def radar_deity(self, did):
        r = self._draw[did]
        return tuple(round(5 * r[a] / self.DEITY_REF[a], 4) for a in AXES)

def poly_area(vals):
    s = 0.0
    for i in range(5):
        s += vals[i] * vals[(i + 1) % 5]
    return 0.5 * math.sin(2 * math.pi / 5) * s

FULL_AREA = poly_area([5.0] * 5)

def evaluate(tags, Q, persona_ext=None, n_rand=6000, do_jitter=False, baseline=None, seed=42):
    """persona_ext: {画像名: 12题之后的答案}；baseline: 另一 Engine（现行版）算漂移对照。"""
    eng = Engine(tags, Q)
    nq = len(Q)
    res = {"nq": nq, "USER_REF": {a: round(eng.USER_REF[a], 2) for a in AXES},
           "DEITY_REF": {a: round(eng.DEITY_REF[a], 2) for a in AXES}}
    mean_ref = sum(eng.USER_REF.values()) / 5
    res["axis_dev_pct"] = {a: round(100 * (eng.USER_REF[a] - mean_ref) / mean_ref, 1) for a in AXES}
    res["axis_within15"] = all(abs(v) <= 15.0 for v in res["axis_dev_pct"].values())
    # 随机答卷（seed 固定，三列同协议）
    rng = random.Random(seed)
    sheets = [[rng.randrange(4) for _ in range(nq)] for _ in range(n_rand)]
    wins = collections.Counter(); inter = []
    for ans in sheets:
        r = eng.rank(ans); wins[r[0][1]] += 1
        u = eng.radar_user(ans); dv = eng.radar_deity(r[0][1])
        inter.append(poly_area([min(a, b) for a, b in zip(u, dv)]))
    res["coverage"] = f"{len(wins)}/74"
    res["top_share"] = round(100 * wins.most_common(1)[0][1] / n_rand, 1)
    res["mean_intersection"] = round(sum(inter) / len(inter), 3)
    res["mean_intersection_pct"] = round(100 * (sum(inter) / len(inter)) / FULL_AREA, 1)
    # 同形组与主场轴
    shapes = {did: tuple(round(v, 2) for v in eng.radar_deity(did)) for did in eng.names}
    groups = collections.defaultdict(list)
    for did, s in shapes.items(): groups[s].append(did)
    dups = {s: ids for s, ids in groups.items() if len(ids) > 1}
    res["shape_groups"] = f"{sum(len(v) for v in dups.values())} 位 / {len(dups)} 组"
    top_n = math.ceil(74 / 3)
    thr = {}
    for i, a in enumerate(AXES):
        vals = sorted((vec[i] for vec in shapes.values()), reverse=True)
        thr[a] = vals[top_n - 1]
    nohome = [did for did, vec in shapes.items()
              if not any(vec[i] >= thr[AXES[i]] - 1e-9 for i in range(5))]
    res["home_axis"] = f"{74 - len(nohome)}/74"
    res["nohome"] = [eng.names[i] for i in nohome]
    # 画像
    personas = {}
    for name, base in PERSONAS12.items():
        ext = (persona_ext or {}).get(name, [])
        ans = (base + list(ext))[:nq]
        assert len(ans) == nq, (name, len(ans), nq)
        personas[name] = ans
    res["persona_main"] = {}
    res["persona_top3"] = {}
    for name, ans in personas.items():
        r = eng.rank(ans)
        res["persona_main"][name] = r[0][2]
        res["persona_top3"][name] = [x[2] for x in r[:3]]
    if baseline is not None:
        drift, out3, det = 0, 0, {}
        for name in PERSONAS12:
            old_main = baseline["persona_main"][name]; old_top3 = baseline["persona_top3"][name]
            new_main = res["persona_main"][name]
            if new_main != old_main:
                drift += 1
                if new_main not in old_top3: out3 += 1
                det[name] = f"{old_main}→{new_main}（{'脱旧前三' if new_main not in old_top3 else '互在前三'}）"
        res["drift"] = f"{drift}/18（脱旧前三 {out3}）"
        res["drift_detail"] = det
    if do_jitter:
        rates = {}
        for pi, (name, ans) in enumerate(personas.items()):
            jr = random.Random(20261022 + pi)
            keep = 0; T = 300
            for _ in range(T):
                pert = []
                for qi, oi in enumerate(ans):
                    if jr.random() < 0.2:
                        pert.append(jr.choice([x for x in range(4) if x != oi]))
                    else:
                        pert.append(oi)
                if eng.rank(pert)[0][2] == res["persona_main"][name]: keep += 1
            rates[name] = round(100 * keep / T)
        res["jitter"] = rates
        res["jitter_anchor_avg"] = round(sum(rates[k] for k in ANCHORS) / 12, 1)
        res["jitter_all_avg"] = round(sum(rates.values()) / 18, 1)
        res["jitter_min"] = min(rates.values())
    return res, eng

def load_q(path):
    spec = importlib.util.spec_from_file_location("qmod", path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m.Q, getattr(m, "PERSONA_EXT", None)

if __name__ == "__main__":
    if "--selfcheck" in sys.argv:
        spec = importlib.util.spec_from_file_location("am", os.path.expanduser(
            "~/workspace/wuri-web-rework/qimen-build/affinity_model.py"))
        am = importlib.util.module_from_spec(spec); spec.loader.exec_module(am)
        tags = json.load(open(os.path.expanduser(
            "~/workspace/wuri-ios-reposition/deities/affinity/affinity-tags.json")))
        eng = Engine(tags, am.Q)
        ok = True
        for name, ans in list(PERSONAS12.items())[:6] + [("全A", [0]*12), ("全C", [2]*12)]:
            mine = eng.rank(ans)[0][2]; ref = am.rank(ans)[0][2]
            print(name, mine, ref, "OK" if mine == ref else "MISMATCH"); ok &= mine == ref
        ru_m, ru_a = eng.radar_user([0]*12), am.radar_user([0]*12)
        print("radar_user 全A", ru_m, ru_a, "OK" if ru_m == ru_a else "MISMATCH"); ok &= ru_m == ru_a
        bid = next(d["id"] for d in tags["deities"] if d["name"] == "保生大帝")
        rd_m, rd_a = eng.radar_deity(bid), am.radar_deity(bid)
        print("radar_deity 保生", rd_m, rd_a, "OK" if rd_m == rd_a else "MISMATCH"); ok &= rd_m == rd_a
        print("SELFCHECK", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)
    tags = json.load(open(sys.argv[1]))
    Q, ext = load_q(sys.argv[2])
    res, _ = evaluate(tags, Q, ext, do_jitter="--jitter" in sys.argv)
    print(json.dumps(res, ensure_ascii=False, indent=1))
