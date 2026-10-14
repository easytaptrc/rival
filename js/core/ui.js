// Utilidades de interfaz compartidas: DOM, íconos, toasts, modales, formato, 3D, notificaciones.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- Íconos (trazos estilo lucide) ----------
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  desk: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  finger: '<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  staff: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/><path d="m18 4 2 2 3-3"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  ticket: '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  door: '<path d="M13 4h3a2 2 0 0 1 2 2v14M2 20h3M13 20h9M10 12v.01"/><path d="M13 4.56v16.88a.5.5 0 0 1-.68.47L5 19V5.13a1 1 0 0 1 .76-.97l6-1.5a1 1 0 0 1 1.24.97z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M9.9 4.24A9 9 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-2.16 3.19M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M14.12 14.12a3 3 0 1 1-4.24-4.24"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  alert: '<path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  map: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  youtube: '<path d="M2.5 17a24 24 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.6 49.6 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24 24 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.6 49.6 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/>',
  tiktok: '<path d="M16 3c.3 2.6 2 4.3 4.5 4.5v3.3a8 8 0 0 1-4.5-1.4V15a6 6 0 1 1-6-6v3.4a2.6 2.6 0 1 0 2.6 2.6V3z"/>',
  whatsapp: '<path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9z"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
};
export function icon(name, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`;
}

// ---------- Marca ----------
export const LOGO_PATH = "M313 193H885A161.5 161.5 0 0 1 885 516H746L886 760L1211 193H1286L886 885L637 452H880A95 95 0 0 0 880 262H428L837 974L800 1041Z";
export function logoSvg(color = "var(--brand)") {
  return `<svg viewBox="300 180 1000 875" aria-hidden="true"><path fill="${color}" d="${LOGO_PATH}"/></svg>`;
}
export function wordmarkSvg(color = "var(--brand)") {
  return `<svg viewBox="60 45 1480 260" aria-label="RIVAL" role="img"><g fill="${color}"><path d="M78 60H183A75 75 0 0 1 209 205L258 289H210L142 172H178A37 37 0 0 0 178 98H101Z"/><path d="M431 101L472 60V289H431Z"/><path d="M646 60H693L787 245L762 289Z"/><path d="M961 289L1077 60L1193 289H1145L1077 154L1009 289Z"/><path d="M1366 60L1407 101V247H1499L1522 289H1366Z"/></g></svg>`;
}
/** Logo con extrusión 3D real: capas apiladas en Z. */
export function logo3d(size = 120, depth = 14, cls = "") {
  const layers = [];
  for (let i = depth; i >= 0; i--) {
    const shade = i === 0 ? "var(--brand)" : `color-mix(in srgb, var(--brand) ${Math.round(28 + (1 - i / depth) * 30)}%, #000)`;
    layers.push(`<div class="layer" style="transform: translateZ(${-i * 1.6}px)">${logoSvg(shade)}</div>`);
  }
  return `<div class="logo3d ${cls}" style="--size:${typeof size === "number" ? size + "px" : size}">${layers.join("")}</div>`;
}
export function brandMark(sub = "Gym") {
  return `<div class="brand-mark"><div class="bm-logo">${logoSvg()}</div><div><div class="bm-name">RIVAL</div><div class="bm-sub">${esc(sub)}</div></div></div>`;
}

/** Aplica colores guardados en configuración. */
export function applyTheme(colors = {}) {
  const r = document.documentElement.style;
  if (colors.primary && /^#[0-9a-f]{6}$/i.test(colors.primary)) {
    r.setProperty("--brand", colors.primary);
    r.setProperty("--brand-2", `color-mix(in srgb, ${colors.primary} 82%, #fff)`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colors.bg || "#0a0a0c");
  }
  if (colors.bg && /^#[0-9a-f]{6}$/i.test(colors.bg)) {
    r.setProperty("--bg", colors.bg);
    r.setProperty("--bg-2", `color-mix(in srgb, ${colors.bg} 88%, #fff)`);
    r.setProperty("--surface", `color-mix(in srgb, ${colors.bg} 92%, #fff)`);
    r.setProperty("--surface-2", `color-mix(in srgb, ${colors.bg} 88%, #fff)`);
    r.setProperty("--surface-3", `color-mix(in srgb, ${colors.bg} 82%, #fff)`);
  }
  try { localStorage.setItem("rival.theme", JSON.stringify(colors)); } catch {}
}
export function applyCachedTheme() {
  try { const c = JSON.parse(localStorage.getItem("rival.theme") || "null"); if (c) applyTheme(c); } catch {}
}

// ---------- Formato ----------
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
export const fmtMoney = (n) => money.format(Number(n) || 0);
export const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null);
export function fmtDate(v, opts = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!v) return "—";
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T00:00:00") : toDate(v);
  return d ? d.toLocaleDateString("es-MX", opts) : "—";
}
export function fmtTime(v) {
  const d = toDate(v);
  return d ? d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—";
}
export function fmtDateTime(v) {
  const d = toDate(v);
  return d ? d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}
export function timeAgo(v) {
  const d = toDate(v);
  if (!d) return "ahora";
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 50) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}
export function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
}
export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

// ---------- Toasts ----------
let toastBox;
export function toast(msg, type = "info", title = "") {
  if (!toastBox) { toastBox = h('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.append(toastBox); }
  const t = h(`<div class="toast ${type}"><span class="t-bar"></span><div>${title ? `<b>${esc(title)}</b>` : ""}${esc(msg)}</div></div>`);
  toastBox.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, type === "bad" ? 6000 : 3800);
}

// ---------- Modales ----------
export function modal({ title = "", body = "", foot = "", wide = false, onClose } = {}) {
  const back = h(`<div class="modal-back" role="dialog" aria-modal="true">
    <div class="modal ${wide ? "wide" : ""}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="btn ghost sm icon" data-close aria-label="Cerrar">${icon("x")}</button></div>
      <div class="modal-body"></div>
      ${foot !== null ? `<div class="modal-foot"></div>` : ""}
    </div></div>`);
  const b = back.querySelector(".modal-body");
  typeof body === "string" ? (b.innerHTML = body) : b.append(body);
  const f = back.querySelector(".modal-foot");
  if (f) typeof foot === "string" ? (f.innerHTML = foot) : f.append(foot);
  if (f && !f.innerHTML.trim()) f.remove();
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); onClose?.(); };
  const onKey = (e) => e.key === "Escape" && close();
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  back.querySelectorAll("[data-close]").forEach((x) => x.addEventListener("click", close));
  document.addEventListener("keydown", onKey);
  document.body.append(back);
  setTimeout(() => back.querySelector("input:not([type=hidden]),select,textarea")?.focus(), 60);
  return { el: back, body: b, close, $: (s) => back.querySelector(s) };
}

export function confirmDialog(message, { title = "Confirmar", ok = "Confirmar", danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title, body: `<p class="muted" style="margin:0">${esc(message)}</p>`,
      foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(ok)}</button>`,
      onClose: () => !done && resolve(false),
    });
    m.$("[data-ok]").addEventListener("click", () => { done = true; m.close(); resolve(true); });
  });
}

/** Ejecuta una acción async mostrando estado de carga en el botón. */
export async function busy(btn, fn) {
  btn?.classList.add("loading");
  try { return await fn(); } finally { btn?.classList.remove("loading"); }
}

export function formData(form) {
  const o = {};
  for (const [k, v] of new FormData(form).entries()) o[k] = typeof v === "string" ? v.trim() : v;
  return o;
}

// ---------- 3D / movimiento ----------
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
export function enableTilt(root = document, max = 6) {
  if (reduced || matchMedia("(hover: none)").matches) return;
  root.querySelectorAll(".tilt:not([data-tilt])").forEach((el) => {
    el.dataset.tilt = "1";
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${-y * max}deg) rotateY(${x * max}deg) translateZ(0)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });
}
export function enableReveal(root = document) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
  root.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
}
export function countUp(el, to, { money: isMoney = false, dur = 900 } = {}) {
  const from = 0, t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur), v = from + (to - from) * (1 - Math.pow(1 - p, 3));
    el.textContent = isMoney ? fmtMoney(v) : Math.round(v).toLocaleString("es-MX");
    if (p < 1 && !reduced) requestAnimationFrame(step); else el.textContent = isMoney ? fmtMoney(to) : Number(to).toLocaleString("es-MX");
  };
  requestAnimationFrame(step);
}

// ---------- PWA / notificaciones ----------
export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("./sw.js"); } catch (e) { console.warn("SW", e); return null; }
}
export function notifPermission() {
  return "Notification" in window ? Notification.permission : "unsupported";
}
export async function askNotifications() {
  if (!("Notification" in window)) { toast("Este navegador no soporta notificaciones.", "warn"); return "unsupported"; }
  const r = await Notification.requestPermission();
  if (r === "granted") toast("Notificaciones activadas.", "ok");
  else if (r === "denied") toast("Las notificaciones están bloqueadas. Actívalas desde el candado de la barra de direcciones.", "warn");
  return r;
}
/** Notificación del sistema (vía service worker para que funcione también con la app en segundo plano). */
export async function notify(title, body, { tag, url, silent = false } = {}) {
  if (!silent) beep();
  navigator.vibrate?.([120, 60, 120]);
  if (notifPermission() !== "granted") return;
  const opts = { body, tag, renotify: !!tag, icon: "assets/img/icon-192.png", badge: "assets/img/badge-96.png", data: { url: url || location.href } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, opts);
  } catch {}
  try { new Notification(title, opts); } catch {}
}
export function setBadge(n) {
  try { n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.(); } catch {}
  const base = document.title.replace(/^\(\d+\)\s*/, "");
  document.title = n ? `(${n}) ${base}` : base;
}
let actx;
export function beep(kind = "ping") {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const tones = { ping: [[880, 0], [1320, 0.12]], ok: [[660, 0], [990, 0.1]], bad: [[220, 0], [180, 0.16]] }[kind] || [[880, 0]];
    tones.forEach(([f, at]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = kind === "bad" ? "square" : "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, actx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.18, actx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + at + 0.22);
      o.connect(g).connect(actx.destination); o.start(actx.currentTime + at); o.stop(actx.currentTime + at + 0.25);
    });
  } catch {}
}

/** Descarga un archivo generado en el navegador. */
export function downloadFile(name, content, type = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function toCSV(rows) {
  return "﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
