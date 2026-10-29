#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""道藏全库正文搜索索引生成器（批一·正文搜索②）。

方案：bigram 倒排（按「部」粒度，只记命中部、不记位置）＋分片二进制。
 - 归一化口径与端上一致：先按 daozang.js dzIsPunct 剥标点/空白，再用
   t2s.js 同一算法（PROTECT→短语→单字、等长替换）转简体——用户键入简体
   （或繁体经同路转换）皆可命中，偏移与底本 1:1 对齐不漂移。
 - bigram 按 UTF-16 code unit 计算（与 JS charCodeAt 同口径）。
 - 分片：shard = (u1*31 + u2) % NSHARD；片内目录 (key,off,len) 排序二分，
   posting 为 work 序号的 delta-varint 流。
 - 客户端查词：取询问各 bigram 所在分片→读目录得 posting 长度→选最小
   posting 的 bigram 为主钥、其余求交→候选作品（上限内）逐部拉底本验证
   精确命中并产出卷号/偏移/摘要。
产物：www/content/daozang/search/{manifest.json, s000.bin ...}
重跑：底本 feed version 变化后执行本脚本并随发版提交产物。
"""
import json, os, re, struct, sys, time

ROOT = os.path.dirname(os.path.abspath(__file__))
FEED = os.path.join(ROOT, 'www', 'content', 'daozang')
OUT = os.path.join(FEED, 'search')
NSHARD = 96

DZ_PUNCT = set('。，、；：？！·…—「」『』﹝﹞（）《》〈〉“”‘’％')

def is_punct(ch):
    return ch in DZ_PUNCT or ch.isspace()

# ---------- t2s.js 同算法移植 ----------
def load_t2s():
    src = open(os.path.join(ROOT, 'www', 'js', 't2s.js'), encoding='utf-8').read()
    def grab(name):
        m = re.search(r'var %s = (\[.*?\]|\{.*?\});' % name, src, re.S)
        return json.loads(m.group(1))
    cmap = grab('T2S_MAP')
    phrases = grab('T2S_PHRASES')
    protect = grab('T2S_PROTECT')
    idx = {}
    def add(k, v):
        idx.setdefault(k[0], []).append((k, v))
    for p in protect:
        add(p, p)
    for k, v in phrases:
        add(k, v)
    for c in idx:
        idx[c].sort(key=lambda kv: -len(kv[0]))  # 稳定排序，与 JS 一致
    return cmap, idx

CMAP, CIDX = load_t2s()

def t2s(s):
    if not s:
        return s
    out = []
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        cand = CIDX.get(c)
        done = False
        if cand:
            for k, v in cand:
                if len(k) <= n - i and s.startswith(k, i):
                    out.append(v)
                    i += len(k)
                    done = True
                    break
        if not done:
            out.append(CMAP.get(c, c))
            i += 1
    return ''.join(out)

def utf16_units(s):
    b = s.encode('utf-16-le', 'surrogatepass')
    return struct.unpack('<%dH' % (len(b) // 2), b)

def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)

def main():
    t0 = time.time()
    index = json.load(open(os.path.join(FEED, 'index.json'), encoding='utf-8'))
    works = index['works']
    postings = {}  # (u1,u2) -> set(workIdx)
    total_chars = 0
    for wi, w in enumerate(works):
        path = os.path.join(FEED, 'texts', w['id'] + '.json')
        d = json.load(open(path, encoding='utf-8'))
        parts = []
        for v in d['volumes']:
            for p in v['paras']:
                parts.append(p)
        raw = ''.join(parts)
        stripped = ''.join(ch for ch in raw if not is_punct(ch))
        total_chars += len(stripped)
        norm = t2s(stripped)
        units = utf16_units(norm)
        seen = set()
        for i in range(len(units) - 1):
            seen.add((units[i], units[i + 1]))
        for bg in seen:
            s = postings.get(bg)
            if s is None:
                postings[bg] = {wi}
            else:
                s.add(wi)
        if wi % 300 == 0:
            print('  %d/%d works, %d bigrams, %.1fs' % (wi, len(works), len(postings), time.time() - t0), flush=True)
    total_pairs = sum(len(s) for s in postings.values())
    print('works=%d strippedChars=%d distinctBigrams=%d pairs=%d buildSec=%.1f'
          % (len(works), total_chars, len(postings), total_pairs, time.time() - t0))

    os.makedirs(OUT, exist_ok=True)
    shards = {}
    for (u1, u2), ws in postings.items():
        sn = (u1 * 31 + u2) % NSHARD
        shards.setdefault(sn, []).append(((u1 << 16) | u2, sorted(ws)))
    total_bytes = 0
    shard_sizes = []
    for sn in range(NSHARD):
        recs = sorted(shards.get(sn, []), key=lambda r: r[0])
        data = bytearray()
        directory = []
        for key, ws in recs:
            off = len(data)
            prev = 0
            for wi in ws:
                data += varint(wi - prev)
                prev = wi
            directory.append((key, off, len(data) - off))
        blob = bytearray()
        blob += struct.pack('<I', len(recs))
        for key, off, ln in directory:
            blob += struct.pack('<III', key, off, ln)
        blob += data
        p = os.path.join(OUT, 's%03d.bin' % sn)
        open(p, 'wb').write(bytes(blob))
        total_bytes += len(blob)
        shard_sizes.append(len(blob))
    shard_sizes.sort()
    manifest = {
        'v': 1,
        'feed': index.get('version'),
        'shards': NSHARD,
        'works': [w['id'] for w in works],
        'pairs': total_pairs,
        'bigrams': len(postings),
        'bytes': total_bytes,
    }
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print('indexBytes=%d shardAvg=%d shardP50=%d shardP95=%d shardMax=%d'
          % (total_bytes, total_bytes // NSHARD, shard_sizes[len(shard_sizes) // 2],
             shard_sizes[int(len(shard_sizes) * 0.95)], shard_sizes[-1]))
    print('DONE %.1fs' % (time.time() - t0))

if __name__ == '__main__':
    main()
