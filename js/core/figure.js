// Figura animada de ejercicios (SVG, vista lateral). Interpola ángulos para que las extremidades no cambien de largo.
const L = { torso: 62, thigh: 48, shin: 48, upper: 34, fore: 32, foot: 15, head: 11, neck: 8 };
const rad = (d) => (d * Math.PI) / 180;
const down = (p, len, a) => [p[0] + len * Math.sin(rad(a)), p[1] + len * Math.cos(rad(a))];
const mix = (a, b, t) => a + (b - a) * t;
const line = (p, q, w, cls = "") => `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" stroke-width="${w}" class="${cls}"/>`;

/** Calcula articulaciones. Ángulos en grados: 0 = hacia abajo, positivo = hacia el frente (derecha). `torso`: 0 = vertical, positivo = inclinado al frente. */
function solve(p, anim) {
  const a = anim.anchor || "hip", at = p.ay != null ? [p.ax, p.ay] : anim.at || [120, 100];
  const legs = (hip, th, sh) => { const knee = down(hip, L.thigh, th); return { knee, ankle: down(knee, L.shin, sh) }; };
  const top = (hip) => [hip[0] + L.torso * Math.sin(rad(p.torso)), hip[1] - L.torso * Math.cos(rad(p.torso))];
  let hip;
  if (a === "ankle") { const k = down([0, 0], L.thigh, p.thigh), e = down(k, L.shin, p.shin); hip = [at[0] - e[0], at[1] - e[1]]; }
  else if (a === "wrist") { const u = down([0, 0], L.upper, p.upper), w = down(u, L.fore, p.fore), s = [L.torso * Math.sin(rad(p.torso)), -L.torso * Math.cos(rad(p.torso))]; hip = [at[0] - w[0] - s[0], at[1] - w[1] - s[1]]; }
  else hip = at;
  const shoulder = top(hip), elbow = down(shoulder, L.upper, p.upper), wrist = down(elbow, L.fore, p.fore);
  const main = legs(hip, p.thigh, p.shin), back = legs(hip, p.thigh2 ?? p.thigh, p.shin2 ?? p.shin);
  const lean = rad(p.torso);
  const head = [shoulder[0] + (L.neck + L.head) * Math.sin(lean) + (p.headX || 0), shoulder[1] - (L.neck + L.head) * Math.cos(lean)];
  return { hip, shoulder, elbow, wrist, head, ...main, knee2: back.knee, ankle2: back.ankle };
}

function draw(p, j, anim) {
  const g = anim.gear || "";
  const fa = rad(p.footA ?? 90);
  const toe = (k) => [k[0] + L.foot * Math.sin(fa), k[1] + L.foot * Math.cos(fa)];
  let back = "", front = "";
  if (anim.floor !== false) back += `<line x1="16" y1="${anim.floorY ?? 196}" x2="224" y2="${anim.floorY ?? 196}" class="fg-floor"/>`;
  (anim.props || []).forEach((r) => { back += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3" class="fg-prop"/>`; });
  if (g === "pullbar") back += `<line x1="${anim.at[0] - 40}" y1="${anim.at[1]}" x2="${anim.at[0] + 40}" y2="${anim.at[1]}" stroke-width="6" class="fg-gear"/>`;
  if (g === "cable") back += `<line x1="${anim.pulley[0]}" y1="${anim.pulley[1]}" x2="${j.wrist[0].toFixed(1)}" y2="${j.wrist[1].toFixed(1)}" stroke-width="1.5" class="fg-cable"/><circle cx="${anim.pulley[0]}" cy="${anim.pulley[1]}" r="5" class="fg-plate"/>`;
  if (g === "barbell") front += `<circle cx="${j.wrist[0].toFixed(1)}" cy="${j.wrist[1].toFixed(1)}" r="15" class="fg-plate"/><circle cx="${j.wrist[0].toFixed(1)}" cy="${j.wrist[1].toFixed(1)}" r="3" class="fg-hub"/>`;
  if (g === "backbar") front += `<circle cx="${(j.shoulder[0] - 10).toFixed(1)}" cy="${(j.shoulder[1] + 2).toFixed(1)}" r="13" class="fg-plate"/><circle cx="${(j.shoulder[0] - 10).toFixed(1)}" cy="${(j.shoulder[1] + 2).toFixed(1)}" r="3" class="fg-hub"/>`;
  if (g === "dumbbell") { const w = j.wrist; front += `<rect x="${(w[0] - 11).toFixed(1)}" y="${(w[1] - 4).toFixed(1)}" width="22" height="8" rx="2" class="fg-gearfill"/><rect x="${(w[0] - 13).toFixed(1)}" y="${(w[1] - 7).toFixed(1)}" width="6" height="14" rx="1.5" class="fg-gearfill"/><rect x="${(w[0] + 7).toFixed(1)}" y="${(w[1] - 7).toFixed(1)}" width="6" height="14" rx="1.5" class="fg-gearfill"/>`; }
  const hasBack = p.thigh2 != null || p.shin2 != null;
  const limbs = (hasBack ? line(j.hip, j.knee2, 10, "fg-far") + line(j.knee2, j.ankle2, 8, "fg-far") + line(j.ankle2, toe(j.ankle2), 6, "fg-far") : "")
    + line(j.hip, j.knee, 11, "fg-limb") + line(j.knee, j.ankle, 9, "fg-limb") + line(j.ankle, toe(j.ankle), 7, "fg-limb")
    + line(j.hip, j.shoulder, 15, `fg-limb${anim.hl === "torso" ? " fg-hl" : ""}`)
    + `<circle cx="${j.head[0].toFixed(1)}" cy="${j.head[1].toFixed(1)}" r="${L.head}" class="fg-head"/>`
    + line(j.shoulder, j.elbow, 9, `fg-limb${anim.hl === "arm" ? " fg-hl" : ""}`) + line(j.elbow, j.wrist, 7, `fg-limb${anim.hl === "arm" ? " fg-hl" : ""}`);
  return back + limbs + front;
}

const STYLE = `.fg-limb{stroke:#e9e9ee;stroke-linecap:round}.fg-far{stroke:#6d6d78;stroke-linecap:round}.fg-hl{stroke:var(--brand,#e30b1c)}.fg-head{fill:#e9e9ee}.fg-floor{stroke:#33333b;stroke-width:2}.fg-prop{fill:#2a2a31}.fg-gear{stroke:#9a9aa5;stroke-linecap:round}.fg-cable{stroke:#77777f}.fg-plate{fill:#17171b;stroke:var(--brand,#e30b1c);stroke-width:3}.fg-hub{fill:#e9e9ee}.fg-gearfill{fill:var(--brand,#e30b1c)}`;

/** Monta la animación en `el`. Devuelve una función para detenerla. `frame`: 0..1 fija una pose (para previsualizar). */
export function mountFigure(el, anim, { frame = null } = {}) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", anim.view || "0 0 240 210");
  svg.setAttribute("role", "img");
  svg.style.cssText = "width:100%;height:100%;display:block";
  const st = document.createElementNS("http://www.w3.org/2000/svg", "style");
  st.textContent = STYLE;
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.append(st, g);
  el.innerHTML = "";
  el.append(svg);
  const pose = (t) => {
    const p = {};
    for (const k of new Set([...Object.keys(anim.a), ...Object.keys(anim.b)])) p[k] = mix(anim.a[k] ?? anim.b[k], anim.b[k] ?? anim.a[k], t);
    g.innerHTML = draw(p, solve(p, anim), anim);
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (frame != null || reduced) { pose(frame ?? 1); return () => {}; }
  const period = anim.ms || 2600;
  let raf = 0, visible = true, lastDraw = 0;
  const tick = (now) => {
    // 24 cuadros por segundo bastan y evitan trabar celulares o PCs modestas con muchas tarjetas en pantalla
    if (now - lastDraw >= 41) {
      lastDraw = now;
      const c = (now % period) / period;
      pose(0.5 - 0.5 * Math.cos(c * 2 * Math.PI)); // ida y vuelta suave
    }
    raf = visible ? requestAnimationFrame(tick) : 0;
  };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(tick); });
  io.observe(el);
  pose(0);
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); visible = false; io.disconnect(); };
}
