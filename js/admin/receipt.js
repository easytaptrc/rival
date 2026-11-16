// Tickets de venta: se imprimen en silencio con la impresora configurada en la app de escritorio.
import { esc, fmtMoney } from "../core/ui.js";
import { state } from "./data.js";

let printer = { auto: false, width: 80 };
export const setPrinterConfig = (c) => (printer = { ...printer, ...(c || {}) });
/** En la app de escritorio solo se imprime solo si alguien eligió una impresora; nunca a la predeterminada por sorpresa. */
export const printerChosen = () => !!printer.name;

export function ticketHtml({ concept, amount, method, memberName, memberCode, periodStart, periodEnd, note, qty }) {
  const w = printer.width === 58 ? "54mm" : "74mm";
  const gym = state.pub.gymName || "RIVAL Gym";
  const row = (a, b) => `<div class="r"><span>${a}</span><b>${b}</b></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}body{width:${w};margin:0;padding:3mm;font:12px/1.35 Arial,sans-serif;color:#000}h1{font-size:16px;margin:0;text-align:center;letter-spacing:2px}.c{text-align:center}.r{display:flex;justify-content:space-between;gap:8px;padding:1px 0}hr{border:0;border-top:1px dashed #000;margin:6px 0}.t{font-size:15px}</style></head><body>
    <h1>${esc(gym)}</h1>${state.pub.address ? `<div class="c">${esc(state.pub.address)}</div>` : ""}${state.pub.phone ? `<div class="c">Tel. ${esc(state.pub.phone)}</div>` : ""}<hr>
    ${row("Fecha", new Date().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }))}${row("Atendió", esc(state.profile?.name || ""))}<hr>
    <div><b>${esc(concept)}</b>${qty > 1 ? ` × ${esc(qty)}` : ""}</div>${memberName ? `<div>${esc(memberName)}${memberCode ? ` · ${esc(memberCode)}` : ""}</div>` : ""}
    ${periodEnd ? `<div>Vigencia: ${esc(periodStart)} a ${esc(periodEnd)}</div>` : ""}${note ? `<div>${esc(note)}</div>` : ""}<hr>
    <div class="r t"><span>TOTAL</span><b>${fmtMoney(amount)}</b></div>${row("Pago", esc(method || ""))}<hr><div class="c">¡Gracias por entrenar con nosotros!</div></body></html>`;
}

/** Imprime solo si la app de escritorio tiene activada la impresión automática. Nunca interrumpe la venta. */
export async function autoTicket(sale) {
  if (!window.rivalDesktop || !printer.auto || !printer.name) return;
  const r = await window.rivalDesktop.print(ticketHtml(sale)).catch((e) => ({ ok: false, error: e.message }));
  if (!r.ok) console.warn("ticket", r.error);
}
