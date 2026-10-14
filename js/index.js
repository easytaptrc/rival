// Portal público de socios.
import { app, db, doc, getDoc, onSnapshot } from "./firebase.js";
import { $, $$, esc, icon, logoSvg, wordmarkSvg, logo3d, applyTheme, applyCachedTheme, fmtDate, fmtMoney, toast, enableTilt, enableReveal, registerSW, notify, notifPermission, beep } from "./core/ui.js";
import { normalizeMemberCode, memberStatus, daysLeft, parseYmd, DEFAULT_PLANS } from "./core/membership.js";

applyCachedTheme();
registerSW();

// ---------- Marca ----------
$$("[data-logo]").forEach((el) => (el.innerHTML = logoSvg()));
$("[data-wordmark]").innerHTML = wordmarkSvg("#fff");
$("[data-wordmark-big]").innerHTML = wordmarkSvg("var(--brand)");
$("[data-logo3d]").innerHTML = logo3d("clamp(110px, 32vw, 170px)", 18);
$$("[data-ico]").forEach((el) => (el.innerHTML = icon(el.dataset.ico)));
$("#burger").innerHTML = icon("menu");
$("#installClose").innerHTML = icon("x");
$("#year").textContent = new Date().getFullYear();

// ---------- Navegación ----------
const nav = $("#nav"), links = $("#navLinks"), burger = $("#burger");
const onScroll = () => nav.classList.toggle("solid", scrollY > 30);
addEventListener("scroll", onScroll, { passive: true }); onScroll();
burger.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  burger.setAttribute("aria-expanded", open);
  burger.innerHTML = icon(open ? "x" : "menu");
});
links.addEventListener("click", (e) => { if (e.target.closest("a")) { links.classList.remove("open"); burger.innerHTML = icon("menu"); } });
const navObserver = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  const id = e.target.id === "consulta" ? "inicio" : e.target.id;
  $$("a", links).forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${id}`));
}), { rootMargin: "-45% 0px -50% 0px" });
$$("main section[id]").forEach((s) => navObserver.observe(s));

// Parallax 3D del hero
const heroImg = $(".hero-bg img"), heroInner = $(".hero-inner");
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  addEventListener("scroll", () => {
    const y = Math.min(scrollY, innerHeight);
    heroImg.style.transform = `scale(1.08) translateY(${y * 0.25}px)`;
    heroInner.style.transform = `translateY(${y * 0.12}px)`;
    heroInner.style.opacity = String(1 - y / (innerHeight * 0.9));
  }, { passive: true });
  if (matchMedia("(hover: hover)").matches) {
    $(".hero").addEventListener("pointermove", (e) => {
      const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
      $(".hero-logo").style.transform = `rotateY(${x * 30}deg) rotateX(${-y * 20}deg)`;
    });
  }
}

// ---------- Configuración pública (redes, horarios, planes, colores) ----------
const DEFAULTS = {
  gymName: "RIVAL Gym",
  slogan: "Disciplina hoy|Resultados siempre",
  about: "",
  address: "",
  phone: "",
  whatsapp: "",
  social: {},
  hours: [
    { days: "Lunes a viernes", time: "05:00 – 23:00" },
    { days: "Sábado", time: "07:00 – 20:00" },
    { days: "Domingo", time: "08:00 – 14:00" },
  ],
  plans: DEFAULT_PLANS.map((p) => ({ name: p.name, price: p.price, days: p.days, featured: p.id === "mensual" })),
};
let settings = DEFAULTS;
let warnDays = 3;

onSnapshot(doc(db, "settings", "public"), (snap) => {
  settings = { ...DEFAULTS, ...(snap.data() || {}) };
  warnDays = settings.warnDays ?? 3;
  applyTheme(settings.colors || {});
  renderSettings();
}, (e) => { console.warn(e); renderSettings(); });

function renderSettings() {
  const s = settings;
  $$("[data-gymname]").forEach((el) => (el.textContent = s.gymName || "RIVAL Gym"));
  if (s.about) $("[data-about]").textContent = s.about;
  const [l1, l2] = String(s.slogan || DEFAULTS.slogan).split("|");
  $("[data-slogan]").innerHTML = `${esc(l1)}${l2 ? `<br>${esc(l2)}` : ""}`;
  $("[data-address]").textContent = s.address || "Visítanos en recepción.";

  // Anuncio superior
  $(".announce")?.remove();
  if (s.announcement) document.body.insertAdjacentHTML("afterbegin", `<div class="announce">${esc(s.announcement)}</div>`);

  // Redes
  const soc = s.social || {};
  const net = [["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["youtube", "YouTube"]];
  const sHtml = net.filter(([k]) => safeUrl(soc[k])).map(([k, n]) => `<a href="${esc(safeUrl(soc[k]))}" target="_blank" rel="noopener" aria-label="${n}">${icon(k)}</a>`).join("");
  $$("[data-socials]").forEach((el) => (el.innerHTML = sHtml));

  // Contacto
  const acts = [];
  if (safeUrl(soc.maps)) acts.push(`<a class="btn primary" href="${esc(safeUrl(soc.maps))}" target="_blank" rel="noopener">${icon("map")} Cómo llegar</a>`);
  if (s.whatsapp) acts.push(`<a class="btn" href="https://wa.me/${esc(String(s.whatsapp).replace(/\D/g, ""))}" target="_blank" rel="noopener">${icon("whatsapp")} WhatsApp</a>`);
  if (s.phone) acts.push(`<a class="btn" href="tel:${esc(String(s.phone).replace(/[^\d+]/g, ""))}">${icon("phone")} Llamar</a>`);
  $("#contactActions").innerHTML = acts.join("") || `<span class="dim small">Pronto publicaremos nuestros datos de contacto.</span>`;
  const embed = safeUrl(s.mapsEmbed);
  $("#mapEmbed").hidden = !embed || !/google\.[^/]+\/maps\/embed/.test(embed);
  if (!$("#mapEmbed").hidden) $("#mapEmbed").innerHTML = `<iframe src="${esc(embed)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Mapa"></iframe>`;

  // Horarios
  const dayIdx = new Date().getDay();
  const matchToday = (txt) => {
    const t = txt.toLowerCase();
    const names = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    if (t.includes(names[dayIdx]) || t.includes(names[dayIdx].normalize("NFD").replace(/\p{Diacritic}/gu, ""))) return true;
    return /lunes a viernes/.test(t) && dayIdx >= 1 && dayIdx <= 5 || /lunes a s[aá]bado/.test(t) && dayIdx >= 1 && dayIdx <= 6;
  };
  $("#hours").innerHTML = (s.hours || []).map((r) => `<li class="${matchToday(r.days || "") ? "today" : ""}"><span>${esc(r.days)}</span><span class="mono muted">${esc(r.time)}</span></li>`).join("");

  // Planes
  const plans = (s.plans?.length ? s.plans : DEFAULTS.plans);
  $("#plans").innerHTML = plans.map((p) => {
    const unit = p.days === 1 ? "/ día" : p.days === 7 ? "/ semana" : p.days >= 360 ? "/ año" : p.days >= 85 ? "/ 3 meses" : "/ mes";
    const feats = (p.features?.length ? p.features : [p.days === 1 ? "Acceso por un día" : `${p.days} días de acceso`, "Todas las áreas", "Acceso con huella"]);
    return `<article class="plan tilt reveal ${p.featured ? "featured" : ""}">
      ${p.featured ? `<span class="badge brand p-tag">Popular</span>` : ""}
      <div class="p-name">${esc(p.name)}</div>
      <div class="p-price">${fmtMoney(p.price).replace(/\.00$/, "")} <small>${unit}</small></div>
      <ul>${feats.map((f) => `<li>${icon("check")}<span>${esc(f)}</span></li>`).join("")}</ul>
      <a href="#contacto" class="btn ${p.featured ? "primary" : ""} block">Lo quiero</a>
    </article>`;
  }).join("");
  enableTilt(); enableReveal();
}

function safeUrl(u) {
  if (!u) return "";
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; }
}

// ---------- Consulta de membresía ----------
const form = $("#checkForm"), input = $("#memberId"), remember = $("#remember"), result = $("#result");
try {
  const saved = localStorage.getItem("rival.memberId");
  if (saved) { input.value = saved; remember.checked = true; setTimeout(() => lookup(saved, true), 400); }
} catch {}
const qp = new URLSearchParams(location.search).get("id");
if (qp) { input.value = qp; setTimeout(() => lookup(qp), 300); }

remember.addEventListener("change", () => {
  try { remember.checked && input.value ? localStorage.setItem("rival.memberId", input.value.trim()) : localStorage.removeItem("rival.memberId"); } catch {}
});
form.addEventListener("submit", (e) => { e.preventDefault(); lookup(input.value); });

let lastLookup = 0;
async function lookup(raw, quiet = false) {
  const code = normalizeMemberCode(raw);
  if (!code) { toast("Escribe un ID válido, por ejemplo RIV-00284.", "warn"); return; }
  if (Date.now() - lastLookup < 1500) return; // freno simple contra consultas en ráfaga
  lastLookup = Date.now();
  input.value = code;
  const btn = form.querySelector("button"); btn.classList.add("loading");
  try {
    const snap = await getDoc(doc(db, "publicStatus", code));
    if (remember.checked) try { localStorage.setItem("rival.memberId", code); } catch {}
    if (!snap.exists()) { renderCard(null, code); if (!quiet) beep("bad"); return; }
    renderCard(snap.data(), code);
  } catch (e) {
    console.error(e);
    toast("No pudimos consultar en este momento. Intenta de nuevo.", "bad");
  } finally { btn.classList.remove("loading"); }
}

function renderCard(m, code) {
  const st = memberStatus(m, { warnDays });
  const cls = !m ? "st-bad" : st.code === "activo" ? "st-ok" : st.code === "por_vencer" ? "st-warn" : "st-bad";
  const badge = { activo: "ok", por_vencer: "warn" }[st.code] || "bad";
  const total = m?.start && m?.end ? Math.max(1, Math.round((parseYmd(m.end) - parseYmd(m.start)) / 86400000) + 1) : 30;
  const left = m ? Math.max(0, daysLeft(m.end) + 1) : 0;
  const pct = Math.max(0, Math.min(1, left / total));
  result.innerHTML = `<div class="member-card flip tilt ${cls}">
    <div class="mc-top"><span class="mc-logo">${logoSvg()}</span><span class="badge ${badge}">${m ? esc(st.label) : "No encontrado"}</span></div>
    <div class="mc-ring">
      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="ring-bg"/><circle cx="60" cy="60" r="52" class="ring-fg" stroke-dasharray="326.7" stroke-dashoffset="326.7"/></svg>
      <div class="ring-label"><b>${m ? left : "!"}</b><span>${m ? (left === 1 ? "día restante" : "días restantes") : "sin registro"}</span></div>
    </div>
    <div class="mc-name">${m ? esc(m.name || "Socio") : "ID no encontrado"}</div>
    ${m ? `<div class="mc-rows">
      <div><span>ID de socio</span><b class="mono">${esc(code)}</b></div>
      <div><span>Tipo</span><b>${esc(m.planName || m.plan || "—")}</b></div>
      <div><span>Inicio</span><b>${fmtDate(m.start)}</b></div>
      <div><span>Vence</span><b>${fmtDate(m.end)}</b></div>
      <div><span>Acceso</span><b style="color:var(--${st.allowed ? "ok" : "bad"})">${st.allowed ? "Permitido" : "Bloqueado"}</b></div>
    </div>` : `<p class="dim small" style="margin:0">Revisa que el ID sea correcto o acude a recepción.</p>`}
  </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const fg = result.querySelector(".ring-fg");
    if (fg) fg.style.strokeDashoffset = String(326.7 * (1 - pct));
  }));
  enableTilt(result);
  if (!m) result.firstElementChild.classList.add("shake");
  if (m && st.code === "por_vencer") {
    toast(`Tu membresía ${st.label.toLowerCase()}. Renueva en recepción para no perder tu acceso.`, "warn", "Aviso");
    if (notifPermission() === "granted") notify("Tu membresía está por vencer", `${st.label}. Renueva en recepción.`, { tag: "expira", silent: true });
  }
  if (m && !st.allowed) toast("Tu acceso está bloqueado. Acude a recepción para renovar.", "bad");
}

// ---------- Instalación PWA ----------
let deferred;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferred = e;
  try { if (localStorage.getItem("rival.installDismissed")) return; } catch {}
  $("#installBar").hidden = false;
});
$("#installBtn").addEventListener("click", async () => { $("#installBar").hidden = true; await deferred?.prompt(); deferred = null; });
$("#installClose").addEventListener("click", () => { $("#installBar").hidden = true; try { localStorage.setItem("rival.installDismissed", "1"); } catch {} });

// Analytics opcional (solo si el navegador lo soporta y no bloquea cookies)
import("https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js")
  .then(async ({ getAnalytics, isSupported }) => { if (await isSupported()) getAnalytics(app); })
  .catch(() => {});
