// =========================================================
// HR AUTOMATION — terminal pGD1 simulado (132×64, 6 teclas)
// Máscaras e navegação baseadas num programa real de fancoil (c.design):
// Main + quick menu (On/Off · Set · Info), loop Info, SetPoints,
// parâmetros de PID, alarmes e data logger. Lê e escreve na simulação
// do supervisório através de window.hrLive (js/script.js).
// =========================================================
(function () {
  "use strict";

  const root = document.getElementById("pgd");
  const live = window.hrLive;
  if (!root || !live) return;

  const s = live.state;
  const { SP_MIN, SP_MAX, FLOW_NOM } = live.limits;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const p2 = (n) => String(n).padStart(2, "0");

  /* ---------------------------------------------------------
     LCD: 132×64 px, grade de 22 colunas × 8 linhas (células 6×8)
  --------------------------------------------------------- */
  const W = 132;
  const H = 64;
  const COLS = 22;
  let S = 4;                       // pixels físicos por pixel do LCD (sempre inteiro)
  const canvas = document.getElementById("pgdCanvas");
  const ctx = canvas.getContext("2d");
  const srText = document.getElementById("pgdText");
  const buf = new Uint8Array(W * H);
  let chars = [];

  // Desenha na resolução física da tela com escala INTEIRA: cada pixel do LCD
  // vira um bloco sólido de S×S pixels do monitor, então todos os traços têm
  // a mesma espessura e nada é reamostrado pelo navegador. A matriz fica
  // centralizada no vidro azul da LCD.
  const lcdBox = canvas.parentElement;
  let sizeKey = "";
  const areaBox = lcdBox.parentElement;          // .pgd__lcd: área livre; o vidro (.pgd__glass) abraça a matriz
  function fitCanvas() {
    const gs = getComputedStyle(lcdBox);
    const pad = parseFloat(gs.paddingLeft) + parseFloat(gs.paddingRight) + 4;
    const availW = areaBox.clientWidth - pad;
    const availH = areaBox.clientHeight - pad;
    if (availW <= 0 || availH <= 0) return false;
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(availW / W, availH / H) * dpr;
    // escala inteira (traços idênticos) quando ela aproveita bem a tela;
    // senão, escala exata para o texto ocupar o vidro inteiro
    const whole = Math.floor(fit);
    const scale = whole >= 3 && whole / fit >= 0.86 ? whole : Math.max(1, Math.floor(fit * 4) / 4);
    const key = `${scale}@${dpr}`;
    if (key === sizeKey) return false;
    sizeKey = key;
    S = scale;
    canvas.width = Math.round(W * S);
    canvas.height = Math.round(H * S);
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    return true;
  }
  fitCanvas();

  // fonte 5×7 de matriz de pontos (colunas, bit 0 = linha de cima), ASCII 0x20–0x7E
  const FONT_HEX =
    "0000000000 00005F0000 0007000700 147F147F14 242A7F2A12 2313086462 3649552250 0005030000" +
    " 001C224100 0041221C00 14083E0814 08083E0808 0050300000 0808080808 0060600000 2010080402" +
    " 3E5149453E 00427F4000 4261514946 2141454B31 1814127F10 2745454539 3C4A494930 0171090503" +
    " 3649494936 064949291E 0036360000 0056360000 0814224100 1414141414 0041221408 0201510906" +
    " 324979413E 7E1111117E 7F49494936 3E41414122 7F4141221C 7F49494941 7F09090901 3E4149497A" +
    " 7F0808087F 00417F4100 2040413F01 7F08142241 7F40404040 7F020C027F 7F0408107F 3E4141413E" +
    " 7F09090906 3E4151215E 7F09192946 4649494931 01017F0101 3F4040403F 1F2040201F 3F4038403F" +
    " 6314081463 0708700807 6151494543 007F414100 0204081020 0041417F00 0402010204 4040404040" +
    " 0001020400 2054545478 7F48444438 3844444420 384444487F 3854545418 087E090102 0C5252523E" +
    " 7F08040478 00447D4000 2040443D00 7F10284400 00417F4000 7C04180478 7C08040478 3844444438" +
    " 7C14141408 081414187C 7C08040408 4854545420 043F444020 3C4040207C 1C2040201C 3C4030403C" +
    " 4428102844 0C5050503C 4464544C44 0008364100 00007F0000 0041360800 0804081008";
  const FONT = {};
  FONT_HEX.split(" ").forEach((hex, i) => {
    FONT[String.fromCharCode(32 + i)] = [0, 2, 4, 6, 8].map((o) => parseInt(hex.slice(o, o + 2), 16));
  });
  FONT["°"] = [0x00, 0x06, 0x09, 0x09, 0x06];
  FONT["³"] = [0x00, 0x11, 0x15, 0x1f, 0x00];
  FONT["┐"] = [0x08, 0x08, 0xf8, 0x00, 0x00];
  FONT["┘"] = [0x08, 0x08, 0x0f, 0x00, 0x00];

  const px = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < H) buf[y * W + x] = v; };
  function fillRect(x, y, w, h, v = 1) {
    for (let j = y; j < y + h; j += 1) for (let i = x; i < x + w; i += 1) px(i, j, v);
  }
  function xorRect(x, y, w, h) {
    for (let j = y; j < y + h; j += 1) for (let i = x; i < x + w; i += 1) if (i >= 0 && i < W && j >= 0 && j < H) buf[j * W + i] ^= 1;
  }
  function glyph(ch, x, y, inv, bold) {
    const g = FONT[ch] || FONT["?"];
    for (let c = 0; c < 5; c += 1) {
      for (let r = 0; r < 8; r += 1) {
        if ((g[c] >> r) & 1) {
          px(x + c, y + r, inv ? 0 : 1);
          if (bold) px(x + c + 1, y + r, inv ? 0 : 1);
        }
      }
    }
  }
  // texto na grade de caracteres; inv = célula escura com texto claro
  function text(row, col, str, inv = false, bold = false) {
    for (let i = 0; i < str.length && col + i < COLS; i += 1) {
      const x = (col + i) * 6;
      const y = row * 8;
      if (inv) fillRect(x, y, 6, 8, 1);
      glyph(str[i], x, y, inv, bold);
      if (chars[row]) chars[row][col + i] = str[i];
    }
  }
  const bar = (row, c0 = 0, c1 = COLS) => fillRect(c0 * 6, row * 8, (c1 - c0) * 6, 8, 1);
  const header = (col, str) => { bar(0); text(0, col, str, true); };
  const title = (str) => { text(0, 2, str, false, true); text(1, 0, "_".repeat(COLS)); };
  const dashes = (row) => text(row, 0, "-".repeat(COLS));
  function img(rows, x, y, inv = false) {
    rows.forEach((line, j) => {
      for (let i = 0; i < line.length; i += 1) if (line[i] === "#") px(x + i, y + j, inv ? 0 : 1);
    });
  }
  // campo numérico no estilo Carel: `int` dígitos inteiros, `dec` decimais
  function num(v, int, dec, { z = false, sign = false } = {}) {
    const neg = v < 0;
    const core = Math.abs(v).toFixed(dec);
    const width = int + (dec ? dec + 1 : 0);
    let out = z ? core.padStart(width, "0") : core;
    if (sign || neg) out = (neg ? "-" : "+") + out;
    return out.padStart(width + (sign ? 1 : 0), " ");
  }
  const center = (str, width) => {
    const left = Math.floor((width - str.length) / 2);
    return (" ".repeat(Math.max(0, left)) + str).padEnd(width, " ");
  };

  /* ---------------------------------------------------------
     Ícones (bitmaps desenhados à mão, no espírito dos .bmp do projeto)
  --------------------------------------------------------- */
  const ICON = {
    onoff: [
      "................", ".......##.......", "...##..##..##...", "..##...##...##..",
      ".##....##....##.", ".#.....##.....#.", "##............##", "##............##",
      "##............##", ".#............#.", ".##..........##.", "..##........##..",
      "...###....###...", ".....######.....", "................", "................",
    ],
    set: [
      "................", "......####......", "..##..#..#..##..", "..#.###..###.#..",
      "..##........##..", "...#..####..#...", ".###.##..##.###.", ".#...#....#...#.",
      ".#...#....#...#.", ".###.##..##.###.", "...#..####..#...", "..##........##..",
      "..#.###..###.#..", "..##..#..#..##..", "......####......", "................",
    ],
    info: [
      "................", ".....######.....", "...##......##...", "..#....##....#..",
      ".#.....##.....#.", ".#............#.", "#.....###......#", "#......##......#",
      "#......##......#", "#......##......#", ".#.....##.....#.", ".#....####....#.",
      "..#..........#..", "...##......##...", ".....######.....", "................",
    ],
    updown: [
      "...##...", "..####..", ".######.", "########", "........", "........", "........", "........",
      "........", "........", "........", "........", "########", ".######.", "..####..", "...##...",
    ],
    thermo: [
      "....##......", "...#..#.##..", "...#..#.....", "...#..#.##..", "...#..#.....", "...#..#.##..",
      "...#..#.....", "...####.....", "..######....", ".########...", ".########...", "..######....", "...####.....",
    ],
    drop: [
      ".....##.....", ".....##.....", "....####....", "....####....", "...######...", "..########..",
      "..########..", ".##########.", ".#######.##.", ".#######.##.", "..#####.##..", "...######...", ".....##.....",
    ],
    fan: [
      "##........##", "###......###", ".###....###.", "..###..###..", "...######...", "....####....",
      "....####....", "...######...", "..###..###..", ".###....###.", "###......###", "##........##",
    ],
    motor: [
      "############", "#..........#", "#.##....##.#", "#.###..###.#", "#.##.##.##.#", "#.##....##.#",
      "#.##....##.#", "#..........#", "############", "...##..##...", "..########..",
    ],
    valve: [
      "....####....", ".....##.....", "#....##....#", "##...##...##", "###..##..###", "####.##.####",
      "############", "####....####", "###......###", "##........##", "#..........#",
    ],
    heater: [
      "############", "#..........#", "#.#..#..#..#", "#.##.##.##.#", "#.#.##.##.##", "#..#..#..#.#",
      "#..........#", "############", "..#......#..", "..#......#..",
    ],
    bell: [
      ".....##.....", "....####....", "...######...", "..########..", "..########..", "..########..",
      ".##########.", "############", "............", ".....##.....",
    ],
    history: [
      "...######...", "..#......#..", ".#...#....#.", "#....#.....#", "#....#.....#",
      "#....####..#", "#..........#", ".#........#.", "..#......#..", "...######...",
    ],
    key: [
      "..######............................", ".##....##...........................",
      "##......##..........................", "#...##...##########################.",
      "#...##...##########################.", "##......##..............##..##..##..",
      ".##....##...............##..##..##..", "..######............................",
    ],
  };

  /* ---------------------------------------------------------
     Campos editáveis
  --------------------------------------------------------- */
  const numField = (row, col, key, opts) => ({
    row, col, min: opts.min, max: opts.max, step: opts.step, fmt: opts.fmt,
    get: () => s[key],
    set: (v) => live.set(key, v),
  });
  const enumField = (row, col, key, labels, values) => {
    const width = Math.max(...labels.map((l) => l.length));
    return {
      row, col, enum: labels,
      fmt: (i) => labels[i].padEnd(width, " "),
      get: () => values.indexOf(s[key]),
      set: (i) => live.set(key, values[i]),
    };
  };
  const MODE = ["Automatico", "Manual"];
  const MODE_V = ["auto", "man"];
  const ONOFF = ["Desligado", "Ligado"];
  const ONOFF_V = [false, true];

  /* ---------------------------------------------------------
     Estado de navegação
  --------------------------------------------------------- */
  let screen = "logo";
  let cursor = -1;                 // -1 = cursor em "home" (0,0)
  let editVal = null;
  let qm = 1;                      // quick menu: 1 On/Off · 2 Set · 3 Info
  let setIdx = 0;
  let setTop = 0;
  let alarmIdx = 0;
  let logIdx = 0;
  let pwd = 0;
  let pwdMsg = "";

  const LOOPS = {
    info: { list: ["info1", "info2", "info3", "info4", "info5", "info6", "info7"], parent: "main" },
    onoff: { list: ["onoff"], parent: "main" },
    temp: { list: ["temp1", "temp2"], parent: "set" },
    umid: { list: ["umid1", "umid2"], parent: "set" },
    vaz: { list: ["vaz1", "vaz2"], parent: "set" },
    motor: { list: ["motor1", "motor2"], parent: "set" },
    valv: { list: ["valv1", "valv2"], parent: "set" },
    res: { list: ["res1", "res2"], parent: "set" },
  };
  const SET_ITEMS = [
    { label: "Temperatura", icon: ICON.thermo, loop: "temp" },
    { label: "Umidade", icon: ICON.drop, loop: "umid" },
    { label: "Vazao", icon: ICON.fan, loop: "vaz" },
    { label: "Param Motor", icon: ICON.motor, loop: "motor" },
    { label: "Param Valv", icon: ICON.valve, loop: "valv" },
    { label: "Param Resist", icon: ICON.heater, loop: "res" },
  ];
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dateStr = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${p2(d.getFullYear() % 100)}`;
  const timeStr = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;

  // valor de um campo da máscara atual (mostra o valor em edição, se for o caso)
  function F(i) {
    const f = M[screen].fields[i];
    return f.fmt(cursor === i ? editVal : f.get());
  }
  function wrap(str, width) {
    const lines = [""];
    str.split(" ").forEach((w) => {
      const cur = lines[lines.length - 1];
      if ((cur + (cur ? " " : "") + w).length > width) lines.push(w);
      else lines[lines.length - 1] = cur + (cur ? " " : "") + w;
    });
    return lines;
  }
  function staircase(value) {
    const levels = [0, 33, 66, 100];
    levels.forEach((lvl, i) => {
      const row = 7 - i;
      const x = 72 + i * 6;
      const filled = lvl === 0 ? value > 0.05 : value >= lvl - 0.05;
      if (filled) fillRect(x, row * 8, 96 - x, 8, 1);
      else {
        fillRect(x, row * 8, 96 - x, 1, 1);
        fillRect(x, row * 8, 1, 8, 1);
      }
      text(row, 16, `->${lvl}%`);
    });
  }
  function alarmRecord(a, row) {
    const d = a.at;
    text(row, 0, a.code);
    text(row, 8, timeStr(d));
    text(row, 14, dateStr(d));
    wrap(a.text, COLS).slice(0, 2).forEach((line, i) => text(row + 2 + i, 0, line));
    text(6, 0, "Temp.Ret");
    text(6, 15, num(a.T, 3, 2));
    text(7, 0, "SetPoint");
    text(7, 15, num(a.sp, 3, 2));
  }
  function openLog() {
    logIdx = 0;
    go(s.alarmLog.length ? "alog" : "nolog");
  }

  /* ---------------------------------------------------------
     Máscaras
  --------------------------------------------------------- */
  const M = {
    logo: {
      draw() {
        "HR".split("").forEach((ch, i) => {
          const g = FONT[ch];
          for (let c = 0; c < 5; c += 1) for (let r = 0; r < 7; r += 1) {
            if ((g[c] >> r) & 1) fillRect(46 + i * 21 + c * 3, 6 + r * 3, 3, 3, 1);
          }
        });
        fillRect(30, 32, 72, 1, 1);
        text(5, 4, "HR Automation");
        text(7, 4, "Automacao HVAC");
      },
    },

    main: {
      draw() {
        const d = new Date();
        bar(0);
        text(0, 0, dateStr(d), true);
        text(0, 11, DOW[d.getDay()], true);
        text(0, 17, timeStr(d), true);
        text(1, 0, `  Temperat:${num(s.T + s.offT, 3, 1)}°C`);
        text(2, 0, ` SetP Temp:${num(s.sp, 3, 1)}°C`);
        text(3, 0, `   Umidade:${num(s.rh + s.offRh, 3, 1)} %`);
        text(4, 0, ` SetP Umid:${num(s.rhSp, 3, 1)} %`);
        text(5, 0, `     Vazao:${num(s.flow, 4, 0)} m³/h`);
        text(6, 0, ` Resist:${num(s.resist, 3, 1)} %`);
        text(7, 0, `Valvula:${num(s.valve, 3, 1)} %`);
        fillRect(97, 47, 1, 17, 1);
        fillRect(97, 47, 35, 1, 1);
        img([ICON.onoff, ICON.set, ICON.info][qm - 1], 101, 48);
        if (blink()) xorRect(99, 48, 20, 16);
        img(ICON.updown, 122, 48);
      },
      onKey(k) {
        if (k === "UP") qm = (qm % 3) + 1;
        else if (k === "DOWN") qm = qm === 1 ? 3 : qm - 1;
        else if (k === "ENTER") {
          if (qm === 1) go("onoff");
          else if (qm === 2) { setIdx = 0; setTop = 0; go("set"); }
          else go("info1");
        }
        return true;
      },
    },

    onoff: {
      loop: "onoff",
      fields: [enumField(2, 9, "unitOn", ONOFF, ONOFF_V), enumField(6, 9, "exhaustOn", ONOFF, ONOFF_V)],
      draw() {
        header(8, "On/Off");
        text(1, 7, "Fancoil");
        text(2, 0, `Liga IHM:${F(0)}`);
        text(3, 0, "Seletora:Automatico");
        dashes(4);
        text(5, 7, "Exaustor");
        text(6, 0, `Liga IHM:${F(1)}`);
        text(7, 0, "Seletora:Automatico");
      },
    },

    set: {
      draw() {
        header(0, "SetPoints");
        text(0, 18, `${setIdx}/5`, true);
        for (let i = 0; i < 3; i += 1) {
          const idx = setTop + i;
          const item = SET_ITEMS[idx];
          const y = 16 + i * 16;
          const sel = idx === setIdx;
          if (sel) fillRect(0, y, W, 16, 1);
          img(item.icon, 2, y + 2, sel);
          text(3 + i * 2, 3, item.label, sel);
        }
      },
      onKey(k) {
        if (k === "DOWN") setIdx = Math.min(SET_ITEMS.length - 1, setIdx + 1);
        else if (k === "UP") setIdx = Math.max(0, setIdx - 1);
        else if (k === "ENTER") go(LOOPS[SET_ITEMS[setIdx].loop].list[0]);
        else if (k === "ESC") go("main");
        if (setIdx < setTop) setTop = setIdx;
        if (setIdx > setTop + 2) setTop = setIdx - 2;
        return true;
      },
    },

    info1: {
      loop: "info",
      draw() {
        header(2, "Info do Equipamento");
        text(1, 1, "Vazao do Equipamento");
        text(2, 5, `${num(s.flow, 4, 1)} m³/h`);
        text(4, 0, `Chave Selet:${s.fanMode === "auto" ? "Automatico" : "Manual"}`);
        text(6, 0, `Status:${s.fan > 10 ? "Ligado" : "Desligado"}`);
        text(7, 0, "Filtro:Limpo");
      },
    },
    info2: {
      loop: "info",
      draw() {
        header(4, "Info Motor EC");
        dashes(1);
        text(2, 0, "|Velocidade-┐        |");
        text(3, 0, `| do Motor -┘> ${num(s.fan, 3, 1, { z: true })}%|`);
        dashes(4);
        text(5, 1, "-".repeat(20));
        bar(6, 1, 21);
        text(6, 1, `|${center("Sem Falha", 18)}|`, true);
        text(7, 1, "-".repeat(20));
      },
    },
    info3: {
      loop: "info",
      draw() {
        header(5, "Info Valvula");
        dashes(1);
        text(2, 0, "|Abertura da|");
        text(3, 0, "|  Valvula  |");
        text(5, 2, `${num(s.valve, 3, 1, { z: true })}%`);
        staircase(s.valve);
      },
    },
    info4: {
      loop: "info",
      draw() {
        header(3, "Info Resistencia");
        dashes(1);
        text(2, 0, "|Porcentagem da|");
        text(3, 0, "| Resistencia  |");
        text(5, 2, `${num(s.resist, 3, 1, { z: true })}%`);
        staircase(s.resist);
      },
    },
    info5: {
      loop: "info",
      draw() {
        header(3, "Info Transdutor");
        dashes(1);
        text(2, 3, "Pressao Aferida");
        text(3, 4, `<${num(s.pressure + s.offP, 4, 1)} Pa>`);
        text(5, 1, "-".repeat(20));
        text(6, 8, "Vazao");
        text(7, 3, `<${num(s.flow, 4, 1)} m³/h>`);
      },
    },
    info6: {
      loop: "info",
      draw() {
        header(4, "Sondas Retorno");
        dashes(1);
        text(3, 1, `Temperatura:${num(s.T + s.offT, 3, 1)}°C`);
        text(5, 1, `Umidade:${num(s.rh + s.offRh, 3, 1)} %`);
      },
    },
    info7: {
      loop: "info",
      draw() {
        header(1, "Sondas Insuflamento");
        dashes(1);
        text(4, 2, `Temperatura:${num(s.supply + s.offTs, 3, 1)}°C`);
      },
    },

    temp1: {
      loop: "temp",
      fields: [numField(6, 12, "sp", { min: SP_MIN, max: SP_MAX, step: 0.1, fmt: (v) => num(v, 2, 1) })],
      draw() {
        title("Temperatura");
        text(3, 2, `Temp Retor:${num(s.T + s.offT, 3, 1)}°C`);
        text(4, 2, `Temp Insuf:${num(s.supply + s.offTs, 3, 1)}°C`);
        fillRect(6, 43, 120, 17, 1);
        text(6, 1, ` Setpoint <${F(0)} >`, true);
      },
    },
    temp2: {
      loop: "temp",
      fields: [
        numField(4, 8, "offT", { min: -5, max: 5, step: 0.1, fmt: (v) => num(v, 1, 1, { sign: true }) }),
        numField(7, 8, "offTs", { min: -5, max: 5, step: 0.1, fmt: (v) => num(v, 1, 1, { sign: true }) }),
      ],
      draw() {
        title("Offset Temperatura");
        text(3, 0, "Offset Temp Retorno:");
        text(4, 8, `${F(0)} °C`);
        text(6, 0, "Offset Temp Insufl.:");
        text(7, 8, `${F(1)} °C`);
      },
    },
    umid1: {
      loop: "umid",
      fields: [numField(6, 12, "rhSp", { min: 30, max: 70, step: 0.5, fmt: (v) => num(v, 2, 1) })],
      draw() {
        title("Umidade");
        text(3, 2, `Umid Retor:${num(s.rh + s.offRh, 3, 1)} %`);
        fillRect(6, 43, 120, 17, 1);
        text(6, 1, ` Setpoint <${F(0)}%>`, true);
      },
    },
    umid2: {
      loop: "umid",
      fields: [numField(5, 8, "offRh", { min: -10, max: 10, step: 0.5, fmt: (v) => num(v, 2, 1, { sign: true }) })],
      draw() {
        title("Offset Umidade");
        text(3, 0, "Offset Umid Retorno:");
        text(5, 8, `${F(0)} %`);
      },
    },
    vaz1: {
      loop: "vaz",
      fields: [numField(6, 10, "flowSp", { min: 1000, max: FLOW_NOM, step: 50, fmt: (v) => num(v, 4, 1) })],
      draw() {
        title("Vazao");
        text(3, 3, `vazao:${num(s.flow, 4, 1)} m³/h`);
        fillRect(0, 43, W, 17, 1);
        text(6, 0, `Setpoint <${F(0)} m³/h>`, true);
      },
    },
    vaz2: {
      loop: "vaz",
      fields: [
        numField(6, 2, "kFactor", { min: 50, max: 300, step: 1, fmt: (v) => num(v, 3, 1) }),
        numField(6, 14, "offP", { min: -50, max: 50, step: 0.5, fmt: (v) => num(v, 2, 1, { sign: true }) }),
      ],
      draw() {
        title("Transdutor");
        text(3, 5, `${num(s.pressure + s.offP, 4, 1)} Pa`);
        text(5, 1, "Fator K");
        text(5, 13, "Offset P");
        text(6, 1, `<${F(0)}>`);
        text(6, 13, `<${F(1)}>`);
      },
    },
    motor1: {
      loop: "motor",
      fields: [
        enumField(2, 4, "fanMode", MODE, MODE_V),
        numField(4, 15, "fanMan", { min: 20, max: 100, step: 1, fmt: (v) => num(v, 3, 1) }),
      ],
      draw() {
        title("Parametro Motor");
        text(2, 0, `PID:${F(0)}`);
        text(4, 0, `Velo Man Motor:${F(1)}`);
        text(6, 0, `Velo Motor:${num(s.fan, 3, 1)} %`);
      },
    },
    motor2: {
      loop: "motor",
      draw() {
        const e = ((s.flowSp - s.flow) / FLOW_NOM) * 100;
        const p = 1.5 * e;
        pidTable("Parametro Motor", [1.5, 4.0, 0], [p, s.fan - p, 0]);
      },
    },
    valv1: {
      loop: "valv",
      fields: [
        enumField(2, 4, "valveMode", MODE, MODE_V),
        numField(4, 16, "valveMan", { min: 0, max: 100, step: 1, fmt: (v) => num(v, 3, 1) }),
      ],
      draw() {
        title("Parametro Valvula");
        text(2, 0, `PID:${F(0)}`);
        text(4, 0, `Abert Man Valv: ${F(1)}`);
        text(6, 0, `Abertura Valv:${num(s.valve, 3, 1)}`);
      },
    },
    valv2: {
      loop: "valv",
      fields: [
        numField(4, 3, "kp", { min: 1, max: 60, step: 0.5, fmt: (v) => num(v, 2, 1) }),
        numField(5, 3, "ti", { min: 1, max: 60, step: 0.5, fmt: (v) => num(v, 2, 1) }),
      ],
      draw() {
        pidTable("Parametro Valvula", [F(0), F(1), 0], [s.pTerm, s.iTerm, 0]);
      },
    },
    res1: {
      loop: "res",
      fields: [
        enumField(2, 4, "resistMode", MODE, MODE_V),
        numField(4, 16, "resistMan", { min: 0, max: 100, step: 1, fmt: (v) => num(v, 3, 1) }),
      ],
      draw() {
        title("Parametro Resist.");
        text(2, 0, `PID:${F(0)}`);
        text(4, 0, `Prop Man Resist:${F(1)}`);
        text(6, 0, `Prop Resist:${num(s.resist, 3, 1)}`);
      },
    },
    res2: {
      loop: "res",
      fields: [numField(4, 3, "kr", { min: 10, max: 99, step: 1, fmt: (v) => num(v, 2, 1) })],
      draw() {
        pidTable("Parametro Resist.", [F(0), 0, 0], [s.kr * (s.sp - 0.5 - s.T), 0, 0]);
      },
    },

    alarm: {
      draw() {
        const a = s.alarms[alarmIdx];
        header(0, "Alarms");
        text(0, 17, `${p2(alarmIdx + 1)}/${p2(s.alarms.length)}`, true);
        alarmRecord(a, 1);
        text(5, 0, a.active ? "Status: ATIVO" : "Status: INATIVO");
      },
      onKey(k) {
        if (k === "DOWN") {
          if (alarmIdx < s.alarms.length - 1) alarmIdx += 1;
          else go("alarmres");
        } else if (k === "UP") alarmIdx = Math.max(0, alarmIdx - 1);
        else if (k === "ESC") go("main");
        return true;
      },
    },
    alarmres: {
      draw() {
        header(0, "Alarms");
        img(ICON.bell, 1, 18);
        text(2, 3, "Press ALARM to");
        text(3, 3, "reset all alarms");
        img(ICON.history, 1, 50);
        text(6, 3, "Press ENTER");
        text(7, 3, "to DATA LOGGER");
      },
      onKey(k) {
        if (k === "UP" && s.alarms.length) { alarmIdx = s.alarms.length - 1; go("alarm"); }
        else if (k === "ENTER") openLog();
        else if (k === "ESC") go("main");
        return true;
      },
    },
    noalarms: {
      draw() {
        text(2, 0, "NO ALARMS");
        img(ICON.history, 1, 42);
        text(5, 3, "Press ENTER");
        text(6, 3, "to DATA LOGGER");
      },
      onKey(k) {
        if (k === "ENTER") openLog();
        else if (k === "ESC") go("main");
        return true;
      },
    },
    alog: {
      draw() {
        const r = s.alarmLog[logIdx];
        header(0, `Data logger Rec:${String(logIdx + 1).padStart(3, "0")}`);
        alarmRecord(r, 1);
        text(5, 0, "Event:");
        text(5, 13, r.event);
      },
      onKey(k) {
        if (k === "DOWN") logIdx = Math.min(s.alarmLog.length - 1, logIdx + 1);
        else if (k === "UP") logIdx = Math.max(0, logIdx - 1);
        else if (k === "ESC") go("main");
        return true;
      },
    },
    nolog: {
      draw() {
        header(0, "Alarms History");
        text(2, 0, "NO LOGS");
      },
      onKey(k) {
        if (k === "ESC") go("main");
        return true;
      },
    },

    login: {
      fields: [{
        row: 4, col: 18, min: 0, max: 9999, step: 1,
        fmt: (v) => String(v).padStart(4, "0"),
        get: () => pwd,
        set: (v) => { pwd = v; pwdMsg = "Password incorrect"; },
      }],
      draw() {
        header(0, "Login");
        img(ICON.key, 48, 12);
        text(4, 0, "Insert password:");
        text(4, 18, F(0));
        if (pwdMsg) { bar(7); text(7, 0, pwdMsg, true); }
      },
    },
  };

  function pidTable(name, inputs, results) {
    title(name);
    bar(2);
    text(2, 0, "  Entrada | Resultado", true);
    dashes(3);
    ["P", "I", "D"].forEach((k, i) => {
      const input = typeof inputs[i] === "string" ? inputs[i] : num(inputs[i], 2, 1);
      text(4 + i, 0, ` ${k}:${input}`);
      text(4 + i, 10, `|${k}term${num(results[i], 3, 1, { sign: true })}`);
    });
    dashes(7);
  }

  /* ---------------------------------------------------------
     Navegação e teclas
  --------------------------------------------------------- */
  function go(id) {
    screen = id;
    cursor = -1;
    editVal = null;
    // a UTA 3D (js/uta3d.js) aproxima a câmera do componente da tela aberta
    window.dispatchEvent(new CustomEvent("pgd:screen", { detail: { screen: id } }));
  }
  function openAlarms() {
    if (screen === "alarmres") {
      const cleared = live.resetAlarms();
      alarmIdx = 0;
      go(cleared ? "noalarms" : "alarm");
    } else if (s.alarms.length) {
      alarmIdx = 0;
      go("alarm");
    } else go("noalarms");
  }
  function adjust(f, v, dir) {
    if (f.enum) return (v + dir + f.enum.length) % f.enum.length;
    const next = Math.round((v + dir * f.step) / f.step) * f.step;
    return clamp(Number(next.toFixed(4)), f.min, f.max);
  }

  function press(k) {
    if (screen === "logo") { go("main"); return render(true); }
    if (k === "ALARM") { openAlarms(); return render(true); }
    if (k === "PRG") { pwd = 0; pwdMsg = ""; go("login"); return render(true); }

    const m = M[screen];
    if (m.onKey && m.onKey(k)) return render(true);
    const fields = m.fields || [];

    if (k === "ENTER" && fields.length) {
      if (cursor < 0) {
        cursor = 0;
        editVal = fields[0].get();
      } else {
        fields[cursor].set(editVal);
        cursor += 1;
        if (cursor >= fields.length) cursor = -1;
        else editVal = fields[cursor].get();
      }
    } else if ((k === "UP" || k === "DOWN") && cursor >= 0) {
      editVal = adjust(fields[cursor], editVal, k === "UP" ? 1 : -1);
    } else if ((k === "UP" || k === "DOWN") && m.loop) {
      const list = LOOPS[m.loop].list;
      const i = list.indexOf(screen);
      go(list[(i + (k === "DOWN" ? 1 : -1) + list.length) % list.length]);
    } else if (k === "ESC") {
      if (cursor >= 0) cursor = -1;
      else go(m.loop ? LOOPS[m.loop].parent : "main");
    }
    return render(true);
  }

  /* ---------------------------------------------------------
     Renderização
  --------------------------------------------------------- */
  const blink = () => Math.floor(performance.now() / 420) % 2 === 0;
  const alarmKey = root.querySelector('[data-key="ALARM"]');
  const prgKey = root.querySelector('[data-key="PRG"]');

  function render(announce) {
    // uma máscara de alarme pode ficar sem registro depois de um reset
    if (screen === "alarm" && !s.alarms[alarmIdx]) go(s.alarms.length ? "alarm" : "noalarms");
    if (screen === "alarm" && !s.alarms[alarmIdx]) alarmIdx = 0;

    buf.fill(0);
    chars = Array.from({ length: 8 }, () => new Array(COLS).fill(" "));
    const m = M[screen];
    m.draw();
    if (cursor >= 0 && m.fields) {
      const f = m.fields[cursor];
      if (blink()) xorRect(f.col * 6, f.row * 8, f.fmt(editVal).length * 6, 8);
    } else if ((m.loop || m.fields) && blink()) {
      xorRect(0, 0, 6, 8);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0b1b27";
    for (let y = 0; y < H; y += 1) {
      let x = 0;
      while (x < W) {
        if (!buf[y * W + x]) { x += 1; continue; }
        const x0 = x;
        while (x < W && buf[y * W + x]) x += 1;
        // leve sobreposição evita frestas entre linhas quando a escala é fracionária
        ctx.fillRect(x0 * S, y * S, (x - x0) * S + 0.3, S + 0.3);
      }
    }

    alarmKey.classList.toggle("has-alarm", s.alarms.length > 0);
    alarmKey.classList.toggle("is-active", s.alarms.some((a) => a.active));
    prgKey.classList.toggle("is-lit", screen === "login");
    if (announce && srText) srText.textContent = chars.map((r) => r.join("").trimEnd()).join("\n");
  }

  /* ---------------------------------------------------------
     Entrada: teclas na tela (com repetição ao segurar ↑↓) e teclado
  --------------------------------------------------------- */
  const keyEls = {};
  root.querySelectorAll("[data-key]").forEach((btn) => {
    const k = btn.dataset.key;
    keyEls[k] = btn;
    let hold = 0;
    let repeat = 0;
    const stop = () => {
      clearTimeout(hold);
      clearInterval(repeat);
      btn.classList.remove("is-down");
    };
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      root.focus({ preventScroll: true });
      btn.classList.add("is-down");
      press(k);
      if (k === "UP" || k === "DOWN") {
        hold = setTimeout(() => { repeat = setInterval(() => press(k), 90); }, 450);
      }
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => btn.addEventListener(ev, stop));
    // ativação por teclado (Tab até a tecla + Enter/Espaço)
    btn.addEventListener("click", (e) => { if (e.detail === 0) press(k); });
  });

  const KEYMAP = { ArrowUp: "UP", ArrowDown: "DOWN", Enter: "ENTER", Escape: "ESC", Backspace: "ESC", a: "ALARM", A: "ALARM", p: "PRG", P: "PRG" };
  root.addEventListener("keydown", (e) => {
    if (e.target !== root) return;
    const k = KEYMAP[e.key];
    if (!k) return;
    e.preventDefault();
    const btn = keyEls[k];
    btn.classList.add("is-down");
    setTimeout(() => btn.classList.remove("is-down"), 120);
    press(k);
  });

  /* ---------------------------------------------------------
     Ciclo de vida: liga quando aparece na tela
  --------------------------------------------------------- */
  let timer = 0;
  let booted = false;
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      if (!booted) {
        booted = true;
        setTimeout(() => { if (screen === "logo") { go("main"); render(true); } }, reduceMotion ? 0 : 2200);
      }
      if (!timer) timer = setInterval(() => render(false), 250);
      render(false);
    } else {
      clearInterval(timer);
      timer = 0;
    }
  }, { threshold: 0.2 }).observe(root);
  live.watch(root);
  new ResizeObserver(() => { if (fitCanvas()) render(false); }).observe(areaBox);
  window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener("change", () => { sizeKey = ""; fitCanvas(); render(false); });
  render(true);
})();
