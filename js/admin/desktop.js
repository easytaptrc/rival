// Integración con la app de escritorio: lector de huella, torniquete, impresora y respaldos locales.
import { toast, beep, toDate } from "../core/ui.js";
import { state, processScan, db, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, limit, onSnapshot, serverTimestamp, runTransaction } from "./data.js";
import { setPrinterConfig } from "./receipt.js";

export const desktop = window.rivalDesktop || null;
export const BACKUP_COLLECTIONS = ["members", "sales", "cashCuts", "access", "attendance", "attendanceNotes", "requests", "inventory", "checklists", "receptionInventory", "receptionMoves", "rivalList", "users", "exercises"];
export const scanLog = [];
const scanListeners = new Set();
export const onScanEvent = (f) => (scanListeners.add(f), () => scanListeners.delete(f));
let config = null;

export async function applyConfig(c) {
  config = c;
  state.relayLocal = c.relay?.mode === "http" && !!c.relay.url;
  setPrinterConfig(c.printer);
}
export const currentConfig = () => config;

async function handleScan(id, source) {
  try {
    const r = await processScan(id, source);
    scanLog.unshift({ at: new Date(), id, source, name: r?.member ? `${r.member.firstName} ${r.member.lastName || ""}`.trim() : r?.person?.name || "No registrado", allowed: !!r?.allowed, reason: r?.attendance ? `Asistencia: ${r.attendance}` : r?.reason || "" });
    scanLog.length = Math.min(scanLog.length, 30);
    scanListeners.forEach((f) => f());
  } catch (e) { console.error(e); beep("bad"); toast(`No se pudo validar la huella: ${e.message}`, "bad"); }
}

export async function startDesktop() {
  if (!desktop) return () => {};
  const stops = [];
  await applyConfig(await desktop.getConfig());
  stops.push(desktop.onScan(({ id, source }) => handleScan(id, source)));
  desktop.sessionReady(true);
  stops.push(() => desktop.sessionReady(false));

  // Lector USB que "teclea" el ID: ráfaga muy rápida terminada en Enter, sin importar la pantalla
  let buf = "", last = 0;
  const onKey = (e) => {
    if (config?.reader?.mode !== "teclado") return;
    const t = e.target;
    if (t?.matches?.("input,textarea,select,[contenteditable]") || document.querySelector(".modal-back")) { buf = ""; return; }
    // e.timeStamp es cuándo ocurrió la tecla: si la PC está ocupada, una ráfaga del lector no se confunde con tecleo humano
    const now = e.timeStamp;
    if (now - last > 80) buf = "";
    last = now;
    if (e.key === "Enter") { if (buf.length >= 1) { e.preventDefault(); const v = buf; buf = ""; handleScan(v, "huella"); } return; }
    if (e.key.length === 1 && /[0-9a-z-]/i.test(e.key)) buf += e.key;
  };
  addEventListener("keydown", onKey, true);
  stops.push(() => removeEventListener("keydown", onKey, true));

  // Aperturas pedidas desde otros equipos (celular del dueño, otra recepción)
  const unsub = onSnapshot(query(collection(db, "turnstileCommands"), where("done", "==", false), limit(20)), (snap) => {
    if (!state.relayLocal) return;
    snap.docChanges().forEach(async (ch) => {
      if (ch.type !== "added" || ch.doc.metadata.hasPendingWrites) return;
      const c = ch.doc.data();
      const age = Date.now() - (toDate(c.at)?.getTime() || Date.now());
      try {
        // La transacción evita que dos equipos ejecuten la misma orden
        const mine = await runTransaction(db, async (tx) => {
          const cur = await tx.get(ch.doc.ref);
          if (cur.data()?.done) return false;
          tx.update(ch.doc.ref, { done: true, doneAt: serverTimestamp(), claimedBy: "escritorio", ...(age > 60000 ? { error: "orden expirada" } : {}) });
          return age <= 60000;
        });
        if (!mine) return;
        const r = await desktop.openRelay(c.reason || "Panel");
        if (!r.ok) await updateDoc(ch.doc.ref, { error: String(r.error || "relevador").slice(0, 120) });
      } catch (e) { console.warn("orden", e.message); }
    });
  }, (e) => console.warn("órdenes", e.code));
  stops.push(unsub);

  // Señal de vida para que el panel muestre el torniquete conectado
  const beat = async () => {
    if (!state.relayLocal || !navigator.onLine) return;
    const info = await desktop.getInfo();
    setDoc(doc(db, "devices", "torniquete-1"), { name: info.hostname, relay: "http", version: info.version, lastSeen: serverTimestamp(), host: "escritorio" }, { merge: true }).catch(() => {});
  };
  beat();
  const iv = setInterval(beat, 30000);
  stops.push(() => clearInterval(iv));

  // Respaldo automático
  const check = async () => {
    const hours = Number(config?.backup?.hours) || 0;
    if (!hours) return;
    const info = await desktop.getInfo();
    if (!info.lastBackup || Date.now() - info.lastBackup > hours * 3600000) await backupNow().catch((e) => console.warn("respaldo", e.message));
  };
  const to = setTimeout(check, 20000);
  const ib = setInterval(check, 600000);
  stops.push(() => { clearTimeout(to); clearInterval(ib); });

  return () => stops.forEach((f) => f());
}

/** Copia a disco todo lo que este usuario puede leer. Sin internet usa lo que hay en la caché local. */
export async function backupNow() {
  const data = {}, skipped = [];
  for (const name of BACKUP_COLLECTIONS) {
    try { data[name] = (await getDocs(collection(db, name))).docs.map((d) => ({ _id: d.id, ...d.data() })); }
    catch (e) { skipped.push(name); }
  }
  try {
    const [a, p] = await Promise.all([getDoc(doc(db, "settings", "app")), getDoc(doc(db, "settings", "public"))]);
    data.settings = [{ _id: "app", ...a.data() }, { _id: "public", ...p.data() }];
  } catch { skipped.push("settings"); }
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) throw new Error("No hay datos que respaldar con este usuario.");
  const r = await desktop.writeBackup(JSON.stringify({ app: "RIVAL", createdAt: new Date().toISOString(), by: state.profile?.name || "", online: navigator.onLine, counts, skipped, data }, jsonSafe));
  if (!r.ok) throw new Error(r.error);
  return { ...r, counts, skipped, total };
}
const jsonSafe = (k, v) => (v && typeof v === "object" && typeof v.toDate === "function" ? v.toDate().toISOString() : v);
