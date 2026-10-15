// Configuración: datos del gym, redes del portal, colores, planes y reglas de operación.
import { esc, icon, toast, busy, applyTheme, logo3d } from "../../core/ui.js";
import { audit } from "../../core/auth.js";
import { DEFAULT_PLANS } from "../../core/membership.js";
import { state, onState, db, doc, setDoc, serverTimestamp } from "../data.js";
import { changePasswordDialog } from "../account.js";

const PRESETS = [["Rojo Rival", "#e30b1c", "#0a0a0c"], ["Carmesí", "#c8102e", "#0b0a0a"], ["Naranja", "#ff4d00", "#0b0b0d"], ["Azul eléctrico", "#2563eb", "#090b10"], ["Verde", "#16a34a", "#090c0a"], ["Dorado", "#d4a017", "#0c0b08"]];

export async function render(el) {
  let tab = "gym";
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Sistema</div><h1>Configuración</h1><p>Lo que cambies aquí se refleja al instante en el portal de socios</p></div>
      <div class="row wrap"><a class="btn" href="index.html" target="_blank" rel="noopener">${icon("eye")} Ver portal</a><button class="btn" data-pass>${icon("lock")} Mi contraseña</button></div></div>
    <div class="seg fade-in" data-tabs style="justify-self:start;overflow-x:auto;max-width:100%">
      <button class="on" data-t="gym">Gimnasio</button><button data-t="redes">Redes y mapa</button><button data-t="colores">Colores</button><button data-t="planes">Planes y precios</button><button data-t="operacion">Operación</button>
    </div>
    <form data-form class="card fade-in"></form>`;
  const form = el.querySelector("[data-form]");
  const pub = () => state.pub || {};
  const app = () => state.app || {};

  const views = {
    gym: () => `<div class="grid-form">
      <label class="field"><span>Nombre del gimnasio</span><input class="input" name="gymName" value="${esc(pub().gymName || "RIVAL Gym")}"></label>
      <label class="field"><span>Eslogan (usa | para dividir en dos líneas)</span><input class="input" name="slogan" value="${esc(pub().slogan || "Disciplina hoy|Resultados siempre")}"></label>
      <label class="field full"><span>Descripción (sección Nosotros)</span><textarea class="input" name="about">${esc(pub().about || "")}</textarea></label>
      <label class="field full"><span>Aviso en la parte superior del portal (vacío = sin aviso)</span><input class="input" name="announcement" value="${esc(pub().announcement || "")}" placeholder="Ej. Este lunes abrimos a las 8:00"></label>
      <label class="field full"><span>Dirección</span><input class="input" name="address" value="${esc(pub().address || "")}"></label>
      <label class="field"><span>Teléfono</span><input class="input" name="phone" value="${esc(pub().phone || "")}"></label>
      <label class="field"><span>WhatsApp (con lada, ej. 5215512345678)</span><input class="input" name="whatsapp" value="${esc(pub().whatsapp || "")}"></label>
      <div class="field full"><span>Horarios</span><div class="stack" data-hours>${(pub().hours || [{ days: "Lunes a viernes", time: "05:00 – 23:00" }, { days: "Sábado", time: "07:00 – 20:00" }, { days: "Domingo", time: "08:00 – 14:00" }]).map(hourRow).join("")}</div>
        <button type="button" class="btn sm" data-add-hour style="justify-self:start;margin-top:8px">${icon("plus")} Agregar horario</button></div>
    </div>${saveBar()}`,
    redes: () => `<div class="grid-form">
      ${[["instagram", "Instagram", "https://instagram.com/rivalgym"], ["facebook", "Facebook", "https://facebook.com/rivalgym"], ["tiktok", "TikTok", "https://tiktok.com/@rivalgym"], ["youtube", "YouTube", "https://youtube.com/@rivalgym"]]
        .map(([k, l, ph]) => `<label class="field"><span>${icon(k).replace("<svg", '<svg style="width:14px;display:inline;vertical-align:-2px;margin-right:6px"')}${l}</span><input class="input" type="url" name="social.${k}" value="${esc(pub().social?.[k] || "")}" placeholder="${ph}"></label>`).join("")}
      <label class="field full"><span>Google Maps · enlace “Cómo llegar”</span><input class="input" type="url" name="social.maps" value="${esc(pub().social?.maps || "")}" placeholder="https://maps.app.goo.gl/..."></label>
      <label class="field full"><span>Google Maps · URL para insertar mapa (Compartir → Insertar un mapa → copia solo el src)</span><input class="input" type="url" name="mapsEmbed" value="${esc(pub().mapsEmbed || "")}" placeholder="https://www.google.com/maps/embed?pb=..."></label>
    </div>${saveBar()}`,
    colores: () => {
      const c = pub().colors || {};
      return `<div class="grid g2"><div class="stack">
        <div class="label">Combinaciones</div><div class="row wrap">${PRESETS.map(([n, p, b]) => `<button type="button" class="btn sm" data-preset="${p}|${b}"><span style="width:14px;height:14px;border-radius:4px;background:${p}"></span>${n}</button>`).join("")}</div>
        <div class="grid-form"><label class="field"><span>Color principal</span><input class="input" type="color" name="colors.primary" value="${c.primary || "#e30b1c"}"></label>
        <label class="field"><span>Fondo</span><input class="input" type="color" name="colors.bg" value="${c.bg || "#0a0a0c"}"></label></div>
        <p class="dim xs">Se aplica al portal de socios, al panel y a insumos. Mantén un fondo oscuro para que el texto se lea bien.</p></div>
        <div class="color-preview" data-prev style="flex-direction:column;align-items:center;gap:16px;padding:28px;perspective:800px">${logo3d(90, 12)}<button type="button" class="btn primary">Botón principal</button><span class="badge ok">Activa</span></div></div>${saveBar()}`;
    },
    planes: () => `<p class="dim small" style="margin-top:0">Estos planes aparecen al vender/renovar y en el portal de socios. “Días” define la vigencia.</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Días</th><th>Precio</th><th>Destacado</th><th>Visible en portal</th><th></th></tr></thead><tbody data-plans>${(app().plans || DEFAULT_PLANS).map(planRow).join("")}</tbody></table></div>
      <button type="button" class="btn sm" data-add-plan style="margin-top:12px">${icon("plus")} Agregar plan</button>${saveBar()}`,
    operacion: () => `<div class="grid-form">
      <label class="field"><span>Avisar “por vencer” con cuántos días</span><input class="input" type="number" min="0" max="15" name="warnDays" value="${app().warnDays ?? 3}"></label>
      <label class="field"><span>Tolerancia de retardo del personal (minutos)</span><input class="input" type="number" min="0" max="60" name="lateTolerance" value="${app().lateTolerance ?? 10}"></label>
      <label class="field"><span>Horario de la gráfica (abre – cierra)</span><div class="row"><input class="input" type="number" min="0" max="23" name="openHour" value="${pub().openHour ?? 5}"><input class="input" type="number" min="1" max="23" name="closeHour" value="${pub().closeHour ?? 23}"></div></label>
      <label class="row full" style="justify-content:space-between"><span><b>Registrar asistencia al iniciar sesión</b><br><span class="dim small">Además de la huella, marca la entrada del empleado cuando entra al panel.</span></span><span class="switch"><input type="checkbox" name="attendanceOnLogin" ${app().attendanceOnLogin !== false ? "checked" : ""}><i></i></span></label>
      <label class="row full" style="justify-content:space-between"><span><b>El personal abre el torniquete con su huella</b><br><span class="dim small">Si se desactiva, la huella del personal solo registra asistencia.</span></span><span class="switch"><input type="checkbox" name="staffOpensTurnstile" ${app().staffOpensTurnstile !== false ? "checked" : ""}><i></i></span></label>
      <label class="field full"><span>Productos rápidos de venta (uno por línea: Nombre = precio)</span><textarea class="input" name="products" rows="5">${esc((app().products || [{ name: "Agua 1L", price: 20 }, { name: "Bebida isotónica", price: 35 }, { name: "Proteína (scoop)", price: 45 }]).map((p) => `${p.name} = ${p.price}`).join("\n"))}</textarea></label>
    </div>${saveBar()}`,
  };

  const paint = () => {
    form.innerHTML = views[tab]();
    if (tab === "colores") previewColors();
  };
  const previewColors = () => applyTheme({ primary: form["colors.primary"].value, bg: form["colors.bg"].value });

  el.querySelector("[data-tabs]").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b) return; if (tab === "colores") applyTheme(pub().colors || {}); tab = b.dataset.t; el.querySelectorAll("[data-t]").forEach((x) => x.classList.toggle("on", x === b)); paint(); });
  el.querySelector("[data-pass]").onclick = () => changePasswordDialog();
  form.addEventListener("input", (e) => { if (e.target.name?.startsWith("colors.")) previewColors(); });
  form.addEventListener("click", (e) => {
    const p = e.target.closest("[data-preset]"); if (p) { const [a, b] = p.dataset.preset.split("|"); form["colors.primary"].value = a; form["colors.bg"].value = b; previewColors(); }
    if (e.target.closest("[data-add-hour]")) form.querySelector("[data-hours]").insertAdjacentHTML("beforeend", hourRow({ days: "", time: "" }));
    if (e.target.closest("[data-add-plan]")) form.querySelector("[data-plans]").insertAdjacentHTML("beforeend", planRow({ id: "", name: "", days: 30, price: 0, show: true }));
    const del = e.target.closest("[data-del-row]"); if (del) del.closest("[data-row]").remove();
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); save(); });

  async function save() {
    const btn = form.querySelector("[type=submit]");
    await busy(btn, async () => {
      const P = {}, A = {};
      const val = (n) => form[n]?.value?.trim() ?? "";
      if (tab === "gym") {
        Object.assign(P, { gymName: val("gymName"), slogan: val("slogan"), about: val("about"), announcement: val("announcement"), address: val("address"), phone: val("phone"), whatsapp: val("whatsapp") });
        P.hours = [...form.querySelectorAll("[data-hours] [data-row]")].map((r) => ({ days: r.querySelector("[data-k=days]").value.trim(), time: r.querySelector("[data-k=time]").value.trim() })).filter((h) => h.days);
      }
      if (tab === "redes") {
        const bad = [...form.querySelectorAll("input[type=url]")].find((i) => i.value && !/^https:\/\//i.test(i.value));
        if (bad) return toast("Los enlaces deben empezar con https://", "warn");
        P.social = { instagram: val("social.instagram"), facebook: val("social.facebook"), tiktok: val("social.tiktok"), youtube: val("social.youtube"), maps: val("social.maps") };
        P.mapsEmbed = val("mapsEmbed");
      }
      if (tab === "colores") P.colors = { primary: val("colors.primary"), bg: val("colors.bg") };
      if (tab === "planes") {
        const rows = [...form.querySelectorAll("[data-plans] [data-row]")].map((r) => {
          const name = r.querySelector("[data-k=name]").value.trim();
          return { id: r.dataset.id || slug(name), name, days: Math.max(1, Number(r.querySelector("[data-k=days]").value) || 1), price: Number(r.querySelector("[data-k=price]").value) || 0, featured: r.querySelector("[data-k=featured]").checked, show: r.querySelector("[data-k=show]").checked, kind: Number(r.querySelector("[data-k=days]").value) === 1 ? "visita" : Number(r.querySelector("[data-k=days]").value) === 7 ? "semana" : "mensual" };
        }).filter((p) => p.name);
        if (!rows.length) return toast("Debe existir al menos un plan.", "warn");
        if (new Set(rows.map((r) => r.id)).size !== rows.length) return toast("Hay planes con el mismo nombre.", "warn");
        A.plans = rows;
        P.plans = rows.filter((p) => p.show).map(({ name, days, price, featured }) => ({ name, days, price, featured }));
      }
      if (tab === "operacion") {
        A.warnDays = Number(val("warnDays")) || 0; P.warnDays = A.warnDays;
        A.lateTolerance = Math.max(0, Number(val("lateTolerance")) || 0);
        A.attendanceOnLogin = form.attendanceOnLogin.checked; A.staffOpensTurnstile = form.staffOpensTurnstile.checked;
        A.products = val("products").split("\n").map((l) => l.split("=")).filter((p) => p[0]?.trim()).map(([n, p]) => ({ name: n.trim(), price: Number(p) || 0 }));
        P.openHour = Math.min(23, Number(val("openHour")) || 5); P.closeHour = Math.min(23, Math.max(P.openHour + 1, Number(val("closeHour")) || 23));
      }
      try {
        if (Object.keys(P).length) await setDoc(doc(db, "settings", "public"), { ...P, updatedAt: serverTimestamp() }, { merge: true });
        if (Object.keys(A).length) await setDoc(doc(db, "settings", "app"), { ...A, updatedAt: serverTimestamp() }, { merge: true });
        audit("settings.update", { tab });
        toast("Cambios guardados y publicados.", "ok");
      } catch (e) { toast(e.code === "permission-denied" ? "Solo el dueño puede cambiar la configuración." : e.message, "bad"); }
    });
  }

  const off = onState((w) => { if ((w === "pub" || w === "app") && !form.contains(document.activeElement)) paint(); });
  paint();
  return () => { off(); applyTheme(state.pub.colors || {}); };
}

const saveBar = () => `<div class="row" style="justify-content:flex-end;margin-top:20px;border-top:1px solid var(--line);padding-top:16px"><button class="btn primary" type="submit">${icon("check")} Guardar cambios</button></div>`;
const hourRow = (h) => `<div class="row" data-row><input class="input" data-k="days" value="${esc(h.days)}" placeholder="Lunes a viernes"><input class="input" data-k="time" value="${esc(h.time)}" placeholder="05:00 – 23:00"><button type="button" class="btn ghost icon" data-del-row aria-label="Quitar">${icon("x")}</button></div>`;
const planRow = (p) => `<tr data-row data-id="${esc(p.id)}"><td><input class="input" data-k="name" value="${esc(p.name)}" style="min-width:130px"></td><td><input class="input" type="number" min="1" data-k="days" value="${p.days}" style="width:90px"></td>
  <td><input class="input" type="number" min="0" step="0.01" data-k="price" value="${p.price}" style="width:110px"></td><td><label class="check"><input type="checkbox" data-k="featured" ${p.featured ? "checked" : ""}></label></td>
  <td><label class="check"><input type="checkbox" data-k="show" ${p.show !== false ? "checked" : ""}></label></td><td><button type="button" class="btn ghost sm icon" data-del-row aria-label="Quitar">${icon("trash")}</button></td></tr>`;
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `plan-${Date.now()}`;
