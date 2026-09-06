# Prusiskan Wirdeīns — Dictionary Sync

Автоматизированная еженедельная синхронизация словаря прусского языка.

## Что делает этот проект

Каждую неделю (в понедельник в 09:00) автоматически:

1. **Проверяет пополнение** — скачивает `dictionary.json` с [cold-surf-6ba9.syniava.workers.dev](https://cold-surf-6ba9.syniava.workers.dev) и сравнивает с предыдущей версией, чтобы найти новые и изменённые слова.

2. **Извлекает склонения** — для каждого нового или изменённого слова обращается к [wirdeins.twanksta.org](https://wirdeins.twanksta.org) и извлекает таблицу склонений (падежи, числа) через API `/search/` и `/more/`.

3. **Экспортирует файлы** — генерирует JSON-файлы с изменениями и полными данными для публикации на GitHub.

## Структура проекта

```
github_publish/
├── changes.json          # Полный отчёт об изменениях за эту неделю
├── new_entries.json      # Только новые слова (если есть)
├── modified_entries.json # Только изменённые слова (если есть)
├── removed_entries.json  # Только удалённые слова (если есть)
└── overrides.json        # Переопределения склонений
```

## Формат данных

### dictionary.json (исходные данные)
Каждая запись содержит:
- `i` — номер (id в словаре)
- `w` — слово на прусском (с диакритикой)
- `l` — буква (для навигации по алфавиту)
- `f` — форма (feminine)
- `x` — экспертная отметка
- `b` — базовое слово (для словообразования)
- `g` — род (masc/fem/neut)
- `s` — описание/примечание
- `de`, `en`, `lt`, `lv`, `pl`, `ru` — переводы на 6 языков

### changes.json (выходные данные)
```json
{
  "generated_at": "2026-09-01T12:00:00Z",
  "total_added": 5,
  "total_modified": 2,
  "total_removed": 0,
  "added_with_forms": [...],
  "modified_with_forms": [...]
}
```

## Как это работает

### Источники данных

- **cold-surf-6ba9.syniava.workers.dev** — ваш редактор для работы со словами (Vue.js SPA)
  - API: `data/dictionary.json` и `data/overrides.json`

- **wirdeins.twanksta.org** — онлайн-словарь прусского языка
  - API поиска: `GET /search/?s={word}&language={lang}&dia={dia}`
  - API склонений: `POST /more/` с параметрами `word`, `numb`, `desc`

### Автоматизация

Задача запускается через **cron** в Hermes Agent:
- **Расписание**: каждый понедельник в 09:00
- **Скрипт**: `prussian_full_sync.py`
- **Логи**: `prussian_dict/logs/`

## Настройка

### GitHub Token (для публикации)

Создайте персональный токен доступа:
1. Перейдите на https://github.com/settings/tokens
2. Создайте токен с scope `repo`
3. Добавьте в `~/.hermes/.env`:
```
GITHUB_TOKEN=ghp_ВашТокенЗдесь
```

Если токен не установлен, используется fallback через `git clone + push`.

## Лицензия

Словарь: [Prūsas Tāutas Prēigara](https://awizi.twanksta.org) | © Twānkstas Prūsa
