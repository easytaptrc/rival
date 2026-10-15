// Recepción: botones grandes, escáner de huella/ID y turno del personal.
import { $, esc, icon, modal, toast, fmtDate, fmtMoney, fmtTime, initials, enableTilt, beep, toDate } from "../../core/ui.js";
import { state, processScan, statusOf, fullName, dayRange, db, collection, query, where, orderBy, limit, onSnapshot } from "../data.js";
import { ROLES } from "../../core/auth.js";
import * as D from "../dialogs.js";
import { REQ_STATUS, reqItems, reqSummary } from "../../core/supplies.js";

export async function render(el, { profile, perms }) {
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Recepción</div><h1>Mostrador</h1><p>Atiende socios, cobra y controla el acceso.</p></div>
      <div class="row wrap">
        <button class="btn" data-a="rivalListDialog">${icon("star")} Lista Rival</button>
        <button class="btn" data-a="cashCutDialog">${icon("receipt")} Hacer corte</button>
        <button class="btn" data-a="requestDialog">${icon("box")} Pedir insumos</button>
        <button class="btn outline" data-a="manualOpen">${icon("door")} Abrir torniquete</button>
      </div></div>
    <div class="big-actions stagger">
      ${big("member", "users", "Miembro", "Buscar o dar de alta", "F2")}
      ${big("saleDialog", "cash", "Registrar venta", "Productos y servicios", "F3")}
      ${big("renewDialog", "refresh", "Renovar suscripción", "Mensual, semana o anual", "F4")}
      ${big("visitDialog", "ticket", "Pago de visita", "Acceso por un día", "F6")}
    </div>
    <div class="grid g-main">
      <div class="card fade-in">
        <div class="card-head"><div><h3>Control de acceso</h3><p>Coloca la huella en el lector o escribe el ID del socio / empleado</p></div><span class="badge plain" data-mode>Lector listo</span></div>
        <div class="scanner">
          <div class="scan-pad" data-pad>${icon("finger")}</div>
          <div class="stack">
            <form data-scan class="row"><input class="input big" name="id" placeholder="ID / huella" autocomplete="off" aria-label="ID de socio o huella"><button class="btn primary lg">Validar</button></form>
            <div data-result class="dim small">Los lectores USB que escriben el ID como teclado funcionan aquí directamente. Los socios con membresía vigente abren el torniquete; el personal registra su asistencia automáticamente.</div>
          </div>
        </div>
      </div>
      <div class="card fade-in"><div class="card-head"><div><h3>Personal en turno</h3><p>Asistencia de hoy</p></div></div><div class="list" data-staff><div class="skeleton" style="height:100px"></div></div></div>
    </div>
    <div class="grid g2">
      <div class="card fade-in"><div class="card-head"><div><h3>Mi caja de hoy</h3><p>Ventas registradas por ti</p></div></div><div data-cash><div class="skeleton" style="height:80px"></div></div></div>
      <div class="card fade-in"><div class="card-head"><div><h3>Mis solicitudes a insumos</h3><p>Estado en tiempo real</p></div><button class="btn ghost sm" data-a="requestDialog">${icon("plus")} Nueva</button></div><div class="list" data-reqs></div></div>
    </div>`;
  enableTilt(el);

  el.addEventListener("click", (e) => {
    const cf = e.target.closest("[data-confirm]");
    if (cf) return D.confirmReceipt(cf.dataset.confirm);
    const rc = e.target.closest("[data-renew-code]");
    if (rc) return D.renewDialog(rc.dataset.renewCode);
    const a = e.target.closest("[data-a]");
    if (!a) return;
    if (a.dataset.a === "member") return memberHub();
    D[a.dataset.a]();
  });

  // ----- Escáner -----
  const form = el.querySelector("[data-scan]"), input = form.id, pad = el.querySelector("[data-pad]"), out = el.querySelector("[data-result]");
  const refocus = () => { if (!document.querySelector(".modal-back") && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "SELECT" && document.activeElement?.tagName !== "TEXTAREA") input.focus({ preventScroll: true }); };
  const iv = setInterval(refocus, 2500);
  input.focus({ preventScroll: true });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    input.value = "";
    pad.className = "scan-pad";
    try {
      const r = await processScan(v, /^\d+$/.test(v) ? "huella" : "id");
      pad.classList.add(r.allowed ? "ok" : "bad");
      out.innerHTML = resultHtml(r);
      setTimeout(() => (pad.className = "scan-pad"), 2500);
    } catch (err) {
      console.error(err); beep("bad");
      out.innerHTML = `<span style="color:var(--bad)">Error: ${esc(err.message)}</span>`;
    }
  });

  // ----- Personal en turno -----
  const [d0] = dayRange();
  const u1 = onSnapshot(query(collection(db, "attendance"), where("at", ">=", d0), orderBy("at", "desc"), limit(200)), (snap) => {
    const last = new Map();
    snap.docs.map((d) => d.data()).reverse().forEach((a) => last.set(a.uid, a));
    const rows = [...last.values()].sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
    el.querySelector("[data-staff]").innerHTML = rows.map((a) => `<div class="list-item"><div class="avatar">${esc(initials(a.name))}</div>
      <div class="grow"><b>${esc(a.name)}</b><div class="dim xs">${esc(ROLES[a.role]?.label || a.role || "")} · ${esc(a.source || "")}</div></div>
      <div style="text-align:right"><span class="badge ${a.type === "entrada" ? "ok" : "plain"}">${a.type === "entrada" ? "En turno" : "Salió"}</span><div class="dim xs mono" style="margin-top:4px">${fmtTime(a.at)}</div></div></div>`).join("") || `<div class="empty">${icon("clock")}Nadie ha registrado entrada hoy.</div>`;
  }, () => (el.querySelector("[data-staff]").innerHTML = `<div class="empty">Sin permiso para ver asistencia.</div>`));

  // ----- Mi caja -----
  const u2 = onSnapshot(query(collection(db, "sales"), where("at", ">=", d0), orderBy("at", "desc"), limit(300)), (snap) => {
    const mine = snap.docs.map((d) => d.data()).filter((s) => s.by === profile.uid && !s.void);
    const by = { efectivo: 0, tarjeta: 0, transferencia: 0 };
    mine.forEach((s) => (by[s.method] = (by[s.method] || 0) + (Number(s.amount) || 0)));
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    el.querySelector("[data-cash]").innerHTML = `<div class="kv" style="grid-template-columns:repeat(3,1fr)">${Object.entries(by).map(([k, v]) => `<div><span>${k}</span><b class="mono">${fmtMoney(v)}</b></div>`).join("")}</div>
      <div class="row spread" style="margin-top:14px"><span class="muted">${mine.length} movimientos</span><span style="font-size:22px;font-weight:800" class="mono">${fmtMoney(total)}</span></div>`;
  }, () => (el.querySelector("[data-cash]").innerHTML = `<div class="empty">Sin permiso para ver ventas.</div>`));

  // ----- Mis solicitudes -----
  const u3 = onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(40)), (snap) => {
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Primero lo que espera confirmación (de cualquier recepcionista), luego mis solicitudes
    const mine = [...all.filter((r) => r.status === "entregada"), ...all.filter((r) => r.createdBy === profile.uid && r.status !== "entregada")].slice(0, 7);
    el.querySelector("[data-reqs]").innerHTML = mine.map((r) => `<div class="list-item"><span class="li-ico">${icon("box")}</span><div class="grow"><b>${esc(r.item)}</b><div class="dim xs">${esc(reqSummary(reqItems(r)))} · ${fmtTime(r.createdAt)}${r.takenByName ? ` · ${esc(r.takenByName)}` : ""}</div></div>
      ${r.status === "entregada" ? `<button class="btn primary sm" data-confirm="${r.id}">${icon("check")} Confirmar</button>` : `<span class="badge ${REQ_STATUS[r.status]?.[0]}">${REQ_STATUS[r.status]?.[1] || r.status}</span>`}</div>`).join("") || `<div class="empty">${icon("box")}Sin solicitudes recientes.</div>`;
  }, () => {});

  return () => { clearInterval(iv); u1(); u2(); u3(); };
}

const big = (a, ico, t, s, k) => `<button class="big-action tilt" data-a="${a}"><span class="ba-ico">${icon(ico)}</span><div><b>${t}</b><span>${s}</span></div><kbd>${k}</kbd></button>`;

function resultHtml(r) {
  if (r.kind === "personal") {
    return `<div class="row"><div class="avatar">${esc(initials(r.person.name))}</div><div><b>${esc(r.person.name)}</b><div class="small" style="color:var(--${r.allowed ? "ok" : "bad"})">${r.allowed ? `Asistencia registrada: <b>${r.attendance}</b>` : esc(r.reason)}</div></div></div>`;
  }
  if (!r.member) return `<div style="color:var(--bad)"><b>${esc(r.code || "ID")} no registrado.</b> <button class="btn sm" data-a="newMember">Dar de alta</button></div>`;
  const m = r.member;
  return `<div class="row"><div class="avatar">${m.photo ? `<img src="${esc(m.photo)}" alt="">` : esc(initials(fullName(m)))}</div><div class="grow"><b>${esc(fullName(m))}</b>
    <div class="small"><span style="color:var(--${r.allowed ? (r.status.code === "por_vencer" ? "warn" : "ok") : "bad"})">${r.allowed ? "Acceso permitido" : "Acceso denegado"} · ${esc(r.status.label)}</span> · vence ${fmtDate(m.end)}</div></div>
    ${!r.allowed || r.status.code === "por_vencer" ? `<button class="btn primary sm" data-renew-code="${esc(m.code)}">Renovar</button>` : ""}</div>`;
}

function memberHub() {
  const body = document.createElement("div");
  body.className = "stack";
  body.append(D.memberSearchBox((m) => { mm.close(); D.memberDetail(m.code); }));
  const mm = modal({ title: "Miembro", wide: true, body, foot: `<button class="btn primary" data-new>${icon("plus")} Nuevo socio</button>` });
  mm.$("[data-new]").onclick = () => { mm.close(); D.newMember(); };
}
