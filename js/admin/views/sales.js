// Ventas y caja: movimientos por rango, corte de caja y cancelaciones.
import { esc, icon, fmtMoney, fmtDateTime, toast, confirmDialog, downloadFile, toCSV, modal } from "../../core/ui.js";
import { ymd, addDays, parseYmd } from "../../core/membership.js";
import { audit } from "../../core/auth.js";
import { state, salesBetween, db, doc, updateDoc, serverTimestamp } from "../data.js";
import * as D from "../dialogs.js";

const TYPES = { inscripcion: "Inscripción", renovacion: "Renovación", visita: "Visita", producto: "Producto" };

export async function render(el, { profile }) {
  let from = ymd(), to = ymd(), rows = [];
  const canVoid = ["dueno", "gerente"].includes(profile.role);
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Caja</div><h1>Ventas y caja</h1><p>Movimientos, formas de pago y corte</p></div>
      <div class="row wrap"><button class="btn" data-cut>${icon("clipboard")} Corte de caja</button><button class="btn primary" data-sale>${icon("plus")} Nueva venta</button></div></div>
    <div class="toolbar fade-in">
      <div class="seg" data-quick><button class="on" data-r="hoy">Hoy</button><button data-r="ayer">Ayer</button><button data-r="7">7 días</button><button data-r="mes">Este mes</button></div>
      <input type="date" class="input" style="width:auto" data-from value="${from}"><span class="dim">a</span><input type="date" class="input" style="width:auto" data-to value="${to}">
      <button class="btn ghost" data-export>${icon("download")} CSV</button>
    </div>
    <div class="grid g4 stagger" data-kpis></div>
    <div class="card fade-in"><div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Concepto</th><th class="hide-sm">Socio</th><th>Pago</th><th class="hide-sm">Atendió</th><th style="text-align:right">Monto</th>${canVoid ? "<th></th>" : ""}</tr></thead><tbody data-rows></tbody></table></div></div>`;

  const load = async () => {
    el.querySelector("[data-rows]").innerHTML = `<tr><td colspan="7"><div class="skeleton" style="height:120px"></div></td></tr>`;
    try {
      rows = await salesBetween(parseYmd(from), parseYmd(addDays(to, 1)), { includeVoid: true });
      paint();
    } catch (e) { el.querySelector("[data-rows]").innerHTML = `<tr><td colspan="7"><div class="empty">No se pudieron cargar las ventas (${esc(e.code || e.message)}).</div></td></tr>`; }
  };
  const valid = () => rows.filter((r) => !r.void);
  const paint = () => {
    const v = valid(), sum = (a) => a.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const by = (k) => v.filter((x) => x.method === k);
    el.querySelector("[data-kpis]").innerHTML = [
      ["Total", sum(v), `${v.length} movimientos`], ["Efectivo", sum(by("efectivo")), `${by("efectivo").length} pagos`],
      ["Tarjeta", sum(by("tarjeta")), `${by("tarjeta").length} pagos`], ["Transferencia", sum(by("transferencia")), `${by("transferencia").length} pagos`],
    ].map(([l, n, f]) => `<div class="card kpi"><span class="k-label">${l}</span><span class="k-value">${fmtMoney(n)}</span><span class="k-foot">${f}</span></div>`).join("");
    el.querySelector("[data-rows]").innerHTML = rows.map((r) => `<tr style="${r.void ? "opacity:.45;text-decoration:line-through" : ""}">
      <td class="small">${fmtDateTime(r.at)}</td><td><b>${esc(r.concept)}</b><div class="dim xs">${esc(TYPES[r.type] || r.type)}${r.qty > 1 ? ` · ${r.qty} pzs` : ""}${r.note ? ` · ${esc(r.note)}` : ""}</div></td>
      <td class="hide-sm">${r.memberCode ? `<span class="mono xs">${esc(r.memberCode)}</span><div class="small">${esc(r.memberName)}</div>` : esc(r.memberName || "—")}</td>
      <td>${esc(r.method)}</td><td class="hide-sm small">${esc(r.byName || "")}</td><td style="text-align:right" class="mono"><b>${fmtMoney(r.amount)}</b></td>
      ${canVoid ? `<td>${r.void ? `<span class="badge bad">Cancelada</span>` : `<button class="btn ghost sm icon" data-void="${r.id}" title="Cancelar venta">${icon("x")}</button>`}</td>` : ""}</tr>`).join("")
      || `<tr><td colspan="7"><div class="empty">${icon("cash")}Sin ventas en este periodo.</div></td></tr>`;
  };

  el.querySelector("[data-quick]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-r]"); if (!b) return;
    el.querySelectorAll("[data-r]").forEach((x) => x.classList.toggle("on", x === b));
    const t = ymd();
    if (b.dataset.r === "hoy") from = to = t;
    if (b.dataset.r === "ayer") from = to = addDays(t, -1);
    if (b.dataset.r === "7") { from = addDays(t, -6); to = t; }
    if (b.dataset.r === "mes") { from = t.slice(0, 8) + "01"; to = t; }
    el.querySelector("[data-from]").value = from; el.querySelector("[data-to]").value = to; load();
  });
  el.querySelector("[data-from]").onchange = (e) => { from = e.target.value; load(); };
  el.querySelector("[data-to]").onchange = (e) => { to = e.target.value; load(); };
  el.querySelector("[data-sale]").onclick = () => { D.saleDialog(); };
  el.querySelector("[data-export]").onclick = () => downloadFile(`ventas-${from}_${to}.csv`, toCSV([["Fecha", "Tipo", "Concepto", "Socio", "Pago", "Atendió", "Monto", "Cancelada"], ...rows.map((r) => [fmtDateTime(r.at), TYPES[r.type] || r.type, r.concept, r.memberName, r.method, r.byName, r.amount, r.void ? "sí" : ""])]), "text/csv");
  el.querySelector("[data-rows]").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-void]"); if (!b) return;
    if (!(await confirmDialog("La venta quedará marcada como cancelada y no contará en reportes. La vigencia del socio no se modifica automáticamente.", { ok: "Cancelar venta", danger: true }))) return;
    await updateDoc(doc(db, "sales", b.dataset.void), { void: true, voidBy: profile.uid, voidByName: profile.name, voidAt: serverTimestamp() });
    audit("sale.void", { id: b.dataset.void });
    toast("Venta cancelada.", "ok"); load();
  });
  el.querySelector("[data-cut]").onclick = () => cashCut(valid(), from, to);
  load();
}

function cashCut(rows, from, to) {
  const sum = (a) => a.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const methods = ["efectivo", "tarjeta", "transferencia"];
  const people = [...new Set(rows.map((r) => r.byName || "—"))];
  const html = `<div id="cut" class="stack">
    <div class="row spread"><b>Periodo</b><span>${from === to ? from : `${from} → ${to}`}</span></div>
    <div class="summary-box">${methods.map((m) => `<div class="row"><span class="muted" style="text-transform:capitalize">${m}</span><b class="mono">${fmtMoney(sum(rows.filter((r) => r.method === m)))}</b></div>`).join("")}
      <div class="row" style="border-top:1px solid var(--line);padding-top:8px"><span>Total</span><span class="total mono">${fmtMoney(sum(rows))}</span></div></div>
    <div class="label">Por tipo</div>
    <div class="summary-box">${Object.entries(TYPES).map(([k, l]) => `<div class="row"><span class="muted">${l}</span><b class="mono">${rows.filter((r) => r.type === k).length} · ${fmtMoney(sum(rows.filter((r) => r.type === k)))}</b></div>`).join("")}</div>
    <div class="label">Por empleado</div>
    <div class="summary-box">${people.map((p) => `<div class="row"><span class="muted">${esc(p)}</span><b class="mono">${fmtMoney(sum(rows.filter((r) => (r.byName || "—") === p)))}</b></div>`).join("")}</div>
  </div>`;
  const m = modal({ title: "Corte de caja", body: html, foot: `<button class="btn ghost" data-close>Cerrar</button><button class="btn primary" data-print>${icon("download")} Imprimir</button>` });
  m.$("[data-print]").onclick = () => {
    const w = open("", "_blank", "width=420,height=640");
    if (!w) return toast("Permite ventanas emergentes para imprimir.", "warn");
    w.document.write(`<html><head><title>Corte de caja</title><style>body{font:14px system-ui;padding:20px;color:#000}.row{display:flex;justify-content:space-between;padding:4px 0}.summary-box{border:1px dashed #999;padding:8px 12px;margin:6px 0 12px}.label{font-weight:700;margin-top:10px}.total{font-size:18px;font-weight:800}</style></head><body><h2>RIVAL · Corte de caja</h2>${m.$("#cut").innerHTML}<p style="margin-top:30px">Firma: ____________________</p></body></html>`);
    w.document.close(); w.focus(); w.print();
  };
}
