// Equipo local (solo app de escritorio): huella, torniquete, impresora, respaldos.
import { esc, icon, toast, busy, fmtDateTime, confirmDialog } from "../../core/ui.js";
import { desktop, applyConfig, backupNow, scanLog, onScanEvent } from "../desktop.js";
import { ticketHtml } from "../receipt.js";

const READERS = {
  teclado: ["Lector USB que escribe el ID", "Lectores o escáneres que teclean el ID + Enter. Funciona con la app abierta, en cualquier pantalla."],
  http: ["Programa del lector (API local)", "El software del fabricante envía POST a esta PC con el ID identificado."],
  zkteco: ["Terminal ZKTeco en red (ADMS)", "La terminal avisa a esta PC cada vez que reconoce una huella."],
  ninguno: ["Sin lector", "Se valida escribiendo el ID en Recepción."],
};

export async function render(el) {
  let cfg = await desktop.getConfig(), info = await desktop.getInfo();
  el.innerHTML = `
    <div class="page-head fade-in"><div><div class="eyebrow">Este equipo</div><h1>Huella, torniquete e impresora</h1><p>${esc(info.hostname)} · versión ${esc(info.version)} · esta configuración se guarda solo en esta computadora</p></div>
      <span class="badge ${navigator.onLine ? "ok" : "warn"}">${navigator.onLine ? "Con internet: sincronizando con Firebase" : "Sin internet: guardando en local"}</span></div>
    <div class="grid g2">
      <form class="card stack" data-reader>
        <div class="card-head" style="margin:0"><div><h3>${icon("finger").replace("<svg", '<svg style="width:18px;display:inline;vertical-align:-3px;margin-right:6px"')}Lector de huella</h3><p>Al enrolar usa el ID del socio (284) o del empleado (9001)</p></div></div>
        <label class="field"><span>Tipo de lector</span><select class="input" name="mode">${Object.entries(READERS).map(([k, v]) => `<option value="${k}" ${cfg.reader.mode === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
        <p class="dim small" data-rhelp style="margin:0"></p>
        <div class="grid-form" data-rhttp><label class="field"><span>Puerto</span><input class="input mono" name="port" type="number" value="${cfg.reader.port}"></label>
          <div class="field" data-rzk><span>IP de la terminal (obligatoria)</span><input class="input mono" name="zkIp" value="${esc(cfg.reader.zkIp || "")}" placeholder="192.168.1.201"></div></div>
        <div class="notice info" data-rinfo></div>
        <div class="row wrap"><button class="btn primary">${icon("check")} Guardar</button>
          <input class="input mono" data-testid placeholder="ID de prueba" style="width:130px"><button type="button" class="btn" data-sim>Simular lectura</button></div>
        <div><div class="label" style="margin-bottom:6px">Últimas lecturas</div><div class="list" data-log></div></div>
      </form>
      <div class="stack" style="gap:18px">
        <form class="card stack" data-relay>
          <div class="card-head" style="margin:0"><div><h3>${icon("door").replace("<svg", '<svg style="width:18px;display:inline;vertical-align:-3px;margin-right:6px"')}Torniquete</h3><p>Relevador en red (Shelly, ESP32 o controlador IP)</p></div></div>
          <label class="field"><span>Conexión</span><select class="input" name="mode"><option value="ninguno" ${cfg.relay.mode !== "http" ? "selected" : ""}>Sin relevador en este equipo</option><option value="http" ${cfg.relay.mode === "http" ? "selected" : ""}>Relevador por red (HTTP)</option></select></label>
          <label class="field"><span>URL de apertura</span><input class="input mono" name="url" value="${esc(cfg.relay.url || "")}" placeholder="http://192.168.1.50/relay/0?turn=on&timer=1"></label>
          <div class="row wrap"><button class="btn primary">${icon("check")} Guardar</button><button type="button" class="btn" data-open>${icon("door")} Probar apertura</button></div>
          <div class="small" data-relaymsg></div>
        </form>
        <form class="card stack" data-printer>
          <div class="card-head" style="margin:0"><div><h3>${icon("receipt").replace("<svg", '<svg style="width:18px;display:inline;vertical-align:-3px;margin-right:6px"')}Impresora de tickets</h3><p>Tickets de venta y cortes de caja</p></div><button type="button" class="btn ghost sm" data-refresh>${icon("refresh")}</button></div>
          <label class="field"><span>Impresora</span><select class="input" name="name" data-printers></select></label>
          <div class="grid-form"><label class="field"><span>Ancho del papel</span><select class="input" name="width"><option value="80" ${cfg.printer.width != 58 ? "selected" : ""}>80 mm</option><option value="58" ${cfg.printer.width == 58 ? "selected" : ""}>58 mm</option></select></label>
            <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="auto" ${cfg.printer.auto ? "checked" : ""}> Imprimir ticket en cada venta</label></div>
          <div class="row wrap"><button class="btn primary">${icon("check")} Guardar</button><button type="button" class="btn" data-print>Imprimir prueba</button></div>
          <div class="small" data-printmsg></div>
        </form>
      </div>
      <div class="card stack span2">
        <div class="card-head" style="margin:0"><div><h3>${icon("shield").replace("<svg", '<svg style="width:18px;display:inline;vertical-align:-3px;margin-right:6px"')}Datos locales y respaldos</h3><p>Todo se guarda en esta PC y se sincroniza con Firebase al haber internet</p></div>
          <div class="row wrap"><button class="btn" data-folder>${icon("clipboard")} Abrir carpeta</button><button class="btn primary" data-backup>${icon("download")} Respaldar ahora</button></div></div>
        <div class="kv"><div><span>Carpeta</span><b class="xs">${esc(info.backupDir)}</b></div><div><span>Último respaldo</span><b data-last>${info.lastBackup ? fmtDateTime(new Date(info.lastBackup)) : "Todavía no"}</b></div></div>
        <div class="row wrap"><label class="field"><span>Respaldo automático</span><select class="input" data-hours style="width:auto">${[[0, "Desactivado"], [6, "Cada 6 horas"], [12, "Cada 12 horas"], [24, "Cada 24 horas"]].map(([v, l]) => `<option value="${v}" ${Number(cfg.backup.hours) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" data-login ${cfg.startAtLogin ? "checked" : ""}> Abrir RIVAL al encender la PC</label></div>
        <div class="notice">${icon("alert")}<div>Los respaldos contienen datos personales de socios y no van cifrados: protege esta PC con contraseña de Windows. Se conservan los últimos 30.</div></div>
        <div class="small" data-backupmsg></div>
      </div>
    </div>`;

  const save = async (patch) => { cfg = await desktop.saveConfig(patch); await applyConfig(cfg); return cfg; };
  const rf = el.querySelector("[data-reader]");
  const paintReader = () => {
    const mode = rf.mode.value;
    el.querySelector("[data-rhelp]").textContent = READERS[mode][1];
    el.querySelector("[data-rhttp]").hidden = !["http", "zkteco"].includes(mode);
    el.querySelector("[data-rzk]").hidden = mode !== "zkteco";
    const box = el.querySelector("[data-rinfo]");
    box.hidden = !["http", "zkteco"].includes(mode);
    box.innerHTML = mode === "http" ? `${icon("wifi")}<div>El programa del lector debe enviar <code>POST http://127.0.0.1:${esc(rf.port.value)}/scan</code> con <code>{"id":"284"}</code> y la cabecera <code>x-rival-token: ${esc(cfg.reader.token)}</code>.</div>`
      : `${icon("wifi")}<div>En la terminal: <b>Comunicación → Servidor en la nube (ADMS)</b>, dirección <b>${esc(info.lanIp)}</b>, puerto <b>${esc(rf.port.value)}</b>. Registra los usuarios con el mismo ID.</div>`;
  };
  rf.addEventListener("change", (e) => {
    if (e.target.name === "mode") rf.port.value = rf.mode.value === "zkteco" ? 8081 : 8787;
    paintReader();
  });
  paintReader();
  rf.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(rf.querySelector("button.primary"), async () => {
      if (rf.mode.value === "zkteco" && !/^\d{1,3}(\.\d{1,3}){3}$/.test(rf.zkIp.value.trim())) return toast("Escribe la IP de la terminal: solo ese equipo podrá enviar lecturas.", "warn");
      const r = await desktop.saveConfig({ reader: { mode: rf.mode.value, port: Number(rf.port.value) || 8787, zkIp: rf.zkIp.value.trim() } });
      cfg = r; await applyConfig(cfg); paintReader();
      const st = await desktop.getInfo();
      if (st.readerError) toast(`El lector no pudo iniciar: ${st.readerError}`, "bad"); else toast("Lector configurado.", "ok");
    });
  });
  const paintLog = () => {
    el.querySelector("[data-log]").innerHTML = scanLog.slice(0, 5).map((s) => `<div class="list-item" style="padding:7px 0"><span class="badge ${s.allowed ? "ok" : "bad"}">${s.allowed ? "OK" : "No"}</span><div class="grow small"><b>${esc(s.name)}</b> <span class="dim mono">#${esc(s.id)}</span><div class="dim xs">${esc(s.reason)} · ${esc(s.source)}</div></div><span class="dim xs mono">${s.at.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></div>`).join("") || `<div class="dim small">Pon un dedo en el lector: la lectura aparecerá aquí.</div>`;
  };
  paintLog();
  const off = onScanEvent(paintLog);
  el.querySelector("[data-sim]").onclick = () => { const v = el.querySelector("[data-testid]").value.trim(); if (v) desktop.simulateScan(v); };

  const rl = el.querySelector("[data-relay]"), rm = el.querySelector("[data-relaymsg]");
  const relayPatch = () => ({ relay: { mode: rl.mode.value, url: rl.url.value.trim() } });
  rl.addEventListener("submit", (e) => {
    e.preventDefault();
    if (rl.mode.value === "http" && !/^https?:\/\//i.test(rl.url.value.trim())) return toast("La URL debe empezar con http://", "warn");
    save(relayPatch()).then(() => toast("Torniquete configurado.", "ok"));
  });
  el.querySelector("[data-open]").onclick = async (e) => {
    if (rl.mode.value !== "http") return toast("Elige “Relevador por red” y escribe la URL.", "warn");
    await save(relayPatch());
    busy(e.currentTarget, async () => {
      const r = await desktop.openRelay("Prueba desde Equipo local");
      rm.innerHTML = r.ok ? `<span style="color:var(--ok)">✓ El relevador respondió. Revisa que el torniquete se haya liberado.</span>` : `<span style="color:var(--bad)">✗ ${esc(r.error)}</span>`;
    });
  };

  const pf = el.querySelector("[data-printer]"), pm = el.querySelector("[data-printmsg]");
  const loadPrinters = async () => {
    const list = await desktop.listPrinters();
    pf.name.innerHTML = `<option value="">Sin elegir (no imprime solo)</option>` + list.map((p) => `<option value="${esc(p.name)}" ${p.name === cfg.printer.name ? "selected" : ""}>${esc(p.displayName || p.name)}</option>`).join("");
    if (!list.length) pm.innerHTML = `<span style="color:var(--warn)">Windows no reporta impresoras instaladas. Instala el controlador de tu impresora y presiona actualizar.</span>`;
  };
  loadPrinters();
  el.querySelector("[data-refresh]").onclick = loadPrinters;
  const printPatch = () => ({ printer: { name: pf.name.value, width: Number(pf.width.value), auto: pf.auto.checked } });
  pf.addEventListener("submit", (e) => { e.preventDefault(); save(printPatch()).then(() => toast("Impresora configurada.", "ok")); });
  el.querySelector("[data-print]").onclick = async (e) => {
    if (!pf.name.value) return toast("Primero elige la impresora.", "warn");
    await save(printPatch());
    busy(e.currentTarget, async () => {
      const r = await desktop.print(ticketHtml({ concept: "TICKET DE PRUEBA", amount: 0, method: "—", note: "Si puedes leer esto, la impresora está lista." }));
      pm.innerHTML = r.ok ? `<span style="color:var(--ok)">✓ Enviado a la impresora.</span>` : `<span style="color:var(--bad)">✗ ${esc(r.error)}</span>`;
    });
  };

  const bm = el.querySelector("[data-backupmsg]");
  el.querySelector("[data-folder]").onclick = () => desktop.openBackupFolder();
  el.querySelector("[data-hours]").onchange = (e) => save({ backup: { hours: Number(e.target.value) } });
  el.querySelector("[data-login]").onchange = (e) => save({ startAtLogin: e.target.checked });
  el.querySelector("[data-backup]").onclick = (e) => busy(e.currentTarget, async () => {
    try {
      const r = await backupNow();
      el.querySelector("[data-last]").textContent = fmtDateTime(new Date());
      bm.innerHTML = `<span style="color:var(--ok)">✓ ${r.total} registros guardados en ${esc(r.file)}</span>${r.skipped.length ? `<div class="dim xs">Este usuario no puede leer: ${esc(r.skipped.join(", "))}. Respalda con la cuenta del dueño para incluir todo.</div>` : ""}`;
    } catch (ex) { bm.innerHTML = `<span style="color:var(--bad)">✗ ${esc(ex.message)}</span>`; }
  });
  return off;
}
