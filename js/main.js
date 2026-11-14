const root = document.documentElement;
const toggle = document.querySelector(".theme-toggle");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

function setTheme(theme) {
  root.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch (e) {}
}

// progress curve: rush up, overshoot near the top, backwash a little, then settle at full cover
const curve = [[0, 0], [0.5, 0.93], [0.7, 0.985], [0.86, 0.94], [1, 1]];
const FRAMES = 72;
const FOAM = 28;
let busy = false;

function waveFrame(progress, offset) {
  const w = innerWidth;
  const h = innerHeight;
  const amp = h * 0.06;
  const wave = amp * Math.sin(Math.PI * progress);
  // front travels from just below the viewport to just above it, so p=0 shows nothing and p=1 covers every corner
  const base = (h + 2 * amp) * (1 - progress) - amp + offset;
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const x = (i / 48) * w;
    const u = (x / w) * 2 * Math.PI;
    const roll = progress * 2 * Math.PI;
    const y = base + wave * (0.6 * Math.sin(u * 1.5 - roll * 2) + 0.3 * Math.sin(u * 2.5 + roll * 3) + 0.2 * Math.sin(u * 4 - roll));
    pts.push(`${x.toFixed(1)}px ${y.toFixed(1)}px`);
  }
  return pts;
}

function waveFrames(offset, band) {
  const h = innerHeight;
  const frames = [];
  for (let i = 0; i <= FRAMES; i++) {
    const t = i / FRAMES;
    let k = 1;
    while (curve[k][0] < t) {
      k++;
    }
    const [t0, p0] = curve[k - 1];
    const [t1, p1] = curve[k];
    let u = (t - t0) / (t1 - t0);
    if (k === 1) {
      u = 1 - Math.pow(1 - u, 2.2);
    } else {
      u = u * u * (3 - 2 * u);
    }
    const p = p0 + (p1 - p0) * u;
    const front = waveFrame(p, 0);
    let poly = front.concat([`${innerWidth}px ${h * 2}px`, `0px ${h * 2}px`]);
    if (band) {
      poly = front.concat(waveFrame(p, Math.min(FOAM, 0.05 * innerHeight)).reverse());
    }
    frames.push(`polygon(${poly.join(",")})`);
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
  const foam = document.createElement("div");
  foam.className = "wave-foam";
  foam.setAttribute("aria-hidden", "true");
  const transition = document.startViewTransition(() => {
    setTheme(next);
    root.appendChild(foam);
  });
  transition.ready.then(() => {
    const timing = { duration: 1600, easing: "linear" };
    root.animate({ clipPath: waveFrames(0, false) }, { ...timing, pseudoElement: "::view-transition-new(root)" });
    root.animate({ clipPath: waveFrames(0, true) }, { ...timing, pseudoElement: "::view-transition-new(foam)" });
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
