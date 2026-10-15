#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Собирает плоский overrides.json обратно из шардов data/overrides/.

Обратная операция к shard_overrides.py. Порядок шардов берётся из
manifest.json (он же порядок алфавита), порядок записей внутри шардов
сохраняется как есть.

Использование:
    python3 tools/unshard_overrides.py data/overrides overrides.json
"""
import json
import os
import sys

LETTER_ORDER = "ABCČDEFGHIJKLMNOPRSŠTUVWZŽ"


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src_dir, dst = sys.argv[1], sys.argv[2]

    with open(os.path.join(src_dir, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)

    by_letter = {s["letter"]: s["file"] for s in manifest["shards"]}
    order = [L for L in LETTER_ORDER if L in by_letter] + \
            [k for k in by_letter if k not in LETTER_ORDER]

    total = 0
    out = []
    for letter in order:
        with open(os.path.join(src_dir, by_letter[letter]), encoding="utf-8") as f:
            entries = json.load(f)
        out.extend(entries)
        total += len(entries)

    if total != manifest.get("total", total):
        print(f"ВНИМАНИЕ: сумма шардов {total} != manifest.total {manifest['total']}")

    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"собрано {total} записей -> {dst}")


if __name__ == "__main__":
    main()
