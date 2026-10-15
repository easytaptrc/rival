// Inventario de recepción: se llena solo cuando recepción confirma lo que entregó bodega; aquí se registra el consumo.
import { esc, icon, modal, toast, busy, formData, fmtDateTime, timeAgo, downloadFile, toCSV } from "../core/ui.js";
import { itemSlug } from "../core/supplies.js";
import { state, db, collection, query, orderBy, limit, onSnapshot, doc, writeBatch, serverTimestamp, increment } from "./data.js";

export function mountReceptionInventory(el) {
  let items = [], moves = [];
  el.innerHTML = `<div class="grid g-main">
    <div class="card fade-in"><div class="card-head"><div><h3>Inventario de recepción</h3><p>Se suma automáticamente al confirmar entregas de bodega</p></div>
      <div class="row"><button class="btn sm" data-csv>${icon("download")} CSV</button><button class="btn sm" data-manual>${icon("plus")} Ajuste</button></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Artículo</th><th>Existencia</th><th class="hide-sm">Última entrada</th><th style="text-align:right">Usar</th></tr></thead><tbody data-rows></tbody></table></div></div>
    <div class="card fade-in"><div class="card-head"><div><h3>Movimientos</h3><p>Entradas de bodega y consumos</p></div></div><div class="list" data-moves></div></div></div>`;
  const paint = () => {
    el.querySelector("[data-rows]").innerHTML = items.map((i) => `<tr><td><b>${esc(i.name)}</b></td>
      <td class="mono"><b style="font-size:16px;color:var(--${i.qty <= 0 ? "bad" : i.qty <= (i.min ?? 1) ? "warn" : "text"})">${i.qty ?? 0}</b> <span class="dim xs">${esc(i.unit || "")}</span></td>
      <td class="hide-sm dim small">${i.lastIn ? timeAgo(i.lastIn) : "—"}</td>
      <td style="text-align:right"><button class="btn sm" data-use="${i.id}" ${i.qty > 0 ? "" : "disabled"}>− Usar</button></td></tr>`).join("")
      || `<tr><td colspan="4"><div class="empty">${icon("box")}Vacío. Cuando confirmes una entrega de bodega, los artículos aparecerán aquí.</div></td></tr>`;
    el.querySelector("[data-moves]").innerHTML = moves.map((m) => `<div class="list-item"><span class="li-ico" style="color:var(--${m.type === "entrada" ? "ok" : "warn"})">${m.type === "entrada" ? "↓" : "↑"}</span>
      <div class="grow"><b>${m.type === "entrada" ? "+" : "−"}${m.qty} ${esc(m.unit || "")} ${esc(m.name)}</b><div class="dim xs">${esc(m.byName || "")} · ${fmtDateTime(m.at)}${m.note ? ` · ${esc(m.note)}` : ""}</div></div></div>`).join("")
      || `<div class="empty">Sin movimientos.</div>`;
  };
  const u1 = onSnapshot(query(collection(db, "receptionInventory"), orderBy("name")), (s) => { items = s.docs.map((d) => ({ id: d.id, ...d.data() })); paint(); },
    (e) => (el.querySelector("[data-rows]").innerHTML = `<tr><td colspan="4"><div class="empty">Sin permiso (${esc(e.code)}).</div></td></tr>`));
  const u2 = onSnapshot(query(collection(db, "receptionMoves"), orderBy("at", "desc"), limit(40)), (s) => { moves = s.docs.map((d) => d.data()); paint(); }, () => {});

  const move = (it, type, qty, note) => {
    const b = writeBatch(db);
    const id = it?.id || itemSlug(it.name);
    b.set(doc(db, "receptionInventory", id), { name: it.name, unit: it.unit || "", qty: increment(type === "entrada" ? qty : -qty), updatedAt: serverTimestamp() }, { merge: true });
    b.set(doc(collection(db, "receptionMoves")), { type, name: it.name, unit: it.unit || "", qty, note, by: state.profile.uid, byName: state.profile.name, at: serverTimestamp() });
    return b.commit();
  };
  el.addEventListener("click", (e) => {
    const u = e.target.closest("[data-use]");
    if (u) {
      const it = items.find((x) => x.id === u.dataset.use);
      const body = document.createElement("form");
      body.className = "grid-form";
      body.innerHTML = `<label class="field"><span>Cantidad usada</span><input class="input mono" name="qty" type="number" min="1" max="${it.qty}" value="1"></label><label class="field"><span>¿Para qué?</span><input class="input" name="note" placeholder="Ej. baño de mujeres"></label>`;
      const m = modal({ title: `Usar · ${it.name}`, body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-s>Registrar uso</button>` });
      m.$("[data-s]").onclick = () => busy(m.$("[data-s]"), async () => {
        const f = formData(body), q = Math.min(it.qty, Math.max(1, Number(f.qty) || 1));
        await move(it, "salida", q, f.note); toast(`−${q} ${it.name}`, "ok"); m.close();
      });
    }
    if (e.target.closest("[data-manual]")) {
      const body = document.createElement("form");
      body.className = "grid-form";
      body.innerHTML = `<label class="field full"><span>Artículo</span><input class="input" name="name" list="recinv-names" required><datalist id="recinv-names">${items.map((i) => `<option value="${esc(i.name)}">`).join("")}</datalist></label>
        <label class="field"><span>Tipo</span><select class="input" name="type"><option value="entrada">Entrada (+)</option><option value="salida">Salida (−)</option></select></label>
        <label class="field"><span>Cantidad</span><input class="input mono" name="qty" type="number" min="1" value="1"></label>
        <label class="field"><span>Unidad</span><input class="input" name="unit" value="piezas"></label><label class="field"><span>Motivo</span><input class="input" name="note" placeholder="Conteo físico, compra directa…"></label>`;
      const m = modal({ title: "Ajuste de inventario de recepción", body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-s>Guardar</button>` });
      m.$("[data-s]").onclick = () => busy(m.$("[data-s]"), async () => {
        const f = formData(body); if (!f.name) return toast("Escribe el artículo.", "warn");
        const it = items.find((i) => i.name.toLowerCase() === f.name.toLowerCase()) || { name: f.name, unit: f.unit };
        await move(it, f.type, Math.max(1, Number(f.qty) || 1), f.note || "Ajuste manual"); toast("Ajuste guardado.", "ok"); m.close();
      });
    }
    if (e.target.closest("[data-csv]")) downloadFile(`inventario-recepcion-${new Date().toISOString().slice(0, 10)}.csv`, toCSV([["Artículo", "Existencia", "Unidad"], ...items.map((i) => [i.name, i.qty, i.unit])]), "text/csv");
  });
  return () => { u1(); u2(); };
}
