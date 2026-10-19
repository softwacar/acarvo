# Lists Turkish string literals in the demo core layer (diagnostic tool for the i18n work).
import re, sys, json, os

root = 'src/demo/core'
files = sys.argv[1:] or [os.path.join(dp, f) for dp, _, fs in os.walk(root) for f in fs if f.endswith('.ts') and '__tests__' not in dp]
TR = re.compile(r"[çğıİöşüÇĞÖŞÜ]")
WORDS = re.compile(r"\b(ve|için|yok|bir|ile|değil|olmalı|girin|seçin|yazın|yetkiniz|kaydı|kayıt|zorunlu|bulunamadı|edilemez|yapılamaz)\b")
lit = re.compile(r"'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`")
out = {}
for f in files:
    src = open(f, encoding='utf-8').read()
    for m in lit.finditer(src):
        s = m.group(1) if m.group(1) is not None else m.group(2)
        if s is None or len(s) < 3:
            continue
        before = src[max(0, m.start() - 3):m.start()]
        if before.endswith('L(') or before.endswith('B('):
            continue
        if TR.search(s) or WORDS.search(s):
            line = src.count('\n', 0, m.start()) + 1
            out.setdefault(s, []).append(f"{os.path.basename(f)}:{line}")
print(len(out), 'unique Turkish literals')
by = {}
for s, locs in out.items():
    k = locs[0].split(':')[0]
    by[k] = by.get(k, 0) + 1
for k, v in sorted(by.items(), key=lambda x: -x[1]):
    print(v, k)
# keep the order of first appearance per file
json.dump(out, open('scripts/i18n-worklist.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
