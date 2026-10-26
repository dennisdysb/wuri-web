#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
精选层扩充：常见内丹经文 +10 部（用户 2026-10-26 指定）
取本：道藏全藏 feed（www/content/daozang/texts/KR5*.json，Kanripo 转录，CC BY-SA 4.0）
产出：www/content/jing/sXX.js（与既有精选同格式：sections[{h, paras[{t, py:[]}]}]）
正文逐字照底本，不改一字；仅卷题（h）按原书卷次清理（底本卷题含 Kanripo 页码标记残迹）。
note = 底本自带 note + 「｜底本直出 · 未经校订」
"""
import json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DZ = os.path.join(ROOT, 'www', 'content', 'daozang', 'texts')
OUT = os.path.join(ROOT, 'www', 'content', 'jing')

# sid, 书名（用户定名）, 副题, KR编号, [清理后的卷题...]
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

def main():
    report = []
    for sid, title, subtitle, kr, heads in BOOKS:
        src = json.load(open(os.path.join(DZ, kr + '.json'), encoding='utf-8'))
        vols = src['volumes']
        assert len(vols) == len(heads), (sid, kr, len(vols), len(heads))
        sections = []
        nchars = 0
        for v, h in zip(vols, heads):
            paras = [{'t': p, 'py': []} for p in v['paras']]
            nchars += sum(len(p) for p in v['paras'])
            sections.append({'h': h, 'paras': paras})
        entry = {
            'id': sid,
            'title': title,
            'subtitle': subtitle,
            'note': (src.get('note') or '') + '｜底本直出 · 未經校訂',
            'sections': sections,
        }
        js = ('var JINGWEN = window.JINGWEN || (window.JINGWEN = {});\n'
              "JINGWEN['%s'] = %s;\n" % (sid, json.dumps(entry, ensure_ascii=False)))
        path = os.path.join(OUT, sid + '.js')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(js)
        report.append((sid, title, kr, src.get('dz'), len(vols), nchars,
                       os.path.getsize(path)))
    for r in report:
        print('%s %-8s %-9s dz=%-8s vols=%2d chars=%6d file=%7d B' % r)

if __name__ == '__main__':
    main()
