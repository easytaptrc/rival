// Inventario del gimnasio: carga desde Excel, edición y revisión de checklists de insumos.
import { esc, icon, modal, toast, busy, confirmDialog, formData, fmtDate, fmtDateTime } from "../../core/ui.js";
import { audit } from "../../core/auth.js";
import { db, collection, query, orderBy, limit, onSnapshot, doc, getDocs, writeBatch, updateDoc, addDoc, serverTimestamp } from "../data.js";
import { loadXLSX, exportXLSX } from "../xlsx.js";

const ALIASES = {
  name: ["articulo", "artículo", "nombre", "equipo", "item", "producto", "descripcion", "descripción", "concepto", "material"],
  area: ["area", "área", "zona", "ubicacion", "ubicación", "seccion", "sección", "lugar"],
  category: ["categoria", "categoría", "tipo", "clase"],
  qty: ["cantidad", "cant", "existencia", "existencias", "stock", "piezas", "total"],
  unit: ["unidad", "unidades", "um", "u.m."],
  minQty: ["minimo", "mínimo", "min", "stock minimo", "stock mínimo"],
  notes: ["notas", "nota", "observaciones", "comentarios"],
};
const norm = (s) => String(s ?? "").trim().toLowerCase();

export async function render(el, { profile, perms }) {
  const canEdit = ["dueno", "gerente"].includes(profile.role);
  let items = [], q = "";
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Inventario</div><h1>Inventario del gimnasio</h1><p>Sube el Excel con todo lo que debe haber en el gym; insumos lo revisa con un checklist diario</p></div>
      <div class="row wrap"><button class="btn" data-tpl>${icon("download")} Plantilla</button><button class="btn" data-xls>${icon("download")} Exportar</button>${canEdit ? `<button class="btn" data-add>${icon("plus")} Artículo</button><button class="btn primary" data-up>${icon("upload")} Subir Excel</button>` : ""}</div></div>
    <div class="grid g-main">
      <div class="card fade-in"><div class="card-head"><div><h3>Artículos</h3><p data-count></p></div><div class="search" style="position:relative;width:220px">${icon("search")}<input class="input" placeholder="Buscar" data-q style="padding-left:38px"></div></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Artículo</th><th>Área</th><th>Cantidad</th><th class="hide-sm">Mínimo</th>${canEdit ? "<th></th>" : ""}</tr></thead><tbody data-rows></tbody></table></div></div>
      <div class="card fade-in"><div class="card-head"><div><h3>Checklists de insumos</h3><p>Últimas revisiones diarias</p></div></div><div class="list" data-checks></div></div>
    </div>`;
  el.querySelector(".search svg").style.cssText = "position:absolute;left:12px;top:50%;transform:translateY(-50%);width:18px;color:var(--text-3)";

  const paint = () => {
    const rows = items.filter((i) => !q || `${i.name} ${i.area} ${i.category}`.toLowerCase().includes(q));
    el.querySelector("[data-count]").textContent = `${items.length} artículos · ${new Set(items.map((i) => i.area)).size} áreas`;
    el.querySelector("[data-rows]").innerHTML = rows.map((i) => `<tr><td><b>${esc(i.name)}</b>${i.category ? `<div class="dim xs">${esc(i.category)}</div>` : ""}</td><td>${esc(i.area || "—")}</td>
      <td class="mono">${canEdit ? `<input class="input" type="number" min="0" value="${i.qty ?? 0}" data-qty="${i.id}" style="width:86px;min-height:34px;padding:4px 10px">` : i.qty ?? 0} <span class="dim xs">${esc(i.unit || "")}</span></td>
      <td class="hide-sm mono">${i.minQty ?? "—"} ${i.minQty != null && i.qty < i.minQty ? `<span class="badge bad">Bajo</span>` : ""}</td>
      ${canEdit ? `<td><button class="btn ghost sm icon" data-del="${i.id}" title="Eliminar">${icon("trash")}</button></td>` : ""}</tr>`).join("")
      || `<tr><td colspan="5"><div class="empty">${icon("clipboard")}${items.length ? "Sin coincidencias." : "Sube tu Excel de inventario para empezar."}</div></td></tr>`;
  };
  const u1 = onSnapshot(query(collection(db, "inventory"), orderBy("order")), (s) => { items = s.docs.map((d) => ({ id: d.id, ...d.data() })); paint(); },
    (e) => (el.querySelector("[data-rows]").innerHTML = `<tr><td colspan="5"><div class="empty">Sin permiso (${esc(e.code)}).</div></td></tr>`));
  const u2 = onSnapshot(query(collection(db, "checklists"), orderBy("day", "desc"), limit(14)), (s) => {
    el.querySelector("[data-checks]").innerHTML = s.docs.map((d) => { const c = d.data(); const pct = c.total ? Math.round((c.done / c.total) * 100) : 0; return `<div class="list-item" data-check="${d.id}" style="cursor:pointer">
      <span class="li-ico">${icon("clipboard")}</span><div class="grow"><b>${fmtDate(c.day, { weekday: "short", day: "numeric", month: "short" })}</b><div class="dim xs">${esc(c.byName || "")} · ${pct}% revisado</div>
      <div class="progress" style="margin-top:6px"><i style="width:${pct}%"></i></div></div>
      <div style="text-align:right">${c.missing ? `<span class="badge bad">${c.missing} faltan</span>` : ""}${c.damaged ? ` <span class="badge warn">${c.damaged} dañados</span>` : ""}${!c.missing && !c.damaged ? `<span class="badge ok">OK</span>` : ""}</div></div>`; }).join("") || `<div class="empty">${icon("clipboard")}Aún no hay checklists.</div>`;
    el._checks = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
  }, () => {});

  el.querySelector("[data-q]").addEventListener("input", (e) => { q = norm(e.target.value); paint(); });
  el.querySelector("[data-tpl]").onclick = () => exportXLSX("plantilla-inventario-rival.xlsx", [{ name: "Inventario", rows: [["Artículo", "Área", "Categoría", "Cantidad", "Unidad", "Mínimo", "Notas"], ["Mancuernas 10 kg (par)", "Peso libre", "Equipo", 4, "pares", 4, ""], ["Caminadora", "Cardio", "Máquina", 6, "pzas", 6, "Revisar banda"], ["Papel higiénico", "Baños", "Consumible", 24, "rollos", 12, ""]] }]);
  el.querySelector("[data-xls]").onclick = () => exportXLSX(`inventario-rival-${new Date().toISOString().slice(0, 10)}.xlsx`, [{ name: "Inventario", rows: [["Artículo", "Área", "Categoría", "Cantidad", "Unidad", "Mínimo", "Notas"], ...items.map((i) => [i.name, i.area, i.category, i.qty, i.unit, i.minQty, i.notes])] }]);
  el.querySelector("[data-up]")?.addEventListener("click", () => uploadDialog(items.length));
  el.querySelector("[data-add]")?.addEventListener("click", () => addItem(items.length));
  el.querySelector("[data-rows]").addEventListener("change", async (e) => {
    const id = e.target.dataset.qty; if (!id) return;
    await updateDoc(doc(db, "inventory", id), { qty: Number(e.target.value) || 0, updatedAt: serverTimestamp() });
    toast("Cantidad actualizada.", "ok");
  });
  el.querySelector("[data-rows]").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    if (!(await confirmDialog("¿Eliminar este artículo del inventario?", { ok: "Eliminar", danger: true }))) return;
    const wb = writeBatch(db); wb.delete(doc(db, "inventory", b.dataset.del)); await wb.commit();
  });
  el.querySelector("[data-checks]").addEventListener("click", (e) => {
    const r = e.target.closest("[data-check]"); if (!r) return;
    const c = el._checks[r.dataset.check];
    const list = Object.values(c.items || {}).sort((a, b) => (a.area || "").localeCompare(b.area || ""));
    modal({ title: `Checklist · ${fmtDate(c.day)}`, wide: true, body: `<p class="dim small" style="margin-top:0">Por ${esc(c.byName || "—")} · actualizado ${fmtDateTime(c.updatedAt)}</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Artículo</th><th>Área</th><th>Estado</th><th>Nota</th></tr></thead><tbody>
      ${list.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.area || "")}</td><td><span class="badge ${{ ok: "ok", falta: "bad", danado: "warn" }[i.s] || "plain"}">${{ ok: "Completo", falta: "Falta", danado: "Dañado" }[i.s] || "Sin revisar"}</span></td><td class="small">${esc(i.note || "")}</td></tr>`).join("")}
      </tbody></table></div>`, foot: `<button class="btn" data-close>Cerrar</button>` });
  });
  return () => { u1(); u2(); };
}

function addItem(count) {
  const body = document.createElement("form");
  body.className = "grid-form";
  body.innerHTML = `<label class="field full"><span>Artículo *</span><input class="input" name="name" required></label>
    <label class="field"><span>Área</span><input class="input" name="area"></label><label class="field"><span>Categoría</span><input class="input" name="category"></label>
    <label class="field"><span>Cantidad</span><input class="input" type="number" name="qty" value="1" min="0"></label><label class="field"><span>Unidad</span><input class="input" name="unit" value="pzas"></label>
    <label class="field"><span>Mínimo</span><input class="input" type="number" name="minQty" min="0"></label><label class="field"><span>Notas</span><input class="input" name="notes"></label>`;
  const m = modal({ title: "Nuevo artículo", body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>Guardar</button>` });
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    const f = formData(body); if (!f.name) return toast("Escribe el nombre.", "warn");
    await addDoc(collection(db, "inventory"), { name: f.name, area: f.area || "General", category: f.category, qty: Number(f.qty) || 0, unit: f.unit, minQty: f.minQty === "" ? null : Number(f.minQty), notes: f.notes, order: count, updatedAt: serverTimestamp() });
    toast("Artículo agregado.", "ok"); m.close();
  });
}

function uploadDialog(existing) {
  const body = document.createElement("div");
  body.className = "stack";
  body.innerHTML = `<label class="dropzone" data-drop>${icon("upload")}<b>Arrastra tu archivo Excel o CSV aquí</b><span class="dim small">o haz clic para elegirlo · columnas: Artículo, Área, Categoría, Cantidad, Unidad, Mínimo, Notas</span><input type="file" accept=".xlsx,.xls,.csv,.ods" hidden></label>
    <div data-prev></div>`;
  const m = modal({ title: "Subir inventario desde Excel", wide: true, body, foot: `<button class="btn ghost" data-close>Cancelar</button>` });
  const drop = body.querySelector("[data-drop]"), file = drop.querySelector("input");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); e.dataTransfer.files[0] && parse(e.dataTransfer.files[0]); });
  file.addEventListener("change", () => file.files[0] && parse(file.files[0]));

  async function parse(f) {
    try {
      const X = await loadXLSX();
      const wb = X.read(await f.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = X.utils.sheet_to_json(sheet, { header: 1, defval: "" }).filter((r) => r.some((c) => String(c).trim()));
      // Detecta la fila de encabezados (la primera que contenga una columna de nombre reconocible)
      const hIdx = raw.findIndex((r) => r.some((c) => ALIASES.name.includes(norm(c))));
      const head = hIdx >= 0 ? raw[hIdx].map(norm) : [];
      const col = (k) => head.findIndex((c) => ALIASES[k].includes(c));
      const idx = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, col(k)]));
      if (idx.name < 0) { idx.name = 0; }
      const data = raw.slice(hIdx + 1).map((r) => ({
        name: String(r[idx.name] ?? "").trim(),
        area: idx.area >= 0 ? String(r[idx.area]).trim() || "General" : "General",
        category: idx.category >= 0 ? String(r[idx.category]).trim() : "",
        qty: idx.qty >= 0 ? Number(r[idx.qty]) || 0 : 1,
        unit: idx.unit >= 0 ? String(r[idx.unit]).trim() : "",
        minQty: idx.minQty >= 0 && r[idx.minQty] !== "" ? Number(r[idx.minQty]) || 0 : null,
        notes: idx.notes >= 0 ? String(r[idx.notes]).trim() : "",
      })).filter((x) => x.name);
      if (!data.length) return toast("No se encontraron artículos en el archivo.", "warn");
      body.querySelector("[data-prev]").innerHTML = `<div class="notice info">${icon("check")}<div><b>${data.length} artículos detectados</b> en la hoja “${esc(wb.SheetNames[0])}” · ${new Set(data.map((d) => d.area)).size} áreas.</div></div>
        <div class="table-wrap" style="max-height:260px;overflow:auto;margin-top:12px"><table class="table"><thead><tr><th>Artículo</th><th>Área</th><th>Cant.</th><th>Unidad</th><th>Mín.</th></tr></thead><tbody>${data.slice(0, 50).map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.area)}</td><td>${d.qty}</td><td>${esc(d.unit)}</td><td>${d.minQty ?? "—"}</td></tr>`).join("")}</tbody></table></div>
        ${data.length > 50 ? `<p class="dim xs">…y ${data.length - 50} más</p>` : ""}
        <div class="row wrap" style="margin-top:14px">${existing ? `<label class="check"><input type="radio" name="mode" value="replace" checked> Reemplazar inventario actual (${existing})</label><label class="check"><input type="radio" name="mode" value="append"> Agregar a lo existente</label>` : ""}</div>
        <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" data-import>${icon("upload")} Importar ${data.length} artículos</button></div>`;
      body.querySelector("[data-import]").onclick = (e) => busy(e.currentTarget, async () => {
        const mode = body.querySelector("[name=mode]:checked")?.value || "append";
        if (mode === "replace") {
          const old = await getDocs(collection(db, "inventory"));
          for (let i = 0; i < old.docs.length; i += 450) { const b = writeBatch(db); old.docs.slice(i, i + 450).forEach((d) => b.delete(d.ref)); await b.commit(); }
        }
        const base = mode === "replace" ? 0 : existing;
        for (let i = 0; i < data.length; i += 450) {
          const b = writeBatch(db);
          data.slice(i, i + 450).forEach((d, j) => b.set(doc(collection(db, "inventory")), { ...d, order: base + i + j, updatedAt: serverTimestamp() }));
          await b.commit();
        }
        audit("inventory.import", { count: data.length, mode, file: f.name });
        toast(`${data.length} artículos importados. Insumos ya puede hacer el checklist.`, "ok", "Inventario actualizado");
        m.close();
      });
    } catch (e) { console.error(e); toast(e.message || "No se pudo leer el archivo.", "bad"); }
  }
}
