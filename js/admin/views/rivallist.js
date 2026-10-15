// Lista Rival (solo dueño): personas con acceso gratis, descuento o premio. Recepción solo las inscribe.
import { esc, icon, modal, toast, busy, formData, confirmDialog, fmtDate, fmtDateTime, debounce, downloadFile, toCSV } from "../../core/ui.js";
import { audit } from "../../core/auth.js";
import { db, collection, onSnapshot, doc, addDoc, updateDoc, serverTimestamp, writeBatch } from "../data.js";
import { CONCEPTS, benefitLabel, prizeLabel } from "../dialogs.js";

const DISCOUNTS = [10, 20, 30, 50];
const PRIZES = [[7, "1 semana gratis"], [14, "2 semanas gratis"], [30, "1 mes gratis"]];

export async function render(el, { profile }) {
  let rows = [], q = "", filter = "todos";
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Solo dueño</div><h1>Lista Rival</h1><p>Personas con acceso gratis, descuento o premio. Recepción solo puede inscribirlas con un clic.</p></div>
      <div class="row wrap"><button class="btn" data-export>${icon("download")} Exportar</button><button class="btn primary" data-new>${icon("plus")} Agregar persona</button></div></div>
    <div class="grid g4 stagger" data-k></div>
    <div class="card fade-in">
      <div class="toolbar" style="margin-bottom:14px">
        <div class="search">${icon("search")}<input class="input" placeholder="Nombre, quién lo registró, concepto" data-q></div>
        <div class="seg" data-seg><button class="on" data-f="todos">Todos</button><button data-f="gratis">Gratis</button><button data-f="descuento">Descuento</button><button data-f="premio">Premios</button><button data-f="pendientes">Sin inscribir</button></div>
      </div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Persona</th><th>Lo registró</th><th>Concepto</th><th>Beneficio</th><th class="hide-sm">Estado</th><th class="hide-sm">Usos</th><th></th></tr></thead><tbody data-rows></tbody></table></div>
    </div>`;

  const paint = () => {
    const k = (t) => rows.filter((r) => r.benefitType === t && r.active !== false).length;
    el.querySelector("[data-k]").innerHTML = [["Acceso gratis", k("gratis"), "ok"], ["Con descuento", k("descuento"), "warn"], ["Premios", k("premio"), "info"], ["Ya inscritos", rows.filter((r) => r.enrolledCode).length, ""]]
      .map(([l, n, c]) => `<div class="card kpi"><span class="k-label">${l}</span><span class="k-value" style="${c ? `color:var(--${c})` : ""}">${n}</span></div>`).join("");
    const n = q.toLowerCase();
    const list = rows.filter((r) => (filter === "todos" || (filter === "pendientes" ? !r.enrolledCode : r.benefitType === filter)) && (!n || `${r.fullName} ${r.referredBy} ${r.concept} ${r.phone}`.toLowerCase().includes(n)))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    el.querySelector("[data-rows]").innerHTML = list.map((r) => `<tr class="click" data-id="${r.id}" style="${r.active === false ? "opacity:.45" : ""}">
      <td><b>${esc(r.fullName)}</b><div class="dim xs">${esc(r.phone || "")}</div></td>
      <td>${esc(r.referredBy || "—")}</td><td><span class="badge plain">${esc(CONCEPTS[r.concept] || r.concept || "—")}</span></td>
      <td><span class="badge ${r.benefitType === "descuento" ? "warn" : r.benefitType === "premio" ? "info" : "ok"}">${esc(benefitLabel({ type: r.benefitType, discount: r.discount, prizeDays: r.prizeDays }))}</span></td>
      <td class="hide-sm small">${r.active === false ? "Pausado" : r.enrolledCode ? `Inscrito <span class="mono">${esc(r.enrolledCode)}</span><div class="dim xs">${esc(r.enrolledByName || "")} · ${fmtDate(r.enrolledAt?.toDate?.())}</div>` : `<span class="dim">Sin inscribir</span>`}</td>
      <td class="hide-sm mono">${r.uses || 0}</td><td>${icon("chevron").replace("<svg", '<svg style="width:18px"')}</td></tr>`).join("")
      || `<tr><td colspan="7"><div class="empty">${icon("star")}${rows.length ? "Sin coincidencias." : "Agrega a la primera persona de la Lista Rival."}</div></td></tr>`;
  };
  const unsub = onSnapshot(collection(db, "rivalList"), (s) => { rows = s.docs.map((d) => ({ id: d.id, ...d.data() })); paint(); },
    (e) => (el.querySelector("[data-rows]").innerHTML = `<tr><td colspan="7"><div class="empty">Sin permiso (${esc(e.code)}).</div></td></tr>`));

  el.querySelector("[data-q]").addEventListener("input", debounce((e) => { q = e.target.value.trim(); paint(); }, 120));
  el.querySelector("[data-seg]").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; el.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b)); paint(); });
  el.querySelector("[data-new]").onclick = () => entryDialog(null, profile);
  el.querySelector("[data-rows]").addEventListener("click", (e) => { const r = e.target.closest("[data-id]"); if (r) entryDialog(rows.find((x) => x.id === r.dataset.id), profile); });
  el.querySelector("[data-export]").onclick = () => downloadFile(`lista-rival-${new Date().toISOString().slice(0, 10)}.csv`, toCSV([
    ["Nombre", "Teléfono", "Lo registró", "Concepto", "Beneficio", "Socio", "Usos", "Activo"],
    ...rows.map((r) => [r.fullName, r.phone, r.referredBy, CONCEPTS[r.concept] || r.concept, benefitLabel({ type: r.benefitType, discount: r.discount, prizeDays: r.prizeDays }), r.enrolledCode || "", r.uses || 0, r.active === false ? "no" : "sí"]),
  ]), "text/csv");
  return unsub;
}

function entryDialog(e, profile) {
  const isNew = !e;
  e = e || { benefitType: "gratis", concept: "brothers", discount: 20, prizeDays: 7, active: true };
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<div class="grid-form">
      <label class="field"><span>Nombre(s) *</span><input class="input" name="firstName" required value="${esc(e.firstName || "")}"></label>
      <label class="field"><span>Apellidos</span><input class="input" name="lastName" value="${esc(e.lastName || "")}"></label>
      <label class="field"><span>Teléfono</span><input class="input" name="phone" type="tel" value="${esc(e.phone || "")}"></label>
      <label class="field"><span>Correo</span><input class="input" name="email" type="email" value="${esc(e.email || "")}"></label>
      <label class="field"><span>Fecha de nacimiento</span><input class="input" name="birthdate" type="date" value="${esc(e.birthdate || "")}"></label>
      <label class="field"><span>¿Quién lo registró? *</span><input class="input" name="referredBy" required placeholder="Ej. Andrés Ibarra" value="${esc(e.referredBy || "")}"></label>
    </div>
    <div><div class="label" style="margin-bottom:8px">Concepto</div><div class="seg" data-concept style="flex-wrap:wrap">${Object.entries(CONCEPTS).map(([k, l]) => `<button type="button" data-v="${k}" class="${e.concept === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
    <div><div class="label" style="margin-bottom:8px">Beneficio</div><div class="seg" data-type><button type="button" data-v="gratis" class="${e.benefitType === "gratis" ? "on" : ""}">Acceso gratis</button><button type="button" data-v="descuento" class="${e.benefitType === "descuento" ? "on" : ""}">Acceso con descuento</button><button type="button" data-v="premio" class="${e.benefitType === "premio" ? "on" : ""}">Participación / premio</button></div></div>
    <div data-opt-descuento><div class="label" style="margin-bottom:8px">¿De cuánto?</div><div class="row wrap">${DISCOUNTS.map((d) => `<button type="button" class="btn sm ${Number(e.discount) === d ? "primary" : ""}" data-disc="${d}">${d}%</button>`).join("")}<input class="input mono" name="discount" type="number" min="1" max="99" value="${e.discount || 20}" style="width:90px"><span class="dim small">%</span></div></div>
    <div data-opt-premio><div class="label" style="margin-bottom:8px">Premio</div><div class="row wrap">${PRIZES.map(([d, l]) => `<button type="button" class="btn sm ${Number(e.prizeDays) === d ? "primary" : ""}" data-prize="${d}">${l}</button>`).join("")}<input class="input mono" name="prizeDays" type="number" min="1" value="${e.prizeDays || 7}" style="width:90px"><span class="dim small">días</span></div>
      <p class="dim xs" style="margin:8px 0 0">El premio se aplica una sola vez. Acceso gratis y descuento aplican en cada renovación.</p></div>
    <label class="field"><span>Notas internas</span><input class="input" name="notes" value="${esc(e.notes || "")}" placeholder="Ej. ganó el reto de octubre"></label>
    ${!isNew ? `<label class="check"><input type="checkbox" name="active" ${e.active !== false ? "checked" : ""}> Beneficio activo (desmarca para pausarlo sin borrar)</label>
      ${e.enrolledCode ? `<div class="notice info">${icon("check")}<div>Inscrito como <b class="mono">${esc(e.enrolledCode)}</b> por ${esc(e.enrolledByName || "—")} · ${fmtDateTime(e.enrolledAt)} · ${e.uses || 0} uso(s).${e.benefitType === "premio" ? ` <button type="button" class="btn sm" data-reset>Permitir usar el premio otra vez</button>` : ""}</div></div>` : ""}` : ""}`;
  let concept = e.concept, type = e.benefitType;
  const sync = () => { body.querySelector("[data-opt-descuento]").hidden = type !== "descuento"; body.querySelector("[data-opt-premio]").hidden = type !== "premio"; };
  sync();
  body.addEventListener("click", (ev) => {
    const c = ev.target.closest("[data-concept] [data-v]"); if (c) { concept = c.dataset.v; body.querySelectorAll("[data-concept] [data-v]").forEach((x) => x.classList.toggle("on", x === c)); }
    const t = ev.target.closest("[data-type] [data-v]"); if (t) { type = t.dataset.v; body.querySelectorAll("[data-type] [data-v]").forEach((x) => x.classList.toggle("on", x === t)); sync(); }
    const d = ev.target.closest("[data-disc]"); if (d) { body.discount.value = d.dataset.disc; body.querySelectorAll("[data-disc]").forEach((x) => x.classList.toggle("primary", x === d)); }
    const p = ev.target.closest("[data-prize]"); if (p) { body.prizeDays.value = p.dataset.prize; body.querySelectorAll("[data-prize]").forEach((x) => x.classList.toggle("primary", x === p)); }
  });
  const m = modal({ title: isNew ? "Agregar a la Lista Rival" : `Lista Rival · ${e.fullName}`, wide: true, body,
    foot: `${!isNew ? `<button class="btn danger" data-del>${icon("trash")} Quitar</button>` : ""}<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${icon("check")} Guardar</button>` });
  m.$("[data-reset]")?.addEventListener("click", async () => {
    await updateDoc(doc(db, "rivalList", e.id), { enrolledCode: null, enrolledAt: null, enrolledBy: null, enrolledByName: null });
    toast("El premio puede volver a usarse.", "ok"); m.close();
  });
  m.$("[data-del]")?.addEventListener("click", async () => {
    if (!(await confirmDialog(`¿Quitar a ${e.fullName} de la Lista Rival? Si ya es socio, su membresía no cambia.`, { ok: "Quitar", danger: true }))) return;
    const b = writeBatch(db); b.delete(doc(db, "rivalList", e.id)); await b.commit();
    audit("rivalList.delete", { id: e.id, name: e.fullName }); toast("Persona quitada de la lista.", "ok"); m.close();
  });
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    if (!f.firstName || !f.referredBy) return toast("Nombre y quién lo registró son obligatorios.", "warn");
    const data = {
      firstName: f.firstName, lastName: f.lastName, fullName: `${f.firstName} ${f.lastName}`.trim(), phone: f.phone, email: f.email, birthdate: f.birthdate,
      referredBy: f.referredBy, concept, benefitType: type, notes: f.notes,
      discount: type === "descuento" ? Math.min(99, Math.max(1, Number(f.discount) || 0)) : null,
      prizeDays: type === "premio" ? Math.max(1, Number(f.prizeDays) || 7) : null,
      active: isNew ? true : !!body.active?.checked, updatedAt: serverTimestamp(),
    };
    if (isNew) { await addDoc(collection(db, "rivalList"), { ...data, uses: 0, enrolledCode: null, createdAt: serverTimestamp(), createdBy: profile.uid }); audit("rivalList.create", { name: data.fullName }); }
    else { await updateDoc(doc(db, "rivalList", e.id), data); audit("rivalList.update", { id: e.id }); }
    toast(isNew ? `${data.fullName} agregado a la Lista Rival.` : "Cambios guardados.", "ok"); m.close();
  });
}
