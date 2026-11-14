const root = document.documentElement;
const toggle = document.querySelector(".theme-toggle");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

function setTheme(theme) {
  root.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch (e) {}
}

const FRAMES = 72;
const POINTS = 120;
const FOAM = 30;
let busy = false;

// splashing front around (ox, oy): radius = growth + peaky travelling lobes; shrink pulls the inner foam edge in
function ringPoints(progress, shrink, ox, oy) {
  const far = Math.hypot(Math.max(ox, innerWidth - ox), Math.max(oy, innerHeight - oy));
  const amax = 0.07 * Math.min(innerWidth, innerHeight);
  const radius = progress * (far + amax + 40);
  const amp = amax * (1 + 1.5 * Math.exp(-radius / 150)) * Math.pow(Math.sin(Math.PI * progress), 0.8);
  const roll = progress * 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= POINTS; i++) {
    const a = (i / POINTS) * 2 * Math.PI;
    const ripple = 0.45 * (1 - 2 * Math.abs(Math.sin(2.5 * a + roll))) + 0.35 * (1 - 2 * Math.abs(Math.sin(4.5 * a - roll * 3))) + 0.3 * (1 - 2 * Math.abs(Math.sin(7 * a + roll * 2)));
    const r = Math.max(0, radius + amp * ripple - shrink);
    pts.push(`${(ox + r * Math.cos(a)).toFixed(1)}px ${(oy + r * Math.sin(a)).toFixed(1)}px`);
  }
  return pts;
}

// fast crash outward (strong ease-out), then a slow settle; the foam thins out and trails the front at the end
function waveFrames(ox, oy, band) {
  const frames = [];
  for (let i = 0; i <= FRAMES; i++) {
    const t = i / FRAMES;
    const p = 1 - Math.pow(1 - t, 2.2);
    if (band) {
      const width = FOAM * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 0.8);
      const outer = ringPoints(p, 0, ox, oy);
      const inner = ringPoints(p, width, ox, oy).reverse();
      frames.push(`polygon(evenodd,${outer.concat(inner).join(",")})`);
    } else {
      frames.push(`polygon(${ringPoints(p, 0, ox, oy).join(",")})`);
    }
  }
  return frames;
}

function flip() {
  if (busy) {
    return;
  }
  let next = "light";
  if (root.dataset.theme === "light") {
    next = "dark";
  }
  if (!document.startViewTransition || reduced.matches) {
    setTheme(next);
    return;
  }
  busy = true;
  const box = toggle.getBoundingClientRect();
  const ox = box.left + box.width / 2;
  const oy = box.top + box.height / 2;
  const foam = document.createElement("div");
  foam.className = "wave-foam";
  foam.setAttribute("aria-hidden", "true");
  const transition = document.startViewTransition(() => {
    setTheme(next);
    root.appendChild(foam);
  });
  transition.ready.then(() => {
    const timing = { duration: 1500, easing: "linear" };
    root.animate({ clipPath: waveFrames(ox, oy, false) }, { ...timing, pseudoElement: "::view-transition-new(root)" });
    root.animate({ clipPath: waveFrames(ox, oy, true) }, { ...timing, pseudoElement: "::view-transition-new(foam)" });
  }).catch(() => {});
  transition.finished.finally(() => {
    foam.remove();
    busy = false;
  }).catch(() => {});
}

toggle.addEventListener("click", flip);

document.addEventListener("keydown", (e) => {
  const el = e.target;
  const typing = el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  if (e.key && !e.repeat && e.key.toLowerCase() === "t" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    flip();
  }
});

const menu = document.querySelector(".menu-btn");
const nav = document.getElementById("nav");
menu.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menu.setAttribute("aria-expanded", String(open));
});
