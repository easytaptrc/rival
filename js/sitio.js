// RIVAL Gym — sitio informativo: slider de portada, videos, animaciones al bajar y horario en vivo.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const WA = "528711762002";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Barra superior y menú móvil ----------
  const top = $("#top"), menu = $("#menu"), burger = $("#burger"), waFloat = $(".wa-float");
  const onScroll = () => {
    top.classList.toggle("solid", scrollY > 40);
    // El botón flotante se oculta sobre el pie para no tapar los enlaces
    const foot = $(".foot").getBoundingClientRect().top;
    waFloat.classList.toggle("hide", foot < innerHeight - 40);
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  const closeMenu = () => { menu.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); };
  burger.addEventListener("click", () => {
    const open = !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
  });
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) closeMenu(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  // Enlace activo según la sección visible
  const links = $$("a", menu);
  const spy = new IntersectionObserver((es) => es.forEach((en) => {
    if (en.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${en.target.id}`));
  }), { rootMargin: "-45% 0px -50% 0px" });
  links.forEach((a) => { const s = $(a.getAttribute("href")); if (s) spy.observe(s); });

  // ---------- Slider de portada ----------
  const hero = $(".hero"), slides = $$(".slide", hero), titles = $$(".ht", hero), dots = $(".dots", hero);
  const DUR = 6000;
  let cur = 0, timer = null;
  hero.style.setProperty("--dur", `${DUR}ms`);
  slides.forEach((_, i) => {
    const b = document.createElement("button");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", `Ir a la imagen ${i + 1}`);
    b.addEventListener("click", () => go(i, true));
    dots.append(b);
  });
  const dotEls = $$("button", dots);
  function go(i, user) {
    cur = (i + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle("on", k === cur));
    titles.forEach((t, k) => t.classList.toggle("on", k === cur % titles.length));
    dotEls.forEach((d, k) => {
      d.classList.toggle("on", k === cur);
      d.setAttribute("aria-selected", String(k === cur));
      if (k === cur) { d.classList.remove("on"); void d.offsetWidth; d.classList.add("on"); } // reinicia la barra de progreso
    });
    if (user) restart();
  }
  const restart = () => { clearInterval(timer); if (!reduce) timer = setInterval(() => go(cur + 1), DUR); };
  $("[data-prev]", hero).addEventListener("click", () => go(cur - 1, true));
  $("[data-next]", hero).addEventListener("click", () => go(cur + 1, true));
  // Deslizar con el dedo
  let x0 = null;
  hero.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  hero.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1), true);
  });
  // Pausa si la portada no se ve o la pestaña está oculta
  new IntersectionObserver(([en]) => {
    hero.classList.toggle("paused", !en.isIntersecting);
    if (en.isIntersecting) restart(); else clearInterval(timer);
  }).observe(hero);
  document.addEventListener("visibilitychange", () => (document.hidden ? clearInterval(timer) : restart()));
  go(0);

  // ---------- Videos ----------
  const track = $(".vtrack"), vids = $$("video", track);
  $$(".vbox", track).forEach((box) => {
    const v = $("video", box);
    $(".vplay", box).addEventListener("click", () => { v.controls = true; v.play(); });
    v.addEventListener("play", () => {
      v.controls = true;
      box.classList.add("playing");
      vids.forEach((o) => o !== v && o.pause()); // solo uno a la vez
    });
    v.addEventListener("pause", () => box.classList.remove("playing"));
    v.addEventListener("ended", () => box.classList.remove("playing"));
  });
  const step = (dir) => {
    const card = $(".vcard", track);
    track.scrollBy({ left: dir * (card.offsetWidth + 22), behavior: reduce ? "auto" : "smooth" });
  };
  $("[data-vprev]").addEventListener("click", () => step(-1));
  $("[data-vnext]").addEventListener("click", () => step(1));
  // Si el video sale de pantalla se pausa
  const pauseIO = new IntersectionObserver((es) => es.forEach((en) => { if (!en.isIntersecting) en.target.pause(); }), { threshold: 0.2 });
  vids.forEach((v) => pauseIO.observe(v));

  // ---------- Animaciones al bajar ----------
  const io = new IntersectionObserver((es) => es.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
  }), { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  $$(".rv-l, .rv-r, .rv-up").forEach((el) => io.observe(el));

  // ---------- Precios: mensaje de WhatsApp con el plan ----------
  $$("[data-plan]").forEach((a) => {
    a.href = `https://wa.me/${WA}?text=${encodeURIComponent(`Hola RIVAL Gym, quiero informes de ${a.dataset.plan}.`)}`;
    a.target = "_blank";
    a.rel = "noopener";
  });

  // ---------- Copiar datos bancarios ----------
  $$("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); }
    catch {
      const t = document.createElement("textarea"); t.value = b.dataset.copy; document.body.append(t); t.select();
      try { document.execCommand("copy"); } catch {} t.remove();
    }
    b.textContent = "Copiado"; b.classList.add("done");
    setTimeout(() => { b.textContent = "Copiar"; b.classList.remove("done"); }, 1800);
  }));

  // ---------- Abierto / cerrado ahora (hora de Torreón) ----------
  const status = $("#status");
  const paintStatus = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Monterrey", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    const m = Number(p.hour) * 60 + Number(p.minute), weekend = p.weekday === "Sat" || p.weekday === "Sun";
    const [open, close] = weekend ? [8 * 60, 18 * 60] : [5 * 60, 24 * 60];
    const isOpen = m >= open && m < close;
    status.classList.toggle("open", isOpen);
    $("span", status).textContent = isOpen ? `Abierto ahora · cierra a las ${weekend ? "6:00 PM" : "12:00 AM"}` : "Cerrado ahora";
    status.hidden = false;
  };
  try { paintStatus(); setInterval(paintStatus, 60000); } catch {}

  // ---------- Mapa: se carga solo si lo piden (evita rastreo de Google al abrir la página) ----------
  $(".map-load").addEventListener("click", () => {
    $("#map").innerHTML = `<iframe title="Mapa de RIVAL Gym" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent("Paseo del Tecnológico 1228, Torreón, Coahuila")}&output=embed"></iframe>`;
  });

  $("#year").textContent = new Date().getFullYear();

  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
