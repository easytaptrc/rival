// Panel exclusivo de socios: entra con ID y contraseña; sin membresía vigente solo ve un aviso.
import {
  memberClient, MEMBER_DOMAIN, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider, doc, getDoc, getDocs, collection, onSnapshot, writeBatch, serverTimestamp,
} from "./firebase.js";
import { $, h, esc, icon, logo3d, brandMark, applyCachedTheme, toast, busy, formData, modal, fmtDate, registerSW, debounce } from "./core/ui.js";
import { normalizeMemberCode, memberStatus, daysLeft } from "./core/membership.js";
import { mountFigure } from "./core/figure.js";

const SECTIONS = { pierna: "Pierna", brazo: "Brazo", espalda: "Espalda", pecho: "Pecho" };
const { auth, db } = memberClient();
const root = $("#app");
let stopStatus = null, stopFigures = [], pub = {};

applyCachedTheme();
registerSW();
getDoc(doc(db, "settings", "public")).then((s) => (pub = s.data() || {})).catch(() => {});

const emailOf = (code, gen) => `${code.toLowerCase()}${gen ? `.g${gen}` : ""}@${MEMBER_DOMAIN}`;
const clearFigures = () => { stopFigures.forEach((f) => f()); stopFigures = []; };
const stopSession = () => { stopStatus?.(); stopStatus = null; clearFigures(); };

// ---------- Aviso de membresía no vigente ----------
function renderBlocked(code, st, status) {
  stopSession();
  const wa = pub.whatsapp ? `https://wa.me/${String(pub.whatsapp).replace(/\D/g, "")}` : "";
  root.innerHTML = `<div class="sp"><div class="card gate fade-in">
    ${icon("lock", "big")}
    <div><div class="eyebrow">Panel de socios</div><h1 style="font-size:26px;margin-top:8px">${st.code === "suspendido" ? "Tu acceso está suspendido" : "Tu suscripción no está vigente"}</h1></div>
    <p class="muted" style="margin:0">${status?.end ? `Tu membresía${status.planName ? ` <b>${esc(status.planName)}</b>` : ""} venció el <b>${fmtDate(status.end)}</b>. ` : ""}Renueva en recepción para volver a entrar al panel de ejercicios.</p>
    <span class="badge bad">${esc(st.label)} · ${esc(code)}</span>
    <div class="row wrap" style="justify-content:center">${wa ? `<a class="btn primary" href="${esc(wa)}" target="_blank" rel="noopener">${icon("whatsapp")} Escribir al gimnasio</a>` : ""}<a class="btn" href="index.html">Ir al inicio</a></div>
  </div></div>`;
}

// ---------- Acceso ----------
function renderLogin(msg = "") {
  stopSession();
  root.innerHTML = `<div class="auth-screen">
    <div class="auth-art"><img src="assets/img/hero.jpg" alt=""><div class="art-copy"><div class="eyebrow">Solo socios</div><h2>Aprende la técnica. Entrena mejor.</h2></div></div>
    <div class="auth-panel"><div class="auth-card">
      <div style="perspective:900px;width:max-content">${logo3d(84, 12)}</div>
      <div><div class="eyebrow">Rival · Panel de socios</div><h1 style="margin-top:8px" data-title>Entrar</h1></div>
      <div class="seg auth-seg"><button class="on" data-mode="login">Ya tengo contraseña</button><button data-mode="new">Es mi primera vez</button></div>
      <form class="stack" novalidate data-form></form>
      <div class="small" data-err style="color:var(--bad);min-height:20px">${esc(msg)}</div>
      <a class="dim xs center" href="index.html">← Volver al inicio</a>
    </div></div></div>`;
  const form = root.querySelector("[data-form]"), err = root.querySelector("[data-err]");
  let mode = "login";
  const paint = () => {
    root.querySelector("[data-title]").textContent = mode === "login" ? "Entrar" : "Crear contraseña";
    form.innerHTML = `<label class="field"><span>ID de socio</span><input class="input mono" name="id" required placeholder="RIV-00284 o 284" autocomplete="username" autocapitalize="characters"></label>
      ${mode === "new" ? `<label class="field"><span>Código de activación (te lo da recepción)</span><input class="input mono" name="activation" required autocomplete="off" autocapitalize="characters" spellcheck="false"></label>` : ""}
      <label class="field"><span>${mode === "new" ? "Crea tu contraseña (mínimo 8)" : "Contraseña"}</span><input class="input" name="password" type="password" required autocomplete="${mode === "new" ? "new-password" : "current-password"}"></label>
      ${mode === "new" ? `<label class="field"><span>Repite tu contraseña</span><input class="input" name="password2" type="password" required autocomplete="new-password"></label>` : ""}
      <button class="btn primary lg block" type="submit">${mode === "new" ? "Activar mi panel" : "Entrar"}</button>
      ${mode === "login" ? `<p class="dim xs center" style="margin:0">¿Olvidaste tu contraseña? Pide en recepción que restablezcan tu acceso.</p>` : ""}`;
    err.textContent = "";
  };
  paint();
  root.querySelector(".auth-seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]"); if (!b) return;
    mode = b.dataset.mode; root.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("on", x === b)); paint();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(form), code = normalizeMemberCode(f.id);
    err.textContent = "";
    if (!code) { err.textContent = "Escribe un ID válido, por ejemplo RIV-00284."; return; }
    busy(form.querySelector("[type=submit]"), async () => {
      try {
        const s = await getDoc(doc(db, "publicStatus", code));
        if (!s.exists()) { err.textContent = "No encontramos ese ID. Revisa tu credencial o pregunta en recepción."; return; }
        const status = s.data(), st = memberStatus(status);
        if (!st.allowed) return renderBlocked(code, st, status); // sin vigencia ni siquiera se inicia sesión
        const email = emailOf(code, status.authGen || 0);
        if (mode === "login") {
          await signInWithEmailAndPassword(auth, email, f.password);
        } else {
          if ((f.password || "").length < 8) { err.textContent = "La contraseña debe tener al menos 8 caracteres."; return; }
          if (f.password !== f.password2) { err.textContent = "Las contraseñas no coinciden."; return; }
          await activate(code, email, f.password, String(f.activation || "").trim().toUpperCase());
        }
      } catch (ex) {
        console.warn(ex.code || ex);
        err.textContent = friendly(ex, mode);
      }
    });
  });
}

/** Activa la cuenta. Las reglas validan el código en el servidor; si es incorrecto se borra la cuenta recién creada. */
async function activate(code, email, password, activation) {
  sessionGuard = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    try {
      const b = writeBatch(db);
      b.set(doc(db, "memberAccounts", code), { uid: cred.user.uid, activation, at: serverTimestamp() });
      b.set(doc(db, "memberLinks", cred.user.uid), { code, at: serverTimestamp() });
      await b.commit();
    } catch (ex) {
      await cred.user.delete().catch(() => {});
      throw Object.assign(new Error("activation"), { code: "rival/activation" });
    }
  } finally { sessionGuard = false; }
  toast("¡Listo! Tu panel quedó activado.", "ok");
  enter(auth.currentUser);
}

function friendly(e, mode) {
  const c = e?.code || "";
  if (c === "rival/activation") return "El código de activación no es correcto, o este ID ya fue activado. Pregunta en recepción.";
  if (c.includes("email-already-in-use")) return "Este ID ya tiene contraseña. Usa “Ya tengo contraseña”.";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return mode === "login" ? "ID o contraseña incorrectos. Si es tu primera vez, elige “Es mi primera vez”." : "No se pudo activar.";
  if (c.includes("too-many-requests")) return "Demasiados intentos. Espera unos minutos.";
  if (c.includes("network") || c.includes("unavailable")) return "Sin conexión a internet.";
  if (c.includes("weak-password")) return "Contraseña muy débil.";
  return "No se pudo completar. Intenta de nuevo.";
}

// ---------- Panel ----------
let sessionGuard = false, entered = false;
async function enter(user) {
  if (entered) return;
  try {
    const link = await getDoc(doc(db, "memberLinks", user.uid));
    if (!link.exists()) { await signOut(auth); return renderLogin("Esta cuenta no pertenece a un socio."); }
    const code = link.data().code;
    const first = await getDoc(doc(db, "publicStatus", code));
    if (!first.exists()) { await signOut(auth); return renderLogin("Tu registro ya no existe. Pregunta en recepción."); }
    const check = (d) => memberStatus(d);
    if (!check(first.data()).allowed) { await signOut(auth); return renderBlocked(code, check(first.data()), first.data()); }
    entered = true;
    let list = [];
    try { list = (await getDocs(collection(db, "exercises"))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.active !== false); }
    catch (ex) {
      entered = false;
      await signOut(auth);
      return ex.code === "permission-denied" ? renderBlocked(code, { code: "vencido", label: "Sin acceso" }, first.data()) : renderLogin("No se pudo cargar el panel. Revisa tu conexión.");
    }
    renderPanel(code, first.data(), list);
    // Si la membresía vence o se suspende con el panel abierto, se cierra al instante
    stopStatus = onSnapshot(doc(db, "publicStatus", code), async (s) => {
      const d = s.data();
      if (!d || !check(d).allowed) { entered = false; const st = check(d); stopSession(); await signOut(auth); renderBlocked(code, st, d); return; }
      const lab = $("[data-days]"); if (lab) lab.textContent = daysText(d);
    }, () => {});
  } catch (e) { console.warn(e); entered = false; renderLogin("No se pudo abrir tu panel. Revisa tu conexión."); }
}

const daysText = (d) => { const n = daysLeft(d.end); return n === 0 ? "Vence hoy" : `${n} día${n === 1 ? "" : "s"} restantes`; };

function renderPanel(code, status, list) {
  let section = "todos", q = "";
  root.innerHTML = `<div class="sp">
    <header class="sp-top">${brandMark("Panel de socios")}<div class="row"><button class="btn ghost sm" data-pass>${icon("lock")} Contraseña</button><button class="btn ghost sm" data-out>${icon("logout")} Salir</button></div></header>
    <div class="sp-hero fade-in"><div><div class="eyebrow">Hola, ${esc(status.name || "socio")}</div><h1>Cómo hacer cada ejercicio</h1></div>
      <div class="row"><span class="badge ok">${esc(status.planName || "Activa")}</span><span class="badge plain" data-days>${esc(daysText(status))}</span></div></div>
    <div class="toolbar"><div class="seg" data-sec style="overflow-x:auto;max-width:100%"><button class="on" data-s="todos">Todos</button>${Object.entries(SECTIONS).map(([k, l]) => `<button data-s="${k}">${l}</button>`).join("")}</div>
      <div class="search">${icon("search")}<input class="input" placeholder="Buscar ejercicio o músculo" data-q></div></div>
    <div class="ex-grid" data-grid></div>
    <p class="dim xs center" style="margin:0">Consulta a un entrenador antes de iniciar una rutina nueva, sobre todo si tienes alguna lesión.</p></div>`;
  const grid = root.querySelector("[data-grid]");
  const paint = () => {
    clearFigures();
    const n = q.toLowerCase();
    const rows = list.filter((x) => (section === "todos" || x.section === section) && (!n || `${x.name} ${x.muscles} ${x.equipment}`.toLowerCase().includes(n)))
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    grid.innerHTML = rows.map((x) => `<button class="ex" data-id="${esc(x.id)}"><div class="ex-media" data-media="${esc(x.id)}"></div>
      <div class="ex-body"><b>${esc(x.name)}</b><span class="dim xs">${esc(SECTIONS[x.section] || "")} · ${esc(x.muscles || "")}</span><span class="dim xs">${esc(x.sets || "")}${x.level ? ` · ${esc(x.level)}` : ""}</span></div></button>`).join("")
      || `<div class="card" style="grid-column:1/-1"><div class="empty">${icon("dumbbell")}${list.length ? "Sin resultados." : "El gimnasio aún no carga ejercicios."}</div></div>`;
    rows.forEach((x) => media(grid.querySelector(`[data-media="${CSS.escape(x.id)}"]`), x));
  };
  paint();
  root.querySelector("[data-sec]").addEventListener("click", (e) => { const b = e.target.closest("[data-s]"); if (!b) return; section = b.dataset.s; root.querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("on", x === b)); paint(); });
  root.querySelector("[data-q]").addEventListener("input", debounce((e) => { q = e.target.value.trim(); paint(); }, 150));
  root.querySelector("[data-out]").onclick = () => { entered = false; stopSession(); signOut(auth); };
  root.querySelector("[data-pass]").onclick = changePassword;
  grid.addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) detail(list.find((x) => x.id === b.dataset.id)); });
}

/** Muestra el GIF real si el gimnasio cargó uno; si no, la figura animada. */
async function media(box, x) {
  if (!box) return;
  if (x.hasMedia) {
    const m = await getDoc(doc(db, "exerciseMedia", x.id)).catch(() => null);
    if (m?.exists() && m.data().data) { box.innerHTML = `<img src="${esc(m.data().data)}" alt="${esc(x.name)}" loading="lazy">`; return; }
  }
  if (x.gifUrl) { box.innerHTML = `<img src="${esc(x.gifUrl)}" alt="${esc(x.name)}" loading="lazy" referrerpolicy="no-referrer">`; return; }
  if (x.anim) stopFigures.push(mountFigure(box, x.anim));
  else box.innerHTML = `<div class="dim">${icon("dumbbell")}</div>`;
}

function detail(x) {
  if (!x) return;
  const body = h(`<div class="ex-view"><div class="ex-media" style="border-radius:16px" data-big></div><div class="stack">
    <div class="row wrap"><span class="badge brand">${esc(SECTIONS[x.section] || "")}</span>${x.level ? `<span class="badge plain">${esc(x.level)}</span>` : ""}${x.sets ? `<span class="badge plain">${esc(x.sets)}</span>` : ""}</div>
    <div class="small muted">${esc(x.muscles || "")}${x.equipment ? ` · ${esc(x.equipment)}` : ""}</div>
    ${x.steps?.length ? `<div><b>Cómo hacerlo</b><ol>${x.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>` : ""}
    ${x.tips?.length ? `<div><b>Cuida esto</b><ul>${x.tips.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}</div></div>`);
  const before = stopFigures.length;
  const m = modal({ title: x.name, wide: true, body, foot: null, onClose: () => stopFigures.splice(before).forEach((f) => f()) });
  media(m.$("[data-big]"), x);
}

function changePassword() {
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<label class="field"><span>Contraseña actual</span><input class="input" type="password" name="cur" autocomplete="current-password"></label>
    <label class="field"><span>Nueva contraseña (mínimo 8)</span><input class="input" type="password" name="n1" autocomplete="new-password"></label>
    <label class="field"><span>Repítela</span><input class="input" type="password" name="n2" autocomplete="new-password"></label>`;
  const m = modal({ title: "Cambiar mi contraseña", body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-s>Actualizar</button>` });
  const go = () => busy(m.$("[data-s]"), async () => {
    const f = formData(body);
    if ((f.n1 || "").length < 8) return toast("Mínimo 8 caracteres.", "warn");
    if (f.n1 !== f.n2) return toast("Las contraseñas no coinciden.", "warn");
    try {
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, f.cur));
      await updatePassword(auth.currentUser, f.n1);
      toast("Contraseña actualizada.", "ok"); m.close();
    } catch (e) { toast(/invalid-credential|wrong-password/.test(e.code || "") ? "Tu contraseña actual no es correcta." : "No se pudo actualizar.", "bad"); }
  });
  m.$("[data-s]").onclick = go;
  body.addEventListener("submit", (e) => { e.preventDefault(); go(); });
}

onAuthStateChanged(auth, (user) => {
  if (sessionGuard) return;
  if (user) enter(user);
  else if (!entered && !root.querySelector(".gate")) renderLogin();
});
