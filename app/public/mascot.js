// Qoldau mascots (six animals, seven shared poses from docs/05): drawing, states and helpers. Copied from prototypes/peri-mascot-animations.html.
const NS = "http://www.w3.org/2000/svg";
const OL = "#8B4A52", CR = "#FFF3EA", PINK = "#EFB0AE", WINE = "#7A2E3A", GOLD = "#E3A33A", EYE = "#3A2228", NAVY = "#3E3A63";

const STATES = {
  base:       { name: "Обычное",      desc: "Спокойное присутствие",               dress: "#8C8A4E", halo: "#F3E2DA", head: "rotate(0deg)",                     line: "Я рядом." },
  energized:  { name: "Бодрость",     desc: "С энергией и хорошим настроением",     dress: "#8C8A4E", halo: "#F6E3CC", head: "rotate(-8deg)",                    line: "Сегодня хороший день." },
  reflective: { name: "Задумчивость", desc: "Анализирует и планирует",              dress: "#B98BB4", halo: "#EADCEB", head: "rotate(6deg)",                     line: "Давай подумаем, что поможет." },
  tired:      { name: "Усталость",    desc: "Нужно восстановить силы",              dress: "#D9826B", halo: "#F3D6CF", head: "translate(0px,18px) rotate(10deg)", line: "Можно двигаться медленнее." },
  hot_flash:  { name: "Прилив",       desc: "Чувствует дискомфорт и жар",           dress: "#C0603F", halo: "#F7D3C2", head: "rotate(-5deg)",                    line: "Жарко. Можно сделать паузу." },
  anxious:    { name: "Тревога",      desc: "Переживает и нуждается в поддержке",   dress: "#7A2E3A", halo: "#EAD3D8", head: "rotate(4deg)",                     line: "Тревожно. Я рядом." },
  resting:    { name: "Отдых",        desc: "Восстанавливается и заботится о себе", dress: "#8C8A4E", halo: "#E8E6CC", head: "rotate(-6deg)",                    line: "Отдых тоже забота." },
};
const ORDER = ["base", "energized", "reflective", "tired", "hot_flash", "anxious", "resting"];

/* ---------- Shared drawing helpers ---------- */
const star = (x, y, s) => `<path d="M${x} ${y-s}Q${x} ${y} ${x+s} ${y}Q${x} ${y} ${x} ${y+s}Q${x} ${y} ${x-s} ${y}Q${x} ${y} ${x} ${y-s}Z" fill="${GOLD}"/>`;
const openEye = (x, y) => `<g class="m-blink"><ellipse cx="${x}" cy="${y}" rx="5.5" ry="6.5" fill="${EYE}"/><circle cx="${x+2}" cy="${y-2}" r="1.8" fill="#fff"/></g>`;
const arc = (d) => `<path d="${d}" fill="none" stroke="${EYE}" stroke-width="2.6" stroke-linecap="round"/>`;
const scarf = (c) => `<path d="M70 114 Q100 132 130 114 L128 126 Q100 142 72 126 Z" fill="${c}"/>
  <path d="M100 132 L89 154 L98 151 Z M100 132 L111 154 L102 151 Z" fill="${c}"/><circle cx="100" cy="132" r="7" fill="${c}"/>`;
const hoop = (x, y, r = 5.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${GOLD}" stroke-width="2.6"/>`;
const flower = (x, y) => [0, 72, 144, 216, 288].map(a => {
  const r = a * Math.PI / 180;
  return `<circle cx="${(x + 8 * Math.cos(r)).toFixed(1)}" cy="${(y + 8 * Math.sin(r)).toFixed(1)}" r="7.5" fill="#D9483B" stroke="#A83328" stroke-width="1"/>`;
}).join("") + `<circle cx="${x}" cy="${y}" r="4" fill="#F4C542"/>`;
const ellHead = (F, L, cy = 78, rx = 48, ry = 40) => `<ellipse cx="100" cy="${cy}" rx="${rx}" ry="${ry}" fill="${F}" stroke="${L}" stroke-width="2.2"/>`;
const longTail = (F, L, w = 13) => `<path d="M146 192 C186 194 196 160 178 140" fill="none" stroke="${L}" stroke-width="${w}" stroke-linecap="round"/>
  <path d="M146 192 C186 194 196 160 178 140" fill="none" stroke="${F}" stroke-width="${w - 4}" stroke-linecap="round"/>`;

/* ---------- Species: only the parts that differ ---------- */
const SPECIES = {
  borzoi: {
    name: "Борзая", tag: "Утончённая и чувствительная. Ценит красоту, ритуалы и баланс, бережно проходит этот этап вместе с вами.",
    fur: "#FFF1E2", ol: OL, faceDy: -6, mouthDy: 16,
    back: (F, L) => `<path d="M60 58 C30 90 38 136 66 148 C56 126 74 112 62 92 Z" fill="#F3DCC4" stroke="${L}" stroke-width="2"/>
      <path d="M140 58 C170 90 162 136 134 148 C144 126 126 112 138 92 Z" fill="#F3DCC4" stroke="${L}" stroke-width="2"/>`,
    ears: () => ``,
    head: (F, L) => ellHead(F, L, 74, 42, 38),
    muzzle: (F, L) => `<path d="M84 80 C84 108 90 124 100 126 C110 124 116 108 116 80" fill="${F}" stroke="${L}" stroke-width="2"/>`,
    nose: `<ellipse cx="100" cy="110" rx="6" ry="4.5" fill="${EYE}"/>`,
    top: (F, L) => `<path d="M62 56 C66 30 100 24 124 34 C112 40 98 40 88 52 C82 46 70 50 62 56 Z" fill="#F3DCC4" stroke="${L}" stroke-width="2"/>
      <path d="M138 56 C136 40 128 34 120 32 C130 38 132 46 130 54 Z" fill="#F3DCC4" stroke="${L}" stroke-width="2"/>`,
    tail: (F, L) => `<path d="M146 190 C190 196 200 150 172 136" fill="none" stroke="${L}" stroke-width="20" stroke-linecap="round"/>
      <path d="M146 190 C190 196 200 150 172 136" fill="none" stroke="#F3DCC4" stroke-width="16" stroke-linecap="round"/>`,
    bodyExtra: () => ``,
    neck: scarf(WINE),
    earring: hoop(138, 98, 7),
    whiskers: false,
  },
  rabbit: {
    name: "Зайка", tag: "Мечтательная, лёгкая и позитивная. Поддерживает, вдохновляет и помогает проживать этот этап с заботой о себе.",
    fur: "#FFF4EE", ol: OL,
    back: () => ``,
    ears: (F, L) => `<g transform="rotate(-12 82 50)"><ellipse cx="82" cy="28" rx="11" ry="24" fill="${F}" stroke="${L}" stroke-width="2.2"/><ellipse cx="82" cy="30" rx="6" ry="17" fill="${PINK}"/></g>
      <g transform="rotate(12 118 50)"><ellipse cx="118" cy="28" rx="11" ry="24" fill="${F}" stroke="${L}" stroke-width="2.2"/><ellipse cx="118" cy="30" rx="6" ry="17" fill="${PINK}"/></g>`,
    head: (F, L) => ellHead(F, L),
    muzzle: () => ``,
    nose: `<path d="M95 91 Q100 96 105 91 Q100 88 95 91 Z" fill="#E38C93"/>`,
    top: (F, L) => `<g transform="rotate(-10 100 48)">
        <ellipse cx="100" cy="52" rx="64" ry="13" fill="${WINE}" stroke="${L}" stroke-width="2"/>
        <path d="M72 52 C72 28 128 28 128 52 Z" fill="${WINE}" stroke="${L}" stroke-width="2"/>
        <path d="M73 46 Q100 52 127 46" fill="none" stroke="#5E1F2B" stroke-width="4"/></g>`,
    tail: (F, L) => `<circle cx="148" cy="184" r="13" fill="${F}" stroke="${L}" stroke-width="2"/>`,
    bodyExtra: () => ``,
    neck: `<path d="M80 120 Q100 136 120 120" fill="none" stroke="${GOLD}" stroke-width="1.8"/><circle cx="100" cy="130" r="3.5" fill="${GOLD}"/>`,
    earring: hoop(146, 104),
    whiskers: false,
  },
  fox: {
    name: "Лисица", tag: "Любознательная и проницательная. Исследует, задаёт вопросы и мягко находит решения вместе с вами.",
    fur: "#E8803F", ol: "#7A3B2A",
    back: () => ``,
    ears: (F, L) => `<path d="M60 62 L66 18 L94 42 Z" fill="${F}" stroke="${L}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M67 52 L70 30 L86 44 Z" fill="#FFE3CC"/><path d="M66 18 L63 34 L76 31 Z" fill="#4A2A22"/>
      <path d="M140 62 L134 18 L106 42 Z" fill="${F}" stroke="${L}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M133 52 L130 30 L114 44 Z" fill="#FFE3CC"/><path d="M134 18 L137 34 L124 31 Z" fill="#4A2A22"/>`,
    head: (F, L) => ellHead(F, L),
    muzzle: () => `<path d="M53 86 Q78 66 100 80 Q122 66 147 86 Q146 116 100 117 Q54 116 53 86 Z" fill="#FFF3EA"/>`,
    nose: `<ellipse cx="100" cy="92" rx="5" ry="4" fill="${EYE}"/>`,
    top: () => ``,
    tail: (F, L) => `<path d="M140 194 C196 204 206 140 168 116 C178 150 166 178 140 182 Z" fill="${F}" stroke="${L}" stroke-width="2"/>
      <path d="M168 116 C178 126 182 136 184 148 C174 142 168 130 168 116 Z" fill="#FFF3EA"/>`,
    bodyExtra: (F, L) => `<path d="M74 118 C64 132 62 150 64 160 L136 160 C138 150 136 132 126 118 Z" fill="#FFF3EA" stroke="${L}" stroke-width="2"/>`,
    neck: scarf(NAVY),
    earring: hoop(146, 104),
    whiskers: true,
  },
  bear: {
    name: "Медведица", tag: "Заботливая и надёжная. Даёт опору, вселяет уверенность и мягко поддерживает на этом этапе.",
    fur: "#B86A3E", ol: "#6E3A22",
    back: () => ``,
    ears: (F, L) => `<circle cx="58" cy="54" r="14" fill="${F}" stroke="${L}" stroke-width="2.2"/><circle cx="58" cy="54" r="7" fill="#D99A70"/>
      <circle cx="142" cy="54" r="14" fill="${F}" stroke="${L}" stroke-width="2.2"/><circle cx="142" cy="54" r="7" fill="#D99A70"/>`,
    head: (F, L) => ellHead(F, L),
    muzzle: () => `<ellipse cx="100" cy="99" rx="21" ry="14" fill="#E2A97E"/>`,
    nose: `<ellipse cx="100" cy="92" rx="7" ry="5" fill="${EYE}"/>`,
    top: (F, L) => `<path d="M54 64 C52 26 148 26 146 64 C128 50 72 50 54 64 Z" fill="${NAVY}" stroke="${L}" stroke-width="2"/>
      <path d="M136 34 q18 -16 26 -4 q-12 6 -26 4 Z M138 38 q20 -4 22 10 q-14 -2 -22 -10 Z" fill="${NAVY}" stroke="${L}" stroke-width="1.6"/>`,
    tail: () => ``,
    bodyExtra: (F, L) => `<path d="M72 116 C52 140 48 182 58 202 L86 202 L88 124 Z" fill="#F6E6D2" stroke="${L}" stroke-width="2"/>
      <path d="M128 116 C148 140 152 182 142 202 L114 202 L112 124 Z" fill="#F6E6D2" stroke="${L}" stroke-width="2"/>`,
    neck: ``,
    earring: hoop(146, 104),
    whiskers: false,
  },
  capybara: {
    name: "Капибара", tag: "Спокойная и невозмутимая. Принимает любые изменения, поддерживает и помогает сохранять баланс.",
    fur: "#C98A55", ol: "#6E4127",
    back: () => ``,
    ears: (F, L) => `<ellipse cx="64" cy="46" rx="9" ry="7" fill="${F}" stroke="${L}" stroke-width="2"/><ellipse cx="136" cy="44" rx="9" ry="7" fill="${F}" stroke="${L}" stroke-width="2"/>`,
    head: (F, L) => `<path d="M54 86 C52 50 76 38 100 38 C126 38 150 50 146 86 C146 112 128 120 100 120 C72 120 54 112 54 86 Z" fill="${F}" stroke="${L}" stroke-width="2.2"/>`,
    muzzle: () => `<ellipse cx="100" cy="99" rx="27" ry="16" fill="#B87A48"/>`,
    nose: `<path d="M91 91 q4 -3 7 0 M102 91 q4 -3 7 0" fill="none" stroke="#4A2A1C" stroke-width="2.6" stroke-linecap="round"/>`,
    top: () => flower(62, 50),
    tail: () => ``,
    bodyExtra: () => `<path d="M88 118 L112 118 L108 202 L92 202 Z" fill="#F6E6D2"/>
      <ellipse cx="72" cy="158" rx="6" ry="14" transform="rotate(-25 72 158)" fill="#E9DDB0" opacity=".75"/>
      <ellipse cx="128" cy="170" rx="6" ry="14" transform="rotate(25 128 170)" fill="#E9DDB0" opacity=".75"/>
      <ellipse cx="74" cy="188" rx="5" ry="11" transform="rotate(20 74 188)" fill="#E9DDB0" opacity=".75"/>`,
    neck: ``,
    earring: ``,
    whiskers: false,
  },
  cat: {
    name: "Кошка", tag: "Взрослая, уверенная и заботливая. Поддерживает, подсказывает и проходит этот этап вместе с вами.",
    fur: CR, ol: OL,
    back: () => ``,
    ears: (F, L) => `<path d="M60 62 L66 18 L94 42 Z" fill="${F}" stroke="${L}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M67 52 L70 30 L86 44 Z" fill="${PINK}"/>
      <path d="M140 62 L134 18 L106 42 Z" fill="${F}" stroke="${L}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M133 52 L130 30 L114 44 Z" fill="${PINK}"/>`,
    head: (F, L) => ellHead(F, L),
    muzzle: () => ``,
    nose: `<path d="M96 92 L104 92 L100 97 Z" fill="#C9787E"/>`,
    top: () => ``,
    tail: (F, L) => longTail(F, L),
    bodyExtra: () => ``,
    neck: scarf(WINE),
    earring: hoop(146, 104),
    whiskers: true,
  },
};
const SPECIES_ORDER = ["cat", "rabbit", "bear", "fox", "capybara", "borzoi"];

const mascotSVG = (id) => {
  const sp = SPECIES[id], F = sp.fur, L = sp.ol;
  const paw = (x, y, r = 9) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${(r * .85).toFixed(1)}" fill="${F}" stroke="${L}" stroke-width="2"/>`;
  const notRest = "base energized reflective tired hot_flash anxious";
  return `
<svg class="m" viewBox="0 0 200 220" aria-hidden="true">
  <circle class="m-halo" cx="100" cy="112" r="88"/>
  <ellipse class="m-shadow" cx="100" cy="207" rx="56" ry="7"/>
  <g data-on="energized"><g class="m-twinkle">${star(34,58,9)}</g><g class="m-twinkle d2">${star(48,30,6)}</g><g class="m-twinkle d3">${star(174,28,8)}</g></g>

  <g class="m-shake"><g class="m-breathe">
    <g class="m-tail">${sp.tail(F, L)}</g>
    <path class="m-dress" d="M72 116 C50 140 46 182 58 202 L142 202 C154 182 150 140 128 116 Z" stroke="${L}" stroke-width="2"/>
    <ellipse cx="82" cy="203" rx="13" ry="6" fill="${F}" stroke="${L}" stroke-width="2"/>
    <ellipse cx="118" cy="203" rx="13" ry="6" fill="${F}" stroke="${L}" stroke-width="2"/>
    ${sp.bodyExtra(F, L)}
    ${sp.neck}

    <g data-on="tired"><ellipse cx="100" cy="140" rx="78" ry="22" fill="#B5525F" stroke="${OL}" stroke-width="2"/></g>
    <g data-on="energized"><g class="m-wave">
      <path d="M126 128 L158 96" stroke="${L}" stroke-width="16" stroke-linecap="round"/>
      <path d="M126 128 L158 96" stroke="${F}" stroke-width="12" stroke-linecap="round"/>
      ${paw(160,94,10)}
    </g></g>
    <g data-on="base energized hot_flash resting">${paw(80,162,10)}</g>
    <g data-on="base">${paw(120,162,10)}</g>

    <g class="m-head">
      ${sp.back(F, L)}
      <g data-on="${notRest}">${sp.ears(F, L)}</g>
      ${sp.head(F, L)}
      ${sp.muzzle(F, L)}
      <g data-on="resting">
        <path d="M50 62 C46 24 78 10 100 12 C124 10 156 24 150 62 C130 50 70 50 50 62 Z" fill="#C79AC4" stroke="${OL}" stroke-width="2"/>
        <path d="M64 42 Q100 26 136 42 M74 28 Q100 18 126 28" fill="none" stroke="#A97BA6" stroke-width="2"/>
        <circle cx="100" cy="14" r="8" fill="#C79AC4" stroke="${OL}" stroke-width="2"/>
      </g>
      <g data-on="${notRest}">${sp.top(F, L)}</g>
      <g transform="translate(0 ${sp.faceDy || 0})">
        <ellipse cx="72" cy="97" rx="8" ry="4.5" fill="#F2A3A3" opacity=".55"/>
        <ellipse cx="128" cy="97" rx="8" ry="4.5" fill="#F2A3A3" opacity=".55"/>
        <g data-on="hot_flash" class="sw"><ellipse cx="72" cy="97" rx="12" ry="6" fill="#E8605A" opacity=".45"/><ellipse cx="128" cy="97" rx="12" ry="6" fill="#E8605A" opacity=".45"/></g>
        <g data-on="resting" class="sw"><ellipse cx="100" cy="84" rx="40" ry="14" fill="#B8BE84" opacity=".9"/></g>
        <g data-on="anxious" class="sw">${openEye(82,84)}${openEye(118,84)}
          <path d="M73 72 L89 67 M111 67 L127 72" stroke="${EYE}" stroke-width="2.5" stroke-linecap="round"/></g>
        <g data-on="base" class="sw">${openEye(82,84)}${openEye(118,84)}</g>
        <g data-on="reflective" class="sw">${openEye(82,80)}${openEye(118,80)}</g>
        <g data-on="energized hot_flash resting" class="sw">${arc("M75 85 Q82 77 89 85")}${arc("M111 85 Q118 77 125 85")}</g>
        <g data-on="tired" class="sw">${arc("M75 82 Q82 88 89 82")}${arc("M111 82 Q118 88 125 82")}</g>
        <g data-on="reflective">
          <circle cx="82" cy="82" r="11" fill="#fff" fill-opacity=".25" stroke="${WINE}" stroke-width="2.2"/>
          <circle cx="118" cy="82" r="11" fill="#fff" fill-opacity=".25" stroke="${WINE}" stroke-width="2.2"/>
          <path d="M93 81 Q100 77 107 81 M71 80 L56 74 M129 80 L144 74" fill="none" stroke="${WINE}" stroke-width="2.2" stroke-linecap="round"/>
        </g>
      </g>
      ${sp.nose}
      <g transform="translate(0 ${sp.mouthDy || 0})">
        <g data-on="base energized reflective tired hot_flash resting" class="sw"><path d="M100 97 Q96 103 91 100 M100 97 Q104 103 109 100" fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round"/></g>
        <g data-on="anxious" class="sw"><path d="M93 104 Q96.5 101 100 104 Q103.5 107 107 104" fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round"/></g>
      </g>
      ${sp.whiskers ? `<path d="M58 92 L38 88 M58 97 L37 99 M142 92 L162 88 M142 97 L163 99" stroke="${L}" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>` : ""}
      ${sp.earring}
      <g data-on="hot_flash"><g class="m-drop"><path d="M56 48 Q49 60 56 64 Q63 60 56 48 Z" fill="#E98A5E"/></g></g>
    </g>

    <g data-on="tired">${paw(46,134,10)}${paw(154,134,10)}</g>
    <g data-on="reflective">
      <g transform="rotate(-8 75 154)">
        <rect x="52" y="138" width="48" height="34" rx="3" fill="${WINE}" stroke="${OL}" stroke-width="2"/>
        <path d="M56 143 L96 143" stroke="#F3D9D3" stroke-width="2"/>
      </g>
      ${paw(96,150)}
      <g class="m-tap">
        <path d="M131 124 L144 98" stroke="${EYE}" stroke-width="3.2" stroke-linecap="round"/>
        ${paw(130,124)}
      </g>
    </g>
    <g data-on="hot_flash"><g class="m-fan">
      <path d="M138 150 L130.4 106.7 A44 44 0 0 1 179.3 135 Z" fill="${WINE}" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M138 150 L145.6 106.7 M138 150 L160 111.9 M138 150 L171.7 121.7" stroke="#C46C78" stroke-width="1.4"/>
      ${paw(138,150)}
    </g></g>
    <g data-on="anxious">
      <rect x="64" y="120" width="72" height="52" rx="18" fill="#CDB0D6" stroke="${OL}" stroke-width="2"/>
      <path d="M78 148 Q100 142 122 148" fill="none" stroke="#B394BE" stroke-width="2"/>
      ${paw(86,124)}${paw(114,124)}
    </g>
    <g data-on="resting">
      <path class="m-steam" d="M134 122 q-5 -6 0 -12 q5 -6 0 -12"/>
      <path class="m-steam d2" d="M144 122 q-5 -6 0 -12 q5 -6 0 -12"/>
      <rect x="126" y="126" width="26" height="26" rx="5" fill="#FFF" stroke="${OL}" stroke-width="2"/>
      <path d="M152 132 q9 0 9 7 q0 7 -9 7" fill="none" stroke="${OL}" stroke-width="2.4"/>
      <path d="M139 137 c-2 -3 -6 -1 -4 2 l4 4 l4 -4 c2 -3 -2 -5 -4 -2 z" fill="#E07B7B"/>
      ${paw(126,142)}
    </g>
  </g></g>

  <g data-on="tired">
    <text class="m-z" x="140" y="54" font-size="13">z</text>
    <text class="m-z d2" x="153" y="40" font-size="16">z</text>
    <text class="m-z d3" x="168" y="24" font-size="20">Z</text>
  </g>
  <g data-on="hot_flash"><path class="m-heat" d="M160 52 l8 -8 M166 62 l11 -4 M154 44 l3 -11" stroke="#E0705A" stroke-width="2.6" stroke-linecap="round"/></g>
  <g data-on="anxious"><g class="m-spin"><path d="M150 26 a3 3 0 1 1 3 3 a6 6 0 1 1 -6 -6 a9 9 0 1 1 9 9 a12 12 0 1 1 -12 -12" fill="none" stroke="${WINE}" stroke-width="2.2" stroke-linecap="round"/></g></g>
  <g class="m-fx"></g>
</svg>`;
};

const applyState = (svg, s) => {
  const st = STATES[s];
  svg.dataset.state = s;
  svg.querySelectorAll("[data-on]").forEach(el => el.classList.toggle("on", el.dataset.on.split(" ").includes(s)));
  svg.querySelector(".m-head").style.transform = st.head;
  svg.querySelector(".m-dress").style.fill = st.dress;
  svg.querySelector(".m-halo").style.fill = st.halo;
};
const makeMascot = (el, id, s) => {
  el.innerHTML = mascotSVG(id);
  const svg = el.firstElementChild;
  requestAnimationFrame(() => applyState(svg, s));
  return svg;
};
