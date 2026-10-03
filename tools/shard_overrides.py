#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Разбивает плоский overrides.json на шарды data/overrides/<БУКВА>.json + manifest.json.

Использование:
    python3 tools/shard_overrides.py <плоский overrides.json> <каталог data/overrides>

Пример:
    python3 tools/shard_overrides.py overrides.json data/overrides

Правила разбиения те же, что deriveLetter() в app.js: первый символ слова
без макронов/диакритики (ā→a, ķ→k, ì→i, …); č/š/ž — отдельные буквы
алфавита. Слова, начинающиеся не с буквы алфавита (цифры, прочее),
попадают в шард _misc.json. Порядок записей внутри шардов сохраняется
(он важен: повторные оверлеи одного слова применяются по очереди).

Манифест data/overrides/manifest.json:
    { "version": 1, "generated": "<дата>", "total": N,
      "shards": [ {"letter": "A", "file": "A.json", "count": 123}, … ] }

Плоский файл — источник правок: правьте его (или отдельный шард) и
запускайте скрипт заново; он перезапишет data/overrides/ целиком.
"""
import json
import os
import sys
import datetime

LETTER_ORDER = "ABCČDEFGHIJKLMNOPRSŠTUVWZŽ"

# Те же соответствия, что MACRON/deriveLetter в app.js.
MAP = {
    'ā': 'a', 'ī': 'i', 'ū': 'u', 'ē': 'e', 'ō': 'o',
    'à': 'a', 'á': 'a', 'è': 'e', 'ì': 'i', 'í': 'i',
    'ó': 'o', 'ù': 'u', 'ú': 'u',
    'š': 's', 'č': 'c', 'ž': 'z',
    'ķ': 'k', 'ģ': 'g', 'ļ': 'l', 'ĺ': 'l', 'ľ': 'l',
    'ņ': 'n', 'ń': 'n', 'ŗ': 'r', 'ŕ': 'r',
    'ţ': 't', 'ț': 't', 'ḑ': 'd', 'ź': 'z', 'ḿ': 'm',
}


def derive_letter(word):
    """Буква шарда — в точности как deriveLetter() в app.js."""
    w = (word or "").strip()
    if not w:
        return None
    first = w[0].lower()
    if first in "čšž":
        return first.upper()
    return (MAP.get(first, first)).upper()


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src, out_dir = sys.argv[1], sys.argv[2]

    with open(src, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        print("Ошибка: ожидался JSON-массив оверлеев")
        sys.exit(1)

    shards = {}   # letter -> [entries]
    skipped = 0
    for entry in data:
        word = entry.get("word") if isinstance(entry, dict) else None
        letter = derive_letter(word)
        if letter is None:
            skipped += 1
            continue
        if letter not in LETTER_ORDER:
            letter = "_misc"
        shards.setdefault(letter, []).append(entry)

    os.makedirs(out_dir, exist_ok=True)
    # убрать старые шарды, которых больше нет
    for name in os.listdir(out_dir):
        if name.endswith(".json"):
            os.remove(os.path.join(out_dir, name))

    manifest_shards = []
    total = 0
    for letter in LETTER_ORDER + "_":
        key = "_misc" if letter == "_" else letter
        if key not in shards:
            continue
        file_name = key + ".json"
        path = os.path.join(out_dir, file_name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(shards[key], f, ensure_ascii=False, indent=2)
        manifest_shards.append({"letter": key, "file": file_name, "count": len(shards[key])})
        total += len(shards[key])
        print(f"  {file_name:12} {len(shards[key]):5} записей  ({os.path.getsize(path)/1e6:.2f} МБ)")

    manifest = {
        "version": 1,
        "generated": datetime.date.today().isoformat(),
        "total": total,
        "shards": manifest_shards,
    }
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\nитого: {total} записей в {len(manifest_shards)} шардах"
          + (f", пропущено без word: {skipped}" if skipped else ""))
    if total != len(data):
        print(f"ВНИМАНИЕ: в исходнике {len(data)} записей — проверьте пропущенные!")


if __name__ == "__main__":
    main()
