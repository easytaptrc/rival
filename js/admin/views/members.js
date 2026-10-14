// Socios: búsqueda, filtros, ficha y exportación.
import { esc, icon, fmtDate, initials, debounce, downloadFile, toCSV, toDate, fmtDateTime } from "../../core/ui.js";
import { state, onState, statusOf, fullName } from "../data.js";
import * as D from "../dialogs.js";

export async function render(el) {
  let filter = "todos", q = "", shown = 60;
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Gestión</div><h1>Socios</h1><p data-count>Cargando…</p></div>
      <div class="row wrap"><button class="btn" data-export>${icon("download")} Exportar</button><button class="btn primary" data-new>${icon("plus")} Nuevo socio</button></div></div>
    <div class="card fade-in">
      <div class="toolbar" style="margin-bottom:14px">
        <div class="search">${icon("search")}<input class="input" placeholder="Nombre, ID, teléfono o correo" data-q></div>
        <div class="seg" data-seg>
          <button class="on" data-f="todos">Todos</button><button data-f="activo">Activos</button><button data-f="por_vencer">Por vencer</button><button data-f="vencido">Vencidos</button><button data-f="suspendido">Suspendidos</button>
        </div>
      </div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Socio</th><th class="hide-sm">Teléfono</th><th>Plan</th><th>Vence</th><th>Estado</th><th class="hide-sm">Huella</th><th class="hide-sm">Último acceso</th></tr></thead><tbody data-rows></tbody></table></div>
      <div class="center" style="margin-top:14px"><button class="btn ghost" data-more hidden>Ver más</button></div>
    </div>`;

  const list = () => {
    const needle = q.toLowerCase();
    return state.members
      .map((m) => ({ m, st: statusOf(m) }))
      .filter(({ m, st }) => filter === "todos" || (filter === "vencido" ? ["vencido", "sin_plan"].includes(st.code) : st.code === filter))
      .filter(({ m }) => !needle || `${m.code} ${m.number} ${fullName(m)} ${m.phone} ${m.email}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.m.number || 0) - (a.m.number || 0));
  };
  const paint = () => {
    if (!state.membersLoaded) return;
    const rows = list();
    el.querySelector("[data-count]").textContent = `${state.members.length} registrados · ${state.members.filter((m) => statusOf(m).allowed).length} con acceso vigente`;
    el.querySelector("[data-rows]").innerHTML = rows.slice(0, shown).map(({ m, st }) => `<tr class="click" data-code="${esc(m.code)}">
      <td><div class="row"><div class="avatar">${m.photo ? `<img src="${esc(m.photo)}" alt="" loading="lazy">` : esc(initials(fullName(m)))}</div><div><b>${esc(fullName(m))}</b><div class="dim xs mono">${esc(m.code)}</div></div></div></td>
      <td class="hide-sm">${esc(m.phone || "—")}</td><td>${esc(m.planName || "—")}</td><td class="mono">${fmtDate(m.end)}</td>
      <td><span class="badge ${st.code === "activo" ? "ok" : st.code === "por_vencer" ? "warn" : "bad"}">${esc(st.label)}</span></td>
      <td class="hide-sm"><span class="badge ${m.fingerEnrolled ? "ok" : "plain"}">#${m.fingerprintId ?? "—"}</span></td>
      <td class="hide-sm dim small">${m.lastAccess ? fmtDateTime(m.lastAccess) : "—"}</td></tr>`).join("")
      || `<tr><td colspan="7"><div class="empty">${icon("users")}${state.members.length ? "Sin coincidencias." : "Aún no hay socios. Registra el primero."}</div></td></tr>`;
    el.querySelector("[data-more]").hidden = rows.length <= shown;
  };

  el.querySelector("[data-q]").addEventListener("input", debounce((e) => { q = e.target.value.trim(); shown = 60; paint(); }, 150));
  el.querySelector("[data-seg]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    filter = b.dataset.f; shown = 60;
    el.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b)); paint();
  });
  el.querySelector("[data-more]").onclick = () => { shown += 60; paint(); };
  el.querySelector("[data-new]").onclick = () => D.newMember();
  el.querySelector("[data-rows]").addEventListener("click", (e) => { const r = e.target.closest("[data-code]"); if (r) D.memberDetail(r.dataset.code); });
  el.querySelector("[data-export]").onclick = () => {
    const rows = [["ID", "Nombre", "Apellidos", "Teléfono", "Correo", "Plan", "Inicio", "Vence", "Estado", "ID huella", "Visitas"]];
    list().forEach(({ m, st }) => rows.push([m.code, m.firstName, m.lastName, m.phone, m.email, m.planName, m.start, m.end, st.label, m.fingerprintId, m.visits || 0]));
    downloadFile(`socios-rival-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows), "text/csv;charset=utf-8");
  };
  const off = onState((w) => w === "members" && paint());
  paint();
  return off;
}
