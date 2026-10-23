# -*- coding: utf-8 -*-
"""第一步：pypinyin 底稿 + 多音字/生僻字逐处审查表（人工裁定后把 overrides 填进 gen_s39.py）"""
import sys
sys.path.insert(0, '/home/hatch/workspace/wuri-web/qimen-build/s39-build')
from s39_text import PARAS
from pypinyin import pinyin, Style
from pypinyin.core import Pinyin

py = Pinyin()
# 用短语感知模式逐字取音（pypinyin 默认按词组分词纠音）
def gen(text):
    res = py.pinyin(text, style=Style.TONE, heteronym=False)
    out = []
    chars = list(text)
    flat = [r[0] for r in res]
    # pypinyin 短语模式返回与字数对齐的列表（标点原样返回）
    assert len(flat) == len(chars), (len(flat), len(chars), text)
    for ch, r in zip(chars, flat):
        if '一' <= ch <= '鿿' or '㐀' <= ch <= '䶿':
            out.append(r)
        else:
            out.append('')
    return out

WATCH = set('為化說樂長數相應分行乘還降空藏教量重著髮禪師稱處盡得沒中任塞屬傳血曲會要覺參舍更便單騎縫讀擔調處給覺觀乾幾將校興差落娜')
HET = {}
total_han = 0
for i, t in enumerate(PARAS):
    pys = gen(t)
    han = sum(1 for c in t if '一' <= c <= '鿿')
    total_han += han
    for j, (ch, r) in enumerate(zip(t, pys)):
        if not r:
            continue
        # 多音字候选：同一字在全文出现不同读音，或在监视表内
        HET.setdefault(ch, set()).add(r)
        if ch in WATCH:
            ctx = t[max(0, j-4):j+5]
            print(f'p{i:02d} @{j:03d} {ch}={r}  …{ctx}…')
print('---- 同字异音汇总 ----')
for ch, rs in sorted(HET.items()):
    if len(rs) > 1:
        print(ch, sorted(rs))
print('汉字总数:', total_han, '| 段落数:', len(PARAS))
