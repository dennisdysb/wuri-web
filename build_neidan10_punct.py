#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
精选层内丹 10 部标点版重生成（2026-10-30 iOS 首测反馈批）
取本：道藏全藏 feed 标点版（www/content/daozang/texts-punct/KR5*.json，机器标点工程产物）
产出：www/content/jing/sXX.js（格式与 build_neidan10.py 完全一致）
校验门（任一不过即整批中止、不落盘）：
  1. 剥去标点后的字流与底本 texts/ 字流逐字全等（底本文字一字不动、只加标点）
  2. 现行 s 文件各段 py 全空（无注音数据可丢）
  3. 卷数与既定卷题表一致
note = 底本自带 note + 「｜機器標點 · 未經校訂」
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DZ = os.path.join(ROOT, 'www', 'content', 'daozang')
RAW = os.path.join(DZ, 'texts')
PUN = os.path.join(DZ, 'texts-punct')
OUT = os.path.join(ROOT, 'www', 'content', 'jing')

BOOKS = [
    ('s40', '悟真篇', '张伯端 · 修真十书本', 'KR5a0268',
     ['修真十書卷之二十六 · 序', '卷之二十七 · 絕句上', '卷之二十八 · 絕句下',
      '卷之二十九 · 西江月', '卷之三十 · 禪宗歌頌']),
    ('s41', '入药镜', '崔希范 · 道藏辑要本', 'KR5i0039',
     ['序', '本文附注']),
    ('s42', '金丹四百字', '张伯端', 'KR5d0104',
     ['金丹四百字']),
    ('s22', '钟吕传道集', '钟离权述 · 吕洞宾集 · 施肩吾传', 'KR5a0266',
     ['卷之十四 · 論真仙', '卷之十五 · 論水火', '卷之十六 · 論還丹']),
    ('s43', '灵宝毕法', '钟离权（题）', 'KR5f0025',
     ['序', '卷上', '卷中', '卷下']),
    ('s44', '规中指南', '陈虚白', 'KR5a0244',
     ['卷上', '卷下']),
    ('s45', '金丹大要', '陈致虚', 'KR5d0090',
     ['序', '虛無卷之一', '虛無卷之二', '上藥卷之三', '上藥卷之四', '卷之五',
      '妙用卷之六', '須知卷之七', '須知卷之八', '積功卷之九', '積功卷之十',
      '累行卷之十一', '累行卷之十二', '發真卷之十三', '發真卷之十四',
      '越格卷之十五', '超宗卷之十六']),
    ('s46', '还源篇', '石泰', 'KR5d0114',
     ['還源篇']),
    ('s47', '天仙正理', '伍守阳 · 天仙正理直论', 'KR5i0067',
     ['書後 · 諸序', '自序 · 直論上', '直論九章']),
    ('s48', '坐忘论', '司马承祯', 'KR5d0059',
     ['序', '正文']),
]

# 标点工程可能引入的符号集合（剥除后应与底本字流全等）
PUNCT = set('，。、；：？！·…—「」『』（）《》〈〉""\'\'.,;:?!() \t\r\n　')
PUNCT_RE = re.compile(r'[，。、；：？！·…—「」『』（）《》〈〉""\'\'.,;:?!()\s　]')


def strip_punct(s):
    return PUNCT_RE.sub('', s)


def load_s(path, sid):
    t = open(path, encoding='utf-8').read()
    m = re.search(r"JINGWEN\['" + sid + r"'\] = (\{.*\});?\s*$", t, re.S)
    return json.loads(m.group(1))


def main():
    dry = '--dry' in sys.argv
    report = []
    for sid, title, subtitle, kr, heads in BOOKS:
        raw = json.load(open(os.path.join(RAW, kr + '.json'), encoding='utf-8'))
        pun = json.load(open(os.path.join(PUN, kr + '.json'), encoding='utf-8'))
        assert len(raw['volumes']) == len(pun['volumes']) == len(heads), (sid, 'vol mismatch')
        # 校验 1：剥标点逐字比对（逐卷）
        for vi, (rv, pv) in enumerate(zip(raw['volumes'], pun['volumes'])):
            rs = strip_punct(''.join(rv['paras']))
            ps = strip_punct(''.join(pv['paras']))
            if rs != ps:
                for i, (a, b) in enumerate(zip(rs, ps)):
                    if a != b:
                        raise SystemExit('%s vol%d 字流分歧 @%d: 底本…%s… vs 标点版…%s…' % (
                            sid, vi, i, rs[max(0, i-15):i+15], ps[max(0, i-15):i+15]))
                raise SystemExit('%s vol%d 字流长度差: 底本 %d vs 标点版剥后 %d' % (sid, vi, len(rs), len(ps)))
        # 校验 2：现行 s 文件 py 全空
        cur = load_s(os.path.join(OUT, sid + '.js'), sid)
        npy = sum(len(p.get('py') or []) for s in cur['sections'] for p in s['paras'])
        assert npy == 0, (sid, 'py 非空', npy)
        assert [s['h'] for s in cur['sections']] == heads, (sid, '现行卷题与表不符',
                                                           [s['h'] for s in cur['sections']])
        # 生成
        sections, nchars, npunct = [], 0, 0
        for v, h in zip(pun['volumes'], heads):
            paras = [{'t': p, 'py': []} for p in v['paras']]
            nchars += sum(len(p) for p in v['paras'])
            npunct += sum(len(PUNCT_RE.findall(p)) for p in v['paras'])
            sections.append({'h': h, 'paras': paras})
        base_chars = sum(len(strip_punct(p)) for v in pun['volumes'] for p in v['paras'])
        entry = {
            'id': sid, 'title': title, 'subtitle': subtitle,
            'note': (raw.get('note') or '') + '｜機器標點 · 未經校訂',
            'sections': sections,
        }
        if not dry:
            js = ('var JINGWEN = window.JINGWEN || (window.JINGWEN = {});\n'
                  "JINGWEN['%s'] = %s;\n" % (sid, json.dumps(entry, ensure_ascii=False)))
            with open(os.path.join(OUT, sid + '.js'), 'w', encoding='utf-8') as f:
                f.write(js)
        report.append((sid, title, kr, base_chars, npunct,
                       round(npunct / base_chars * 1000, 1),
                       sum(len(s['paras']) for s in sections)))
    print('%-5s %-8s %-9s %8s %8s %10s %6s' % ('sid', '书名', 'KR', '底本字数', '标点数', '标点/千字', '段数'))
    for r in report:
        print('%-5s %-8s %-9s %8d %8d %10.1f %6d' % r)
    print('模式:', 'DRY（未落盘）' if dry else '已落盘')


if __name__ == '__main__':
    main()
