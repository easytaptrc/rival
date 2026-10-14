// Personal y usuarios: alta con rol y permisos, huella del empleado y estado.
import { secondaryAuth, createUserWithEmailAndPassword, signOut } from "../../firebase.js";
import { esc, icon, modal, toast, busy, formData, initials, fmtDateTime, confirmDialog } from "../../core/ui.js";
import { ROLES, PERMS, ROLE_PERMS, permsOf, usernameToEmail, cleanUsername, authError, audit } from "../../core/auth.js";
import { STAFF_FINGER_BASE } from "../../core/membership.js";
import { db, collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp } from "../data.js";

export async function render(el, { profile }) {
  let users = [];
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Equipo</div><h1>Personal y usuarios</h1><p>Cada persona entra con su usuario y contraseña; el rol define qué ve</p></div>
      <button class="btn primary" data-new>${icon("plus")} Agregar usuario</button></div>
    <div class="grid g4 stagger">${Object.entries(ROLES).filter(([k]) => k !== "dispositivo").map(([k, r]) => `<div class="card kpi"><span class="k-label">${r.label}</span><span class="k-value" data-role="${k}">0</span><span class="k-foot">${r.desc}</span></div>`).join("")}</div>
    <div class="card fade-in"><div class="table-wrap"><table class="table"><thead><tr><th>Usuario</th><th>Rol</th><th class="hide-sm">Huella</th><th class="hide-sm">Último acceso</th><th>Estado</th><th></th></tr></thead><tbody data-rows></tbody></table></div>
      <p class="dim xs" style="margin:12px 0 0">Para cambiar la contraseña de otra persona, desactívala y crea un usuario nuevo (por seguridad, solo cada quien puede cambiar la suya desde Configuración → Mi cuenta).</p></div>`;
  const paint = () => {
    Object.keys(ROLES).forEach((k) => { const e = el.querySelector(`[data-role="${k}"]`); if (e) e.textContent = users.filter((u) => u.role === k && u.active !== false).length; });
    el.querySelector("[data-rows]").innerHTML = users.sort((a, b) => (a.role === "dueno" ? -1 : 0) - (b.role === "dueno" ? -1 : 0) || a.name.localeCompare(b.name)).map((u) => `<tr class="click" data-uid="${u.uid}">
      <td><div class="row"><div class="avatar">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><div class="dim xs mono">@${esc(u.username)}</div></div></div></td>
      <td><span class="badge plain">${esc(ROLES[u.role]?.label || u.role)}</span></td>
      <td class="hide-sm mono">${u.fingerprintId ? `#${u.fingerprintId}` : "—"}</td><td class="hide-sm small">${u.lastLogin ? fmtDateTime(u.lastLogin) : "Nunca"}</td>
      <td><span class="badge ${u.active === false ? "bad" : "ok"}">${u.active === false ? "Inactivo" : "Activo"}</span></td><td>${icon("chevron")}</td></tr>`).join("");
    el.querySelectorAll("[data-rows] svg").forEach((s) => (s.style.width = "18px"));
  };
  const unsub = onSnapshot(collection(db, "users"), (s) => { users = s.docs.map((d) => ({ uid: d.id, ...d.data() })); paint(); }, (e) => toast(`Sin permiso para ver usuarios (${e.code}).`, "bad"));
  const nextFinger = () => Math.max(STAFF_FINGER_BASE, ...users.map((u) => Number(u.fingerprintId) || 0)) + 1;
  el.querySelector("[data-new]").onclick = () => userDialog(null, nextFinger(), profile, users);
  el.querySelector("[data-rows]").addEventListener("click", (e) => { const r = e.target.closest("[data-uid]"); if (r) userDialog(users.find((u) => u.uid === r.dataset.uid), nextFinger(), profile, users); });
  return unsub;
}

function userDialog(u, nextFinger, me, users) {
  const isNew = !u;
  const role = u?.role || "recepcion";
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<div class="grid-form">
      <label class="field"><span>Nombre completo *</span><input class="input" name="name" required value="${esc(u?.name || "")}"></label>
      <label class="field"><span>Usuario *</span><input class="input" name="username" ${isNew ? "" : "disabled"} required value="${esc(u?.username || "")}" placeholder="ej. maria" autocapitalize="none"></label>
      ${isNew ? `<label class="field"><span>Contraseña * (mín. 6)</span><input class="input" name="password" type="text" minlength="6" required value="${genPass()}"></label>` : ""}
      <label class="field"><span>Rol</span><select class="input" name="role" ${u?.uid === me.uid ? "disabled" : ""}>${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === role ? "selected" : ""}>${r.label}</option>`).join("")}</select></label>
      <label class="field"><span>ID de huella (empleado)</span><input class="input mono" name="fingerprintId" type="number" min="${STAFF_FINGER_BASE + 1}" value="${u ? u.fingerprintId ?? "" : nextFinger}"></label>
      <label class="field"><span>Teléfono</span><input class="input" name="phone" value="${esc(u?.phone || "")}"></label>
    </div>
    <div><div class="label" style="margin-bottom:10px">Permisos (los del rol vienen marcados; puedes ajustar por persona)</div><div class="perm-grid" data-perms></div></div>
    ${!isNew && u.uid !== me.uid ? `<label class="check"><input type="checkbox" name="active" ${u.active !== false ? "checked" : ""}> Usuario activo (desmarca para bloquear su acceso)</label>` : ""}
    <div class="dim xs" data-role-desc></div>`;
  const paintPerms = () => {
    const r = body.role.value;
    const eff = permsOf({ role: r, permissions: r === role ? u?.permissions || {} : {} });
    body.querySelector("[data-perms]").innerHTML = Object.entries(PERMS).map(([k, l]) => `<label class="check"><input type="checkbox" data-perm="${k}" ${eff.has(k) ? "checked" : ""} ${r === "dueno" || r === "dispositivo" ? "disabled" : ""}> ${l}</label>`).join("");
    body.querySelector("[data-role-desc]").textContent = ROLES[r]?.desc + (r === "dispositivo" ? " · Usa este usuario y contraseña en el archivo .env del bridge." : "");
  };
  body.role.addEventListener("change", paintPerms);
  paintPerms();
  const m = modal({ title: isNew ? "Agregar usuario" : `Editar · ${u.name}`, wide: true, body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${isNew ? "Crear usuario" : "Guardar"}</button>` });
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    const r = body.role.value;
    if (!f.name) return toast("Escribe el nombre.", "warn");
    const base = new Set(ROLE_PERMS[r] || []);
    const permissions = {};
    body.querySelectorAll("[data-perm]").forEach((c) => { const k = c.dataset.perm; if (c.checked !== base.has(k)) permissions[k] = c.checked; });
    const fid = f.fingerprintId ? Number(f.fingerprintId) : null;
    if (fid && fid <= STAFF_FINGER_BASE) return toast(`El ID de huella del personal debe ser mayor a ${STAFF_FINGER_BASE}.`, "warn");
    if (fid && users.some((x) => x.fingerprintId === fid && x.uid !== u?.uid)) return toast("Ese ID de huella ya está asignado.", "bad");
    try {
      if (isNew) {
        const username = cleanUsername(f.username);
        if (!username || username.length < 3) return toast("Usuario inválido (mínimo 3 letras, sin espacios).", "warn");
        if (users.some((x) => x.username === username)) return toast("Ese usuario ya existe.", "bad");
        if ((f.password || "").length < 6) return toast("La contraseña debe tener al menos 6 caracteres.", "warn");
        // App secundaria: crear la cuenta sin cerrar la sesión del dueño
        const sec = await secondaryAuth();
        try {
          const cred = await createUserWithEmailAndPassword(sec.auth, usernameToEmail(username), f.password);
          await setDoc(doc(db, "users", cred.user.uid), { username, name: f.name, role: r, permissions, active: true, fingerprintId: fid, phone: f.phone || "", createdAt: serverTimestamp(), createdBy: me.uid });
          await signOut(sec.auth);
          audit("user.create", { uid: cred.user.uid, username, role: r });
          m.close();
          credsDialog(f.name, username, f.password, r);
        } finally { sec.dispose(); }
      } else {
        const patch = { name: f.name, permissions, fingerprintId: fid, phone: f.phone || "" };
        if (u.uid !== me.uid) { patch.role = r; patch.active = !!body.active?.checked; }
        await updateDoc(doc(db, "users", u.uid), patch);
        audit("user.update", { uid: u.uid, role: patch.role, active: patch.active });
        toast("Usuario actualizado.", "ok"); m.close();
      }
    } catch (e) { console.error(e); toast(authError(e), "bad"); }
  });
}

function credsDialog(name, username, password, role) {
  const m = modal({
    title: "Usuario creado",
    body: `<p class="muted" style="margin-top:0">Entrega estos datos a <b>${esc(name)}</b>. La contraseña no se vuelve a mostrar.</p>
      <div class="kv"><div><span>Usuario</span><b class="mono">${esc(username)}</b></div><div><span>Contraseña</span><b class="mono">${esc(password)}</b></div>
      <div style="grid-column:1/-1"><span>Dónde entra</span><b>${role === "insumos" ? "insumos.html" : role === "dispositivo" ? "Archivo bridge/.env (DEVICE_USER / DEVICE_PASS)" : "admin.html"}</b></div></div>`,
    foot: `<button class="btn" data-copy>${icon("clipboard")} Copiar</button><button class="btn primary" data-close>Listo</button>`,
  });
  m.$("[data-copy]").onclick = async () => { await navigator.clipboard?.writeText(`Usuario: ${username}\nContraseña: ${password}`); toast("Copiado.", "ok"); };
}

function genPass() {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = crypto.getRandomValues(new Uint32Array(10));
  return [...r].map((n) => a[n % a.length]).join("");
}
