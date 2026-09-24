// =========================================================
// HR AUTOMATION — UTA 3D (three.js)
// Modelo gerado no Blender (3d/build_uta.py → models/uta.glb) e animado pelo
// estado da simulação (window.hrLive, js/script.js). A câmera acompanha a tela
// aberta no terminal pGD (evento "pgd:screen" disparado por js/pgd.js).
// =========================================================
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const host = document.getElementById("livePanel");
const canvas = document.getElementById("utaCanvas");
const live = window.hrLive;

if (host && canvas && live) init();

function init() {
  const s = live.state;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const loadingEl = document.getElementById("utaLoading");
  const focusEl = document.getElementById("utaFocus");

  /* ---------------------------------------------------------
     Renderizador, cena e luz
  --------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral preserva as cores do bake (feito no Cycles com transformação "Standard")
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b3036);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  // reflexos da própria casa de máquinas (panorama 360° renderizado no Cycles)
  new RGBELoader().load("models/room_env.hdr", (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    scene.environmentIntensity = 0.55;
    hdr.dispose();
  });

  // luz de teto (luminárias LED) só para as sombras da própria UTA;
  // piso e paredes já têm luz e sombra assadas na textura
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x6b7178, 0.12));
  const sun = new THREE.DirectionalLight(0xfff4e6, 0.9);
  sun.position.set(0.5, 6, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -3.4;
  sun.shadow.camera.right = 3.4;
  sun.shadow.camera.top = 2.5;
  sun.shadow.camera.bottom = -2.5;
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 4;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(30, 2, 0.05, 80);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;          // a rolagem da página continua rolando a página
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minAzimuthAngle = -0.8;        // fica dentro da casa de máquinas
  controls.maxAzimuthAngle = 0.8;
  controls.rotateSpeed = 0.7;

  /* ---------------------------------------------------------
     Pontos de foco (coordenadas do modelo, já centralizado)
     Blender (x, y, z) → three (x - OFFSET, z, -y)
  --------------------------------------------------------- */
  const OFFSET = 2.3;
  const b2t = (x, y, z) => new THREE.Vector3(x - OFFSET, z, -y);
  const FOCUS = {
    overview: { label: "VISÃO GERAL", target: new THREE.Vector3(0.2, 0.6, 0), dir: new THREE.Vector3(-0.3, 0.3, 1), fit: 7.8 },
    return: { label: "SENSOR DE RETORNO · T / UR", target: b2t(0.35, -0.3, 1.62), dir: new THREE.Vector3(-0.45, 0.55, 1), dist: 1.7 },
    supply: { label: "SENSOR DE INSUFLAMENTO", target: b2t(4.5, 0, 1.42), dir: new THREE.Vector3(0.6, 0.5, 1), dist: 1.6 },
    valve: { label: "VÁLVULA DE ÁGUA GELADA", target: b2t(1.52, -0.86, 0.46), dir: new THREE.Vector3(0.45, 0.5, 1), dist: 1.3 },
    fan: { label: "VENTILADOR EC", target: b2t(3.1, 0, 0.86), dir: new THREE.Vector3(0.15, 0.2, 1), dist: 2.2 },
    pressure: { label: "TRANSDUTOR DE PRESSÃO · VAZÃO", target: b2t(2.79, -0.66, 1.29), dir: new THREE.Vector3(0.3, 0.25, 1), dist: 0.9 },
    heater: { label: "RESISTÊNCIA DE REAQUECIMENTO", target: b2t(2.3, 0, 0.86), dir: new THREE.Vector3(-0.15, 0.15, 1), dist: 2.0 },
    panel: { label: "PAINEL DE COMANDO", target: b2t(3.93, -0.82, 0.88), dir: new THREE.Vector3(0.25, 0.15, 1), dist: 1.35 },
  };
  const SCREEN_FOCUS = {
    temp1: "return", temp2: "return", info6: "return", umid1: "return", umid2: "return",
    info7: "supply",
    valv1: "valve", valv2: "valve", info3: "valve",
    motor1: "fan", motor2: "fan", info2: "fan",
    vaz1: "pressure", vaz2: "pressure", info5: "pressure", info1: "pressure",
    res1: "heater", res2: "heater", info4: "heater",
    onoff: "panel", login: "panel", alarm: "panel", alarmres: "panel", noalarms: "panel", alog: "panel", nolog: "panel",
  };

  /* ---------------------------------------------------------
     Câmera: enquadramento e transição suave entre focos
  --------------------------------------------------------- */
  let focusKey = "overview";
  let tween = null;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function camPose(key) {
    const f = FOCUS[key];
    let dist = f.dist;
    if (f.fit) {
      // distância para caber a máquina inteira na largura, conforme o formato do visor
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const fit = camera.aspect < 1.6 ? f.fit * 0.8 : f.fit;   // telas estreitas: enquadramento mais justo
      dist = Math.max((fit / 2) / Math.tan(hfov / 2), 1.3 / Math.tan(vfov / 2));
    }
    return { pos: f.target.clone().add(f.dir.clone().normalize().multiplyScalar(dist)), target: f.target.clone() };
  }
  function focus(key, instant = false) {
    if (!FOCUS[key]) key = "overview";
    focusKey = key;
    if (focusEl) {
      focusEl.textContent = FOCUS[key].label;
      focusEl.classList.toggle("is-zoomed", key !== "overview");
    }
    const to = camPose(key);
    if (instant || reduceMotion) {
      camera.position.copy(to.pos);
      controls.target.copy(to.target);
      tween = null;
    } else {
      tween = { t: 0, dur: 1.15, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), ...to };
    }
  }

  window.addEventListener("pgd:screen", (e) => focus(SCREEN_FOCUS[e.detail.screen] || "overview"));
  const overviewBtn = document.getElementById("utaOverview");
  if (overviewBtn) overviewBtn.addEventListener("click", () => focus("overview"));

  /* ---------------------------------------------------------
     Partículas de ar: esfriam ao passar pela serpentina e
     esquentam na resistência — a cor mostra o que a UTA faz
  --------------------------------------------------------- */
  const N = 320;
  const X0 = -0.05 - OFFSET;
  const X1 = 4.7 - OFFSET;
  const COIL_X = 1.62 - OFFSET;
  const HEAT_X = 2.3 - OFFSET;
  const pos = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const seed = (i) => {
    pos[i * 3] = X0 + Math.random() * (X1 - X0);
    pos[i * 3 + 1] = 0.36 + Math.random() * 1.0;
    pos[i * 3 + 2] = -0.42 + Math.random() * 0.84;
  };
  for (let i = 0; i < N; i += 1) seed(i);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pgeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const dotTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.45, "rgba(255,255,255,.8)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const particles = new THREE.Points(pgeo, new THREE.PointsMaterial({
    size: 0.05, vertexColors: true, map: dotTex, transparent: true, depthWrite: false, opacity: 0.85, sizeAttenuation: true,
  }));
  particles.visible = !reduceMotion;
  scene.add(particles);
  const WARM = new THREE.Color("#ff9a4d");
  const COOL = new THREE.Color("#3fb5ff");
  const HOT = new THREE.Color("#ff5a2a");
  const tmp = new THREE.Color();

  /* ---------------------------------------------------------
     Modelo
  --------------------------------------------------------- */
  const parts = {};
  const model = new THREE.Group();
  scene.add(model);

  // geometria comprimida com Draco (3d/export_web.py); texturas em WebP
  const draco = new DRACOLoader().setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/");
  new GLTFLoader().setDRACOLoader(draco).load(
    "models/uta.glb",
    (gltf) => {
      const root = gltf.scene;
      root.position.x = -OFFSET;
      // peças com mais de um material viram um grupo com sub-malhas no glTF:
      // guardamos o nó (é ele que gira) e buscamos os materiais nas malhas filhas
      root.traverse((o) => {
        if (o.name && !parts[o.name]) parts[o.name] = o;
      });
      // UTA: sombras em tempo real. Ambiente (Env_*, Prop_*): luz assada, sem sombra dinâmica.
      root.children.forEach((node) => {
        const isEnv = /^(Env_|Prop_)/.test(node.name);
        node.traverse((m) => {
          if (!m.isMesh) return;
          m.castShadow = !isEnv;
          m.receiveShadow = !isEnv;
          if (/^Env_/.test(node.name) && m.material.map) {
            m.material = new THREE.MeshBasicMaterial({ map: m.material.map });
          }
        });
      });
      ["Coil_Fins", "Pipe_Water", "Heater_Coils", "Panel_Light", "Panel_Display"].forEach((n) => {
        eachMesh(n, (m) => { m.material = m.material.clone(); });
      });
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xe8f1f8, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0,
        clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
      });
      eachMesh("Casing_Glass", (m) => {
        m.material = glassMat;
        m.castShadow = false;
        m.receiveShadow = false;
        m.renderOrder = 2;
        m.userData.noAO = true;
      });
      model.add(root);
      loadingEl.hidden = true;
      focus("overview", true);
    },
    (e) => {
      if (e.total) loadingEl.textContent = `Carregando modelo 3D… ${Math.round((e.loaded / e.total) * 100)}%`;
    },
    () => { loadingEl.textContent = "Não foi possível carregar o modelo 3D."; },
  );

  function eachMesh(name, fn) {
    const o = parts[name];
    if (o) o.traverse((m) => { if (m.isMesh) fn(m); });
  }
  // material da peça; `matName` escolhe entre sub-malhas (ex.: aletas × moldura da serpentina)
  const matCache = {};
  function matOf(name, matName) {
    const key = `${name}/${matName || ""}`;
    if (matCache[key] !== undefined) return matCache[key];
    let found = null;
    eachMesh(name, (m) => { if (!found && (!matName || m.material.name === matName)) found = m.material; });
    if (found) matCache[key] = found;
    return found;
  }

  /* ---------------------------------------------------------
     Animação por frame
  --------------------------------------------------------- */
  let damper = 0;

  function animate(dt, now) {
    const on = s.unitOn;

    // ventilador, damper e válvula
    if (parts.Fan_Impeller && !reduceMotion) parts.Fan_Impeller.rotation.x -= dt * (s.fan / 100) * 14;
    damper += ((on ? 1 : 0) - damper) * Math.min(1, dt * 1.5);
    for (let k = 1; k <= 6; k += 1) {
      const blade = parts[`Damper_Blade_${k}`];
      if (blade) blade.rotation.z = -damper * THREE.MathUtils.degToRad(72);
    }
    if (parts.Valve_Indicator) parts.Valve_Indicator.rotation.y = -(s.valve / 100) * (Math.PI / 2);

    // água gelada circulando e serpentina gelando conforme a válvula
    const v = s.valve / 100;
    const pulse = 0.55 + 0.45 * Math.sin(now * 0.004);
    const fins = matOf("Coil_Fins", "CoilFins");
    if (fins) { fins.emissive.set("#2aa7ff"); fins.emissiveIntensity = v * 0.35; }
    const pipe = matOf("Pipe_Water");
    if (pipe) { pipe.emissive.set("#4fb8ff"); pipe.emissiveIntensity = v * 0.08 * pulse; }
    const heat = matOf("Heater_Coils");
    if (heat) { heat.emissive.set("#ff4a1a"); heat.emissiveIntensity = (s.resist / 100) * 2.2; }
    const lamp = matOf("Panel_Light");
    if (lamp) {
      const alarm = s.alarms.some((a) => a.active);
      const blinkOn = Math.floor(now / 450) % 2 === 0;
      if (!on) { lamp.color.set("#4b5158"); lamp.emissive.set("#000000"); }
      else if (alarm) { lamp.color.set("#ff3b30"); lamp.emissive.set("#ff3b30"); lamp.emissiveIntensity = blinkOn ? 2 : 0.1; }
      else { lamp.color.set("#1fbf5a"); lamp.emissive.set("#1fbf5a"); lamp.emissiveIntensity = 1.4; }
    }
    const screen = matOf("Panel_Display");
    if (screen) screen.emissiveIntensity = on ? 0.7 : 0.15;

    // partículas: velocidade ∝ vazão
    if (particles.visible) {
      const speed = (s.flow / 2800) * 1.6;
      const cool = v * 0.9;
      const hot = s.resist / 100;
      for (let i = 0; i < N; i += 1) {
        let x = pos[i * 3] + dt * speed * (0.8 + (i % 5) * 0.08);
        if (x > X1) { seed(i); x = X0; }
        pos[i * 3] = x;
        if (x < COIL_X) tmp.copy(WARM);
        else {
          tmp.copy(WARM).lerp(COOL, Math.min(1, cool * Math.min(1, (x - COIL_X) / 0.25)));
          if (x > HEAT_X && hot > 0) tmp.lerp(HOT, hot * Math.min(1, (x - HEAT_X) / 0.2));
        }
        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
      }
      pgeo.attributes.position.needsUpdate = true;
      pgeo.attributes.color.needsUpdate = true;
      particles.material.opacity = on && s.flow > 50 ? 0.85 : 0.25;
    }

    // câmera
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      const k = easeInOut(tween.t);
      camera.position.lerpVectors(tween.fromPos, tween.pos, k);
      controls.target.lerpVectors(tween.fromTarget, tween.target, k);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
  }

  /* ---------------------------------------------------------
     Tamanho, visibilidade e laço de renderização
  --------------------------------------------------------- */
  /* ---------------------------------------------------------
     Pós-processamento: oclusão ambiente (GTAO) no desktop
  --------------------------------------------------------- */
  const lowPower = window.matchMedia("(pointer: coarse)").matches;
  let composer = null;
  if (!lowPower) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 16 });
    gtao.blendIntensity = 0.85;
    // o vidro das portas não deve "escurecer" o que está atrás dele
    const hideForAO = gtao.overrideVisibility.bind(gtao);
    gtao.overrideVisibility = () => {
      hideForAO();
      scene.traverse((o) => { if (o.userData.noAO) o.visible = false; });
    };
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!tween) focus(focusKey, true);
  }
  new ResizeObserver(resize).observe(canvas);

  let running = false;
  let visible = false;
  let last = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    animate(dt, now);
    if (composer) composer.render(dt);
    else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function sync() {
    const should = visible && !document.hidden;
    if (should === running) return;
    running = should;
    if (running) {
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: 0.05 }).observe(host);
  document.addEventListener("visibilitychange", sync);

  controls.addEventListener("start", () => { tween = null; host.classList.add("is-dragging"); });
  controls.addEventListener("end", () => host.classList.remove("is-dragging"));
  resize();
}
