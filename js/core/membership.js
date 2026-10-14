// Lógica pura de membresías y acceso. Sin dependencias: la usan el navegador y el bridge (Node).

export const DEFAULT_PLANS = [
  { id: "visita", name: "Visita", days: 1, price: 80, kind: "visita" },
  { id: "semana", name: "Semana", days: 7, price: 250, kind: "semana" },
  { id: "mensual", name: "Mensual", days: 30, price: 650, kind: "mensual" },
  { id: "trimestral", name: "Trimestral", days: 90, price: 1750, kind: "mensual" },
  { id: "anual", name: "Anual", days: 365, price: 6000, kind: "mensual" },
];

/** Fecha local como "YYYY-MM-DD". */
export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseYmd(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** Días completos entre hoy y la fecha de vencimiento (0 = vence hoy, negativo = vencida). */
export function daysLeft(end, today = ymd()) {
  if (!end) return -Infinity;
  return Math.round((parseYmd(end) - parseYmd(today)) / 86400000);
}

/**
 * Calcula el nuevo periodo al vender/renovar un plan.
 * Si la membresía sigue vigente, se encadena a partir del día siguiente al vencimiento.
 * Un plan de N días cubre N días naturales incluyendo el de inicio.
 */
export function renewalPeriod(currentEnd, planDays, today = ymd()) {
  const start = currentEnd && daysLeft(currentEnd, today) >= 0 ? addDays(currentEnd, 1) : today;
  return { start, end: addDays(start, Math.max(1, planDays) - 1) };
}

/**
 * Estado de un socio.
 * @returns {{code:'activo'|'por_vencer'|'vencido'|'suspendido'|'sin_plan', label:string, allowed:boolean, days:number}}
 */
export function memberStatus(member, { warnDays = 3, today = ymd() } = {}) {
  if (!member) return { code: "sin_plan", label: "No encontrado", allowed: false, days: -Infinity };
  if (member.suspended) return { code: "suspendido", label: "Suspendido", allowed: false, days: daysLeft(member.end, today) };
  if (!member.end) return { code: "sin_plan", label: "Sin membresía", allowed: false, days: -Infinity };
  const days = daysLeft(member.end, today);
  if (days < 0) return { code: "vencido", label: "Vencida", allowed: false, days };
  if (member.start && daysLeft(member.start, today) > 0) return { code: "sin_plan", label: "Aún no inicia", allowed: false, days };
  if (days <= warnDays) return { code: "por_vencer", label: days === 0 ? "Vence hoy" : `Vence en ${days} día${days === 1 ? "" : "s"}`, allowed: true, days };
  return { code: "activo", label: "Activa", allowed: true, days };
}

/** Normaliza lo que manda un lector (huella, QR, teclado) a un código de socio "RIV-00042". */
export function normalizeMemberCode(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  const m = s.match(/(\d{1,6})$/);
  if (!m) return null;
  return `RIV-${m[1].padStart(5, "0")}`;
}

export function memberCodeFromNumber(n) {
  return `RIV-${String(n).padStart(5, "0")}`;
}

/** Los IDs de huella de personal empiezan en 9000 para no chocar con socios. */
export const STAFF_FINGER_BASE = 9000;

export function publicName(first = "", last = "") {
  const f = String(first).trim().split(/\s+/)[0] || "";
  const l = String(last).trim();
  return l ? `${f} ${l[0]}.` : f;
}
