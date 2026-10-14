// Insumos (lado recepción/gerencia): pedir a bodega y seguir el estado.
import { esc, icon, fmtDateTime, timeAgo, toast, confirmDialog } from "../../core/ui.js";
import { db, collection, query, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp } from "../data.js";
import * as D from "../dialogs.js";

const LAB = { pendiente: ["bad", "Pendiente"], en_curso: ["warn", "En curso"], entregada: ["ok", "Entregada"], cancelada: ["plain", "Cancelada"] };

export async function render(el, { profile }) {
  let filter = "abiertas";
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Bodega</div><h1>Solicitudes de insumos</h1><p>Lo que pidas aquí le llega como notificación al equipo de insumos</p></div>
      <div class="row wrap"><a class="btn" href="insumos.html" target="_blank" rel="noopener">${icon("box")} Abrir portal de insumos</a><button class="btn primary" data-new>${icon("plus")} Nueva solicitud</button></div></div>
    <div class="grid g4 stagger" data-k></div>
    <div class="card fade-in"><div class="toolbar" style="margin-bottom:12px"><div class="seg" data-seg><button class="on" data-f="abiertas">Abiertas</button><button data-f="mias">Mis solicitudes</button><button data-f="todas">Todas</button></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Insumo</th><th>Cantidad</th><th class="hide-sm">Pidió</th><th class="hide-sm">Atiende</th><th>Estado</th><th></th></tr></thead><tbody data-rows></tbody></table></div></div>`;
  let all = [];
  const paint = () => {
    const today = new Date().toDateString();
    const c = (s) => all.filter((r) => r.status === s).length;
    el.querySelector("[data-k]").innerHTML = [["Pendientes", c("pendiente"), "bad"], ["En curso", c("en_curso"), "warn"], ["Entregadas hoy", all.filter((r) => r.status === "entregada" && r.updatedAt?.toDate?.().toDateString() === today).length, "ok"], ["Total recientes", all.length, ""]]
      .map(([l, n, k]) => `<div class="card kpi"><span class="k-label">${l}</span><span class="k-value" style="${k ? `color:var(--${k})` : ""}">${n}</span></div>`).join("");
    const rows = all.filter((r) => filter === "todas" || (filter === "mias" ? r.createdBy === profile.uid : ["pendiente", "en_curso"].includes(r.status)));
    el.querySelector("[data-rows]").innerHTML = rows.map((r) => `<tr>
      <td><b class="${r.priority === "alta" ? "prio-alta" : ""}">${r.priority === "alta" ? "⚡ " : ""}${esc(r.item)}</b><div class="dim xs">${esc(r.area || "")}${r.note ? ` · ${esc(r.note)}` : ""}</div></td>
      <td>${r.qty} ${esc(r.unit || "")}</td><td class="hide-sm small">${esc(r.createdByName)}<div class="dim xs">${timeAgo(r.createdAt)}</div></td>
      <td class="hide-sm small">${esc(r.takenByName || "—")}</td><td><span class="badge ${LAB[r.status]?.[0]}">${LAB[r.status]?.[1] || esc(r.status)}</span></td>
      <td>${r.status === "pendiente" && (r.createdBy === profile.uid || ["dueno", "gerente"].includes(profile.role)) ? `<button class="btn ghost sm" data-cancel="${r.id}">Cancelar</button>` : ""}</td></tr>`).join("")
      || `<tr><td colspan="6"><div class="empty">${icon("box")}Nada por aquí.</div></td></tr>`;
  };
  const unsub = onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(150)), (s) => { all = s.docs.map((d) => ({ id: d.id, ...d.data() })); paint(); },
    (e) => (el.querySelector("[data-rows]").innerHTML = `<tr><td colspan="6"><div class="empty">Sin permiso (${esc(e.code)}).</div></td></tr>`));
  el.querySelector("[data-new]").onclick = () => D.requestDialog();
  el.querySelector("[data-seg]").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; el.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b)); paint(); });
  el.querySelector("[data-rows]").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cancel]"); if (!b) return;
    if (!(await confirmDialog("¿Cancelar esta solicitud?", { ok: "Cancelar solicitud", danger: true }))) return;
    await updateDoc(doc(db, "requests", b.dataset.cancel), { status: "cancelada", updatedAt: serverTimestamp() });
    toast("Solicitud cancelada.", "ok");
  });
  return unsub;
}
