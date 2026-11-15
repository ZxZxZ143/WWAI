// Business rules from docs/05: poses, plan progress, analytics, support matching.

const TOPICS = {
  sleep: "Сон и усталость",
  heat: "Приливы и ощущение жара",
  mood: "Перепады настроения",
  anxiety: "Тревожность и раздражительность",
  focus: "Трудности с концентрацией",
  other: "Другие симптомы",
};
const SYMPTOMS = [
  ["Плохой сон", "sleep"], ["Ночные пробуждения", "sleep"], ["Усталость", "sleep"],
  ["Приливы", "heat"], ["Ночная потливость", "heat"],
  ["Перепады настроения", "mood"],
  ["Тревожность", "anxiety"], ["Раздражительность", "anxiety"],
  ["Трудности с концентрацией", "focus"],
  ["Головная боль", "other"], ["Боль в суставах", "other"], ["Сердцебиение", "other"],
];
const POSES = ["base", "energized", "reflective", "tired", "hot_flash", "anxious", "resting"];
const MASCOTS = ["cat", "rabbit", "bear", "fox", "capybara", "borzoi"];
const MODES = ["vent", "understand", "step"];

const topicOf = (label) => {
  const l = label.toLowerCase();
  const known = SYMPTOMS.find(([s]) => s.toLowerCase() === l);
  if (known) return known[1];
  if (/сон|пробужд|устал/.test(l)) return "sleep";
  if (/прилив|жар|потлив/.test(l)) return "heat";
  if (/настроени|плакать/.test(l)) return "mood";
  if (/тревож|раздраж|вина/.test(l)) return "anxiety";
  if (/сосредоточ|концентр/.test(l)) return "focus";
  return "other";
};

// Poses the confirmed data allows to offer. reflective and resting are manual only.
const suggestPoses = ({ feeling, labels }) => {
  const set = new Set();
  for (const l of labels.map((x) => x.toLowerCase())) {
    if (/устал|плохой сон|пробужд/.test(l)) set.add("tired");
    if (/прилив|жар|потлив/.test(l)) set.add("hot_flash");
    if (/тревож/.test(l)) set.add("anxious");
  }
  if (feeling === "good" && !set.size) set.add("energized");
  return [...set];
};

// completed / (completed + pending) x 100 for today's flexible actions. skipped and deferred are out.
// Round half up. Zero denominator means no percent at all.
const progress = (actions) => {
  const completed = actions.filter((a) => a.status === "completed").length;
  const pending = actions.filter((a) => a.status === "pending").length;
  const total = completed + pending;
  return { completed, pending, total, percent: total ? Math.floor((completed / total) * 100 + 0.5) : null };
};

const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

// Descriptive analytics only: days with a symptom among days with records, gaps are "no data".
const analytics = (records, today, days) => {
  const from = addDays(today, -(days - 1));
  const inRange = records.filter((r) => r.date >= from && r.date <= today);
  const recordDays = [...new Set(inRange.map((r) => r.date))].sort();
  const allDays = Array.from({ length: days }, (_, i) => addDays(from, i));
  const labels = [...new Set(inRange.flatMap((r) => r.items.filter((i) => i.kind === "symptom").map((i) => i.label)))];
  const tracked = ["Ночные пробуждения", "Усталость", "Приливы"].filter((l) => !labels.includes(l));
  const symptoms = [...labels, ...tracked].map((label) => {
    const daysWith = recordDays.filter((d) => inRange.some((r) => r.date === d && r.items.some((i) => i.kind === "symptom" && i.label === label)));
    const series = inRange.flatMap((r) => r.items.filter((i) => i.kind === "symptom" && i.label === label).map((i) => ({ date: r.date, recordId: r.id, intensity: i.intensity })))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { label, days: daysWith.length, of: recordDays.length, series };
  }).sort((a, b) => b.days - a.days || a.label.localeCompare(b.label));
  const pairs = {};
  for (const r of inRange) {
    const s = [...new Set(r.items.filter((i) => i.kind === "symptom").map((i) => i.label))].sort();
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      const k = `${s[i]} + ${s[j]}`; (pairs[k] ||= []).push(r.id);
    }
  }
  return {
    days, from, to: today,
    daysWithRecords: recordDays.length, daysWithout: days - recordDays.length,
    calendar: allDays.map((d) => ({ date: d, records: inRange.filter((r) => r.date === d).map((r) => r.id) })),
    symptoms,
    together: Object.entries(pairs).map(([pair, ids]) => ({ pair, records: ids })),
  };
};

// Own supports only: topic overlap, preferred format, earlier usefulness; newer wins ties.
const matchSupports = ({ supports, feedback, topics, preferVoice }) => {
  const scored = supports.map((s) => {
    const fb = feedback.filter((f) => f.supportId === s.id);
    const overlap = s.topics.filter((t) => topics.includes(t)).length;
    const fit = fb.filter((f) => f.value === "fit").length - 2 * fb.filter((f) => f.value === "not_fit").length;
    const format = preferVoice ? (s.type === "voice" ? 1 : 0) : (s.type !== "voice" ? 1 : 0);
    return { s, score: overlap * 3 + fit * 2 + format, overlap };
  });
  scored.sort((a, b) => b.score - a.score || b.s.createdAt.localeCompare(a.s.createdAt));
  const best = scored.find((x) => x.overlap > 0) || null;
  return best ? best.s : null;
};

module.exports = { TOPICS, SYMPTOMS, POSES, MASCOTS, MODES, topicOf, suggestPoses, progress, analytics, matchSupports, addDays };
