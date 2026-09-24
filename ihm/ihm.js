// =========================================================
// HR AUTOMATION — IHM (versão de teste)
// Boot, navegação por telas (F1–F7), som de toque, alarmes
// e uma UTA simulada com malha PI.
// =========================================================
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const pad = (n) => String(n).padStart(2, "0");
  const timeText = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const dateText = (d = new Date()) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const safe = (fn, fallback) => {
    try { return fn(); } catch (e) { return fallback; }
  };

  $("#year").textContent = new Date().getFullYear();

  /* ---------------------------------------------------------
     Som de toque (bipe curto, como uma IHM real)
  --------------------------------------------------------- */
  const soundBtn = $("#soundBtn");
  let soundOn = safe(() => localStorage.getItem("hr-ihm-sound"), null) !== "0";
  let audioCtx = null;
  function beep(freq = 2300, dur = 0.04, gain = 0.03) {
    if (!soundOn) return;
    safe(() => {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const amp = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      amp.gain.setValueAtTime(gain, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(amp).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur);
    });
  }
  const syncSound = () => soundBtn.setAttribute("aria-pressed", String(soundOn));
  syncSound();
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    safe(() => localStorage.setItem("hr-ihm-sound", soundOn ? "1" : "0"));
    syncSound();
    beep();
  });
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".hb, .fkey, .li, .tgl, .seg__b, .evt__ack, .tb__alarm, .eq[data-go], .boot")) beep();
  });

  /* ---------------------------------------------------------
     LEDs da carcaça
  --------------------------------------------------------- */
  const ledCom = $("#ledCom");
  const ledAlm = $("#ledAlm");
  let comTimer = 0;
  function comPulse() {
    ledCom.classList.add("is-on");
    clearTimeout(comTimer);
    comTimer = setTimeout(() => ledCom.classList.remove("is-on"), 90);
  }
  setInterval(() => { if (Math.random() < 0.55) comPulse(); }, 420);

  /* ---------------------------------------------------------
     Eventos e alarmes
  --------------------------------------------------------- */
  const evtBar = $("#evtBar");
  const evtTag = $("#evtTag");
  const evtTime = $("#evtTime");
  const evtMsg = $("#evtMsg");
  const liveLog = $("#liveLog");
  const alarmBtn = $("#alarmBtn");
  const alarmCount = $("#alarmCount");

  function logEvent(msg, level = "info") {
    const t = timeText();
    evtBar.classList.toggle("is-alarm", level === "alarm");
    evtBar.classList.toggle("is-ok", level === "ok");
    evtTag.textContent = level === "alarm" ? "ALARME" : level === "ok" ? "NORMAL" : "INFO";
    evtTime.textContent = t;
    evtMsg.textContent = msg;
    evtMsg.classList.remove("is-new");
    void evtMsg.offsetWidth;
    evtMsg.classList.add("is-new");

    const li = document.createElement("li");
    if (level !== "info") li.className = `is-${level}`;
    li.innerHTML = "<time></time><span></span>";
    li.firstChild.textContent = t;
    li.lastChild.textContent = msg;
    liveLog.prepend(li);
    while (liveLog.children.length > 6) liveLog.lastChild.remove();
    comPulse();
  }

  const alarm = { active: false, acked: true };
  function renderAlarm() {
    alarmCount.textContent = alarm.active ? "1" : "0";
    alarmBtn.classList.toggle("has-alarm", alarm.active);
    alarmBtn.classList.toggle("is-unacked", alarm.active && !alarm.acked);
    ledAlm.classList.toggle("is-on", alarm.active);
    ledAlm.classList.toggle("is-blink", alarm.active && !alarm.acked);
  }
  $("#ackBtn").addEventListener("click", () => {
    if (alarm.active && !alarm.acked) {
      alarm.acked = true;
      logEvent("Alarme reconhecido pelo operador");
      renderAlarm();
    }
  });

  /* ---------------------------------------------------------
     Navegação por telas (teclas F1–F7, teclado 1–7, #hash)
  --------------------------------------------------------- */
  const views = $$(".view");
  const viewIds = views.map((v) => v.id);
  const fkeys = $$(".fkey");
  const fkeyBar = $(".fkeys");
  const scrNum = $("#scrNum");
  const scrTitle = $("#scrTitle");
  const loadBar = $("#loadBar");
  const enterHooks = {};
  let current = null;

  function show(id, { fromHash = false } = {}) {
    if (!viewIds.includes(id)) id = "inicio";
    if (id === current) return;
    current = id;
    const view = document.getElementById(id);
    views.forEach((v) => v.classList.toggle("is-active", v === view));
    fkeys.forEach((k) => {
      const on = k.dataset.go === id;
      k.classList.toggle("is-active", on);
      if (on) {
        k.setAttribute("aria-current", "page");
        fkeyBar.scrollLeft = k.offsetLeft - (fkeyBar.clientWidth - k.offsetWidth) / 2;
      } else {
        k.removeAttribute("aria-current");
      }
    });
    scrNum.textContent = view.dataset.num;
    scrTitle.textContent = view.dataset.title;
    view.scrollTop = 0;
    loadBar.classList.remove("is-loading");
    void loadBar.offsetWidth;
    loadBar.classList.add("is-loading");
    if (!fromHash && location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
    if (enterHooks[id]) enterHooks[id]();
    comPulse();
  }

  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) {
      e.preventDefault();
      show(go.dataset.go);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!started || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest("input, textarea")) return;
    const go = e.target.closest(".eq[data-go]");
    if (go && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      show(go.dataset.go);
      return;
    }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= viewIds.length) {
      beep();
      show(viewIds[n - 1]);
    }
  });
  window.addEventListener("hashchange", () => show(location.hash.slice(1), { fromHash: true }));
  alarmBtn.addEventListener("click", () => show("supervisorio"));

  /* ---------------------------------------------------------
     Relógio
  --------------------------------------------------------- */
  const clockDate = $("#clockDate");
  const clockTime = $("#clockTime");
  const tick = () => {
    const d = new Date();
    clockDate.textContent = dateText(d);
    clockTime.textContent = timeText(d);
  };
  tick();
  setInterval(tick, 1000);

  /* ---------------------------------------------------------
     F1 · Visão geral — contadores, máquina de escrever, cargas
  --------------------------------------------------------- */
  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || "0", 10);
    if (reduceMotion) { el.textContent = target.toFixed(dec); return; }
    const t0 = performance.now();
    const dur = 1400;
    const frame = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = (target * (1 - Math.pow(1 - p, 3))).toFixed(dec);
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  let countedHome = false;
  enterHooks.inicio = () => {
    if (countedHome) return;
    countedHome = true;
    $$("[data-count]").forEach(countUp);
  };

  const typeEl = $("#typeLine");
  const phrases = [
    "Controle total da sua climatização.",
    "Engenharia elétrica de confiança.",
    "BMS, supervisório e protocolos abertos.",
    "Automação de precisão para HVAC.",
  ];
  if (reduceMotion) {
    typeEl.textContent = phrases[0];
  } else {
    let p = 0;
    let c = 0;
    let deleting = false;
    const typeStep = () => {
      const phrase = phrases[p];
      if (!deleting) {
        c += 1;
        typeEl.textContent = phrase.slice(0, c);
        if (c === phrase.length) { deleting = true; setTimeout(typeStep, 2400); return; }
        setTimeout(typeStep, 42);
      } else {
        c -= 1;
        typeEl.textContent = phrase.slice(0, c);
        if (c === 0) { deleting = false; p = (p + 1) % phrases.length; setTimeout(typeStep, 300); return; }
        setTimeout(typeStep, 16);
      }
    };
    setTimeout(typeStep, 900);
  }

  const eqBars = $$("[data-eq]").map((bar) => ({
    bar, val: bar.parentElement.nextElementSibling, load: parseFloat(bar.dataset.eq),
  }));
  const eqUta = $("#eqUta");
  const eqUtaVal = $("#eqUtaVal");
  const renderEq = () => {
    eqBars.forEach((e) => {
      e.bar.style.transform = `scaleX(${e.load / 100})`;
      e.val.textContent = `${Math.round(e.load)}%`;
    });
  };
  renderEq();
  setInterval(() => {
    if (current !== "inicio") return;
    eqBars.forEach((e) => { if (e.load > 0) e.load = clamp(e.load + (Math.random() - 0.5) * 8, 35, 95); });
    renderEq();
  }, 1400);

  /* ---------------------------------------------------------
     F2 · Soluções — mestre/detalhe
  --------------------------------------------------------- */
  const solItems = $$(".li[data-sol]");
  const solPanels = $$(".sol[data-sol]");
  const solHead = $("#solHead");
  let solIndex = 0;
  function selectSol(n, focus) {
    solIndex = n;
    solItems.forEach((li, i) => {
      li.classList.toggle("is-active", i === n);
      li.setAttribute("aria-selected", String(i === n));
      li.tabIndex = i === n ? 0 : -1;
    });
    solPanels.forEach((s, i) => s.classList.toggle("is-active", i === n));
    solHead.textContent = `MÓDULO ${pad(n + 1)}`;
    if (focus) solItems[n].focus();
    comPulse();
  }
  solItems.forEach((li, i) => li.addEventListener("click", () => selectSol(i)));
  $(".lst").addEventListener("keydown", (e) => {
    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    selectSol((solIndex + d + solItems.length) % solItems.length, true);
  });
  selectSol(0);

  /* ---------------------------------------------------------
     F3 · Supervisório — UTA simulada com malha PI
  --------------------------------------------------------- */
  const el = {
    temp: $("#kTemp"), tempBox: $("#kTemp").closest(".nd"), sp: $("#kSp"), valve: $("#kValve"), fan: $("#kFan"), power: $("#kPower"),
    sValve: $("#sValve"), sCoil: $("#sCoil"), sFan: $("#sFan"), sSupply: $("#sSupply"),
    status: $("#liveStatus"), rotor: $("#fanRotor"), coil: $("#coilGroup"),
    trendT: $("#trendTemp"), trendSp: $("#trendSp"), trendArea: $("#trendArea"), trendAlm: $("#trendAlm"),
    load: $("#liveLoad"), slider: $("#valveSlider"), modeAuto: $("#modeAuto"), modeMan: $("#modeMan"),
  };
  const airLines = $$(".flow--air");
  const waterLines = $$(".flow--water");

  const SIM_SPEED = 3;            // segundos simulados por segundo real
  const KP = 25, KI = 4;          // ganhos PI (% por °C, % por °C·s)
  const SP_MIN = 18, SP_MAX = 28;
  const T_LO = 18, T_HI = 30;     // faixa do gráfico (igual aos rótulos do eixo)
  const HISTORY = 150;            // uma amostra a cada 200 ms → janela de 30 s
  const ALARM_ON = 1.0;           // °C acima do setpoint para disparar
  const ALARM_OFF = 0.6;          // °C acima do setpoint para normalizar
  const ALARM_INHIBIT = 15;       // s simulados sem alarme após partida ou troca de setpoint

  const s = {
    T: 26.5, sp: 23, integ: 0, valve: 0, fan: 35, tOut: 32, supply: 26, load: 0,
    mode: "auto", manValve: 0,
    t: 0, changedAt: 0, settledFor: 0, settled: false, hiFor: 0,
    fanAngle: 0, airOffset: 0, waterOffset: 0,
  };
  const histT = new Array(HISTORY).fill(s.T);
  const histSp = new Array(HISTORY).fill(s.sp);

  function markChange() {
    s.settled = false;
    s.settledFor = 0;
    s.changedAt = s.t;
  }

  function step(dt) {
    s.t += dt;
    s.load = Math.max(0, s.load - dt * 0.1);
    s.tOut = 32 + 1.5 * Math.sin(s.t / 25) + s.load;
    const e = s.T - s.sp;

    if (s.mode === "auto") {
      const raw = KP * e + KI * s.integ;
      if (!((raw >= 100 && e > 0) || (raw <= 0 && e < 0))) s.integ += e * dt;
      s.valve = clamp(KP * e + KI * s.integ, 0, 100);
    } else {
      s.valve = s.manValve;
      s.integ = (s.valve - KP * e) / KI; // transferência sem solavanco ao voltar para AUTO
    }
    s.fan = 35 + 0.65 * s.valve;
    s.T += (0.05 * (s.tOut - s.T) - 0.9 * (s.valve / 100)) * dt;
    s.supply = 0.3 * s.tOut + 0.7 * s.T - 13 * (s.valve / 100);

    if (s.mode === "auto") {
      if (Math.abs(e) < 0.15) s.settledFor += dt;
      else s.settledFor = 0;
      if (!s.settled && s.settledFor > 6) {
        s.settled = true;
        logEvent(`Setpoint atingido em ${((s.t - s.changedAt - 6) / SIM_SPEED).toFixed(1)} s`, "ok");
      } else if (s.settled && Math.abs(e) > 0.4) {
        markChange();
        logEvent("Desvio detectado · controle PI compensando");
      }
    }

    if (e > ALARM_ON && s.t - s.changedAt > ALARM_INHIBIT) s.hiFor += dt;
    else s.hiFor = 0;
    if (!alarm.active && s.hiFor > 2) {
      alarm.active = true;
      alarm.acked = false;
      logEvent(`Temperatura alta · UTA-01 · ${s.T.toFixed(1)} °C`, "alarm");
      beep(880, 0.18, 0.04);
      renderAlarm();
    } else if (alarm.active && e < ALARM_OFF) {
      alarm.active = false;
      logEvent("Temperatura normalizada · UTA-01", "ok");
      renderAlarm();
    }
  }

  const toY = (v) => (150 * (1 - (clamp(v, T_LO, T_HI) - T_LO) / (T_HI - T_LO))).toFixed(1);
  const toPoints = (arr) => arr.map((v, i) => `${((i / (HISTORY - 1)) * 600).toFixed(1)},${toY(v)}`).join(" ");
  function sample() {
    histT.push(s.T + (Math.random() - 0.5) * 0.06);
    histT.shift();
    histSp.push(s.sp);
    histSp.shift();
    if (current !== "supervisorio") return;
    drawTrend();
  }
  function drawTrend() {
    const pts = toPoints(histT);
    el.trendT.setAttribute("points", pts);
    el.trendArea.setAttribute("points", `${pts} 600,150 0,150`);
    el.trendSp.setAttribute("points", toPoints(histSp));
    el.trendAlm.setAttribute("points", toPoints(histSp.map((v) => v + ALARM_ON)));
  }

  function renderSup() {
    const valve = Math.round(s.valve);
    const fan = Math.round(s.fan);
    el.temp.textContent = s.T.toFixed(1);
    el.tempBox.classList.toggle("is-alarm", alarm.active);
    el.valve.textContent = `${valve}%`;
    el.fan.textContent = `${fan}%`;
    el.power.textContent = (3.2 + 14 * (s.valve / 100) + 7 * Math.pow(s.fan / 100, 3)).toFixed(1);
    el.sValve.textContent = `${valve}%`;
    el.sCoil.textContent = `${valve}% abertura`;
    el.sFan.textContent = `${Math.round(fan * 17.5)} rpm`;
    el.sSupply.textContent = `${s.supply.toFixed(1)} °C`;
    el.coil.style.opacity = 0.3 + 0.7 * (s.valve / 100);
    if (s.mode === "auto") el.slider.value = valve;
    el.slider.style.setProperty("--fill", `${el.slider.value}%`);

    let label = "AJUSTANDO";
    let cls = "is-adjusting";
    if (alarm.active) { label = "ALARME"; cls = "is-alarm"; }
    else if (s.mode === "man") { label = "MANUAL"; cls = "is-adjusting"; }
    else if (s.settled) { label = "EM REGIME"; cls = "is-stable"; }
    el.status.textContent = label;
    el.status.className = `pill ${cls}`;
    el.load.disabled = s.load > 6;
  }

  function animateSchematic(dt) {
    s.fanAngle = (s.fanAngle + dt * s.fan * 7) % 360;
    s.airOffset -= dt * (20 + s.fan * 1.2);
    s.waterOffset -= dt * s.valve * 0.8;
    el.rotor.setAttribute("transform", `rotate(${s.fanAngle.toFixed(1)} 380 155)`);
    airLines.forEach((l) => { l.style.strokeDashoffset = s.airOffset; });
    waterLines.forEach((l) => { l.style.strokeDashoffset = s.waterOffset; });
  }

  let simRunning = false;
  let simStarted = false;
  let last = 0;
  let sampleAcc = 0;
  let uiAcc = 0;
  function frame(now) {
    if (!simRunning) return;
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    for (let sim = dt * SIM_SPEED; sim > 0; sim -= 0.05) step(Math.min(sim, 0.05));
    if ((sampleAcc += dt) >= 0.2) { sampleAcc = 0; sample(); }
    if ((uiAcc += dt) >= 0.1) {
      uiAcc = 0;
      if (current === "supervisorio") renderSup();
      if (current === "inicio") {
        eqUta.style.transform = `scaleX(${s.valve / 100})`;
        eqUtaVal.textContent = `${Math.round(s.valve)}%`;
      }
    }
    if (current === "supervisorio" && !reduceMotion) animateSchematic(dt);
    requestAnimationFrame(frame);
  }
  function syncSim() {
    const should = simStarted && !document.hidden;
    if (should === simRunning) return;
    simRunning = should;
    if (simRunning) {
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }
  function startSim() {
    simStarted = true;
    markChange();
    syncSim();
  }
  document.addEventListener("visibilitychange", syncSim);
  enterHooks.supervisorio = () => { renderSup(); drawTrend(); };

  const nudgeSetpoint = (delta) => {
    const next = clamp(s.sp + delta, SP_MIN, SP_MAX);
    if (next === s.sp) return;
    s.sp = next;
    el.sp.textContent = s.sp.toFixed(1);
    markChange();
    logEvent(`Setpoint alterado para ${s.sp.toFixed(1)} °C`);
  };
  $("#spDown").addEventListener("click", () => nudgeSetpoint(-0.5));
  $("#spUp").addEventListener("click", () => nudgeSetpoint(0.5));

  function setMode(mode) {
    if (mode === s.mode) return;
    s.mode = mode;
    const man = mode === "man";
    el.modeAuto.classList.toggle("is-on", !man);
    el.modeMan.classList.toggle("is-on", man);
    el.modeAuto.setAttribute("aria-pressed", String(!man));
    el.modeMan.setAttribute("aria-pressed", String(man));
    el.slider.disabled = !man;
    if (man) {
      s.manValve = Math.round(s.valve);
      el.slider.value = s.manValve;
      logEvent("Modo MANUAL · operador assume a válvula");
    } else {
      markChange();
      logEvent("Modo AUTOMÁTICO · controle PI ativo");
    }
    renderSup();
  }
  el.modeAuto.addEventListener("click", () => setMode("auto"));
  el.modeMan.addEventListener("click", () => setMode("man"));
  el.slider.addEventListener("input", () => {
    s.manValve = parseInt(el.slider.value, 10);
    el.slider.style.setProperty("--fill", `${el.slider.value}%`);
  });
  el.slider.addEventListener("change", () => logEvent(`Válvula ajustada manualmente para ${el.slider.value}%`));
  el.load.addEventListener("click", () => {
    s.load = 12;
    el.load.disabled = true;
    logEvent("Pico de carga térmica simulado");
  });

  /* ---------------------------------------------------------
     F4 · Diferenciais — autodiagnóstico
  --------------------------------------------------------- */
  const diagRows = $$("[data-diag]");
  const diagRun = $("#diagRun");
  const diagMsg = $("#diagMsg");
  const diagSummary = $("#diagSummary");
  let diagBusy = false;
  let diagDone = false;
  function runDiag() {
    if (diagBusy) return;
    diagBusy = true;
    diagRun.disabled = true;
    diagMsg.textContent = "Executando autodiagnóstico…";
    diagSummary.textContent = `0/${diagRows.length}`;
    const dur = reduceMotion ? 0 : 850;
    diagRows.forEach((row) => {
      row.classList.remove("is-testing", "is-ok");
      const bar = $(".diag__bar span", row);
      bar.style.transition = "none";
      bar.style.transform = "scaleX(0)";
      $(".diag__state", row).textContent = "AGUARDANDO";
    });
    let i = 0;
    const next = () => {
      if (i >= diagRows.length) {
        diagBusy = false;
        diagDone = true;
        diagRun.disabled = false;
        diagRun.textContent = "Executar novamente";
        diagMsg.textContent = `${diagRows.length}/${diagRows.length} verificações aprovadas · sistema íntegro`;
        logEvent("Autodiagnóstico concluído · 4/4 OK", "ok");
        return;
      }
      const row = diagRows[i];
      const bar = $(".diag__bar span", row);
      row.classList.add("is-testing");
      $(".diag__state", row).textContent = "TESTANDO";
      void bar.offsetWidth;
      bar.style.transition = `transform ${dur}ms linear`;
      bar.style.transform = "scaleX(1)";
      setTimeout(() => {
        row.classList.remove("is-testing");
        row.classList.add("is-ok");
        $(".diag__state", row).textContent = "OK";
        beep(3100, 0.03, 0.02);
        i += 1;
        diagSummary.textContent = `${i}/${diagRows.length}`;
        next();
      }, dur);
    };
    next();
  }
  diagRun.addEventListener("click", runDiag);
  enterHooks.diferenciais = () => { if (!diagDone) runDiag(); };

  /* ---------------------------------------------------------
     F5 · Setores — leituras ao vivo
  --------------------------------------------------------- */
  const zoneVals = $$(".zone__val");
  const renderZones = () => zoneVals.forEach((z) => {
    const v = parseFloat(z.dataset.base) + (Math.random() - 0.5) * 0.4;
    z.textContent = `${v.toFixed(1)} °C`;
  });
  renderZones();
  setInterval(() => { if (current === "setores") renderZones(); }, 1500);

  /* ---------------------------------------------------------
     F6 · Rede — atividade de comunicação
  --------------------------------------------------------- */
  const chips = $$(".chip");
  const protoRows = $$("#protoRows tr").map((tr) => {
    const leds = $$(".led", tr);
    const cnt = $(".num", tr);
    const row = { tx: leds[0], rx: leds[1], cnt, n: 8000 + Math.floor(Math.random() * 80000) };
    cnt.textContent = row.n.toLocaleString("pt-BR");
    return row;
  });
  setInterval(() => {
    if (current !== "rede") return;
    for (let k = 0; k < 3; k += 1) {
      const chip = chips[Math.floor(Math.random() * chips.length)];
      chip.classList.add("is-tx");
      setTimeout(() => chip.classList.remove("is-tx"), 110);
    }
    protoRows.forEach((r) => {
      r.tx.classList.toggle("is-on", Math.random() < 0.45);
      r.rx.classList.toggle("is-on", Math.random() < 0.45);
      if (Math.random() < 0.6) {
        r.n += 1 + Math.floor(Math.random() * 4);
        r.cnt.textContent = r.n.toLocaleString("pt-BR");
      }
    });
  }, 140);

  /* ---------------------------------------------------------
     F7 · Orçamento — gera o e-mail da solicitação
  --------------------------------------------------------- */
  const form = $("#quoteForm");
  const formMsg = $("#formMsg");
  const toggles = $$(".tgl");
  const osNum = String(1000 + Math.floor(Math.random() * 9000));
  $("#osNum").textContent = osNum;
  toggles.forEach((t) => t.addEventListener("click", () => {
    t.setAttribute("aria-pressed", String(t.getAttribute("aria-pressed") !== "true"));
  }));
  $("#solCta").addEventListener("click", () => {
    toggles[solIndex].setAttribute("aria-pressed", "true");
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const get = (k) => String(data.get(k) || "").trim();
    let ok = true;
    ["nome", "contato"].forEach((k) => {
      const field = form.elements[k].closest(".in");
      const missing = !get(k);
      field.classList.toggle("is-invalid", missing);
      if (missing) ok = false;
    });
    if (!ok) {
      formMsg.textContent = "Preencha nome e contato para continuar.";
      formMsg.className = "form__msg mono is-error";
      beep(620, 0.16, 0.04);
      return;
    }
    const services = toggles.filter((t) => t.getAttribute("aria-pressed") === "true").map((t) => t.textContent);
    const body = [
      `Nome: ${get("nome")}`,
      `Empresa: ${get("empresa") || "-"}`,
      `Contato: ${get("contato")}`,
      `Cidade/UF: ${get("cidade") || "-"}`,
      `Serviços: ${services.length ? services.join(", ") : "-"}`,
      "",
      get("mensagem"),
    ].join("\n");
    const subject = `Solicitação de orçamento OS-${osNum} — ${get("nome")}`;
    formMsg.textContent = `Solicitação OS-${osNum} preparada no seu aplicativo de e-mail.`;
    formMsg.className = "form__msg mono is-ok";
    logEvent(`Solicitação OS-${osNum} gerada`, "ok");
    window.location.href = `mailto:contato@hrautomation.com.br?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
  $$(".in input").forEach((input) => input.addEventListener("input", () => input.closest(".in").classList.remove("is-invalid")));

  /* ---------------------------------------------------------
     Boot
  --------------------------------------------------------- */
  const boot = $("#boot");
  const ui = $("#ui");
  const bootLog = $("#bootLog");
  const bootBar = $("#bootBar");
  const bootStart = $("#bootStart");
  const bootLines = [
    ["HR-OS 4.2 · IHM-01 · TOUCH 15\"", ""],
    ["Autoteste de hardware", "OK"],
    ["Memória 2048 MB", "OK"],
    ["Driver Modbus RTU/TCP", "OK"],
    ["Driver BACnet/IP", "OK"],
    ["Conexão CLP-01 · 192.168.0.10", "OK"],
    ["Projeto HR_HVAC.prj", "OK"],
  ];
  const bootLine = ([label, st]) =>
    st ? `${label} ${".".repeat(Math.max(3, 38 - label.length))} <span class="ok">${st}</span>` : label;

  let started = false;
  function startUI(animated) {
    if (started) return;
    started = true;
    safe(() => sessionStorage.setItem("hr-ihm-booted", "1"));
    if (animated) {
      boot.classList.add("is-leaving");
      setTimeout(() => { boot.hidden = true; }, 380);
      ui.classList.add("is-entering");
    } else {
      boot.hidden = true;
    }
    ui.hidden = false;
    show(location.hash.slice(1), { fromHash: true });
    logEvent("Sessão iniciada · operador conectado");
    startSim();
  }

  const alreadyBooted = safe(() => sessionStorage.getItem("hr-ihm-booted"), null) === "1";
  if (alreadyBooted || reduceMotion) {
    startUI(false);
  } else {
    let i = 0;
    const html = [];
    const typeNext = () => {
      if (i < bootLines.length) {
        html.push(bootLine(bootLines[i]));
        bootLog.innerHTML = html.join("\n");
        i += 1;
        bootBar.style.transform = `scaleX(${i / bootLines.length})`;
        setTimeout(typeNext, i === 1 ? 420 : 240);
      } else {
        bootStart.hidden = false;
        bootStart.focus({ preventScroll: true });
        setTimeout(() => startUI(true), 7000);
      }
    };
    setTimeout(typeNext, 500);
    boot.addEventListener("click", () => { if (!bootStart.hidden) startUI(true); });
  }
})();
