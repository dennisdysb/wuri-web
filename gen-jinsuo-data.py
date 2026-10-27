#!/usr/bin/env python3
"""金锁玉关数据文件生成器。

真源（直接取用、不得改写内容口径）：
  ~/workspace/wuri-app/jinsuo/duanyu.json / shaxing.json / reference.json
构件砂/水签与户型编辑器同源：机械抽取 www/js/house-editor.js 的 FIX 表 sw 字段，
避免两处手抄漂移。生成物 = www/js/jinsuo-data.js（window.JINSUO_DATA）。
proofread_notes 为编辑台账，不随包发布（存疑说明已在数据正文内联标注）。
用法：python3 gen-jinsuo-data.py
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.expanduser("~/workspace/wuri-app/jinsuo")
OUT = os.path.join(HERE, "www", "js", "jinsuo-data.js")
EDITOR = os.path.join(HERE, "www", "js", "house-editor.js")


def load(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        d = json.load(f)
    d.pop("proofread_notes", None)
    return d


def fix_sw():
    src = open(EDITOR, encoding="utf-8").read()
    m = re.search(r"var FIX = \{(.*?)\n  \};", src, re.S)
    assert m, "FIX block not found"
    out = {}
    for key, sw in re.findall(r"(\w+):\s*\{[^}]*?sw:\s*('sha'|'shui'|null)", m.group(1)):
        out[key] = None if sw == "null" else sw.strip("'")
    assert len(out) >= 30, "FIX entries too few: %d" % len(out)
    return out


def main():
    data = {
        "duanyu": load("duanyu.json"),
        "shaxing": load("shaxing.json"),
        "reference": load("reference.json"),
        "fixSw": fix_sw(),
    }
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 金锁玉关数据（过路阴阳）：由 gen-jinsuo-data.py 自 wuri-app/jinsuo/*.json\n")
        f.write(" * 与 house-editor.js 的 FIX 砂水签机械生成；数据源直接取用、不得改写口径。\n")
        f.write(" * 存疑条目的说明已在数据正文内联标注（如兑宫厕所应期、天斩煞 25 米条）。 */\n")
        f.write("window.JINSUO_DATA = " + body + ";\n")
    print("wrote", OUT, len(body), "bytes; fixSw entries:", len(data["fixSw"]))


if __name__ == "__main__":
    sys.exit(main())
