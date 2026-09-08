(function () {
  const KEY = "ringbeat-static-v3";
  const def = {
    lang: "ar", theme: "dark", voice: true, style: "boxing", mode: "bag",
    streak: 0, lastDay: "", sessions: [], savedCombos: [],
    timerRounds: 12, timerRoundSec: 180, timerRestSec: 60,
    contrast: false, large: false, motion: false, captions: true, haptic: true, bell: true,
    fightFilter: "all", liveFights: null, installDismiss: false,
  };
  let state = { ...def, ...(JSON.parse(localStorage.getItem(KEY) || "{}")) };
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const t = (k) => RB.t(state.lang, k);
  const nameOf = (id) => {
    const m = RB.MOVE_MAP[id];
    return m ? (state.lang === "ar" ? m.ar : m.en) : id;
  };
  const clock = (s) => {
    s = Math.max(0, Math.ceil(s));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  };
  const route = () => (location.hash.replace(/^#/, "") || "/");
  const isAr = () => state.lang === "ar";
  const fights = () => state.liveFights || RB.FIGHTS;

  const audio = {
    bell: new Audio("./bell.wav"),
    triple: new Audio("./bell-triple.wav"),
    clap: new Audio("./clapper.wav"),
  };
  Object.values(audio).forEach((a) => { a.preload = "auto"; a.volume = 0.9; });

  let deferredPrompt = null;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    render();
  });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; render(); });

  function applyChrome() {
    const html = document.documentElement;
    html.lang = state.lang;
    html.dir = isAr() ? "rtl" : "ltr";
    html.dataset.theme = state.theme;
    html.dataset.contrast = state.contrast ? "high" : "off";
    html.dataset.type = state.large ? "large" : "md";
    html.dataset.motion = state.motion ? "reduce" : "on";
    document.getElementById("ambient").classList.toggle("hidden", state.motion);
  }

  function vibrate(ms) {
    if (state.haptic && navigator.vibrate) navigator.vibrate(ms);
  }
  function live(msg) {
    const el = document.getElementById("live");
    if (el) el.textContent = msg;
  }
  function playBell(kind) {
    if (!state.bell) return;
    const a = kind === "end" ? audio.triple : kind === "warn" ? audio.clap : audio.bell;
    a.currentTime = 0;
    a.play().catch(() => {});
    vibrate(kind === "end" ? [80, 60, 80, 60, 160] : kind === "warn" ? [40, 30, 40] : 90);
  }
  function speak(text) {
    if (!state.voice || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = isAr() ? "ar-AE" : "en-US";
    speechSynthesis.speak(u);
  }

  function icon(name) {
    const p = {
      home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z",
      train: "M5 12h14M5 8h14M8 16h8",
      fights: "M7 8h3l2 3-2 3H7l-2-3 2-3zm10 0h-3l-2 3 2 3h3l2-3-2-3z",
      timer: "M12 7v5l3 2M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
      more: "M5 12h14M12 5l7 7-7 7",
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="${p[name]}"/></svg>`;
  }

  function nav(active) {
    const items = [
      ["/", "home", "home"],
      ["/train", "train", "train"],
      ["/fights", "fights", "fights"],
      ["/timer", "timer", "timer"],
      ["/more", "more", "more"],
    ];
    return `<nav class="nav" aria-label="${t("home")}">${items.map(([h, k, ic]) =>
      `<a href="#${h}" class="${active === h || (h !== "/" && active.startsWith(h)) ? "on" : ""}">${icon(ic)}<span>${t(k)}</span></a>`
    ).join("")}</nav>`;
  }

  function bag(hit, large) {
    return `<div class="bag ${large ? "lg" : ""} ${hit ? "hit" : ""}" aria-hidden="true"><i class="chain"></i><i class="collar"></i><i class="body"></i></div>`;
  }
  function dial(left, total, label, sub) {
    const r = 54, c = 2 * Math.PI * r;
    const p = total > 0 ? Math.min(1, Math.max(0, left / total)) : 0;
    return `<div class="dial" role="timer" aria-label="${label} ${clock(left)}">
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="8"/>
        <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${(c * p).toFixed(2)} ${c}"/>
      </svg>
      <div class="center"><div class="subtle">${label}</div><div class="dial-num">${clock(left)}</div>
      ${sub ? `<div class="subtle">${sub}</div>` : ""}</div>
    </div>`;
  }

  function weekMin() {
    const from = Date.now() - 7 * 24 * 3600 * 1000;
    return state.sessions.filter((s) => s.at >= from).reduce((a, s) => a + s.minutes, 0);
  }
  function todayKey() { return new Date().toISOString().slice(0, 10); }
  function logSession(title, minutes, workoutId) {
    const day = todayKey();
    if (state.lastDay !== day) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      state.streak = state.lastDay === y.toISOString().slice(0, 10) ? state.streak + 1 : 1;
      state.lastDay = day;
    }
    state.sessions = [{ id: String(Date.now()), title, minutes, at: Date.now(), workoutId }, ...state.sessions].slice(0, 60);
    save();
  }

  function featuredFight() {
    const now = Date.now();
    return fights().filter((f) => new Date(f.date).getTime() >= now - 86400000).sort((a, b) => new Date(a.date) - new Date(b.date))[0] || fights()[0];
  }
  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(isAr() ? "ar-AE" : "en-GB", { weekday: "short", day: "numeric", month: "short" });
    } catch { return iso; }
  }

  function installBar() {
    if (standalone || state.installDismiss) return "";
    return `<div class="install-bar" role="region" aria-label="${t("install")}">
      <div style="flex:1"><strong>${t("install")}</strong><div class="subtle" style="color:#ffd7d4">${t("installHint")}</div></div>
      <button class="btn gold" data-act="install">${t("install")}</button>
      <button class="btn icon" data-act="install-dismiss" aria-label="${t("later")}">×</button>
    </div>`;
  }

  function weekPlan() {
    const days = isAr() ? ["ح","ن","ث","ر","خ","ج","س"] : ["M","T","W","T","F","S","S"];
    const done = new Set(state.sessions.map((s) => new Date(s.at).getDay()));
    // JS getDay: 0 Sun
    const map = [1,2,3,4,5,6,0];
    return `<div class="week" aria-label="${t("plan")}">${days.map((d, i) =>
      `<i class="${done.has(map[i]) ? "on" : ""}">${d}</i>`).join("")}</div>`;
  }

  function home() {
    const f = featuredFight();
    return `${installBar()}
      <header class="row between">
        <div><div class="kicker">${t("bestAward")}</div><h1 class="title">${t("app")}</h1></div>
        <div class="row">
          <button class="btn icon" data-act="lang" aria-label="${t("language")}">${isAr() ? "EN" : "ع"}</button>
          <button class="btn icon" data-act="share-progress" aria-label="${t("shareProgress")}">${icon("more")}</button>
        </div>
      </header>
      <article class="hero mt">
        <img src="${photo("poster.jpg")}" alt="">
        <div class="shade"></div>
        <div class="copy">
          <div class="kicker">${t("theFight")} · ${fmtDate(f.date)}</div>
          <h2 class="title" style="font-size:2rem">${isAr() ? f.headlineAr : f.headlineEn}</h2>
          <p class="muted">${isAr() ? f.a.ar : f.a.en} · ${isAr() ? f.b.ar : f.b.en}</p>
          <a class="btn primary full mt-2" href="#/fights">${t("getTickets")}</a>
        </div>
      </article>
      <section class="grid-3 mt" aria-label="${t("stats")}">
        <div class="stat"><b>${state.streak}</b><span>${t("streak")}</span></div>
        <div class="stat"><b>${state.sessions.length}</b><span>${t("sessions")}</span></div>
        <div class="stat"><b>${weekMin()}</b><span>${t("minutes")}</span></div>
      </section>
      <h2 class="mt">${t("plan")}</h2>
      ${weekPlan()}
      <h2 class="mt">${t("chooseStyle")}</h2>
      <div class="wrap mt-2">
        ${["boxing","muaythai","kickboxing"].map((s) =>
          `<button class="chip ${state.style===s?"on":""}" data-act="style" data-v="${s}">${t(s)}</button>`).join("")}
        <button class="chip ${state.mode==="bag"?"on":""}" data-act="mode" data-v="bag">${t("bag")}</button>
        <button class="chip ${state.mode==="shadow"?"on":""}" data-act="mode" data-v="shadow">${t("shadow")}</button>
      </div>
      <a class="card row between mt" href="#/timer"><div><strong>${t("quickTimer")}</strong><div class="subtle">3:00 · 1:00 · 12</div></div></a>
      <div class="row between mt"><h2>${t("featured")}</h2><a class="muted" href="#/train">${t("train")}</a></div>
      <ul class="list mt-2">${RB.WORKOUTS.filter((w)=>w.style===state.style).slice(0,3).map(workoutCard).join("")}</ul>
      <h2 class="mt">${t("quotes")}</h2>
      <ul class="list mt-2">${(RB.QUOTES || []).slice(0, 4).map(quoteCard).join("")}</ul>
      ${nav("/")}`;
  }

  function photo(name, fallback) {
    const n = name || fallback || "f2.jpg";
    return `./${n}`;
  }
  function faceOf(person, fallback) {
    if (!person) return fallback || "f2.jpg";
    const fromMap = RB.fighterPhoto && RB.fighterPhoto(person.en || person.ar || "");
    return fromMap || person.img || fallback || "f2.jpg";
  }
  function isStock(name) {
    return !name || /^(f[123]|spar|poster|gloves|hero)\.jpg$/i.test(name);
  }
  function quoteCard(q) {
    return `<li class="card quote">
      <div class="row quote-row">
        <img class="avatar lg" src="${photo(q.img)}" alt="${q.name}">
        <div class="quote-body"><p>“${isAr() ? q.ar : q.en}”</p><div class="subtle mt-2">${q.name}</div></div>
      </div>
    </li>`;
  }
  function workoutCard(w) {
    const cover = w.mode === "shadow" ? "spar.jpg" : w.style === "muaythai" ? "hero.jpg" : "gloves.jpg";
    return `<li>
      <a class="wcard" href="#/workout/${w.id}">
        <span class="wcard-media"><img src="${photo(cover)}" alt=""></span>
        <span class="wcard-body">
          <strong>${isAr() ? w.ar : w.en}</strong>
          <p>${isAr() ? w.blurbAr : w.blurbEn}</p>
          <span class="wcard-meta">${t(w.level)} · ${w.rounds} ${t("rounds")}</span>
        </span>
      </a>
    </li>`;
  }

  function train() {
    const list = RB.WORKOUTS.filter((w) => w.style === state.style && w.mode === state.mode);
    return `<h1 class="title">${t("gymLike")}</h1><p class="muted">${t("diverse")}</p>
      <div class="wrap mt">${["boxing","muaythai","kickboxing"].map((s) =>
        `<button class="chip ${state.style===s?"on":""}" data-act="style" data-v="${s}">${t(s)}</button>`).join("")}
        <button class="chip ${state.mode==="bag"?"on":""}" data-act="mode" data-v="bag">${t("bag")}</button>
        <button class="chip ${state.mode==="shadow"?"on":""}" data-act="mode" data-v="shadow">${t("shadow")}</button>
      </div>
      <ul class="list mt">${list.length ? list.map(workoutCard).join("") : `<li class="card muted">${t("noWorkouts")}</li>`}</ul>
      ${nav("/train")}`;
  }

  let session = null, tick = null, punches = 0, startedAt = 0;
  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }

  function cue() {
    if (!session || !session.w) return;
    const combo = session.w.combos[session.comboIdx];
    const txt = combo.moves.map(nameOf).join(isAr() ? "، " : ", ");
    speak(txt);
    live(txt);
    punches += combo.moves.filter((m) => !["slip-l","slip-r","roll","guard"].includes(m)).length;
  }

  function startTick() {
    stopTick();
    tick = setInterval(() => {
      if (!session || !session.running) return;
      session.left -= 1;
      if (session.kind === "timer") {
        if (session.left === 10) playBell("warn");
        if (session.left <= 0) {
          if (session.phase === "work") {
            if (session.round >= state.timerRounds) {
              session.phase = "done"; session.running = false; stopTick(); playBell("end");
              logSession(isAr() ? "مؤقّت الجولات" : "Round timer", Math.max(1, Math.round(state.timerRounds * state.timerRoundSec / 60)), "timer");
            } else {
              session.phase = "rest"; session.left = state.timerRestSec; playBell("round");
            }
          } else {
            session.round += 1; session.phase = "work"; session.left = state.timerRoundSec; playBell("round");
          }
        }
        render();
        return;
      }
      if (session.phase === "work") {
        session.holdLeft -= 1;
        if (session.left === 10) playBell("warn");
        if (session.holdLeft <= 0) {
          session.comboIdx = (session.comboIdx + 1) % session.w.combos.length;
          session.holdLeft = session.w.combos[session.comboIdx].holdSec;
          session.hit = true;
          cue();
        }
      }
      if (session.left <= 0) {
        if (session.phase === "work") {
          if (session.round >= session.w.rounds) {
            session.phase = "done"; session.running = false; stopTick(); playBell("end");
            const mins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
            logSession(isAr() ? session.w.ar : session.w.en, mins, session.w.id);
          } else {
            session.phase = "rest"; session.left = session.w.restSec; playBell("round");
          }
        } else if (session.phase === "rest") {
          session.round += 1; session.phase = "work"; session.left = session.w.roundSec;
          session.comboIdx = 0; session.holdLeft = session.w.combos[0].holdSec; playBell("round"); cue();
        }
      }
      render();
      session.hit = false;
    }, 1000);
  }

  function workoutView(id) {
    const w = RB.WORKOUTS.find((x) => x.id === id);
    if (!w) return `<p class="muted">${t("noWorkouts")}</p><a href="#/train">${t("train")}</a>`;
    if (!session || session.w?.id !== id) {
      session = { w, phase: "ready", round: 1, left: w.roundSec, comboIdx: 0, holdLeft: w.combos[0].holdSec, running: false, hit: false };
      punches = 0; stopTick();
    }
    const combo = w.combos[session.comboIdx % w.combos.length];
    const cueTxt = combo.moves.map(nameOf).join(isAr() ? "، " : ", ");
    const next = w.combos[(session.comboIdx + 1) % w.combos.length].moves.map(nameOf).join(isAr() ? "، " : ", ");
    if (session.phase === "ready") {
      return `<div class="row between"><a class="btn icon" href="#/train" aria-label="${t("homeCta")}">←</a>
        <strong>${isAr()?w.ar:w.en}</strong>
        <button class="btn icon" data-act="share-workout" data-v="${w.id}" aria-label="${t("shareWorkout")}">${icon("more")}</button></div>
        <div class="center mt">${w.mode==="bag"?bag(false, true):`<img src="${photo("spar.jpg")}" alt="" style="border-radius:16px;height:9rem;width:100%;object-fit:cover">`}
        <p class="muted mt">${t(w.mode==="bag"?"prepare":"shadowHint")}</p>
        <p class="subtle">${w.rounds} ${t("rounds")} · ${clock(w.roundSec)} / ${clock(w.restSec)}</p>
        <button class="btn primary full mt" data-act="begin">${t("startWorkout")}</button></div>`;
    }
    if (session.phase === "done") {
      return `<div class="center mt"><img src="${photo("gloves.jpg")}" alt="" style="border-radius:16px;height:8rem;width:100%;object-fit:cover">
        <h1 class="title mt">${t("done")}</h1><p class="muted">${t("hunt")}</p>
        <p class="gold">${punches} ${t("punches")}</p>
        <button class="btn primary full mt" data-act="share-progress">${t("shareProgress")}</button>
        <a class="btn full mt-2" href="#/train">${t("again")}</a></div>`;
    }
    const total = session.phase === "rest" ? w.restSec : w.roundSec;
    const label = session.phase === "rest" ? t("rest") : `${t("round")} ${session.round} / ${w.rounds}`;
    const elapsed = session.phase === "work" ? w.roundSec - session.left : 0;
    const rate = elapsed > 5 ? Math.round(punches / (elapsed / 60 + (session.round-1) * (w.roundSec/60) || 1)) : punches * 6;
    return `<div class="row between"><a class="btn icon" href="#/train">←</a>
      <div class="center"><strong>${t("round")} ${session.round} / ${w.rounds}</strong></div>
      <button class="btn icon" data-act="voice" aria-label="${t("voiceCue")}">${state.voice ? "♪" : "×"}</button></div>
      <div class="stage">
        <h2 class="cue-line">${session.phase==="rest"?t("rest"):cueTxt}</h2>
        ${state.captions ? `<div class="caption" aria-live="polite">${session.phase==="work"? t("nextMove")+": "+next : t("hunt")}</div>` : ""}
        <div class="stage-ring">${w.mode==="bag"?bag(session.hit):""}${dial(session.left, total, label, t("combo")+" "+((session.comboIdx%w.combos.length)+1))}</div>
        <div class="hud">
          <div class="cell"><div class="subtle">${t("elapsed")}</div><div class="n">${clock(elapsed)}</div></div>
          <div class="cell"><div class="subtle">${t("punches")}</div><div class="n">${punches}</div></div>
        </div>
        <div class="work"><div class="subtle">${t("workRate")}</div><div class="n">${Math.min(180, rate)}</div></div>
        <div class="row" style="justify-content:center;gap:1.2rem">
          <button class="play" data-act="toggle" aria-label="${session.running?t("pause"):t("start")}">${session.running?"❚❚":"▶"}</button>
          <button class="btn icon" data-act="skip" aria-label="${t("skip")}">»</button>
        </div>
      </div>`;
  }

  function stepper(key, label, value, min, max, step, time) {
    return `<div class="card row between mt-2"><span class="muted">${label}</span>
      <div class="row">
        <button class="btn icon" data-act="step" data-k="${key}" data-d="${-step}" aria-label="-">−</button>
        <b class="dial-num" style="font-size:1.25rem;width:4.2rem;text-align:center">${time?clock(value):value}</b>
        <button class="btn icon" data-act="step" data-k="${key}" data-d="${step}" data-min="${min}" data-max="${max}" aria-label="+">+</button>
      </div></div>`;
  }

  function timerView() {
    const idle = !session || session.kind !== "timer" || session.phase === "idle" || session.phase === "done";
    if (idle) {
      return `<h1 class="title">${t("quickTimer")}</h1><p class="muted">${t("hunt")}</p>
        ${stepper("timerRounds", t("rounds"), state.timerRounds, 1, 15, 1)}
        ${stepper("timerRoundSec", t("roundLen"), state.timerRoundSec, 30, 300, 30, true)}
        ${stepper("timerRestSec", t("restLen"), state.timerRestSec, 15, 120, 15, true)}
        <button class="btn primary full mt" data-act="timer-start">${t("start")}</button>
        ${nav("/timer")}`;
    }
    const total = session.phase === "rest" ? state.timerRestSec : state.timerRoundSec;
    return `<h1 class="title">${t("quickTimer")}</h1>
      ${dial(session.left, total, session.phase==="rest"?t("rest"): session.round+" / "+state.timerRounds, clock(total))}
      <div class="row" style="justify-content:center;gap:1.2rem">
        <button class="play" data-act="toggle">${session.running?"❚❚":"▶"}</button>
      </div>
      ${nav("/timer")}`;
  }

  let draft = [];
  function builder() {
    const palette = RB.MOVES.filter((m) => m.styles.includes(state.style));
    return `<h1 class="title">${t("customizable")}</h1>
      <div class="card mt">${bag(false, true)}
        <p class="center mt-2">${draft.length ? draft.map(nameOf).join(isAr()?"، ":", ") : t("emptyCombo")}</p>
        <div class="wrap mt-2">${palette.map((m) =>
          `<button class="chip" data-act="add-move" data-v="${m.id}">${isAr()?m.ar:m.en}</button>`).join("")}</div>
        <div class="grid-2 mt"><button class="btn" data-act="clear-draft">${t("clearCombo")}</button>
        <button class="btn primary" data-act="save-draft">${t("saveCombo")}</button></div>
      </div>
      <h2 class="mt">${t("myCombos")}</h2>
      <ul class="list mt-2">${state.savedCombos.length ? state.savedCombos.map((c) =>
        `<li class="card row between"><span>${isAr()?c.nameAr:c.nameEn}</span>
         <span class="row"><button class="btn icon" data-act="share-combo" data-v="${c.id}" aria-label="${t("share")}">${icon("more")}</button>
         <button class="btn icon" data-act="del-combo" data-v="${c.id}" aria-label="${t("delete")}">✕</button></span></li>`).join("")
        : `<li class="card muted">${t("emptyCombo")}</li>`}</ul>
      ${nav("/more")}`;
  }

  function stats() {
    const last = state.sessions[0];
    return `<h1 class="title">${t("stats")}</h1>
      <div class="grid-2 mt"><div class="card"><div class="dial-num">${state.streak}</div><div class="subtle">${t("streak")}</div></div>
      <div class="card"><div class="dial-num">${weekMin()}</div><div class="subtle">${t("minutes")}</div></div></div>
      <button class="btn primary full mt" data-act="share-progress">${t("shareProgress")}</button>
      <h2 class="mt">${t("lastSession")}</h2>
      ${last ? `<div class="card mt-2"><strong>${last.title}</strong><div class="muted">${last.minutes} ${t("minutes")}</div></div>`
        : `<p class="muted mt-2">${t("noneYet")}</p>`}
      <ul class="list mt">${state.sessions.slice(0,12).map((s) =>
        `<li class="card row between"><span>${s.title}</span><span class="muted">${s.minutes}m</span></li>`).join("")}</ul>
      ${nav("/more")}`;
  }

  function fightCard(f) {
    const a = isAr() ? f.a.ar : f.a.en;
    const b = isAr() ? f.b.ar : f.b.en;
    const aFile = faceOf(f.a, f.kind === "boxing" ? "f3.jpg" : "f2.jpg");
    const bFile = faceOf(f.b, f.kind === "boxing" ? "f3.jpg" : "f1.jpg");
    const split = !isStock(aFile) || !isStock(bFile);
    const cover = split
      ? `<div class="fight-cover" aria-hidden="true">
           <img src="${photo(aFile)}" alt="">
           <img src="${photo(bFile)}" alt="">
           <span class="vs-pill">VS</span>
         </div>`
      : `<img class="cover" src="${photo(f.poster || "spar.jpg")}" alt="">`;
    return `<article class="card fight-card">
      ${cover}
      <div class="pad">
        <div class="subtle gold">${f.kind === "boxing" ? t("boxing") : t("mma")} · ${fmtDate(f.date)}</div>
        <h3 style="margin-top:0.2rem;text-transform:none">${isAr() ? f.headlineAr : f.headlineEn}</h3>
        <div class="vs mt-2">
          <div class="center"><img class="avatar" src="${photo(aFile)}" alt="${a}"><div>${a}</div></div>
          <div class="gold">VS</div>
          <div class="center"><img class="avatar" src="${photo(bFile)}" alt="${b}"><div>${b}</div></div>
        </div>
        <p class="subtle mt-2">${isAr() ? f.venueAr : f.venueEn} · ${isAr() ? f.weightAr : f.weightEn}</p>
        <a class="btn full mt-2" href="${f.source}" target="_blank" rel="noopener">${t("sources")}</a>
      </div>
    </article>`;
  }

  function fightsView() {
    const filter = state.fightFilter;
    let list = fights();
    if (filter === "mma") list = list.filter((f) => f.kind === "mma");
    if (filter === "boxing") list = list.filter((f) => f.kind === "boxing");
    return `${installBar()}
      <h1 class="title">${t("upcoming")}</h1>
      <p class="muted">${t("liveImport")} · ${RB.FIGHTS_UPDATED}</p>
      <h2 class="mt">${t("rankings")}</h2>
      <p class="subtle"><a href="https://www.ufc.com/rankings" target="_blank" rel="noopener">ufc.com/rankings</a></p>
      <div class="rank-row mt-2">${(RB.RANKINGS || []).map((r) =>
        `<div class="rank-item"><img src="${photo(r.img)}" alt="${isAr() ? r.ar : r.en}"><b>#${r.rank}</b>${isAr() ? r.ar : r.en}</div>`
      ).join("")}</div>
      <h2 class="mt">${t("rankingsW")}</h2>
      <div class="rank-row mt-2">${(RB.RANKINGS_W || []).map((r) =>
        `<div class="rank-item"><img src="${photo(r.img)}" alt="${isAr() ? r.ar : r.en}"><b>#${r.rank}</b>${isAr() ? r.ar : r.en}</div>`
      ).join("")}</div>
      <div class="wrap mt-2">
        <button class="chip ${filter==="all"?"on":""}" data-act="ffilter" data-v="all">${t("allFights")}</button>
        <button class="chip ${filter==="mma"?"on":""}" data-act="ffilter" data-v="mma">${t("mma")}</button>
        <button class="chip ${filter==="boxing"?"on":""}" data-act="ffilter" data-v="boxing">${t("boxing")}</button>
        <button class="chip" data-act="refresh-fights">${t("importLive")}</button>
      </div>
      <div id="fight-status" class="subtle mt-2"></div>
      <ul class="list mt">${list.map((f)=>`<li>${fightCard(f)}</li>`).join("")}</ul>
      <h2 class="mt">${t("sources")}</h2>
      <ul class="list mt-2">${RB.SOURCES.map((s)=>
        `<li><a class="card row between" href="${s.url}" target="_blank" rel="noopener"><span>${isAr()?s.ar:s.en}</span><span class="gold">↗</span></a></li>`
      ).join("")}</ul>
      ${nav("/fights")}`;
  }

  function moreView() {
    const tog = (key, label) =>
      `<button class="card row between" data-act="tog" data-k="${key}" aria-pressed="${state[key]}">
        <span>${label}</span><strong class="gold">${state[key] ? (isAr()?"تشغيل":"On") : (isAr()?"إيقاف":"Off")}</strong>
      </button>`;
    return `<h1 class="title">${t("more")}</h1>
      <button class="btn primary full mt" data-act="install">${t("install")}</button>
      <p class="subtle mt-2">${isiOS ? t("installIos") : t("installAndroid")}</p>
      <div class="grid-2 mt">
        <a class="card" href="#/builder"><strong>${t("builder")}</strong></a>
        <a class="card" href="#/stats"><strong>${t("stats")}</strong></a>
      </div>
      <h2 class="mt">${t("a11y")}</h2>
      <div class="list mt-2">
        ${tog("contrast", t("contrast"))}
        ${tog("large", t("largeType"))}
        ${tog("motion", t("reduceMotion"))}
        ${tog("captions", t("captions"))}
        ${tog("haptic", t("haptic"))}
        ${tog("voice", t("voiceCue"))}
        ${tog("bell", t("bell"))}
      </div>
      <div class="grid-2 mt">
        <button class="btn" data-act="lang">${t("language")}: ${isAr()?"AR":"EN"}</button>
        <button class="btn" data-act="theme">${t("theme")}</button>
      </div>
      <button class="btn full mt" data-act="share-progress">${t("shareProgress")}</button>
      ${nav("/more")}`;
  }

  function installSheet() {
    return `<div class="modal" data-act="close-modal" role="dialog" aria-label="${t("install")}">
      <div class="sheet" onclick="event.stopPropagation()">
        <h2>${t("install")}</h2>
        <p class="muted mt-2">${t("installHint")}</p>
        <p class="mt-2">${isiOS ? t("installIos") : t("installAndroid")}</p>
        <ol class="muted" style="padding-inline-start:1.2rem">
          ${isiOS
            ? (isAr()
              ? "<li>افتح في سفاري</li><li>اضغط زر المشاركة</li><li>إضافة إلى الشاشة الرئيسية</li>"
              : "<li>Open in Safari</li><li>Tap the Share button</li><li>Add to Home Screen</li>")
            : (isAr()
              ? "<li>اضغط تثبيت أدناه</li><li>أو قائمة المتصفح ← إضافة إلى الشاشة الرئيسية</li>"
              : "<li>Tap Install below</li><li>Or browser menu → Add to Home Screen</li>")}
        </ol>
        <button class="btn primary full mt" data-act="install-go">${t("install")}</button>
        <button class="btn full mt-2" data-act="close-modal">${t("close")}</button>
      </div>
    </div>`;
  }

  let showInstall = false;
  async function doInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      showInstall = false;
      render();
      return;
    }
    showInstall = true;
    render();
  }

  async function shareText(title, text) {
    const url = location.href.split("#")[0];
    const payload = { title, text: text + "\n" + url };
    try {
      if (navigator.share) { await navigator.share(payload); return; }
    } catch (e) {}
    try {
      await navigator.clipboard.writeText(payload.text);
      live(t("copied"));
      alert(t("copied"));
    } catch {
      prompt(t("share"), payload.text);
    }
  }

  function parseEspn(json, kind) {
    const out = [];
    for (const e of json.events || []) {
      const c0 = (e.competitions || [])[0] || {};
      const comps = c0.competitors || [];
      const names = comps.map((x) => (x.athlete || x.team || {}).displayName || "TBD");
      const aName = names[0] || "TBD";
      const bName = names[1] || "TBD";
      const aImg = RB.fighterPhoto ? RB.fighterPhoto(aName) : null;
      const bImg = RB.fighterPhoto ? RB.fighterPhoto(bName) : null;
      out.push({
        id: "live-" + e.id,
        sport: kind === "boxing" ? "boxing" : "ufc",
        kind: kind === "boxing" ? "boxing" : "mma",
        en: e.name, ar: e.shortName || e.name,
        headlineEn: names.slice(0, 2).join(" vs ") || e.shortName,
        headlineAr: names.slice(0, 2).join(" ضد ") || e.shortName,
        a: { en: aName, ar: aName, img: aImg || undefined },
        b: { en: bName, ar: bName, img: bImg || undefined },
        date: e.date,
        venueEn: (c0.venue || {}).fullName || "",
        venueAr: (c0.venue || {}).fullName || "",
        weightEn: (c0.type || {}).abbreviation || kind,
        weightAr: kind === "boxing" ? "ملاكمة" : "MMA",
        bouts: (e.competitions || []).length,
        ppv: false, broadcast: "ESPN",
        source: kind === "boxing" ? "https://www.espn.com/boxing/" : "https://ufctime.com/schedule",
        portrait: kind === "boxing" ? "f3.jpg" : "f2.jpg",
        poster: kind === "boxing" ? "poster.jpg" : "spar.jpg",
      });
    }
    return out;
  }

  async function refreshFights() {
    const status = document.getElementById("fight-status");
    if (status) status.textContent = isAr() ? "جاري الاستيراد…" : "Importing…";
    const urls = [
      ["https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard", "mma"],
      ["https://site.api.espn.com/apis/site/v2/sports/boxing/scoreboard", "boxing"],
    ];
    const live = [];
    for (const [url, kind] of urls) {
      try {
        const r = await fetch(url);
        if (r.ok) live.push(...parseEspn(await r.json(), kind));
      } catch (e) {}
    }
    if (live.length) {
      const baked = RB.FIGHTS.filter((f) => !live.some((l) =>
        (l.headlineEn || "").toLowerCase() === (f.headlineEn || "").toLowerCase()
        || ((l.a.en || "") + (l.b.en || "")).toLowerCase() === ((f.a.en || "") + (f.b.en || "")).toLowerCase()
      ));
      state.liveFights = [...baked, ...live];
      save();
      render();
      const s = document.getElementById("fight-status");
      if (s) s.textContent = (isAr() ? "تم الاستيراد: " : "Imported: ") + live.length;
    } else {
      const s = document.getElementById("fight-status");
      if (s) s.textContent = isAr() ? "تعذر الاتصال — عرض الجدول المحفوظ من UFC Time و Box.live" : "Offline — showing cached UFC Time & Box.live cards";
    }
  }

  function render() {
    applyChrome();
    const app = document.getElementById("app");
    const r = route();
    const hideNav = r.startsWith("/workout/");
    app.className = "shell" + (hideNav ? " player" : "");
    if (r === "/" || r === "") app.innerHTML = home();
    else if (r === "/train") app.innerHTML = train();
    else if (r === "/timer") app.innerHTML = timerView();
    else if (r === "/builder") app.innerHTML = builder();
    else if (r === "/stats") app.innerHTML = stats();
    else if (r === "/fights") app.innerHTML = fightsView();
    else if (r === "/more") app.innerHTML = moreView();
    else if (r.startsWith("/workout/")) app.innerHTML = workoutView(r.split("/")[2]);
    else app.innerHTML = home();
    if (showInstall) app.insertAdjacentHTML("beforeend", installSheet());
  }

  document.getElementById("app").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "lang") { state.lang = isAr() ? "en" : "ar"; save(); render(); }
    if (act === "theme") { state.theme = state.theme === "dark" ? "light" : "dark"; save(); render(); }
    if (act === "style") { state.style = b.dataset.v; save(); render(); }
    if (act === "mode") { state.mode = b.dataset.v; save(); render(); }
    if (act === "voice") { state.voice = !state.voice; save(); render(); }
    if (act === "ffilter") { state.fightFilter = b.dataset.v; save(); render(); }
    if (act === "install-dismiss") { state.installDismiss = true; save(); render(); }
    if (act === "install" || act === "install-go") { doInstall(); }
    if (act === "close-modal") { showInstall = false; render(); }
    if (act === "refresh-fights") refreshFights();
    if (act === "tog") { state[b.dataset.k] = !state[b.dataset.k]; save(); render(); }
    if (act === "begin" && session) {
      session.phase = "work"; session.running = true; session.round = 1;
      session.left = session.w.roundSec; session.comboIdx = 0;
      session.holdLeft = session.w.combos[0].holdSec; punches = 0; startedAt = Date.now();
      playBell("round"); cue(); startTick(); render();
    }
    if (act === "toggle" && session) {
      session.running = !session.running;
      if (session.running) startTick(); else stopTick();
      render();
    }
    if (act === "skip" && session && session.phase === "work" && session.w) {
      session.comboIdx = (session.comboIdx + 1) % session.w.combos.length;
      session.holdLeft = session.w.combos[session.comboIdx].holdSec;
      session.hit = true; cue(); render();
    }
    if (act === "step") {
      const k = b.dataset.k;
      const d = Number(b.dataset.d);
      const min = k.includes("Rounds") ? 1 : (k.includes("Rest") ? 15 : 30);
      const max = k.includes("Rounds") ? 15 : (k.includes("Rest") ? 120 : 300);
      state[k] = Math.min(max, Math.max(min, state[k] + d)); save(); render();
    }
    if (act === "timer-start") {
      session = { kind: "timer", phase: "work", round: 1, left: state.timerRoundSec, running: true };
      playBell("round"); startTick(); render();
    }
    if (act === "add-move") { draft = [...draft, b.dataset.v].slice(0, 10); render(); }
    if (act === "clear-draft") { draft = []; render(); }
    if (act === "save-draft" && draft.length) {
      const names = draft.map((id) => RB.MOVE_MAP[id]).filter(Boolean);
      state.savedCombos = [{
        id: String(Date.now()), moves: draft, holdSec: Math.max(6, draft.length * 2),
        nameEn: names.map((m) => m.en).join(", "), nameAr: names.map((m) => m.ar).join("، "),
      }, ...state.savedCombos].slice(0, 40);
      draft = []; save(); render();
    }
    if (act === "del-combo") { state.savedCombos = state.savedCombos.filter((c) => c.id !== b.dataset.v); save(); render(); }
    if (act === "share-progress") {
      const msg = isAr()
        ? `نبض الحلبة — سلسلتي ${state.streak} يوم، ${state.sessions.length} حصة، ${weekMin()} دقيقة هذا الأسبوع.`
        : `RingBeat — ${state.streak}-day streak, ${state.sessions.length} sessions, ${weekMin()} min this week.`;
      shareText(t("app"), msg);
    }
    if (act === "share-workout") {
      const w = RB.WORKOUTS.find((x) => x.id === b.dataset.v);
      if (w) shareText(isAr()?w.ar:w.en, (isAr()?w.blurbAr:w.blurbEn) + " · " + w.rounds + " " + t("rounds"));
    }
    if (act === "share-combo") {
      const c = state.savedCombos.find((x) => x.id === b.dataset.v);
      if (c) shareText(t("combo"), isAr()?c.nameAr:c.nameEn);
    }
  });

  window.addEventListener("hashchange", () => {
    if (!route().startsWith("/workout/") && !(session && session.kind === "timer" && route() === "/timer")) {
      stopTick();
      if (session && session.kind !== "timer") session = null;
    }
    showInstall = false;
    render();
  });

  function startAmbient() {
    const c = document.getElementById("dust");
    if (!c || state.motion) return;
    const ctx = c.getContext("2d");
    const pts = Array.from({ length: 48 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.3, s: Math.random() * 0.00035 + 0.00008,
    }));
    function loop() {
      if (state.motion) return;
      const w = c.width = c.clientWidth; const h = c.height = c.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,80,60,0.18)";
      pts.forEach((p) => {
        p.y -= p.s; if (p.y < 0) p.y = 1;
        ctx.beginPath(); ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2); ctx.fill();
      });
      requestAnimationFrame(loop);
    }
    loop();
  }

  applyChrome();
  render();
  startAmbient();
  if (route() === "/fights") refreshFights();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
