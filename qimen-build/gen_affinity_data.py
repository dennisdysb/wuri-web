#!/usr/bin/env python3
"""由 affinity_model.py（题库+已仿真验证）与 affinity-tags.json 生成 www/js/affinity-data.js。
口径：74 位全入池（含酆都大帝、太岁殷元帅）；贵人逢源不单设轴，计分时其权重并入主所求（见 affinity.js）。
2026-10-22 缘分改造：标签表 vendored 至同目录 affinity-tags.json（二审定版），题库扩至 16 题。
路径按脚本位置定位，可在任意 checkout/worktree 内运行。"""
import importlib.util, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("am", os.path.join(HERE, "affinity_model.py"))
am = importlib.util.module_from_spec(spec); spec.loader.exec_module(am)

tags = [{"id": d["id"], "name": d["name"],
         "needs": {"primary": d["needs"]["primary"], "secondary": d["needs"]["secondary"]},
         "traits": d["traits"], "motifs": d["motifs"]} for d in am.TAGS["deities"]]
assert len(tags) == 74
qs = [{"q": q, "options": [{"t": t, "s": s} for t, s in opts]} for q, opts in am.Q]
assert len(qs) == 16 and all(len(q["options"]) == 4 for q in qs)

out = ("/* 神仙缘分测试数据：74 位标签（源 affinity-tags.json 定版）+ 16 题原创题库（双轴计分）\n"
       " * 由 qimen-build/gen_affinity_data.py 生成，勿手改；计分口径见 js/affinity.js */\n"
       "window.AFFINITY_TAGS = " + json.dumps(tags, ensure_ascii=False, indent=1) + ";\n"
       "window.AFFINITY_QUESTIONS = " + json.dumps(qs, ensure_ascii=False, indent=1) + ";\n")
path = os.path.join(HERE, "..", "www", "js", "affinity-data.js")
open(path, "w").write(out)
print("wrote", path, len(out), "bytes")
