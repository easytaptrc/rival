// Capa de datos del panel: socios, ventas, accesos, torniquete y configuración.
import {
  auth, db, doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, orderBy, limit, getDocs,
  onSnapshot, serverTimestamp, runTransaction, writeBatch, increment,
} from "../firebase.js";
import { DEFAULT_PLANS, ymd, renewalPeriod, memberStatus, normalizeMemberCode, memberCodeFromNumber, publicName, STAFF_FINGER_BASE } from "../core/membership.js";
import { recordAttendance, audit } from "../core/auth.js";

export const state = {
  profile: null,
  app: { plans: DEFAULT_PLANS, warnDays: 3, attendanceOnLogin: true, staffOpensTurnstile: true, currency: "MXN" },
  pub: {},
  members: [],
  membersLoaded: false,
};
const subs = new Set();
export const onState = (fn) => (subs.add(fn), () => subs.delete(fn));
const emit = (what) => subs.forEach((f) => f(what));

export function startSync() {
  const unsubs = [];
  unsubs.push(onSnapshot(doc(db, "settings", "app"), (s) => {
    const d = s.data() || {};
    state.app = { ...state.app, ...d, plans: d.plans?.length ? d.plans : DEFAULT_PLANS };
    emit("app");
  }, (e) => console.warn("settings/app", e.code)));
  unsubs.push(onSnapshot(doc(db, "settings", "public"), (s) => { state.pub = s.data() || {}; emit("pub"); }, () => {}));
  if (["dueno", "gerente", "recepcion"].includes(state.profile.role)) {
    unsubs.push(onSnapshot(collection(db, "members"), (s) => {
      state.members = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.membersLoaded = true;
      emit("members");
    }, (e) => console.warn("members", e.code)));
  }
  return () => unsubs.forEach((u) => u());
}

export const plans = () => state.app.plans || DEFAULT_PLANS;
export const planById = (id) => plans().find((p) => p.id === id);
export const statusOf = (m) => memberStatus(m, { warnDays: state.app.warnDays ?? 3 });
export const fullName = (m) => `${m.firstName || ""} ${m.lastName || ""}`.trim();
const me = () => ({ by: auth.currentUser?.uid || null, byName: state.profile?.name || "" });

function publicDoc(m) {
  return {
    name: publicName(m.firstName, m.lastName),
    plan: m.plan || null,
    planName: m.planName || null,
    start: m.start || null,
    end: m.end || null,
    suspended: !!m.suspended,
    updatedAt: serverTimestamp(),
  };
}

// ---------- Socios ----------
async function nextCode(tx) {
  const ref = doc(db, "counters", "members");
  const snap = await tx.get(ref);
  const n = (snap.data()?.next || 1);
  tx.set(ref, { next: n + 1 }, { merge: true });
  return { code: memberCodeFromNumber(n), number: n };
}

/** Alta de socio. Si trae plan, se cobra la inscripción/primer periodo en la misma transacción. */
export async function createMember(data, sale) {
  return runTransaction(db, async (tx) => {
    const { code, number } = await nextCode(tx);
    const m = {
      code, number, fingerprintId: number, fingerEnrolled: false,
      firstName: data.firstName, lastName: data.lastName || "", phone: data.phone || "", email: data.email || "",
      birthdate: data.birthdate || "", emergency: data.emergency || "", notes: data.notes || "", photo: data.photo || "",
      plan: null, planName: null, start: null, end: null, suspended: false, visits: 0, lastAccess: null,
      createdAt: serverTimestamp(), createdBy: auth.currentUser?.uid || null,
    };
    if (sale?.plan) {
      const p = renewalPeriod(null, sale.plan.days);
      Object.assign(m, { plan: sale.plan.id, planName: sale.plan.name, start: p.start, end: p.end });
      tx.set(doc(collection(db, "sales")), {
        type: "inscripcion", concept: `Inscripción · ${sale.plan.name}`, amount: Number(sale.amount) || 0, method: sale.method,
        memberCode: code, memberName: `${m.firstName} ${m.lastName}`.trim(), planId: sale.plan.id, periodStart: p.start, periodEnd: p.end,
        note: sale.note || "", day: ymd(), at: serverTimestamp(), ...me(),
      });
    }
    tx.set(doc(db, "members", code), m);
    tx.set(doc(db, "publicStatus", code), publicDoc(m));
    return m;
  });
}

export async function updateMember(code, patch) {
  const ref = doc(db, "members", code);
  return runTransaction(db, async (tx) => {
    const cur = (await tx.get(ref)).data();
    if (!cur) throw new Error("El socio no existe.");
    const next = { ...cur, ...patch };
    tx.update(ref, { ...patch, updatedAt: serverTimestamp() });
    tx.set(doc(db, "publicStatus", code), publicDoc(next));
    return next;
  });
}

/** Renovación / venta de plan a un socio existente. Encadena el periodo si sigue vigente. */
export async function sellPlan(code, plan, { amount, method, note = "" }) {
  const ref = doc(db, "members", code);
  return runTransaction(db, async (tx) => {
    const cur = (await tx.get(ref)).data();
    if (!cur) throw new Error("El socio no existe.");
    const p = renewalPeriod(cur.end, plan.days);
    const patch = { plan: plan.id, planName: plan.name, end: p.end, suspended: false, updatedAt: serverTimestamp() };
    if (!cur.end || cur.end < ymd()) patch.start = p.start;
    tx.update(ref, patch);
    tx.set(doc(db, "publicStatus", code), publicDoc({ ...cur, ...patch }));
    tx.set(doc(collection(db, "sales")), {
      type: cur.end ? "renovacion" : "inscripcion", concept: `${cur.end ? "Renovación" : "Membresía"} · ${plan.name}`,
      amount: Number(amount) || 0, method, memberCode: code, memberName: `${cur.firstName} ${cur.lastName}`.trim(),
      planId: plan.id, periodStart: p.start, periodEnd: p.end, note, day: ymd(), at: serverTimestamp(), ...me(),
    });
    return { ...cur, ...patch };
  });
}

export async function deleteMember(code) {
  const b = writeBatch(db);
  b.delete(doc(db, "members", code));
  b.delete(doc(db, "publicStatus", code));
  await b.commit();
  audit("member.delete", { code });
}

// ---------- Ventas ----------
export async function registerSale({ type = "producto", concept, amount, method, qty = 1, memberCode = null, memberName = "", note = "" }) {
  return addDoc(collection(db, "sales"), {
    type, concept, amount: Number(amount) || 0, qty: Number(qty) || 1, method, memberCode, memberName, note,
    day: ymd(), at: serverTimestamp(), ...me(),
  });
}

/** Pago de visita: venta + registro de acceso + apertura de torniquete. */
export async function visitPayment({ name, phone, amount, method, open = true }) {
  await registerSale({ type: "visita", concept: "Pago de visita", amount, method, memberName: name || "Visitante", note: phone || "" });
  await logAccess({ kind: "visita", ref: null, name: name || "Visitante", allowed: true, status: "visita", reason: "Pago de visita", source: "visita" });
  if (open) await openTurnstile("Pago de visita");
}

// ---------- Accesos y torniquete ----------
export function logAccess({ kind, ref, name, allowed, status, reason = "", source = "manual", planName = null, end = null }) {
  return addDoc(collection(db, "access"), {
    kind, ref, name, result: allowed ? "permitido" : "denegado", status, reason, source, planName, end,
    day: ymd(), at: serverTimestamp(), by: auth.currentUser?.uid || null, device: "panel",
  });
}

export function openTurnstile(reason = "Apertura manual") {
  return addDoc(collection(db, "turnstileCommands"), { action: "open", reason, done: false, at: serverTimestamp(), ...me() });
}

/**
 * Procesa una lectura de huella/ID desde el panel (lector tipo teclado, QR o captura manual).
 * El bridge del torniquete hace exactamente lo mismo del lado del hardware.
 */
export async function processScan(raw, source = "huella") {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return null;
  const num = Number((s.match(/(\d+)$/) || [])[1]);

  // ¿Personal? (EMP-#### o ID de huella >= 9000)
  if (s.startsWith("EMP") || num >= STAFF_FINGER_BASE) {
    const fid = s.startsWith("EMP") ? STAFF_FINGER_BASE + num : num;
    const snap = await getDocs(query(collection(db, "users"), where("fingerprintId", "==", fid), limit(1)));
    if (!snap.empty) {
      const u = { uid: snap.docs[0].id, ...snap.docs[0].data() };
      if (u.active === false) {
        await logAccess({ kind: "personal", ref: u.uid, name: u.name, allowed: false, status: "inactivo", reason: "Usuario desactivado", source });
        return { kind: "personal", person: u, allowed: false, reason: "Usuario desactivado" };
      }
      const type = await recordAttendance(u, source);
      await logAccess({ kind: "personal", ref: u.uid, name: u.name, allowed: true, status: type, reason: `Asistencia: ${type}`, source });
      if (state.app.staffOpensTurnstile !== false) await openTurnstile(`Personal: ${u.name}`);
      return { kind: "personal", person: u, allowed: true, attendance: type };
    }
  }

  // Socio
  const code = normalizeMemberCode(s);
  let m = code ? state.members.find((x) => x.code === code) : null;
  if (!m && code) { const d = await getDoc(doc(db, "members", code)); if (d.exists()) m = { id: d.id, ...d.data() }; }
  if (!m && num) {
    const q = await getDocs(query(collection(db, "members"), where("fingerprintId", "==", num), limit(1)));
    if (!q.empty) m = { id: q.docs[0].id, ...q.docs[0].data() };
  }
  if (!m) {
    await logAccess({ kind: "socio", ref: code, name: "Desconocido", allowed: false, status: "no_encontrado", reason: "ID no registrado", source });
    return { kind: "socio", member: null, allowed: false, reason: "ID no registrado", code };
  }
  const st = statusOf(m);
  await logAccess({ kind: "socio", ref: m.code, name: fullName(m), allowed: st.allowed, status: st.code, reason: st.label, source, planName: m.planName, end: m.end });
  if (st.allowed) {
    await openTurnstile(`Socio ${m.code}`);
    updateDoc(doc(db, "members", m.code), { lastAccess: serverTimestamp(), visits: increment(1) }).catch(() => {});
  }
  return { kind: "socio", member: m, allowed: st.allowed, status: st, reason: st.label };
}

export async function findStaffByUid(uid) {
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { uid, ...s.data() } : null;
}

// ---------- Consultas de rango ----------
export async function salesBetween(from, to, { includeVoid = false } = {}) {
  const s = await getDocs(query(collection(db, "sales"), where("at", ">=", from), where("at", "<", to), orderBy("at", "desc")));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => includeVoid || !x.void);
}
export async function accessBetween(from, to, max = 2000) {
  const s = await getDocs(query(collection(db, "access"), where("at", ">=", from), where("at", "<", to), orderBy("at", "desc"), limit(max)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function attendanceBetween(from, to) {
  const s = await getDocs(query(collection(db, "attendance"), where("at", ">=", from), where("at", "<", to), orderBy("at", "desc"), limit(2000)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export function dayRange(d = new Date()) {
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(a); b.setDate(b.getDate() + 1);
  return [a, b];
}

export { db, doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, orderBy, limit, getDocs, onSnapshot, serverTimestamp, writeBatch };
