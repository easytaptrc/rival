// Ventas y caja: movimientos por rango, corte de caja y cancelaciones.
import { esc, icon, fmtMoney, fmtDateTime, toast, confirmDialog, downloadFile, toCSV, modal } from "../../core/ui.js";
import { ymd, addDays, parseYmd } from "../../core/membership.js";
import { audit } from "../../core/auth.js";
import { state, salesBetween, db, doc, updateDoc, serverTimestamp, collection, query, where, orderBy, limit, onSnapshot } from "../data.js";
import * as D from "../dialogs.js";

const TYPES = { inscripcion: "Inscripción", renovacion: "Renovación", visita: "Visita", producto: "Producto" };

export async function render(el, { profile }) {
  let from = ymd(), to = ymd(), rows = [];
  const canVoid = ["dueno", "gerente"].includes(profile.role);
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Caja</div><h1>Ventas y caja</h1><p>Movimientos, formas de pago y corte</p></div>
      <div class="row wrap">${canVoid ? `<button class="btn" data-cut>${icon("clipboard")} Resumen del periodo</button>` : ""}<button class="btn" data-mycut>${icon("receipt")} Hacer corte</button><button class="btn primary" data-sale>${icon("plus")} Nueva venta</button></div></div>
    <div class="seg fade-in" data-ptabs style="justify-self:start"><button class="on" data-p="ventas">Ventas</button><button data-p="cortes">${canVoid ? "Cortes de caja del equipo" : "Mis cortes"}</button></div>
    <div data-cuts-pane hidden></div>
    <div class="stack" style="gap:20px" data-sales-pane>
    <div class="toolbar fade-in">
      <div class="seg" data-quick><button class="on" data-r="hoy">Hoy</button><button data-r="ayer">Ayer</button><button data-r="7">7 días</button><button data-r="mes">Este mes</button></div>
      <input type="date" class="input" style="width:auto" data-from value="${from}"><span class="dim">a</span><input type="date" class="input" style="width:auto" data-to value="${to}">
      <button class="btn ghost" data-export>${icon("download")} CSV</button>
    </div>
    <div class="grid g4 stagger" data-kpis></div>
    <div class="card fade-in"><div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Concepto</th><th class="hide-sm">Socio</th><th>Pago</th><th class="hide-sm">Atendió</th><th style="text-align:right">Monto</th>${canVoid ? "<th></th>" : ""}</tr></thead><tbody data-rows></tbody></table></div></div></div>`;

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
  el.querySelector("[data-cut]")?.addEventListener("click", () => cashCut(valid(), from, to));
  el.querySelector("[data-mycut]").onclick = () => D.cashCutDialog();

  // ----- Cortes de caja -----
  let unsubCuts = null;
  el.querySelector("[data-ptabs]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]"); if (!b) return;
    el.querySelectorAll("[data-ptabs] [data-p]").forEach((x) => x.classList.toggle("on", x === b));
    const cuts = b.dataset.p === "cortes";
    el.querySelector("[data-sales-pane]").hidden = cuts;
    el.querySelector("[data-cuts-pane]").hidden = !cuts;
    if (cuts && !unsubCuts) unsubCuts = watchCuts(el.querySelector("[data-cuts-pane]"), profile, canVoid);
  });
  load();
  return () => unsubCuts?.();
}

function watchCuts(pane, profile, all) {
  pane.innerHTML = `<div class="card"><div class="skeleton" style="height:160px"></div></div>`;
  const q = all ? query(collection(db, "cashCuts"), orderBy("at", "desc"), limit(120))
    : query(collection(db, "cashCuts"), where("by", "==", profile.uid), orderBy("at", "desc"), limit(60));
  let cuts = [];
  pane.onclick = (e) => { const r = e.target.closest("[data-cut-id]"); if (r) cutDetail(cuts.find((c) => c.id === r.dataset.cutId)); };
  return onSnapshot(q, (s) => {
    cuts = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const today = new Date().toDateString();
    const hoy = cuts.filter((c) => c.at?.toDate?.().toDateString() === today);
    const sum = (a, f) => a.reduce((t, c) => t + (Number(f(c)) || 0), 0);
    pane.innerHTML = `<div class="grid g4 stagger" style="margin-bottom:18px">
        <div class="card kpi"><span class="k-label">Cortes hoy</span><span class="k-value">${hoy.length}</span></div>
        <div class="card kpi"><span class="k-label">Total cortado hoy</span><span class="k-value">${fmtMoney(sum(hoy, (c) => c.totals?.total))}</span></div>
        <div class="card kpi"><span class="k-label">Efectivo hoy</span><span class="k-value">${fmtMoney(sum(hoy, (c) => c.totals?.efectivo))}</span></div>
        <div class="card kpi"><span class="k-label">Diferencias hoy</span><span class="k-value" style="color:var(--${sum(hoy, (c) => c.diff) < 0 ? "bad" : "ok"})">${fmtMoney(sum(hoy, (c) => c.diff))}</span></div></div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th class="hide-sm">Periodo</th><th class="hide-sm">Ventas</th><th>Total</th><th>Caja</th><th></th></tr></thead><tbody>
      ${cuts.map((c) => `<tr class="click" data-cut-id="${c.id}"><td><b>${fmtDateTime(c.at)}</b></td><td>${esc(c.byName)}</td><td class="hide-sm dim small">desde ${fmtDateTime(c.from)}</td>
        <td class="hide-sm mono">${c.count}</td><td class="mono"><b>${fmtMoney(c.totals?.total)}</b></td>
        <td>${!c.diff ? `<span class="badge ok">Cuadra</span>` : `<span class="badge ${c.diff < 0 ? "bad" : "warn"}">${c.diff < 0 ? "Faltan" : "Sobran"} ${fmtMoney(Math.abs(c.diff))}</span>`}</td><td>${icon("chevron").replace("<svg", '<svg style="width:18px"')}</td></tr>`).join("")
        || `<tr><td colspan="7"><div class="empty">${icon("receipt")}Aún no hay cortes registrados.</div></td></tr>`}</tbody></table></div></div>`;
  }, (e) => (pane.innerHTML = `<div class="card"><div class="empty">No se pudieron cargar los cortes (${esc(e.code)}).</div></div>`));
}

function cutDetail(c) {
  if (!c) return;
  const row = (a, b) => `<div class="row"><span class="muted">${a}</span><b class="mono">${b}</b></div>`;
  const m = modal({
    title: `Corte de ${c.byName}`, wide: true,
    body: `<div class="stack">
      <div class="kv"><div><span>Hecho</span><b>${fmtDateTime(c.at)}</b></div><div><span>Periodo</span><b>${fmtDateTime(c.from)} → ${fmtDateTime(c.at)}</b></div></div>
      <div class="grid g2"><div class="summary-box">${row("Efectivo", fmtMoney(c.totals?.efectivo))}${row("Tarjeta", fmtMoney(c.totals?.tarjeta))}${row("Transferencia", fmtMoney(c.totals?.transferencia))}<div class="row" style="border-top:1px solid var(--line);padding-top:8px"><span>Total (${c.count} ventas)</span><span class="total mono">${fmtMoney(c.totals?.total)}</span></div></div>
      <div class="summary-box">${Object.entries(TYPES).map(([k, l]) => row(l, `${c.byType?.[k]?.n || 0} · ${fmtMoney(c.byType?.[k]?.amount || 0)}`)).join("")}</div></div>
      <div class="summary-box">${row("Efectivo esperado", fmtMoney(c.totals?.efectivo))}${row("Efectivo contado", fmtMoney(c.cashCounted))}<div class="row"><span class="muted">Diferencia</span><b class="mono" style="color:var(--${!c.diff ? "ok" : c.diff < 0 ? "bad" : "warn"})">${!c.diff ? "Cuadra" : `${c.diff < 0 ? "Faltante" : "Sobrante"} ${fmtMoney(Math.abs(c.diff))}`}</b></div>${c.note ? `<div class="dim small">Nota: ${esc(c.note)}</div>` : ""}</div>
      <div><div class="label" style="margin-bottom:8px">Desglose de ventas</div><div class="table-wrap" style="max-height:300px;overflow:auto"><table class="table"><thead><tr><th>Hora</th><th>Concepto</th><th>Socio</th><th>Pago</th><th style="text-align:right">Monto</th></tr></thead><tbody>
      ${(c.sales || []).map((x) => `<tr><td class="mono small">${x.at ? new Date(x.at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—"}</td><td>${esc(x.concept)}</td><td class="small">${esc(x.memberName || "")}</td><td>${esc(x.method)}</td><td class="mono" style="text-align:right">${fmtMoney(x.amount)}</td></tr>`).join("") || `<tr><td colspan="5" class="dim">Sin ventas en este corte.</td></tr>`}
      </tbody></table></div></div></div>`,
    foot: `<button class="btn ghost" data-close>Cerrar</button><button class="btn primary" data-print>${icon("download")} Imprimir</button>`,
  });
  m.$("[data-print]").onclick = () => D.printCut({ ...c, at: c.at?.toDate?.() || new Date(), from: c.from?.toDate?.() || c.from });
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
