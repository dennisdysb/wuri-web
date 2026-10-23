# -*- coding: utf-8 -*-
"""配置搜索：以新标签为固定地基，在 {题集 × 微分集 × P集} 上跑快速全闸（无抖动），
输出可比表；抖动只对入围配置补跑。"""
import json, sys, copy, itertools
sys.path.insert(0, '/home/hatch/workspace/wuri-web-rework/qimen-build')
import importlib.util
def load(p, name):
    s = importlib.util.spec_from_file_location(name, p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
R = '/home/hatch/workspace/wuri-web-rework/qimen-build/rework/'
ev = load(R + '../rework_eval.py', 'ev')
bq = load(R + 'build_q.py', 'bq')       # apply_P, NEW16, PERSONA_EXT
qd = load(R + 'q_draft16.py', 'qd')     # 草案16 (Q, PERSONA_EXT)
b2 = load(R + 'build_q2.py', 'b2')      # QUESTIONS20, PERSONA_EXT20, NEW4
tags = json.load(open('/home/hatch/workspace/wuri-web-rework/qimen-build/affinity-tags.json'))
base = json.load(open(R + 'metrics_baseline.json'))

def add_micro(Q, spec_list):
    Q = copy.deepcopy(Q)
    for qi, oi, need, pts in spec_list:
        sc = Q[qi][1][oi][1]
        sc.setdefault("n", {})[need] = pts
    return Q

MICROS = {  # 语义直配候选（避开旧标签下已证有害的智慧悟道/家宅两路，先单测）
 "m1": [(12, 0, "事业功名", 1), (12, 1, "事业功名", 1)],   # Q13 抢功：讲清/私下谈
 "m2": [(15, 1, "康健祛病", 1)],                            # Q16 吃睡回血
 "m3": [(15, 2, "事业功名", 1)],                            # Q16 复盘维权
 "m4": [(13, 0, "家宅和合", 1)],                            # Q14 回老家陪父母
}
P_ALL = list(range(9))

def fast(Q, ext):
    r, _ = ev.evaluate(tags, Q, ext, do_jitter=False, baseline=base)
    dev = max(abs(v) for v in r["axis_dev_pct"].values())
    return {"cov": r["coverage"], "dev": dev, "drift": r["drift"], "inter": r["mean_intersection"],
            "shape": r["shape_groups"], "home": r["home_axis"], "top": r["top_share"],
            "detail": r["drift_detail"]}

def show(name, m):
    print(f"{name:28s} 覆盖{m['cov']} 轴偏离max{m['dev']:.1f}% 漂移{m['drift']} 交集{m['inter']} 同形{m['shape']} 主场{m['home']} 最高{m['top']}%")

Q16 = qd.Q; E16 = qd.PERSONA_EXT
print("== 基座与单项微分（16题） ==")
show("16Q 基座", fast(Q16, E16))
best_micro = []
for k, sp in MICROS.items():
    m = fast(add_micro(Q16, sp), E16); show(f"16Q+{k}", m)
print("== 微分全收 ==")
allm = [x for v in MICROS.values() for x in v]
show("16Q+micro全收", fast(add_micro(Q16, allm), E16))
print("== P 单项（16题） ==")
for i in P_ALL:
    show(f"16Q+P{i+1}", fast(bq.apply_P(Q16, [i]), E16))
print("== P 全收（16题） ==")
show("16Q+P全收", fast(bq.apply_P(Q16, P_ALL), E16))
print("== 18/20 题（修正补答） ==")
b2.PERSONA_EXT20["刚正护宅"][4] = 2   # Q17 守户（护宅本分）
b2.PERSONA_EXT20["平安解厄"][4] = 1   # Q17 调度（守职谋略）
Q18_ = b2.QUESTIONS20[:16] + [b2.NEW4[1], b2.NEW4[2]]     # +Q18延寿 +Q19进修
E18 = {k: v[:4] + [v[5], v[6]] for k, v in b2.PERSONA_EXT20.items()}
show("18Q(16+延寿+进修)", fast(Q18_, E18))
show("20Q(修正补答)", fast(b2.QUESTIONS20, b2.PERSONA_EXT20))
Q19_ = b2.QUESTIONS20[:16] + [b2.NEW4[0], b2.NEW4[1], b2.NEW4[2]]  # +Q17+Q18+Q19
E19 = {k: v[:4] + [v[4], v[5], v[6]] for k, v in b2.PERSONA_EXT20.items()}
show("19Q(16+危难+延寿+进修)", fast(Q19_, E19))
Q20no17 = b2.QUESTIONS20[:16] + [b2.NEW4[1], b2.NEW4[2], b2.NEW4[3]]  # +Q18+Q19+Q20
E20n17 = {k: v[:4] + [v[5], v[6], v[7]] for k, v in b2.PERSONA_EXT20.items()}
show("19Q'(16+延寿+进修+家宅)", fast(Q20no17, E20n17))
