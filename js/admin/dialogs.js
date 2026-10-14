// Diálogos reutilizables de recepción: alta de socio, renovación, venta, visita, ficha, solicitud de insumos.
import { $, esc, icon, modal, toast, busy, formData, fmtMoney, fmtDate, fmtDateTime, initials, confirmDialog, debounce } from "../core/ui.js";
import { renewalPeriod, ymd } from "../core/membership.js";
import { authError } from "../core/auth.js";
import {
  state, plans, planById, statusOf, fullName, createMember, updateMember, sellPlan, registerSale, visitPayment, deleteMember,
  openTurnstile, db, doc, getDoc, collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp,
} from "./data.js";

const METHODS = [["efectivo", "Efectivo"], ["tarjeta", "Tarjeta"], ["transferencia", "Transferencia"]];
const payPick = (name = "method", sel = "efectivo") => `<div class="seg pay-pick" role="radiogroup">${METHODS.map(([v, l]) => `<button type="button" data-pay="${v}" class="${v === sel ? "on" : ""}">${l}</button>`).join("")}</div><input type="hidden" name="${name}" value="${sel}">`;
function wirePay(root) {
  root.querySelectorAll("[data-pay]").forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll("[data-pay]").forEach((x) => x.classList.toggle("on", x === b));
    root.querySelector('input[name="method"]').value = b.dataset.pay;
  }));
}
const planPick = (sel, filter = () => true) => `<div class="plan-pick">${plans().filter(filter).map((p, i) => `<label><input type="radio" name="plan" value="${esc(p.id)}" ${(sel ? p.id === sel : i === 0) ? "checked" : ""}><div class="pp"><b>${esc(p.name)}</b><span>${fmtMoney(p.price)}</span><small>${p.days} día${p.days === 1 ? "" : "s"}</small></div></label>`).join("")}</div>`;

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
export function newMember() {
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `
    <div data-photo></div>
    <div class="grid-form">
      <label class="field"><span>Nombre(s) *</span><input class="input" name="firstName" required autocomplete="off"></label>
      <label class="field"><span>Apellidos</span><input class="input" name="lastName" autocomplete="off"></label>
      <label class="field"><span>Teléfono</span><input class="input" name="phone" type="tel" inputmode="tel"></label>
      <label class="field"><span>Correo</span><input class="input" name="email" type="email"></label>
      <label class="field"><span>Fecha de nacimiento</span><input class="input" name="birthdate" type="date"></label>
      <label class="field"><span>Contacto de emergencia</span><input class="input" name="emergency" placeholder="Nombre y teléfono"></label>
      <label class="field full"><span>Notas (lesiones, observaciones)</span><input class="input" name="notes"></label>
    </div>
    <label class="check"><input type="checkbox" name="charge" checked> Cobrar membresía ahora</label>
    <div data-charge class="stack">
      ${planPick("mensual")}
      <div class="grid-form"><label class="field"><span>Monto</span><input class="input" name="amount" type="number" min="0" step="0.01"></label>
      <div class="field"><span>Forma de pago</span>${payPick()}</div></div>
      <div class="summary-box" data-sum></div>
    </div>`;
  body.querySelector("[data-photo]").replaceWith(photoField());
  const m = modal({ title: "Nuevo socio", wide: true, body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${icon("check")} Registrar socio</button>` });
  wirePay(body);
  const sync = () => {
    const p = planById(body.querySelector("[name=plan]:checked")?.value);
    if (!p) return;
    if (!body.amount.dataset.touched) body.amount.value = p.price;
    const per = renewalPeriod(null, p.days);
    body.querySelector("[data-sum]").innerHTML = `<div class="row"><span class="muted">Vigencia</span><b>${fmtDate(per.start)} → ${fmtDate(per.end)}</b></div><div class="row"><span class="muted">Total</span><span class="total">${fmtMoney(body.amount.value)}</span></div>`;
  };
  body.amount.addEventListener("input", () => { body.amount.dataset.touched = 1; sync(); });
  body.addEventListener("change", (e) => { if (e.target.name === "plan") { delete body.amount.dataset.touched; sync(); } if (e.target.name === "charge") body.querySelector("[data-charge]").hidden = !e.target.checked; });
  sync();
  const save = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    if (!f.firstName) { toast("El nombre es obligatorio.", "warn"); body.firstName.focus(); return; }
    const charge = body.charge.checked;
    try {
      const mem = await createMember(f, charge ? { plan: planById(f.plan), amount: f.amount, method: f.method } : null);
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
export async function renewDialog(code) {
  let mm = code ? await getMember(code) : await pickMember("Renovar suscripción · elige al socio");
  if (!mm) return;
  const body = document.createElement("form");
  body.className = "stack";
  const st = statusOf(mm);
  body.innerHTML = `<div class="row"><div class="avatar">${mm.photo ? `<img src="${esc(mm.photo)}" alt="">` : esc(initials(fullName(mm)))}</div><div class="grow"><b>${esc(fullName(mm))}</b><div class="dim xs mono">${esc(mm.code)} · ${esc(mm.planName || "Sin plan")} · vence ${fmtDate(mm.end)}</div></div><span class="badge ${st.allowed ? (st.code === "por_vencer" ? "warn" : "ok") : "bad"}">${esc(st.label)}</span></div>
    ${planPick(mm.plan && mm.plan !== "visita" ? mm.plan : "mensual")}
    <div class="grid-form"><label class="field"><span>Monto</span><input class="input" name="amount" type="number" min="0" step="0.01"></label><div class="field"><span>Forma de pago</span>${payPick()}</div>
    <label class="field full"><span>Nota (opcional)</span><input class="input" name="note" placeholder="Descuento, promoción, etc."></label></div>
    <div class="summary-box" data-sum></div>`;
  const m = modal({ title: "Renovar suscripción", wide: true, body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${icon("check")} Cobrar y renovar</button>` });
  wirePay(body);
  const sync = () => {
    const p = planById(body.querySelector("[name=plan]:checked")?.value);
    if (!p) return;
    if (!body.amount.dataset.touched) body.amount.value = p.price;
    const per = renewalPeriod(mm.end, p.days);
    body.querySelector("[data-sum]").innerHTML = `<div class="row"><span class="muted">Nuevo periodo</span><b>${fmtDate(per.start)} → ${fmtDate(per.end)}</b></div>${mm.end && mm.end >= ymd() ? `<div class="dim xs">Se suma a partir del vencimiento actual, no pierde días.</div>` : ""}<div class="row"><span class="muted">Total</span><span class="total">${fmtMoney(body.amount.value)}</span></div>`;
  };
  body.amount.addEventListener("input", () => { body.amount.dataset.touched = 1; sync(); });
  body.addEventListener("change", (e) => { if (e.target.name === "plan") { delete body.amount.dataset.touched; sync(); } });
  sync();
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    try {
      const r = await sellPlan(mm.code, planById(f.plan), { amount: f.amount, method: f.method, note: f.note });
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
export function requestDialog(prefill = {}) {
  const common = ["Toallas de papel", "Papel higiénico", "Jabón para manos", "Limpiador multiusos", "Desinfectante", "Bolsas de basura", "Guantes de nitrilo", "Gel antibacterial", "Garrafón de agua"];
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<div><div class="label" style="margin-bottom:8px">Frecuentes</div><div class="row wrap">${common.map((c) => `<button type="button" class="btn sm" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div></div>
    <div class="grid-form">
      <label class="field full"><span>¿Qué necesitas? *</span><input class="input" name="item" required value="${esc(prefill.item || "")}"></label>
      <label class="field"><span>Cantidad</span><input class="input" name="qty" type="number" min="1" value="1"></label>
      <label class="field"><span>Unidad</span><select class="input" name="unit"><option>piezas</option><option>paquetes</option><option>cajas</option><option>botellas</option><option>litros</option><option>rollos</option></select></label>
      <label class="field"><span>Prioridad</span><select class="input" name="priority"><option value="normal">Normal</option><option value="alta">Urgente</option><option value="baja">Cuando se pueda</option></select></label>
      <label class="field"><span>Área</span><input class="input" name="area" placeholder="Recepción, baños…"></label>
      <label class="field full"><span>Nota</span><input class="input" name="note" placeholder="Detalles para bodega"></label>
    </div>`;
  const m = modal({ title: "Pedir insumos a bodega", body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${icon("send")} Enviar solicitud</button>` });
  body.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => { body.item.value = b.dataset.c; body.qty.focus(); });
  const send = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    if (!f.item) return toast("Escribe qué necesitas.", "warn");
    await addDoc(collection(db, "requests"), {
      item: f.item, qty: Number(f.qty) || 1, unit: f.unit, priority: f.priority, area: f.area, note: f.note,
      status: "pendiente", createdBy: state.profile.uid, createdByName: state.profile.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    toast("Insumos recibirá una notificación.", "ok", "Solicitud enviada");
    m.close();
  });
  m.$("[data-save]").onclick = send;
  body.addEventListener("submit", (e) => { e.preventDefault(); send(); });
}

export async function manualOpen() {
  if (!(await confirmDialog("Se enviará la orden de apertura al torniquete y quedará registrada a tu nombre.", { ok: "Abrir torniquete", title: "Apertura manual" }))) return;
  await openTurnstile("Apertura manual");
  toast("Orden de apertura enviada.", "ok");
}
