(function(){
  "use strict";

  const LETTER_ORDER = "ABCČDEFGHIJKLMNOPRSŠTUVWZŽ".split("");
  const PAGE_SIZE = 150;
  // Нормализация для поиска: снимаем макроны/акценты и «мягкие» согласные,
  // а также комбинирующие знаки (в данных встречаются наддолгие ā̄, ī̄ и т.п.).
  const MACRON = {'ā':'a','ī':'i','ū':'u','ē':'e','ō':'o','à':'a','á':'a','è':'e',
                  'ì':'i','í':'i','ó':'o','ù':'u','ú':'u','ỹ':'y','ỳ':'y',
                  'š':'s','č':'c','ž':'z',
                  'ķ':'k','ģ':'g','ļ':'l','ĺ':'l','ľ':'l','ņ':'n','ń':'n',
                  'ŗ':'r','ŕ':'r','ţ':'t','ț':'t','ḑ':'d','ź':'z','ḿ':'m'};
  const normCache = new Map();
  function stripAccents(s){
    const cached = normCache.get(s);
    if (cached !== undefined) return cached;
    let out = "";
    for (const ch of s.toLowerCase()){
      if (ch >= "\u0300" && ch <= "\u036f") continue; // combining marks
      out += MACRON[ch] || ch;
    }
    normCache.set(s, out);
    return out;
  }
  // Буква группировки для новых слов: первый символ без диакритики,
  // но č/š/ž остаются отдельными буквами алфавита.
  function deriveLetter(w){
    const first = w[0].toLowerCase();
    if (first === "č" || first === "š" || first === "ž") return first.toUpperCase();
    return (MACRON[first] || first).toUpperCase();
  }

  const LANG_LABELS = {ru:"рус.", lt:"lit.", lv:"latv.", de:"deu.", en:"eng.", pl:"pol."};

  let DATA = [];
  let byLetter = {};
  let byWordLower = {};      // word(lower) -> [entries]
  let formsOfBase = {};      // baseword(lower) -> [entries that are forms of it]

  let state = {
    letter: "A",
    query: "",
    visible: PAGE_SIZE,
  };

  const el = {
    letterNav: document.getElementById("letterNav"),
    letterHeading: document.getElementById("letterHeading"),
    entryList: document.getElementById("entryList"),
    loadMoreWrap: document.getElementById("loadMoreWrap"),
    loadMoreBtn: document.getElementById("loadMoreBtn"),
    emptyState: document.getElementById("emptyState"),
    searchInput: document.getElementById("searchInput"),
    searchMeta: document.getElementById("searchMeta"),
    totalCount: document.getElementById("totalCount"),
    modal: document.getElementById("entryModal"),
    modalBody: document.getElementById("modalBody"),
    modalClose: document.getElementById("modalClose"),
    modalBackdrop: document.getElementById("modalBackdrop"),
  };

  // Recursively collects every inflected word-form string found inside an
  // entry's paradigm/conjugation data (declension tables, verb forms, etc.),
  // so they become searchable even though they aren't separate dictionary entries.
  function collectFormStrings(obj, out){
    if (!obj) return;
    if (typeof obj === "string"){ out.push(obj); return; }
    if (Array.isArray(obj)){ obj.forEach(v => collectFormStrings(v, out)); return; }
    if (typeof obj === "object"){
      for (const k in obj){
        // "title" — описательные подписи, "p" — местоимения-подлежащие
        // (as (я), mes (мы)…): это не словоформы, и они не должны участвовать
        // в поиске (иначе запрос «мы» матчит все глаголы).
        if (k === "title" || k === "p") continue;
        collectFormStrings(obj[k], out);
      }
    }
  }

  function getEntryForms(e){
    if (e._formsCache) return e._formsCache;
    const list = [];
    if (e.paradigm) collectFormStrings(e.paradigm, list);
    if (e.conjugation) collectFormStrings(e.conjugation, list);
    e._formsCache = list;
    return list;
  }

  // Returns the first inflected form (from paradigm/conjugation) matching q, if any.
  function findMatchingForm(e, q){
    const forms = getEntryForms(e);
    for (const f of forms){
      if (stripAccents(f).includes(q)) return f;
    }
    return null;
  }

  function init(data){
    DATA = data;
    el.totalCount.textContent = DATA.length.toLocaleString("ru-RU");

    for (const e of DATA){
      (byLetter[e.l] ||= []).push(e);
      const wl = e.w.toLowerCase();
      (byWordLower[wl] ||= []).push(e);
      if (e.x && e.b){
        const bl = e.b.toLowerCase();
        (formsOfBase[bl] ||= []).push(e);
      }
    }
    for (const L in byLetter){
      byLetter[L].sort((a,b) => a.w.localeCompare(b.w, 'lt'));
    }

    buildLetterNav();
    render();
  }

  function buildLetterNav(){
    el.letterNav.innerHTML = "";
    for (const L of LETTER_ORDER){
      const count = (byLetter[L] || []).length;
      if (!count) continue;
      const btn = document.createElement("button");
      btn.className = "letter-btn" + (L === state.letter ? " active" : "");
      btn.innerHTML = L + `<span class="count">${count}</span>`;
      btn.addEventListener("click", () => {
        state.letter = L;
        state.query = "";
        el.searchInput.value = "";
        state.visible = PAGE_SIZE;
        buildLetterNav();
        render();
        window.scrollTo({top:0, behavior:"smooth"});
      });
      el.letterNav.appendChild(btn);
    }
  }

  function currentResults(){
    if (state.query.trim()){
      const q = stripAccents(state.query.trim());
      return DATA.filter(e => {
        if (stripAccents(e.w).includes(q)) return true;
        if (e.f && stripAccents(e.f).includes(q)) return true;
        for (const k of ["ru","lt","lv","de","en","pl"]){
          if (e[k] && e[k].toLowerCase().includes(state.query.trim().toLowerCase())) return true;
        }
        if (findMatchingForm(e, q)) return true;
        return false;
      });
    }
    return byLetter[state.letter] || [];
  }

  function glossLine(e){
    const parts = [];
    if (e.ru) parts.push(e.ru);
    if (e.lt) parts.push(e.lt);
    return parts.join(" · ") || "—";
  }

  function render(){
    const results = currentResults();
    const isSearch = !!state.query.trim();

    el.letterHeading.innerHTML = isSearch
      ? `«${escapeHtml(state.query.trim())}» <span class="sub">${results.length} найдено</span>`
      : `${state.letter} <span class="sub">${results.length} статей</span>`;

    el.searchMeta.textContent = isSearch ? `${results.length}` : "";

    const slice = results.slice(0, state.visible);
    el.entryList.innerHTML = "";
    const frag = document.createDocumentFragment();

    for (const e of slice){
      const row = document.createElement("div");
      row.className = "entry" + (e.x ? " is-form" : "");

      let glossHtml = escapeHtml(glossLine(e));
      if (isSearch){
        const q = stripAccents(state.query.trim());
        if (!stripAccents(e.w).includes(q)){
          const m = findMatchingForm(e, q);
          if (m) glossHtml += ` <span class="entry-formhint">— словоформа: ${escapeHtml(m)}</span>`;
        }
      }

      row.innerHTML = `
        <span class="entry-word">${escapeHtml(e.w)}</span>
        <span class="entry-gloss">${glossHtml}</span>
        <span class="entry-tag">${e.x ? "форма" : (e.g || "")}</span>
      `;
      row.addEventListener("click", () => openModal(e));
      frag.appendChild(row);
    }
    el.entryList.appendChild(frag);

    el.emptyState.hidden = results.length !== 0;
    el.loadMoreWrap.hidden = results.length <= state.visible;
  }

  function escapeHtml(s){
    return String(s || "").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  const GENDER_LABEL = {masc:"муж. р.", fem:"жен. р.", neut:"ср. р."};
  const NUMBER_LABEL = {sg:"ед. ч.", pl:"мн. ч.", du:"дв. ч."};
  const CASE_LABEL = {nom:"Nom", gen:"Gen", dat:"Dat", akk:"Akk", ins:"Ins", lok:"Lok", vok:"Vok"};
  const CASE_ORDER = ["nom","gen","dat","akk","ins","lok","vok"];
  const DEGREE_KEYS = ["positive","comparative","superlative"];
  const DEGREE_LABEL = {positive:"Положительная степень", comparative:"Сравнительная степень", superlative:"Превосходная степень"};

  function genderGridHtml(genderObj){
    let out = "";
    if (!genderObj || typeof genderObj !== "object") return out;
    for (const gender in genderObj){
      const numbers = genderObj[gender];
      if (!numbers || typeof numbers !== "object") continue; // защита от повреждённых данных
      for (const number in numbers){
        const forms = numbers[number];
        if (!forms || typeof forms !== "object") continue;
        const cases = CASE_ORDER.filter(c => forms[c]);
        if (!cases.length) continue;
        out += `<div class="mw-para-block">
          <div class="mw-para-title">${escapeHtml(GENDER_LABEL[gender] || gender)}, ${escapeHtml(NUMBER_LABEL[number] || number)}</div>
          <table class="mw-para-table">
            ${cases.map(c => `<tr><td class="mw-para-case">${CASE_LABEL[c] || c}</td><td class="mw-para-form">${escapeHtml(forms[c])}</td></tr>`).join("")}
          </table>
        </div>`;
      }
    }
    return out;
  }

  function paradigmHtml(paradigm){
    if (!paradigm || typeof paradigm !== "object") return "";

    const isAdjective = DEGREE_KEYS.some(k => paradigm[k]);

    if (isAdjective){
      let out = `<div class="mw-paradigm"><h3>Склонение</h3>`;
      for (const deg of DEGREE_KEYS){
        if (!paradigm[deg]) continue;
        out += `<h4 class="mw-degree-title">${DEGREE_LABEL[deg]}</h4><div class="mw-paradigm-grid">${genderGridHtml(paradigm[deg])}</div>`;
      }
      if (paradigm.adverb){
        const rows = DEGREE_KEYS.filter(deg => paradigm.adverb[deg]);
        if (rows.length){
          out += `<h4 class="mw-degree-title">Наречие</h4><div class="mw-adv-list">
            ${rows.map(deg => `<div class="mw-adv-row"><div class="mw-adv-label">${DEGREE_LABEL[deg]}</div><div class="mw-para-form">${escapeHtml(paradigm.adverb[deg])}</div></div>`).join("")}
          </div>`;
        }
      }
      out += `</div>`;
      return out;
    }

    // noun-style: gender -> number -> cases
    let out = `<div class="mw-paradigm"><h3>Склонение</h3><div class="mw-paradigm-grid">${genderGridHtml(paradigm)}</div></div>`;
    return out;
  }

  const TENSE_LABEL = {present:"Настоящее время", past:"Прошедшее время", perfect:"Перфект", future:"Будущее время"};

  function pronounRowsHtml(rows){
    if (!Array.isArray(rows) || !rows.length) return "";
    return `<table class="mw-conj-table">${rows.map(r => `<tr><td class="mw-conj-pron">${escapeHtml(r.p)}</td><td class="mw-conj-form">${escapeHtml(r.f)}</td></tr>`).join("")}</table>`;
  }

  function conjugationHtml(conj){
    if (!conj || typeof conj !== "object") return "";
    let out = `<div class="mw-paradigm"><h3>Спряжение</h3>`;

    if (conj.indicative){
      out += `<h4 class="mw-degree-title">Изъявительное наклонение</h4>`;
      for (const tense of ["present","past","perfect","future"]){
        if (!conj.indicative[tense]) continue;
        out += `<div class="mw-conj-subblock"><div class="mw-conj-subtitle">${TENSE_LABEL[tense] || tense}</div>${pronounRowsHtml(conj.indicative[tense])}</div>`;
      }
    }

    if (conj.optative){
      out += `<h4 class="mw-degree-title">Оптатив</h4><table class="mw-conj-table"><tr><td class="mw-conj-form">${escapeHtml(conj.optative)}</td></tr></table>`;
    }

    if (conj.imperative){
      out += `<h4 class="mw-degree-title">Императив</h4>${pronounRowsHtml(conj.imperative)}`;
    }

    if (conj.subjunctive){
      out += `<h4 class="mw-degree-title">Сослагательное наклонение</h4>${pronounRowsHtml(conj.subjunctive)}`;
    }

    if (conj.participles && conj.participles.length){
      out += `<h4 class="mw-degree-title">Причастия</h4>`;
      for (const part of conj.participles){
        out += `<div class="mw-conj-subblock"><div class="mw-conj-subtitle">${escapeHtml(part.title)}: <i>${escapeHtml(part.headword)}</i></div><div class="mw-paradigm-grid">${genderGridHtml(part.genders)}</div></div>`;
      }
    }

    out += `</div>`;
    return out;
  }

  function openModal(e){
    const rows = [];
    for (const k of ["ru","lt","lv","de","en","pl"]){
      const val = e[k];
      rows.push(`<div class="mw-lang">${LANG_LABELS[k]}</div><div class="mw-val ${val ? "" : "empty"}">${val ? escapeHtml(val) : "нет данных"}</div>`);
    }

    let xrefHtml = "";
    if (e.x && e.b){
      xrefHtml = `<p class="mw-xref">Словоформа от: <a data-word="${escapeHtml(e.b)}">${escapeHtml(e.b)}</a>${e.g ? " — " + escapeHtml(e.g) : ""}</p>`;
    }
    const bl = e.w.toLowerCase();
    if (formsOfBase[bl] && formsOfBase[bl].length){
      const links = formsOfBase[bl]
        .map(f => `<a data-word="${escapeHtml(f.w)}">${escapeHtml(f.w)}${f.g ? " <i>("+escapeHtml(f.g)+")</i>" : ""}</a>`)
        .join(", ");
      xrefHtml += `<p class="mw-xref">Словоформы: ${links}</p>`;
    }

    el.modalBody.innerHTML = `
      <h2 class="mw-head">${escapeHtml(e.w)}</h2>
      ${e.f ? `<p class="mw-forms">варианты: ${escapeHtml(e.f)}</p>` : ""}
      ${e.s ? `<p class="mw-source">${escapeHtml(e.s)}</p>` : ""}
      ${xrefHtml}
      <div class="mw-table">${rows.join("")}</div>
      ${paradigmHtml(e.paradigm)}
      ${conjugationHtml(e.conjugation)}
    `;

    el.modalBody.querySelectorAll("a[data-word]").forEach(a => {
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const w = a.getAttribute("data-word").toLowerCase();
        const matches = byWordLower[w];
        if (matches && matches.length) openModal(matches[0]);
      });
    });

    el.modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal(){
    el.modal.hidden = true;
    document.body.style.overflow = "";
  }

  el.modalClose.addEventListener("click", closeModal);
  el.modalBackdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !el.modal.hidden) closeModal();
  });

  let searchDebounce;
  el.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.query = el.searchInput.value;
      state.visible = PAGE_SIZE;
      render();
    }, 150);
  });

  el.loadMoreBtn.addEventListener("click", () => {
    state.visible += PAGE_SIZE;
    render();
  });

  let inited = false;
  function safeInit(data){
    if (inited) return;
    inited = true;
    init(data);
  }

  const OVERRIDE_META_KEYS = ["word","id","letter","is_form","forms","base_word","grammar_note","source"];

  function applyOverrides(data, overrides){
    if (!Array.isArray(overrides) || !overrides.length) return data;
    const byWord = {};
    for (const e of data) (byWord[e.w.toLowerCase()] ||= []).push(e);
    const byId = {};
    for (const e of data) byId[String(e.i)] = e;

    for (const ov of overrides){
      if (!ov.word) continue;
      const key = ov.word.toLowerCase();

      // If an explicit id is given, target that single entry only —
      // needed to disambiguate homographs (same headword, different entries).
      if (ov.id !== undefined && byId[String(ov.id)]){
        const t = byId[String(ov.id)];
        for (const k in ov){
          if (k === "word" || k === "id") continue;
          t[k] = ov[k];
        }
        continue;
      }

      const targets = byWord[key];
      if (targets && targets.length){
        // merge onto every existing entry with this headword
        for (const t of targets){
          for (const k in ov){
            if (k === "word") continue;
            t[k] = ov[k];
          }
        }
      } else {
        // brand-new entry not present in the base dictionary
        const fresh = {
          i: (ov.id !== undefined ? ov.id : "new-" + key),
          w: ov.word,
          l: (ov.letter || deriveLetter(ov.word)).toUpperCase(),
          f: ov.forms || "",
          x: !!ov.is_form,
          b: ov.base_word || "",
          g: ov.grammar_note || "",
          s: ov.source || "добавлено вручную",
          ru: ov.ru || "", lt: ov.lt || "", lv: ov.lv || "", de: ov.de || "", en: ov.en || "", pl: ov.pl || "",
        };
        for (const k in ov){
          if (OVERRIDE_META_KEYS.indexOf(k) !== -1) continue; // уже разложены выше
          fresh[k] = ov[k]; // paradigm, conjugation, переводы и прочее
        }
        data.push(fresh);
        // регистрируем, чтобы повторный override того же слова не создал дубль
        (byWord[key] ||= []).push(fresh);
        if (fresh.i !== undefined && fresh.i !== null) byId[String(fresh.i)] = fresh;
      }
    }
    return data;
  }

  const OVERRIDE_FILE_RE = /^[A-Za-zČŠŽ_]+\.json$/;

  // Старый формат: единый data/overrides.json.
  function loadOverridesFlat(){
    return fetch("data/overrides.json")
      .then(r => r.ok ? r.json() : [])
      .catch(() => []);
  }

  // Новый формат: data/overrides/manifest.json + шарды по буквам
  // (A.json … Ž.json, см. tools/shard_overrides.py). Шарды грузятся
  // параллельно; порядок записей внутри шардов сохранён скриптом.
  // Если манифеста нет — прозрачный откат на старый единый файл.
  function loadOverrides(){
    return fetch("data/overrides/manifest.json")
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(m => {
        if (!m || !Array.isArray(m.shards) || !m.shards.length) return loadOverridesFlat();
        const files = m.shards
          .map(s => (typeof s === "string" ? s : (s && s.file) || ""))
          .filter(f => OVERRIDE_FILE_RE.test(f)); // защита имён от выхода за каталог
        return Promise.all(files.map(f =>
          fetch("data/overrides/" + f)
            .then(r => r.ok ? r.json() : [])
            .catch(() => [])
        )).then(lists => lists.reduce((acc, l) => acc.concat(l), []));
      })
      .then(list => Array.isArray(list) ? list : []);
  }

  fetch("data/dictionary.json")
    .then(r => r.json())
    .then(data => {
      loadOverrides()
        .then(overrides => safeInit(applyOverrides(data, overrides || [])))
        .catch(() => safeInit(data));
    })
    .catch(err => {
      el.entryList.innerHTML = `<p style="color:var(--danger)">Не удалось загрузить словарь: ${escapeHtml(err.message)}. Убедитесь, что файл data/dictionary.json лежит рядом с index.html и страница открыта через веб-сервер (не просто двойным кликом по файлу).</p>`;
    });

})();
