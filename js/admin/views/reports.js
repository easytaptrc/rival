// Reportes: ingresos, accesos, socios y exportación a Excel.
import { esc, icon, fmtMoney, fmtDateTime, toDate, countUp } from "../../core/ui.js";
import { ymd, addDays, parseYmd } from "../../core/membership.js";
import { state, statusOf, fullName, salesBetween, accessBetween, attendanceBetween } from "../data.js";
import { barChart, lineChart, hbars, heatmap } from "../charts.js";
import { exportXLSX } from "../xlsx.js";

const TYPES = { inscripcion: "Inscripciones", renovacion: "Renovaciones", visita: "Visitas", producto: "Productos" };

export async function render(el) {
  let from = addDays(ymd(), -29), to = ymd(), data = null;
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Análisis</div><h1>Reportes</h1><p>Ingresos, asistencia y socios</p></div>
      <button class="btn primary" data-xlsx>${icon("download")} Exportar Excel</button></div>
    <div class="toolbar fade-in"><div class="seg" data-quick><button data-r="7">7 días</button><button class="on" data-r="30">30 días</button><button data-r="mes">Este mes</button><button data-r="pmes">Mes anterior</button><button data-r="90">90 días</button></div>
      <input type="date" class="input" style="width:auto" data-from value="${from}"><span class="dim">a</span><input type="date" class="input" style="width:auto" data-to value="${to}"></div>
    <div data-body></div>`;
  const body = el.querySelector("[data-body]");

  const load = async () => {
    body.innerHTML = `<div class="grid g4">${'<div class="skeleton" style="height:110px"></div>'.repeat(4)}</div><div class="skeleton" style="height:260px"></div>`;
    const a = parseYmd(from), b = parseYmd(addDays(to, 1));
    try {
      const [sales, access, att] = await Promise.all([salesBetween(a, b), accessBetween(a, b, 10000), attendanceBetween(a, b).catch(() => [])]);
      data = { sales, access, att };
      paint();
    } catch (e) { body.innerHTML = `<div class="card"><div class="empty">${icon("alert")}No se pudo generar el reporte (${esc(e.code || e.message)}).</div></div>`; }
  };

  function paint() {
    const { sales, access } = data;
    const days = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    const short = (d) => parseYmd(d).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
    const income = sales.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const okAcc = access.filter((x) => x.result === "permitido");
    const newM = state.members.filter((m) => { const t = toDate(m.createdAt); return t && ymd(t) >= from && ymd(t) <= to; });
    const byDayIncome = days.map((d) => ({ label: short(d), value: sales.filter((s) => (s.day || ymd(toDate(s.at))) === d).reduce((a, s) => a + (Number(s.amount) || 0), 0) }));
    const byDayAccess = days.map((d) => ({ label: short(d), value: okAcc.filter((s) => (s.day || ymd(toDate(s.at))) === d).length }));
    const sumBy = (key, labels) => Object.entries(labels).map(([k, l]) => ({ label: l, value: sales.filter((s) => s[key] === k).reduce((a, s) => a + (Number(s.amount) || 0), 0) })).sort((a, b) => b.value - a.value);
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    okAcc.forEach((x) => { const t = toDate(x.at); if (t) grid[t.getDay()][t.getHours()]++; });
    const st = {}; state.members.forEach((m) => { const s = statusOf(m).label.replace(/Vence en \d+ días?|Vence hoy/, "Por vencer"); st[s] = (st[s] || 0) + 1; });
    const visits = {}; okAcc.filter((x) => x.kind === "socio").forEach((x) => (visits[x.ref] = visits[x.ref] || { name: x.name, n: 0 }, visits[x.ref].n++));
    const top = Object.entries(visits).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    const plansSold = {}; sales.filter((s) => s.planId).forEach((s) => (plansSold[s.concept.split("· ")[1] || s.planId] = (plansSold[s.concept.split("· ")[1] || s.planId] || 0) + 1));
    const ticket = sales.length ? income / sales.length : 0;

    body.innerHTML = `
      <div class="grid g4 stagger">
        <div class="card kpi tilt"><span class="k-label">Ingresos</span><span class="k-value" data-c1></span><span class="k-foot">${sales.length} ventas · ticket ${fmtMoney(ticket)}</span></div>
        <div class="card kpi tilt"><span class="k-label">Accesos</span><span class="k-value" data-c2></span><span class="k-foot">${(okAcc.length / Math.max(1, days.length)).toFixed(1)} por día · ${access.length - okAcc.length} denegados</span></div>
        <div class="card kpi tilt"><span class="k-label">Socios nuevos</span><span class="k-value" data-c3></span><span class="k-foot">en el periodo</span></div>
        <div class="card kpi tilt"><span class="k-label">Renovaciones</span><span class="k-value" data-c4></span><span class="k-foot">${fmtMoney(sales.filter((s) => s.type === "renovacion").reduce((a, s) => a + (Number(s.amount) || 0), 0))}</span></div>
      </div>
      <div class="card fade-in"><div class="card-head"><div><h3>Ingresos por día</h3><p>${short(from)} – ${short(to)}</p></div></div>${barChart(byDayIncome, { money: true, width: 1100, height: 240 })}</div>
      <div class="grid g2">
        <div class="card fade-in"><div class="card-head"><div><h3>Ingresos por concepto</h3></div></div>${hbars(sumBy("type", TYPES), { money: true })}</div>
        <div class="card fade-in"><div class="card-head"><div><h3>Formas de pago</h3></div></div>${hbars(sumBy("method", { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" }), { money: true })}</div>
      </div>
      <div class="card fade-in"><div class="card-head"><div><h3>Asistencia de socios</h3><p>Accesos permitidos por día</p></div></div>${lineChart(byDayAccess, { width: 1100, height: 240 })}</div>
      <div class="card fade-in"><div class="card-head"><div><h3>Horas pico</h3><p>Día de la semana × hora</p></div></div>${heatmap(grid)}</div>
      <div class="grid g3">
        <div class="card fade-in"><div class="card-head"><div><h3>Estado de socios</h3><p>Hoy</p></div></div>${hbars(Object.entries(st).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value))}</div>
        <div class="card fade-in"><div class="card-head"><div><h3>Planes vendidos</h3></div></div>${hbars(Object.entries(plansSold).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value))}</div>
        <div class="card fade-in"><div class="card-head"><div><h3>Socios más constantes</h3></div></div><div class="list">${top.map(([code, v], i) => `<div class="list-item"><span class="li-ico mono">${i + 1}</span><div class="grow"><b>${esc(v.name)}</b><div class="dim xs mono">${esc(code)}</div></div><b class="mono">${v.n}</b></div>`).join("") || '<div class="empty">Sin datos</div>'}</div></div>
      </div>`;
    countUp(body.querySelector("[data-c1]"), income, { money: true });
    countUp(body.querySelector("[data-c2]"), okAcc.length);
    countUp(body.querySelector("[data-c3]"), newM.length);
    countUp(body.querySelector("[data-c4]"), sales.filter((s) => s.type === "renovacion").length);
  }

  el.querySelector("[data-quick]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-r]"); if (!b) return;
    el.querySelectorAll("[data-r]").forEach((x) => x.classList.toggle("on", x === b));
    const t = ymd(), r = b.dataset.r;
    if (r === "7" || r === "30" || r === "90") { from = addDays(t, -(Number(r) - 1)); to = t; }
    if (r === "mes") { from = t.slice(0, 8) + "01"; to = t; }
    if (r === "pmes") { const d = new Date(); const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); from = ymd(p); to = ymd(new Date(d.getFullYear(), d.getMonth(), 0)); }
    el.querySelector("[data-from]").value = from; el.querySelector("[data-to]").value = to; load();
  });
  el.querySelector("[data-from]").onchange = (e) => { from = e.target.value; load(); };
  el.querySelector("[data-to]").onchange = (e) => { to = e.target.value; load(); };
  el.querySelector("[data-xlsx]").onclick = () => {
    if (!data) return;
    exportXLSX(`reporte-rival-${from}_${to}.xlsx`, [
      { name: "Ventas", rows: [["Fecha", "Tipo", "Concepto", "Socio", "ID socio", "Pago", "Atendió", "Monto"], ...data.sales.map((s) => [fmtDateTime(s.at), TYPES[s.type] || s.type, s.concept, s.memberName, s.memberCode, s.method, s.byName, Number(s.amount) || 0])] },
      { name: "Accesos", rows: [["Fecha", "Nombre", "ID", "Tipo", "Resultado", "Detalle", "Origen"], ...data.access.map((a) => [fmtDateTime(a.at), a.name, a.ref, a.kind, a.result, a.reason, a.source])] },
      { name: "Asistencia personal", rows: [["Fecha", "Empleado", "Rol", "Tipo", "Origen"], ...data.att.map((a) => [fmtDateTime(a.at), a.name, a.role, a.type, a.source])] },
      { name: "Socios", rows: [["ID", "Nombre", "Teléfono", "Plan", "Inicio", "Vence", "Estado", "Visitas"], ...state.members.map((m) => [m.code, fullName(m), m.phone, m.planName, m.start, m.end, statusOf(m).label, m.visits || 0])] },
    ]);
  };
  load();
}
