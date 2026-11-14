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
const POINTS = 180;
const FOAM = 30;
const DURATION = 1500;
const SPRAY = 150;
let busy = false;

// same easing as the wave: fast crash outward, then a slow settle
function ease(t) {
  return 1 - Math.pow(1 - t, 2.2);
}

function reach(ox, oy) {
  const far = Math.hypot(Math.max(ox, innerWidth - ox), Math.max(oy, innerHeight - oy));
  return far + 0.07 * Math.min(innerWidth, innerHeight) + 40;
}

// splashing front radius at angle a around (ox, oy): growth + peaky travelling lobes
function front(progress, a, ox, oy) {
  const amax = 0.07 * Math.min(innerWidth, innerHeight);
  const radius = progress * reach(ox, oy);
  const amp = amax * (1 + 1.5 * Math.exp(-radius / 150)) * Math.pow(Math.sin(Math.PI * progress), 0.8);
  const roll = progress * 2 * Math.PI;
  const ripple = 0.45 * (1 - 2 * Math.abs(Math.sin(2.5 * a + roll))) + 0.35 * (1 - 2 * Math.abs(Math.sin(4.5 * a - roll * 3))) + 0.3 * (1 - 2 * Math.abs(Math.sin(7 * a + roll * 2)));
  return radius + amp * ripple;
}

// off(a) moves the ring radially relative to the front (negative = trailing behind it)
function ringPoints(progress, off, ox, oy) {
  const pts = [];
  for (let i = 0; i <= POINTS; i++) {
    const a = (i / POINTS) * 2 * Math.PI;
    let r = front(progress, a, ox, oy);
    if (off) {
      r += off(a);
    }
    r = Math.max(0, r);
    pts.push(`${(ox + r * Math.cos(a)).toFixed(1)}px ${(oy + r * Math.sin(a)).toFixed(1)}px`);
  }
  return pts;
}

// foam thins out and trails the front at the end
function envelope(t) {
  return Math.pow(Math.sin(Math.PI * t), 0.8);
}

function width(t) {
  return FOAM * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 0.8);
}

// ragged outer edge of the foam
function jitter(t, a) {
  const s = t * 40;
  return 3 * envelope(t) * (1 + Math.sin(23 * a + s) * Math.sin(37 * a - 1.3 * s));
}

// foam fingers shooting out past the crests: sharp 18/22 lobes, longest mid-run, gone at the end
function lead(t, a) {
  const roll = t * 2 * Math.PI;
  const sharp = 0.55 * Math.pow(Math.abs(Math.sin(9 * a + roll * 2)), 4) + 0.45 * Math.pow(Math.abs(Math.sin(11 * a - roll * 3)), 4);
  return 0.09 * Math.min(innerWidth, innerHeight) * Math.sin(Math.PI * t) * (0.15 + sharp);
}

// streaks of foam bleeding back into the water
function streak(t, a) {
  return Math.pow(Math.abs(Math.sin(13 * a + t * 9)), 3);
}

// [name, fill, (t, a) => [outer, inner] offsets from the front]
const LAYERS = [
  ["trail", "rgba(250,247,243,.4)", (t, a) => [-0.3 * width(t) - jitter(t, a), -width(t) * (1.5 + 2.5 * streak(t, a))]],
  ["foam", "rgba(250,247,243,.85)", (t, a) => [jitter(t, a), -width(t)]],
  ["lead", "rgba(250,247,243,.85)", (t, a) => [jitter(t, a) + lead(t, a), jitter(t, a) - 1]],
  ["wet", "rgba(47,111,159,.6)", (t, a) => [jitter(t, a) + lead(t, a) + envelope(t), jitter(t, a) + lead(t, a) - 2.5 * envelope(t)]]
];

function waveFrames(ox, oy, edge) {
  const frames = [];
  for (let i = 0; i <= FRAMES; i++) {
    const t = i / FRAMES;
    const p = ease(t);
    if (edge) {
      const outer = ringPoints(p, (a) => edge(t, a)[0], ox, oy);
      const inner = ringPoints(p, (a) => edge(t, a)[1], ox, oy).reverse();
      frames.push(`polygon(evenodd,${outer.concat(inner).join(",")})`);
    } else {
      frames.push(`polygon(${ringPoints(p, null, ox, oy).join(",")})`);
    }
  }
  return frames;
}

// droplets launched from the crest points, flying outward ahead of the front
function sprayParticles(ox, oy) {
  const list = [];
  for (let i = 0; i < SPRAY; i++) {
    const s = 0.04 + 0.7 * Math.pow(Math.random(), 1.3);
    let a = 0;
    let r0 = -1;
    for (let k = 0; k < 4; k++) {
      const c = Math.random() * 2 * Math.PI;
      const r = front(ease(s), c, ox, oy);
      if (r > r0) {
        a = c;
        r0 = r;
      }
    }
    list.push({ s, a, r0, life: 0.2 + 0.25 * Math.random(), drift: (Math.random() - 0.5) * 0.12, d: 15 + 140 * Math.pow(Math.random(), 1.5), size: 1.5 + 4.5 * Math.pow(Math.random(), 2) });
  }
  return list;
}

function drawSpray(ctx, list, t, ox, oy) {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const q of list) {
    const u = (t - q.s) / q.life;
    if (u < 0 || u > 1) {
      continue;
    }
    const r = q.r0 + (ease(t) - ease(q.s)) * reach(ox, oy) + q.d * (1 - Math.pow(1 - u, 2));
    const ang = q.a + q.drift * u;
    const alpha = Math.pow(1 - u, 0.7);
    ctx.beginPath();
    ctx.arc(ox + r * Math.cos(ang), oy + r * Math.sin(ang), q.size * (1 - 0.55 * u), 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(250,247,243,${0.95 * alpha})`;
    ctx.strokeStyle = `rgba(47,111,159,${0.6 * alpha})`;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }
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
  const overlays = LAYERS.map(([name, fill]) => {
    const el = document.createElement("div");
    el.className = "wave-foam";
    el.style.viewTransitionName = name;
    el.style.background = fill;
    el.setAttribute("aria-hidden", "true");
    return el;
  });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.className = "wave-spray";
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.setAttribute("aria-hidden", "true");
  overlays.push(canvas);
  let frame = 0;
  let timer = 0;
  function cleanup() {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    overlays.forEach((el) => el.remove());
    busy = false;
  }
  timer = setTimeout(cleanup, DURATION + 1500);
  const transition = document.startViewTransition(() => {
    setTheme(next);
    overlays.forEach((el) => root.appendChild(el));
  });
  transition.ready.then(() => {
    const timing = { duration: DURATION, easing: "linear" };
    const wave = root.animate({ clipPath: waveFrames(ox, oy) }, { ...timing, pseudoElement: "::view-transition-new(root)" });
    LAYERS.forEach(([name, fill, edge]) => {
      root.animate({ clipPath: waveFrames(ox, oy, edge) }, { ...timing, pseudoElement: `::view-transition-new(${name})` });
    });
    const ctx = canvas.getContext("2d");
    const list = sprayParticles(ox, oy);
    ctx.scale(dpr, dpr);
    // particle time follows the wave animation so spray stays in sync with the front
    const loop = () => {
      const t = Math.min(1, (Number(wave.currentTime) || 0) / DURATION);
      drawSpray(ctx, list, t, ox, oy);
      if (t < 1) {
        frame = requestAnimationFrame(loop);
      }
    };
    loop();
  }).catch(() => {});
  transition.finished.finally(cleanup).catch(() => {});
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
