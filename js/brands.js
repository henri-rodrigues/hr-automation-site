// =========================================================
// HR AUTOMATION — marcas do ecossistema HVAC
// Clique num logo → diálogo com o resumo da empresa e como ela
// aparece nos projetos da HR. Logos em img/marcas/.
// =========================================================
(function () {
  "use strict";

  const BRANDS = {
    carel: {
      name: "CAREL", meta: "Itália · desde 1973",
      text: "Especialista em controle para ar-condicionado, refrigeração e umidificação. Fabrica os controladores programáveis pCO, os terminais de interface pGD, válvulas de expansão eletrônica e umidificadores.",
      hr: "Programamos controladores pCO e terminais pGD — como a IHM da simulação desta página.",
    },
    danfoss: {
      name: "Danfoss", meta: "Dinamarca · desde 1933",
      text: "Fabricante global de componentes para refrigeração, climatização e aquecimento: compressores, válvulas, controladores e os inversores de frequência VLT®.",
      hr: "Integramos inversores VLT® HVAC Drive e válvulas de controle nas malhas de UTAs e chillers.",
    },
    copeland: {
      name: "Copeland", meta: "EUA",
      text: "Referência em compressores scroll e semi-herméticos para refrigeração e ar-condicionado, além de controles e monitoramento para a cadeia do frio. Antiga Emerson Climate Technologies, adotou a marca Copeland em 2023.",
      hr: "Monitoramos e protegemos compressores Copeland em centrais de frio e chillers.",
    },
    weg: {
      name: "WEG", meta: "Brasil · desde 1961",
      text: "Multinacional de Jaraguá do Sul (SC) e uma das maiores fabricantes de motores elétricos do mundo. Produz também inversores de frequência, soft-starters, transformadores e painéis.",
      hr: "Especificamos motores e inversores WEG em ventiladores, bombas e torres de resfriamento.",
    },
    siemens: {
      name: "Siemens", meta: "Alemanha · desde 1847",
      text: "Gigante da engenharia com forte atuação em automação industrial (CLPs SIMATIC), acionamentos e automação predial (Desigo).",
      hr: "Integramos CLPs SIMATIC e controladores Desigo ao supervisório via BACnet, Modbus e PROFINET.",
    },
    "schneider-electric": {
      name: "Schneider Electric", meta: "França · desde 1836",
      text: "Especialista em gestão de energia e automação: distribuição elétrica, CLPs Modicon, inversores Altivar e a plataforma de gestão predial EcoStruxure.",
      hr: "Montamos painéis com componentes Schneider e integramos inversores Altivar e medidores de energia.",
    },
    "rockwell-automation": {
      name: "Rockwell Automation", meta: "EUA · desde 1903 (Allen-Bradley)",
      text: "Uma das maiores empresas dedicadas à automação industrial, dona da marca Allen-Bradley: CLPs ControlLogix e CompactLogix, inversores PowerFlex e IHMs PanelView.",
      hr: "Integramos CLPs Allen-Bradley em plantas industriais via EtherNet/IP e Modbus TCP.",
    },
    abb: {
      name: "ABB", meta: "Suíça · desde 1988",
      text: "Grupo nascido da fusão da sueca ASEA com a suíça Brown Boveri. Forte em eletrificação, motores, robótica e inversores — incluindo a linha ACH, dedicada a HVAC.",
      hr: "Aplicamos inversores ABB ACH em ventiladores e bombas com controle de pressão e vazão.",
    },
    omron: {
      name: "OMRON", meta: "Japão · desde 1933",
      text: "Fabricante japonesa de componentes de automação: sensores, relés, controladores de temperatura, CLPs e IHMs.",
      hr: "Usamos controladores de temperatura, relés e sensores OMRON em painéis de comando.",
    },
    "mitsubishi-electric": {
      name: "Mitsubishi Electric", meta: "Japão · desde 1921",
      text: "Atua em automação industrial (CLPs MELSEC, inversores e IHMs GOT) e em climatização, com os sistemas VRF City Multi e equipamentos split.",
      hr: "Integramos sistemas VRF Mitsubishi Electric ao BMS e automatizamos processos com CLPs MELSEC.",
    },
    honeywell: {
      name: "Honeywell", meta: "EUA · desde 1906",
      text: "Pioneira em controle de temperatura, hoje forte em automação predial, controladores e sensores para HVAC, segurança e instrumentação.",
      hr: "Integramos controladores, sensores e atuadores Honeywell a sistemas de gestão predial.",
    },
    "johnson-controls": {
      name: "Johnson Controls", meta: "EUA / Irlanda · desde 1885",
      text: "Fundada por Warren Johnson, inventor do termostato elétrico de ambiente. Reúne automação predial (Metasys), chillers e equipamentos YORK e sistemas de segurança.",
      hr: "Integramos chillers YORK e o Metasys ao supervisório da planta.",
    },
    festo: {
      name: "Festo", meta: "Alemanha · desde 1925",
      text: "Referência em automação pneumática e elétrica: válvulas, cilindros, atuadores, terminais de válvulas e soluções de controle.",
      hr: "Aplicamos atuadores e válvulas Festo em dampers e processos industriais.",
    },
    "phoenix-contact": {
      name: "Phoenix Contact", meta: "Alemanha · desde 1923",
      text: "Fabricante de conectividade elétrica e automação: bornes, conectores, fontes, relés, proteção contra surtos e controladores PLCnext.",
      hr: "Nossos painéis usam bornes, fontes e proteção contra surtos Phoenix Contact.",
    },
    "ziehl-abegg": {
      name: "Ziehl-Abegg", meta: "Alemanha · desde 1910",
      text: "Especialista alemã em ventiladores e motores para ventilação e HVAC, com forte presença em motores EC de alta eficiência.",
      hr: "Controlamos ventiladores EC Ziehl-Abegg via Modbus em UTAs, condensadores e exaustores.",
    },
    "ebm-papst": {
      name: "ebm-papst", meta: "Alemanha · desde 1963",
      text: "Uma das maiores fabricantes de ventiladores e motores EC para ventilação, refrigeração e ar-condicionado.",
      hr: "Integramos ventiladores EC ebm-papst — como o plug fan da UTA 3D — com controle de vazão.",
    },
    weidmuller: {
      name: "Weidmüller", meta: "Alemanha · desde 1850",
      text: "Especialista em conectividade industrial: bornes, conectores, fontes, relés e módulos de I/O remoto.",
      hr: "Usamos bornes, relés e I/O remoto Weidmüller na montagem de painéis.",
    },
  };

  const dialog = document.getElementById("brandDialog");
  const cards = Array.from(document.querySelectorAll(".brand-card[data-brand]"));
  if (!dialog || !cards.length || typeof dialog.showModal !== "function") return;

  const $ = (id) => document.getElementById(id);
  const logo = $("brandLogo");
  let index = 0;
  let opener = null;

  function fill(i) {
    index = (i + cards.length) % cards.length;
    const card = cards[index];
    const b = BRANDS[card.dataset.brand];
    const img = card.querySelector("img");
    logo.src = img.getAttribute("src");
    logo.alt = b.name;
    $("brandName").textContent = b.name;
    $("brandMeta").textContent = b.meta;
    $("brandText").textContent = b.text;
    $("brandHr").textContent = b.hr;
    $("brandCount").textContent = `${index + 1} / ${cards.length}`;
    dialog.classList.remove("is-swapping");
    void dialog.offsetWidth;
    dialog.classList.add("is-swapping");
  }

  cards.forEach((card, i) => {
    card.addEventListener("click", () => {
      opener = card;
      fill(i);
      dialog.showModal();
    });
  });
  $("brandPrev").addEventListener("click", () => fill(index - 1));
  $("brandNext").addEventListener("click", () => fill(index + 1));
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") fill(index - 1);
    if (e.key === "ArrowRight") fill(index + 1);
  });
  // clique fora do cartão fecha
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    if (opener) opener.focus({ preventScroll: true });
  });
})();
