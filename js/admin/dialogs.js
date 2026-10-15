// Diálogos reutilizables de recepción: alta de socio, renovación, venta, visita, ficha, solicitud de insumos.
import { $, esc, icon, modal, toast, busy, formData, fmtMoney, fmtDate, fmtDateTime, initials, confirmDialog, debounce } from "../core/ui.js";
import { renewalPeriod, ymd } from "../core/membership.js";
import { authError } from "../core/auth.js";
import { reqItems, reqTitle, reqSummary, itemSlug } from "../core/supplies.js";
import {
  state, plans, planById, statusOf, fullName, createMember, updateMember, sellPlan, registerSale, visitPayment, deleteMember,
  openTurnstile, db, doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp,
  writeBatch, increment,
} from "./data.js";

// ---------- Beneficios de la Lista Rival ----------
export const CONCEPTS = { brothers: "Brothers", familia: "Familia", atleta: "Atleta", referencia: "Referencia", otro: "Otro" };
export const prizeLabel = (d) => ({ 7: "1 semana gratis", 14: "2 semanas gratis", 30: "1 mes gratis" }[d] || `${d} días gratis`);
export function benefitLabel(b) {
  if (!b) return "";
  if (b.type === "gratis") return "Acceso gratis";
  if (b.type === "descuento") return `Descuento ${b.discount}%`;
  return `Premio · ${prizeLabel(b.prizeDays)}`;
}
function priceWith(plan, b) {
  if (!plan) return 0;
  if (!b) return plan.price;
  if (b.type === "gratis" || b.type === "premio") return 0;
  return Math.round(plan.price * (1 - (Number(b.discount) || 0) / 100) * 100) / 100;
}
/** Beneficio que se guarda en la venta, a partir de un registro de la lista. */
const benefitFrom = (e) => e && ({ listId: e.id, name: e.fullName, type: e.benefitType, discount: Number(e.discount) || 0, prizeDays: Number(e.prizeDays) || 0, referredBy: e.referredBy || "", concept: e.concept || "" });
async function markListUsed(b, code) {
  if (!b?.listId) return;
  await updateDoc(doc(db, "rivalList", b.listId), {
    enrolledCode: code, enrolledAt: serverTimestamp(), enrolledBy: state.profile.uid, enrolledByName: state.profile.name,
    uses: increment(1), lastUsedAt: serverTimestamp(),
  }).catch((e) => console.warn("lista", e.code));
}

const METHODS = [["efectivo", "Efectivo"], ["tarjeta", "Tarjeta"], ["transferencia", "Transferencia"]];
const payPick = (name = "method", sel = "efectivo") => `<div class="seg pay-pick" role="radiogroup">${METHODS.map(([v, l]) => `<button type="button" data-pay="${v}" class="${v === sel ? "on" : ""}">${l}</button>`).join("")}</div><input type="hidden" name="${name}" value="${sel}">`;
function wirePay(root) {
  root.querySelectorAll("[data-pay]").forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll("[data-pay]").forEach((x) => x.classList.toggle("on", x === b));
    root.querySelector('input[name="method"]').value = b.dataset.pay;
  }));
}
const planPick = (sel, list = plans()) => `<div class="plan-pick">${list.map((p, i) => `<label><input type="radio" name="plan" value="${esc(p.id)}" ${(sel ? p.id === sel : i === 0) ? "checked" : ""}><div class="pp"><b>${esc(p.name)}</b><span>${fmtMoney(p.price)}</span><small>${p.days} día${p.days === 1 ? "" : "s"}</small></div></label>`).join("")}</div>`;

// ---------- Selector de socio con búsqueda ----------
export function memberSearchBox(onPick, placeholder = "Buscar por nombre, ID o teléfono") {
  const wrap = document.createElement("div");
  wrap.className = "stack";
  wrap.innerHTML = `<div class="toolbar"><div class="search" style="max-width:none">${icon("search")}<input class="input" placeholder="${esc(placeholder)}" autocomplete="off"></div></div><div class="list" style="max-height:320px;overflow:auto"></div>`;
  const input = wrap.querySelector("input"), list = wrap.querySelector(".list");
  const paint = () => {
    const q = input.value.trim().toLowerCase();
    const rows = !q ? state.members.slice().sort((a, b) => (b.lastAccess?.seconds || 0) - (a.lastAccess?.seconds || 0)).slice(0, 8)
      : state.members.filter((m) => `${m.code} ${m.number} ${fullName(m)} ${m.phone}`.toLowerCase().includes(q)).slice(0, 30);
    list.innerHTML = rows.map((m) => { const st = statusOf(m); return `<button type="button" class="list-item" data-code="${esc(m.code)}" style="background:none;border:0;border-bottom:1px solid var(--line);color:inherit;text-align:left;cursor:pointer;width:100%">
      <div class="avatar">${m.photo ? `<img src="${esc(m.photo)}" alt="">` : esc(initials(fullName(m)))}</div>
      <div class="grow"><b>${esc(fullName(m))}</b><div class="dim xs mono">${esc(m.code)} · ${esc(m.planName || "Sin plan")} · vence ${fmtDate(m.end)}</div></div>
      <span class="badge ${st.code === "activo" ? "ok" : st.code === "por_vencer" ? "warn" : "bad"}">${esc(st.label)}</span></button>`; }).join("") || `<div class="empty">Sin resultados${state.membersLoaded ? "" : " (cargando socios…)"}</div>`;
  };
  input.addEventListener("input", debounce(paint, 120));
  list.addEventListener("click", (e) => { const b = e.target.closest("[data-code]"); if (b) onPick(state.members.find((m) => m.code === b.dataset.code)); });
  paint();
  setTimeout(() => input.focus(), 80);
  return wrap;
}

export function pickMember(title = "Seleccionar socio") {
  return new Promise((resolve) => {
    let picked = null;
    const m = modal({ title, body: memberSearchBox((x) => { picked = x; m.close(); }), foot: null, onClose: () => resolve(picked) });
  });
}

// ---------- Foto con cámara ----------
async function capturePhoto() {
  return new Promise(async (resolve) => {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } }); }
    catch { toast("No se pudo acceder a la cámara. Revisa los permisos del navegador.", "bad"); return resolve(null); }
    let result = null;
    const m = modal({
      title: "Tomar foto",
      body: `<div class="cam"><video autoplay playsinline muted></video></div>`,
      foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-snap>${icon("camera")} Capturar</button>`,
      onClose: () => { stream.getTracks().forEach((t) => t.stop()); resolve(result); },
    });
    const v = m.$("video"); v.srcObject = stream;
    m.$("[data-snap]").addEventListener("click", () => {
      const c = document.createElement("canvas"); const S = 240; c.width = c.height = S;
      const s = Math.min(v.videoWidth, v.videoHeight);
      c.getContext("2d").drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, S, S);
      result = c.toDataURL("image/jpeg", 0.72);
      m.close();
    });
  });
}
async function fileToPhoto(file) {
  const img = await createImageBitmap(file);
  const c = document.createElement("canvas"); const S = 240; c.width = c.height = S;
  const s = Math.min(img.width, img.height);
  c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, S, S);
  return c.toDataURL("image/jpeg", 0.72);
}
function photoField(initial = "") {
  const el = document.createElement("div");
  el.className = "row";
  el.innerHTML = `<div class="avatar lg" data-ph>${initial ? `<img src="${esc(initial)}" alt="">` : icon("user")}</div>
    <div class="stack" style="gap:8px"><button type="button" class="btn sm" data-cam>${icon("camera")} Tomar foto</button>
    <label class="btn sm ghost" style="cursor:pointer">${icon("upload")} Subir imagen<input type="file" accept="image/*" hidden></label></div>
    <input type="hidden" name="photo" value="${esc(initial)}">`;
  const set = (url) => { if (!url) return; el.querySelector("[name=photo]").value = url; el.querySelector("[data-ph]").innerHTML = `<img src="${esc(url)}" alt="">`; };
  el.querySelector("[data-cam]").addEventListener("click", async () => set(await capturePhoto()));
  el.querySelector("input[type=file]").addEventListener("change", async (e) => e.target.files[0] && set(await fileToPhoto(e.target.files[0])));
  return el;
}

// ---------- Alta de socio ----------
/** Planes a mostrar según el beneficio: un premio fuerza su propio plan gratuito. */
function plansFor(b) {
  if (b?.type === "premio") return [{ id: `premio-${b.prizeDays}`, name: `Premio · ${prizeLabel(b.prizeDays)}`, days: b.prizeDays, price: 0 }];
  return plans();
}
const benefitBox = (b) => b ? `<div class="notice info">${icon("star")}<div><b>Lista Rival · ${esc(benefitLabel(b))}</b><br>${esc(b.name)}${b.referredBy ? ` · lo registró ${esc(b.referredBy)}` : ""}${b.concept ? ` · ${esc(CONCEPTS[b.concept] || b.concept)}` : ""}</div></div>` : "";

export function newMember(prefill = {}, benefit = null) {
  const v = (k) => esc(prefill[k] || "");
  const list = plansFor(benefit);
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `${benefitBox(benefit)}
    <div data-photo></div>
    <div class="grid-form">
      <label class="field"><span>Nombre(s) *</span><input class="input" name="firstName" required autocomplete="off" value="${v("firstName")}"></label>
      <label class="field"><span>Apellidos</span><input class="input" name="lastName" autocomplete="off" value="${v("lastName")}"></label>
      <label class="field"><span>Teléfono</span><input class="input" name="phone" type="tel" inputmode="tel" value="${v("phone")}"></label>
      <label class="field"><span>Correo</span><input class="input" name="email" type="email" value="${v("email")}"></label>
      <label class="field"><span>Fecha de nacimiento</span><input class="input" name="birthdate" type="date" value="${v("birthdate")}"></label>
      <label class="field"><span>Contacto de emergencia</span><input class="input" name="emergency" placeholder="Nombre y teléfono" value="${v("emergency")}"></label>
      <label class="field full"><span>Notas (lesiones, observaciones)</span><input class="input" name="notes" value="${v("notes")}"></label>
    </div>
    <label class="check" ${benefit ? "hidden" : ""}><input type="checkbox" name="charge" checked> Cobrar membresía ahora</label>
    <div data-charge class="stack">
      ${planPick(benefit?.type === "premio" ? list[0].id : "mensual", list)}
      <div class="grid-form"><label class="field"><span>Monto</span><input class="input" name="amount" type="number" min="0" step="0.01" ${benefit ? "readonly" : ""}></label>
      <div class="field"><span>Forma de pago</span>${payPick()}</div></div>
      <div class="summary-box" data-sum></div>
    </div>`;
  body.querySelector("[data-photo]").replaceWith(photoField());
  const m = modal({ title: benefit ? "Inscribir desde Lista Rival" : "Nuevo socio", wide: true, body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${icon("check")} Registrar socio</button>` });
  wirePay(body);
  const findPlan = (id) => list.find((p) => p.id === id);
  const sync = () => {
    const p = findPlan(body.querySelector("[name=plan]:checked")?.value);
    if (!p) return;
    if (!body.amount.dataset.touched) body.amount.value = priceWith(p, benefit);
    const per = renewalPeriod(null, p.days);
    body.querySelector("[data-sum]").innerHTML = `<div class="row"><span class="muted">Vigencia</span><b>${fmtDate(per.start)} → ${fmtDate(per.end)}</b></div>
      ${benefit?.type === "premio" ? `<div class="row"><span class="muted">Premio</span><b style="color:var(--ok)">${esc(prizeLabel(benefit.prizeDays))} sin costo</b></div>` : benefit ? `<div class="row"><span class="muted">Precio normal</span><s class="mono dim">${fmtMoney(p.price)}</s></div><div class="row"><span class="muted">${esc(benefitLabel(benefit))}</span><b class="mono" style="color:var(--ok)">−${fmtMoney(p.price - Number(body.amount.value))}</b></div>` : ""}
      <div class="row"><span class="muted">Total</span><span class="total">${fmtMoney(body.amount.value)}</span></div>`;
  };
  body.amount.addEventListener("input", () => { body.amount.dataset.touched = 1; sync(); });
  body.addEventListener("change", (e) => { if (e.target.name === "plan") { delete body.amount.dataset.touched; sync(); } if (e.target.name === "charge") body.querySelector("[data-charge]").hidden = !e.target.checked; });
  sync();
  const save = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    if (!f.firstName) { toast("El nombre es obligatorio.", "warn"); body.firstName.focus(); return; }
    const charge = body.charge.checked;
    try {
      const note = benefit ? `Lista Rival · ${benefitLabel(benefit)}${benefit.referredBy ? ` · ${benefit.referredBy}` : ""}` : "";
      const mem = await createMember(f, charge ? { plan: findPlan(f.plan), amount: f.amount, method: f.method, note, benefit } : null);
      await markListUsed(benefit, mem.code);
      m.close();
      toast(`${mem.firstName} registrado con ID ${mem.code}. ID de huella: ${mem.fingerprintId}.`, "ok", "Socio creado");
      memberDetail(mem.code, { justCreated: true });
    } catch (e) { console.error(e); toast(authError(e), "bad"); }
  });
  m.$("[data-save]").addEventListener("click", save);
  body.addEventListener("submit", (e) => { e.preventDefault(); save(); });
}

/** Busca en la caché en vivo y, si aún no llega el snapshot (recién creado), directo en Firestore. */
async function getMember(code) {
  const hit = state.members.find((x) => x.code === code);
  if (hit) return hit;
  const d = await getDoc(doc(db, "members", code));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

// ---------- Ficha del socio ----------
export async function memberDetail(code, { justCreated = false } = {}) {
  const mm = await getMember(code);
  if (!mm) { toast("No se encontró el socio.", "warn"); return; }
  const st = statusOf(mm);
  const canDelete = ["dueno", "gerente"].includes(state.profile.role);
  const m = modal({
    title: "Ficha del socio", wide: true,
    body: `<div class="stack">
      ${justCreated ? `<div class="notice info">${icon("finger")}<div><b>Registra su huella en el lector</b><br>Usa el ID de huella <b class="mono">${mm.fingerprintId}</b> al enrolar en el software del lector/torniquete. Así el sistema lo reconoce automáticamente.</div></div>` : ""}
      <div class="member-head">
        <div class="avatar lg">${mm.photo ? `<img src="${esc(mm.photo)}" alt="">` : esc(initials(fullName(mm)))}</div>
        <div class="grow"><span class="badge ${st.code === "activo" ? "ok" : st.code === "por_vencer" ? "warn" : "bad"}">${esc(st.label)}</span>
          <h2 style="font-size:24px;margin-top:8px">${esc(fullName(mm))}</h2>
          <div class="dim small mono">${esc(mm.code)} · Huella #${mm.fingerprintId ?? "—"} ${mm.fingerEnrolled ? "· enrolada" : ""}</div></div>
      </div>
      <div class="kv">
        <div><span>Plan</span><b>${esc(mm.planName || "Sin plan")}</b></div>
        <div><span>Vigencia</span><b>${fmtDate(mm.start)} → ${fmtDate(mm.end)}</b></div>
        <div><span>Teléfono</span><b>${esc(mm.phone || "—")}</b></div>
        <div><span>Correo</span><b>${esc(mm.email || "—")}</b></div>
        <div><span>Nacimiento</span><b>${fmtDate(mm.birthdate)}</b></div>
        <div><span>Emergencia</span><b>${esc(mm.emergency || "—")}</b></div>
        <div><span>Visitas</span><b>${mm.visits || 0}</b></div>
        <div><span>Último acceso</span><b>${mm.lastAccess ? fmtDateTime(mm.lastAccess) : "—"}</b></div>
        ${mm.notes ? `<div style="grid-column:1/-1"><span>Notas</span><b>${esc(mm.notes)}</b></div>` : ""}
      </div>
      <div><div class="label" style="margin-bottom:8px">Historial de pagos</div><div data-hist class="dim small">Cargando…</div></div>
    </div>`,
    foot: `${canDelete ? `<button class="btn danger" data-del>${icon("trash")} Eliminar</button>` : ""}
      <button class="btn" data-suspend>${mm.suspended ? "Reactivar" : "Suspender"}</button>
      <button class="btn" data-finger>${icon("finger")} ${mm.fingerEnrolled ? "Huella OK" : "Marcar huella enrolada"}</button>
      <button class="btn" data-edit>${icon("edit")} Editar</button>
      <button class="btn primary" data-renew>${icon("refresh")} Renovar</button>`,
  });
  m.$("[data-renew]").onclick = () => { m.close(); renewDialog(code); };
  m.$("[data-edit]").onclick = () => { m.close(); editMember(code); };
  m.$("[data-finger]").onclick = async () => { await updateMember(code, { fingerEnrolled: !mm.fingerEnrolled }); toast("Estado de huella actualizado.", "ok"); m.close(); };
  m.$("[data-suspend]").onclick = async () => {
    if (!(await confirmDialog(mm.suspended ? "¿Reactivar el acceso de este socio?" : "El socio no podrá entrar aunque tenga días vigentes. ¿Suspender?", { ok: mm.suspended ? "Reactivar" : "Suspender", danger: !mm.suspended }))) return;
    await updateMember(code, { suspended: !mm.suspended }); toast("Socio actualizado.", "ok"); m.close();
  };
  m.$("[data-del]")?.addEventListener("click", async () => {
    if (!(await confirmDialog(`Se eliminará a ${fullName(mm)} (${code}). Sus ventas y accesos se conservan en reportes.`, { ok: "Eliminar", danger: true, title: "Eliminar socio" }))) return;
    await deleteMember(code); toast("Socio eliminado.", "ok"); m.close();
  });
  try {
    const s = await getDocs(query(collection(db, "sales"), where("memberCode", "==", code), limit(30)));
    const rows = s.docs.map((d) => d.data()).sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
    m.$("[data-hist]").innerHTML = rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Periodo</th><th>Pago</th><th style="text-align:right">Monto</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${fmtDateTime(r.at)}</td><td>${esc(r.concept)}</td><td class="xs">${r.periodStart ? `${fmtDate(r.periodStart)} → ${fmtDate(r.periodEnd)}` : "—"}</td><td>${esc(r.method)}</td><td style="text-align:right" class="mono">${fmtMoney(r.amount)}</td></tr>`).join("")}
    </tbody></table></div>` : "Sin pagos registrados.";
  } catch (e) { m.$("[data-hist]").textContent = "No se pudo cargar el historial."; }
}

function editMember(code) {
  const mm = state.members.find((x) => x.code === code);
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<div data-photo></div><div class="grid-form">
    <label class="field"><span>Nombre(s) *</span><input class="input" name="firstName" required value="${esc(mm.firstName)}"></label>
    <label class="field"><span>Apellidos</span><input class="input" name="lastName" value="${esc(mm.lastName)}"></label>
    <label class="field"><span>Teléfono</span><input class="input" name="phone" value="${esc(mm.phone)}"></label>
    <label class="field"><span>Correo</span><input class="input" name="email" type="email" value="${esc(mm.email)}"></label>
    <label class="field"><span>Fecha de nacimiento</span><input class="input" name="birthdate" type="date" value="${esc(mm.birthdate)}"></label>
    <label class="field"><span>Contacto de emergencia</span><input class="input" name="emergency" value="${esc(mm.emergency)}"></label>
    <label class="field"><span>ID de huella</span><input class="input mono" name="fingerprintId" type="number" min="1" max="8999" value="${esc(mm.fingerprintId ?? "")}"></label>
    ${["dueno", "gerente"].includes(state.profile.role) ? `<label class="field"><span>Vence (ajuste manual)</span><input class="input" name="end" type="date" value="${esc(mm.end || "")}"></label>` : ""}
    <label class="field full"><span>Notas</span><input class="input" name="notes" value="${esc(mm.notes)}"></label></div>`;
  body.querySelector("[data-photo]").replaceWith(photoField(mm.photo));
  const m = modal({ title: `Editar · ${code}`, wide: true, body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>Guardar cambios</button>` });
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    if (!f.firstName) return toast("El nombre es obligatorio.", "warn");
    const patch = { firstName: f.firstName, lastName: f.lastName, phone: f.phone, email: f.email, birthdate: f.birthdate, emergency: f.emergency, notes: f.notes, photo: f.photo, fingerprintId: f.fingerprintId ? Number(f.fingerprintId) : null };
    if (f.fingerprintId && state.members.some((x) => x.code !== code && x.fingerprintId === Number(f.fingerprintId))) return toast("Ese ID de huella ya pertenece a otro socio.", "bad");
    if ("end" in f && f.end && f.end !== mm.end) patch.end = f.end;
    try { await updateMember(code, patch); toast("Cambios guardados.", "ok"); m.close(); } catch (e) { toast(authError(e), "bad"); }
  });
}

// ---------- Renovar suscripción ----------
export async function renewDialog(code, benefit = null) {
  let mm = code ? await getMember(code) : await pickMember("Renovar suscripción · elige al socio");
  if (!mm) return;
  const list = plansFor(benefit);
  const findPlan = (id) => list.find((p) => p.id === id);
  const body = document.createElement("form");
  body.className = "stack";
  const st = statusOf(mm);
  body.innerHTML = `${benefitBox(benefit)}<div class="row"><div class="avatar">${mm.photo ? `<img src="${esc(mm.photo)}" alt="">` : esc(initials(fullName(mm)))}</div><div class="grow"><b>${esc(fullName(mm))}</b><div class="dim xs mono">${esc(mm.code)} · ${esc(mm.planName || "Sin plan")} · vence ${fmtDate(mm.end)}</div></div><span class="badge ${st.allowed ? (st.code === "por_vencer" ? "warn" : "ok") : "bad"}">${esc(st.label)}</span></div>
    ${planPick(benefit?.type === "premio" ? list[0].id : mm.plan && mm.plan !== "visita" && findPlan(mm.plan) ? mm.plan : "mensual", list)}
    <div class="grid-form"><label class="field"><span>Monto</span><input class="input" name="amount" type="number" min="0" step="0.01" ${benefit ? "readonly" : ""}></label><div class="field"><span>Forma de pago</span>${payPick()}</div>
    <label class="field full"><span>Nota (opcional)</span><input class="input" name="note" placeholder="Descuento, promoción, etc."></label></div>
    <div class="summary-box" data-sum></div>`;
  const m = modal({ title: "Renovar suscripción", wide: true, body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${icon("check")} Cobrar y renovar</button>` });
  wirePay(body);
  const sync = () => {
    const p = findPlan(body.querySelector("[name=plan]:checked")?.value);
    if (!p) return;
    if (!body.amount.dataset.touched) body.amount.value = priceWith(p, benefit);
    const per = renewalPeriod(mm.end, p.days);
    body.querySelector("[data-sum]").innerHTML = `<div class="row"><span class="muted">Nuevo periodo</span><b>${fmtDate(per.start)} → ${fmtDate(per.end)}</b></div>${mm.end && mm.end >= ymd() ? `<div class="dim xs">Se suma a partir del vencimiento actual, no pierde días.</div>` : ""}
      ${benefit ? `<div class="row"><span class="muted">${esc(benefitLabel(benefit))}</span><b class="mono" style="color:var(--ok)">−${fmtMoney(p.price - Number(body.amount.value))}</b></div>` : ""}
      <div class="row"><span class="muted">Total</span><span class="total">${fmtMoney(body.amount.value)}</span></div>`;
  };
  body.amount.addEventListener("input", () => { body.amount.dataset.touched = 1; sync(); });
  body.addEventListener("change", (e) => { if (e.target.name === "plan") { delete body.amount.dataset.touched; sync(); } });
  sync();
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    try {
      const note = [benefit ? `Lista Rival · ${benefitLabel(benefit)}` : "", f.note].filter(Boolean).join(" · ");
      const r = await sellPlan(mm.code, findPlan(f.plan), { amount: f.amount, method: f.method, note, benefit });
      await markListUsed(benefit, mm.code);
      toast(`${fullName(mm)} vigente hasta ${fmtDate(r.end)}.`, "ok", "Renovación registrada");
      m.close();
    } catch (e) { console.error(e); toast(authError(e), "bad"); }
  });
}

// ---------- Registrar venta (productos / servicios) ----------
export function saleDialog() {
  const quick = state.app.products?.length ? state.app.products : [
    { name: "Agua 1L", price: 20 }, { name: "Bebida isotónica", price: 35 }, { name: "Proteína (scoop)", price: 45 }, { name: "Toalla", price: 30 },
  ];
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<div><div class="label" style="margin-bottom:8px">Productos rápidos</div><div class="row wrap">${quick.map((p, i) => `<button type="button" class="btn sm" data-q="${i}">${esc(p.name)} · ${fmtMoney(p.price)}</button>`).join("")}</div></div>
    <div class="grid-form">
      <label class="field full"><span>Concepto *</span><input class="input" name="concept" required placeholder="Producto o servicio"></label>
      <label class="field"><span>Cantidad</span><input class="input" name="qty" type="number" min="1" value="1"></label>
      <label class="field"><span>Precio unitario</span><input class="input" name="price" type="number" min="0" step="0.01"></label>
      <div class="field full"><span>Forma de pago</span>${payPick()}</div>
      <div class="field full"><span>Socio (opcional)</span><div class="row"><input class="input" name="memberCode" placeholder="RIV-00000" readonly><button type="button" class="btn" data-pick>${icon("search")}</button></div></div>
    </div><div class="summary-box"><div class="row"><span class="muted">Total</span><span class="total" data-total>$0.00</span></div></div>`;
  const m = modal({ title: "Registrar venta", body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${icon("cash")} Cobrar</button>` });
  wirePay(body);
  const total = () => (Number(body.qty.value) || 1) * (Number(body.price.value) || 0);
  const paint = () => (body.querySelector("[data-total]").textContent = fmtMoney(total()));
  body.addEventListener("input", paint);
  body.querySelectorAll("[data-q]").forEach((b) => b.onclick = () => { const p = quick[b.dataset.q]; body.concept.value = p.name; body.price.value = p.price; paint(); });
  let member = null;
  body.querySelector("[data-pick]").onclick = async () => { member = await pickMember(); if (member) body.memberCode.value = `${member.code} · ${fullName(member)}`; };
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    if (!f.concept || !total()) return toast("Escribe concepto y precio.", "warn");
    await registerSale({ type: "producto", concept: f.concept, qty: f.qty, amount: total(), method: f.method, memberCode: member?.code || null, memberName: member ? fullName(member) : "" });
    toast(`${f.concept} · ${fmtMoney(total())}`, "ok", "Venta registrada");
    m.close();
  });
}

// ---------- Pago de visita ----------
export function visitDialog() {
  const price = planById("visita")?.price ?? state.app.visitPrice ?? 80;
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<div class="grid-form">
    <label class="field"><span>Nombre del visitante</span><input class="input" name="name" placeholder="Opcional"></label>
    <label class="field"><span>Teléfono</span><input class="input" name="phone" type="tel" placeholder="Opcional"></label>
    <label class="field"><span>Monto</span><input class="input" name="amount" type="number" min="0" step="0.01" value="${price}"></label>
    <div class="field"><span>Forma de pago</span>${payPick()}</div></div>
    <label class="check"><input type="checkbox" name="open" checked> Abrir torniquete al cobrar</label>
    <div class="dim xs">¿Es socio con membresía vencida? Mejor usa <b>Renovar</b> con el plan Visita para que quede en su historial.</div>`;
  const m = modal({ title: "Pago de visita", body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${icon("ticket")} Cobrar visita</button>` });
  wirePay(body);
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    try { await visitPayment({ name: f.name, phone: f.phone, amount: f.amount, method: f.method, open: body.open.checked }); toast(`Visita cobrada · ${fmtMoney(f.amount)}`, "ok"); m.close(); }
    catch (e) { toast(authError(e), "bad"); }
  });
}

// ---------- Solicitud de insumos ----------
const UNITS = ["piezas", "paquetes", "cajas", "botellas", "litros", "rollos", "galones", "bolsas"];
const lineRow = (l = {}) => `<div class="row req-line" data-line><input class="input grow" data-k="name" placeholder="Artículo" value="${esc(l.name || "")}">
  <input class="input" data-k="qty" type="number" min="1" value="${l.qty || 1}" style="width:84px"><select class="input" data-k="unit" style="width:120px">${UNITS.map((u) => `<option ${u === l.unit ? "selected" : ""}>${u}</option>`).join("")}</select>
  <button type="button" class="btn ghost icon" data-del-line aria-label="Quitar">${icon("x")}</button></div>`;

export function requestDialog(prefill = {}) {
  const common = state.app.commonSupplies?.length ? state.app.commonSupplies : ["Toallas de papel", "Papel higiénico", "Jabón para manos", "Limpiador multiusos", "Desinfectante", "Bolsas de basura", "Guantes de nitrilo", "Gel antibacterial", "Garrafón de agua"];
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<div><div class="label" style="margin-bottom:8px">Frecuentes (toca para agregar)</div><div class="row wrap">${common.map((c) => `<button type="button" class="btn sm" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div></div>
    <div><div class="label" style="margin-bottom:8px">Artículos que necesitas</div><div class="stack" style="gap:8px" data-lines>${lineRow({ name: prefill.item })}</div>
      <button type="button" class="btn sm" data-add-line style="margin-top:8px">${icon("plus")} Agregar artículo</button></div>
    <div class="grid-form">
      <label class="field"><span>Prioridad</span><select class="input" name="priority"><option value="normal">Normal</option><option value="alta">Urgente</option><option value="baja">Cuando se pueda</option></select></label>
      <label class="field"><span>Área</span><input class="input" name="area" placeholder="Recepción, baños…" value="Recepción"></label>
      <label class="field full"><span>Nota</span><input class="input" name="note" placeholder="Detalles para bodega"></label>
    </div>`;
  const m = modal({ title: "Pedir insumos a bodega", wide: true, body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${icon("send")} Enviar solicitud</button>` });
  const lines = body.querySelector("[data-lines]");
  body.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => {
    const empty = [...lines.querySelectorAll("[data-k=name]")].find((i) => !i.value.trim());
    if (empty) empty.value = b.dataset.c; else lines.insertAdjacentHTML("beforeend", lineRow({ name: b.dataset.c }));
  });
  body.querySelector("[data-add-line]").onclick = () => { lines.insertAdjacentHTML("beforeend", lineRow()); lines.lastElementChild.querySelector("input").focus(); };
  lines.addEventListener("click", (e) => { const d = e.target.closest("[data-del-line]"); if (d && lines.children.length > 1) d.closest("[data-line]").remove(); });
  const send = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    const items = [...lines.querySelectorAll("[data-line]")].map((r) => ({
      name: r.querySelector("[data-k=name]").value.trim(), qty: Math.max(1, Number(r.querySelector("[data-k=qty]").value) || 1), unit: r.querySelector("[data-k=unit]").value,
    })).filter((i) => i.name);
    if (!items.length) return toast("Agrega al menos un artículo.", "warn");
    await addDoc(collection(db, "requests"), {
      items, item: reqTitle(items), qty: items.reduce((s, i) => s + i.qty, 0), unit: items.length === 1 ? items[0].unit : "artículos",
      priority: f.priority, area: f.area, note: f.note,
      status: "pendiente", createdBy: state.profile.uid, createdByName: state.profile.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    toast("Insumos recibirá una notificación.", "ok", "Solicitud enviada");
    m.close();
  });
  m.$("[data-save]").onclick = send;
  body.addEventListener("submit", (e) => { e.preventDefault(); send(); });
}

// ---------- Confirmar lo que llegó de bodega (alimenta el inventario de recepción) ----------
export async function confirmReceipt(id) {
  const snap = await getDoc(doc(db, "requests", id));
  if (!snap.exists()) return toast("La solicitud ya no existe.", "warn");
  const r = snap.data();
  if (r.status !== "entregada") return toast("Esta solicitud no está pendiente de confirmar.", "info");
  const items = reqItems(r);
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<p class="muted small" style="margin:0">Insumos (${esc(r.takenByName || "bodega")}) marcó esta solicitud como entregada. Palomea lo que <b>sí</b> recibiste y confirma la cantidad. Lo recibido se suma solo al <b>inventario de recepción</b>.</p>
    <div class="card checklist" style="padding:6px 16px">${items.map((it, i) => `<div class="ck-row" data-i="${i}">
      <label class="check"><input type="checkbox" data-ok checked><span><b>${esc(it.name)}</b><div class="dim xs">Pediste ${it.qty} ${esc(it.unit || "")}${it.delivered != null ? ` · bodega entregó ${it.delivered}` : ""}</div></span></label>
      <div class="row"><input class="input mono" type="number" min="0" data-qty value="${it.delivered ?? it.qty}" style="width:90px;min-height:38px"><span class="dim xs" style="width:60px">${esc(it.unit || "")}</span></div></div>`).join("")}</div>
    <label class="field"><span>Comentario (opcional)</span><input class="input" name="note" placeholder="Ej. llegó una caja abierta"></label>
    <div class="summary-box" data-sum></div>`;
  const m = modal({ title: `Confirmar recepción · ${reqTitle(items)}`, wide: true, body, foot: `<button class="btn ghost" data-close>Después</button><button class="btn primary" data-save>${icon("check")} Confirmar y cargar a inventario</button>` });
  const read = () => [...body.querySelectorAll("[data-i]")].map((row) => {
    const it = items[row.dataset.i];
    const ok = row.querySelector("[data-ok]").checked;
    return { name: it.name, unit: it.unit || "", requested: it.qty, delivered: it.delivered ?? it.qty, received: ok ? Math.max(0, Number(row.querySelector("[data-qty]").value) || 0) : 0 };
  });
  const paint = () => {
    const rows = read(), missing = rows.filter((x) => x.received < x.delivered);
    body.querySelector("[data-sum]").innerHTML = `<div class="row"><span class="muted">Artículos recibidos</span><b>${rows.reduce((s, x) => s + x.received, 0)} de ${rows.reduce((s, x) => s + x.delivered, 0)}</b></div>${missing.length ? `<div class="row" style="color:var(--warn)"><span>Faltante</span><b>${esc(missing.map((x) => `${x.delivered - x.received} ${x.name}`).join(", "))}</b></div><div class="dim xs">Se avisará a insumos y al dueño que la entrega llegó incompleta.</div>` : `<div class="dim xs" style="color:var(--ok)">Todo completo.</div>`}`;
  };
  body.addEventListener("input", paint); body.addEventListener("change", paint); paint();
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    const rows = read();
    const incomplete = rows.some((x) => x.received < x.delivered);
    const b = writeBatch(db);
    b.update(doc(db, "requests", id), {
      status: "recibida", receivedItems: rows, incomplete, receiveNote: body.note.value.trim(),
      receivedBy: state.profile.uid, receivedByName: state.profile.name, receivedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    rows.filter((x) => x.received > 0).forEach((x) => {
      b.set(doc(db, "receptionInventory", itemSlug(x.name)), { name: x.name, unit: x.unit, qty: increment(x.received), lastIn: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
      b.set(doc(collection(db, "receptionMoves")), { type: "entrada", name: x.name, unit: x.unit, qty: x.received, requestId: id, note: "Entrega de bodega", by: state.profile.uid, byName: state.profile.name, at: serverTimestamp() });
    });
    await b.commit();
    toast(incomplete ? "Recepción confirmada con faltantes; se avisó a insumos." : "Recepción confirmada y cargada al inventario.", incomplete ? "warn" : "ok");
    m.close();
  });
}

// ---------- Lista Rival (recepción: solo consulta e inscribe) ----------
export async function rivalListDialog() {
  const s = await getDocs(collection(db, "rivalList"));
  const rows = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const body = document.createElement("div");
  body.className = "stack";
  body.innerHTML = `<div class="search" style="position:relative">${icon("search")}<input class="input" placeholder="Buscar por nombre o quién lo registró" style="padding-left:40px"></div><div class="list" style="max-height:420px;overflow:auto" data-l></div>`;
  body.querySelector(".search svg").style.cssText = "position:absolute;left:12px;top:50%;transform:translateY(-50%);width:18px;color:var(--text-3)";
  const paint = (q = "") => {
    const n = q.toLowerCase();
    body.querySelector("[data-l]").innerHTML = rows.filter((e) => !n || `${e.fullName} ${e.referredBy} ${e.concept}`.toLowerCase().includes(n)).map((e) => {
      const used = e.benefitType === "premio" && e.enrolledCode;
      return `<button type="button" class="list-item" data-id="${e.id}" style="background:none;border:0;border-bottom:1px solid var(--line);color:inherit;text-align:left;cursor:pointer;width:100%;${used ? "opacity:.5" : ""}">
        <span class="li-ico">${icon(e.benefitType === "premio" ? "gift" : "star")}</span>
        <div class="grow"><b>${esc(e.fullName)}</b><div class="dim xs">${e.referredBy ? `Lo registró ${esc(e.referredBy)} · ` : ""}${esc(CONCEPTS[e.concept] || e.concept || "")}${e.enrolledCode ? ` · socio ${esc(e.enrolledCode)}` : ""}</div></div>
        <span class="badge ${used ? "plain" : e.benefitType === "descuento" ? "warn" : "ok"}">${esc(used ? "Premio usado" : benefitLabel({ type: e.benefitType, discount: e.discount, prizeDays: e.prizeDays }))}</span></button>`;
    }).join("") || `<div class="empty">${icon("star")}${rows.length ? "Sin coincidencias." : "El dueño aún no agrega personas a la Lista Rival."}</div>`;
  };
  body.querySelector("input").addEventListener("input", (e) => paint(e.target.value));
  paint();
  const m = modal({ title: "Lista Rival", wide: true, body, foot: null });
  body.querySelector("[data-l]").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-id]"); if (!b) return;
    const e = rows.find((x) => x.id === b.dataset.id);
    const ben = benefitFrom(e);
    if (e.benefitType === "premio" && e.enrolledCode) return toast(`El premio ya se aplicó al socio ${e.enrolledCode}.`, "info");
    m.close();
    const member = e.enrolledCode && state.members.find((x) => x.code === e.enrolledCode);
    if (member) renewDialog(member.code, ben);
    else newMember({ firstName: e.firstName, lastName: e.lastName, phone: e.phone, email: e.email, birthdate: e.birthdate, notes: e.notes }, ben);
  });
  setTimeout(() => body.querySelector("input").focus(), 80);
}

// ---------- Corte de caja del usuario (queda registrado y le llega al dueño) ----------
export async function cashCutDialog() {
  const uid = state.profile.uid;
  const last = await getDocs(query(collection(db, "cashCuts"), where("by", "==", uid), orderBy("at", "desc"), limit(1)));
  const lastAt = last.docs[0]?.data().at?.toDate?.();
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const from = lastAt || t0;
  const s = await getDocs(query(collection(db, "sales"), where("at", ">", from), orderBy("at", "asc")));
  const sales = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.by === uid && !x.void);
  const sum = (a) => Math.round(a.reduce((t, x) => t + (Number(x.amount) || 0), 0) * 100) / 100;
  const totals = { efectivo: sum(sales.filter((x) => x.method === "efectivo")), tarjeta: sum(sales.filter((x) => x.method === "tarjeta")), transferencia: sum(sales.filter((x) => x.method === "transferencia")) };
  totals.total = sum(sales);
  const TYPES = { inscripcion: "Inscripciones", renovacion: "Renovaciones", visita: "Visitas", producto: "Productos" };
  const byType = Object.fromEntries(Object.keys(TYPES).map((k) => [k, { n: sales.filter((x) => x.type === k).length, amount: sum(sales.filter((x) => x.type === k)) }]));
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<div class="row spread"><span class="muted">Desde</span><b>${fmtDateTime(from)}${lastAt ? " (tu último corte)" : " (inicio del día)"}</b></div>
    <div class="summary-box">${["efectivo", "tarjeta", "transferencia"].map((k) => `<div class="row"><span class="muted" style="text-transform:capitalize">${k}</span><b class="mono">${fmtMoney(totals[k])}</b></div>`).join("")}
      <div class="row" style="border-top:1px solid var(--line);padding-top:8px"><span>Total vendido (${sales.length})</span><span class="total mono">${fmtMoney(totals.total)}</span></div></div>
    <div class="summary-box">${Object.entries(TYPES).map(([k, l]) => `<div class="row"><span class="muted">${l}</span><b class="mono">${byType[k].n} · ${fmtMoney(byType[k].amount)}</b></div>`).join("")}</div>
    <div class="grid-form"><label class="field"><span>Efectivo contado en caja *</span><input class="input mono" name="counted" type="number" step="0.01" min="0" required placeholder="${totals.efectivo}"></label>
      <label class="field"><span>Comentario</span><input class="input" name="note" placeholder="Opcional"></label></div>
    <div data-diff class="small"></div>
    <details><summary class="small muted" style="cursor:pointer">Ver ${sales.length} movimientos</summary><div class="table-wrap" style="max-height:220px;overflow:auto;margin-top:8px"><table class="table"><tbody>${sales.map((x) => `<tr><td class="mono xs">${fmtDateTime(x.at)}</td><td>${esc(x.concept)}</td><td>${esc(x.method)}</td><td class="mono" style="text-align:right">${fmtMoney(x.amount)}</td></tr>`).join("")}</tbody></table></div></details>`;
  const m = modal({ title: "Hacer corte de caja", wide: true, body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${icon("receipt")} Registrar corte</button>` });
  const paintDiff = () => {
    const c = body.counted.value === "" ? null : Number(body.counted.value);
    const d = c == null ? 0 : Math.round((c - totals.efectivo) * 100) / 100;
    body.querySelector("[data-diff]").innerHTML = c == null ? "" : d === 0 ? `<span style="color:var(--ok)">✓ La caja cuadra.</span>` : `<span style="color:var(--${d < 0 ? "bad" : "warn"})">${d < 0 ? "Faltante" : "Sobrante"} de <b>${fmtMoney(Math.abs(d))}</b> en efectivo.</span>`;
  };
  body.counted.addEventListener("input", paintDiff);
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    if (body.counted.value === "") return toast("Escribe cuánto efectivo contaste en caja.", "warn");
    const counted = Number(body.counted.value);
    const ref = await addDoc(collection(db, "cashCuts"), {
      by: uid, byName: state.profile.name, role: state.profile.role, from, at: serverTimestamp(), day: ymd(),
      totals, byType, count: sales.length, cashCounted: counted, diff: Math.round((counted - totals.efectivo) * 100) / 100, note: body.note.value.trim(),
      sales: sales.slice(0, 400).map((x) => ({ concept: x.concept, amount: Number(x.amount) || 0, method: x.method, type: x.type, memberName: x.memberName || "", at: x.at?.toMillis?.() || null })),
    });
    toast(`Corte registrado: ${fmtMoney(totals.total)}. El dueño ya puede verlo.`, "ok", "Corte de caja");
    m.close();
    printCut({ byName: state.profile.name, from, at: new Date(), totals, byType, count: sales.length, cashCounted: counted, diff: counted - totals.efectivo, note: body.note.value.trim(), id: ref.id });
  });
}

export function printCut(c) {
  const w = open("", "_blank", "width=420,height=680");
  if (!w) return toast("Permite ventanas emergentes para imprimir el corte.", "warn");
  const TYPES = { inscripcion: "Inscripciones", renovacion: "Renovaciones", visita: "Visitas", producto: "Productos" };
  const row = (a, b) => `<div class="r"><span>${a}</span><b>${b}</b></div>`;
  w.document.write(`<html><head><title>Corte de caja</title><style>body{font:13px system-ui;padding:18px;color:#000}h2{margin:0 0 4px}.r{display:flex;justify-content:space-between;padding:3px 0}.box{border:1px dashed #999;padding:8px 12px;margin:8px 0}</style></head><body>
    <h2>RIVAL · Corte de caja</h2><div>${esc(c.byName)} · ${fmtDateTime(c.at)}</div><div>Desde ${fmtDateTime(c.from)}</div>
    <div class="box">${row("Efectivo", fmtMoney(c.totals.efectivo))}${row("Tarjeta", fmtMoney(c.totals.tarjeta))}${row("Transferencia", fmtMoney(c.totals.transferencia))}${row(`<b>Total (${c.count})</b>`, fmtMoney(c.totals.total))}</div>
    <div class="box">${Object.entries(TYPES).map(([k, l]) => row(l, `${c.byType?.[k]?.n || 0} · ${fmtMoney(c.byType?.[k]?.amount || 0)}`)).join("")}</div>
    <div class="box">${row("Efectivo contado", fmtMoney(c.cashCounted))}${row(c.diff < 0 ? "Faltante" : c.diff > 0 ? "Sobrante" : "Diferencia", fmtMoney(Math.abs(c.diff)))}</div>
    ${c.note ? `<p>Nota: ${esc(c.note)}</p>` : ""}<p style="margin-top:36px">Entregó: __________________ &nbsp; Recibió: __________________</p></body></html>`);
  w.document.close(); w.focus(); w.print();
}

export async function manualOpen() {
  if (!(await confirmDialog("Se enviará la orden de apertura al torniquete y quedará registrada a tu nombre.", { ok: "Abrir torniquete", title: "Apertura manual" }))) return;
  await openTurnstile("Apertura manual");
  toast("Orden de apertura enviada.", "ok");
}
