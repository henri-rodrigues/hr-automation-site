// =========================================================
// HR AUTOMATION — formulário de orçamento
// Todo link para #orcamento (header, hero, faixa azul, "Saiba mais" dos cards)
// abre o formulário. O envio vai por e-mail via FormSubmit (formsubmit.co),
// que repassa para a caixa abaixo — o site é estático (GitHub Pages).
// No primeiro envio o FormSubmit manda um e-mail "Activate Form" para essa
// caixa; depois de ativado, cada pedido chega formatado em tabela.
// =========================================================
(function () {
  "use strict";

  const TO = "henrir.automation@gmail.com";
  const ENDPOINT = `https://formsubmit.co/ajax/${TO}`;

  const dialog = document.getElementById("quoteDialog");
  const form = document.getElementById("quoteForm");
  if (!dialog || !form || typeof dialog.showModal !== "function") return;

  const done = document.getElementById("quoteDone");
  const status = document.getElementById("quoteStatus");
  const submit = document.getElementById("quoteSubmit");
  const label = submit.querySelector(".btn__label");
  let opener = null;

  function open(service) {
    form.hidden = false;
    done.hidden = true;
    status.textContent = "";
    status.className = "quote-form__status";
    if (service) {
      form.querySelectorAll('input[name="servicos"]').forEach((c) => {
        if (c.value === service) c.checked = true;
      });
    }
    dialog.showModal();
    setTimeout(() => form.elements.nome.focus({ preventScroll: true }), 60);
  }
  function close() {
    dialog.close();
  }

  // qualquer link/botão para #orcamento abre o formulário
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest('a[href="#orcamento"], [data-quote]');
    if (!trigger) return;
    e.preventDefault();
    opener = trigger;
    const card = trigger.closest(".solution-card");
    const service = card ? card.querySelector("h3").textContent.trim() : null;
    open(service);
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-quote-close]")) close();
  });
  dialog.addEventListener("close", () => {
    if (opener) opener.focus({ preventScroll: true });
    if (!done.hidden) form.reset();
  });
  if (location.hash === "#orcamento") open();

  // validação simples
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  form.querySelectorAll("input, textarea").forEach((el) => {
    el.addEventListener("input", () => el.closest(".field")?.classList.remove("is-invalid"));
  });
  function validate() {
    let first = null;
    ["nome", "email", "telefone"].forEach((name) => {
      const el = form.elements[name];
      const v = el.value.trim();
      const bad = !v || (name === "email" && !EMAIL.test(v)) || (name === "telefone" && v.replace(/\D/g, "").length < 10);
      el.closest(".field").classList.toggle("is-invalid", bad);
      if (bad && !first) first = el;
    });
    if (first) first.focus();
    return !first;
  }

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = `quote-form__status${kind ? ` is-${kind}` : ""}`;
  }

  function data() {
    const get = (k) => (form.elements[k] ? form.elements[k].value.trim() : "");
    const services = [...form.querySelectorAll('input[name="servicos"]:checked')].map((c) => c.value);
    return {
      Nome: get("nome"),
      Empresa: get("empresa") || "-",
      email: get("email"),
      Telefone: get("telefone"),
      "Cidade/UF": get("cidade") || "-",
      "Serviços": services.length ? services.join(", ") : "-",
      Mensagem: get("mensagem") || "-",
      _subject: `Orçamento pelo site — ${get("nome")}${get("empresa") ? ` (${get("empresa")})` : ""}`,
      _replyto: get("email"),
      _template: "table",
      _captcha: "false",
    };
  }

  // se o serviço de envio falhar, oferece o mesmo pedido pronto no e-mail do visitante
  function mailtoFallback(d) {
    const body = Object.entries(d)
      .filter(([k]) => !k.startsWith("_"))
      .map(([k, v]) => `${k === "email" ? "E-mail" : k}: ${v}`)
      .join("\n");
    return `mailto:${TO}?subject=${encodeURIComponent(d._subject)}&body=${encodeURIComponent(body)}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) {
      setStatus("Preencha nome, e-mail e telefone.", "error");
      return;
    }
    // campo invisível: se veio preenchido, é robô
    if (form.elements._honey.value) {
      form.hidden = true;
      done.hidden = false;
      return;
    }
    const d = data();
    submit.disabled = true;
    label.textContent = "Enviando…";
    setStatus("");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(d),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || String(json.success) !== "true") throw new Error(json.message || res.statusText);
      form.hidden = true;
      done.hidden = false;
    } catch (err) {
      status.className = "quote-form__status is-error";
      status.innerHTML = "";
      status.append("Não foi possível enviar agora. ");
      const a = document.createElement("a");
      a.href = mailtoFallback(d);
      a.textContent = "Enviar pelo seu e-mail";
      status.append(a);
    } finally {
      submit.disabled = false;
      label.textContent = "Enviar solicitação";
    }
  });
})();
