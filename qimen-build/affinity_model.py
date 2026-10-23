#!/usr/bin/env python3
"""神仙缘分测试 · 题库与计分模型仿真（定稿后同口径移植 js/affinity.js）
双轴：所求(needs) + 气质(traits)，经历母题(motifs)作小权重 tiebreak。
基础权重：主所求 3 / 次所求 1.5（贵人逢源不单设轴：其权重 0.75 并入主所求）/ 气质 1 / 母题 0.6

2026-10-22 权重调整（规则层，不改标签与题面）：
基线（上式 + 除以 sqrt(总权重)）随机仿真 4000 组有 6 位从未成为主缘
（南极长生大帝、酆都大帝、太阳星君、北斗星君、王灵官、太岁殷元帅）——
题库对部分标签供给极不均（所求轴消灾解厄全卷仅 3 分、平安镇宅 8 分），
持有低供给标签者信号被系统性淹没。调整三处：
1. 答案供给稀有度：用户标签分 × (全卷最大供给 / 该标签供给)^0.35——
   越少见的答案越能说明人，信号权重越高（三轴统一公式）。
2. 所求槽位稀有度：主/次所求权重 × (1 + 0.08 × ln(74 / 该槽位持有数))——
   只有少数神祇主掌的所求，命中时区分度更高（气质/母题不加）。
3. 规模归一指数 0.5 → 0.52：得分除以 总权重^0.52。
调整后仿真：74/74 位可成主缘，最高单尊占比 8.8%，六位各有贴题画像可达主缘。
"""
import json, math, random, collections, itertools, sys

TAGS = json.load(open('/home/hatch/workspace/wuri-ios-reposition/deities/affinity/affinity-tags.json'))

# 每题 4 选项；scores: {轴: {标签: 分}}
Q = [
 ("这一年，你心里最常牵挂的是？", [
   ("一家人身体都好好的，孩子平安长大", {"n":{"康健祛病":1,"子嗣安胎":1}, "t":{"慈悲仁厚":1}}),
   ("日子安稳，没病没灾", {"n":{"消灾解厄":2,"平安镇宅":1}}),
   ("事业能再上一个台阶", {"n":{"事业功名":2}, "t":{"沉稳谋略":1}}),
   ("把一些事想通透，心里清净些", {"n":{"智慧悟道":2}, "t":{"清净淡泊":1}}),
 ]),
 ("压力大的时候，你一般怎么消化？", [
   ("运动出汗、好好吃睡，先顾好身体", {"t":{"坚毅苦修":2}, "n":{"康健祛病":1}}),
   ("约上朋友吃喝聊聊，热闹一下就好", {"t":{"豪迈仗义":2}, "n":{"家宅和合":1}}),
   ("独处，散步、看书、发呆", {"t":{"清净淡泊":1,"孤高清峻":1}, "n":{"智慧悟道":1}}),
   ("列个清单，一件一件解决掉", {"t":{"沉稳谋略":2}, "n":{"事业功名":1}}),
 ]),
 ("忽然有一笔意外之财，你的第一反应是？", [
   ("先存起来，手里有余粮心里不慌", {"n":{"财运":3}, "t":{"温厚守成":1}}),
   ("投资自己，报课学新本事", {"n":{"文运学业":2}, "t":{"聪慧机敏":1}}),
   ("带家人改善一下生活", {"n":{"家宅和合":2}, "t":{"慈悲仁厚":1}}),
   ("拿出一部分，帮帮有需要的人", {"t":{"慈悲仁厚":1,"豪迈仗义":1}, "m":{"护民救劫":1}}),
 ]),
 ("你最希望别人这样评价你：", [
   ("靠谱，托付的事从不掉链子", {"t":{"温厚守成":2}, "m":{"守职尽责":1}}),
   ("有正气，不欺负人也不怕事", {"t":{"刚正威严":2,"英武果决":1}}),
   ("洒脱，想得开，拿得起放得下", {"t":{"逍遥洒脱":2}, "m":{"放下执念":1}}),
   ("脑子快，总能想出办法", {"t":{"聪慧机敏":2,"沉稳谋略":1}}),
 ]),
 ("家里只挂一幅字，你选哪个？", [
   ("「平安」", {"n":{"平安镇宅":2}, "t":{"温厚守成":1}}),
   ("「福」", {"n":{"延寿福禄":2,"平安镇宅":1}}),
   ("「静」", {"t":{"清净淡泊":2}, "n":{"智慧悟道":1}}),
   ("「和」", {"n":{"家宅和合":2}, "t":{"慈悲仁厚":1}}),
 ]),
 ("朋友遇上难事，你通常是那个？", [
   ("第一个到场帮忙的人", {"t":{"豪迈仗义":1,"慈悲仁厚":1}, "m":{"护民救劫":1}}),
   ("帮他分析、出主意的人", {"t":{"沉稳谋略":2,"聪慧机敏":1}}),
   ("不多说什么、默默陪着的人", {"t":{"慈悲仁厚":2,"温厚守成":1}}),
   ("拉他出去散心、还保持着少年心气的人", {"t":{"逍遥洒脱":1,"纯真活泼":1}, "m":{"少年英才":1}}),
 ]),
 ("这几年，你最想补上的一课是？", [
   ("养生和身体管理", {"n":{"康健祛病":2}, "t":{"坚毅苦修":1}}),
   ("进修和文凭，给前途加码", {"n":{"文运学业":2}, "t":{"聪慧机敏":1}}),
   ("怎么经营好感情和关系", {"n":{"姻缘感情":2}, "t":{"慈悲仁厚":1}}),
   ("把一些事想明白，最好有人点拨", {"n":{"智慧悟道":2}, "m":{"点化众生":1}}),
 ]),
 ("选一种你向往的晚年生活：", [
   ("儿孙绕膝，热热闹闹", {"n":{"家宅和合":1,"延寿福禄":1,"子嗣安胎":1}}),
   ("云游四方，到处走走看看", {"t":{"逍遥洒脱":1,"纯真活泼":1}, "m":{"漂泊历练":1}}),
   ("小院种菜读书，清净自在", {"t":{"清净淡泊":1,"孤高清峻":1}, "n":{"延寿福禄":1}}),
   ("还能发挥余热，帮到别人", {"t":{"慈悲仁厚":2}, "m":{"行医济世":1}}),
 ]),
 ("遇上不公平的事，你更像哪种反应？", [
   ("当场说理，不能就这么算了", {"t":{"刚正威严":1,"英武果决":1}, "m":{"镇妖除害":1}}),
   ("先冷静，留证据、走流程", {"t":{"沉稳谋略":2,"刚正威严":1}}),
   ("退一步，气坏自己不值当", {"t":{"逍遥洒脱":1,"清净淡泊":1}, "m":{"放下执念":1}}),
   ("陪当事人撑腰，讨个说法", {"t":{"豪迈仗义":1,"慈悲仁厚":1}, "m":{"冤屈昭雪":1}}),
 ]),
 ("新的一年只许一个愿，你许哪个？", [
   ("家人健康、孩子顺遂", {"n":{"康健祛病":2,"子嗣安胎":1}}),
   ("事业有个突破，进账也丰厚些", {"n":{"事业功名":2,"财运":1}}),
   ("感情有着落，或者更和美", {"n":{"姻缘感情":2}, "t":{"温厚守成":1}}),
   ("安稳顺遂、添福添寿", {"n":{"延寿福禄":1,"平安镇宅":1,"消灾解厄":1}}),
 ]),
 ("你最欣赏哪一种人？", [
   ("一辈子只做一件事、做到极致的人", {"t":{"坚毅苦修":1}, "m":{"苦修成道":1,"技艺成名":1}}),
   ("关键时刻能扛事的人", {"t":{"英武果决":2,"刚正威严":1}}),
   ("看透了世事、还热爱生活的人", {"t":{"清净淡泊":1,"逍遥洒脱":1,"孤高清峻":1}}),
   ("对谁都温和宽厚的人", {"t":{"慈悲仁厚":2,"温厚守成":1}}),
 ]),
 ("说到「家」，你最在意的是？", [
   ("有人等你，有灯为你留着", {"n":{"家宅和合":2}, "t":{"温厚守成":1}}),
   ("安全，能遮风挡雨", {"n":{"平安镇宅":2}, "m":{"守职尽责":1}}),
   ("有晚辈的笑声", {"n":{"子嗣安胎":2}, "t":{"纯真活泼":1}}),
   ("走得再远，也有人记挂", {"n":{"平安镇宅":1}, "t":{"慈悲仁厚":1}, "m":{"母仪守护":1}}),
 ]),
]

def deity_weights(d):
    w = {"n": {}, "t": {}, "m": {}}
    fold = 0.0
    for s in d["needs"]["secondary"]:
        if s == "贵人逢源":
            fold += 0.75
        else:
            w["n"][s] = 1.5
    for p in d["needs"]["primary"]:
        w["n"][p] = 3.0 + (fold if p == d["needs"]["primary"][0] else 0.0)
    for t in d["traits"]:
        w["t"][t] = 1.0
    for m in d["motifs"]:
        w["m"][m] = 0.6
    return w

DEITIES = [(d["id"], d["name"], deity_weights(d)) for d in TAGS["deities"]]
TOT = {did: sum(sum(ax.values()) for ax in w.values()) for did, _, w in DEITIES}

# ---- 2026-10-22 权重调整参数（见模块 docstring） ----
SUPPLY_IDF_EXP = 0.35   # 答案供给稀有度指数
SLOT_IDF_BETA = 0.08    # 所求槽位稀有度系数（log 形式）
NORM_EXP = 0.52         # 规模归一指数

# 标签在全卷中的总供给（所有选项分值之和）
SUPPLY = {"n": collections.Counter(), "t": collections.Counter(), "m": collections.Counter()}
for _, opts in Q:
    for _, sc in opts:
        for ax, mp in sc.items():
            for k, v in mp.items():
                SUPPLY[ax][k] += v
SMAX = max(v for ax in SUPPLY.values() for v in ax.values())

# 所求槽位持有数（主位 / 次位分别计）
PRI_C = collections.Counter()
SEC_C = collections.Counter()
for d in TAGS["deities"]:
    for p in d["needs"]["primary"]:
        PRI_C[p] += 1
    for s in d["needs"]["secondary"]:
        SEC_C[s] += 1

def slot_factor(count):
    return 1.0 + SLOT_IDF_BETA * math.log(74.0 / count)

def effective_weights(d, w):
    """在基础权重上叠加所求槽位稀有度（主所求含贵人逢源折入部分一并计算）。"""
    ew = {"n": {}, "t": dict(w["t"]), "m": dict(w["m"])}
    primaries = set(d["needs"]["primary"])
    for k, v in w["n"].items():
        ew["n"][k] = v * (slot_factor(PRI_C[k]) if k in primaries else slot_factor(SEC_C[k]))
    return ew

EFF = {d["id"]: effective_weights(d, deity_weights(d)) for d in TAGS["deities"]}

def profile(answers):
    p = {"n": collections.Counter(), "t": collections.Counter(), "m": collections.Counter()}
    for qi, oi in enumerate(answers):
        sc = Q[qi][1][oi][1]
        for ax, mp in sc.items():
            for k, v in mp.items():
                p[ax][k] += v
    return p

def rank(answers):
    p = profile(answers)
    # 答案供给稀有度校正：越少在问卷里出现的标签，用户的每一分越独特
    up = {ax: {k: v * (SMAX / SUPPLY[ax][k]) ** SUPPLY_IDF_EXP for k, v in p[ax].items()}
          for ax in ("n", "t", "m")}
    out = []
    for did, name, _w in DEITIES:
        w = EFF[did]
        s = 0.0
        for ax in ("n", "t", "m"):
            for k, dv in w[ax].items():
                s += up[ax].get(k, 0) * dv
        out.append((s / TOT[did] ** NORM_EXP, did, name))
    out.sort(key=lambda x: (-x[0], x[1]))
    return out

def main():
    # 覆盖统计
    cov = {"n": collections.Counter(), "t": collections.Counter(), "m": collections.Counter()}
    for _, opts in Q:
        for _, sc in opts:
            for ax, mp in sc.items():
                for k, v in mp.items():
                    cov[ax][k] += v
    alltags = {"n": set(), "t": set(), "m": set()}
    for d in TAGS["deities"]:
        alltags["n"] |= set(d["needs"]["primary"]) | set(d["needs"]["secondary"])
        alltags["t"] |= set(d["traits"]); alltags["m"] |= set(d["motifs"])
    for ax in ("n", "t", "m"):
        missing = alltags[ax] - set(cov[ax])
        print(f"轴{ax} 未覆盖标签: {missing if missing else '无'}")
        print(f"轴{ax} 覆盖分值: {dict(cov[ax])}")
    # 同选边界
    for oi in range(4):
        r = rank([oi]*12)
        print(f"全选{chr(65+oi)}: 主缘={r[0][2]} 次缘={r[1][2]},{r[2][2]}")
    # 随机仿真
    random.seed(42)
    N = 4000
    wins = collections.Counter(); top3 = collections.Counter()
    for _ in range(N):
        ans = [random.randrange(4) for _ in range(12)]
        r = rank(ans)
        wins[r[0][1]] += 1
        for x in r[:3]: top3[x[1]] += 1
    names = {did: nm for did, nm, _ in DEITIES}
    print(f"\n随机 {N} 组主缘分布（前12）:")
    for did, c in wins.most_common(12):
        print(f"  {names[did]}: {c} ({c/N:.1%})")
    never = [names[did] for did, _, _ in DEITIES if wins[did] == 0]
    print(f"从未成为主缘: {len(never)} 位: {never}")
    print(f"主缘不同神祇数: {len(wins)}/74, 最高占比 {wins.most_common(1)[0][1]/N:.1%}")
    radar_audit()

# ================= 特质五边形（五轴雷达，与 affinity.js 同口径） =================
# 定位：同一套标签数据的可视化，不参与主缘计分（计分引擎零改动）。
# 五轴由气质标签池（12）归纳，母题（12）按同轴补映射；每个标签恰好归一轴。
#   仁厚＝温厚亲和、悯人助人；刚正＝正气威严、守序护众；
#   灵慧＝聪慧通透、点化启悟；清峻＝清高孤介、苦修放下；洒脱＝自在来去、不拘形迹。
# 归轴说明（边际项）：豪迈仗义归刚正（仗义以正气为本）；护民救劫归刚正（护民是守序执行面，
#   与镇妖除害同族）；冤屈昭雪归仁厚（为含冤者出头，出发点是悯人）；放下执念归清峻
#   （放下即心清境寂，归清峻的超脱面）；坚毅苦修归清峻（苦修即 austerity）。
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
assert set(TRAIT_AXIS) == {t for d in TAGS["deities"] for t in d["traits"]}
assert set(MOTIF_AXIS) == {m for d in TAGS["deities"] for m in d["motifs"]}

def _axis_sum(tmap, mmap):
    """气质分（原值）+ 母题分（已按 0.6 计）按轴汇总。"""
    out = {a: 0.0 for a in AXES}
    for k, v in tmap.items():
        out[TRAIT_AXIS[k]] += v
    for k, v in mmap.items():
        out[MOTIF_AXIS[k]] += v
    return out

# 用户轴上限：每题取该题选项可达的最大轴分（气质原值 + 母题×0.6），逐题累加
USER_REF = {a: 0.0 for a in AXES}
for _q, _opts in Q:
    _per = {a: 0.0 for a in AXES}
    for _txt, _sc in _opts:
        _s = _axis_sum(_sc.get("t", {}), {k: v * 0.6 for k, v in _sc.get("m", {}).items()})
        for a in AXES:
            _per[a] = max(_per[a], _s[a])
    for a in AXES:
        USER_REF[a] += _per[a]

def radar_user(answers):
    """用户五轴（0–5）：答案原始标签分（不做供给稀有度校正）按轴汇总 / 该轴问卷可达上限 ×5。"""
    p = profile(answers)
    raw = _axis_sum(dict(p["t"]), {k: v * 0.6 for k, v in p["m"].items()})
    return tuple(round(5 * raw[a] / USER_REF[a], 4) for a in AXES)

_DEITY_RAW = {d["id"]: _axis_sum(deity_weights(d)["t"], deity_weights(d)["m"]) for d in TAGS["deities"]}
DEITY_REF = {a: max(r[a] for r in _DEITY_RAW.values()) for a in AXES}

def radar_deity(did):
    """神祇五轴（0–5）：气质权重（1/个）+ 母题权重（0.6/个）按轴汇总 / 全体该轴最大值 ×5。与用户同为「占可达上限之比」的同尺。"""
    r = _DEITY_RAW[did]
    return tuple(round(5 * r[a] / DEITY_REF[a], 4) for a in AXES)

def radar_audit():
    names = {d["id"]: d["name"] for d in TAGS["deities"]}
    shapes = {did: tuple(round(v, 2) for v in radar_deity(did)) for did in names}
    groups = collections.defaultdict(list)
    for did, s in shapes.items():
        groups[s].append(did)
    dups = {s: ids for s, ids in groups.items() if len(ids) > 1}
    top_n = math.ceil(len(names) / 3)
    thr = {}
    for i, a in enumerate(AXES):
        vals = sorted((vec[i] for vec in shapes.values()), reverse=True)
        thr[a] = vals[top_n - 1]
    nohome = [did for did, vec in shapes.items()
              if not any(vec[i] >= thr[AXES[i]] - 1e-9 for i in range(5))]
    print(f"\n[五轴审计] 互异形状 {len(groups)}/74 组；同形 {sum(len(v) for v in dups.values())} 位 / {len(dups)} 组；无主场轴 {len(nohome)} 位")
    for s, ids in sorted(dups.items(), key=lambda kv: -len(kv[1])):
        print(f"  同形组 {[names[i] for i in ids]}: {s}")
    if nohome:
        print("  无主场轴:", [names[i] for i in nohome])
    for nm, ans in [("全A", [0] * 12), ("全B", [1] * 12), ("全C", [2] * 12), ("全D", [3] * 12),
                    ("悟道画像", [3, 2, 1, 2, 2, 2, 3, 2, 2, 0, 2, 1]),
                    ("慈悲医者", [0, 0, 3, 0, 1, 2, 0, 3, 3, 0, 3, 3])]:
        r = rank(ans)
        print(f"  {nm}: 用户{radar_user(ans)} 主缘={r[0][2]} 神祇{radar_deity(r[0][1])}")

def personas():
    P = {
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
      # 2026-10-22 新增：原「从未主缘」六位的贴题画像（权重调整验收用）
      "南极长生·延寿守成": [1,0,1,0,1,1,3,0,0,1,1,0],
      "太阳·温厚刚正":     [1,3,0,0,1,2,1,2,0,2,1,0],
      "酆都·孤高镇守":     [1,2,3,1,0,0,1,2,1,3,0,2],
      "北斗·延生解厄":     [1,1,2,1,1,0,2,0,0,3,3,2],
      "灵官·护宅镇妖":     [1,3,1,1,0,3,2,0,0,0,0,3],
      "太岁·镇守本命":     [1,2,0,0,2,0,0,1,0,3,1,1],
    }
    for name, ans in P.items():
        r = rank(ans)
        print(f"{name}: 主缘={r[0][2]} 次缘={r[1][2]},{r[2][2]}")


if __name__ == "__main__":
    main()
