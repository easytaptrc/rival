// Ejercicios del panel de socios: el gimnasio agrega, edita u oculta; cada uno admite GIF propio.
import { esc, icon, modal, toast, busy, formData, confirmDialog } from "../../core/ui.js";
import { audit } from "../../core/auth.js";
import { mountFigure } from "../../core/figure.js";
import { SECTIONS } from "../../core/exercises-catalog.js";
import { db, collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, writeBatch } from "../data.js";

export const MAX_GIF = 700 * 1024; // un documento de Firestore admite 1 MB (base64 ≈ +33 %)

export async function render(el) {
  let rows = [], sec = "todos", stops = [];
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Panel de socios</div><h1>Ejercicios</h1><p>Lo que ven los socios con membresía vigente en <a href="socios.html" target="_blank" rel="noopener">socios.html</a></p></div>
      <button class="btn primary" data-new>${icon("plus")} Agregar ejercicio</button></div>
    <div class="seg fade-in" data-seg style="justify-self:start"><button class="on" data-f="todos">Todos</button>${Object.entries(SECTIONS).map(([k, l]) => `<button data-f="${k}">${l}</button>`).join("")}</div>
    <div class="grid g4" data-grid></div>`;
  const grid = el.querySelector("[data-grid]");
  const paint = () => {
    stops.forEach((f) => f()); stops = [];
    const list = rows.filter((r) => sec === "todos" || r.section === sec).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    grid.innerHTML = list.map((r) => `<div class="card click" data-id="${esc(r.id)}" style="padding:12px;cursor:pointer;${r.active === false ? "opacity:.45" : ""}">
      <div data-m="${esc(r.id)}" style="aspect-ratio:240/210;border-radius:12px;overflow:hidden;background:#0d0d10;display:grid;place-items:center"></div>
      <b style="display:block;margin-top:10px">${esc(r.name)}</b><div class="dim xs">${esc(SECTIONS[r.section] || "")} · ${r.hasMedia || r.gifUrl ? "GIF propio" : "Figura animada"}${r.active === false ? " · oculto" : ""}</div></div>`).join("")
      || `<div class="card" style="grid-column:1/-1"><div class="empty">${icon("dumbbell")}Sin ejercicios en esta sección.</div></div>`;
    list.forEach((r) => {
      const box = grid.querySelector(`[data-m="${CSS.escape(r.id)}"]`);
      if (r.gifUrl) box.innerHTML = `<img src="${esc(r.gifUrl)}" alt="" style="width:100%;height:100%;object-fit:contain" loading="lazy" referrerpolicy="no-referrer">`;
      else if (r.anim) stops.push(mountFigure(box, r.anim));
      else box.innerHTML = `<span class="dim">${r.hasMedia ? "GIF cargado" : icon("dumbbell")}</span>`;
    });
  };
  const unsub = onSnapshot(collection(db, "exercises"), (s) => { rows = s.docs.map((d) => ({ id: d.id, ...d.data() })); paint(); },
    (e) => (grid.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="empty">Sin permiso (${esc(e.code)}).</div></div>`));
  el.querySelector("[data-seg]").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; sec = b.dataset.f; el.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b)); paint(); });
  el.querySelector("[data-new]").onclick = () => editor(null, rows.length);
  grid.addEventListener("click", (e) => { const c = e.target.closest("[data-id]"); if (c) editor(rows.find((r) => r.id === c.dataset.id), rows.length); });
  return () => { unsub(); stops.forEach((f) => f()); };
}

function editor(x, count) {
  const isNew = !x;
  x = x || { section: "pierna", steps: [], tips: [], active: true };
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<div class="grid-form">
      <label class="field"><span>Nombre *</span><input class="input" name="name" required value="${esc(x.name || "")}"></label>
      <label class="field"><span>Sección</span><select class="input" name="section">${Object.entries(SECTIONS).map(([k, l]) => `<option value="${k}" ${x.section === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field"><span>Músculos</span><input class="input" name="muscles" value="${esc(x.muscles || "")}"></label>
      <label class="field"><span>Equipo</span><input class="input" name="equipment" value="${esc(x.equipment || "")}"></label>
      <label class="field"><span>Series sugeridas</span><input class="input" name="sets" value="${esc(x.sets || "")}" placeholder="3 × 12"></label>
      <label class="field"><span>Nivel</span><select class="input" name="level">${["Principiante", "Intermedio", "Avanzado"].map((l) => `<option ${x.level === l ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="field full"><span>Pasos (uno por línea)</span><textarea class="input" name="steps" rows="4">${esc((x.steps || []).join("\n"))}</textarea></label>
      <label class="field full"><span>Cuidados (uno por línea)</span><textarea class="input" name="tips" rows="2">${esc((x.tips || []).join("\n"))}</textarea></label>
      <label class="field full"><span>GIF por enlace (https) — usa solo material con permiso de uso</span><input class="input" type="url" name="gifUrl" value="${esc(x.gifUrl || "")}" placeholder="https://…/ejercicio.gif"></label>
      <label class="field full"><span>O sube un GIF (máx. 700 KB)${x.hasMedia ? " · ya hay uno cargado" : ""}</span><input class="input" type="file" name="file" accept="image/gif,image/webp,image/png,image/jpeg"></label>
    </div>
    ${isNew ? "" : `<label class="check"><input type="checkbox" name="active" ${x.active !== false ? "checked" : ""}> Visible para los socios</label>`}`;
  const m = modal({ title: isNew ? "Nuevo ejercicio" : x.name, wide: true, body,
    foot: `${isNew ? "" : `<button class="btn danger" data-del>${icon("trash")} Eliminar</button>`}<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>Guardar</button>` });
  m.$("[data-del]")?.addEventListener("click", async () => {
    if (!(await confirmDialog(`¿Eliminar “${x.name}”?`, { ok: "Eliminar", danger: true }))) return;
    const b = writeBatch(db); b.delete(doc(db, "exercises", x.id)); b.delete(doc(db, "exerciseMedia", x.id)); await b.commit();
    audit("exercise.delete", { id: x.id }); toast("Ejercicio eliminado.", "ok"); m.close();
  });
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body);
    if (!f.name) return toast("Escribe el nombre.", "warn");
    if (f.gifUrl && !/^https:\/\//i.test(f.gifUrl)) return toast("El enlace debe empezar con https://", "warn");
    const file = body.file.files[0];
    if (file && file.size > MAX_GIF) return toast("El archivo pesa más de 700 KB. Comprímelo o usa un enlace.", "warn");
    const id = x.id || `x-${Date.now()}`;
    const lines = (t) => String(t || "").split("\n").map((l) => l.trim()).filter(Boolean);
    const data = { name: f.name, section: f.section, muscles: f.muscles, equipment: f.equipment, sets: f.sets, level: f.level, steps: lines(f.steps), tips: lines(f.tips), gifUrl: f.gifUrl || "", active: isNew ? true : !!body.active?.checked, updatedAt: serverTimestamp() };
    if (isNew) data.order = count + 100;
    try {
      if (file) {
        const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        await setDoc(doc(db, "exerciseMedia", id), { data: url, updatedAt: serverTimestamp() });
        data.hasMedia = true;
      }
      await setDoc(doc(db, "exercises", id), data, { merge: true });
      audit("exercise.save", { id }); toast("Ejercicio guardado.", "ok"); m.close();
    } catch (e) { toast(e.code === "permission-denied" ? "Sin permiso." : e.message, "bad"); }
  });
}
