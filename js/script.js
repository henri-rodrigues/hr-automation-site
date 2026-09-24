// =========================================================
// HR AUTOMATION — interactions & scroll-driven animations
// =========================================================
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("year").textContent = new Date().getFullYear();

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  /* ---------------------------------------------------------
     Header + scroll progress: one rAF-throttled scroll handler
  --------------------------------------------------------- */
  const header = document.getElementById("siteHeader");
  const progressFill = document.getElementById("scrollProgress");
  let scrollTicking = false;
  const updateOnScroll = () => {
    header.classList.toggle("scrolled", window.scrollY > 40);
    const h = document.documentElement;
    const scrolled = h.scrollTop / (h.scrollHeight - h.clientHeight);
    progressFill.style.transform = `scaleX(${Math.min(Math.max(scrolled, 0), 1)})`;
    scrollTicking = false;
  };
  const onScroll = () => {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(updateOnScroll);
    }
  };
  updateOnScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------------------------------------------------------
     Mobile menu toggle
  --------------------------------------------------------- */
  const menuToggle = document.getElementById("menuToggle");
  const siteNav = document.getElementById("siteNav");
  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      const open = siteNav.classList.toggle("nav-open");
      menuToggle.classList.toggle("is-active", open);
    });
    siteNav.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        siteNav.classList.remove("nav-open");
        menuToggle.classList.remove("is-active");
      })
    );
  }

  /* ---------------------------------------------------------
     Cursor glow (desktop only)
  --------------------------------------------------------- */
  const cursorGlow = document.querySelector(".cursor-glow");
  if (window.matchMedia("(hover: hover)").matches && cursorGlow) {
    let mouseX = 0;
    let mouseY = 0;
    let glowTicking = false;
    const updateGlow = () => {
      cursorGlow.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%,-50%)`;
      glowTicking = false;
    };
    window.addEventListener("mousemove", (e) => {
      cursorGlow.classList.add("active");
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!glowTicking) {
        glowTicking = true;
        requestAnimationFrame(updateGlow);
      }
    });
    window.addEventListener("mouseleave", () => cursorGlow.classList.remove("active"));
  }

  /* ---------------------------------------------------------
     Magnetic buttons
  --------------------------------------------------------- */
  if (window.matchMedia("(hover: hover)").matches && !reduceMotion) {
    document.querySelectorAll(".magnetic").forEach((btn) => {
      btn.addEventListener("mousemove", (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        gsap.to(btn, { x: x * 0.25, y: y * 0.4, duration: 0.4, ease: "power3.out" });
      });
      btn.addEventListener("mouseleave", () => {
        gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" });
      });
    });
  }

  /* ---------------------------------------------------------
     Hero title reveal + eyebrow/subtitle/cta stagger
  --------------------------------------------------------- */
  if (window.gsap) {
    gsap.set(".reveal-inner", { yPercent: 110 });
    const heroTl = gsap.timeline({ delay: 0.15 });
    heroTl
      .to(".hero__eyebrow", { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" })
      .to(".reveal-inner", { yPercent: 0, duration: 1, stagger: 0.12, ease: "power4.out" }, "-=0.35")
      .to("[data-delay='0.3']", { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, "-=0.5")
      .to("[data-delay='0.45']", { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, "-=0.55")
      .to("[data-delay='0.6']", { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, "-=0.55");
  }

  /* ---------------------------------------------------------
     Hero slider (auto-rotates, pauses on hover, dot navigation)
  --------------------------------------------------------- */
  const heroSlides = document.querySelectorAll(".hero__slide");
  const heroPhotos = document.querySelectorAll(".hero__photo");
  const heroDots = document.querySelectorAll(".hero__dot");
  if (heroSlides.length) {
    let heroIndex = 0;
    let heroTimer = null;

    const goToSlide = (i) => {
      heroIndex = (i + heroSlides.length) % heroSlides.length;
      heroSlides.forEach((s, n) => s.classList.toggle("is-active", n === heroIndex));
      heroPhotos.forEach((p, n) => p.classList.toggle("is-active", n === heroIndex));
      heroDots.forEach((d, n) => d.classList.toggle("is-active", n === heroIndex));
    };

    const stopHero = () => {
      if (heroTimer) clearInterval(heroTimer);
      heroTimer = null;
    };
    const startHero = () => {
      if (reduceMotion) return;
      stopHero();
      heroTimer = setInterval(() => goToSlide(heroIndex + 1), 6000);
    };

    heroDots.forEach((dot, n) => {
      dot.addEventListener("click", () => {
        goToSlide(n);
        startHero();
      });
    });

    const heroSection = document.querySelector(".hero");
    if (heroSection) {
      heroSection.addEventListener("mouseenter", stopHero);
      heroSection.addEventListener("mouseleave", startHero);
    }

    startHero();
  }

  /* ---------------------------------------------------------
     Generic reveal-up on scroll (values, headings, etc.)
  --------------------------------------------------------- */
  if (window.gsap && window.ScrollTrigger) {
    document.querySelectorAll(".reveal-up:not(.hero__eyebrow):not([data-delay]):not(.value-card):not(.sector-card):not(.solution-card):not(.brand-card)").forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: "top 88%",
        onEnter: () => el.classList.add("is-visible"),
        once: true,
      });
    });

    // staggered grid reveal — value cards and sector cards share one entrance treatment
    function revealStaggerGroup(containerSelector, itemSelector) {
      const container = document.querySelector(containerSelector);
      const items = container ? gsap.utils.toArray(itemSelector, container) : [];
      if (!container || !items.length) return;
      ScrollTrigger.create({
        trigger: container,
        start: "top 88%",
        once: true,
        onEnter: () => {
          gsap.fromTo(
            items,
            { opacity: 0, y: 30 },
            { opacity: 1, y: 0, duration: 0.7, stagger: 0.08, ease: "power3.out" }
          );
        },
      });
    }
    revealStaggerGroup(".values__grid", ".value-card");
    revealStaggerGroup(".sectors__grid", ".sector-card");
    revealStaggerGroup(".solutions__grid", ".solution-card");
    revealStaggerGroup(".brands-grid", ".brand-card");
  }

  /* ---------------------------------------------------------
     Count-up numbers (hero meta)
  --------------------------------------------------------- */
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const obj = { val: 0 };
    gsap.to(obj, {
      val: target,
      duration: 1.6,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = Number.isInteger(target) ? Math.floor(obj.val) : obj.val.toFixed(1);
      },
    });
  }
  if (window.gsap) {
    document.querySelectorAll("[data-count]").forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: "top 95%",
        once: true,
        onEnter: () => animateCount(el),
      });
    });
  }

  /* ---------------------------------------------------------
     SUPERVISÓRIO AO VIVO — simulated fancoil/AHU (modelo de um fancoil real):
     válvula de água gelada em PI, ventilador EC em controle de vazão,
     resistência de reaquecimento, umidade, transdutor de pressão e alarmes.
     Runs only while the 3D viewer (or the pGD terminal) is on screen and the tab
     is visible. The terminal (js/pgd.js) and the 3D model (js/uta3d.js) use window.hrLive.
  --------------------------------------------------------- */
  const livePanel = document.getElementById("livePanel");
  if (livePanel) {
    const $ = (id) => document.getElementById(id);
    const el = {
      temp: $("kTemp"), sp: $("kSp"), valve: $("kValve"), fan: $("kFan"), flow: $("kFlow"),
      status: $("liveStatus"), clock: $("liveClock"), event: $("liveEvent"), load: $("liveLoad"),
    };

    const SIM_SPEED = 3;              // simulated seconds per real second
    const SP_MIN = 18, SP_MAX = 28;
    const FLOW_NOM = 3400;            // m³/h at 100 % fan speed
    const FLOW_DESIGN = 2800;         // m³/h the coil capacity was sized for
    const ALARM_ON = 1.0;             // °C above setpoint to raise the alarm
    const ALARM_OFF = 0.6;            // °C above setpoint to clear it
    const ALARM_INHIBIT = 45;         // simulated s without alarms after start / setpoint change
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

    const s = {
      T: 26.5, sp: 23, tOut: 32, supply: 26, load: 0,
      unitOn: true, exhaustOn: false,
      valve: 0, integ: 0, kp: 25, ti: 6, valveMode: "auto", valveMan: 0, pTerm: 0, iTerm: 0,
      fan: (FLOW_DESIGN / FLOW_NOM) * 100, fanMode: "auto", fanMan: 70, flowSp: FLOW_DESIGN, flow: FLOW_DESIGN,
      resist: 0, kr: 60, resistMode: "auto", resistMan: 0,
      rh: 58, rhSp: 50,
      kFactor: 150, pressure: 0,
      offT: 0, offTs: 0, offRh: 0, offP: 0,
      t: 0, changedAt: 0, settledFor: 0, settled: false, hiFor: 0,
      alarms: [],                     // { code, text, at, T, sp, active } until reset at the terminal
      alarmLog: [],                   // { code, text, at, T, sp, event: "Start" | "Stop" }
    };

    const clockText = () => new Date().toLocaleTimeString("pt-BR");
    let eventTimer = 0;
    function log(msg) {
      if (!el.event) return;
      el.event.textContent = `${clockText()} · ${msg}`;
      el.event.classList.add("is-visible");
      clearTimeout(eventTimer);
      eventTimer = setTimeout(() => el.event.classList.remove("is-visible"), 5000);
    }
    function markChange() {
      s.settled = false;
      s.settledFor = 0;
      s.changedAt = s.t;
    }

    function raiseAlarm() {
      const entry = { code: "AL*12", text: "Temperatura alta no retorno", at: new Date(), T: s.T, sp: s.sp, active: true };
      const existing = s.alarms.find((a) => a.code === entry.code);
      if (existing) Object.assign(existing, entry);
      else s.alarms.push(entry);
      s.alarmLog.unshift({ ...entry, event: "Start" });
      log(`Alarme AL*12 · temperatura alta (${s.T.toFixed(1)} °C)`);
    }
    function clearAlarm(a) {
      a.active = false;
      s.alarmLog.unshift({ ...a, at: new Date(), T: s.T, sp: s.sp, event: "Stop" });
      log("Temperatura normalizada · AL*12 inativo");
    }

    // plant + controllers, integrated in small fixed sub-steps (dt in simulated seconds)
    function step(dt) {
      s.t += dt;
      s.load = Math.max(0, s.load - dt * 0.1);
      s.tOut = 32 + 1.5 * Math.sin(s.t / 25) + s.load;
      const e = s.T - s.sp;
      const ki = s.kp / s.ti;

      // chilled-water valve: PI with anti-windup, or manual with bumpless tracking
      if (!s.unitOn) {
        s.valve = 0;
        s.integ = 0;
      } else if (s.valveMode === "auto") {
        const raw = s.kp * e + ki * s.integ;
        if (!((raw >= 100 && e > 0) || (raw <= 0 && e < 0))) s.integ += e * dt;
        s.valve = clamp(s.kp * e + ki * s.integ, 0, 100);
      } else {
        s.valve = s.valveMan;
        s.integ = (s.valve - s.kp * e) / ki;
      }
      s.pTerm = s.kp * e;
      s.iTerm = ki * s.integ;

      // EC fan: constant-flow control (or manual speed), first-order ramp
      const fanTarget = !s.unitOn ? 0 : s.fanMode === "auto" ? clamp((s.flowSp / FLOW_NOM) * 100, 0, 100) : s.fanMan;
      s.fan += (fanTarget - s.fan) * Math.min(1, dt / 2.5);
      s.flow = (FLOW_NOM * s.fan) / 100;
      s.pressure = Math.pow(s.flow / s.kFactor, 2);

      // reheat resistor: proportional below the setpoint band
      if (!s.unitOn) s.resist = 0;
      else if (s.resistMode === "auto") s.resist = clamp((s.sp - 0.5 - s.T) * s.kr, 0, 100);
      else s.resist = s.resistMan;

      const air = Math.min(1.2, Math.sqrt(s.flow / FLOW_DESIGN));
      s.T += (0.05 * (s.tOut - s.T) - 0.9 * (s.valve / 100) * air + 0.8 * (s.resist / 100) * air) * dt;
      s.supply = s.fan > 2 ? 0.3 * s.tOut + 0.7 * s.T - 13 * (s.valve / 100) + 9 * (s.resist / 100) : s.T;
      const rhTarget = 60 - 14 * (s.valve / 100) + 1.5 * (s.T - 23) - 8 * (s.resist / 100);
      s.rh += (rhTarget - s.rh) * Math.min(1, dt / 20);

      if (s.unitOn && s.valveMode === "auto") {
        if (Math.abs(e) < 0.15) s.settledFor += dt;
        else s.settledFor = 0;
        if (!s.settled && s.settledFor > 6) {
          s.settled = true;
          const took = (s.t - s.changedAt - 6) / SIM_SPEED;
          log(`Setpoint atingido em ${took.toFixed(1)} s`);
        } else if (s.settled && Math.abs(e) > 0.4) {
          markChange();
          log("Desvio detectado · compensando");
        }
      }

      const armed = s.unitOn && s.t - s.changedAt > ALARM_INHIBIT;
      if (e > ALARM_ON && armed) s.hiFor += dt;
      else s.hiFor = 0;
      const current = s.alarms.find((a) => a.active);
      if (!current && s.hiFor > 2) raiseAlarm();
      else if (current && (e < ALARM_OFF || !s.unitOn)) clearAlarm(current);
    }

    const put = (node, text) => { if (node) node.textContent = text; };
    function renderReadouts() {
      put(el.temp, s.T.toFixed(1));
      put(el.valve, Math.round(s.valve));
      put(el.fan, Math.round(s.fan));
      put(el.flow, Math.round(s.flow));

      let label = "AJUSTANDO";
      let cls = "is-adjusting";
      if (!s.unitOn) { label = "DESLIGADA"; cls = "is-off"; }
      else if (s.alarms.some((a) => a.active)) { label = "ALARME"; cls = "is-alarm"; }
      else if (s.valveMode === "man") { label = "MANUAL"; cls = "is-adjusting"; }
      else if (s.settled) { label = "EM REGIME"; cls = "is-stable"; }
      el.status.textContent = label;
      el.status.className = `live__status mono ${cls}`;
      put(el.clock, clockText());
      el.load.disabled = s.load > 6 || !s.unitOn;
    }

    let running = false;
    let started = false;
    let last = 0;
    let uiAcc = 0;
    function frame(now) {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      for (let sim = dt * SIM_SPEED; sim > 0; sim -= 0.05) step(Math.min(sim, 0.05));
      if ((uiAcc += dt) >= 0.1) { uiAcc = 0; renderReadouts(); }
      requestAnimationFrame(frame);
    }
    const onScreen = new Set();
    function sync() {
      const shouldRun = onScreen.size > 0 && !document.hidden;
      if (shouldRun === running) return;
      running = shouldRun;
      if (running) {
        if (!started) {
          started = true;
          log("UTA-01 conectada · controle PI ativo");
          markChange();
        }
        last = performance.now();
        requestAnimationFrame(frame);
      }
    }
    const watcher = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? onScreen.add(en.target) : onScreen.delete(en.target)));
      sync();
    }, { threshold: 0.15 });
    watcher.observe(livePanel);
    document.addEventListener("visibilitychange", sync);

    // every write from the panel or the pGD terminal goes through here
    const pct = (v) => `${v.toFixed(1)}%`;
    const onOff = (v) => (v ? "ligado" : "desligado");
    const mode = (v) => (v === "man" ? "MANUAL" : "AUTOMÁTICO");
    const MESSAGES = {
      sp: (v) => `Setpoint alterado para ${v.toFixed(1)} °C`,
      unitOn: (v) => `Fancoil ${onOff(v)} pela IHM`,
      exhaustOn: (v) => `Exaustor ${onOff(v)} pela IHM`,
      valveMode: (v) => `Válvula em ${mode(v)}`,
      valveMan: (v) => `Abertura manual da válvula: ${pct(v)}`,
      fanMode: (v) => `Motor EC em ${mode(v)}`,
      fanMan: (v) => `Velocidade manual do motor: ${pct(v)}`,
      flowSp: (v) => `Setpoint de vazão: ${Math.round(v)} m³/h`,
      resistMode: (v) => `Resistência em ${mode(v)}`,
      resistMan: (v) => `Resistência manual: ${pct(v)}`,
      kp: (v) => `Kp da válvula: ${v.toFixed(1)}`,
      ti: (v) => `Ti da válvula: ${v.toFixed(1)} s`,
      kr: (v) => `Ganho da resistência: ${v.toFixed(1)}`,
      rhSp: (v) => `Setpoint de umidade: ${v.toFixed(1)}%`,
      kFactor: (v) => `Fator K do transdutor: ${v.toFixed(1)}`,
    };
    const RESTART = ["sp", "unitOn", "valveMode", "kp", "ti"];
    function set(key, value) {
      if (s[key] === value) return;
      s[key] = value;
      if (key === "valveMode" && value === "man") s.valveMan = Math.round(s.valve * 10) / 10;
      if (key === "fanMode" && value === "man") s.fanMan = Math.round(s.fan * 10) / 10;
      if (key === "resistMode" && value === "man") s.resistMan = Math.round(s.resist * 10) / 10;
      if (RESTART.includes(key)) markChange();
      if (key === "sp") put(el.sp, value.toFixed(1));
      if (MESSAGES[key]) log(MESSAGES[key](value));
      renderReadouts();
    }
    function resetAlarms() {
      const before = s.alarms.length;
      s.alarms = s.alarms.filter((a) => a.active);
      if (s.alarms.length < before) log("Alarmes resetados pela IHM");
      return s.alarms.length === 0;
    }

    el.load.addEventListener("click", () => {
      s.load = 12;
      el.load.disabled = true;
      log("Pico de carga térmica simulado");
    });

    window.hrLive = {
      state: s,
      limits: { SP_MIN, SP_MAX, FLOW_NOM },
      set,
      resetAlarms,
      watch: (node) => watcher.observe(node),
    };

    renderReadouts();
  }

  /* ---------------------------------------------------------
     Marquee: pause handled via CSS :hover already
  --------------------------------------------------------- */

  /* ---------------------------------------------------------
     Refresh ScrollTrigger after images load (layout shift fix)
  --------------------------------------------------------- */
  window.addEventListener("load", () => {
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });
})();
