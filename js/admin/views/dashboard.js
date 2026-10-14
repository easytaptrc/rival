// Inicio: indicadores, actividad del día, accesos recientes y actividad del equipo.
import { esc, icon, greeting, fmtMoney, fmtTime, timeAgo, initials, countUp, enableTilt, toDate } from "../../core/ui.js";
import { ymd, addDays } from "../../core/membership.js";
import { state, onState, statusOf, salesBetween, accessBetween, dayRange, db, collection, query, orderBy, limit, onSnapshot } from "../data.js";
import { lineChart } from "../charts.js";
import * as D from "../dialogs.js";

export async function render(el, { profile, perms, go }) {
  const today = new Date();
  el.innerHTML = `
    <div class="page-head fade-in">
      <div><div class="eyebrow">Rival · Panel de control</div><h1>${greeting()}, ${esc(profile.name.split(" ")[0])}</h1>
      <p>Resumen de operación · ${today.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}</p></div>
      <div class="row wrap">${perms.has("reports") ? `<a class="btn" href="#/reportes">${icon("chart")} Ver reportes</a>` : ""}${perms.has("sales") ? `<button class="btn primary" data-a="saleDialog">${icon("plus")} Nueva venta</button>` : ""}</div>
    </div>
    <div class="grid g4 stagger">
      ${kpi("Socios activos", "k-active", "users", "k-active-foot")}
      ${kpi("Ingresos del mes", "k-income", "cash", "k-income-foot")}
      ${kpi("Accesos hoy", "k-access", "activity", "k-access-foot")}
      ${kpi("Por renovar", "k-renew", "clock", "k-renew-foot")}
    </div>
    <div class="grid g-main">
      <div class="card fade-in"><div class="card-head"><div><h3>Actividad del gimnasio</h3><p>Accesos por hora · hoy</p></div><span class="badge plain" data-peak></span></div><div data-chart><div class="skeleton" style="height:200px"></div></div></div>
      <div class="card fade-in"><div class="card-head"><div><h3>Acciones rápidas</h3><p>Atajos para la operación diaria</p></div></div>
        <div class="actions">
          ${perms.has("members") ? action("newMember", "users", "Registrar socio", "Alta y membresía · F2") : ""}
          ${perms.has("sales") ? action("saleDialog", "cash", "Registrar venta", "Productos y servicios · F3") : ""}
          ${perms.has("supplies") ? action("requestDialog", "box", "Pedir insumos", "Solicitar a bodega") : ""}
          ${perms.has("inventory") ? `<button class="action" data-go="inventario"><span class="a-ico">${icon("clipboard")}</span><b>Ver inventario</b><span>Existencias del gym</span></button>` : ""}
        </div></div>
    </div>
    <div class="grid g-main">
      <div class="card fade-in"><div class="card-head"><div><h3>Últimos accesos</h3><p>Registro en tiempo real del torniquete</p></div>${perms.has("access") ? `<a class="btn ghost sm" href="#/acceso">Ver todos →</a>` : ""}</div><div data-last class="table-wrap"><div class="skeleton" style="height:160px"></div></div></div>
      <div class="card fade-in"><div class="card-head"><div><h3>Por vencer</h3><p>Próximos 7 días</p></div></div><div class="list" data-expiring></div></div>
    </div>`;

  el.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]"); if (a) D[a.dataset.a]();
    const g = e.target.closest("[data-go]"); if (g) go(g.dataset.go);
    const r = e.target.closest("[data-member]"); if (r) D.memberDetail(r.dataset.member);
  });
  enableTilt(el);

  // KPIs derivados de socios (en vivo)
  const paintMembers = () => {
    if (!state.membersLoaded) return;
    const ms = state.members.map((m) => ({ m, st: statusOf(m) }));
    const active = ms.filter((x) => x.st.allowed).length;
    const in7 = addDays(ymd(), 7);
    const exp = ms.filter((x) => x.m.end && x.m.end >= ymd() && x.m.end <= in7 && !x.m.suspended).sort((a, b) => a.m.end.localeCompare(b.m.end));
    countUp(el.querySelector("[data-k=k-active]"), active);
    el.querySelector("[data-k=k-active-foot]").textContent = `${state.members.length} socios registrados`;
    countUp(el.querySelector("[data-k=k-renew]"), exp.length);
    el.querySelector("[data-k=k-renew-foot]").textContent = "En los próximos 7 días";
    el.querySelector("[data-expiring]").innerHTML = exp.slice(0, 7).map(({ m, st }) => `<div class="list-item" data-member="${esc(m.code)}" style="cursor:pointer">
      <div class="avatar">${m.photo ? `<img src="${esc(m.photo)}" alt="">` : esc(initials(`${m.firstName} ${m.lastName}`))}</div>
      <div class="grow"><b class="truncate" style="display:block">${esc(m.firstName)} ${esc(m.lastName || "")}</b><div class="dim xs mono">${esc(m.code)} · ${esc(m.planName || "")}</div></div>
      <span class="badge warn">${esc(st.label)}</span></div>`).join("") || `<div class="empty">${icon("check")}Nadie vence esta semana.</div>`;
  };
  const off = onState((w) => w === "members" && paintMembers());
  paintMembers();

  // Ingresos del mes (solo con permiso de ventas/reportes)
  if (perms.has("sales") || perms.has("reports")) {
    const m0 = new Date(today.getFullYear(), today.getMonth(), 1), m1 = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const p0 = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    Promise.all([salesBetween(m0, m1), salesBetween(p0, m0)]).then(([cur, prev]) => {
      const sum = (a) => a.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const c = sum(cur), p = sum(prev);
      countUp(el.querySelector("[data-k=k-income]"), c, { money: true });
      const d = p ? ((c - p) / p) * 100 : 0;
      el.querySelector("[data-k=k-income-foot]").innerHTML = p ? `<span style="color:var(--${d >= 0 ? "ok" : "bad"})">${d >= 0 ? "↑" : "↓"} ${Math.abs(d).toFixed(1)}%</span> vs mes anterior` : `${cur.length} ventas este mes`;
    }).catch(() => (el.querySelector("[data-k=k-income-foot]").textContent = "Sin permiso"));
  } else el.querySelector("[data-k=k-income]").closest(".card").remove();

  // Accesos de hoy: gráfica por hora + tabla en vivo
  const [d0, d1] = dayRange();
  const unsub = onSnapshot(query(collection(db, "access"), orderBy("at", "desc"), limit(400)), (snap) => {
    const rows = snap.docs.map((d) => d.data()).filter((a) => { const t = toDate(a.at) || new Date(); return t >= d0 && t < d1; });
    const ok = rows.filter((r) => r.result === "permitido");
    countUp(el.querySelector("[data-k=k-access]"), ok.length);
    const lastHour = ok.filter((r) => Date.now() - (toDate(r.at)?.getTime() || Date.now()) < 3600000).length;
    el.querySelector("[data-k=k-access-foot]").textContent = `${lastHour} en la última hora · ${rows.length - ok.length} denegados`;
    const open = state.pub.openHour ?? 5, close = state.pub.closeHour ?? 23;
    const byH = Array.from({ length: close - open + 1 }, (_, i) => ({ label: `${open + i}:00`, value: 0 }));
    ok.forEach((r) => { const hh = (toDate(r.at) || new Date()).getHours() - open; if (byH[hh]) byH[hh].value++; });
    el.querySelector("[data-chart]").innerHTML = lineChart(byH, { labelEvery: 3 });
    const peak = byH.reduce((a, b) => (b.value > a.value ? b : a), byH[0]);
    el.querySelector("[data-peak]").textContent = peak?.value ? `Pico: ${peak.label}` : "Sin accesos aún";
    const last = snap.docs.slice(0, 7).map((d) => d.data());
    el.querySelector("[data-last]").innerHTML = last.length ? `<table class="table"><thead><tr><th>Persona</th><th>Hora</th><th class="hide-sm">Tipo</th><th>Acceso</th></tr></thead><tbody>
      ${last.map((a) => `<tr ${a.kind === "socio" && a.ref ? `class="click" data-member="${esc(a.ref)}"` : ""}><td><div class="row"><div class="avatar" style="width:32px;height:32px;font-size:11px">${esc(initials(a.name))}</div><div><b>${esc(a.name)}</b><div class="dim xs mono">${esc(a.ref && a.kind === "socio" ? a.ref : a.kind)}</div></div></div></td>
      <td class="mono">${fmtTime(a.at)}</td><td class="hide-sm">${esc(a.planName || (a.kind === "personal" ? `Personal · ${a.status}` : a.kind === "visita" ? "Visita" : "—"))}</td>
      <td><span class="badge ${a.result === "permitido" ? (a.status === "por_vencer" ? "warn" : "ok") : "bad"}">${a.result === "permitido" ? (a.status === "por_vencer" ? "Por vencer" : "Permitido") : "Denegado"}</span></td></tr>`).join("")}
      </tbody></table>` : `<div class="empty">${icon("finger")}Todavía no hay accesos hoy.</div>`;
  }, (e) => { el.querySelector("[data-last]").innerHTML = `<div class="empty">Sin permiso para ver accesos.</div>`; el.querySelector("[data-chart]").innerHTML = ""; });

  return () => { off(); unsub(); };
}

const kpi = (label, k, ico, foot) => `<div class="card kpi tilt"><span class="k-icon">${icon(ico)}</span><span class="k-label">${label}</span><span class="k-value" data-k="${k}">—</span><span class="k-foot" data-k="${foot}">&nbsp;</span></div>`;
const action = (fn, ico, t, s) => `<button class="action" data-a="${fn}"><span class="a-ico">${icon(ico)}</span><b>${t}</b><span>${s}</span></button>`;
