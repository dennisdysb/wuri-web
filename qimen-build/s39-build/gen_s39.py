# -*- coding: utf-8 -*-
"""s39 建库：注音生成（pypinyin 短语底稿＋逐处裁定 overrides）→ 审计 → 写 feed 文件与索引。
审计口径（查一）：每段 len(py)==len(t)；汉字必有音、标点必空音；U+FFFD=0；无半角标点；无空格。
"""
import json, sys, unicodedata
sys.path.insert(0, '/home/hatch/workspace/wuri-web/qimen-build/s39-build')
from s39_text import PARAS, TITLE, SOURCE
from pypinyin.core import Pinyin
from pypinyin import Style

py = Pinyin()

def is_han(c):
    return ('\u4e00' <= c <= '\u9fff') or ('\u3400' <= c <= '\u4dbf') or ('\U00020000' <= c <= '\U0002a6df')

def draft(text):
    res = py.pinyin(text, style=Style.TONE, heteronym=False)
    flat = [r[0] for r in res]
    assert len(flat) == len(text)
    return [r if is_han(c) else '' for c, r in zip(text, flat)]

# 逐处裁定（para_idx, char_idx) -> 读音；理由见 s39_text.VARIANTS 同级审计记录：
# 為wéi(是/成为/被动)、應yìng、還huán、長樂cháng、相xiàng(形貌)、著zhuó、盡jìn、
# 彈指tán、重告chóng、風雨不調tiáo、呼為wéi
OVERRIDES = {
    (3, 42): 'huán', (3, 47): 'wéi',
    (5, 3): 'cháng', (5, 30): 'yìng', (5, 158): 'yìng',
    (7, 25): 'yìng', (14, 29): 'yìng',
    (9, 43): 'xiàng', (21, 81): 'xiàng',
    (13, 53): 'zhuó',
    (15, 93): 'jìn', (16, 14): 'tán', (18, 5): 'chóng',
    (20, 20): 'tiáo', (20, 64): 'wéi',
    (23, 59): 'wéi', (24, 91): 'wéi', (25, 36): 'huán',
}
for idx in (53, 60, 67, 74, 81, 88, 95, 102, 109, 116, 123, 130, 137):
    OVERRIDES[(5, idx)] = 'wéi'   # 或為…：成为/作
for idx in (9, 18, 28, 41, 51):
    OVERRIDES[(15, idx)] = 'wéi'  # 呼為…：称作

def build_para(i, text):
    pys = draft(text)
    for j, ch in enumerate(text):
        if (i, j) in OVERRIDES:
            pys[j] = OVERRIDES[(i, j)]
        elif ch == '一':
            pys[j] = 'yī'          # 全库近年各部口径：一律 yī（s27/s33 同）
        elif ch == '子':
            pys[j] = 'zi'          # 复合词尾作 zi（童子/獅子/男子/女子/母子，与 s02/s37 口径同）
    pys[text.index('子')] if False else None
    return {'t': text, 'py': pys}

paras = [build_para(i, t) for i, t in enumerate(PARAS)]
# 父慈子孝之「子」为实义名词，改 zǐ（p19）
p19 = paras[19]
for j, ch in enumerate(p19['t']):
    if p19['t'][j:j+4] == '父慈子孝':
        p19['py'][j+2] = 'zǐ'

# ---------- 审计 ----------
PUNCT = set('，。：；？、！「」『』（）·—…')
errors = []
total_han = 0
for i, p in enumerate(paras):
    t, pys = p['t'], p['py']
    if len(pys) != len(t):
        errors.append(f'p{i}: py 长度 {len(pys)} != 文 {len(t)}')
    if ' ' in t or '\u3000' in t:
        errors.append(f'p{i}: 含空格')
    if '\ufffd' in t:
        errors.append(f'p{i}: 含 U+FFFD')
    for j, (c, r) in enumerate(zip(t, pys)):
        if is_han(c):
            total_han += 1
            if not r:
                errors.append(f'p{i}@{j} {c}: 汉字无注音')
        else:
            if c not in PUNCT:
                errors.append(f'p{i}@{j} {c!r}: 非汉字非全角标点（半角？）')
            if r:
                errors.append(f'p{i}@{j} {c}: 标点带注音 {r}')
print(f'段落 {len(paras)}｜汉字 {total_han}｜审计错误 {len(errors)}')
for e in errors:
    print('  ✗', e)
if errors:
    sys.exit(1)

data = {
    'id': 's39',
    'title': TITLE,
    'source': SOURCE,
    'sections': [{'h': TITLE, 'paras': paras}],
}
out = ("var JINGWEN = window.JINGWEN || (window.JINGWEN = {});\n"
       "JINGWEN['s39'] = " + json.dumps(data, ensure_ascii=False) + ";\n")
path = '/home/hatch/workspace/wuri-web/www/content/jing/s39.js'
with open(path, 'w', encoding='utf-8') as f:
    f.write(out)
print('已写', path, len(out.encode('utf-8')), 'bytes')

# TTS 文本（与 jing 段落逐字一致，fish_batch 口径：一行一段）
tts = '\n'.join(PARAS) + '\n'
with open('/home/hatch/workspace/tts-samples/s39_tts.txt', 'w', encoding='utf-8') as f:
    f.write(tts)
print('已写 s39_tts.txt')
