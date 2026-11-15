// Acceptance checks from docs/01, docs/02 and docs/05 (version 15.11.2026), run against the real HTTP API.
// AI runs in demo mode here (no key), so these tests cover data rules, not model quality.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
const { createServer } = require("../server/server");

let server, base;
before(async () => {
  server = createServer({ dbFile: ":memory:" });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const call = async (method, path, body) => {
  const res = await fetch(base + "/api" + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
};
const ok = async (method, path, body) => { const r = await call(method, path, body); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };
const snap = (pid) => ok("GET", `/profiles/${pid}`);

test("Seed matches docs/02: profiles, R-01, four seeded B records, three flexible actions", async () => {
  await ok("POST", "/demo/reset");
  const a = await snap("DEMO-A"), b = await snap("DEMO-B");
  assert.equal(a.today, "2026-11-14"); assert.equal(a.profile.mascot, "cat"); assert.equal(a.records.length, 0); assert.equal(a.supports.length, 0);
  assert.equal(b.today, "2026-11-15"); assert.equal(b.profile.mascot, "rabbit");
  assert.deepEqual(b.records.map((r) => r.id), ["B-05", "B-04", "B-01", "B-02"]);
  assert.equal(b.plan.recommendations[0].indicator, "Число пробуждений; дневное самочувствие");
  assert.deepEqual(b.plan.today.map((x) => x.id), ["P-B1", "P-B2", "H-B1"]);
  assert.equal(b.plan.progress.percent, 0);
  assert.equal(a.plan.progress.percent, null);
});

test("Scenario B: B-03 fills the gap, progress 33% -> 67%, R-01 untouched and outside the percent", async () => {
  const before = (await snap("DEMO-B")).plan.recommendations[0];
  const r = await ok("POST", "/profiles/DEMO-B/records", { source: "manual", feeling: "hard", impact: "strong", impactNote: "Отложила прогулку",
    context: "Ночью проснулась три раза, днём устала и отложила прогулку", pose: "tired", requestKey: "b03",
    items: [{ kind: "symptom", label: "Ночные пробуждения", intensity: "strong" }, { kind: "symptom", label: "Усталость", intensity: "strong" }] });
  assert.equal(r.record.id, "B-03");
  const dup = await ok("POST", "/profiles/DEMO-B/records", { source: "manual", context: "x", requestKey: "b03" });
  assert.equal(dup.record.id, "B-03"); assert.equal(dup.snapshot.records.length, 5);
  assert.equal((await ok("PATCH", "/profiles/DEMO-B/actions/P-B1", { status: "completed" })).plan.progress.percent, 33);
  const s = await ok("PATCH", "/profiles/DEMO-B/actions/P-B2", { status: "completed" });
  assert.equal(s.plan.progress.percent, 67);
  assert.deepEqual(s.plan.recommendations[0], before);
  assert.equal(s.profile.pose, "tired");
});

test("Analytics after B-03 match the table in docs/02", async () => {
  const { analytics } = await snap("DEMO-B");
  const row = (a, label) => a.symptoms.find((x) => x.label === label);
  const expect = { 7: [3, 4, 3, 2, 0], 14: [4, 10, 3, 2, 1], 30: [5, 25, 4, 2, 1] };
  for (const [days, [withR, without, wake, fatigue, flush]] of Object.entries(expect)) {
    const a = analytics[days];
    assert.equal(a.daysWithRecords, withR, `${days} with`); assert.equal(a.daysWithout, without, `${days} without`);
    assert.equal(row(a, "Ночные пробуждения").days, wake); assert.equal(row(a, "Усталость").days, fatigue); assert.equal(row(a, "Приливы").days, flush);
  }
  assert.deepEqual(analytics[7].symptoms.find((x) => x.label === "Ночные пробуждения").series.map((p) => p.intensity), ["moderate", "weak", "strong"]);
  assert.deepEqual(analytics[7].together.find((t) => t.pair === "Ночные пробуждения + Усталость").records, ["B-01", "B-03"]);
});

test("Plan formula: skipping the last pending gives 100%, all skipped gives no percent, defer moves the step", async () => {
  await ok("POST", "/demo/reset");
  await ok("PATCH", "/profiles/DEMO-B/actions/P-B1", { status: "completed" });
  await ok("PATCH", "/profiles/DEMO-B/actions/P-B2", { status: "completed" });
  assert.equal((await ok("PATCH", "/profiles/DEMO-B/actions/H-B1", { status: "skipped" })).plan.progress.percent, 100);
  await ok("PATCH", "/profiles/DEMO-B/actions/P-B1", { status: "skipped" });
  assert.equal((await ok("PATCH", "/profiles/DEMO-B/actions/P-B2", { status: "skipped" })).plan.progress.percent, null);
  const d = await ok("PATCH", "/profiles/DEMO-B/actions/P-B2", { status: "deferred", deferredTo: "2026-11-16" });
  assert.equal(d.plan.upcoming.length, 1); assert.equal(d.plan.upcoming[0].date, "2026-11-16");
});

test("Scenario A: good day -> letter A-S1, hard day suggests it, feedback A-F1, accepted step P-A1 at 0%", async () => {
  await ok("POST", "/demo/reset");
  const m1 = await ok("POST", "/profiles/DEMO-A/records", { source: "manual", feeling: "good", pose: "energized" });
  assert.equal(m1.record.id, "A-M1"); assert.equal(m1.snapshot.suggestion.kind, "offer-create");
  const s1 = await ok("POST", "/profiles/DEMO-A/supports", { type: "letter", title: "Письмо себе", topics: ["sleep"], authorship: "self",
    text: "Тебе можно замедлиться и попросить помощи. Не нужно справляться со всем одной." });
  assert.equal(s1.support.id, "A-S1"); assert.equal(s1.snapshot.plan.today.length, 0);
  await ok("PUT", "/profiles/DEMO-A/demo-date", { date: "2026-11-15" });
  const m2 = await ok("POST", "/profiles/DEMO-A/records", { source: "manual", feeling: "hard", impact: "strong",
    items: [{ kind: "symptom", label: "Плохой сон", intensity: "strong" }, { kind: "symptom", label: "Усталость", intensity: "strong" }, { kind: "symptom", label: "Приливы", intensity: "moderate" }] });
  assert.equal(m2.record.id, "A-M2");
  assert.equal(m2.snapshot.suggestion.kind, "offer-open"); assert.equal(m2.snapshot.suggestion.supportId, "A-S1");
  const poses = await ok("POST", "/poses", { labels: ["Плохой сон", "Усталость", "Приливы"] });
  assert.deepEqual(poses.poses.sort(), ["hot_flash", "tired"]);
  const f = await ok("POST", "/profiles/DEMO-A/supports/A-S1/feedback", { value: "fit" });
  assert.equal(f.feedbackId, "A-F1");
  const p = await ok("POST", "/profiles/DEMO-A/actions", { title: "Попросить близких о десяти минутах тишины", source: "chat", sourceRef: "A-C1" });
  assert.equal(p.action.id, "P-A1"); assert.equal(p.snapshot.plan.progress.percent, 0);
  assert.equal(p.snapshot.plan.recommendations.length, 0, "R-01 belongs to DEMO-B only");
});

test("Conversation: replies use history, danger goes to X, unknown intensity is not guessed", async () => {
  const first = await ok("POST", "/profiles/DEMO-A/chat", { mode: "vent", history: [{ role: "user", content: "Плохо спала, сегодня раздражаюсь и потом виню себя за это" }] });
  assert.ok(first.text.length > 0); assert.equal(first.demo, true);
  const x = await ok("POST", "/profiles/DEMO-A/chat", { mode: "vent", history: [{ role: "user", content: "Я больше не хочу жить" }] });
  assert.equal(x.danger, true); assert.match(x.text, /помощь человека/);
  const ex = await ok("POST", "/profiles/DEMO-A/extract", { text: "Плохо спала, сегодня раздражаюсь и потом виню себя за это. Я устала. Мне бы хотелось немного тишины, но неудобно просить близких" });
  const labels = ex.items.map((i) => i.label);
  for (const l of ["Плохой сон", "Раздражительность", "Вина", "Усталость", "Потребность в паузе"]) assert.ok(labels.includes(l), l);
  assert.ok(ex.items.every((i) => i.intensity === "unknown" && i.quote));
  const c1 = await ok("POST", "/profiles/DEMO-A/records", { source: "conversation", supportFormat: "vent",
    items: ex.items.map((i) => ({ kind: i.kind, label: i.label, quote: i.quote })) });
  assert.equal(c1.record.id, "A-C1"); assert.equal(c1.record.chatText, null, "conversation text is not kept without consent");
});

test("Recommendation needs text, source and date; summary uses only selected records", async () => {
  const bad = await call("POST", "/profiles/DEMO-B/recommendations", { text: "Пить воду" });
  assert.equal(bad.status, 400); assert.ok(bad.json.errors.source && bad.json.errors.date);
  await ok("POST", "/profiles/DEMO-B/records", { source: "manual", feeling: "hard", impact: "strong", impactNote: "Отложила прогулку", context: "Ночью проснулась три раза",
    items: [{ kind: "symptom", label: "Ночные пробуждения", intensity: "strong" }, { kind: "symptom", label: "Усталость", intensity: "strong" }] });
  const g = await ok("POST", "/profiles/DEMO-B/summary/generate", { recordIds: ["B-01", "B-03"] });
  const basis = new Set([...g.statements, ...g.questions].flatMap((x) => x.basis));
  assert.deepEqual([...basis].sort(), ["B-01", "B-03"]);
  assert.equal(g.questions[0].id, "Q-B1");
  const saved = await ok("POST", "/profiles/DEMO-B/summaries", { recordIds: g.recordIds, text: g.statements.map((s) => s.text).join(" "), demo: g.demo,
    questions: [{ id: "Q-B1", text: "Что стоит обсудить о ночных пробуждениях и дневной усталости?", basis: ["B-01", "B-03"] }] });
  assert.equal(saved.summaryId, "S-B1");
  assert.equal((await call("POST", "/profiles/DEMO-B/summary/generate", { recordIds: ["A-M1"] })).status, 404);
});

test("My data: deleting records also removes dependent summaries; profiles stay isolated", async () => {
  const d = await ok("POST", "/profiles/DEMO-B/delete-content", { categories: ["records"] });
  assert.equal(d.records.length, 0); assert.equal(d.summaries.length, 0); assert.equal(d.plan.recommendations.length, 1);
  assert.ok((await snap("DEMO-A")).records.length > 0);
  assert.equal((await call("DELETE", "/profiles/DEMO-A/records/B-01")).status, 404);
});
