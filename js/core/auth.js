// Autenticación, roles, permisos y pantalla de acceso compartida (admin.html e insumos.html).
import {
  auth, db, USER_DOMAIN, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword,
  doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, writeBatch, getDocs, query, where, limit,
} from "../firebase.js";
import { $, h, esc, icon, logo3d, toast, busy, formData } from "./ui.js";

export const ROLES = {
  dueno: { label: "Dueño", desc: "Acceso total, usuarios y configuración" },
  gerente: { label: "Gerente", desc: "Operación, reportes e inventario" },
  recepcion: { label: "Recepción", desc: "Socios, ventas, renovaciones y acceso" },
  insumos: { label: "Insumos / Mantenimiento", desc: "Solicitudes de recepción y checklist" },
  dispositivo: { label: "Dispositivo (torniquete)", desc: "Cuenta técnica del bridge de huella" },
};

export const PERMS = {
  dashboard: "Inicio",
  reception: "Recepción",
  members: "Socios",
  access: "Acceso y asistencia",
  sales: "Ventas y caja",
  supplies: "Pedir insumos",
  inventory: "Inventario",
  staff: "Personal y usuarios",
  reports: "Reportes",
  settings: "Configuración",
  maintenance: "Portal de insumos",
};

export const ROLE_PERMS = {
  dueno: Object.keys(PERMS),
  gerente: ["dashboard", "reception", "members", "access", "sales", "supplies", "inventory", "reports", "maintenance"],
  recepcion: ["reception", "members", "access", "sales", "supplies"],
  insumos: ["maintenance", "inventory"],
  dispositivo: [],
};

export const usernameToEmail = (u) => `${String(u).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@${USER_DOMAIN}`;
export const cleanUsername = (u) => String(u).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");

/** Permisos efectivos: los del rol, con ajustes individuales que el dueño haya hecho. */
export function permsOf(profile) {
  if (!profile) return new Set();
  if (profile.role === "dueno") return new Set(Object.keys(PERMS));
  const base = new Set(ROLE_PERMS[profile.role] || []);
  for (const [k, v] of Object.entries(profile.permissions || {})) v ? base.add(k) : base.delete(k);
  return base;
}

export async function audit(action, detail = {}) {
  try {
    await addDoc(collection(db, "audit"), { action, detail, uid: auth.currentUser?.uid || null, at: serverTimestamp() });
  } catch {}
}

/** Registra entrada/salida del personal. Alterna automáticamente según el último registro del día. */
export async function recordAttendance(profile, source = "huella", forceType) {
  let type = forceType;
  if (!type) {
    const snap = await getDocs(query(collection(db, "attendance"), where("uid", "==", profile.uid), where("day", "==", ymdLocal()), limit(20)));
    const last = snap.docs.map((d) => d.data()).sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0))[0];
    type = last?.type === "entrada" ? "salida" : "entrada";
  }
  await addDoc(collection(db, "attendance"), {
    uid: profile.uid, name: profile.name, role: profile.role, type, source, day: ymdLocal(), at: serverTimestamp(),
    by: auth.currentUser?.uid || null,
  });
  return type;
}
const ymdLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/**
 * Monta la pantalla de acceso y resuelve la sesión.
 * @param {{appName:string, subtitle:string, allow:(profile)=>boolean, onReady:(profile)=>void, onSignedOut?:()=>void}} o
 */
export function mountAuth({ root, appName, subtitle, heroText, allow, onReady, onSignedOut }) {
  let started = false, bootstrapping = false;
  onAuthStateChanged(auth, async (user) => {
    if (bootstrapping) return; // la cuenta del due�o se est� creando; a�n no existe su perfil
    if (!user) { started = false; onSignedOut?.(); renderLogin(); return; }
    if (started) return;
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) { await signOut(auth); renderLogin("Tu usuario no tiene perfil asignado. Pide al dueño que lo configure."); return; }
      const profile = { uid: user.uid, ...snap.data() };
      if (profile.active === false) { await signOut(auth); renderLogin("Tu usuario está desactivado."); return; }
      if (!allow(profile)) { await signOut(auth); renderLogin(`Tu rol (${ROLES[profile.role]?.label || profile.role}) no tiene acceso a ${appName}.`); return; }
      started = true;
      updateDoc(doc(db, "users", user.uid), { lastLogin: serverTimestamp() }).catch(() => {});
      onReady(profile);
    } catch (e) {
      console.error(e);
      renderLogin(e.code === "permission-denied" ? "Sin permisos en la base de datos. Revisa que las reglas de Firestore estén publicadas." : "No se pudo cargar tu perfil. Revisa tu conexión.");
    }
  });

  async function renderLogin(error = "") {
    let needsSetup = false;
    try { needsSetup = !(await getDoc(doc(db, "meta", "bootstrap"))).exists(); } catch {}
    root.innerHTML = "";
    const el = h(`<div class="auth-screen">
      <div class="auth-art"><img src="assets/img/hero.jpg" alt=""><div class="art-copy"><div class="eyebrow">Rival Gym</div><h2>${esc(heroText || "Disciplina hoy. Resultados siempre.")}</h2></div></div>
      <div class="auth-panel"><form class="auth-card" autocomplete="on" novalidate>
        <div style="perspective:900px; width:max-content">${logo3d(84, 12)}</div>
        <div><div class="eyebrow">${esc(subtitle)}</div><h1 style="margin-top:8px">${needsSetup ? "Configuración inicial" : "Iniciar sesión"}</h1>
        <p class="muted small" style="margin:6px 0 0">${needsSetup ? "Crea la cuenta del dueño. Solo se hace una vez; después el dueño agrega al resto del personal." : "Ingresa con el usuario y contraseña que te asignó el administrador."}</p></div>
        ${needsSetup ? `<label class="field"><span>Nombre completo</span><input class="input" name="name" required autocomplete="name"></label>` : ""}
        <label class="field"><span>Usuario</span><input class="input" name="username" required autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ej. israel"></label>
        <label class="field"><span>Contraseña</span><div class="pw-wrap"><input class="input" name="password" type="password" required minlength="6" autocomplete="${needsSetup ? "new-password" : "current-password"}"><button type="button" class="btn ghost icon" data-eye aria-label="Mostrar contraseña">${icon("eye")}</button></div></label>
        <div class="small" data-err style="color:var(--bad);min-height:20px">${esc(error)}</div>
        <button class="btn primary lg block" type="submit">${needsSetup ? "Crear cuenta de dueño" : "Entrar"}</button>
        <p class="dim xs center" style="margin:0">${icon("lock", "")}</p>
      </form></div></div>`);
    el.querySelector(".dim.xs").innerHTML = `Conexión cifrada · ${esc(appName)}`;
    root.append(el);
    const form = el.querySelector("form"), err = el.querySelector("[data-err]");
    el.querySelector("[data-eye]").addEventListener("click", (e) => {
      const i = form.password; i.type = i.type === "password" ? "text" : "password";
      e.currentTarget.innerHTML = icon(i.type === "password" ? "eye" : "eyeoff");
    });
    form.username.focus();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = formData(form);
      const username = cleanUsername(f.username);
      if (!username || !f.password) { err.textContent = "Escribe usuario y contraseña."; return; }
      if (f.password.length < 6) { err.textContent = "La contraseña debe tener al menos 6 caracteres."; return; }
      err.textContent = "";
      busy(form.querySelector("[type=submit]"), async () => {
        try {
          if (needsSetup) {
            if (!f.name) { err.textContent = "Escribe tu nombre."; return; }
            bootstrapping = true;
            const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), f.password).catch((ex) => { bootstrapping = false; throw ex; });
            const b = writeBatch(db);
            b.set(doc(db, "users", cred.user.uid), { username, name: f.name, role: "dueno", active: true, permissions: {}, fingerprintId: null, createdAt: serverTimestamp() });
            b.set(doc(db, "meta", "bootstrap"), { owner: cred.user.uid, at: serverTimestamp() });
            try { await b.commit(); }
            catch (ex) { await cred.user.delete().catch(() => {}); bootstrapping = false; throw ex; }
            toast("Cuenta de dueño creada.", "ok");
            location.reload();
          } else {
            await signInWithEmailAndPassword(auth, usernameToEmail(username), f.password);
          }
        } catch (ex) {
          console.error(ex);
          err.textContent = authError(ex);
        }
      });
    });
  }
}

export function authError(e) {
  const c = e?.code || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return "Usuario o contraseña incorrectos.";
  if (c.includes("too-many-requests")) return "Demasiados intentos. Espera unos minutos.";
  if (c.includes("network")) return "Sin conexión a internet.";
  if (c.includes("email-already-in-use")) return "Ese usuario ya existe.";
  if (c.includes("weak-password")) return "Contraseña muy débil (mínimo 6 caracteres).";
  if (c.includes("operation-not-allowed")) return "Habilita 'Correo/contraseña' en Firebase Authentication.";
  if (c.includes("permission-denied")) return "Permiso denegado por las reglas de Firestore.";
  return e?.message || "Ocurrió un error.";
}

export const logout = () => signOut(auth);
