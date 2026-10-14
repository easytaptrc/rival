// Panel de control RIVAL: sesión, navegación por permisos, avisos en tiempo real.
import { db, collection, query, orderBy, limit, onSnapshot, doc } from "../firebase.js";
import { $, $$, h, esc, icon, brandMark, applyTheme, applyCachedTheme, initials, toast, registerSW, notify, notifPermission, askNotifications, setBadge, fmtDate, toDate, beep } from "../core/ui.js";
import { mountAuth, permsOf, ROLES, logout, recordAttendance } from "../core/auth.js";
import { registerPush } from "../core/push.js";
import { state, startSync, onState, statusOf, fullName } from "./data.js";

applyCachedTheme();
registerSW();

const ROUTES = [
  { id: "inicio", label: "Inicio", ico: "home", perm: "dashboard", mod: () => import("./views/dashboard.js") },
  { id: "recepcion", label: "Recepción", ico: "desk", perm: "reception", mod: () => import("./views/reception.js") },
  { id: "socios", label: "Socios", ico: "users", perm: "members", mod: () => import("./views/members.js") },
  { id: "acceso", label: "Acceso y asistencia", ico: "finger", perm: "access", mod: () => import("./views/access.js") },
  { id: "ventas", label: "Ventas y caja", ico: "cash", perm: "sales", mod: () => import("./views/sales.js") },
  { id: "insumos", label: "Insumos", ico: "box", perm: "supplies", mod: () => import("./views/supplies.js") },
  { id: "inventario", label: "Inventario", ico: "clipboard", perm: "inventory", mod: () => import("./views/inventory.js") },
  { id: "personal", label: "Personal", ico: "staff", perm: "staff", mod: () => import("./views/staff.js") },
  { id: "reportes", label: "Reportes", ico: "chart", perm: "reports", mod: () => import("./views/reports.js") },
  { id: "configuracion", label: "Configuración", ico: "settings", perm: "settings", mod: () => import("./views/settings.js") },
];

const root = $("#app");
let stopSync, cleanupView, perms, unsubs = [];

mountAuth({
  root,
  appName: "Panel de control",
  subtitle: "Rival · Panel de control",
  heroText: "Tu gimnasio, bajo control.",
  allow: (p) => ["dueno", "gerente", "recepcion"].includes(p.role) || permsOf(p).has("dashboard") || permsOf(p).has("reception"),
  onReady: start,
  onSignedOut: () => { stopSync?.(); unsubs.forEach((u) => u()); unsubs = []; cleanupView?.(); },
});

async function start(profile) {
  state.profile = profile;
  perms = permsOf(profile);
  stopSync = startSync();
  renderShell();
  addEventListener("hashchange", route);
  route();
  watchAccessFeed();
  watchRequests();
  watchDevice();
  onState((w) => { if (w === "pub") applyTheme(state.pub.colors || {}); });
  if (notifPermission() === "granted") registerPush(profile);
  // Asistencia automática al iniciar sesión (una vez por día y por usuario)
  setTimeout(async () => {
    if (state.app.attendanceOnLogin === false || profile.role === "dueno") return;
    const key = `rival.att.${profile.uid}.${new Date().toDateString()}`;
    try { if (localStorage.getItem(key)) return; } catch {}
    try {
      const t = await recordAttendance(profile, "inicio de sesión", "entrada");
      localStorage.setItem(key, "1");
      toast(`Se registró tu ${t} automáticamente.`, "ok", "Asistencia");
    } catch (e) { console.warn("asistencia", e); }
  }, 1500);
}

function allowedRoutes() { return ROUTES.filter((r) => perms.has(r.perm)); }

function renderShell() {
  const p = state.profile;
  const routes = allowedRoutes();
  root.innerHTML = `<div class="shell">
    <aside class="side" id="side">
      ${brandMark("Gym management")}
      <div class="side-label">Gestión</div>
      ${routes.map((r) => `<a class="nav-item" href="#/${r.id}" data-route="${r.id}">${icon(r.ico)}<span>${r.label}</span>${r.id === "insumos" ? `<span class="count" data-req-count hidden></span>` : ""}</a>`).join("")}
      <div class="side-label">Vistas independientes</div>
      <a class="nav-item" href="index.html" target="_blank" rel="noopener">${icon("chevron")}<span>Portal de socios</span></a>
      ${perms.has("maintenance") ? `<a class="nav-item" href="insumos.html" target="_blank" rel="noopener">${icon("chevron")}<span>Mantenimiento</span></a>` : ""}
      <div class="side-foot">
        <div class="sys-card"><div class="row"><span class="dot off" data-dev-dot></span><b data-dev-title>Torniquete</b></div><div class="dim" data-dev-text style="margin-top:4px">Buscando bridge…</div></div>
        <div class="me"><div class="avatar">${esc(initials(p.name))}</div><div class="grow"><div class="truncate" style="font-weight:600;font-size:13.5px">${esc(p.name)}</div><div class="dim xs">${esc(ROLES[p.role]?.label || p.role)}</div></div>
          <button class="btn ghost sm icon" id="logoutBtn" title="Cerrar sesión" aria-label="Cerrar sesión">${icon("logout")}</button></div>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main">
      <header class="top">
        <button class="btn ghost icon burger" id="burger" aria-label="Menú">${icon("menu")}</button>
        <div class="crumbs">RIVAL <span>/</span> <b id="crumb">Inicio</b></div>
        <div class="grow"></div>
        <button class="btn ghost icon" id="notifBtn" title="Notificaciones">${icon("bell")}</button>
        <span class="badge plain hide-sm">${esc(ROLES[p.role]?.label || p.role)}</span>
      </header>
      <main class="content" id="view"></main>
    </div>
  </div>`;
  const side = $("#side"), scrim = $("#scrim");
  const closeSide = () => { side.classList.remove("open"); scrim.classList.remove("show"); };
  $("#burger").addEventListener("click", () => { side.classList.add("open"); scrim.classList.add("show"); });
  scrim.addEventListener("click", closeSide);
  side.addEventListener("click", (e) => e.target.closest("a") && closeSide());
  $("#logoutBtn").addEventListener("click", () => logout());
  const meBox = $(".me .grow");
  meBox.style.cursor = "pointer"; meBox.title = "Cambiar mi contraseña";
  meBox.addEventListener("click", async () => (await import("./account.js")).changePasswordDialog());
  const nb = $("#notifBtn");
  const paintNb = () => { nb.style.color = notifPermission() === "granted" ? "var(--ok)" : ""; nb.title = notifPermission() === "granted" ? "Notificaciones activas" : "Activar notificaciones"; };
  paintNb();
  nb.addEventListener("click", async () => {
    if (notifPermission() === "granted") { notify("RIVAL", "Las notificaciones funcionan correctamente.", { tag: "test" }); return; }
    await askNotifications(); paintNb();
    if (notifPermission() === "granted") registerPush(state.profile);
  });
}

async function route() {
  const routes = allowedRoutes();
  const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1];
  const r = routes.find((x) => x.id === id) || routes[0];
  if (!r) { $("#view").innerHTML = `<div class="empty">Tu usuario no tiene módulos asignados.</div>`; return; }
  if (r.id !== id) { history.replaceState(null, "", `#/${r.id}`); }
  $$("[data-route]").forEach((a) => a.classList.toggle("on", a.dataset.route === r.id));
  $("#crumb").textContent = r.label;
  document.title = `RIVAL · ${r.label}`;
  cleanupView?.(); cleanupView = null;
  const view = $("#view");
  view.innerHTML = `<div class="skeleton" style="height:40px;width:260px"></div><div class="grid g4">${'<div class="skeleton" style="height:120px"></div>'.repeat(4)}</div>`;
  try {
    const mod = await r.mod();
    view.innerHTML = "";
    view.scrollTop = 0; scrollTo(0, 0);
    cleanupView = (await mod.render(view, { profile: state.profile, perms, go: (x) => (location.hash = `#/${x}`) })) || null;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><div class="empty">${icon("alert")}No se pudo cargar este módulo.<br><span class="xs">${esc(e.message)}</span></div></div>`;
  }
}

// ---------- Popup en tiempo real de cada acceso (huella del torniquete o del panel) ----------
function watchAccessFeed() {
  if (!perms.has("reception") && !perms.has("access")) return;
  const since = Date.now() - 5000;
  unsubs.push(onSnapshot(query(collection(db, "access"), orderBy("at", "desc"), limit(1)), (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type !== "added" && ch.type !== "modified") return;
      const a = ch.doc.data();
      const t = toDate(a.at)?.getTime() || Date.now();
      if (t < since || ch.doc.metadata.hasPendingWrites && ch.type === "modified") return;
      if (shown.has(ch.doc.id)) return;
      shown.add(ch.doc.id);
      showAccessPop(a);
    });
  }, (e) => console.warn("access feed", e.code)));
}
const shown = new Set();
let popTimer;
function showAccessPop(a) {
  $(".access-pop")?.remove();
  clearTimeout(popTimer);
  const m = a.kind === "socio" && a.ref ? state.members.find((x) => x.code === a.ref) : null;
  const st = m ? statusOf(m) : null;
  const cls = a.result !== "permitido" ? "bad" : st?.code === "por_vencer" ? "warn" : "";
  beep(a.result === "permitido" ? "ok" : "bad");
  const rows = m ? `
      <div><span>ID</span><b class="mono">${esc(m.code)}</b></div>
      <div><span>Plan</span><b>${esc(m.planName || "—")}</b></div>
      <div><span>Vigencia</span><b>${fmtDate(m.start)} – ${fmtDate(m.end)}</b></div>
      <div><span>Estado</span><b style="color:var(--${st.allowed ? (st.code === "por_vencer" ? "warn" : "ok") : "bad"})">${esc(st.label)}</b></div>
      <div><span>Teléfono</span><b>${esc(m.phone || "—")}</b></div>
      <div><span>Visitas</span><b>${(m.visits || 0) + (a.result === "permitido" ? 1 : 0)}</b></div>
      ${m.notes ? `<div style="grid-column:1/-1"><span>Notas</span><b>${esc(m.notes)}</b></div>` : ""}`
    : `<div><span>Tipo</span><b>${esc(a.kind === "personal" ? "Personal" : a.kind === "visita" ? "Visita" : "Socio")}</b></div><div><span>Detalle</span><b>${esc(a.reason || a.status || "—")}</b></div>`;
  const el = h(`<div class="access-pop ${cls}" role="alert">
    <div class="ap-bar"></div>
    <div class="ap-body">
      <div class="avatar lg">${m?.photo ? `<img src="${esc(m.photo)}" alt="">` : esc(initials(a.name))}</div>
      <div><span class="badge ${a.result === "permitido" ? (cls === "warn" ? "warn" : "ok") : "bad"}">${a.result === "permitido" ? "Acceso permitido" : "Acceso denegado"}</span>
        <h3 style="font-size:20px;margin-top:8px">${esc(a.name || "—")}</h3>
        <div class="dim xs" style="margin-top:2px">${esc(a.source || "")} · ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</div></div>
      <div class="ap-rows">${rows}</div>
    </div>
    <div class="ap-foot">
      ${m ? `<button class="btn sm" data-open-member="${esc(m.code)}">Ver ficha</button>` : ""}
      ${m && !st.allowed || st?.code === "por_vencer" ? `<button class="btn primary sm" data-renew="${esc(m.code)}">Renovar</button>` : ""}
      <div class="grow"></div><button class="btn ghost sm" data-x>Cerrar</button>
    </div>
    <div class="ap-timer"><i></i></div>
  </div>`);
  document.body.append(el);
  el.querySelector("[data-x]").onclick = () => el.remove();
  el.querySelector("[data-open-member]")?.addEventListener("click", async () => { el.remove(); (await import("./dialogs.js")).memberDetail(m.code); });
  el.querySelector("[data-renew]")?.addEventListener("click", async () => { el.remove(); (await import("./dialogs.js")).renewDialog(m.code); });
  el.addEventListener("pointerenter", () => { clearTimeout(popTimer); el.querySelector(".ap-timer").remove(); });
  popTimer = setTimeout(() => el.remove(), 12000);
  if (document.hidden) notify(a.result === "permitido" ? `Acceso: ${a.name}` : `Acceso denegado: ${a.name}`, a.reason || "", { tag: "acceso", silent: true });
}

// ---------- Solicitudes de insumos: avisar al creador cuando cambian de estado ----------
function watchRequests() {
  if (!perms.has("supplies")) return;
  const seen = new Map();
  let first = true;
  unsubs.push(onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(60)), (snap) => {
    let open = 0;
    snap.forEach((d) => {
      const r = d.data();
      if (r.status === "pendiente" || r.status === "en_curso") open++;
      const prev = seen.get(d.id);
      if (!first && prev && prev !== r.status && r.createdBy === state.profile.uid) {
        const msg = { en_curso: "Insumos tomó tu solicitud", entregada: "Tu solicitud fue entregada", cancelada: "Tu solicitud fue cancelada" }[r.status];
        if (msg) { toast(`${r.item} · ${msg}`, r.status === "entregada" ? "ok" : "info", "Insumos"); notify(msg, `${r.item} (${r.qty || 1} ${r.unit || ""})`, { tag: `req-${d.id}`, url: "admin.html#/insumos" }); }
      }
      seen.set(d.id, r.status);
    });
    first = false;
    const c = $("[data-req-count]");
    if (c) { c.hidden = !open; c.textContent = open; }
  }, (e) => console.warn("requests", e.code)));
}

// ---------- Estado del bridge del torniquete ----------
function watchDevice() {
  const paint = (d) => {
    const dot = $("[data-dev-dot]"), txt = $("[data-dev-text]");
    if (!dot) return;
    const last = toDate(d?.lastSeen)?.getTime() || 0;
    const online = Date.now() - last < 90000;
    dot.className = `dot ${online ? "pulse" : "off"}`;
    txt.textContent = !d ? "Bridge no configurado · modo manual" : online ? `Conectado · ${d.name || "torniquete"}` : `Sin señal desde ${new Date(last).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
  };
  let lastDoc = null;
  unsubs.push(onSnapshot(doc(db, "devices", "torniquete-1"), (s) => { lastDoc = s.data() || null; paint(lastDoc); }, () => paint(null)));
  const iv = setInterval(() => paint(lastDoc), 30000);
  unsubs.push(() => clearInterval(iv));
}

// Atajos de teclado globales para recepción
addEventListener("keydown", async (e) => {
  if (!state.profile || !perms?.has("reception")) return;
  if (document.querySelector(".modal-back")) return;
  const map = { F2: "newMember", F3: "saleDialog", F4: "renewDialog", F6: "visitDialog" };
  const fn = map[e.key];
  if (!fn) return;
  e.preventDefault();
  (await import("./dialogs.js"))[fn]();
});
