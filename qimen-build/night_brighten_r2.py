#!/usr/bin/env python3
"""夜间 hero 图第二轮提亮（用户 2026-10-22 真机反馈：夜间还是有点淡；日间不动）。

从原始生成图一次重出，不在已加工 webp 上叠滤镜：
- 六图源 = qimen-build/design-preview/newimg/<name>.webp（宽 >1152 时缩至 1152，与现行 www 几何一致）
- deity-night 源 = www/img/deities/daode.webp，重走夜间调色链

统一口径 BOOST = Brightness x1.20 / Color x1.30 / Contrast x1.04
（上一轮为 x1.10/x1.20/x1.03、相对原图亮度 +8~9%；本轮实测相对原图 +17.8~18.8%）。

deity-night 链：Color x0.88 -> gamma 1.45 压暗 -> 向深蓝墨底 (10,18,24) 混合 14%
-> 同一 BOOST -> Brightness x0.85 收档（与现行成品逐值对版验证：lum .459/sat .278 一致）。
保存：WEBP quality=82, method=6。日间图（www/img/heroes/day/）完全不碰。
"""
from PIL import Image, ImageEnhance
import numpy as np, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWIMG = os.path.join(ROOT, "qimen-build", "design-preview", "newimg")
WWW = os.path.join(ROOT, "www")
B, C, K = 1.20, 1.30, 1.04


def stats(im):
    a = np.asarray(im.convert('RGB'), dtype=float) / 255.0
    lum = 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return lum.mean(), sat.mean()


def boost(im):
    im = ImageEnhance.Brightness(im).enhance(B)
    im = ImageEnhance.Color(im).enhance(C)
    im = ImageEnhance.Contrast(im).enhance(K)
    return im


def report(name, src_lum, old_lum, new):
    nl, ns = stats(new)
    print(f"{name:12s} 原图 {src_lum:.3f} | 现行 {old_lum:.3f} | 新版 {nl:.3f} "
          f"(相对原图 {(nl / src_lum - 1) * 100:+.1f}% / 相对现行 {(nl / old_lum - 1) * 100:+.1f}%) sat {ns:.3f}")


heroes = ['practice', 'compass', 'bazi', 'ziwei', 'liuyao', 'qimen']
for name in heroes:
    src = Image.open(os.path.join(NEWIMG, f"{name}.webp")).convert('RGB')
    src_lum, _ = stats(src)
    if src.width > 1152:
        src = src.resize((1152, round(src.height * 1152 / src.width)), Image.LANCZOS)
    out_p = os.path.join(WWW, "img", "heroes", f"{name}.webp")
    old_lum, _ = stats(Image.open(out_p))
    out = boost(src)
    out.save(out_p, 'WEBP', quality=82, method=6)
    report(name, src_lum, old_lum, Image.open(out_p))

# deity-night：重走夜间调色链
src = Image.open(os.path.join(WWW, "img", "deities", "daode.webp")).convert('RGB')
src_lum, _ = stats(src)
im = ImageEnhance.Color(src).enhance(0.88)
lut = [min(255, round(255 * (i / 255.0) ** 1.45)) for i in range(256)]
im = im.point(lut * 3)
im = Image.blend(im, Image.new('RGB', im.size, (10, 18, 24)), 0.14)
im = boost(im)
im = ImageEnhance.Brightness(im).enhance(0.85)
out_p = os.path.join(WWW, "img", "heroes", "deity-night.webp")
old_lum, _ = stats(Image.open(out_p))
im.save(out_p, 'WEBP', quality=82, method=6)
report("deity-night", src_lum, old_lum, Image.open(out_p))
print("done (deity-night 的「相对原图」以 daode 原始造像图为分母，仅作记录；同族关系看相对现行 +9% 与链结构不变)")
