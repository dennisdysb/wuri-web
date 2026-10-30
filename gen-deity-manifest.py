#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""图鉴素材清单生成器（v2.1.1 清单驱动）。

素材发布同一步运行：以内容 feed（www/content/deities.json）的图鉴名单为准，
逐个核对 www/img/deities/ 下呈现版全图的字节数，生成同目录 manifest.json
{count, totalBytes, files{文件名: 字节}}。设置页「图鉴素材」栏与下载进度
总量都读这份清单（运行时带 localStorage 缓存、断网回落包内兜底表），
今后新增/替换素材后重跑本脚本，数字自动跟随，不再写死在文案里。

跑法：python3 gen-deity-manifest.py
缺图（名单有、磁盘无）直接报错退出，不生成清单。
"""
import json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
FEED = os.path.join(ROOT, "www", "content", "deities.json")
IMG_DIR = os.path.join(ROOT, "www", "img", "deities")
OUT = os.path.join(IMG_DIR, "manifest.json")


def entry_images(d):
    """一条目的全部图：可选 images 数组（多图，第一张与 image 同名）优先，
    缺省回落单张 image。"""
    imgs = d.get("images")
    if isinstance(imgs, list) and imgs:
        return [x for x in imgs if isinstance(x, str) and x]
    img = d.get("image")
    return [img] if img else []


def main():
    with open(FEED, encoding="utf-8") as f:
        feed = json.load(f)
    names, seen = [], set()
    n_deities = 0
    for group in feed.get("groups", []):
        for d in group.get("deities", []) if isinstance(group, dict) else []:
            imgs = entry_images(d)
            if imgs: n_deities += 1
            for img in imgs:
                if img not in seen:
                    seen.add(img)
                    names.append(img)
    if not names:  # feed 结构兜底：顶层 deities 列表
        n_deities = 0
        for d in feed.get("deities", []):
            imgs = entry_images(d)
            if imgs: n_deities += 1
            for img in imgs:
                if img not in seen:
                    seen.add(img)
                    names.append(img)
    files, total, missing = {}, 0, []
    for name in names:
        p = os.path.join(IMG_DIR, name)
        if not os.path.isfile(p):
            missing.append(name)
            continue
        files[name] = os.path.getsize(p)
        total += files[name]
    if missing:
        print("缺图 %d 张，清单未生成：%s" % (len(missing), ", ".join(missing)), file=sys.stderr)
        return 1
    manifest = {"count": len(files), "deities": n_deities, "totalBytes": total, "files": files}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1, sort_keys=True)
    print("manifest 已生成：%d 位 · %d 张 · %d 字节（%.1f MB）→ %s" % (n_deities, len(files), total, total / 1048576, OUT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
