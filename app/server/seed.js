// Synthetic demo data from docs/02_DEMO_SCENARIOS.md (version 15.11.2026). No real person's data.
const T0 = "2026-11-10T09:00:00.000Z";

const seedDemo = (db) => {
  const profile = db.prepare(`INSERT INTO profiles (id, letter, name, demo_date, onboarding_done, topics, support_pref, specialist, mascot, data_basic)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`);
  // DEMO-A: suspects perimenopause (self-description, not a diagnosis), no specialist yet, cat, starts on 14.11.
  profile.run("DEMO-A", "A", "Алия", "2026-11-14", JSON.stringify(["sleep", "heat"]), "vent", "no", "cat",
    JSON.stringify({ stage: "Подозреваю перименопаузу, со своих слов" }));
  // DEMO-B: knows about the transition from her own words, sees a specialist, rabbit, starts on 15.11.
  profile.run("DEMO-B", "B", "Мира", "2026-11-15", JSON.stringify(["sleep"]), "understand", "yes", "rabbit",
    JSON.stringify({ stage: "Знаю о переходе со своих слов" }));

  db.prepare(`INSERT INTO recommendations (id, profile_id, original_text, text, date, source, indicator, created_at)
    VALUES ('R-01', 'DEMO-B', ?, ?, '2026-11-10', ?, ?, ?)`)
    .run("Отслеживать ночные пробуждения и дневное самочувствие", "Отслеживать ночные пробуждения и дневное самочувствие",
      "Специалист, консультация; внесено пользовательницей", "Число пробуждений; дневное самочувствие", T0);

  const rec = db.prepare(`INSERT INTO records (id, profile_id, date, time, source, feeling, impact, impact_note, context, created_at)
    VALUES (?, 'DEMO-B', ?, '21:00', 'manual', ?, ?, ?, ?, ?)`);
  const item = db.prepare("INSERT INTO record_items (record_id, kind, label, intensity, position) VALUES (?, 'symptom', ?, ?, ?)");
  const add = (id, date, feeling, impact, note, context, symptoms) => {
    rec.run(id, date, feeling, impact, note, context, `${date}T16:00:00.000Z`);
    symptoms.forEach(([label, intensity], i) => item.run(id, label, intensity, i));
  };
  add("B-05", "2026-10-28", null, "none", "", "Проснулась ночью один раз", [["Ночные пробуждения", "weak"]]);
  add("B-04", "2026-11-05", "hard", "some", "", "Было ощущение жара, сделала паузу в делах", [["Приливы", "moderate"]]);
  add("B-01", "2026-11-12", "hard", "some", "Трудно сосредоточиться на работе",
    "Проснулась ночью два раза, днём устала и было трудно сосредоточиться на работе", [["Ночные пробуждения", "moderate"], ["Усталость", "moderate"]]);
  add("B-02", "2026-11-13", null, "none", "", "Ночью проснулась один раз, днём чувствовала себя обычно", [["Ночные пробуждения", "weak"]]);

  db.prepare("INSERT INTO habits (id, profile_id, title, rhythm, created_at) VALUES ('HB-1', 'DEMO-B', 'Выбранный вечерний ритуал', 'Каждый день', ?)").run(T0);
  const action = db.prepare("INSERT INTO actions (id, profile_id, title, date, source, habit_id, created_at) VALUES (?, 'DEMO-B', ?, '2026-11-15', ?, ?, ?)");
  action.run("P-B1", "Подготовить вопрос к приёму", "self", null, T0);
  action.run("P-B2", "Записать дневное самочувствие", "self", null, T0);
  action.run("H-B1", "Выбранный вечерний ритуал", "habit", "HB-1", T0);
};

module.exports = { seedDemo };
