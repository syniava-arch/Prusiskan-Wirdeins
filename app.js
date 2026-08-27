(function(){
  "use strict";

  const LETTER_ORDER = "ABCČDEFGHIJKLMNOPRSŠTUVWZŽ".split("");
  const PAGE_SIZE = 150;
  const MACRON = {'ā':'a','ī':'i','ū':'u','ē':'e','ō':'o','à':'a','á':'a','è':'e',
                  'š':'s','č':'c','ž':'z'};

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

  function stripAccents(s){
    let out = "";
    for (const ch of s.toLowerCase()){
      out += MACRON[ch] || ch;
    }
    return out;
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
      row.innerHTML = `
        <span class="entry-word">${escapeHtml(e.w)}</span>
        <span class="entry-gloss">${escapeHtml(glossLine(e))}</span>
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
    for (const gender in genderObj){
      for (const number in genderObj[gender]){
        const forms = genderObj[gender][number];
        const cases = CASE_ORDER.filter(c => forms[c]);
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
          out += `<h4 class="mw-degree-title">Наречие</h4><table class="mw-para-table">
            ${rows.map(deg => `<tr><td class="mw-para-case">${DEGREE_LABEL[deg]}</td><td class="mw-para-form">${escapeHtml(paradigm.adverb[deg])}</td></tr>`).join("")}
          </table>`;
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
          i: "new-" + key, w: ov.word, l: (ov.letter || ov.word[0]).toUpperCase(),
          f: ov.forms || "", x: !!ov.is_form, b: ov.base_word || "", g: ov.grammar_note || "",
          s: ov.source || "добавлено вручную",
          ru: ov.ru || "", lt: ov.lt || "", lv: ov.lv || "", de: ov.de || "", en: ov.en || "", pl: ov.pl || "",
          ...ov,
        };
        data.push(fresh);
      }
    }
    return data;
  }

  fetch("data/dictionary.json")
    .then(r => r.json())
    .then(data => {
      fetch("data/overrides.json")
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
        .then(overrides => init(applyOverrides(data, overrides)))
        .catch(() => init(data));
    })
    .catch(err => {
      el.entryList.innerHTML = `<p style="color:var(--danger)">Не удалось загрузить словарь: ${escapeHtml(err.message)}. Убедитесь, что файл data/dictionary.json лежит рядом с index.html и страница открыта через веб-сервер (не просто двойным кликом по файлу).</p>`;
    });

})();
