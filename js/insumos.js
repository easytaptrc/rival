// Portal de insumos / mantenimiento: recibe solicitudes de recepción y lleva el checklist del gimnasio.
import { db, collection, query, orderBy, limit, onSnapshot, doc, updateDoc, setDoc, serverTimestamp } from "./firebase.js";
import { $, $$, h, esc, icon, brandMark, applyTheme, applyCachedTheme, toast, registerSW, notify, notifPermission, askNotifications, setBadge, timeAgo, fmtDate, fmtDateTime, modal, busy, formData, beep } from "./core/ui.js";
import { mountAuth, permsOf, logout, ROLES } from "./core/auth.js";
import { registerPush } from "./core/push.js";
import { ymd } from "./core/membership.js";

applyCachedTheme();
registerSW();

const root = $("#app");
let profile, unsubs = [], tab = "solicitudes";
let requests = [], inventory = [], checklist = null, firstLoad = true;
const knownIds = new Set();

mountAuth({
  root,
  appName: "Insumos",
  subtitle: "Rival · Mantenimiento",
  heroText: "Todo en su lugar. Todos los días.",
  allow: (p) => permsOf(p).has("maintenance"),
  onReady: start,
  onSignedOut: () => { unsubs.forEach((u) => u()); unsubs = []; },
});

function start(p) {
  profile = p;
  root.innerHTML = `<div class="ins">
    <header class="ins-top">${brandMark("Gym · Operación")}<div class="row"><button class="btn ghost icon" data-bell title="Notificaciones">${icon("bell")}</button><button class="btn icon" data-menu aria-label="Menú">${icon("menu")}</button></div></header>
    <div data-notif-banner></div>
    <main data-view></main>
  </div>
  <nav class="tabbar" aria-label="Secciones">
    <button class="on" data-tab="solicitudes">${icon("box")}<span>Solicitudes</span><span class="count" data-count hidden></span></button>
    <button data-tab="checklist">${icon("clipboard")}<span>Checklist</span></button>
    <button data-tab="inventario">${icon("list")}<span>Inventario</span></button>
    <button data-tab="historial">${icon("history")}<span>Historial</span></button>
  </nav>`;
  $$("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; $$("[data-tab]").forEach((x) => x.classList.toggle("on", x === b)); paint(); scrollTo({ top: 0, behavior: "smooth" }); }));
  $("[data-menu]").addEventListener("click", openMenu);
  $("[data-bell]").addEventListener("click", enableNotifs);
  paintBanner();

  unsubs.push(onSnapshot(doc(db, "settings", "public"), (s) => applyTheme(s.data()?.colors || {}), () => {}));
  unsubs.push(onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(120)), (snap) => {
    requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Notificar solicitudes nuevas (no las que ya existían al abrir)
    snap.docChanges().forEach((c) => {
      if (c.type === "added" && !firstLoad && !knownIds.has(c.doc.id) && c.doc.data().status === "pendiente" && c.doc.data().createdBy !== profile.uid) {
        const r = c.doc.data();
        notify(r.priority === "alta" ? "⚡ Solicitud URGENTE de recepción" : "Nueva solicitud de recepción", `${r.item} · ${r.qty} ${r.unit || ""}${r.note ? ` — ${r.note}` : ""}`, { tag: `req-${c.doc.id}`, url: "insumos.html" });
        toast(`${r.item} · ${r.qty} ${r.unit || ""}`, "warn", `Nueva solicitud de ${r.createdByName}`);
      }
      knownIds.add(c.doc.id);
    });
    firstLoad = false;
    const pend = requests.filter((r) => r.status === "pendiente").length;
    setBadge(pend);
    const cnt = $("[data-count]"); cnt.hidden = !pend; cnt.textContent = pend;
    if (tab === "solicitudes" || tab === "historial") paint();
  }, (e) => toast(`Sin permiso para ver solicitudes (${e.code}).`, "bad")));
  unsubs.push(onSnapshot(query(collection(db, "inventory"), orderBy("order")), (s) => { inventory = s.docs.map((d) => ({ id: d.id, ...d.data() })); if (tab !== "solicitudes") paint(); }, () => {}));
  unsubs.push(onSnapshot(doc(db, "checklists", ymd()), (s) => { checklist = s.data() || null; if (tab === "checklist" && !document.activeElement?.matches("input")) paint(); }, () => {}));
  if (notifPermission() === "granted") registerPush(profile);
  paint();
}

function paintBanner() {
  const b = $("[data-notif-banner]");
  if (notifPermission() === "granted" || notifPermission() === "unsupported") { b.innerHTML = ""; $("[data-bell]").style.color = notifPermission() === "granted" ? "var(--ok)" : ""; return; }
  b.innerHTML = `<div class="notice" style="margin-top:16px">${icon("bell")}<div class="grow"><b>Activa las notificaciones</b><br>Así te avisamos al instante cuando recepción pida algo, aunque tengas la app en segundo plano.</div><button class="btn primary sm" data-enable>Activar</button></div>`;
  b.querySelector("[data-enable]").onclick = enableNotifs;
}
async function enableNotifs() {
  if (notifPermission() === "granted") { notify("RIVAL Insumos", "Las notificaciones funcionan.", { tag: "test" }); return; }
  await askNotifications(); paintBanner();
  if (notifPermission() === "granted") registerPush(profile);
}

let wakeLock = null;
function openMenu() {
  $(".menu-pop")?.remove();
  const m = h(`<div class="menu-pop"><div style="padding:8px 10px 12px"><b>${esc(profile.name)}</b><div class="dim xs">${esc(ROLES[profile.role]?.label || profile.role)}</div></div>
    <button class="btn ghost" data-wake>${icon("eye")} ${wakeLock ? "Permitir que se apague la pantalla" : "Mantener pantalla encendida"}</button>
    <button class="btn ghost" data-req>${icon("plus")} Registrar faltante</button>
    <button class="btn ghost" data-out>${icon("logout")} Cerrar sesión</button></div>`);
  document.body.append(m);
  const close = (e) => { if (!m.contains(e.target) && !e.target.closest("[data-menu]")) { m.remove(); removeEventListener("pointerdown", close); } };
  setTimeout(() => addEventListener("pointerdown", close));
  m.querySelector("[data-out]").onclick = () => logout();
  m.querySelector("[data-req]").onclick = () => { m.remove(); selfRequest(); };
  m.querySelector("[data-wake]").onclick = async () => {
    m.remove();
    try {
      if (wakeLock) { await wakeLock.release(); wakeLock = null; toast("La pantalla puede apagarse.", "info"); }
      else { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => (wakeLock = null)); toast("La pantalla se mantendrá encendida.", "ok"); }
    } catch { toast("Este dispositivo no permite mantener la pantalla encendida.", "warn"); }
  };
}

function paint() {
  const v = $("[data-view]");
  if (!v) return;
  if (tab === "solicitudes") v.innerHTML = viewRequests();
  if (tab === "checklist") v.innerHTML = viewChecklist();
  if (tab === "inventario") v.innerHTML = viewInventory();
  if (tab === "historial") v.innerHTML = viewHistory();
  v.classList.remove("fade-in"); void v.offsetWidth; v.classList.add("fade-in");
}

// ---------- Solicitudes ----------
const LAB = { pendiente: ["bad", "Pendiente"], en_curso: ["warn", "En curso"], entregada: ["ok", "Entregada"], cancelada: ["plain", "Cancelada"] };
function reqCard(r, fresh) {
  const mine = r.takenBy === profile.uid;
  return `<article class="req ${fresh ? "new" : ""}" data-id="${r.id}">
    <div class="req-top"><div><h4 class="${r.priority === "alta" ? "prio-alta" : ""}">${r.priority === "alta" ? "⚡ " : ""}${esc(r.item)}</h4>
      <div class="dim xs" style="margin-top:4px">${r.qty} ${esc(r.unit || "")} · ${timeAgo(r.createdAt)} · ${esc(r.createdByName || "Recepción")}${r.area ? ` · ${esc(r.area)}` : ""}</div></div>
      <span class="badge ${LAB[r.status][0]}">${LAB[r.status][1]}</span></div>
    ${r.note ? `<div class="small muted">${esc(r.note)}</div>` : ""}
    ${r.takenByName && r.status === "en_curso" ? `<div class="dim xs">Atiende: ${esc(r.takenByName)}</div>` : ""}
    <div class="req-actions">
      ${r.status === "pendiente" ? `<button class="btn ghost sm" data-act="cancelada">No disponible</button><button class="btn sm" data-act="en_curso">Tomar solicitud</button><button class="btn primary sm" data-act="entregada">Entregar ya</button>` : ""}
      ${r.status === "en_curso" ? `<button class="btn ghost sm" data-act="pendiente">Soltar</button><button class="btn primary sm" data-act="entregada">${icon("check")} Marcar entregada</button>` : ""}
    </div></article>`;
}
function viewRequests() {
  const today = new Date().toDateString();
  const open = requests.filter((r) => r.status === "pendiente" || r.status === "en_curso")
    .sort((a, b) => (a.status === "en_curso" ? -1 : 0) - (b.status === "en_curso" ? -1 : 0) || (b.priority === "alta") - (a.priority === "alta") || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const delivered = requests.filter((r) => r.status === "entregada" && r.updatedAt?.toDate?.().toDateString() === today).length;
  return `<div style="margin-top:18px"><div class="eyebrow">Mantenimiento</div><h1 style="font-size:28px;margin-top:6px">Solicitudes de insumos</h1><p class="dim small" style="margin:4px 0 0">Pedidos de recepción e inventario del gimnasio</p></div>
    <div class="kpis3 stagger" style="margin-top:18px">
      <div class="card"><b>${requests.filter((r) => r.status === "pendiente").length}</b><span style="color:var(--bad)">Pendientes</span></div>
      <div class="card"><b>${requests.filter((r) => r.status === "en_curso").length}</b><span style="color:var(--warn)">En preparación</span></div>
      <div class="card"><b>${delivered}</b><span style="color:var(--ok)">Entregadas hoy</span></div></div>
    <div class="row spread" style="margin:22px 0 12px"><h3>Solicitudes de recepción</h3><button class="btn ghost sm" data-goto="checklist">${icon("clipboard")} Checklist</button></div>
    <div class="stack stagger" data-reqs>${open.map((r) => reqCard(r, Date.now() - (r.createdAt?.toMillis?.() || Date.now()) < 120000 && r.status === "pendiente")).join("") || `<div class="card"><div class="empty">${icon("check")}Todo entregado. Sin solicitudes pendientes.</div></div>`}</div>
    ${checklistTeaser()}`;
}
function checklistTeaser() {
  const total = inventory.length, done = Object.values(checklist?.items || {}).filter((i) => i.s).length;
  return `<div class="card" style="margin-top:18px" data-goto="checklist" role="button" tabindex="0"><div class="row"><span class="li-ico" style="width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:var(--surface-2);color:var(--brand)">${icon("clipboard")}</span><div class="grow"><b>Revisión diaria del gimnasio</b><div class="dim xs">${total ? `${done} de ${total} artículos revisados hoy` : "Sin inventario cargado"}</div><div class="progress" style="margin-top:8px"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div></div>${icon("chevron")}</div></div>`;
}

// ---------- Checklist ----------
function viewChecklist() {
  if (!inventory.length) return `<div style="margin-top:18px"><div class="eyebrow">Checklist del gimnasio</div><h1 style="font-size:28px;margin-top:6px">Revisión diaria</h1></div><div class="card"><div class="empty">${icon("clipboard")}El administrador aún no sube el Excel de inventario.<br>Cuando lo haga, aquí aparecerá todo lo que debe revisarse.</div></div>`;
  const items = checklist?.items || {};
  const done = inventory.filter((i) => items[i.id]?.s).length;
  const missing = inventory.filter((i) => items[i.id]?.s === "falta").length;
  const damaged = inventory.filter((i) => items[i.id]?.s === "danado").length;
  const areas = [...new Set(inventory.map((i) => i.area || "General"))];
  return `<div style="margin-top:18px"><div class="eyebrow">Checklist del gimnasio · ${fmtDate(ymd(), { weekday: "long", day: "numeric", month: "long" })}</div><h1 style="font-size:28px;margin-top:6px">Revisión diaria</h1></div>
    <div class="card"><div class="row spread"><b>${done} / ${inventory.length} revisados</b><span class="row">${missing ? `<span class="badge bad">${missing} faltan</span>` : ""}${damaged ? `<span class="badge warn">${damaged} dañados</span>` : ""}</span></div>
      <div class="progress" style="margin-top:10px"><i style="width:${(done / inventory.length) * 100}%"></i></div>
      <div class="row wrap" style="margin-top:12px"><button class="btn sm" data-all-ok>${icon("check")} Marcar pendientes como completos</button>${checklist?.completed ? `<span class="badge ok">Finalizado por ${esc(checklist.byName || "")}</span>` : `<button class="btn primary sm" data-finish ${done < inventory.length ? "disabled" : ""}>Finalizar checklist</button>`}</div></div>
    <div class="card checklist">${areas.map((a) => `<div class="area-title">${esc(a)}</div>${inventory.filter((i) => (i.area || "General") === a).map((i) => {
      const s = items[i.id]?.s;
      return `<div class="ck-row" data-item="${i.id}"><div><b style="font-size:14px">${esc(i.name)}</b><div class="dim xs">${i.qty ?? ""} ${esc(i.unit || "")}${i.notes ? ` · ${esc(i.notes)}` : ""}</div>
        ${s && s !== "ok" ? `<input class="input" data-note placeholder="¿Qué pasó? (opcional)" value="${esc(items[i.id]?.note || "")}" style="margin-top:8px;min-height:36px;padding:6px 10px;font-size:13px">` : ""}</div>
        <div class="tri"><button data-v="ok" class="${s === "ok" ? "on" : ""}" aria-label="Completo">✓</button><button data-v="falta" class="${s === "falta" ? "on" : ""}">Falta</button><button data-v="danado" class="${s === "danado" ? "on" : ""}">Dañado</button></div></div>`;
    }).join("")}`).join("")}</div>`;
}
async function setCheck(patchItems, extra = {}) {
  const items = { ...(checklist?.items || {}), ...patchItems };
  const vals = inventory.map((i) => items[i.id]).filter(Boolean);
  const data = {
    day: ymd(), items, total: inventory.length, done: vals.filter((v) => v.s).length,
    missing: vals.filter((v) => v.s === "falta").length, damaged: vals.filter((v) => v.s === "danado").length,
    by: profile.uid, byName: profile.name, updatedAt: serverTimestamp(), ...extra,
  };
  checklist = { ...data };
  paint();
  await setDoc(doc(db, "checklists", ymd()), data);
}

// ---------- Inventario ----------
function viewInventory() {
  const areas = [...new Set(inventory.map((i) => i.area || "General"))];
  return `<div style="margin-top:18px"><div class="eyebrow">Bodega</div><h1 style="font-size:28px;margin-top:6px">Inventario del gimnasio</h1><p class="dim small" style="margin:4px 0 0">${inventory.length} artículos · ajusta cantidades después de entregar o recibir</p></div>
    <div class="card checklist">${areas.map((a) => `<div class="area-title">${esc(a)}</div>${inventory.filter((i) => (i.area || "General") === a).map((i) => `<div class="ck-row"><div><b style="font-size:14px">${esc(i.name)}</b>${i.minQty != null && i.qty < i.minQty ? ` <span class="badge bad">Bajo mínimo (${i.minQty})</span>` : ""}<div class="dim xs">${esc(i.category || "")}</div></div>
      <div class="row"><button class="btn sm icon" data-dec="${i.id}" aria-label="Restar">−</button><b class="mono" style="min-width:40px;text-align:center">${i.qty ?? 0}</b><button class="btn sm icon" data-inc="${i.id}" aria-label="Sumar">+</button><span class="dim xs" style="width:48px">${esc(i.unit || "")}</span></div></div>`).join("")}`).join("") || `<div class="empty">${icon("list")}Sin inventario cargado.</div>`}</div>`;
}

// ---------- Historial ----------
function viewHistory() {
  const done = requests.filter((r) => r.status === "entregada" || r.status === "cancelada");
  return `<div style="margin-top:18px"><div class="eyebrow">Historial</div><h1 style="font-size:28px;margin-top:6px">Solicitudes cerradas</h1></div>
    <div class="card"><div class="list">${done.map((r) => `<div class="list-item"><span class="li-ico">${icon(r.status === "entregada" ? "check" : "x")}</span><div class="grow"><b>${esc(r.item)}</b><div class="dim xs">${r.qty} ${esc(r.unit || "")} · pidió ${esc(r.createdByName || "")} · ${fmtDateTime(r.updatedAt)}${r.takenByName ? ` · ${esc(r.takenByName)}` : ""}${r.closeNote ? ` · “${esc(r.closeNote)}”` : ""}</div></div><span class="badge ${LAB[r.status][0]}">${LAB[r.status][1]}</span></div>`).join("") || `<div class="empty">Sin historial todavía.</div>`}</div></div>`;
}

// ---------- Eventos ----------
document.addEventListener("click", async (e) => {
  const go = e.target.closest("[data-goto]");
  if (go) { $(`[data-tab="${go.dataset.goto}"]`)?.click(); return; }
  const act = e.target.closest("[data-act]");
  if (act) {
    const id = act.closest("[data-id]").dataset.id, status = act.dataset.act;
    let closeNote = "";
    if (status === "cancelada") { closeNote = prompt("¿Por qué no está disponible? (se le avisará a recepción)") ?? null; if (closeNote === null) return; }
    const patch = { status, updatedAt: serverTimestamp() };
    if (status === "en_curso" || status === "entregada") Object.assign(patch, { takenBy: profile.uid, takenByName: profile.name });
    if (status === "pendiente") Object.assign(patch, { takenBy: null, takenByName: null });
    if (closeNote) patch.closeNote = closeNote;
    await busy(act, () => updateDoc(doc(db, "requests", id), patch).then(() => { beep("ok"); toast(status === "entregada" ? "Marcada como entregada. Recepción fue notificada." : "Solicitud actualizada.", "ok"); })
      .catch((err) => toast(err.code === "permission-denied" ? "No tienes permiso para esta acción." : err.message, "bad")));
    return;
  }
  const tri = e.target.closest(".tri button");
  if (tri) {
    const id = tri.closest("[data-item]").dataset.item, s = tri.dataset.v;
    const inv = inventory.find((i) => i.id === id);
    const cur = checklist?.items?.[id];
    setCheck({ [id]: { s: cur?.s === s ? null : s, note: cur?.note || "", name: inv.name, area: inv.area || "General" } }).catch((err) => toast(err.message, "bad"));
    return;
  }
  if (e.target.closest("[data-all-ok]")) {
    const patch = {};
    inventory.forEach((i) => { if (!checklist?.items?.[i.id]?.s) patch[i.id] = { s: "ok", note: "", name: i.name, area: i.area || "General" }; });
    setCheck(patch).catch((err) => toast(err.message, "bad"));
    return;
  }
  if (e.target.closest("[data-finish]")) {
    await setCheck({}, { completed: true, completedAt: serverTimestamp() });
    toast("Checklist finalizado. El administrador ya puede verlo.", "ok");
    return;
  }
  const inc = e.target.closest("[data-inc],[data-dec]");
  if (inc) {
    const id = inc.dataset.inc || inc.dataset.dec, it = inventory.find((i) => i.id === id);
    const q = Math.max(0, (Number(it.qty) || 0) + (inc.dataset.inc ? 1 : -1));
    it.qty = q; paint();
    updateDoc(doc(db, "inventory", id), { qty: q, updatedAt: serverTimestamp() }).catch((err) => toast(err.message, "bad"));
  }
});
document.addEventListener("change", (e) => {
  if (!e.target.matches("[data-note]")) return;
  const id = e.target.closest("[data-item]").dataset.item;
  const cur = checklist?.items?.[id];
  setCheck({ [id]: { ...cur, note: e.target.value.trim() } }).catch(() => {});
});

function selfRequest() {
  const body = document.createElement("form");
  body.className = "grid-form";
  body.innerHTML = `<label class="field full"><span>Insumo que falta en bodega</span><input class="input" name="item" required></label><label class="field"><span>Cantidad</span><input class="input" name="qty" type="number" value="1" min="1"></label><label class="field"><span>Nota</span><input class="input" name="note" placeholder="Para compras"></label>`;
  const m = modal({ title: "Registrar faltante", body, foot: `<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-s>Guardar</button>` });
  m.$("[data-s]").onclick = () => busy(m.$("[data-s]"), async () => {
    const f = formData(body); if (!f.item) return;
    const { addDoc } = await import("./firebase.js");
    await addDoc(collection(db, "requests"), { item: f.item, qty: Number(f.qty) || 1, unit: "piezas", priority: "normal", area: "Bodega", note: `Faltante de bodega${f.note ? ` · ${f.note}` : ""}`, status: "pendiente", createdBy: profile.uid, createdByName: profile.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    toast("Faltante registrado.", "ok"); m.close();
  });
}
