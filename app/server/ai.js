// AI for Қолдау: conversation, observation suggestions, consultation summary, speech-to-text and text-to-speech.
// Provider is picked from server-side env (never sent to the browser):
//   OPENAI_API_KEY    -> OpenAI (chat, transcription, speech)
//   ANTHROPIC_API_KEY -> Claude (chat and structured output; speech falls back to the browser)
//   none              -> prepared examples, so the demo still runs
const OPENAI_CHAT = process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini";
const OPENAI_STT = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";
const OPENAI_TTS = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_VOICE = process.env.OPENAI_TTS_VOICE || "shimmer";
const CLAUDE_MODEL = process.env.QOLDAU_MODEL || "claude-opus-5-5";

const provider = () => (process.env.OPENAI_API_KEY ? "openai" : process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "anthropic" : "demo");
const status = () => ({ live: provider() !== "demo", provider: provider(), speech: provider() === "openai" });
const aiError = (status, message) => Object.assign(new Error(message), { status, aiError: true });

/* ---------- OpenAI over HTTPS (no SDK needed) ---------- */
const openai = async (path, body, { json = true } = {}) => {
  let res;
  try {
    res = await fetch(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...(json ? { "Content-Type": "application/json" } : {}) },
      body: json ? JSON.stringify(body) : body,
      signal: AbortSignal.timeout(60_000),
    });
  } catch { throw aiError(502, "Нет связи с сервисом ответа. Реплика осталась на экране, можно повторить."); }
  if (res.status === 401) throw aiError(502, "Ключ AI не принят. Проверьте OPENAI_API_KEY.");
  if (res.status === 429) throw aiError(503, "Сервис ответа перегружен. Можно повторить через минуту.");
  if (!res.ok) { console.error("OpenAI", res.status, (await res.text()).slice(0, 300)); throw aiError(502, "Сервис ответа сейчас недоступен. Можно повторить."); }
  return res;
};
const openaiComplete = async ({ system, messages, schema, effort = "low", maxTokens = 2000 }) => {
  const body = {
    model: OPENAI_CHAT,
    messages: [{ role: "system", content: system }, ...messages],
    max_completion_tokens: maxTokens,
    reasoning_effort: effort,
  };
  if (schema) body.response_format = { type: "json_schema", json_schema: { name: "result", strict: true, schema } };
  const data = await (await openai("chat/completions", body)).json();
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw aiError(422, "Модель отказалась отвечать на этот запрос. Можно переформулировать.");
  if (choice?.finish_reason === "length" && !choice.message?.content) throw aiError(502, "Ответ оборвался. Можно повторить.");
  return (choice?.message?.content || "").trim();
};

/* ---------- Claude through the official SDK ---------- */
let claude = null;
const claudeComplete = async ({ system, messages, schema, effort = "low", maxTokens = 2000 }) => {
  const Anthropic = require("@anthropic-ai/sdk");
  claude ||= new Anthropic();
  let resp;
  try {
    resp = await claude.beta.messages.create({
      model: CLAUDE_MODEL, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", max_tokens: maxTokens,
      output_config: schema ? { effort, format: { type: "json_schema", schema } } : { effort },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw aiError(502, "Ключ AI не принят. Проверьте ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw aiError(503, "Сервис ответа перегружен. Можно повторить через минуту.");
    throw aiError(502, "Сервис ответа сейчас недоступен. Можно повторить.");
  }
  if (resp.stop_reason === "refusal") throw aiError(422, "Модель отказалась отвечать на этот запрос. Можно переформулировать.");
  return resp.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
};

const complete = (args) => (provider() === "openai" ? openaiComplete(args) : claudeComplete(args));

/* ---------- Conversation ---------- */
const MODES = {
  vent: "Режим «Выговориться»: внимательно выслушай и отрази чувства. Никаких заданий, советов и списков.",
  understand: "Режим «Разобраться»: помоги сформулировать переживание, потребность или вопрос. Можно один необязательный уточняющий вопрос.",
  step: "Режим «Выбрать небольшой шаг»: предложи два-три посильных варианта на выбор, ни один не выбран заранее, и скажи, что можно не выбирать ничего.",
};
const DANGER = /(покончить с собой|покончу с собой|убить себя|убью себя|не хочу жить|не хочется жить|хочу умереть|суицид|причинить себе вред|навредить себе|порезать себя|наглотаться таблеток|выпрыгнуть из окна|прыгнуть с крыши)/i;
const URGENT_TEXT = "Сейчас важнее получить помощь человека. Обратись в местную экстренную службу или к человеку рядом, который может помочь тебе связаться с ней.";
const isDanger = (text) => DANGER.test(String(text || ""));

const SYSTEM = `Ты голос приложения «Қолдау» («Поддержка») для женщин в перименопаузе и менопаузе. Пиши по-русски, на «ты», тепло и по-взрослому, коротко: 2–4 предложения, без списков и разметки, ответ озвучивается.
Правила:
- Не ставь диагнозов, не называй стадию менопаузы и гормоны, не объясняй каждое переживание менопаузой, не назначай и не меняй лечение.
- Без сюсюканья, обесценивания, навязанного оптимизма, фраз «это просто гормоны» и обещаний улучшения.
- Ты не заменяешь специалиста по психическому здоровью.
- Учитывай предыдущие реплики этого разговора.
- Если в реплике явная непосредственная угроза жизни или самоповреждение, начни ответ с [[X]].`;

const contextBlock = (ctx) => {
  if (!ctx?.personalization) return "Персонализация выключена: не опирайся на прошлые записи.";
  const lines = [];
  if (ctx.recent?.length) lines.push(`Подтверждённые записи последних дней: ${ctx.recent.join("; ")}.`);
  if (ctx.supports?.length) lines.push(`Собственные опоры пользовательницы: ${ctx.supports.join("; ")}.`);
  return lines.join("\n") || "Подтверждённых записей пока нет.";
};

const demoReply = (mode, history) => {
  const last = history[history.length - 1]?.content || "";
  if (/тишин|неудобно просить/i.test(last)) return "Хотеть тишины нормально, особенно после такой ночи. Можно попросить немного пространства. Если хочешь, вместе подберём слова для близких.";
  if (/плохо спала|не выспал/i.test(last)) return "После плохой ночи раздражение даётся тяжелее, и вина за него тоже. Расскажи, что сейчас труднее всего?";
  if (mode === "step") return "Можно выбрать что-то небольшое: попросить близких о десяти минутах тишины или сделать короткую паузу у окна. Можно и ничего не выбирать.";
  return history.filter((m) => m.role === "user").length > 1 ? "Слышу тебя. С этим можно побыть, никуда не торопясь." : "Я рядом и слушаю. Расскажи, как прошёл день.";
};

const chat = async ({ mode, history, ctx }) => {
  if (isDanger(history[history.length - 1]?.content)) return { danger: true, text: URGENT_TEXT };
  if (provider() === "demo") return { text: demoReply(mode, history), demo: true };
  let text = await complete({ system: `${SYSTEM}\n\n${MODES[mode] || MODES.vent}\n${contextBlock(ctx)}`, messages: history, effort: "low", maxTokens: 1500 });
  const danger = text.startsWith("[[X]]");
  if (danger) text = URGENT_TEXT;
  return { text, danger };
};

/* ---------- Observation suggestions ---------- */
const ITEM_KINDS = ["symptom", "feeling", "context", "impact", "need", "thought"];
const EXTRACT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["kind", "label", "intensity", "quote"],
    properties: { kind: { type: "string", enum: ITEM_KINDS }, label: { type: "string" }, intensity: { type: "string", enum: ["weak", "moderate", "strong", "unknown"] }, quote: { type: "string" } } } } },
};
const EXTRACT_PROMPT = `Выдели из реплик пользовательницы наблюдения для проверки. Это только предложения, она сама подтвердит или исключит каждое.
kind: symptom — симптом («Плохой сон», «Ночные пробуждения», «Усталость», «Приливы», «Раздражительность», «Тревожность»); feeling — переживание («Вина»); context — обстоятельство; impact — влияние на дела; need — потребность («Потребность в паузе»); thought — полезная мысль или действие, которое она назвала.
intensity: только если выраженность прямо названа словами («сильно», «немного»), иначе unknown. Ничего не угадывай.
quote: дословный фрагмент её реплики. label: коротко, с заглавной буквы, без диагнозов и причин.`;

const demoExtract = (text) => {
  const out = [];
  const add = (kind, label, re) => { const m = text.match(re); if (m && !out.some((o) => o.label === label)) out.push({ kind, label, intensity: "unknown", quote: m[0].trim() }); };
  add("symptom", "Плохой сон", /плохо спала|не выспалась|бессонн\S*/i);
  add("symptom", "Ночные пробуждения", /просыпа\S*[^.,\n]*|проснулась[^.,\n]*/i);
  add("symptom", "Раздражительность", /раздража\S*/i);
  add("feeling", "Вина", /виню себя[^.,\n]*|чувство вины/i);
  add("symptom", "Усталость", /устала|усталость/i);
  add("symptom", "Приливы", /прилив\S*|бросает в жар|ощущение жара/i);
  add("symptom", "Тревожность", /тревож\S*|тревога/i);
  add("need", "Потребность в паузе", /[^.,\n]*тишин\S*[^.,\n]*/i);
  return out;
};

const extract = async ({ text }) => {
  if (provider() === "demo") return { items: demoExtract(text), demo: true };
  const parsed = JSON.parse(await complete({ system: EXTRACT_PROMPT, messages: [{ role: "user", content: text }], schema: EXTRACT_SCHEMA, effort: "low", maxTokens: 3000 }));
  return { items: parsed.items.filter((i) => ITEM_KINDS.includes(i.kind) && i.label.trim()) };
};

/* ---------- Consultation summary ---------- */
const BASIS_LIST = { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "basis"], properties: { text: { type: "string" }, basis: { type: "array", items: { type: "string" } } } } };
const SUMMARY_SCHEMA = { type: "object", additionalProperties: false, required: ["statements", "questions"], properties: { statements: BASIS_LIST, questions: BASIS_LIST } };
const SUMMARY_PROMPT = `Подготовь сводку к консультации только по переданным подтверждённым записям пользовательницы.
- statements: короткие фактические утверждения в стиле «По вашим записям 12.11 отмечены…» с датой, симптомами, указанной интенсивностью, влиянием и тем, что она пробовала. Числа бери только из её слов.
- questions: 1–3 вопроса, которые она может захотеть обсудить со специалистом.
- basis: ID записей, на которых основан пункт, только из переданных.
Без диагнозов, причин, оценок нормы и выводов о лечении. Совместные симптомы не называй причиной друг друга. Учитывай историю болезней, только если она передана, и не делай по ней выводов.`;

const INT = { weak: "слабая", moderate: "умеренная", strong: "сильная" };
const IMPACT = { none: "не мешает", some: "немного мешает", strong: "сильно мешает" };
const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const demoSummary = (records) => {
  const statements = records.map((r) => {
    const sym = r.items.filter((i) => i.kind === "symptom").map((i) => `${i.label.toLowerCase()}${i.intensity ? ` (${INT[i.intensity]})` : ""}`);
    const parts = [sym.length ? `отмечены ${sym.join(", ")}` : "без симптомов"];
    if (IMPACT[r.impact]) parts.push(`влияние: ${IMPACT[r.impact]}`);
    if (r.impactNote) parts.push(r.impactNote.charAt(0).toLowerCase() + r.impactNote.slice(1));
    return { text: `По вашим записям ${dm(r.date)} ${parts.join("; ")}.`, basis: [r.id] };
  });
  const ids = (re) => records.filter((r) => r.items.some((i) => re.test(i.label))).map((r) => r.id);
  const questions = [];
  if (ids(/пробужд/i).length) questions.push({ text: "Какие причины ночных пробуждений стоит обсудить?", basis: ids(/пробужд/i) });
  if (ids(/усталост/i).length) questions.push({ text: "Что может помочь с дневной усталостью?", basis: ids(/усталост/i) });
  if (!questions.length) questions.push({ text: "Что из моих записей стоит обсудить на консультации?", basis: records.map((r) => r.id) });
  return { statements, questions };
};

const summarize = async ({ records, history = [] }) => {
  if (!records.length) return { statements: [], questions: [] };
  if (provider() === "demo") return { ...demoSummary(records), demo: true };
  const payload = {
    records: records.map((r) => ({ id: r.id, date: r.date, source: r.source === "manual" ? "Ручная отметка" : "Разговор", words: r.context,
      impact: IMPACT[r.impact] || "не указано", impact_note: r.impactNote,
      observations: r.items.map((i) => ({ kind: i.kind, label: i.label, intensity: i.intensity ? INT[i.intensity] : "не указано" })) })),
    medical_history_from_user: history,
  };
  const parsed = JSON.parse(await complete({ system: SUMMARY_PROMPT, messages: [{ role: "user", content: JSON.stringify(payload) }], schema: SUMMARY_SCHEMA, effort: "medium", maxTokens: 4000 }));
  const ok = new Set(records.map((r) => r.id));
  const clean = (list) => list.map((x) => ({ text: x.text, basis: x.basis.filter((b) => ok.has(b)) })).filter((x) => x.text.trim() && x.basis.length);
  return { statements: clean(parsed.statements), questions: clean(parsed.questions) };
};

/* ---------- Speech ---------- */
const transcribe = async ({ audio }) => {
  if (provider() !== "openai") throw aiError(501, "Распознавание речи на сервере не подключено.");
  const m = /^data:(audio\/[\w.+-]+)(?:;codecs=[\w.]+)?;base64,(.+)$/.exec(audio || "");
  if (!m) throw aiError(400, "Не удалось прочитать запись. Можно написать текстом.");
  const ext = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav" }[m[1]] || "webm";
  const form = new FormData();
  form.append("file", new Blob([Buffer.from(m[2], "base64")], { type: m[1] }), `speech.${ext}`);
  form.append("model", OPENAI_STT);
  form.append("language", "ru");
  const data = await (await openai("audio/transcriptions", form, { json: false })).json();
  return { text: (data.text || "").trim() };
};
const speech = async ({ text }) => {
  if (provider() !== "openai") throw aiError(501, "Озвучивание на сервере не подключено.");
  const res = await openai("audio/speech", { model: OPENAI_TTS, voice: OPENAI_VOICE, input: text.slice(0, 2000), response_format: "mp3",
    instructions: "Говори по-русски спокойно, тепло и неторопливо, как внимательная взрослая собеседница." });
  return { audio: `data:audio/mpeg;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}` };
};

module.exports = { status, chat, extract, summarize, transcribe, speech, isDanger, URGENT_TEXT };
