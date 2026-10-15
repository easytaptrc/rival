// Análisis de asistencia del personal: horario esperado vs. registros, retardos, salidas anticipadas, faltas y descuento sugerido.
import { ymd, addDays } from "../core/membership.js";
import { toDate } from "../core/ui.js";

export const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const PERIODS = { dia: "por día", semana: "por semana", quincena: "por quincena", mes: "por mes" };
export const toMin = (hhmm) => { if (!hhmm) return null; const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
export const dur = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${Math.round(min % 60)} min` : ""}` : `${Math.round(min)} min`);
const minsOf = (d) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
const money = (n) => Math.round(n * 100) / 100;

export function schedFor(user, day) {
  const dow = new Date(day + "T00:00:00").getDay();
  const s = user.schedule?.[dow];
  return s && s.in && s.out ? s : null;
}
const workDaysPerWeek = (u) => Math.max(1, Object.values(u.schedule || {}).filter((s) => s && s.in && s.out).length);

/** Tarifa diaria según el sueldo configurado. */
export function dailyRate(user, pay) {
  if (!pay?.amount) return 0;
  const a = Number(pay.amount), w = workDaysPerWeek(user);
  return { dia: a, semana: a / w, quincena: a / (w * 15 / 7), mes: a / (w * 30 / 7) }[pay.period || "dia"] || 0;
}

/**
 * @param events registros de attendance de UN usuario en el rango
 * @param notes  { [day]: {justified, note} }
 */
export function analyzeUser(user, events, { from, to, tolerance = 10, pay = null, notes = {} }) {
  const today = ymd(), nowMin = minsOf(new Date());
  const byDay = new Map();
  events.forEach((e) => { const d = e.day || ymd(toDate(e.at) || new Date()); (byDay.get(d) || byDay.set(d, []).get(d)).push(e); });
  const rate = dailyRate(user, pay);
  const created = toDate(user.createdAt) ? ymd(toDate(user.createdAt)) : from;
  const days = [];
  for (let d = from; d <= to && d <= today; d = addDays(d, 1)) {
    const evs = (byDay.get(d) || []).slice().sort((a, b) => (toDate(a.at)?.getTime() || 0) - (toDate(b.at)?.getTime() || 0));
    const sched = schedFor(user, d);
    if (!evs.length && !sched) continue;
    let open = null, worked = 0, firstIn = null, lastOut = null;
    evs.forEach((e) => {
      const t = toDate(e.at) || new Date();
      if (e.type === "entrada") { if (!open) open = t; if (!firstIn) firstIn = t; }
      else if (open) { worked += (t - open) / 60000; open = null; lastOut = t; }
      else lastOut = t;
    });
    const stillIn = !!open && d === today;
    if (open && d === today) worked += (Date.now() - open) / 60000;
    const r = { day: d, sched, events: evs, firstIn, lastOut, workedMin: worked, lateMin: 0, earlyMin: 0, absent: false, noExit: false, stillIn, pending: false, offDay: !sched };
    const n = notes[d];
    r.justified = !!n?.justified; r.note = n?.note || "";
    if (sched) {
      const sIn = toMin(sched.in), sOut = toMin(sched.out);
      r.schedMin = Math.max(1, sOut - sIn);
      if (!firstIn) {
        if (d < today || nowMin > sOut) r.absent = d >= created; else r.pending = true;
      } else {
        const late = minsOf(firstIn) - sIn;
        if (late > tolerance) r.lateMin = Math.round(late);
        if (lastOut && !open) { const early = sOut - minsOf(lastOut); if (early > tolerance) r.earlyMin = Math.round(early); }
        if (open && d < today) r.noExit = true;
      }
      if (rate && !r.justified) {
        const hourly = rate / (r.schedMin / 60);
        r.deduction = money(r.absent ? rate : ((r.lateMin + r.earlyMin) / 60) * hourly);
      } else r.deduction = 0;
    } else r.deduction = 0;
    r.incident = !r.justified && (r.absent || r.lateMin > 0 || r.earlyMin > 0 || r.noExit);
    days.push(r);
  }
  const sum = (f) => days.reduce((s, x) => s + f(x), 0);
  return {
    days,
    worked: days.filter((x) => x.firstIn).length,
    hours: sum((x) => x.workedMin) / 60,
    late: days.filter((x) => x.lateMin && !x.justified).length,
    lateMin: sum((x) => (x.justified ? 0 : x.lateMin)),
    early: days.filter((x) => x.earlyMin && !x.justified).length,
    earlyMin: sum((x) => (x.justified ? 0 : x.earlyMin)),
    absent: days.filter((x) => x.absent && !x.justified).length,
    noExit: days.filter((x) => x.noExit).length,
    deduction: money(sum((x) => x.deduction || 0)),
    rate,
  };
}

const fmtT = (d) => d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
const fmtD = (s) => new Date(s + "T00:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });

/** Resumen breve de un día, redactado para el empleado. */
export function dayText(r, money = null) {
  const parts = [];
  if (r.absent) parts.push(`no se registró tu asistencia (horario ${r.sched.in}–${r.sched.out}): falta`);
  else {
    if (r.firstIn) parts.push(`llegaste a las ${fmtT(r.firstIn)}${r.lateMin ? ` (${dur(r.lateMin)} tarde; tu entrada es ${r.sched.in})` : ""}`);
    if (r.lastOut && !r.stillIn && !r.noExit) parts.push(`te fuiste a las ${fmtT(r.lastOut)}${r.earlyMin ? ` (${dur(r.earlyMin)} antes de tu salida de ${r.sched.out})` : ""}`);
    if (r.noExit) parts.push("no registraste tu salida");
  }
  let t = `${fmtD(r.day)}: ${parts.join(" y ")}.`;
  if (r.justified) t += ` Justificado${r.note ? `: ${r.note}` : ""}.`;
  else if (money && r.deduction) t += ` Descuento: ${money(r.deduction)}.`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
