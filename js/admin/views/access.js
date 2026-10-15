// Acceso y asistencia: bitácora del torniquete por periodo, asistencia por empleado con horarios, incidencias y descuentos.
import { esc, icon, fmtTime, fmtDateTime, fmtMoney, initials, downloadFile, toCSV, toDate, toast, modal, busy, formData } from "../../core/ui.js";
import { parseYmd, addDays, ymd } from "../../core/membership.js";
import { ROLES, audit } from "../../core/auth.js";
import { state, accessBetween, attendanceBetween, processScan, db, collection, query, orderBy, limit, onSnapshot, doc, getDocs, getDoc, setDoc, updateDoc, serverTimestamp, where } from "../data.js";
import { rangePicker, rangeLabel } from "../range.js";
import { analyzeUser, dayText, schedFor, dur, DAYS, PERIODS, dailyRate } from "../attendance.js";
import * as D from "../dialogs.js";

export async function render(el, { profile }) {
  const isManager = ["dueno", "gerente"].includes(profile.role);
  const isOwner = profile.role === "dueno";
  let tab = isManager ? "asistencia" : "accesos", rows = [], cleanup = null, detailUid = null;
  let users = [], pays = {}, notes = {}, report = [];

  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Control</div><h1>Acceso y asistencia</h1><p data-label></p></div>
      <div class="row wrap"><button class="btn" data-export>${icon("download")} Exportar</button></div></div>
    <div class="seg fade-in" data-tabs style="justify-self:start"><button class="${tab === "asistencia" ? "on" : ""}" data-t="asistencia">${isManager ? "Asistencia del personal" : "Mi asistencia"}</button><button class="${tab === "accesos" ? "on" : ""}" data-t="accesos">Accesos de socios</button><button data-t="torniquete">Torniquete</button></div>
    <div data-range></div>
    <div data-body></div>`;
  const body = el.querySelector("[data-body]");
  const picker = rangePicker(() => { detailUid = null; load(); }, { mode: "dia" });
  el.querySelector("[data-range]").append(picker.el);
  const tolerance = () => Number(state.app.lateTolerance ?? 10);

  const load = async () => {
    cleanup?.(); cleanup = null;
    const r = picker.get();
    el.querySelector("[data-range]").hidden = tab === "torniquete";
    el.querySelector("[data-label]").textContent = tab === "torniquete" ? "Estado del bridge y aperturas" : rangeLabel(r);
    body.innerHTML = `<div class="card"><div class="skeleton" style="height:240px"></div></div>`;
    const a = parseYmd(r.from), b = parseYmd(addDays(r.to, 1));
    try {
      if (tab === "accesos") { rows = await accessBetween(a, b, 5000); paintAccess(); }
      else if (tab === "asistencia") { await loadAttendance(r, a, b); detailUid ? paintDetail() : paintStaff(); }
      else paintTurnstile();
    } catch (e) { console.error(e); body.innerHTML = `<div class="card"><div class="empty">${icon("alert")}No se pudo cargar (${esc(e.code || e.message)}).</div></div>`; }
  };

  // ---------- Asistencia ----------
  async function loadAttendance(r, a, b) {
    const [ev, us] = await Promise.all([attendanceBetween(a, b), getDocs(collection(db, "users"))]);
    users = us.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => u.role !== "dispositivo" && (isManager || u.uid === profile.uid));
    if (isOwner) { const ps = await getDocs(collection(db, "staffPay")).catch(() => null); pays = Object.fromEntries((ps?.docs || []).map((d) => [d.id, d.data()])); }
    const ns = await getDocs(query(collection(db, "attendanceNotes"), where("day", ">=", r.from), where("day", "<=", r.to))).catch(() => null);
    notes = {}; (ns?.docs || []).forEach((d) => { const x = d.data(); (notes[x.uid] ||= {})[x.day] = x; });
    report = users.map((u) => ({ u, a: analyzeUser(u, ev.filter((e) => e.uid === u.uid), { ...r, tolerance: tolerance(), pay: pays[u.uid], notes: notes[u.uid] || {} }) }))
      .filter((x) => x.a.days.length || x.u.schedule || x.u.uid === detailUid)
      .sort((x, y) => x.u.name.localeCompare(y.u.name));
    if (!isManager) detailUid = profile.uid;
  }

  function paintStaff() {
    const tot = (f) => report.reduce((s, x) => s + f(x.a), 0);
    body.innerHTML = `<div class="grid g4 stagger" style="margin-bottom:18px">
        <div class="card kpi"><span class="k-label">Horas trabajadas</span><span class="k-value">${tot((a) => a.hours).toFixed(1)}</span><span class="k-foot">${report.length} empleados</span></div>
        <div class="card kpi"><span class="k-label">Retardos</span><span class="k-value" style="color:var(--warn)">${tot((a) => a.late)}</span><span class="k-foot">${dur(tot((a) => a.lateMin))} en total · tolerancia ${tolerance()} min</span></div>
        <div class="card kpi"><span class="k-label">Faltas</span><span class="k-value" style="color:var(--bad)">${tot((a) => a.absent)}</span><span class="k-foot">${tot((a) => a.early)} salidas anticipadas</span></div>
        <div class="card kpi"><span class="k-label">${isOwner ? "Descuentos sugeridos" : "Sin salida registrada"}</span><span class="k-value">${isOwner ? fmtMoney(tot((a) => a.deduction)) : tot((a) => a.noExit)}</span><span class="k-foot">${isOwner ? "según sueldo y horario" : "días"}</span></div></div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Empleado</th><th>Horario</th><th>Días</th><th>Horas</th><th>Retardos</th><th class="hide-sm">Salidas antes</th><th>Faltas</th>${isOwner ? "<th>Descuento</th>" : ""}<th></th></tr></thead><tbody>
      ${report.map(({ u, a }) => `<tr class="click" data-uid="${u.uid}"><td><div class="row"><div class="avatar">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><div class="dim xs">${esc(ROLES[u.role]?.label || u.role)}</div></div></div></td>
        <td class="small">${u.schedule ? esc(schedSummary(u)) : `<span class="dim">Sin horario</span>`}</td><td class="mono">${a.worked}</td><td class="mono">${a.hours.toFixed(1)}</td>
        <td>${a.late ? `<span class="badge warn">${a.late} · ${dur(a.lateMin)}</span>` : `<span class="dim">0</span>`}</td>
        <td class="hide-sm">${a.early ? `<span class="badge warn">${a.early} · ${dur(a.earlyMin)}</span>` : `<span class="dim">0</span>`}</td>
        <td>${a.absent ? `<span class="badge bad">${a.absent}</span>` : `<span class="dim">0</span>`}</td>
        ${isOwner ? `<td class="mono">${a.deduction ? `<b style="color:var(--bad)">−${fmtMoney(a.deduction)}</b>` : pays[u.uid] ? "$0.00" : `<span class="dim xs">sin sueldo</span>`}</td>` : ""}
        <td>${icon("chevron").replace("<svg", '<svg style="width:18px"')}</td></tr>`).join("") || `<tr><td colspan="9"><div class="empty">${icon("clock")}Sin registros ni horarios en este periodo. Configura horarios desde el detalle de cada empleado.</div></td></tr>`}
      </tbody></table></div><p class="dim xs" style="margin:12px 0 0">Haz clic en un empleado para ver su reporte día por día, configurar su horario y sueldo, y justificar incidencias.</p></div>`;
  }

  function paintDetail() {
    const x = report.find((r) => r.u.uid === detailUid) || (() => { const u = users.find((v) => v.uid === detailUid); return u && { u, a: analyzeUser(u, [], { ...picker.get(), tolerance: tolerance(), pay: pays[u.uid] }) }; })();
    if (!x) { detailUid = null; return paintStaff(); }
    const { u, a } = x;
    const pay = pays[u.uid];
    const days = a.days.slice().reverse();
    body.innerHTML = `<div class="stack" style="gap:18px">
      <div class="card"><div class="row wrap" style="justify-content:space-between">
        <div class="row">${isManager ? `<button class="btn ghost icon" data-back aria-label="Volver">${icon("chevron").replace("<svg", '<svg style="transform:rotate(180deg)"')}</button>` : ""}<div class="avatar lg" style="width:64px;height:64px;font-size:20px">${esc(initials(u.name))}</div>
          <div><h2 style="font-size:22px">${esc(u.name)}</h2><div class="dim small">${esc(ROLES[u.role]?.label || u.role)} · ${u.schedule ? esc(schedSummary(u)) : "sin horario configurado"}${isOwner && pay?.amount ? ` · ${fmtMoney(pay.amount)} ${PERIODS[pay.period] || ""}` : ""}</div></div></div>
        <div class="row wrap">${isManager ? `<button class="btn" data-sched>${icon("clock")} Horario${isOwner ? " y sueldo" : ""}</button>` : ""}<button class="btn" data-copy>${icon("clipboard")} Copiar resumen</button><button class="btn" data-csv>${icon("download")} CSV</button></div></div></div>
      <div class="grid g4 stagger">
        <div class="card kpi"><span class="k-label">Días trabajados</span><span class="k-value">${a.worked}</span><span class="k-foot">${a.hours.toFixed(1)} horas</span></div>
        <div class="card kpi"><span class="k-label">Retardos</span><span class="k-value" style="color:var(--warn)">${a.late}</span><span class="k-foot">${dur(a.lateMin)} acumulados</span></div>
        <div class="card kpi"><span class="k-label">Faltas · salidas antes</span><span class="k-value" style="color:var(--bad)">${a.absent} · ${a.early}</span><span class="k-foot">${a.noExit} sin salida registrada</span></div>
        <div class="card kpi"><span class="k-label">${isOwner ? "Descuento sugerido" : "Incidencias"}</span><span class="k-value" style="color:var(--bad)">${isOwner ? `−${fmtMoney(a.deduction)}` : days.filter((d) => d.incident).length}</span><span class="k-foot">${isOwner ? (a.rate ? `tarifa diaria ${fmtMoney(a.rate)}` : "configura su sueldo") : "en el periodo"}</span></div>
      </div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th></th><th>Día</th><th>Horario</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Resumen</th>${isOwner ? "<th>Descuento</th>" : ""}${isManager ? "<th></th>" : ""}</tr></thead><tbody>
      ${days.map((d) => `<tr style="${d.justified ? "opacity:.7" : ""}">
        <td style="font-size:18px;font-weight:800;color:var(--${d.incident ? "bad" : d.justified ? "info" : d.offDay ? "text-3" : "ok"})" title="${d.incident ? "Incidencia" : "OK"}">${d.incident ? "✗" : d.justified ? "J" : d.pending ? "…" : "✓"}</td>
        <td class="small"><b>${new Date(d.day + "T00:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}</b></td>
        <td class="mono small">${d.sched ? `${d.sched.in}–${d.sched.out}` : `<span class="dim">Descanso</span>`}</td>
        <td class="mono" style="${d.lateMin ? "color:var(--bad);font-weight:700" : ""}">${d.firstIn ? fmtTime(d.firstIn) : "—"}</td>
        <td class="mono" style="${d.earlyMin || d.noExit ? "color:var(--bad);font-weight:700" : ""}">${d.stillIn ? `<span class="badge ok">En turno</span>` : d.lastOut ? fmtTime(d.lastOut) : d.noExit ? "Sin salida" : "—"}</td>
        <td class="mono">${(d.workedMin / 60).toFixed(1)}</td>
        <td class="small" style="max-width:340px">${d.pending ? `<span class="dim">Aún no inicia su turno</span>` : d.incident || d.justified ? esc(dayText(d, isOwner ? fmtMoney : null)) : d.offDay ? `<span class="dim">Trabajó en día de descanso</span>` : `<span class="dim">Puntual</span>`}</td>
        ${isOwner ? `<td class="mono">${d.deduction ? `<b style="color:var(--bad)">−${fmtMoney(d.deduction)}</b>` : "—"}</td>` : ""}
        ${isManager ? `<td>${d.incident || d.justified ? `<button class="btn ghost sm" data-just="${d.day}">${d.justified ? "Quitar justificación" : "Justificar"}</button>` : ""}</td>` : ""}</tr>`).join("") || `<tr><td colspan="9"><div class="empty">${icon("clock")}Sin días con horario o registros en este periodo.</div></td></tr>`}
      </tbody></table></div>
      <p class="dim xs" style="margin:12px 0 0">✗ incidencia (retardo, salida anticipada, falta o sin salida) · J justificado · tolerancia de ${tolerance()} min. El descuento es una sugerencia proporcional al sueldo; tú decides si lo aplicas.</p></div></div>`;
  }

  // ---------- Accesos de socios ----------
  function paintAccess() {
    const ok = rows.filter((r) => r.result === "permitido").length;
    body.innerHTML = `<div class="grid g3 stagger" style="margin-bottom:18px">
        <div class="card kpi"><span class="k-label">Permitidos</span><span class="k-value" style="color:var(--ok)">${ok}</span></div>
        <div class="card kpi"><span class="k-label">Denegados</span><span class="k-value" style="color:var(--bad)">${rows.length - ok}</span></div>
        <div class="card kpi"><span class="k-label">Socios únicos</span><span class="k-value">${new Set(rows.filter((r) => r.kind === "socio" && r.result === "permitido").map((r) => r.ref)).size}</span></div></div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Fecha y hora</th><th>Persona</th><th>Tipo</th><th class="hide-sm">Origen</th><th>Resultado</th><th class="hide-sm">Detalle</th></tr></thead><tbody>
      ${rows.slice(0, 1500).map((r) => `<tr ${r.kind === "socio" && r.ref ? `class="click" data-member="${esc(r.ref)}"` : ""}><td class="mono small">${fmtDateTime(r.at)}</td><td><b>${esc(r.name)}</b><div class="dim xs mono">${esc(r.ref && r.kind === "socio" ? r.ref : "")}</div></td>
        <td>${esc({ socio: "Socio", personal: "Personal", visita: "Visita" }[r.kind] || r.kind)}</td><td class="hide-sm">${esc(r.source || "")}</td>
        <td><span class="badge ${r.result === "permitido" ? "ok" : "bad"}">${r.result === "permitido" ? "Permitido" : "Denegado"}</span></td><td class="hide-sm dim small">${esc(r.reason || "")}</td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">${icon("finger")}Sin accesos en este periodo.</div></td></tr>`}
      </tbody></table></div>${rows.length > 1500 ? `<p class="dim xs">Mostrando 1,500 de ${rows.length}. Exporta para ver todo.</p>` : ""}</div>`;
  }

  // ---------- Torniquete ----------
  function paintTurnstile() {
    body.innerHTML = `<div class="grid g2">
      <div class="card"><div class="card-head"><div><h3>Estado del torniquete</h3><p>Bridge local conectado al lector de huella y al relevador</p></div></div>
        <div class="row" style="margin-bottom:14px"><span class="dot off" data-d-dot></span><b data-d-state>Consultando…</b></div><div class="kv" data-d-kv></div>
        <div class="row wrap" style="margin-top:16px"><button class="btn primary" data-open>${icon("door")} Abrir torniquete</button></div></div>
      <div class="card"><div class="card-head"><div><h3>Simular / capturar huella</h3><p>Prueba el flujo sin hardware o usa un lector tipo teclado</p></div></div>
        <form class="row" data-sim><input class="input" name="id" placeholder="ID socio (284) o empleado (9001)"><button class="btn">Validar</button></form><div class="dim small" data-sim-out style="margin-top:12px"></div></div>
      <div class="card span2"><div class="card-head"><div><h3>Órdenes recientes</h3><p>Aperturas enviadas al torniquete</p></div></div><div data-cmds class="table-wrap"></div></div></div>`;
    body.querySelector("[data-open]").onclick = () => D.manualOpen();
    body.querySelector("[data-sim]").addEventListener("submit", async (e) => {
      e.preventDefault(); const v = e.target.id.value.trim(); if (!v) return; e.target.id.value = "";
      const r = await processScan(v, "simulación");
      body.querySelector("[data-sim-out]").innerHTML = r.kind === "personal" ? `${esc(r.person.name)}: ${r.allowed ? `asistencia <b>${r.attendance}</b>` : esc(r.reason)}`
        : r.member ? `${esc(r.member.firstName)}: <b style="color:var(--${r.allowed ? "ok" : "bad"})">${r.allowed ? "permitido" : "denegado"}</b> · ${esc(r.reason)}` : `<span style="color:var(--bad)">ID no registrado</span>`;
    });
    const u1 = onSnapshot(doc(db, "devices", "torniquete-1"), (s) => {
      const d = s.data(), online = d && Date.now() - (toDate(d.lastSeen)?.getTime() || 0) < 90000;
      body.querySelector("[data-d-dot]").className = `dot ${online ? "pulse" : d ? "bad" : "off"}`;
      body.querySelector("[data-d-state]").textContent = !d ? "Bridge no instalado (modo manual)" : online ? "Conectado" : "Sin señal";
      body.querySelector("[data-d-kv]").innerHTML = d ? `<div><span>Equipo</span><b>${esc(d.name || "—")}</b></div><div><span>Última señal</span><b>${fmtDateTime(d.lastSeen)}</b></div><div><span>Relevador</span><b>${esc(d.relay || "—")}</b></div><div><span>Versión</span><b>${esc(d.version || "—")}</b></div>`
        : `<div style="grid-column:1/-1"><span>Cómo conectarlo</span><b style="font-weight:500">Instala la carpeta <code>bridge/</code> en la PC de recepción (ver README). El panel funciona igual en modo manual.</b></div>`;
    }, () => {});
    const u2 = onSnapshot(query(collection(db, "turnstileCommands"), orderBy("at", "desc"), limit(12)), (s) => {
      const cmds = s.docs.map((d) => d.data());
      body.querySelector("[data-cmds]").innerHTML = cmds.length ? `<table class="table"><thead><tr><th>Hora</th><th>Motivo</th><th>Por</th><th>Estado</th></tr></thead><tbody>${cmds.map((c) => `<tr><td class="mono">${fmtTime(c.at)}</td><td>${esc(c.reason)}</td><td>${esc(c.byName || "bridge")}</td><td><span class="badge ${c.done ? (c.error ? "bad" : "ok") : "warn"}">${c.done ? (c.error ? "Error" : "Ejecutada") : "En cola"}</span></td></tr>`).join("")}</tbody></table>` : `<div class="empty">Sin órdenes.</div>`;
    }, () => {});
    cleanup = () => { u1(); u2(); };
  }

  // ---------- Eventos ----------
  el.querySelector("[data-tabs]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    tab = b.dataset.t; detailUid = null; el.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("on", x === b)); load();
  });
  body.addEventListener("click", async (e) => {
    const m = e.target.closest("[data-member]"); if (m) return D.memberDetail(m.dataset.member);
    const u = e.target.closest("[data-uid]"); if (u) { detailUid = u.dataset.uid; paintDetail(); scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (e.target.closest("[data-back]")) { detailUid = null; paintStaff(); return; }
    if (e.target.closest("[data-sched]")) return scheduleDialog(report.find((r) => r.u.uid === detailUid)?.u || users.find((x) => x.uid === detailUid), pays[detailUid], isOwner, load);
    const j = e.target.closest("[data-just]");
    if (j) return justifyDialog(detailUid, j.dataset.just, notes[detailUid]?.[j.dataset.just], profile, load);
    if (e.target.closest("[data-copy]")) {
      const x = report.find((r) => r.u.uid === detailUid); if (!x) return;
      const txt = summaryText(x.u, x.a, picker.get(), isOwner);
      await navigator.clipboard?.writeText(txt).then(() => toast("Resumen copiado. Puedes pegarlo en WhatsApp.", "ok")).catch(() => modal({ title: "Resumen", body: `<pre style="white-space:pre-wrap">${esc(txt)}</pre>` }));
    }
    if (e.target.closest("[data-csv]")) {
      const x = report.find((r) => r.u.uid === detailUid); if (!x) return;
      downloadFile(`asistencia-${x.u.username || x.u.name}-${picker.get().from}_${picker.get().to}.csv`, toCSV([["Día", "Horario", "Entrada", "Salida", "Horas", "Retardo (min)", "Salida antes (min)", "Falta", "Justificado", "Descuento", "Resumen"],
        ...x.a.days.map((d) => [d.day, d.sched ? `${d.sched.in}-${d.sched.out}` : "Descanso", d.firstIn ? fmtTime(d.firstIn) : "", d.lastOut ? fmtTime(d.lastOut) : "", (d.workedMin / 60).toFixed(2), d.lateMin, d.earlyMin, d.absent ? "sí" : "", d.justified ? "sí" : "", isOwner ? d.deduction : "", dayText(d)])]), "text/csv");
    }
  });
  el.querySelector("[data-export]").onclick = () => {
    const { from, to } = picker.get();
    if (tab === "accesos") downloadFile(`accesos-${from}_${to}.csv`, toCSV([["Fecha", "Nombre", "ID", "Tipo", "Origen", "Resultado", "Detalle"], ...rows.map((r) => [fmtDateTime(r.at), r.name, r.ref, r.kind, r.source, r.result, r.reason])]), "text/csv");
    else if (tab === "asistencia") downloadFile(`asistencia-personal-${from}_${to}.csv`, toCSV([["Empleado", "Rol", "Días", "Horas", "Retardos", "Min. retardo", "Salidas antes", "Faltas", "Sin salida", ...(isOwner ? ["Descuento sugerido"] : [])],
      ...report.map(({ u, a }) => [u.name, ROLES[u.role]?.label || u.role, a.worked, a.hours.toFixed(2), a.late, a.lateMin, a.early, a.absent, a.noExit, ...(isOwner ? [a.deduction] : [])])]), "text/csv");
    else toast("Elige Asistencia o Accesos para exportar.", "info");
  };
  load();
  return () => cleanup?.();
}

function schedSummary(u) {
  const s = u.schedule || {};
  const groups = [];
  [1, 2, 3, 4, 5, 6, 0].forEach((d) => {
    const v = s[d]; const key = v?.in ? `${v.in}–${v.out}` : null;
    const last = groups[groups.length - 1];
    if (key && last?.key === key && last.days[last.days.length - 1] === (d === 0 ? 6 : d - 1)) last.days.push(d); else if (key) groups.push({ key, days: [d] });
  });
  const ab = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return groups.map((g) => `${ab[g.days[0]]}${g.days.length > 1 ? `–${ab[g.days[g.days.length - 1]]}` : ""} ${g.key}`).join(", ") || "Sin días laborales";
}

function summaryText(u, a, r, withMoney) {
  const lines = [`Resumen de asistencia · ${u.name}`, rangeLabel(r), ""];
  const inc = a.days.filter((d) => d.incident || d.justified);
  if (!inc.length) lines.push("Sin incidencias en el periodo. ¡Bien hecho!");
  inc.forEach((d) => lines.push(`• ${dayText(d, withMoney ? fmtMoney : null)}`));
  lines.push("", `Días trabajados: ${a.worked} · Horas: ${a.hours.toFixed(1)}`, `Retardos: ${a.late} (${dur(a.lateMin)}) · Salidas antes: ${a.early} · Faltas: ${a.absent}`);
  if (withMoney && a.deduction) lines.push(`Descuento total: ${fmtMoney(a.deduction)}`);
  return lines.join("\n");
}

function scheduleDialog(u, pay, isOwner, reload) {
  if (!u) return;
  const s = u.schedule || {};
  const body = document.createElement("form");
  body.className = "stack";
  body.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Día</th><th>Trabaja</th><th>Entrada</th><th>Salida</th></tr></thead><tbody>
    ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<tr data-d="${d}"><td><b>${DAYS[d]}</b></td><td><label class="switch"><input type="checkbox" data-on ${s[d]?.in ? "checked" : ""}><i></i></label></td>
      <td><input class="input mono" type="time" data-in value="${s[d]?.in || "07:00"}" style="width:130px"></td><td><input class="input mono" type="time" data-out value="${s[d]?.out || "15:00"}" style="width:130px"></td></tr>`).join("")}</tbody></table></div>
    <button type="button" class="btn sm" data-copy-mon style="justify-self:start">${icon("refresh")} Copiar horario del lunes a lunes–viernes</button>
    ${isOwner ? `<div class="grid-form"><label class="field"><span>Sueldo</span><input class="input mono" name="amount" type="number" min="0" step="0.01" value="${pay?.amount ?? ""}" placeholder="Ej. 2500"></label>
      <label class="field"><span>Periodo</span><select class="input" name="period">${Object.entries(PERIODS).map(([k, l]) => `<option value="${k}" ${(pay?.period || "semana") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <p class="dim xs" style="margin:0">El sueldo solo lo ve el dueño. Se usa para calcular el descuento sugerido proporcional a minutos de retardo, salidas antes de hora y faltas.</p>` : ""}`;
  const m = modal({ title: `Horario · ${u.name}`, wide: true, body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>${icon("check")} Guardar</button>` });
  body.querySelector("[data-copy-mon]").onclick = () => {
    const mon = body.querySelector('[data-d="1"]');
    [2, 3, 4, 5].forEach((d) => { const r = body.querySelector(`[data-d="${d}"]`); r.querySelector("[data-on]").checked = mon.querySelector("[data-on]").checked; r.querySelector("[data-in]").value = mon.querySelector("[data-in]").value; r.querySelector("[data-out]").value = mon.querySelector("[data-out]").value; });
  };
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    const schedule = {};
    for (const r of body.querySelectorAll("[data-d]")) {
      const on = r.querySelector("[data-on]").checked, i = r.querySelector("[data-in]").value, o = r.querySelector("[data-out]").value;
      if (on && (!i || !o || o <= i)) return toast(`Revisa el horario del ${DAYS[r.dataset.d]} (la salida debe ser después de la entrada).`, "warn");
      schedule[r.dataset.d] = on ? { in: i, out: o } : null;
    }
    try {
      await updateDoc(doc(db, "users", u.uid), { schedule });
      if (isOwner) { const f = formData(body); await setDoc(doc(db, "staffPay", u.uid), { amount: f.amount === "" ? null : Number(f.amount), period: f.period, updatedAt: serverTimestamp() }); }
      audit("staff.schedule", { uid: u.uid });
      toast("Horario guardado.", "ok"); m.close(); reload();
    } catch (e) { toast(e.code === "permission-denied" ? "No tienes permiso para cambiar horarios." : e.message, "bad"); }
  });
}

function justifyDialog(uid, day, current, profile, reload) {
  const id = `${uid}_${day}`;
  if (current?.justified) {
    return setDoc(doc(db, "attendanceNotes", id), { uid, day, justified: false, note: current.note || "", by: profile.uid, byName: profile.name, at: serverTimestamp() }).then(() => { toast("Justificación retirada.", "ok"); reload(); });
  }
  const body = document.createElement("form");
  body.innerHTML = `<label class="field"><span>Motivo</span><input class="input" name="note" placeholder="Ej. cita médica con comprobante" required></label>`;
  const m = modal({ title: `Justificar · ${new Date(day + "T00:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}`, body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-save>Justificar</button>` });
  m.$("[data-save]").onclick = () => busy(m.$("[data-save]"), async () => {
    await setDoc(doc(db, "attendanceNotes", id), { uid, day, justified: true, note: body.note.value.trim(), by: profile.uid, byName: profile.name, at: serverTimestamp() });
    toast("Día justificado: no cuenta como incidencia ni descuento.", "ok"); m.close(); reload();
  });
}
