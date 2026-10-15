// Insumos (lado recepción/gerencia): pedir a bodega, confirmar lo recibido e inventario de recepción.
import { esc, icon, timeAgo, toast, confirmDialog, fmtDateTime } from "../../core/ui.js";
import { REQ_STATUS, reqItems } from "../../core/supplies.js";
import { db, collection, query, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp } from "../data.js";
import { mountReceptionInventory } from "../recinv.js";
import * as D from "../dialogs.js";

export async function render(el, { profile }) {
  let filter = "abiertas", tab = "solicitudes", all = [], cleanupTab = null;
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Bodega</div><h1>Insumos</h1><p>Pide a bodega, confirma lo que te llega y lleva el inventario de recepción</p></div>
      <div class="row wrap"><a class="btn" href="insumos.html" target="_blank" rel="noopener">${icon("box")} Portal de insumos</a><button class="btn primary" data-new>${icon("plus")} Nueva solicitud</button></div></div>
    <div class="seg fade-in" data-tabs style="justify-self:start"><button class="on" data-t="solicitudes">Solicitudes</button><button data-t="inventario">Inventario recepción</button></div>
    <div data-body></div>`;
  const body = el.querySelector("[data-body]");

  const paintRequests = () => {
    const today = new Date().toDateString();
    const c = (s) => all.filter((r) => r.status === s).length;
    const rows = all.filter((r) => filter === "todas" || (filter === "mias" ? r.createdBy === profile.uid : filter === "confirmar" ? r.status === "entregada" : ["pendiente", "en_curso", "entregada"].includes(r.status)));
    body.innerHTML = `<div class="grid g4 stagger" style="margin-bottom:18px">${[["Pendientes", c("pendiente"), "bad"], ["En curso", c("en_curso"), "warn"], ["Por confirmar", c("entregada"), "info"], ["Recibidas hoy", all.filter((r) => r.status === "recibida" && r.receivedAt?.toDate?.().toDateString() === today).length, "ok"]]
      .map(([l, n, k]) => `<div class="card kpi"><span class="k-label">${l}</span><span class="k-value" style="color:var(--${k})">${n}</span></div>`).join("")}</div>
      <div class="card"><div class="toolbar" style="margin-bottom:12px"><div class="seg" data-seg>${[["abiertas", "Abiertas"], ["confirmar", "Por confirmar"], ["mias", "Mis solicitudes"], ["todas", "Todas"]].map(([k, l]) => `<button class="${filter === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("")}</div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Artículos</th><th class="hide-sm">Pidió</th><th class="hide-sm">Atiende</th><th>Estado</th><th></th></tr></thead><tbody>
      ${rows.map((r) => { const items = reqItems(r); const st = REQ_STATUS[r.status] || ["plain", r.status]; return `<tr>
        <td>${r.priority === "alta" ? `<span class="prio-alta">⚡ Urgente</span> ` : ""}${items.map((i) => `<div><b>${i.qty} ${esc(i.unit || "")}</b> ${esc(i.name)}${i.delivered != null && i.delivered !== i.qty ? ` <span class="dim xs">(entregó ${i.delivered})</span>` : ""}</div>`).join("")}
          ${r.note ? `<div class="dim xs">${esc(r.note)}</div>` : ""}${r.closeNote ? `<div class="xs" style="color:var(--warn)">${esc(r.closeNote)}</div>` : ""}
          ${r.status === "recibida" ? `<div class="xs" style="color:var(--${r.incomplete ? "warn" : "ok"})">${r.incomplete ? "Incompleta · " : ""}recibió ${esc(r.receivedByName || "")} ${fmtDateTime(r.receivedAt)}</div>` : ""}</td>
        <td class="hide-sm small">${esc(r.createdByName)}<div class="dim xs">${timeAgo(r.createdAt)}</div></td>
        <td class="hide-sm small">${esc(r.takenByName || "—")}</td>
        <td><span class="badge ${st[0]}">${st[1]}</span>${r.incomplete ? ` <span class="badge warn">Faltó</span>` : ""}</td>
        <td style="text-align:right">${r.status === "entregada" ? `<button class="btn primary sm" data-confirm="${r.id}">${icon("check")} Confirmar</button>` : ""}
          ${r.status === "pendiente" && (r.createdBy === profile.uid || ["dueno", "gerente"].includes(profile.role)) ? `<button class="btn ghost sm" data-cancel="${r.id}">Cancelar</button>` : ""}</td></tr>`; }).join("")
      || `<tr><td colspan="5"><div class="empty">${icon("box")}Nada por aquí.</div></td></tr>`}
      </tbody></table></div></div>`;
  };

  const show = () => {
    cleanupTab?.(); cleanupTab = null;
    if (tab === "solicitudes") paintRequests();
    else cleanupTab = mountReceptionInventory(body);
  };
  const unsub = onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(200)), (s) => { all = s.docs.map((d) => ({ id: d.id, ...d.data() })); if (tab === "solicitudes") paintRequests(); },
    (e) => (body.innerHTML = `<div class="card"><div class="empty">Sin permiso (${esc(e.code)}).</div></div>`));

  el.querySelector("[data-new]").onclick = () => D.requestDialog();
  el.querySelector("[data-tabs]").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b) return; tab = b.dataset.t; el.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("on", x === b)); show(); });
  body.addEventListener("click", async (e) => {
    const f = e.target.closest("[data-f]"); if (f) { filter = f.dataset.f; paintRequests(); return; }
    const c = e.target.closest("[data-confirm]"); if (c) return D.confirmReceipt(c.dataset.confirm);
    const b = e.target.closest("[data-cancel]"); if (!b) return;
    if (!(await confirmDialog("¿Cancelar esta solicitud?", { ok: "Cancelar solicitud", danger: true }))) return;
    await updateDoc(doc(db, "requests", b.dataset.cancel), { status: "cancelada", updatedAt: serverTimestamp() });
    toast("Solicitud cancelada.", "ok");
  });
  show();
  return () => { unsub(); cleanupTab?.(); };
}
