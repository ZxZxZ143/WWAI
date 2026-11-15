"use strict";
/* Қолдау frontend, docs/05. Routes: #/onboarding/1-5, #/today, #/chat, #/verify, #/supports, #/plan, #/history, #/profile, #/data, #/urgent.
   M (manual mark), support creation, recommendation form and mascot choice are dialogs. */

const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const DOW = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MODES = { vent: ["Выговориться", "Внимательный ответ без заданий"], understand: ["Разобраться", "Помощь сформулировать переживание или вопрос"], step: ["Выбрать небольшой шаг", "Несколько посильных вариантов"] };
const PREF_TEXT = { vent: "Бережно выслушивать", understand: "Помогать разобраться в переживаниях", step: "Предлагать небольшие посильные действия" };
const FEELING = { good: "Хорошо", hard: "Непросто", skip: "Не хочу оценивать" };
const INTENSITY = { "": "Не указано", weak: "Слабая", moderate: "Умеренная", strong: "Сильная" };
const IMPACT = { none: "Не мешает", some: "Немного мешает", strong: "Сильно мешает", unknown: "Не указано" };
const KIND = { symptom: "Симптом", feeling: "Переживание", context: "Контекст", impact: "Влияние", need: "Потребность", thought: "Мысль или действие" };
const SUPPORT_TYPES = { letter: "Письмо будущей себе", voice: "Голосовое послание", thought: "Мысль", action: "Помогающее действие", request: "Просьба близкому", chat: "Формулировка из разговора" };
const STATUS = { pending: "Ожидает", completed: "Выполнено", skipped: "Пропущено", deferred: "Перенесено" };
const SOURCE = { self: "сама", support: "из опоры", chat: "из разговора", habit: "привычка" };
const SPECIALIST = { yes: "Да, я уже наблюдаюсь и хочу сохранять рекомендации", no: "Пока нет, хочу лучше разобраться в происходящем", unknown: "Не указано" };
const TIP = {
  base: "Сегодня можно ничего не записывать. Если захочется рассказать, я рядом.",
  energized: "Хороший день тоже стоит отметить. Потом будет видно, что ему помогло.",
  reflective: "Если появился вопрос к консультации, его можно сохранить, чтобы не потерять.",
  tired: "Можно упростить необязательное на сегодня. Это не долг на завтра.",
  hot_flash: "Если накатывает жар, пауза и прохладная вода иногда делают момент проще.",
  anxious: "Тревоге часто становится тише, когда её назвать. Можно рассказать своими словами.",
  resting: "Отдых тоже часть плана. Его не нужно заслуживать.",
};

const S = { profiles: [], pid: null, data: null, meta: null, onb: null, chat: null, verify: null, period: 7, sumSel: new Set(), summary: null,
  cal: null, calSel: null, poseMenu: false, openedSupport: null, editing: null, confirm: null };

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const view = $("#view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const parts = (iso) => iso.split("-").map(Number);
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const human = (s) => { const [, m, d] = parts(s); return `${d} ${MONTHS_GEN[m - 1]}`; };
const weekday = (s) => { const [y, m, d] = parts(s); return WEEKDAYS[new Date(y, m - 1, d).getDay()]; };
const dmy = (s) => s.split("-").reverse().join(".");
const addDays = (s, n) => { const [y, m, d] = parts(s); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
const plural = (n, a, b, c) => { const t = n % 10, h = n % 100; return t === 1 && h !== 11 ? a : t >= 2 && t <= 4 && (h < 12 || h > 14) ? b : c; };
const motionOff = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const today = () => S.data.today;
const prof = () => S.data.profile;
const P = () => `/api/profiles/${S.pid}`;
const basisDates = (ids) => ids.map((id) => { const r = S.data.records.find((x) => x.id === id); return r ? dmy(r.date).slice(0, 5) : ""; }).filter(Boolean).join(", ");
const mascotName = (id = prof().mascot) => SPECIES[id]?.name || "Персонаж";

let toastTimer;
const toast = (text) => { const t = $("#toast"); t.textContent = text; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2800); };
const api = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(json.error || "Сервер не ответил. Попробуйте ещё раз."); e.errors = json.errors || {}; throw e; }
  return json;
};
// Runs a mutation, stores the returned snapshot, shows success only after the server confirmed it.
const act = async (fn, okText) => {
  try { const r = await fn(); if (r?.snapshot) S.data = r.snapshot; else if (r?.profile && r?.today) S.data = r; if (okText) toast(okText); return r; }
  catch (e) { toast(e.message); throw e; }
};
const reload = async () => { S.data = await api(P()); };

/* ---------- Dialog with focus return ---------- */
const dlg = $("#dlg");
let dlgReturn = null;
const openDialog = (html, focusSel) => {
  dlgReturn = document.activeElement;
  dlg.innerHTML = html;
  if (!dlg.open) dlg.showModal();
  ($(focusSel || "[autofocus], input, textarea, button", dlg))?.focus();
};
const closeDialog = () => { if (dlg.open) dlg.close(); };
dlg.addEventListener("close", () => { recorder.stop(true); dlgReturn?.focus?.(); });
const dialogHead = (title, sub) => `<div class="sheet__head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div><button class="q-iconbtn" type="button" data-act="close-dlg" aria-label="Закрыть">✕</button></div>`;

/* ---------- Mascot ---------- */
const poseOf = () => prof().pose || "base";
const mountMascot = (el, pose, species = prof().mascot) => makeMascot(el, species, pose);
const petMascot = (stage) => {
  if (motionOff()) return;
  const fx = stage.querySelector(".m-fx"); if (!fx) return;
  for (let i = 0; i < 3; i++) {
    const h = document.createElementNS(NS, "path"), x = 70 + i * 30, y = 46;
    h.setAttribute("d", `M${x} ${y + 4} C${x - 8} ${y - 2} ${x - 5} ${y - 9} ${x} ${y - 4} C${x + 5} ${y - 9} ${x + 8} ${y - 2} ${x} ${y + 4} Z`);
    h.setAttribute("fill", i === 1 ? "#C2566A" : "#E9A3B0");
    h.style.transformBox = "fill-box"; h.style.transformOrigin = "center";
    fx.appendChild(h);
    h.animate([{ transform: "translate(0px,0px) scale(.5)", opacity: 0 }, { opacity: 1, offset: .2 }, { transform: `translate(${(i - 1) * 10}px,-38px) scale(1.1)`, opacity: 0 }],
      { duration: 1100 + i * 120, delay: i * 90, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" }).onfinish = () => h.remove();
  }
};
const mascotGrid = (selected, name = "mascot") => `<div class="pick-grid" role="radiogroup" aria-label="Персонаж">${SPECIES_ORDER.map((id) => `
  <label class="pick static" for="${name}-${id}"><input type="radio" class="sr-only" name="${name}" id="${name}-${id}" value="${id}" ${id === selected ? "checked" : ""}>
    <span class="mini" data-mascot="${id}"></span><b>${SPECIES[id].name}</b></label>`).join("")}</div>`;
const fillMascots = (root) => root.querySelectorAll("[data-mascot]").forEach((el) => mountMascot(el, "base", el.dataset.mascot));
const poseChips = (current, suggested = [], name = "pose") => `<div class="q-chips" role="radiogroup" aria-label="Поза персонажа">${ORDER.map((p) => `
  <label class="q-chip ${suggested.includes(p) ? "q-chip--hint" : ""}" for="${name}-${p}"><input type="radio" class="sr-only" name="${name}" id="${name}-${p}" value="${p}" ${p === current ? "checked" : ""}>${STATES[p].name}${suggested.includes(p) ? " · подходит" : ""}</label>`).join("")}</div>`;

/* ---------- Router ---------- */
const route = () => { const [name = "today", ...rest] = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean); return { name, rest }; };
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
const render = () => {
  if (!S.data) return;
  const r = route();
  if (!prof().onboardingDone && r.name !== "onboarding") { location.replace("#/onboarding/1"); return; }
  document.querySelectorAll("[data-nav]").forEach((a) => { if (a.dataset.nav === r.name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  document.body.classList.toggle("is-onboarding", r.name === "onboarding");
  $("#dateSelect").value = today();
  const screens = { onboarding: renderOnboarding, today: renderToday, chat: renderChat, verify: renderVerify, supports: renderSupports, plan: renderPlan, history: renderHistory, profile: renderProfile, data: renderData, urgent: renderUrgent };
  (screens[r.name] || renderToday)(r);
};
window.addEventListener("hashchange", () => { render(); view.focus({ preventScroll: true }); window.scrollTo(0, 0); });

/* ================= O1–O5 Onboarding ================= */
const onbDraft = () => {
  if (!S.onb) { const p = prof(); S.onb = { mascot: p.mascot, topics: new Set(p.topics), topicsOther: p.topicsOther || "", supportPref: p.supportPref, specialist: p.specialist }; }
  return S.onb;
};
const renderOnboarding = (r) => {
  const step = Math.min(5, Math.max(1, Number(r.rest[0]) || 1)), d = onbDraft();
  const dots = `<ol class="onb-dots" aria-label="Шаг ${step} из 5">${[1, 2, 3, 4, 5].map((i) => `<li class="${i === step ? "on" : i < step ? "done" : ""}"></li>`).join("")}</ol>`;
  const nav = (next, label = "Дальше", disabled = false) => `<div class="flow__foot">${step > 1 ? `<a class="q-btn q-btn--quiet" href="#/onboarding/${step - 1}">Назад</a>` : "<span></span>"}
    <div class="row">${step >= 3 ? `<button class="q-btn q-btn--quiet" type="button" data-act="onb-skip" data-step="${step}">Пропустить</button>` : ""}
    <button class="q-btn q-btn--primary" type="button" data-act="${next}" ${disabled ? "disabled" : ""}>${label}</button></div></div>`;
  let body = "";
  if (step === 1) body = `<img class="onb-logo" src="/brand/svg/qoldau-logo-stacked.svg" alt="Qoldau"><h1 class="page-title">Қолдау значит «поддержка»</h1>
    <div class="stack onb-text"><p>Рассказывай голосом или текстом, получай бережный ответ.</p>
    <p>В хороший день оставь себе опору на трудный.</p>
    <p class="muted">Все сведения добровольны. Диагноз не нужен.</p></div>
    <div class="flow__foot"><span></span><a class="q-btn q-btn--primary q-btn--lg" href="#/onboarding/2">Начать</a></div>`;
  if (step === 2) body = `<p class="q-label">Шаг 2 из 5</p><h1 class="page-title">Кого выберешь рядом?</h1><p class="muted">Сменить можно в любой момент.</p>
    ${mascotGrid(d.mascot, "onbMascot")}${nav("onb-next", d.mascot ? `Выбрать: ${mascotName(d.mascot)}` : "Выберите персонажа", !d.mascot)}`;
  if (step === 3) body = `<p class="q-label">Шаг 3 из 5</p><h1 class="page-title">О чём хочется поговорить?</h1><p class="muted">Можно несколько. В историю не попадает.</p>
    <div class="q-chips" role="group" aria-label="Темы">${Object.entries(S.meta.topics).map(([k, l]) => `<button class="q-chip" type="button" data-act="onb-topic" data-k="${k}" aria-pressed="${d.topics.has(k)}">${l}</button>`).join("")}</div>
    ${d.topics.has("other") ? `<div class="q-field"><label for="onbOther">Другие симптомы <span class="muted">(необязательно)</span></label><input class="q-input" id="onbOther" value="${esc(d.topicsOther)}"></div>` : ""}
    ${nav("onb-next")}`;
  if (step === 4) body = `<p class="q-label">Шаг 4 из 5</p><h1 class="page-title">Как поддерживать тебя чаще?</h1><p class="muted">Остальные режимы тоже останутся.</p>
    <div class="stack" role="radiogroup" aria-label="Поддержка">${Object.entries(PREF_TEXT).map(([k, l]) => `<label class="pick-row" for="pref-${k}"><input type="radio" name="pref" id="pref-${k}" value="${k}" ${d.supportPref === k ? "checked" : ""}><div><b>${l}</b><span>${MODES[k][0]}</span></div></label>`).join("")}</div>
    ${nav("onb-next")}`;
  if (step === 5) body = `<p class="q-label">Шаг 5 из 5</p><h1 class="page-title">Ты наблюдаешься у специалиста?</h1>
    <div class="stack" role="radiogroup" aria-label="Специалист">${["yes", "no"].map((k) => `<label class="pick-row" for="spec-${k}"><input type="radio" name="spec" id="spec-${k}" value="${k}" ${d.specialist === k ? "checked" : ""}><div><b>${SPECIALIST[k]}</b></div></label>`).join("")}</div>
    ${nav("onb-finish", "Перейти в Қолдау")}`;
  view.innerHTML = `<section class="onb">${dots}<div class="stack onb-body">${body}</div></section>`;
  fillMascots(view);
};
const onbCapture = () => {
  const d = onbDraft();
  const m = $('input[name="onbMascot"]:checked'); if (m) d.mascot = m.value;
  const o = $("#onbOther"); if (o) d.topicsOther = o.value;
  const pr = $('input[name="pref"]:checked'); if (pr) d.supportPref = pr.value;
  const sp = $('input[name="spec"]:checked'); if (sp) d.specialist = sp.value;
};

/* ================= T Today ================= */
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер"; };
const supportById = (id) => S.data.supports.find((s) => s.id === id);
const renderToday = () => {
  const p = prof(), pose = poseOf(), sug = S.data.suggestion, prog = S.data.plan.progress;
  let card = "";
  const opened = S.openedSupport && supportById(S.openedSupport);
  if (opened) card = supportOpenCard(opened);
  else if (sug.kind === "offer-create" && !sug.done) card = `<article class="q-tip"><p class="q-label">Опора</p><p class="q-tip__text">Хочешь оставить несколько слов себе на день, когда будет труднее?</p>
    <div class="q-tip__actions"><button class="q-btn q-btn--primary" type="button" data-act="new-support">Оставить послание</button><button class="q-btn q-btn--quiet" type="button" data-act="dismiss-suggestion">Не сейчас</button></div></article>`;
  else if (sug.kind === "offer-open" && !S.dismissed) {
    const s = supportById(sug.supportId);
    card = `<article class="q-tip"><p class="q-label">Твоя опора</p><p class="q-tip__text">Ты оставила себе небольшое послание. Хочешь открыть его?</p>
      <p class="muted" style="margin:0">${esc(s.title)}${sug.feedback ? ` · сегодня: ${{ fit: "подошло", not_now: "не сейчас", not_fit: "не подошло" }[sug.feedback]}` : ""}</p>
      <div class="q-tip__actions"><button class="q-btn q-btn--primary" type="button" data-act="open-support" data-id="${s.id}">Открыть</button><a class="q-btn q-btn--secondary" href="#/supports">Другая опора</a><button class="q-btn q-btn--quiet" type="button" data-act="dismiss-suggestion">Не сейчас</button></div></article>`;
  } else if (sug.kind === "manual" && !S.dismissed) card = `<article class="q-tip"><p class="q-label">Опора</p><p class="q-tip__text">Можно открыть любую свою опору или просто поговорить.</p>
      <div class="q-tip__actions"><a class="q-btn q-btn--secondary" href="#/supports">Мои опоры</a><a class="q-btn q-btn--quiet" href="#/chat">Поговорить</a></div></article>`;
  else card = `<article class="q-tip"><p class="q-label">На сегодня</p><p class="q-tip__text">${esc(TIP[pose])}</p></article>`;

  const items = S.data.plan.today.filter((a) => a.status !== "deferred").slice(0, 3);
  view.innerHTML = `
  <section class="hero" aria-label="Сегодня">
    <p class="q-label">${weekday(today())}, ${human(today())}</p>
    <h1 class="hero__hello">${greeting()}, ${esc(p.name)}</h1>
    <div class="stage stage--full" id="stage" role="img" aria-label="${esc(mascotName())}, поза: ${STATES[pose].name}"></div>
    <div class="hero__state"><span class="q-state">${STATES[pose].name}</span>
      <button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="toggle-pose" aria-expanded="${S.poseMenu}">Сменить позу</button></div>
    ${S.poseMenu ? `<div class="state-menu">${poseChips(pose, [], "homePose")}</div>` : ""}
    <div class="hero__body">
      <div class="cta">
        <div class="cta__row">
          <a class="q-btn q-btn--primary q-btn--lg" href="#/chat">Рассказать, как я</a>
          <button class="q-btn q-btn--secondary q-btn--lg" type="button" data-act="open-mark">Отметить самочувствие</button>
        </div>
      </div>
      ${card}
      <article class="card plan-mini" aria-labelledby="miniPlan">
        <div class="row" style="justify-content:space-between"><h2 class="panel__title" id="miniPlan">Мой план</h2><a class="q-btn q-btn--quiet q-btn--sm" href="#/plan">Весь план</a></div>
        ${progressHTML(prog)}
        ${items.length ? `<ul class="mini-list">${items.map((a) => `<li><label class="check" for="mini-${a.id}"><input type="checkbox" id="mini-${a.id}" data-act="toggle-done" data-id="${a.id}" ${a.status === "completed" ? "checked" : ""} ${a.status === "skipped" ? "disabled" : ""}><span>${esc(a.title)}${a.status === "skipped" ? " · пропущено" : ""}</span></label></li>`).join("")}</ul>` : ""}
      </article>
    </div>
  </section>`;
  const stage = $("#stage");
  mountMascot(stage, pose);
  stage.addEventListener("click", () => petMascot(stage));
};
const progressHTML = (prog) => prog.percent === null
  ? `<p class="progress-empty">На сегодня нет выбранных действий.</p>`
  : `<div class="progress" role="img" aria-label="Личные действия на сегодня: выполнено ${prog.completed} из ${prog.total}, ${prog.percent}%">
      <div class="progress__bar"><i style="width:${prog.percent}%"></i></div>
      <p><b>${prog.percent}%</b> · ${prog.completed} из ${prog.total} · личные действия на сегодня</p></div>`;
const supportOpenCard = (s) => `<article class="q-tip support-open" aria-labelledby="open-${s.id}">
  <p class="q-label" id="open-${s.id}">${SUPPORT_TYPES[s.type]} · ${s.authorship === "self" ? "От тебя для себя" : "Из разговора · сохранено тобой"} · ${dmy(s.date)}</p>
  <p class="panel__title" style="margin:0">${esc(s.title)}</p>
  ${s.text ? `<p class="q-tip__text">${esc(s.text)}</p>` : ""}
  ${s.hasAudio ? `<div class="row"><button class="q-btn q-btn--secondary" type="button" data-act="play-audio" data-id="${s.id}">Прослушать</button><audio id="audio-${s.id}" controls hidden></audio></div>` : ""}
  <p class="muted" style="margin:0">Как сейчас?</p>
  <div class="q-tip__actions">${[["fit", "Подошло"], ["not_now", "Не сейчас"], ["not_fit", "Не подошло"]].map(([v, l]) => `<button class="q-btn q-btn--secondary" type="button" data-act="support-fb" data-id="${s.id}" data-v="${v}">${l}</button>`).join("")}
    ${s.type === "action" || s.type === "request" ? `<button class="q-btn q-btn--quiet" type="button" data-act="support-to-plan" data-id="${s.id}">Добавить в план как шаг</button>` : ""}
    <button class="q-btn q-btn--quiet" type="button" data-act="close-support">Закрыть</button></div>
</article>`;

/* ================= M Manual mark (dialog) ================= */
let mark = null;
const openMark = (date = today()) => {
  const now = new Date();
  mark = { step: 1, date, time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, feeling: null, symptoms: {}, impact: "unknown", impactNote: "", context: "", pose: poseOf(), suggested: [], error: "", key: uid(), saving: false };
  renderMark();
};
const renderMark = () => {
  const m = mark;
  if (m.step === 1) {
    openDialog(`<form class="sheet__inner" id="markForm" novalidate>${dialogHead("Отметить самочувствие", "Сохраняется только после подтверждения. Отмена ничего не записывает.")}
      <div class="two-col"><div class="q-field"><label for="mDate">Дата</label><input class="q-input" id="mDate" type="date" max="${today()}" value="${m.date}"></div>
        <div class="q-field"><label for="mTime">Время</label><input class="q-input" id="mTime" type="time" value="${m.time}"></div></div>
      <fieldset class="group"><legend>Самочувствие</legend><div class="q-chips" role="radiogroup">${Object.entries(FEELING).map(([k, l]) => `<label class="q-chip" for="feel-${k}"><input class="sr-only" type="radio" name="feel" id="feel-${k}" value="${k}" ${m.feeling === k ? "checked" : ""}>${l}</label>`).join("")}</div></fieldset>
      <fieldset class="group"><legend>Симптомы <span class="muted">(можно несколько, хороший день без симптомов тоже подходит)</span></legend>
        <div class="sym-list">${S.meta.symptoms.map(([l], i) => { const on = l in m.symptoms; return `<div class="sym ${on ? "on" : ""}"><button class="q-chip" type="button" data-act="mark-sym" data-l="${esc(l)}" aria-pressed="${on}">${l}</button>
          ${on ? `<label class="sr-only" for="int-${i}">Интенсивность: ${l}</label><select class="q-input sym__int" id="int-${i}" data-l="${esc(l)}">${Object.entries(INTENSITY).map(([k, t]) => `<option value="${k}" ${m.symptoms[l] === k ? "selected" : ""}>${t}</option>`).join("")}</select>` : ""}</div>`; }).join("")}</div></fieldset>
      <fieldset class="group"><legend>Влияние на день</legend><div class="q-chips" role="radiogroup">${Object.entries(IMPACT).map(([k, l]) => `<label class="q-chip" for="imp-${k}"><input class="sr-only" type="radio" name="imp" id="imp-${k}" value="${k}" ${m.impact === k ? "checked" : ""}>${l}</label>`).join("")}</div>
        <label class="sr-only" for="mImpactNote">Как именно</label><input class="q-input" id="mImpactNote" value="${esc(m.impactNote)}" placeholder="Как именно, если хочется уточнить: например, отложила прогулку"></fieldset>
      <div class="q-field"><label for="mContext">Своими словами <span class="muted">(необязательно)</span></label><textarea class="q-input" id="mContext" rows="2">${esc(m.context)}</textarea></div>
      ${m.error ? `<p class="form-error" role="alert">${esc(m.error)}</p>` : ""}
      <div class="flow__foot"><button class="q-btn q-btn--quiet" type="button" data-act="close-dlg">Отмена</button><button class="q-btn q-btn--primary" type="submit">Посмотреть запись</button></div></form>`, "#mDate");
    $("#markForm").addEventListener("submit", (e) => { e.preventDefault(); markCapture(); markPreview(); });
  } else {
    const syms = Object.entries(m.symptoms);
    openDialog(`<div class="sheet__inner">${dialogHead("Проверьте запись", `${human(m.date)}, ${m.time} · Ручная отметка`)}
      <dl class="preview-list">
        <dt>Самочувствие</dt><dd>${m.feeling ? FEELING[m.feeling] : "Не указано"}</dd>
        <dt>Симптомы</dt><dd>${syms.length ? syms.map(([l, i]) => `${esc(l)}: ${INTENSITY[i].toLowerCase()}`).join("; ") : "Без симптомов"}</dd>
        <dt>Влияние</dt><dd>${IMPACT[m.impact]}${m.impactNote ? `; ${esc(m.impactNote)}` : ""}</dd>
        ${m.context ? `<dt>Своими словами</dt><dd>${esc(m.context)}</dd>` : ""}
      </dl>
      <fieldset class="group"><legend>${m.suggested.length > 1 ? "Какое состояние сегодня главное?" : "Поза персонажа"}</legend>
        <p class="muted" style="margin:0;font-size:14px">${m.suggested.length ? `По отметке подходит: ${m.suggested.map((x) => STATES[x].name).join(", ")}. Выбор за тобой.` : "Можно оставить текущую позу или выбрать любую."}</p>
        ${poseChips(m.pose, m.suggested, "markPose")}</fieldset>
      ${m.error ? `<p class="form-error" role="alert">${esc(m.error)}</p>` : ""}
      <div class="flow__foot"><button class="q-btn q-btn--quiet" type="button" data-act="mark-back">Изменить</button>
        <div class="row"><button class="q-btn q-btn--quiet" type="button" data-act="close-dlg">Отмена</button><button class="q-btn q-btn--primary" type="button" data-act="mark-save" ${m.saving ? "disabled" : ""}>${m.saving ? "Сохраняем…" : "Подтвердить и сохранить"}</button></div></div></div>`, "[data-act=mark-save]");
  }
};
const markCapture = () => {
  const m = mark;
  m.date = $("#mDate").value || today(); m.time = $("#mTime").value;
  m.feeling = $('input[name="feel"]:checked')?.value || null;
  m.impact = $('input[name="imp"]:checked')?.value || "unknown";
  m.impactNote = $("#mImpactNote").value.trim(); m.context = $("#mContext").value.trim();
  dlg.querySelectorAll(".sym__int").forEach((s) => { m.symptoms[s.dataset.l] = s.value; });
};
const markPreview = async () => {
  const m = mark;
  if (m.date > today()) { m.error = "Дата не может быть в будущем."; return renderMark(); }
  if (!m.feeling && !Object.keys(m.symptoms).length && !m.context) { m.error = "Отметьте самочувствие, симптом или напишите пару слов."; return renderMark(); }
  m.error = "";
  try { m.suggested = (await api("/api/poses", { method: "POST", body: { feeling: m.feeling, labels: Object.keys(m.symptoms) } })).poses; } catch { m.suggested = []; }
  if (m.suggested.length === 1 && m.pose === poseOf()) m.pose = m.suggested[0];
  m.step = 2; renderMark();
};
const markSave = async () => {
  const m = mark; if (m.saving) return;
  m.pose = $('input[name="markPose"]:checked')?.value || m.pose;
  m.saving = true; renderMark();
  try {
    await act(() => api(`${P()}/records`, { method: "POST", body: { source: "manual", date: m.date, time: m.time, feeling: m.feeling, impact: m.impact, impactNote: m.impactNote, context: m.context, pose: m.pose, requestKey: m.key,
      items: Object.entries(m.symptoms).map(([label, i]) => ({ kind: "symptom", label, intensity: i || null })) } }), "Запись сохранена в историю");
    S.openedSupport = null; S.dismissed = false; closeDialog(); render();
  } catch (e) { m.saving = false; m.error = `${e.message} Отметка осталась на экране, можно повторить.`; renderMark(); }
};

/* ================= C Conversation ================= */
const newChat = () => ({ mode: prof().supportPref || "vent", messages: [], draft: "", status: "", pendingUser: null, error: "", recording: false, speaking: null });
let player = null;
const stopSpeaking = () => { if (player) { player.pause(); player = null; } if ("speechSynthesis" in window) speechSynthesis.cancel(); if (S.chat) S.chat.speaking = null; };
const browserSpeak = (text, done) => {
  if (!("speechSynthesis" in window)) { done(false); return; }
  const u = new SpeechSynthesisUtterance(text); u.lang = "ru-RU";
  const ru = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("ru")); if (ru) u.voice = ru;
  u.onend = () => done(true); u.onerror = () => done(false);
  speechSynthesis.speak(u);
};
// Server voice first (OpenAI), browser voice as fallback. Never records while playing.
const speak = async (i) => {
  const c = S.chat, text = c.messages[i].content;
  stopSpeaking(); c.speaking = i; c.error = ""; renderChat();
  const finish = (ok) => { if (S.chat) { S.chat.speaking = null; if (!ok) S.chat.error = "Не получилось озвучить. Текст ответа на экране."; } if (route().name === "chat") renderChat(); };
  try {
    if (!S.data.ai.speech) throw new Error("no server voice");
    const { audio } = await api("/api/tts", { method: "POST", body: { text } });
    if (S.chat?.speaking !== i) return;
    player = new Audio(audio); player.onended = () => finish(true); player.onerror = () => finish(false);
    await player.play();
  } catch { if (S.chat?.speaking === i) browserSpeak(text, finish); }
};
let rec = null;
const mic = {
  media: null, chunks: [], cancelled: false,
  async start() {
    const c = S.chat;
    c.draft = $("#chatInput")?.value || c.draft; stopSpeaking();
    if (!S.data.ai.speech) return startBrowserRecognition();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = []; this.cancelled = false; this.media = new MediaRecorder(stream);
      this.media.ondataavailable = (e) => this.chunks.push(e.data);
      this.media.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        c.recording = false;
        if (this.cancelled || !this.chunks.length) { c.status = ""; return renderChat(); }
        c.status = "Распознаю…"; renderChat();
        try {
          const blob = new Blob(this.chunks, { type: this.media.mimeType || "audio/webm" });
          const audio = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
          const { text } = await api("/api/stt", { method: "POST", body: { audio } });
          c.draft = [c.draft.trim(), text].filter(Boolean).join(" "); c.status = text ? "Проверь текст и отправь" : "";
          if (!text) c.error = "Не расслышала. Попробуй ещё раз или напиши.";
        } catch (e) { c.status = ""; c.error = `${e.message} Можно написать.`; }
        if (route().name === "chat") { renderChat(); $("#chatInput")?.focus(); }
      };
      this.media.start(); c.recording = true; c.status = "Слушаю…"; c.error = "";
    } catch { c.error = "Нет доступа к микрофону. Можно написать."; }
    renderChat();
  },
  stop(cancel = false) { this.cancelled = cancel; if (this.media && this.media.state !== "inactive") this.media.stop(); else if (rec) { if (cancel) rec.onresult = null; cancel ? rec.abort() : rec.stop(); } },
};
const startBrowserRecognition = () => {
  const c = S.chat, SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { c.error = "Голос здесь недоступен. Можно написать."; return renderChat(); }
  const base = c.draft ? `${c.draft.trim()} ` : "";
  rec = new SR(); rec.lang = "ru-RU"; rec.interimResults = true; rec.continuous = true;
  rec.onresult = (ev) => { c.draft = base + [...ev.results].map((r) => r[0].transcript).join(" ").trim(); const i = $("#chatInput"); if (i) i.value = c.draft; };
  rec.onerror = () => { c.error = "Не расслышала. Попробуй ещё раз или напиши."; };
  rec.onend = () => { rec = null; c.recording = false; c.status = c.draft ? "Проверь текст и отправь" : ""; if (route().name === "chat") renderChat(); };
  try { rec.start(); c.recording = true; c.status = "Слушаю…"; c.error = ""; } catch { rec = null; c.error = "Нет доступа к микрофону. Можно написать."; }
  renderChat();
};
const sendChat = async ({ retry = false } = {}) => {
  const c = S.chat;
  if (!retry) {
    const text = ($("#chatInput")?.value || "").trim();
    if (!text) { c.error = "Напиши или надиктуй."; return renderChat(); }
    c.messages.push({ role: "user", content: text }); c.draft = "";
  }
  c.pendingUser = null; c.error = ""; c.status = "Думаю…"; renderChat();
  try {
    const r = await api(`${P()}/chat`, { method: "POST", body: { mode: c.mode, history: c.messages.map(({ role, content }) => ({ role, content })) } });
    if (r.danger) { go("#/urgent"); return; }
    c.messages.push({ role: "assistant", content: r.text, mode: c.mode });
    c.status = "";
    if (prof().autospeak && prof().voiceMode === "voice") { speak(c.messages.length - 1); return; }
  } catch (e) { c.pendingUser = true; c.status = ""; c.error = e.message; }
  if (route().name === "chat") renderChat();
};
const renderChat = () => {
  if (!S.chat) S.chat = newChat();
  const c = S.chat, busy = c.status === "Думаю…" || c.status === "Распознаю…";
  const voiceOn = prof().voiceMode === "voice";
  view.innerHTML = `<div class="flow chat">
    <div class="page-head"><h1 class="page-title">Разговор</h1><button class="q-btn q-btn--secondary" type="button" data-act="chat-finish">Закончить</button></div>
    <div class="seg seg--modes" role="radiogroup" aria-label="Формат поддержки">${Object.entries(MODES).map(([k, [n]]) => `<button type="button" role="radio" data-act="chat-mode" data-mode="${k}" aria-checked="${c.mode === k}">${n}</button>`).join("")}</div>
    <ol class="chat-log" aria-live="polite">${c.messages.map((m, i) => m.role === "user"
      ? `<li class="msg msg--user"><span class="sr-only">Ты:</span>${esc(m.content)}</li>`
      : `<li class="msg msg--ai"><p>${esc(m.content)}</p>
        <button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="${c.speaking === i ? "chat-stop-speak" : "chat-speak"}" data-i="${i}">${c.speaking === i ? "■ Остановить" : "▶ Слушать"}</button></li>`).join("") || `<li class="chat-hello">Как ты сегодня?</li>`}</ol>
    ${c.status ? `<p class="chat-status" role="status">${esc(c.status)}</p>` : ""}
    ${c.error ? `<p class="note note--warn" role="alert">${esc(c.error)} ${c.pendingUser ? `<button class="q-btn q-btn--secondary q-btn--sm" type="button" data-act="chat-retry">Повторить</button>` : ""}</p>` : ""}
    <div class="chat-input">
      <label class="sr-only" for="chatInput">Реплика</label>
      <textarea class="q-input" id="chatInput" rows="2" placeholder="${voiceOn ? "Нажми на микрофон или напиши" : "Напиши, как ты"}">${esc(c.draft)}</textarea>
      <div class="chat-input__row">
        ${voiceOn ? (c.recording
          ? `<button class="mic mic--on" type="button" data-act="mic-stop" aria-label="Остановить запись"><span class="rec-dot" aria-hidden="true"></span></button><button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="mic-cancel">Отменить</button>`
          : `<button class="mic" type="button" data-act="mic-start" aria-label="Говорить" ${busy ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`) : "<span></span>"}
        <button class="q-btn q-btn--primary" type="button" data-act="chat-send" ${c.recording || busy ? "disabled" : ""}>Отправить</button>
      </div>
      ${voiceOn ? `<p class="fineprint">Голос распознаёт и озвучивает OpenAI, ответ пишет AI. Аудио не сохраняем.</p>` : ""}
    </div>
  </div>`;
  const input = $("#chatInput");
  input.addEventListener("input", () => { c.draft = input.value; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } });
  const log = $(".chat-log"); log.lastElementChild?.scrollIntoView({ block: "nearest" });
};
const finishChat = () => {
  const c = S.chat, userText = c?.messages.filter((m) => m.role === "user").map((m) => m.content) || [];
  stopSpeaking(); mic.stop(true);
  openDialog(`<div class="sheet__inner">${dialogHead("Закончить разговор", "Разговор сам не сохраняется.")}
    <p>${userText.length ? "Можно проверить, что из сказанного сохранить в историю. Или закончить без сохранения." : "Реплик не было. Можно просто закончить."}</p>
    <div class="flow__foot"><button class="q-btn q-btn--quiet" type="button" data-act="chat-discard">Закончить без сохранения</button>
      ${userText.length ? `<button class="q-btn q-btn--primary" type="button" data-act="chat-verify">Проверить наблюдения</button>` : ""}</div></div>`);
};

/* ================= V Verify observations ================= */
const startVerify = async () => {
  const c = S.chat;
  const text = c.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  S.verify = { text, analyzed: null, items: [], mode: c.mode, chat: c.messages.map((m) => `${m.role === "user" ? "Я" : "Қолдау"}: ${m.content}`).join("\n"),
    steps: c.messages.filter((m) => m.role === "assistant" && m.mode === "step").map((m) => m.content), busy: true, error: "", savedRecord: null, savedSupport: null, savedAction: null, key: uid(), pose: poseOf(), suggested: [] };
  closeDialog(); go("#/verify");
  await analyzeVerify();
};
const analyzeVerify = async () => {
  const v = S.verify; v.busy = true; v.error = ""; renderVerify();
  try {
    const r = await api(`${P()}/extract`, { method: "POST", body: { text: v.text } });
    v.items = r.items.map((i) => ({ ...i, intensity: i.intensity === "unknown" ? "" : i.intensity, status: "suggested" })); v.analyzed = v.text; v.demo = r.demo;
    const labels = v.items.filter((i) => i.kind === "symptom").map((i) => i.label);
    v.suggested = (await api("/api/poses", { method: "POST", body: { labels } })).poses;
  } catch (e) { v.error = `${e.message} Текст остался, можно повторить.`; }
  v.busy = false; if (route().name === "verify") renderVerify();
};
const renderVerify = () => {
  const v = S.verify;
  if (!v) { view.innerHTML = `<p class="empty">Нечего проверять. <a href="#/chat">Начать разговор</a></p>`; return; }
  const stale = v.analyzed !== null && v.text !== v.analyzed;
  const confirmed = v.items.filter((i) => i.status === "confirmed");
  view.innerHTML = `<div class="flow">
    <div class="page-head"><div><h1 class="page-title">Проверь наблюдения</h1><p class="muted">Сохранится только подтверждённое.</p></div></div>
    <div class="card">
      <div class="q-field"><label for="vText">Принятый текст разговора</label><textarea class="q-input" id="vText" rows="3">${esc(v.text)}</textarea></div>
      ${stale ? `<p class="note note--warn" role="alert">Текст изменился, связанные предложения нужно проверить заново. <button class="q-btn q-btn--secondary q-btn--sm" type="button" data-act="v-reanalyze">Проверить заново</button></p>` : ""}
      ${v.busy ? `<p class="muted" role="status">Ищем наблюдения в тексте…</p>` : ""}
      <ul class="obs-list">${v.items.map((it, i) => obsRow(it, i, stale)).join("") || (v.busy ? "" : `<li class="muted">Предложений нет. Можно закончить без сохранения.</li>`)}</ul>
      ${v.items.length ? `<div class="row"><button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="v-exclude-all">Исключить всё</button></div>` : ""}
    </div>
    ${confirmed.length && !v.savedRecord ? `<fieldset class="card group"><legend>Поза персонажа</legend><p class="muted" style="margin:0;font-size:14px">${v.suggested.length ? `По подтверждённому подходит: ${v.suggested.map((x) => STATES[x].name).join(", ")}.` : "Можно оставить текущую."}</p>${poseChips(v.pose, v.suggested, "vPose")}</fieldset>` : ""}
    ${v.error ? `<p class="form-error" role="alert">${esc(v.error)}</p>` : ""}
    <div class="card stack">
      <div class="row" style="justify-content:space-between"><b>Сохранить в историю</b>${v.savedRecord ? `<span class="badge badge--useful">Сохранено: ${v.savedRecord}</span>` : `<button class="q-btn q-btn--primary" type="button" data-act="v-save" ${!confirmed.length || stale || v.busy ? "disabled" : ""}>Сохранить подтверждённое (${confirmed.length})</button>`}</div>
      <hr class="hr">
      <div class="stack"><b>Сохранить опору <span class="muted">(отдельно, необязательно)</span></b>
        ${v.savedSupport ? `<span class="badge badge--useful">Опора ${v.savedSupport} сохранена</span>` : `<div class="custom"><label class="sr-only" for="vSupport">Формулировка для опоры</label><input class="q-input" id="vSupport" placeholder="Формулировка из разговора, которая помогла" value="${esc(v.supportDraft || "")}"><button class="q-btn q-btn--secondary" type="button" data-act="v-support">Сохранить как опору</button></div>`}</div>
      <div class="stack"><b>Добавить шаг в план <span class="muted">(отдельно, необязательно)</span></b>
        ${v.savedAction ? `<span class="badge badge--useful">Шаг ${v.savedAction} в плане</span>` : `<div class="custom"><label class="sr-only" for="vStep">Шаг</label><input class="q-input" id="vStep" placeholder="Например: попросить близких о десяти минутах тишины" value="${esc(v.stepDraft || "")}"><button class="q-btn q-btn--secondary" type="button" data-act="v-step">Принять шаг</button></div>`}</div>
    </div>
    <div class="flow__foot"><a class="q-btn q-btn--quiet" href="#/chat">Вернуться к разговору</a>
      <div class="row">${v.savedRecord || v.savedSupport || v.savedAction ? `<button class="q-btn q-btn--primary" type="button" data-act="v-done">Готово</button>` : `<button class="q-btn q-btn--quiet" type="button" data-act="v-discard">Закончить без сохранения</button>`}</div></div>
  </div>`;
  const ta = $("#vText");
  ta.addEventListener("input", () => { const was = v.text !== v.analyzed; v.text = ta.value; if (was !== (v.text !== v.analyzed)) { renderVerify(); const n = $("#vText"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); } });
  $("#vSupport")?.addEventListener("input", (e) => { v.supportDraft = e.target.value; });
  $("#vStep")?.addEventListener("input", (e) => { v.stepDraft = e.target.value; });
};
const obsRow = (it, i, stale) => {
  const statusText = { suggested: "Предложение", confirmed: "Подтверждено", excluded: "Исключено" }[it.status];
  return `<li class="obs obs--${it.status} ${stale ? "obs--stale" : ""}">
    <div class="obs__main">
      <span class="obs__kind">${KIND[it.kind]}</span>
      ${S.editing === `v${i}` ? `<label class="sr-only" for="v-edit-${i}">Исправить</label><input class="q-input" id="v-edit-${i}" value="${esc(it.label)}">` : `<span class="obs__label">${esc(it.label)}</span>`}
      ${it.quote ? `<q class="obs__quote">${esc(it.quote)}</q>` : ""}
    </div>
    ${it.kind === "symptom" ? `<label class="obs__int"><span class="sr-only">Выраженность</span><select class="q-input" data-act-change="v-int" data-i="${i}">${Object.entries(INTENSITY).map(([k, t]) => `<option value="${k}" ${it.intensity === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>` : ""}
    <span class="obs__status">${statusText}</span>
    <span class="actions">${S.editing === `v${i}`
      ? `<button class="q-btn q-btn--primary q-btn--sm" type="button" data-act="v-edit-save" data-i="${i}">Сохранить</button>`
      : `${it.status !== "confirmed" ? `<button class="q-btn q-btn--secondary q-btn--sm" type="button" data-act="v-confirm" data-i="${i}" ${stale ? "disabled" : ""}>Подтвердить</button>` : ""}
         <button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="v-edit" data-i="${i}">Исправить</button>
         ${it.status !== "excluded" ? `<button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="v-exclude" data-i="${i}">Исключить</button>` : `<button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="v-restore" data-i="${i}">Вернуть</button>`}`}</span></li>`;
};

/* ================= S My supports ================= */
const renderSupports = () => {
  const list = [...S.data.supports].reverse();
  const opened = S.openedSupport && supportById(S.openedSupport);
  view.innerHTML = `
    <div class="page-head"><div><h1 class="page-title">Мои опоры</h1><p class="muted">Твои слова на трудный день.</p></div>
      <button class="q-btn q-btn--primary" type="button" data-act="new-support">Создать опору</button></div>
    ${opened ? supportOpenCard(opened) : ""}
    ${list.length ? `<div class="support-grid">${list.map((s) => {
      const last = s.feedback[s.feedback.length - 1];
      return `<article class="card support-card"><p class="q-label">${SUPPORT_TYPES[s.type]}</p><h2 class="panel__title">${esc(s.title)}</h2>
        <p class="muted" style="margin:0">${s.authorship === "self" ? "От тебя для себя" : "Из разговора · сохранено тобой"} · ${dmy(s.date)}${s.topics.length ? ` · ${s.topics.map((t) => S.meta.topics[t]).join(", ")}` : ""}</p>
        <p class="muted" style="margin:0">${last ? `Последняя отметка ${dmy(last.date)}: ${{ fit: "подошло", not_now: "не сейчас", not_fit: "не подошло" }[last.value]}` : "Отметок пока нет"}</p>
        <div class="actions"><button class="q-btn q-btn--secondary q-btn--sm" type="button" data-act="open-support" data-id="${s.id}">Открыть</button>
          ${S.confirm === `sup-${s.id}` ? `<span class="confirm">Удалить опору?<button class="q-btn q-btn--secondary q-btn--sm" type="button" data-act="support-delete-yes" data-id="${s.id}">Удалить</button><button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="confirm-no">Оставить</button></span>`
            : `<button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="confirm" data-key="sup-${s.id}">Удалить</button>`}</div></article>`;
    }).join("")}</div>` : `<p class="empty">Опор пока нет. В хороший день можно оставить себе несколько слов на день, когда будет труднее.</p>`}`;
};
const recorder = {
  media: null, chunks: [], url: null, data: null,
  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = []; this.media = new MediaRecorder(stream);
      this.media.ondataavailable = (e) => this.chunks.push(e.data);
      this.media.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (this.cancelled) return;
        const blob = new Blob(this.chunks, { type: this.media.mimeType || "audio/webm" });
        const r = new FileReader(); r.onload = () => { this.data = r.result; renderSupportForm(); }; r.readAsDataURL(blob);
      };
      this.cancelled = false; this.media.start(); return true;
    } catch { return false; }
  },
  stop(cancel = false) { this.cancelled = cancel; if (this.media && this.media.state !== "inactive") this.media.stop(); this.media = null; },
};
let supForm = null;
const newSupport = () => { supForm = { type: "letter", title: "", text: "", topics: new Set(prof().topics), error: "", recording: false }; recorder.data = null; renderSupportForm(); };
const renderSupportForm = () => {
  const f = supForm;
  openDialog(`<form class="sheet__inner" id="supForm" novalidate>${dialogHead("Новая опора", "Сохраняется только по кнопке «Сохранить». Голосовое послание никогда не включается само.")}
    <div class="q-field"><label for="supType">Тип</label><select class="q-input" id="supType">${Object.entries(SUPPORT_TYPES).filter(([k]) => k !== "chat").map(([k, l]) => `<option value="${k}" ${f.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="q-field"><label for="supTitle">Название</label><input class="q-input" id="supTitle" value="${esc(f.title)}" placeholder="Например: письмо на трудный день"></div>
    ${f.type === "voice" ? `<div class="q-field"><span class="field-label">Запись</span><div class="row">
        ${f.recording ? `<span class="rec-dot" aria-hidden="true"></span><button class="q-btn q-btn--primary" type="button" data-act="sup-rec-stop">Остановить</button>` : `<button class="q-btn q-btn--secondary" type="button" data-act="sup-rec-start">${recorder.data ? "Записать заново" : "Начать запись"}</button>`}
        ${recorder.data ? `<audio controls src="${recorder.data}"></audio>` : ""}</div></div>` : ""}
    <div class="q-field"><label for="supText">${f.type === "voice" ? "Текст к записи (необязательно)" : "Текст"}</label><textarea class="q-input" id="supText" rows="4" placeholder="Тебе можно замедлиться и попросить помощи.">${esc(f.text)}</textarea></div>
    <fieldset class="group"><legend>Темы <span class="muted">(помогают предложить опору в подходящий день)</span></legend><div class="q-chips">${Object.entries(S.meta.topics).map(([k, l]) => `<button class="q-chip" type="button" data-act="sup-topic" data-k="${k}" aria-pressed="${f.topics.has(k)}">${l}</button>`).join("")}</div></fieldset>
    ${f.error ? `<p class="form-error" role="alert">${esc(f.error)}</p>` : ""}
    <div class="flow__foot"><button class="q-btn q-btn--quiet" type="button" data-act="close-dlg">Отмена</button><button class="q-btn q-btn--primary" type="submit">Сохранить</button></div></form>`, "#supType");
  $("#supType").addEventListener("change", (e) => { supCapture(); f.type = e.target.value; renderSupportForm(); });
  $("#supForm").addEventListener("submit", async (e) => {
    e.preventDefault(); supCapture();
    if (f.type === "voice" && !recorder.data) { f.error = "Запишите голосовое послание или выберите другой тип."; return renderSupportForm(); }
    if (f.type !== "voice" && !f.text) { f.error = "Напишите текст опоры."; return renderSupportForm(); }
    try {
      await act(() => api(`${P()}/supports`, { method: "POST", body: { type: f.type, title: f.title, text: f.text, audio: f.type === "voice" ? recorder.data : undefined, topics: [...f.topics], authorship: "self" } }), "Опора сохранена");
      recorder.data = null; closeDialog(); render();
    } catch (err) { f.error = `${err.message} Текст остался в форме.`; renderSupportForm(); }
  });
};
const supCapture = () => { supForm.title = $("#supTitle").value.trim(); supForm.text = $("#supText").value.trim(); };

/* ================= P My plan ================= */
const renderPlan = () => {
  const plan = S.data.plan, todayList = plan.today.filter((a) => !a.habitId || true);
  const steps = todayList.filter((a) => !a.habitId), habitsToday = todayList.filter((a) => a.habitId);
  view.innerHTML = `
    <div class="page-head"><div><h1 class="page-title">Мой план</h1><p class="muted">${human(today())}</p></div></div>
    <article class="card">${progressHTML(plan.progress)}</article>
    <section class="plan-section" aria-labelledby="pSteps"><h2 id="pSteps">Мои шаги на сегодня</h2>
      ${steps.map(actionRow).join("") || `<p class="muted">Шагов на сегодня нет.</p>`}
      <form class="custom" id="addStep"><label class="sr-only" for="newStep">Новый шаг</label><input class="q-input" id="newStep" placeholder="Добавить свой шаг на сегодня"><button class="q-btn q-btn--secondary" type="submit">Добавить</button></form>
      ${plan.upcoming.length ? `<p class="muted" style="margin:0">Перенесено на другие дни: ${plan.upcoming.map((a) => `${esc(a.title)} (${dmy(a.date)})`).join("; ")}</p>` : ""}
    </section>
    <section class="plan-section" aria-labelledby="pHabits"><h2 id="pHabits">Повторяющиеся привычки</h2>
      ${plan.habits.map((h) => { const inst = todayList.find((a) => a.id === h.todayInstance); return `<div class="plan-card"><div class="q-plan q-plan--step"><span class="q-plan__kind">Привычка · ${esc(h.rhythm)}</span><p class="q-plan__text">${esc(h.title)}</p></div>
        <div class="actions"><label class="check" for="hab-${h.id}"><input type="checkbox" id="hab-${h.id}" data-act="habit-today" data-id="${h.id}" ${inst ? "checked" : ""}><span>Включить на сегодня</span></label>
        ${S.confirm === `hab-${h.id}` ? `<span class="confirm">Удалить привычку?<button class="q-btn q-btn--secondary q-btn--sm" type="button" data-act="habit-delete-yes" data-id="${h.id}">Удалить</button><button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="confirm-no">Оставить</button></span>` : `<button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="confirm" data-key="hab-${h.id}">Удалить</button>`}</div>
        ${inst ? actionRow(inst) : ""}</div>`; }).join("") || `<p class="muted">Привычек нет.</p>`}
      <form class="custom" id="addHabit"><label class="sr-only" for="newHabit">Новая привычка</label><input class="q-input" id="newHabit" placeholder="Свой ритуал, например: вечерняя прогулка"><button class="q-btn q-btn--secondary" type="submit">Добавить привычку</button></form>
    </section>
    <section class="plan-section" aria-labelledby="pRecs"><div class="row" style="justify-content:space-between"><h2 id="pRecs">Рекомендации специалиста</h2><button class="q-btn q-btn--secondary" type="button" data-act="new-rec">Внести рекомендацию</button></div>
      <p class="muted" style="margin:0">Не входят в процент и не оцениваются. Приложение их не переписывает.</p>
      ${plan.recommendations.map(recCard).join("") || `<p class="muted">Рекомендаций нет. ${prof().specialist === "yes" ? "Их можно внести после консультации." : ""}</p>`}
    </section>`;
  $("#addStep").addEventListener("submit", async (e) => { e.preventDefault(); const t = $("#newStep").value.trim(); if (!t) return; await act(() => api(`${P()}/actions`, { method: "POST", body: { title: t, source: "self" } }), "Шаг добавлен"); renderPlan(); });
  $("#addHabit").addEventListener("submit", async (e) => { e.preventDefault(); const t = $("#newHabit").value.trim(); if (!t) return; await act(() => api(`${P()}/habits`, { method: "POST", body: { title: t } }), "Привычка добавлена"); renderPlan(); });
};
const actionRow = (a) => {
  if (S.editing === `a-${a.id}`) return `<div class="action-row"><label class="sr-only" for="edit-${a.id}">Шаг</label><input class="q-input" id="edit-${a.id}" value="${esc(a.title)}">
    <div class="actions"><button class="q-btn q-btn--primary q-btn--sm" type="button" data-act="action-save" data-id="${a.id}">Сохранить</button><button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="edit-cancel">Отмена</button></div></div>`;
  const deferring = S.editing === `d-${a.id}`;
  return `<div class="action-row action-row--${a.status}">
    <label class="check" for="act-${a.id}"><input type="checkbox" id="act-${a.id}" data-act="toggle-done" data-id="${a.id}" ${a.status === "completed" ? "checked" : ""} ${a.status === "skipped" || a.status === "deferred" ? "disabled" : ""}>
      <span>${esc(a.title)}</span></label>
    <span class="badge">${STATUS[a.status]}${a.status === "deferred" ? ` на ${dmy(a.deferredTo)}` : ""}</span><span class="muted action-src">${SOURCE[a.source]}</span>
    <div class="actions">${a.status === "pending" ? `<button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="action-defer" data-id="${a.id}">Отложить</button><button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="action-status" data-v="skipped" data-id="${a.id}">Пропустить</button>` : ""}
      ${a.status === "skipped" ? `<button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="action-status" data-v="pending" data-id="${a.id}">Вернуть</button>` : ""}
      ${a.status !== "deferred" && !a.habitId ? `<button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="action-edit" data-id="${a.id}">Изменить</button>` : ""}
      ${!a.habitId ? (S.confirm === `act-${a.id}` ? `<span class="confirm">Удалить шаг?<button class="q-btn q-btn--secondary q-btn--sm" type="button" data-act="action-delete-yes" data-id="${a.id}">Удалить</button><button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="confirm-no">Оставить</button></span>` : `<button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="confirm" data-key="act-${a.id}">Удалить</button>`) : ""}</div>
    ${deferring ? `<div class="custom"><label class="sr-only" for="defer-${a.id}">Новая дата</label><input class="q-input" type="date" id="defer-${a.id}" min="${addDays(today(), 1)}" value="${addDays(today(), 1)}"><button class="q-btn q-btn--secondary q-btn--sm" type="button" data-act="action-defer-yes" data-id="${a.id}">Перенести</button></div>` : ""}
  </div>`;
};
const recCard = (r) => S.editing === `r-${r.id}` ? `<div class="q-plan q-plan--specialist edit-box">
    <label for="rt">Текст</label><textarea class="q-input" id="rt" rows="2">${esc(r.text)}</textarea>
    <div class="two-col"><div class="q-field"><label for="rs">Источник</label><input class="q-input" id="rs" value="${esc(r.source)}"></div><div class="q-field"><label for="rd">Дата</label><input class="q-input" id="rd" type="date" value="${r.date}"></div></div>
    <div class="q-field"><label for="ri">Показатель</label><input class="q-input" id="ri" value="${esc(r.indicator)}"></div>
    <div class="actions"><button class="q-btn q-btn--primary q-btn--sm" type="button" data-act="rec-save" data-id="${r.id}">Сохранить</button><button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="edit-cancel">Отмена</button></div></div>`
  : `<div class="plan-card"><div class="q-plan q-plan--specialist"><span class="q-plan__kind">Рекомендация специалиста · Внесено вами</span><p class="q-plan__text">${esc(r.text)}</p>
    ${r.text !== r.originalText ? `<p class="plan-meta">Исходная формулировка: ${esc(r.originalText)}</p>` : ""}
    <p class="plan-meta">${esc(r.source)} · ${dmy(r.date)}${r.indicator ? ` · Показатель: ${esc(r.indicator)}` : ""}</p></div>
    <div class="actions"><button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="rec-edit" data-id="${r.id}">Изменить</button>
      ${S.confirm === `rec-${r.id}` ? `<span class="confirm">Удалить рекомендацию?<button class="q-btn q-btn--secondary q-btn--sm" type="button" data-act="rec-delete-yes" data-id="${r.id}">Удалить</button><button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="confirm-no">Оставить</button></span>` : `<button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="confirm" data-key="rec-${r.id}">Удалить</button>`}</div></div>`;
let recErrors = {};
const openRecForm = (values = {}) => {
  openDialog(`<form class="sheet__inner" id="recForm" novalidate>${dialogHead("Рекомендация специалиста", "Вносится тобой. Приложение её не меняет и не считает в проценте.")}
    <div class="q-field"><label for="recText">Формулировка специалиста</label><textarea class="q-input" id="recText" rows="3" ${recErrors.text ? 'aria-invalid="true" aria-describedby="eText"' : ""}>${esc(values.text || "")}</textarea>${recErrors.text ? `<p class="field-error" id="eText">${esc(recErrors.text)}</p>` : ""}</div>
    <div class="two-col"><div class="q-field"><label for="recSource">Источник</label><input class="q-input" id="recSource" value="${esc(values.source || "")}" placeholder="Специалист, консультация" ${recErrors.source ? 'aria-invalid="true" aria-describedby="eSource"' : ""}>${recErrors.source ? `<p class="field-error" id="eSource">${esc(recErrors.source)}</p>` : ""}</div>
      <div class="q-field"><label for="recDate">Дата</label><input class="q-input" id="recDate" type="date" max="${today()}" value="${esc(values.date || "")}" ${recErrors.date ? 'aria-invalid="true" aria-describedby="eDate"' : ""}>${recErrors.date ? `<p class="field-error" id="eDate">${esc(recErrors.date)}</p>` : ""}</div></div>
    <div class="q-field"><label for="recInd">Связанный показатель <span class="muted">(если указан)</span></label><input class="q-input" id="recInd" value="${esc(values.indicator || "")}" placeholder="Например: число пробуждений"></div>
    <div class="flow__foot"><button class="q-btn q-btn--quiet" type="button" data-act="close-dlg">Отмена</button><button class="q-btn q-btn--primary" type="submit">Внести в план</button></div></form>`, "#recText");
  $("#recForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { text: $("#recText").value, source: $("#recSource").value, date: $("#recDate").value, indicator: $("#recInd").value };
    try { await act(() => api(`${P()}/recommendations`, { method: "POST", body }), "Рекомендация внесена"); recErrors = {}; closeDialog(); render(); }
    catch (err) { recErrors = err.errors || {}; openRecForm(body); }
  });
};

/* ================= H History and consultations ================= */
const recordCard = (r, selectable) => {
  const sym = r.items.filter((i) => i.kind === "symptom"), other = r.items.filter((i) => i.kind !== "symptom");
  return `<article class="q-entry ${selectable && S.sumSel.has(r.id) ? "is-selected" : ""}" id="rec-${r.id}">
    <div class="q-entry__top">${selectable ? `<label class="check" for="sel-${r.id}"><input type="checkbox" id="sel-${r.id}" data-act="sum-sel" data-id="${r.id}" ${S.sumSel.has(r.id) ? "checked" : ""}><span><b>${human(r.date)}</b></span></label>` : `<span><b>${human(r.date)}</b>${r.time ? `, ${r.time}` : ""}</span>`}
      <span class="q-entry__meta">${r.source === "manual" ? "Ручная отметка" : "Разговор"}${r.feeling ? ` · ${FEELING[r.feeling]}` : ""}${r.supportFormat ? ` · «${MODES[r.supportFormat][0]}»` : ""}</span></div>
    ${r.context ? `<p class="q-entry__quote">${esc(r.context)}</p>` : ""}
    ${sym.length ? `<div class="q-chips">${sym.map((i) => `<span class="q-chip q-chip--confirmed">${esc(i.label)} · ${INTENSITY[i.intensity || ""].toLowerCase()}</span>`).join("")}</div>` : ""}
    ${other.length ? `<p class="q-entry__meta">${other.map((i) => `${KIND[i.kind]}: ${esc(i.label)}`).join("; ")}</p>` : ""}
    <p class="q-entry__meta">Влияние: ${IMPACT[r.impact]}${r.impactNote ? `; ${esc(r.impactNote)}` : ""}</p>
  </article>`;
};
const renderHistory = () => {
  const a = S.data.analytics[S.period], recs = [...S.data.records].reverse();
  const fbAll = S.data.supports.flatMap((s) => s.feedback);
  const sum = S.summary, staleSum = sum && (sum.recordIds.length !== S.sumSel.size || sum.recordIds.some((id) => !S.sumSel.has(id)));
  view.innerHTML = `
    <div class="page-head"><div><h1 class="page-title">История и консультации</h1></div>
      <button class="q-btn q-btn--secondary" type="button" data-act="open-mark">Отметить самочувствие</button></div>
    <section class="card stack" aria-labelledby="anTitle">
      <div class="row" style="justify-content:space-between"><h2 class="panel__title" id="anTitle">За ${a.days} дней · ${dmy(a.from)}–${dmy(a.to)}</h2>
        <div class="seg" role="radiogroup" aria-label="Период">${[7, 14, 30].map((d) => `<button type="button" role="radio" aria-checked="${S.period === d}" data-act="period" data-d="${d}">${d} дней</button>`).join("")}</div></div>
      <p><b>${a.daysWithRecords}</b> ${plural(a.daysWithRecords, "день", "дня", "дней")} с записями · <b>${a.daysWithout}</b> без данных</p>
      <div class="days" aria-label="Дни периода">${a.calendar.map((d) => `<span class="day ${d.records.length ? "day--has" : ""}" title="${dmy(d.date)}${d.records.length ? `: ${d.records.join(", ")}` : ": нет данных"}"><i>${parts(d.date)[2]}</i><small>${d.records.length ? "запись" : "нет данных"}</small></span>`).join("")}</div>
      <table class="an-table"><thead><tr><th scope="col">Симптом</th><th scope="col">Дней с отметкой</th><th scope="col">Интенсивность по записям</th></tr></thead><tbody>
        ${a.symptoms.map((s) => `<tr><th scope="row">${esc(s.label)}</th><td>${s.days ? `в ${s.days} из ${s.of} дней с записями` : `0 из ${s.of} отмечено`}</td><td>${s.series.map((p) => `${dmy(p.date).slice(0, 5)}: ${INTENSITY[p.intensity || ""].toLowerCase()}`).join(" → ") || "—"}</td></tr>`).join("")}
      </tbody></table>
      ${a.together.length ? `<p class="muted" style="margin:0">Отмечены вместе в одной записи: ${a.together.map((t) => `${esc(t.pair)} (${t.records.join(", ")})`).join("; ")}. Это совместная отметка, не причина.</p>` : ""}
      <p class="muted" style="margin:0">Полезность опор: ${fbAll.length ? `подошло ${fbAll.filter((f) => f.value === "fit").length}, не сейчас ${fbAll.filter((f) => f.value === "not_now").length}, не подошло ${fbAll.filter((f) => f.value === "not_fit").length}. Это субъективные отметки, не эффективность лечения.` : "Нет оценок."}</p>
    </section>
    ${monthCalendarHTML()}
    <section class="summary-grid" aria-labelledby="consTitle">
      <div class="stack"><h2 class="section-title" id="consTitle">К консультации</h2><p class="muted" style="margin:0">Выбери записи. Вопросы и сводку предложит AI только по выбранным, с указанием оснований.</p>
        ${recs.map((r) => recordCard(r, true)).join("") || `<p class="empty">Записей пока нет.</p>`}</div>
      <article class="card preview stack" aria-labelledby="sumTitle">
        <p class="q-label" id="sumTitle">Сводка и вопросы</p>
        <button class="q-btn q-btn--primary" type="button" data-act="sum-generate" ${S.sumSel.size ? "" : "disabled"}>${sum ? "Обновить по выбранным" : "Предложить вопросы и сводку"} (${S.sumSel.size})</button>
        ${S.sumBusy ? `<p class="muted" role="status">Готовим по выбранным записям…</p>` : ""}
        ${S.sumError ? `<p class="note note--warn" role="alert">${esc(S.sumError)} Записи доступны, можно повторить.</p>` : ""}
        ${sum ? `${staleSum ? `<p class="note note--warn" role="alert">Выбор записей изменился. Текст ниже основан на прежнем выборе, обнови его.</p>` : ""}
          <div class="stack">${sum.statements.map((s) => `<p style="margin:0">${esc(s.text)} <span class="basis">${basisDates(s.basis)}</span></p>`).join("") || `<p class="muted">Недостаточно данных для обобщений.</p>`}</div>
          <fieldset class="group"><legend>Вопросы</legend>${sum.questions.map((q, i) => `<div class="q-row ${q.off ? "is-off" : ""}">
            <label class="check" for="q-on-${i}"><input type="checkbox" id="q-on-${i}" data-act="q-toggle" data-i="${i}" ${q.off ? "" : "checked"}><span class="sr-only">Включить вопрос</span></label>
            <div class="stack" style="flex:1"><label class="sr-only" for="q-text-${i}">Вопрос ${i + 1}</label><textarea class="q-input" id="q-text-${i}" rows="2" data-q="${i}">${esc(q.text)}</textarea><span class="basis">по записям ${basisDates(q.basis)}</span></div></div>`).join("")}</fieldset>
          <p class="q-label">Предпросмотр</p><p class="preview__text" id="sumPreview">${esc(summaryText())}</p>
          <button class="q-btn q-btn--primary" type="button" data-act="sum-copy" ${staleSum ? "disabled" : ""}>Копировать сводку</button>
          <p class="muted" style="margin:0;font-size:13px">Копирование в буфер обмена. Никуда не отправляется.</p>` : ""}
        ${S.data.summaries.length ? `<details><summary>Скопированные сводки (${S.data.summaries.length})</summary>${S.data.summaries.map((s) => `<div class="saved-summary"><p class="q-label">${new Date(s.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} · по записям ${basisDates(s.recordIds)}</p><p class="preview__text">${esc(s.text)}</p></div>`).join("")}</details>` : ""}
      </article>
    </section>`;
  view.querySelectorAll("[data-q]").forEach((t) => t.addEventListener("input", () => { S.summary.questions[t.dataset.q].text = t.value; $("#sumPreview").textContent = summaryText(); }));
  fillMonth();
};
const summaryText = () => {
  const s = S.summary; if (!s) return "";
  const qs = s.questions.filter((q) => !q.off && q.text.trim());
  return [...s.statements.map((x) => x.text), qs.length ? `Вопросы к консультации: ${qs.map((q) => `«${q.text.trim()}»`).join(" ")}` : ""].filter(Boolean).join(" ");
};
const monthCalendarHTML = () => `<section class="stack" aria-labelledby="calTitle"><h2 class="section-title" id="calTitle">Календарь</h2><div class="cal-grid">
  <section class="q-cal" aria-label="Календарь записей"><div class="q-cal__head"><h3 class="q-cal__month" id="monthTitle"></h3>
    <div class="q-cal__nav"><button class="q-iconbtn" type="button" data-act="cal-prev" aria-label="Предыдущий месяц">‹</button><button class="q-iconbtn" type="button" data-act="cal-next" id="calNext" aria-label="Следующий месяц">›</button></div></div>
    <div class="q-cal__grid" id="calGrid"></div><p class="muted" style="margin:12px 0 0;font-size:13px">Пустой день просто пустой: пропуски не считаются.</p></section>
  <aside class="panel" id="dayPanel" aria-live="polite"></aside></div></section>`;
const fillMonth = () => {
  if (!S.cal) { const [y, m] = parts(today()); S.cal = { y, m: m - 1 }; }
  if (!S.calSel || S.calSel > today()) S.calSel = today();
  const { y, m } = S.cal, grid = $("#calGrid"); if (!grid) return;
  $("#monthTitle").textContent = `${MONTHS[m]} ${y}`;
  const offset = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate();
  let html = DOW.map((d) => `<div class="q-cal__dow">${d}</div>`).join("");
  for (let i = 0; i < Math.ceil((offset + dim) / 7) * 7; i++) {
    const n = i - offset + 1;
    if (n < 1 || n > dim) { html += `<span class="q-day q-day--out" aria-hidden="true"></span>`; continue; }
    const date = iso(y, m, n), list = S.data.records.filter((r) => r.date === date), rec = S.data.plan.recommendations.some((r) => r.date === date);
    html += `<button type="button" class="q-day ${date > today() ? "q-day--future" : ""} ${date === today() ? "q-day--today" : ""} ${rec ? "q-day--rec" : ""}" id="day-${date}" data-act="day" data-date="${date}"
      aria-label="${n} ${MONTHS_GEN[m]}${date === today() ? ", сегодня" : ""}, ${list.length ? `${list.length} ${plural(list.length, "запись", "записи", "записей")}` : "нет данных"}${rec ? ", рекомендация специалиста" : ""}" ${date === S.calSel ? 'aria-selected="true"' : ""} ${date > today() ? 'aria-disabled="true"' : ""}>
      <span>${n}</span><span class="q-day__marks">${list.slice(0, 3).map(() => `<i class="q-mark q-mark--happy"></i>`).join("")}</span></button>`;
  }
  grid.innerHTML = html;
  const [ty, tm] = parts(today()); $("#calNext").disabled = y > ty || (y === ty && m >= tm - 1);
  const d = S.calSel, list = S.data.records.filter((r) => r.date === d);
  $("#dayPanel").innerHTML = `<h3 class="panel__title">${d === today() ? `Сегодня, ${human(d)}` : `${human(d)}, ${weekday(d).toLowerCase()}`}</h3>
    <div class="stack">${list.map((r) => recordCard(r, false) + `<div class="actions">${S.confirm === `recd-${r.id}` ? `<span class="confirm">Удалить запись ${r.id}?<button class="q-btn q-btn--secondary q-btn--sm" type="button" data-act="record-delete-yes" data-id="${r.id}">Удалить</button><button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="confirm-no">Оставить</button></span>` : `<button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="confirm" data-key="recd-${r.id}">Удалить</button>`}</div>`).join("") || `<p class="muted" style="margin:0">Нет данных за этот день. Если вспомнится, можно дополнить.</p>`}</div>
    <button class="q-btn q-btn--primary" type="button" data-act="mark-for-day" data-date="${d}">Дополнить день</button>`;
};

/* ================= U Profile, D My data, X Urgent ================= */
const renderProfile = () => {
  const p = prof();
  view.innerHTML = `<div class="flow">
    <h1 class="page-title">${esc(p.name)}</h1>
    <section class="card stack"><h2 class="panel__title">Персонаж</h2><div class="row"><div class="mini-mascot" id="profMascot"></div><div class="stack"><b>${mascotName()}</b>
      <button class="q-btn q-btn--secondary" type="button" data-act="open-picker">Сменить</button></div></div></section>
    <section class="card stack"><h2 class="panel__title">Поддержка</h2>
      <fieldset class="group"><legend>Режим по умолчанию</legend>${Object.entries(MODES).map(([k, [n]]) => `<label class="radio" for="set-pref-${k}"><input type="radio" name="setPref" id="set-pref-${k}" value="${k}" data-act-change="set" data-f="supportPref" ${p.supportPref === k ? "checked" : ""}>${n}</label>`).join("")}</fieldset>
      <fieldset class="group"><legend>Разговор</legend>${[["voice", "Голос и текст"], ["text", "Только текст"]].map(([k, l]) => `<label class="radio" for="set-vm-${k}"><input type="radio" name="setVm" id="set-vm-${k}" value="${k}" data-act-change="set" data-f="voiceMode" ${p.voiceMode === k ? "checked" : ""}>${l}</label>`).join("")}
        <label class="check" for="set-auto"><input type="checkbox" id="set-auto" data-act-change="set" data-f="autospeak" ${p.autospeak ? "checked" : ""}><span>Озвучивать ответы сразу</span></label></fieldset>
      <fieldset class="group"><legend>Специалист</legend>${[["yes", "Наблюдаюсь"], ["no", "Пока нет"], ["unknown", "Не указано"]].map(([k, l]) => `<label class="radio" for="set-sp-${k}"><input type="radio" name="setSp" id="set-sp-${k}" value="${k}" data-act-change="set" data-f="specialist" ${p.specialist === k ? "checked" : ""}>${l}</label>`).join("")}</fieldset>
    </section>
    <section class="card stack"><h2 class="panel__title">Согласия</h2>
      <label class="check" for="set-pers"><input type="checkbox" id="set-pers" data-act-change="set" data-f="personalization" ${p.personalization ? "checked" : ""}><span>Учитывать мои записи в ответах</span></label>
      <label class="check" for="set-keep"><input type="checkbox" id="set-keep" data-act-change="set" data-f="keepChatText" ${p.keepChatText ? "checked" : ""}><span>Сохранять текст разговора вместе с записью</span></label>
    </section>
    <div class="row"><button class="q-btn q-btn--quiet" type="button" data-act="replay-onboarding">Пройти знакомство заново</button><button class="q-btn q-btn--quiet" type="button" data-act="ask-reset">Вернуть исходные данные</button></div>
  </div>`;
  mountMascot($("#profMascot"), poseOf());
};

const captureData = () => {
  const p = prof().data; if (!$("#dAge")) return;
  p.basic = { age: $("#dAge").value, stage: $("#dStage").value, priorities: $("#dPrio").value };
  p.menstrual = { cycle: $("#dCycle").value, last: $("#dLast").value }; p.meds = $("#dMeds").value;
};
const COND_STATUS = { current: "Сейчас", past: "В прошлом", unknown: "Не указано" };
let condDraft = null;
const renderData = () => {
  const p = prof(), d = p.data, c = S.data.counts;
  if (!condDraft) condDraft = d.conditions.map((x) => ({ ...x }));
  const cats = [["records", "Записи", c.records], ["supports", "Опоры", c.supports], ["plan", "План", c.actions], ["recommendations", "Рекомендации", c.recommendations], ["summaries", "Сводки", c.summaries], ["personal", "Сведения о себе и история болезней", null]];
  view.innerHTML = `<div class="flow">
    <div class="page-head"><h1 class="page-title">Мои данные</h1><p class="muted">Всё по желанию.</p></div>
    <form class="stack" id="dataForm">
      <section class="card stack"><h2 class="panel__title">О себе</h2>
        <div class="two-col"><div class="q-field"><label for="dAge">Возраст</label><select class="q-input" id="dAge">${["", "до 40", "40–44", "45–49", "50–54", "55–59", "60 и старше"].map((v) => `<option ${d.basic.age === v ? "selected" : ""} value="${v}">${v || "Не указано"}</option>`).join("")}</select></div>
          <div class="q-field"><label for="dStage">Как понимаю свой этап</label><input class="q-input" id="dStage" value="${esc(d.basic.stage || "")}" placeholder="Не знаю"></div></div>
        <div class="q-field"><label for="dPrio">Что сейчас важнее всего</label><input class="q-input" id="dPrio" value="${esc(d.basic.priorities || "")}"></div></section>
      <section class="card stack"><h2 class="panel__title">Цикл</h2>
        <div class="two-col"><div class="q-field"><label for="dCycle">Своими словами</label><input class="q-input" id="dCycle" value="${esc(d.menstrual.cycle || "")}" placeholder="Например: нерегулярный"></div><div class="q-field"><label for="dLast">Последняя менструация</label><input class="q-input" id="dLast" type="date" max="${today()}" value="${esc(d.menstrual.last || "")}"></div></div></section>
      <section class="card stack" aria-labelledby="histTitle"><div class="row" style="justify-content:space-between"><h2 class="panel__title" id="histTitle">История болезней</h2><span class="muted">со слов пользовательницы</span></div>
        ${condDraft.length ? `<ul class="cond-list">${condDraft.map((x, i) => `<li class="cond">
          <div class="cond__grid">
            <div class="q-field"><label for="c-title-${i}">Заболевание</label><input class="q-input" id="c-title-${i}" data-c="${i}" data-k="title" value="${esc(x.title)}"></div>
            <div class="q-field"><label for="c-since-${i}">С какого времени</label><input class="q-input" id="c-since-${i}" data-c="${i}" data-k="since" value="${esc(x.since)}" placeholder="2019"></div>
            <div class="q-field"><label for="c-status-${i}">Сейчас</label><select class="q-input" id="c-status-${i}" data-c="${i}" data-k="status">${Object.entries(COND_STATUS).map(([k, l]) => `<option value="${k}" ${x.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          </div>
          <div class="cond__row"><label class="sr-only" for="c-note-${i}">Комментарий</label><input class="q-input" id="c-note-${i}" data-c="${i}" data-k="note" value="${esc(x.note)}" placeholder="Комментарий">
            <button class="q-btn q-btn--quiet q-btn--sm" type="button" data-act="cond-remove" data-i="${i}" aria-label="Убрать ${esc(x.title || "запись")}">Убрать</button></div></li>`).join("")}</ul>` : `<p class="muted" style="margin:0">Пока пусто.</p>`}
        <div class="row"><button class="q-btn q-btn--secondary q-btn--sm" type="button" data-act="cond-add">+ Добавить</button></div></section>
      <section class="card stack"><h2 class="panel__title">Лекарства и терапия</h2>
        <div class="q-field"><label for="dMeds">Что назначил специалист, с датой</label><textarea class="q-input" id="dMeds" rows="2">${esc(d.meds)}</textarea></div></section>
      <div class="row"><button class="q-btn q-btn--primary" type="submit">Сохранить</button></div>
    </form>
    <section class="card stack"><h2 class="panel__title">Удалить</h2>
      ${cats.map(([k, l, n]) => `<label class="check" for="del-${k}"><input type="checkbox" id="del-${k}" value="${k}" name="delCat"><span>${l}${n !== null ? ` · ${n}` : ""}</span></label>`).join("")}
      <div class="row"><button class="q-btn q-btn--secondary" type="button" data-act="del-selected">Удалить выбранное</button><button class="q-btn q-btn--quiet" type="button" data-act="del-all">Удалить всё</button></div>
    </section></div>`;
  view.querySelectorAll("[data-c]").forEach((el) => el.addEventListener("input", () => { condDraft[el.dataset.c][el.dataset.k] = el.value; }));
  view.querySelectorAll("select[data-c]").forEach((el) => el.addEventListener("change", () => { condDraft[el.dataset.c][el.dataset.k] = el.value; }));
  $("#dataForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const conditions = condDraft.filter((x) => x.title.trim());
    try {
      await act(() => api(`${P()}/data`, { method: "PUT", body: { basic: { age: $("#dAge").value, stage: $("#dStage").value, priorities: $("#dPrio").value }, menstrual: { cycle: $("#dCycle").value, last: $("#dLast").value }, conditions, meds: $("#dMeds").value } }), "Сохранено");
      condDraft = null; renderData();
    } catch { /* toast shown, draft kept */ }
  });
};
const confirmDelete = (cats, all) => {
  const names = { records: "записи и наблюдения", supports: "опоры", plan: "шаги и привычки", recommendations: "рекомендации", summaries: "сводки", personal: "сведения о себе" };
  openDialog(`<div class="sheet__inner">${dialogHead("Удалить данные?", "Действие нельзя отменить.")}
    <p>${all ? "Будет удалено всё содержимое профиля" : `Будут удалены: ${cats.map((c) => names[c]).join(", ")}`}. Связанные сводки и подбор опор пересчитаются.</p>
    <div class="flow__foot"><button class="q-btn q-btn--quiet" type="button" data-act="close-dlg">Отмена</button><button class="q-btn q-btn--primary" type="button" data-act="del-yes" data-cats="${cats.join(",")}" data-all="${all ? 1 : ""}">Удалить</button></div></div>`, "[data-act=close-dlg]");
};
const renderUrgent = () => {
  stopSpeaking(); mic.stop(true);
  S.chat = null; S.verify = null;
  view.innerHTML = `<section class="urgent" role="alert" aria-labelledby="urgTitle">
    <h1 class="page-title" id="urgTitle">Сейчас важнее получить помощь человека</h1>
    <p class="urgent__text">Обратись в местную экстренную службу или к человеку рядом, который может помочь тебе связаться с ней.</p>
    <p class="muted">Қолдау не может наблюдать за тобой, позвонить или уведомить близких. Опоры и план не заменяют помощь человека.</p>
    <div class="row"><a class="q-btn q-btn--secondary" href="#/today">На главный экран</a></div></section>`;
};

/* ================= Events ================= */
document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.name === "onbMascot") { onbDraft().mascot = t.value; renderOnboarding(route()); return; }
  if (t.name === "homePose") { await act(() => api(`${P()}/settings`, { method: "PUT", body: { pose: t.value } }), `Поза: ${STATES[t.value].name}`); S.poseMenu = false; renderToday(); return; }
  if (t.name === "vPose") { S.verify.pose = t.value; return; }
  if (t.name === "picker") { closeDialog(); await act(() => api(`${P()}/settings`, { method: "PUT", body: { mascot: t.value } }), `Рядом ${SPECIES[t.value].name.toLowerCase()}. Позу и данные сохранили`); render(); return; }
  if (t.dataset.actChange === "v-int") { S.verify.items[t.dataset.i].intensity = t.value; return; }
  if (t.dataset.actChange === "set") {
    const v = t.type === "checkbox" ? t.checked : t.value;
    await act(() => api(`${P()}/settings`, { method: "PUT", body: { [t.dataset.f]: v } }), "Сохранено"); return;
  }
  if (t.dataset.act === "habit-today") { await act(() => api(`${P()}/habits/${t.dataset.id}/today`, { method: "PUT", body: { on: t.checked } }), t.checked ? "Привычка включена на сегодня" : "Убрана из сегодняшнего плана"); renderPlan(); return; }
  if (t.dataset.act === "toggle-done") { await act(() => api(`${P()}/actions/${t.dataset.id}`, { method: "PATCH", body: { status: t.checked ? "completed" : "pending" } })); render(); return; }
  if (t.dataset.act === "sum-sel") { t.checked ? S.sumSel.add(t.dataset.id) : S.sumSel.delete(t.dataset.id); renderHistory(); $(`#sel-${t.dataset.id}`)?.focus(); return; }
  if (t.dataset.act === "q-toggle") { S.summary.questions[t.dataset.i].off = !t.checked; renderHistory(); return; }
  if (dlg.contains(t) && t.classList.contains("sym__int")) mark.symptoms[t.dataset.l] = t.value;
});
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-act]"); if (!t || t.tagName === "INPUT") return;
  const a = t.dataset.act, id = t.dataset.id;
  try {
    switch (a) {
      case "close-dlg": closeDialog(); break;
      case "onb-next": { onbCapture(); const step = Number(route().rest[0]) || 1; go(`#/onboarding/${step + 1}`); break; }
      case "onb-skip": { const d = onbDraft(), step = Number(t.dataset.step); if (step === 3) { d.topics.clear(); d.topicsOther = ""; } if (step === 4) d.supportPref = null; if (step === 5) { d.specialist = "unknown"; return finishOnboarding(); } go(`#/onboarding/${step + 1}`); break; }
      case "onb-topic": { const d = onbDraft(); onbCapture(); d.topics.has(t.dataset.k) ? d.topics.delete(t.dataset.k) : d.topics.add(t.dataset.k); renderOnboarding(route()); break; }
      case "onb-finish": onbCapture(); await finishOnboarding(); break;
      case "replay-onboarding": S.onb = null; await act(() => api(`${P()}`)); prof().onboardingDone = false; go("#/onboarding/1"); break;
      case "toggle-pose": S.poseMenu = !S.poseMenu; renderToday(); break;
      case "open-mark": openMark(); break;
      case "mark-for-day": openMark(t.dataset.date); break;
      case "mark-sym": { markCapture(); const l = t.dataset.l; if (l in mark.symptoms) delete mark.symptoms[l]; else mark.symptoms[l] = ""; mark.error = ""; renderMark(); dlg.querySelector(`[data-l="${CSS.escape(l)}"]`)?.focus(); break; }
      case "mark-back": mark.pose = $('input[name="markPose"]:checked')?.value || mark.pose; mark.step = 1; renderMark(); break;
      case "mark-save": await markSave(); break;
      case "dismiss-suggestion": S.dismissed = true; renderToday(); break;
      case "new-support": newSupport(); break;
      case "sup-topic": { supCapture(); const k = t.dataset.k; supForm.topics.has(k) ? supForm.topics.delete(k) : supForm.topics.add(k); renderSupportForm(); break; }
      case "sup-rec-start": supCapture(); if (await recorder.start()) { supForm.recording = true; supForm.error = ""; } else supForm.error = "Микрофон недоступен. Можно сохранить опору текстом."; renderSupportForm(); break;
      case "sup-rec-stop": supCapture(); supForm.recording = false; recorder.stop(); break;
      case "open-support": S.openedSupport = id; render(); window.scrollTo({ top: 0, behavior: motionOff() ? "auto" : "smooth" }); break;
      case "close-support": S.openedSupport = null; render(); break;
      case "play-audio": { const el = $(`#audio-${id}`); if (!el.src) el.src = (await api(`${P()}/supports/${id}/audio`)).audio; el.hidden = false; el.play().catch(() => toast("Не удалось воспроизвести. Нажмите ▶ в плеере.")); break; }
      case "support-fb": await act(() => api(`${P()}/supports/${id}/feedback`, { method: "POST", body: { value: t.dataset.v } }), { fit: "Отмечено: подошло", not_now: "Отмечено: не сейчас", not_fit: "Отмечено: не подошло" }[t.dataset.v]); S.openedSupport = null; render(); break;
      case "support-to-plan": { const s = supportById(id); await act(() => api(`${P()}/actions`, { method: "POST", body: { title: s.title, source: "support", sourceRef: s.id } }), "Шаг добавлен в план"); render(); break; }
      case "support-delete-yes": S.confirm = null; await act(() => api(`${P()}/supports/${id}`, { method: "DELETE" }), "Опора удалена"); render(); break;
      case "confirm": S.confirm = t.dataset.key; render(); break;
      case "confirm-no": S.confirm = null; render(); break;
      case "chat-mode": S.chat.mode = t.dataset.mode; S.chat.draft = $("#chatInput").value; renderChat(); break;
      case "mic-start": mic.start(); break;
      case "mic-stop": mic.stop(); break;
      case "mic-cancel": mic.stop(true); break;
      case "chat-send": sendChat(); break;
      case "chat-retry": sendChat({ retry: true }); break;
      case "chat-speak": speak(Number(t.dataset.i)); break;
      case "chat-stop-speak": stopSpeaking(); renderChat(); break;
      case "chat-finish": finishChat(); break;
      case "chat-discard": closeDialog(); S.chat = null; go("#/today"); toast("Разговор закончен, ничего не сохранено"); break;
      case "chat-verify": await startVerify(); break;
      case "v-reanalyze": await analyzeVerify(); break;
      case "v-confirm": S.verify.items[t.dataset.i].status = "confirmed"; renderVerify(); break;
      case "v-exclude": S.verify.items[t.dataset.i].status = "excluded"; renderVerify(); break;
      case "v-restore": S.verify.items[t.dataset.i].status = "suggested"; renderVerify(); break;
      case "v-exclude-all": S.verify.items.forEach((i) => { i.status = "excluded"; }); renderVerify(); break;
      case "v-edit": S.editing = `v${t.dataset.i}`; renderVerify(); $(`#v-edit-${t.dataset.i}`)?.focus(); break;
      case "v-edit-save": { const it = S.verify.items[t.dataset.i], v = $(`#v-edit-${t.dataset.i}`).value.trim(); if (v) it.label = v; S.editing = null; renderVerify(); break; }
      case "v-save": {
        const v = S.verify, items = v.items.filter((i) => i.status === "confirmed").map((i) => ({ kind: i.kind, label: i.label, intensity: i.intensity || null, quote: i.quote }));
        try {
          const r = await act(() => api(`${P()}/records`, { method: "POST", body: { source: "conversation", supportFormat: v.mode, items, pose: v.pose, chatText: v.chat, requestKey: v.key } }), "Подтверждённое сохранено в историю");
          v.savedRecord = r.record.id;
        } catch (e) { v.error = `${e.message} Ничего не потеряно, можно повторить.`; }
        renderVerify(); break;
      }
      case "v-support": {
        const v = S.verify, text = $("#vSupport").value.trim(); if (!text) { toast("Впиши формулировку для опоры"); break; }
        const r = await act(() => api(`${P()}/supports`, { method: "POST", body: { type: "chat", title: text.slice(0, 60), text, authorship: "chat", recordId: v.savedRecord || undefined,
          topics: [...new Set(v.items.filter((i) => i.status === "confirmed").map((i) => ({ "Плохой сон": "sleep", "Усталость": "sleep", "Ночные пробуждения": "sleep", "Приливы": "heat", "Тревожность": "anxiety", "Раздражительность": "anxiety" }[i.label])).filter(Boolean))] } }), "Опора сохранена");
        v.savedSupport = r.support.id; renderVerify(); break;
      }
      case "v-step": {
        const v = S.verify, text = $("#vStep").value.trim(); if (!text) { toast("Впиши шаг или пропусти"); break; }
        const r = await act(() => api(`${P()}/actions`, { method: "POST", body: { title: text, source: "chat", sourceRef: v.savedRecord || undefined } }), "Шаг добавлен в план");
        v.savedAction = r.action.id; renderVerify(); break;
      }
      case "v-discard": S.verify = null; S.chat = null; go("#/today"); toast("Закончено без сохранения"); break;
      case "v-done": S.verify = null; S.chat = null; go("#/today"); break;
      case "action-status": await act(() => api(`${P()}/actions/${id}`, { method: "PATCH", body: { status: t.dataset.v } }), t.dataset.v === "skipped" ? "Пропущено. Это нормально" : "Вернули в план"); renderPlan(); break;
      case "action-defer": S.editing = `d-${id}`; renderPlan(); $(`#defer-${id}`)?.focus(); break;
      case "action-defer-yes": await act(() => api(`${P()}/actions/${id}`, { method: "PATCH", body: { status: "deferred", deferredTo: $(`#defer-${id}`).value } }), "Перенесено"); S.editing = null; renderPlan(); break;
      case "action-edit": S.editing = `a-${id}`; renderPlan(); $(`#edit-${id}`)?.focus(); break;
      case "action-save": await act(() => api(`${P()}/actions/${id}`, { method: "PATCH", body: { title: $(`#edit-${id}`).value } }), "Шаг изменён"); S.editing = null; renderPlan(); break;
      case "action-delete-yes": S.confirm = null; await act(() => api(`${P()}/actions/${id}`, { method: "DELETE" }), "Шаг удалён"); renderPlan(); break;
      case "habit-delete-yes": S.confirm = null; await act(() => api(`${P()}/habits/${id}`, { method: "DELETE" }), "Привычка удалена"); renderPlan(); break;
      case "edit-cancel": S.editing = null; render(); break;
      case "new-rec": recErrors = {}; openRecForm(); break;
      case "rec-edit": S.editing = `r-${id}`; renderPlan(); $("#rt")?.focus(); break;
      case "rec-save": await act(() => api(`${P()}/recommendations/${id}`, { method: "PATCH", body: { text: $("#rt").value, source: $("#rs").value, date: $("#rd").value, indicator: $("#ri").value } }), "Рекомендация обновлена, исходная формулировка сохранена"); S.editing = null; renderPlan(); break;
      case "rec-delete-yes": S.confirm = null; await act(() => api(`${P()}/recommendations/${id}`, { method: "DELETE" }), "Рекомендация удалена"); renderPlan(); break;
      case "period": S.period = Number(t.dataset.d); renderHistory(); break;
      case "cal-prev": S.cal.m--; if (S.cal.m < 0) { S.cal.m = 11; S.cal.y--; } fillMonth(); break;
      case "cal-next": S.cal.m++; if (S.cal.m > 11) { S.cal.m = 0; S.cal.y++; } fillMonth(); break;
      case "day": if (t.dataset.date <= today()) { S.calSel = t.dataset.date; S.confirm = null; fillMonth(); $(`#day-${S.calSel}`)?.focus(); } break;
      case "record-delete-yes": S.confirm = null; S.sumSel.delete(id); await act(() => api(`${P()}/records/${id}`, { method: "DELETE" }), `Запись ${id} удалена`); renderHistory(); break;
      case "sum-generate": {
        S.sumBusy = true; S.sumError = ""; renderHistory();
        try { const r = await api(`${P()}/summary/generate`, { method: "POST", body: { recordIds: [...S.sumSel] } }); S.summary = r; }
        catch (e) { S.sumError = e.message; }
        S.sumBusy = false; renderHistory(); break;
      }
      case "sum-copy": {
        const text = summaryText(); let copied = false;
        try { await navigator.clipboard.writeText(text); copied = true; } catch { /* fall back to selection */ }
        const s = S.summary;
        await act(() => api(`${P()}/summaries`, { method: "POST", body: { recordIds: s.recordIds, text, demo: s.demo, questions: s.questions.filter((q) => !q.off).map(({ id: qid, text: qt, basis }) => ({ id: qid, text: qt, basis })) } }));
        renderHistory();
        if (!copied) { const p = $("#sumPreview"), r = document.createRange(); r.selectNodeContents(p); getSelection().removeAllRanges(); getSelection().addRange(r); }
        toast(copied ? "Сводка скопирована. Никуда не отправлена" : "Текст выделен: нажмите Ctrl+C");
        break;
      }
      case "open-picker": openDialog(`<div class="sheet__inner">${dialogHead("Кто будет рядом?", "Данные, план и поза останутся.")}${mascotGrid(prof().mascot, "picker")}</div>`, `input[name=picker]:checked`); fillMascots(dlg); break;
      case "cond-add": captureData(); condDraft.push({ title: "", since: "", status: "current", note: "" }); renderData(); $(`#c-title-${condDraft.length - 1}`)?.focus(); break;
      case "cond-remove": captureData(); condDraft.splice(Number(t.dataset.i), 1); renderData(); break;
      case "del-selected": { const cats = [...document.querySelectorAll('input[name="delCat"]:checked')].map((x) => x.value); if (!cats.length) { toast("Отметьте, что удалить"); break; } confirmDelete(cats, false); break; }
      case "del-all": confirmDelete([], true); break;
      case "del-yes": { const all = Boolean(t.dataset.all), cats = t.dataset.cats ? t.dataset.cats.split(",") : []; closeDialog(); await act(() => api(`${P()}/delete-content`, { method: "POST", body: all ? { all: true } : { categories: cats } }), "Удалено"); S.summary = null; S.sumSel.clear(); condDraft = null; renderData(); break; }
      case "ask-reset": openDialog(`<div class="sheet__inner">${dialogHead("Вернуть исходные данные?", "Профили Алии и Миры вернутся к началу.")}<div class="flow__foot"><button class="q-btn q-btn--quiet" type="button" data-act="close-dlg">Отмена</button><button class="q-btn q-btn--primary" type="button" data-act="reset-yes">Сбросить</button></div></div>`); break;
      case "reset-yes": closeDialog(); await api("/api/demo/reset", { method: "POST" }); resetLocal(); await reload(); toast("Данные вернулись к началу"); go("#/today"); break;
    }
  } catch { /* the toast already explains the error; drafts stay on screen */ }
});
const finishOnboarding = async () => {
  const d = onbDraft();
  await act(() => api(`${P()}/onboarding`, { method: "PUT", body: { mascot: d.mascot, topics: [...d.topics], topicsOther: d.topicsOther, supportPref: d.supportPref, specialist: d.specialist } }), "Готово. Остальное можно рассказать постепенно");
  S.onb = null; go("#/today");
};
const resetLocal = () => (condDraft = null, Object.assign(S, { onb: null, chat: null, verify: null, summary: null, sumSel: new Set(), cal: null, calSel: null, poseMenu: false, openedSupport: null, editing: null, confirm: null, dismissed: false }));
view.addEventListener("keydown", (ev) => {
  const b = ev.target.closest("button.q-day"); if (!b) return;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key]; if (!step) return;
  ev.preventDefault();
  const next = addDays(b.dataset.date, step); if (next > today()) return;
  const [y, m] = parts(next); S.calSel = next; S.cal = { y, m: m - 1 }; fillMonth(); $(`#day-${next}`)?.focus();
});
$("#profileSelect").addEventListener("change", async (ev) => {
  S.pid = ev.target.value; store.set("qoldau-pid", S.pid); resetLocal();
  await reload(); toast(`Профиль: ${prof().name}`); go("#/today");
});
$("#dateSelect").addEventListener("change", async (ev) => {
  if (!ev.target.value) return;
  await act(() => api(`${P()}/demo-date`, { method: "PUT", body: { date: ev.target.value } }), `День: ${dmy(ev.target.value)}`);
  Object.assign(S, { cal: null, calSel: null, openedSupport: null, dismissed: false }); render();
});

/* ---------- Boot ---------- */
(async () => {
  try {
    [S.meta, S.profiles] = await Promise.all([api("/api/meta"), api("/api/profiles")]);
    const saved = store.get("qoldau-pid");
    S.pid = S.profiles.some((p) => p.id === saved) ? saved : S.profiles[0].id;
    $("#profileSelect").innerHTML = S.profiles.map((p) => `<option value="${p.id}" ${p.id === S.pid ? "selected" : ""}>${esc(p.name)}</option>`).join("");
    await reload();
    if (!location.hash) location.replace("#/today");
    render();
  } catch (e) {
    view.innerHTML = `<p class="empty">Не удалось связаться с сервером: ${esc(e.message)}. Запустите <code>npm start</code> в папке app.</p>`;
  }
})();
