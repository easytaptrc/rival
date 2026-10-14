// Acceso y asistencia: bitácora del torniquete, asistencia del personal y estado del bridge.
import { esc, icon, fmtTime, fmtDateTime, initials, downloadFile, toCSV, toDate, toast } from "../../core/ui.js";
import { ymd, parseYmd } from "../../core/membership.js";
import { ROLES } from "../../core/auth.js";
import { accessBetween, attendanceBetween, dayRange, processScan, db, collection, query, orderBy, limit, onSnapshot, doc } from "../data.js";
import * as D from "../dialogs.js";

export async function render(el, { perms }) {
  let tab = "accesos", day = ymd();
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Control</div><h1>Acceso y asistencia</h1><p>Torniquete, huellas y entradas del personal</p></div>
      <div class="row wrap"><input type="date" class="input" style="width:auto" data-day value="${day}"><button class="btn" data-export>${icon("download")} Exportar</button></div></div>
    <div class="seg fade-in" data-tabs style="justify-self:start"><button class="on" data-t="accesos">Accesos</button><button data-t="asistencia">Asistencia del personal</button><button data-t="torniquete">Torniquete</button></div>
    <div data-body></div>`;
  const body = el.querySelector("[data-body]");
  let rows = [], cleanup = null;

  const load = async () => {
    cleanup?.(); cleanup = null;
    body.innerHTML = `<div class="card"><div class="skeleton" style="height:240px"></div></div>`;
    const [a, b] = dayRange(parseYmd(day));
    try {
      if (tab === "accesos") { rows = await accessBetween(a, b); paintAccess(); }
      else if (tab === "asistencia") { rows = await attendanceBetween(a, b); paintAttendance(); }
      else paintTurnstile();
    } catch (e) { console.error(e); body.innerHTML = `<div class="card"><div class="empty">${icon("alert")}No se pudo cargar (${esc(e.code || e.message)}).</div></div>`; }
  };

  function paintAccess() {
    const ok = rows.filter((r) => r.result === "permitido").length;
    body.innerHTML = `<div class="grid g3 stagger" style="margin-bottom:18px">
        <div class="card kpi"><span class="k-label">Permitidos</span><span class="k-value" style="color:var(--ok)">${ok}</span></div>
        <div class="card kpi"><span class="k-label">Denegados</span><span class="k-value" style="color:var(--bad)">${rows.length - ok}</span></div>
        <div class="card kpi"><span class="k-label">Socios únicos</span><span class="k-value">${new Set(rows.filter((r) => r.kind === "socio" && r.result === "permitido").map((r) => r.ref)).size}</span></div></div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Hora</th><th>Persona</th><th>Tipo</th><th class="hide-sm">Origen</th><th>Resultado</th><th class="hide-sm">Detalle</th></tr></thead><tbody>
      ${rows.map((r) => `<tr ${r.kind === "socio" && r.ref ? `class="click" data-member="${esc(r.ref)}"` : ""}><td class="mono">${fmtTime(r.at)}</td><td><b>${esc(r.name)}</b><div class="dim xs mono">${esc(r.ref || "")}</div></td>
        <td>${esc({ socio: "Socio", personal: "Personal", visita: "Visita" }[r.kind] || r.kind)}</td><td class="hide-sm">${esc(r.source || "")}${r.device && r.device !== "panel" ? ` · ${esc(r.device)}` : ""}</td>
        <td><span class="badge ${r.result === "permitido" ? "ok" : "bad"}">${r.result === "permitido" ? "Permitido" : "Denegado"}</span></td><td class="hide-sm dim small">${esc(r.reason || "")}</td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">${icon("finger")}Sin accesos este día.</div></td></tr>`}
      </tbody></table></div></div>`;
  }

  function paintAttendance() {
    const byU = new Map();
    rows.slice().reverse().forEach((r) => {
      const u = byU.get(r.uid) || { name: r.name, role: r.role, events: [], first: null, last: null, ms: 0, open: null };
      const t = toDate(r.at) || new Date();
      u.events.push(r);
      if (r.type === "entrada") { u.first = u.first || t; u.open = t; }
      else { u.last = t; if (u.open) { u.ms += t - u.open; u.open = null; } }
      byU.set(r.uid, u);
    });
    const now = Date.now();
    body.innerHTML = `<div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Empleado</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Estado</th><th class="hide-sm">Registros</th></tr></thead><tbody>
      ${[...byU.values()].map((u) => { const ms = u.ms + (u.open && day === ymd() ? now - u.open : 0); return `<tr><td><div class="row"><div class="avatar">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><div class="dim xs">${esc(ROLES[u.role]?.label || u.role || "")}</div></div></div></td>
        <td class="mono">${u.first ? fmtTime(u.first) : "—"}</td><td class="mono">${u.last ? fmtTime(u.last) : "—"}</td><td class="mono">${(ms / 3600000).toFixed(1)} h</td>
        <td><span class="badge ${u.open ? "ok" : "plain"}">${u.open ? "En turno" : "Fuera"}</span></td>
        <td class="hide-sm dim xs">${u.events.map((e) => `${e.type === "entrada" ? "↘" : "↗"} ${fmtTime(e.at)} (${esc(e.source)})`).join(" · ")}</td></tr>`; }).join("") || `<tr><td colspan="6"><div class="empty">${icon("clock")}Sin registros de asistencia este día.</div></td></tr>`}
      </tbody></table></div><p class="dim xs" style="margin:12px 0 0">La asistencia se registra sola cuando el empleado pone su huella (alterna entrada/salida) o al iniciar sesión en el panel.</p></div>`;
  }

  function paintTurnstile() {
    body.innerHTML = `<div class="grid g2">
      <div class="card"><div class="card-head"><div><h3>Estado del torniquete</h3><p>Bridge local conectado al lector de huella y al relevador</p></div></div>
        <div class="row" style="margin-bottom:14px"><span class="dot off" data-d-dot></span><b data-d-state>Consultando…</b></div>
        <div class="kv" data-d-kv></div>
        <div class="row wrap" style="margin-top:16px"><button class="btn primary" data-open>${icon("door")} Abrir torniquete</button></div></div>
      <div class="card"><div class="card-head"><div><h3>Simular / capturar huella</h3><p>Prueba el flujo sin hardware o usa un lector tipo teclado</p></div></div>
        <form class="row" data-sim><input class="input" name="id" placeholder="ID socio (284) o empleado (9001)"><button class="btn">Validar</button></form>
        <div class="dim small" data-sim-out style="margin-top:12px"></div></div>
      <div class="card span2"><div class="card-head"><div><h3>Órdenes recientes</h3><p>Aperturas enviadas al torniquete</p></div></div><div data-cmds class="table-wrap"></div></div>
    </div>`;
    body.querySelector("[data-open]").onclick = () => D.manualOpen();
    body.querySelector("[data-sim]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = e.target.id.value.trim(); if (!v) return;
      e.target.id.value = "";
      const r = await processScan(v, "simulación");
      body.querySelector("[data-sim-out]").innerHTML = r.kind === "personal" ? `${esc(r.person.name)}: ${r.allowed ? `asistencia <b>${r.attendance}</b>` : esc(r.reason)}`
        : r.member ? `${esc(r.member.firstName)}: <b style="color:var(--${r.allowed ? "ok" : "bad"})">${r.allowed ? "permitido" : "denegado"}</b> · ${esc(r.reason)}` : `<span style="color:var(--bad)">ID no registrado</span>`;
    });
    const u1 = onSnapshot(doc(db, "devices", "torniquete-1"), (s) => {
      const d = s.data();
      const online = d && Date.now() - (toDate(d.lastSeen)?.getTime() || 0) < 90000;
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

  el.querySelector("[data-tabs]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    tab = b.dataset.t; el.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("on", x === b)); load();
  });
  el.querySelector("[data-day]").addEventListener("change", (e) => { day = e.target.value || ymd(); load(); });
  body.addEventListener("click", (e) => { const r = e.target.closest("[data-member]"); if (r) D.memberDetail(r.dataset.member); });
  el.querySelector("[data-export]").onclick = () => {
    if (tab === "accesos") downloadFile(`accesos-${day}.csv`, toCSV([["Hora", "Nombre", "ID", "Tipo", "Origen", "Resultado", "Detalle"], ...rows.map((r) => [fmtTime(r.at), r.name, r.ref, r.kind, r.source, r.result, r.reason])]), "text/csv");
    else if (tab === "asistencia") downloadFile(`asistencia-${day}.csv`, toCSV([["Hora", "Empleado", "Rol", "Tipo", "Origen"], ...rows.map((r) => [fmtTime(r.at), r.name, r.role, r.type, r.source])]), "text/csv");
    else toast("Elige Accesos o Asistencia para exportar.", "info");
  };
  load();
  return () => cleanup?.();
}
