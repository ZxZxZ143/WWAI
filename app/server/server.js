// Қолдау demo server: JSON API + static frontend (docs/05). Node 22.13+, one dependency: @anthropic-ai/sdk.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { open, resetDemo, nextId } = require("./db");
const ai = require("./ai");
const D = require("./domain");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const KIT = path.resolve(ROOT, "..", "design", "qoldau-kit", "project");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const ITEM_KINDS = ["symptom", "feeling", "context", "impact", "need", "thought"];
const SUPPORT_TYPES = ["letter", "voice", "thought", "action", "request", "chat"];

const almatyToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const now = () => new Date().toISOString();

class HttpError extends Error { constructor(status, message, errors) { super(message); this.status = status; this.errors = errors; } }
const fail = (status, message, errors) => { throw new HttpError(status, message, errors); };
const str = (v, field, { max = 2000, required = false } = {}) => {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") fail(400, `Поле «${field}» должно быть текстом`);
  const s = v.trim();
  if (required && !s) fail(400, `Заполните поле «${field}»`, { [field]: `Заполните поле «${field}»` });
  if (s.length > max) fail(400, `Поле «${field}» длиннее ${max} знаков`);
  return s;
};
const oneOf = (v, list, field, { optional = false } = {}) => {
  if ((v === undefined || v === null || v === "") && optional) return null;
  if (!list.includes(v)) fail(400, `Недопустимое значение поля «${field}»`);
  return v;
};
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

/* ---------- Tokens from the design kit ---------- */
const tokensCss = () => {
  const tokens = JSON.parse(fs.readFileSync(path.join(KIT, "tokens.json"), "utf8"));
  const first = tokens.color.themes[0].id;
  const val = (v, theme) => (typeof v === "string" ? v : (v[theme] ?? v[first])).replace(/^\{(.+)\}$/, "var(--$1)");
  const themed = (theme) => [...tokens.color.tokens, ...(tokens.shadow?.tokens || [])].map((t) => `--${t.name}: ${val(t.value, theme)};`).join(" ");
  const shared = [
    ...tokens.spacing.tokens.map((t) => `--${t.name}: ${t.value};`),
    ...tokens.radius.tokens.map((t) => `--${t.name}: ${t.value};`),
    ...Object.entries(tokens.type.families).map(([k, v]) => `--font-${k}: ${v};`),
  ].join(" ");
  return `/* Generated from design/qoldau-kit/project/tokens.json, light theme only */
:root { ${themed("light")} ${shared} --halo-o: 1; color-scheme: light; }
`;
};

/* ---------- Medical history (self-reported, docs/05 section D) ---------- */
const CONDITION_STATUS = ["current", "past", "unknown"];
const conditionsOf = (p) => {
  const v = json(p.data_conditions, null);
  if (Array.isArray(v)) return v;
  return p.data_conditions ? [{ title: p.data_conditions, since: "", status: "unknown", note: "" }] : [];
};
const cleanConditions = (list) => {
  if (list === undefined) return undefined;
  if (!Array.isArray(list) || list.length > 50) fail(400, "История болезней передаётся списком");
  return list.map((c) => ({
    title: str(c?.title, "заболевание", { max: 150, required: true }),
    since: str(c?.since, "с какого времени", { max: 40 }),
    status: CONDITION_STATUS.includes(c?.status) ? c.status : "unknown",
    note: str(c?.note, "комментарий", { max: 400 }),
  }));
};

/* ---------- API ---------- */
const createApi = (db) => {
  const recent = new Map(); // idempotency: requestKey -> record id, so a double click never duplicates
  const P = (pid) => db.prepare("SELECT * FROM profiles WHERE id = ?").get(pid) || fail(404, "Профиль не найден");
  const today = (p) => p.demo_date || almatyToday();
  const tx = (fn) => { db.exec("BEGIN"); try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } };

  const recordOut = (r) => ({
    id: r.id, date: r.date, time: r.time, source: r.source, feeling: r.feeling, impact: r.impact, impactNote: r.impact_note,
    context: r.context, supportFormat: r.support_format, chatText: r.chat_text, createdAt: r.created_at,
    items: db.prepare("SELECT kind, label, intensity, quote FROM record_items WHERE record_id = ? ORDER BY position").all(r.id),
  });
  const records = (pid) => db.prepare("SELECT * FROM records WHERE profile_id = ? ORDER BY date, time, created_at").all(pid).map(recordOut);
  const feedback = (pid) => db.prepare("SELECT * FROM support_feedback WHERE profile_id = ? ORDER BY created_at").all(pid)
    .map((f) => ({ id: f.id, supportId: f.support_id, date: f.date, value: f.value, createdAt: f.created_at }));
  const supports = (pid) => {
    const fb = feedback(pid);
    return db.prepare("SELECT * FROM supports WHERE profile_id = ? ORDER BY created_at").all(pid).map((s) => ({
      id: s.id, type: s.type, title: s.title, text: s.text, hasAudio: Boolean(s.audio), date: s.date, authorship: s.authorship,
      topics: json(s.topics, []), recordId: s.record_id, createdAt: s.created_at, feedback: fb.filter((f) => f.supportId === s.id),
    }));
  };
  const actionOut = (a) => ({ id: a.id, title: a.title, date: a.date, source: a.source, sourceRef: a.source_ref, habitId: a.habit_id, status: a.status, deferredTo: a.deferred_to, createdAt: a.created_at });

  const suggestion = (p, recs, sups, fb) => {
    const t = today(p);
    const todays = recs.filter((r) => r.date === t);
    if (!todays.length) return { kind: "none" };
    const last = todays[todays.length - 1];
    const hardSignals = last.feeling === "hard" || last.impact === "some" || last.impact === "strong" || last.items.some((i) => i.kind === "symptom");
    if (last.feeling === "good" && !last.items.some((i) => i.kind === "symptom")) {
      const madeToday = sups.some((s) => s.date === t && s.authorship === "self");
      return { kind: "offer-create", recordId: last.id, done: madeToday };
    }
    if (!hardSignals) return { kind: "none" };
    const topics = [...new Set(todays.flatMap((r) => r.items.filter((i) => i.kind !== "context").map((i) => D.topicOf(i.label))))];
    const best = p.personalization ? D.matchSupports({ supports: sups, feedback: fb, topics, preferVoice: p.voice_mode === "voice" }) : null;
    const answered = best ? fb.find((f) => f.supportId === best.id && f.date === t) : null;
    return { kind: best ? "offer-open" : "manual", recordId: last.id, topics, supportId: best?.id || null, feedback: answered?.value || null };
  };

  const snapshot = (pid) => {
    const p = P(pid), t = today(p);
    const recs = records(pid), sups = supports(pid), fb = feedback(pid);
    const allActions = db.prepare("SELECT * FROM actions WHERE profile_id = ? ORDER BY date, created_at").all(pid).map(actionOut);
    const todayActions = allActions.filter((a) => a.date === t);
    return {
      today: t, ai: ai.status(),
      profile: {
        id: p.id, name: p.name, onboardingDone: Boolean(p.onboarding_done), topics: json(p.topics, []), topicsOther: p.topics_other,
        supportPref: p.support_pref, specialist: p.specialist, mascot: p.mascot, pose: p.pose, voiceMode: p.voice_mode,
        autospeak: Boolean(p.autospeak), personalization: Boolean(p.personalization), keepChatText: Boolean(p.keep_chat_text),
        data: { basic: json(p.data_basic, {}), menstrual: json(p.data_menstrual, {}), conditions: conditionsOf(p), meds: p.data_meds },
      },
      records: recs, supports: sups,
      suggestion: suggestion(p, recs, sups, fb),
      plan: {
        today: todayActions, upcoming: allActions.filter((a) => a.date > t && a.status === "pending"),
        habits: db.prepare("SELECT * FROM habits WHERE profile_id = ? ORDER BY created_at").all(pid).map((h) => ({
          id: h.id, title: h.title, rhythm: h.rhythm, todayInstance: todayActions.find((a) => a.habitId === h.id)?.id || null })),
        recommendations: db.prepare("SELECT * FROM recommendations WHERE profile_id = ? ORDER BY date").all(pid).map((r) => ({
          id: r.id, originalText: r.original_text, text: r.text, date: r.date, source: r.source, indicator: r.indicator })),
        progress: D.progress(todayActions),
      },
      analytics: { 7: D.analytics(recs, t, 7), 14: D.analytics(recs, t, 14), 30: D.analytics(recs, t, 30) },
      summaries: db.prepare("SELECT * FROM summaries WHERE profile_id = ? ORDER BY created_at DESC").all(pid).map((s) => ({
        id: s.id, recordIds: json(s.record_ids, []), text: s.text, questions: json(s.questions, []), generatedBy: s.generated_by, createdAt: s.created_at })),
      counts: {
        records: recs.length, supports: sups.length, actions: allActions.length,
        recommendations: db.prepare("SELECT COUNT(*) n FROM recommendations WHERE profile_id = ?").get(pid).n, summaries: db.prepare("SELECT COUNT(*) n FROM summaries WHERE profile_id = ?").get(pid).n,
      },
    };
  };

  const chatContext = (p) => {
    const t = today(p);
    const recs = records(p.id).filter((r) => r.date >= D.addDays(t, -13) && r.date <= t);
    return {
      personalization: Boolean(p.personalization),
      recent: recs.slice(-6).map((r) => `${r.date}: ${r.items.map((i) => i.label).join(", ") || (r.feeling === "good" ? "хороший день" : "без симптомов")}`),
      supports: supports(p.id).slice(-5).map((s) => s.title),
    };
  };

  const cleanItems = (list) => {
    if (!Array.isArray(list)) fail(400, "Наблюдения передаются списком");
    if (list.length > 40) fail(400, "Слишком много наблюдений");
    return list.map((i) => ({
      kind: oneOf(i?.kind, ITEM_KINDS, "тип наблюдения"),
      label: str(i?.label, "наблюдение", { max: 120, required: true }),
      intensity: oneOf(i?.intensity, ["weak", "moderate", "strong"], "интенсивность", { optional: true }),
      quote: str(i?.quote, "цитата", { max: 500 }),
    }));
  };
  const checkDate = (p, d) => { if (!ISO.test(d || "")) fail(400, "Дата в формате ГГГГ-ММ-ДД"); if (d > today(p)) fail(400, "Дата не может быть в будущем"); return d; };
  const owned = (table, pid, id, what) => db.prepare(`SELECT * FROM ${table} WHERE id = ? AND profile_id = ?`).get(id, pid) || fail(404, `${what} не найден${what.endsWith("а") ? "" : ""}`);

  return {
    meta: () => ({ ai: ai.status(), topics: D.TOPICS, symptoms: D.SYMPTOMS, poses: D.POSES, mascots: D.MASCOTS }),
    profiles: () => db.prepare("SELECT id, name FROM profiles ORDER BY id").all(),
    snapshot,

    setDemoDate: (pid, b) => { P(pid); if (!ISO.test(b?.date || "")) fail(400, "Укажите дату"); db.prepare("UPDATE profiles SET demo_date = ? WHERE id = ?").run(b.date, pid); return snapshot(pid); },
    onboarding: (pid, b) => {
      P(pid);
      const topics = Array.isArray(b?.topics) ? b.topics.filter((t) => D.TOPICS[t]) : [];
      const mascot = oneOf(b?.mascot, D.MASCOTS, "маскот");
      db.prepare(`UPDATE profiles SET topics = ?, topics_other = ?, support_pref = ?, specialist = ?, mascot = ?, onboarding_done = 1 WHERE id = ?`)
        .run(JSON.stringify(topics), str(b?.topicsOther, "уточнение", { max: 200 }), oneOf(b?.supportPref, D.MODES, "поддержка", { optional: true }),
          oneOf(b?.specialist || "unknown", ["yes", "no", "unknown"], "специалист"), mascot, pid);
      return snapshot(pid);
    },
    settings: (pid, b) => {
      const p = P(pid);
      const v = {
        mascot: b?.mascot !== undefined ? oneOf(b.mascot, D.MASCOTS, "маскот") : p.mascot,
        pose: b?.pose !== undefined ? oneOf(b.pose, D.POSES, "поза") : p.pose,
        support_pref: b?.supportPref !== undefined ? oneOf(b.supportPref, D.MODES, "поддержка", { optional: true }) : p.support_pref,
        voice_mode: b?.voiceMode !== undefined ? oneOf(b.voiceMode, ["voice", "text"], "режим") : p.voice_mode,
        autospeak: b?.autospeak !== undefined ? Number(Boolean(b.autospeak)) : p.autospeak,
        specialist: b?.specialist !== undefined ? oneOf(b.specialist, ["yes", "no", "unknown"], "специалист") : p.specialist,
        personalization: b?.personalization !== undefined ? Number(Boolean(b.personalization)) : p.personalization,
        keep_chat_text: b?.keepChatText !== undefined ? Number(Boolean(b.keepChatText)) : p.keep_chat_text,
      };
      db.prepare(`UPDATE profiles SET mascot=?, pose=?, support_pref=?, voice_mode=?, autospeak=?, specialist=?, personalization=?, keep_chat_text=? WHERE id=?`)
        .run(v.mascot, v.pose, v.support_pref, v.voice_mode, v.autospeak, v.specialist, v.personalization, v.keep_chat_text, pid);
      return snapshot(pid);
    },
    personalData: (pid, b) => {
      P(pid);
      const basic = { age: str(b?.basic?.age, "возраст", { max: 40 }), stage: str(b?.basic?.stage, "понимание этапа", { max: 200 }), priorities: str(b?.basic?.priorities, "приоритеты", { max: 400 }) };
      const menstrual = { cycle: str(b?.menstrual?.cycle, "цикл", { max: 200 }), last: b?.menstrual?.last && ISO.test(b.menstrual.last) ? b.menstrual.last : "" };
      db.prepare("UPDATE profiles SET data_basic = ?, data_menstrual = ?, data_conditions = ?, data_meds = ? WHERE id = ?")
        .run(JSON.stringify(basic), JSON.stringify(menstrual), JSON.stringify(cleanConditions(b?.conditions) ?? conditionsOf(P(pid))), str(b?.meds, "терапия", { max: 1000 }), pid);
      return snapshot(pid);
    },

    createRecord: (pid, b) => {
      const p = P(pid);
      if (b?.requestKey && recent.has(b.requestKey)) return { record: recordOut(db.prepare("SELECT * FROM records WHERE id = ?").get(recent.get(b.requestKey))), snapshot: snapshot(pid), duplicate: true };
      const source = oneOf(b?.source, ["manual", "conversation"], "источник");
      const date = checkDate(p, b?.date || today(p));
      const time = TIME.test(b?.time || "") ? b.time : new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Almaty", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
      const feeling = oneOf(b?.feeling, ["good", "hard", "skip"], "самочувствие", { optional: true });
      const impact = oneOf(b?.impact || "unknown", ["none", "some", "strong", "unknown"], "влияние");
      const items = cleanItems(b?.items || []);
      const context = str(b?.context, "контекст", { max: 4000 });
      if (!items.length && !context && (!feeling || feeling === "skip")) fail(400, "Отметьте состояние, симптом или напишите пару слов");
      const pose = b?.pose ? oneOf(b.pose, D.POSES, "поза") : null;
      return tx(() => {
        const id = source === "manual" ? (p.letter === "B" ? nextId(db, "records", "B-", 2) : nextId(db, "records", `${p.letter}-M`)) : nextId(db, "records", `${p.letter}-C`);
        db.prepare(`INSERT INTO records (id, profile_id, date, time, source, feeling, impact, impact_note, context, support_format, chat_text, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, pid, date, time, source, feeling, impact, str(b?.impactNote, "влияние", { max: 300 }), context,
            oneOf(b?.supportFormat, D.MODES, "формат", { optional: true }), p.keep_chat_text && b?.chatText ? str(b.chatText, "разговор", { max: 20000 }) : null, now());
        const ins = db.prepare("INSERT INTO record_items (record_id, kind, label, intensity, quote, position) VALUES (?, ?, ?, ?, ?, ?)");
        items.forEach((i, n) => ins.run(id, i.kind, i.label, i.intensity, i.quote, n));
        if (pose) db.prepare("UPDATE profiles SET pose = ? WHERE id = ?").run(pose, pid);
        if (b?.requestKey) recent.set(b.requestKey, id);
        return { record: recordOut(db.prepare("SELECT * FROM records WHERE id = ?").get(id)), snapshot: snapshot(pid) };
      });
    },
    deleteRecord: (pid, id) => { owned("records", pid, id, "Запись"); db.prepare("DELETE FROM records WHERE id = ?").run(id); return snapshot(pid); },
    suggestPoses: (b) => ({ poses: D.suggestPoses({ feeling: b?.feeling, labels: Array.isArray(b?.labels) ? b.labels.map(String) : [] }) }),

    chat: async (pid, b) => {
      const p = P(pid);
      const mode = oneOf(b?.mode, D.MODES, "режим");
      if (!Array.isArray(b?.history) || !b.history.length || b.history.length > 40) fail(400, "Нужна история разговора");
      const history = b.history.map((m) => ({ role: oneOf(m?.role, ["user", "assistant"], "роль"), content: str(m?.content, "реплика", { max: 4000, required: true }) }));
      if (history[history.length - 1].role !== "user") fail(400, "Последняя реплика должна быть от пользовательницы");
      return ai.chat({ mode, history, ctx: chatContext(p) });
    },
    extract: async (pid, b) => { P(pid); return ai.extract({ text: str(b?.text, "текст", { max: 8000, required: true }) }); },

    createSupport: (pid, b) => {
      const p = P(pid);
      const type = oneOf(b?.type, SUPPORT_TYPES, "тип опоры");
      const text = str(b?.text, "текст", { max: 4000 });
      let audio = null;
      if (type === "voice") {
        if (typeof b?.audio !== "string" || !/^data:audio\/[\w.+-]+(;codecs=[\w.]+)?;base64,/.test(b.audio)) fail(400, "Запишите голосовое послание");
        if (b.audio.length > 4_000_000) fail(400, "Запись слишком длинная, попробуйте короче");
        audio = b.audio;
      } else if (!text) fail(400, "Напишите текст опоры", { text: "Напишите текст опоры" });
      const id = nextId(db, "supports", `${p.letter}-S`);
      const topics = Array.isArray(b?.topics) ? b.topics.filter((t) => D.TOPICS[t]) : [];
      db.prepare(`INSERT INTO supports (id, profile_id, type, title, text, audio, date, authorship, topics, record_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, pid, type, str(b?.title, "название", { max: 120 }) || (type === "voice" ? "Голосовое послание" : text.slice(0, 60)), text, audio, today(p),
          b?.authorship === "chat" ? "chat" : "self", JSON.stringify(topics), b?.recordId ? owned("records", pid, b.recordId, "Запись").id : null, now());
      return { support: supports(pid).find((s) => s.id === id), snapshot: snapshot(pid) };
    },
    supportAudio: (pid, id) => ({ audio: owned("supports", pid, id, "Опора").audio }),
    deleteSupport: (pid, id) => { owned("supports", pid, id, "Опора"); db.prepare("DELETE FROM supports WHERE id = ?").run(id); return snapshot(pid); },
    supportFeedback: (pid, id, b) => {
      const p = P(pid); owned("supports", pid, id, "Опора");
      const value = oneOf(b?.value, ["fit", "not_now", "not_fit"], "оценка");
      const fid = nextId(db, "support_feedback", `${p.letter}-F`);
      db.prepare("INSERT INTO support_feedback (id, support_id, profile_id, date, value, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(fid, id, pid, today(p), value, now());
      return { feedbackId: fid, snapshot: snapshot(pid) };
    },

    createAction: (pid, b) => {
      const p = P(pid);
      const date = b?.date ? (ISO.test(b.date) && b.date >= today(p) ? b.date : fail(400, "Дата шага: сегодня или позже")) : today(p);
      const id = nextId(db, "actions", `P-${p.letter}`);
      db.prepare("INSERT INTO actions (id, profile_id, title, date, source, source_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, pid, str(b?.title, "шаг", { max: 200, required: true }), date, oneOf(b?.source || "self", ["self", "support", "chat"], "источник"), str(b?.sourceRef, "основание", { max: 40 }) || null, now());
      return { action: actionOut(db.prepare("SELECT * FROM actions WHERE id = ?").get(id)), snapshot: snapshot(pid) };
    },
    updateAction: (pid, id, b) => {
      const p = P(pid), a = owned("actions", pid, id, "Шаг");
      return tx(() => {
        if (b?.title !== undefined) db.prepare("UPDATE actions SET title = ? WHERE id = ?").run(str(b.title, "шаг", { max: 200, required: true }), id);
        if (b?.status !== undefined) {
          const status = oneOf(b.status, ["pending", "completed", "skipped", "deferred"], "статус");
          if (status === "deferred") {
            if (!ISO.test(b?.deferredTo || "") || b.deferredTo <= a.date) fail(400, "Выберите другую, более позднюю дату");
            db.prepare("UPDATE actions SET status = 'deferred', deferred_to = ? WHERE id = ?").run(b.deferredTo, id);
            const prefix = a.habit_id ? `H-${p.letter}` : `P-${p.letter}`;
            db.prepare("INSERT INTO actions (id, profile_id, title, date, source, source_ref, habit_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
              .run(nextId(db, "actions", prefix), pid, a.title, b.deferredTo, a.source, id, a.habit_id, now());
          } else db.prepare("UPDATE actions SET status = ?, deferred_to = NULL WHERE id = ?").run(status, id);
        }
        return snapshot(pid);
      });
    },
    deleteAction: (pid, id) => { owned("actions", pid, id, "Шаг"); db.prepare("DELETE FROM actions WHERE id = ?").run(id); return snapshot(pid); },
    createHabit: (pid, b) => {
      const p = P(pid);
      const id = nextId(db, "habits", `H${p.letter}-`);
      db.prepare("INSERT INTO habits (id, profile_id, title, rhythm, created_at) VALUES (?, ?, ?, ?, ?)").run(id, pid, str(b?.title, "привычка", { max: 200, required: true }), str(b?.rhythm, "ритм", { max: 60 }) || "Каждый день", now());
      return snapshot(pid);
    },
    habitToday: (pid, id, b) => {
      const p = P(pid), h = owned("habits", pid, id, "Привычка"), t = today(p);
      const inst = db.prepare("SELECT id FROM actions WHERE habit_id = ? AND date = ?").get(id, t);
      if (b?.on && !inst) db.prepare("INSERT INTO actions (id, profile_id, title, date, source, habit_id, created_at) VALUES (?, ?, ?, ?, 'habit', ?, ?)").run(nextId(db, "actions", `H-${p.letter}`), pid, h.title, t, id, now());
      if (!b?.on && inst) db.prepare("DELETE FROM actions WHERE id = ?").run(inst.id);
      return snapshot(pid);
    },
    deleteHabit: (pid, id) => { owned("habits", pid, id, "Привычка"); db.prepare("DELETE FROM habits WHERE id = ?").run(id); return snapshot(pid); },

    createRecommendation: (pid, b) => {
      const p = P(pid);
      const errors = {};
      const text = (b?.text || "").trim(), source = (b?.source || "").trim(), date = (b?.date || "").trim();
      if (!text) errors.text = "Впишите рекомендацию так, как её сформулировал специалист";
      if (!source) errors.source = "Укажите источник";
      if (!ISO.test(date)) errors.date = "Укажите дату";
      else if (date > today(p)) errors.date = "Дата не может быть в будущем";
      if (Object.keys(errors).length) fail(400, "Заполните недостающие поля", errors);
      const id = nextId(db, "recommendations", "R-", 2);
      db.prepare("INSERT INTO recommendations (id, profile_id, original_text, text, date, source, indicator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, pid, str(text, "рекомендация", { max: 1000 }), text, date, str(source, "источник", { max: 200 }), str(b?.indicator, "показатель", { max: 200 }), now());
      return snapshot(pid);
    },
    updateRecommendation: (pid, id, b) => {
      const r = owned("recommendations", pid, id, "Рекомендация");
      db.prepare("UPDATE recommendations SET text = ?, source = ?, date = ?, indicator = ? WHERE id = ?").run(
        b?.text !== undefined ? str(b.text, "рекомендация", { max: 1000, required: true }) : r.text,
        b?.source !== undefined ? str(b.source, "источник", { max: 200, required: true }) : r.source,
        b?.date !== undefined ? (ISO.test(b.date) ? b.date : fail(400, "Укажите дату")) : r.date,
        b?.indicator !== undefined ? str(b.indicator, "показатель", { max: 200 }) : r.indicator, id);
      return snapshot(pid);
    },
    deleteRecommendation: (pid, id) => { owned("recommendations", pid, id, "Рекомендация"); db.prepare("DELETE FROM recommendations WHERE id = ?").run(id); return snapshot(pid); },

    generateSummary: async (pid, b) => {
      P(pid);
      const ids = Array.isArray(b?.recordIds) ? [...new Set(b.recordIds)] : [];
      if (!ids.length) fail(400, "Выберите хотя бы одну запись");
      const recs = ids.map((id) => recordOut(owned("records", pid, id, "Запись"))).sort((a, c) => a.date.localeCompare(c.date));
      const p = P(pid);
      const history = p.personalization ? conditionsOf(p).map((c) => `${c.title}${c.since ? `, с ${c.since}` : ""}${c.status === "past" ? ", в прошлом" : ""}`) : [];
      const out = await ai.summarize({ records: recs, history });
      const letter = pid.slice(-1);
      return { ...out, recordIds: recs.map((r) => r.id), questions: out.questions.map((q, i) => ({ id: `Q-${letter}${i + 1}`, ...q })) };
    },
    saveSummary: (pid, b) => {
      const p = P(pid);
      const ids = Array.isArray(b?.recordIds) ? b.recordIds : [];
      ids.forEach((id) => owned("records", pid, id, "Запись"));
      const text = str(b?.text, "сводка", { max: 8000, required: true });
      const questions = Array.isArray(b?.questions) ? b.questions.map((q) => ({ id: str(q?.id, "id", { max: 20 }), text: str(q?.text, "вопрос", { max: 500, required: true }), basis: Array.isArray(q?.basis) ? q.basis.filter((x) => ids.includes(x)) : [] })) : [];
      const id = nextId(db, "summaries", `S-${p.letter}`);
      db.prepare("INSERT INTO summaries (id, profile_id, record_ids, text, questions, generated_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, pid, JSON.stringify(ids), text, JSON.stringify(questions), b?.demo ? "demo" : "ai", now());
      return { summaryId: id, snapshot: snapshot(pid) };
    },

    deleteContent: (pid, b) => {
      P(pid);
      const all = ["records", "supports", "plan", "recommendations", "summaries", "personal"];
      const cats = b?.all ? all : (Array.isArray(b?.categories) ? b.categories.filter((c) => all.includes(c)) : []);
      if (!cats.length) fail(400, "Выберите, что удалить");
      return tx(() => {
        if (cats.includes("records")) { db.prepare("DELETE FROM records WHERE profile_id = ?").run(pid); db.prepare("DELETE FROM summaries WHERE profile_id = ?").run(pid); }
        if (cats.includes("supports")) db.prepare("DELETE FROM supports WHERE profile_id = ?").run(pid);
        if (cats.includes("plan")) { db.prepare("DELETE FROM actions WHERE profile_id = ?").run(pid); db.prepare("DELETE FROM habits WHERE profile_id = ?").run(pid); }
        if (cats.includes("recommendations")) db.prepare("DELETE FROM recommendations WHERE profile_id = ?").run(pid);
        if (cats.includes("summaries")) db.prepare("DELETE FROM summaries WHERE profile_id = ?").run(pid);
        if (cats.includes("personal")) db.prepare("UPDATE profiles SET data_basic='{}', data_menstrual='{}', data_conditions='[]', data_meds='' WHERE id = ?").run(pid);
        return snapshot(pid);
      });
    },
    reset: () => { resetDemo(db); recent.clear(); return { ok: true }; },
  };
};

/* ---------- HTTP ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };
const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > 6_000_000) { reject(new HttpError(413, "Слишком большой запрос")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new HttpError(400, "Некорректный JSON")); } });
  req.on("error", reject);
});
const R = (method, re, fn) => [method, new RegExp(`^/api${re}$`), fn];
const PID = "/profiles/(DEMO-[AB])";
const routes = (api) => [
  R("GET", "/meta", () => api.meta()),
  R("GET", "/profiles", () => api.profiles()),
  R("GET", PID, (m) => api.snapshot(m[1])),
  R("PUT", `${PID}/demo-date`, (m, b) => api.setDemoDate(m[1], b)),
  R("PUT", `${PID}/onboarding`, (m, b) => api.onboarding(m[1], b)),
  R("PUT", `${PID}/settings`, (m, b) => api.settings(m[1], b)),
  R("PUT", `${PID}/data`, (m, b) => api.personalData(m[1], b)),
  R("POST", `${PID}/records`, (m, b) => api.createRecord(m[1], b)),
  R("DELETE", `${PID}/records/([\\w-]+)`, (m) => api.deleteRecord(m[1], m[2])),
  R("POST", "/poses", (m, b) => api.suggestPoses(b)),
  R("POST", `${PID}/chat`, (m, b) => api.chat(m[1], b)),
  R("POST", `${PID}/extract`, (m, b) => api.extract(m[1], b)),
  R("POST", "/stt", (m, b) => ai.transcribe({ audio: b?.audio })),
  R("POST", "/tts", (m, b) => ai.speech({ text: str(b?.text, "текст", { max: 2000, required: true }) })),
  R("POST", `${PID}/supports`, (m, b) => api.createSupport(m[1], b)),
  R("GET", `${PID}/supports/([\\w-]+)/audio`, (m) => api.supportAudio(m[1], m[2])),
  R("DELETE", `${PID}/supports/([\\w-]+)`, (m) => api.deleteSupport(m[1], m[2])),
  R("POST", `${PID}/supports/([\\w-]+)/feedback`, (m, b) => api.supportFeedback(m[1], m[2], b)),
  R("POST", `${PID}/actions`, (m, b) => api.createAction(m[1], b)),
  R("PATCH", `${PID}/actions/([\\w-]+)`, (m, b) => api.updateAction(m[1], m[2], b)),
  R("DELETE", `${PID}/actions/([\\w-]+)`, (m) => api.deleteAction(m[1], m[2])),
  R("POST", `${PID}/habits`, (m, b) => api.createHabit(m[1], b)),
  R("PUT", `${PID}/habits/([\\w-]+)/today`, (m, b) => api.habitToday(m[1], m[2], b)),
  R("DELETE", `${PID}/habits/([\\w-]+)`, (m) => api.deleteHabit(m[1], m[2])),
  R("POST", `${PID}/recommendations`, (m, b) => api.createRecommendation(m[1], b)),
  R("PATCH", `${PID}/recommendations/([\\w-]+)`, (m, b) => api.updateRecommendation(m[1], m[2], b)),
  R("DELETE", `${PID}/recommendations/([\\w-]+)`, (m) => api.deleteRecommendation(m[1], m[2])),
  R("POST", `${PID}/summary/generate`, (m, b) => api.generateSummary(m[1], b)),
  R("POST", `${PID}/summaries`, (m, b) => api.saveSummary(m[1], b)),
  R("POST", `${PID}/delete-content`, (m, b) => api.deleteContent(m[1], b)),
  R("POST", "/demo/reset", () => api.reset()),
];
const send = (res, status, body, type = "application/json; charset=utf-8") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const createServer = ({ dbFile = process.env.QOLDAU_DB || path.join(ROOT, "data", "qoldau.db") } = {}) => {
  const db = open(dbFile);
  const table = routes(createApi(db));
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) {
        const route = table.find(([m, re]) => m === req.method && re.test(url.pathname));
        if (!route) return send(res, 404, { error: "Нет такого адреса API" });
        const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : {};
        return send(res, 200, await route[2](url.pathname.match(route[1]), body));
      }
      if (url.pathname === "/tokens.css") return send(res, 200, tokensCss(), MIME[".css"]);
      if (url.pathname === "/kit.css") return send(res, 200, fs.readFileSync(path.join(KIT, "components", "bundle.css")), MIME[".css"]);
      const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const file = path.resolve(PUBLIC, rel);
      if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, "Не найдено", "text/plain; charset=utf-8");
      return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || "application/octet-stream");
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, errors: e.errors });
      if (e?.aiError) { console.error("AI:", e.message); return send(res, e.status, { error: e.message }); }
      console.error(e);
      return send(res, 500, { error: "Что-то пошло не так на сервере. Черновик остался на экране, можно повторить." });
    }
  });
  server.on("close", () => db.close());
  return server;
};

if (require.main === module) {
  const port = Number(process.env.PORT) || 8787;
  createServer().listen(port, () => {
    const s = ai.status();
    console.log(`Қолдау: http://localhost:${port}`);
    console.log(s.live ? `AI: ${s.provider === "openai" ? "OpenAI" : "Claude"}${s.speech ? ", голос через OpenAI" : ""}` : "AI не подключён: задайте OPENAI_API_KEY в app/.env");
  });
}

module.exports = { createServer };
