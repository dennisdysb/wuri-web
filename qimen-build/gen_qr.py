#!/usr/bin/env python3
"""生成分享卡二维码资产 www/img/qr-yuanfen.png。

单一事实源：目标 URL 只写在 www/js/affinity.js 的 QR_TARGET_URL 常量里，
本脚本读它出图——发布核验时若缘分子域名未通，改 JS 常量一处后重跑本脚本即可。
风格：纠错等级 Q、静区 4 模块、模块色与卡面墨色一致（#26221A）、
底色同分享卡面（#F5F1E5），绘入卡面时无色块边缘。
依赖：pip install qrcode pillow（开发期一次性生成，资产入仓，运行时不依赖）。
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
JS = HERE.parent / "www" / "js" / "affinity.js"
OUT = HERE.parent / "www" / "img" / "qr-yuanfen.png"


def main():
    src = JS.read_text(encoding="utf-8")
    m = re.search(r"QR_TARGET_URL\s*=\s*'([^']+)'", src)
    if not m:
        sys.exit("affinity.js 里找不到 QR_TARGET_URL 常量")
    url = m.group(1)
    try:
        import qrcode
        from qrcode.constants import ERROR_CORRECT_Q
    except ImportError:
        sys.exit("缺 qrcode 库：pip install qrcode pillow")
    # box_size=8：资产 296px，卡面 drawImage 缩比约 3.4 倍，模块边缘比大图猛缩更 crisp
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, border=4, box_size=8)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#26221A", back_color="#F5F1E5")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print(f"{OUT.name}: {img.size[0]}x{img.size[1]} version={qr.version} -> {url}")


if __name__ == "__main__":
    main()
