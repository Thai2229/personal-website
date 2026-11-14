const root = document.documentElement;
const toggle = document.querySelector(".theme-toggle");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

function setTheme(theme) {
  root.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch (e) {}
}

const FOAM = 30;
// full = capable desktop, lite = weak/touch devices (fewer layers, vertices, droplets; shorter)
const PROFILES = {
  full: { frames: 48, points: 128, spray: 100, dpr: 1.5, duration: 1500, layers: 2 },
  lite: { frames: 40, points: 64, spray: 0, dpr: 1, duration: 1100, layers: 1 }
};
const coarse = window.matchMedia("(pointer: coarse)");
let busy = false;
let slow = false;
let strikes = 0;
let cache = null;

function pick() {
  if (navigator.hardwareConcurrency <= 4 || navigator.deviceMemory <= 4 || coarse.matches || slow) {
    return PROFILES.lite;
  }
  return PROFILES.full;
}

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
function ringPoints(progress, off, ox, oy, POINTS) {
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

// foam fingers shooting out past the crests: spiky 24/32 lobes, longest mid-run, gone at the end
function lead(t, a) {
  const roll = t * 2 * Math.PI;
  const sharp = 0.6 * Math.pow(1 - Math.abs(Math.sin(12 * a + roll * 2)), 3) + 0.5 * Math.pow(1 - Math.abs(Math.sin(16 * a - roll * 3)), 3);
  return 0.15 * Math.min(innerWidth, innerHeight) * Math.sin(Math.PI * t) * (0.05 + sharp);
}

// [name, fill, (t, a) => [outer, inner] offsets from the front]; foam band and lead fingers share one layer
const LAYERS = [
  ["foam", "rgba(250,247,243,.85)", (t, a) => [jitter(t, a) + lead(t, a), -width(t)]],
  ["wet", "rgba(47,111,159,.6)", (t, a) => [jitter(t, a) + lead(t, a) + envelope(t), jitter(t, a) + lead(t, a) - 2.5 * envelope(t)]]
];

function waveFrames(ox, oy, p, edge) {
  const frames = [];
  for (let i = 0; i <= p.frames; i++) {
    const t = i / p.frames;
    const e = ease(t);
    if (edge) {
      const outer = ringPoints(e, (a) => edge(t, a)[0], ox, oy, p.points);
      const inner = ringPoints(e, (a) => edge(t, a)[1], ox, oy, p.points).reverse();
      frames.push(`polygon(evenodd,${outer.concat(inner).join(",")})`);
    } else {
      frames.push(`polygon(${ringPoints(e, null, ox, oy, p.points).join(",")})`);
    }
  }
  return frames;
}

// droplets launched from the crest points, flying outward ahead of the front
function sprayParticles(ox, oy, p) {
  const list = [];
  for (let i = 0; i < p.spray; i++) {
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
    list.push({ s, a, r0, life: 0.25 + 0.3 * Math.random(), drift: (Math.random() - 0.5) * 0.16, d: 20 + 220 * Math.pow(Math.random(), 1.3), size: 1.5 + 4.5 * Math.pow(Math.random(), 1.5) });
  }
  return list;
}

function drawSpray(ctx, list, t, ox, oy) {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const run = reach(ox, oy);
  const et = ease(t);
  ctx.fillStyle = "rgb(250,247,243)";
  ctx.strokeStyle = "rgb(47,111,159)";
  ctx.lineWidth = 1;
  for (const q of list) {
    const u = (t - q.s) / q.life;
    if (u < 0 || u > 1) {
      continue;
    }
    const r = q.r0 + (et - ease(q.s)) * run + q.d * (1 - Math.pow(1 - u, 2));
    const ang = q.a + q.drift * u;
    const alpha = Math.pow(1 - u, 0.7);
    ctx.beginPath();
    ctx.arc(ox + r * Math.cos(ang), oy + r * Math.sin(ang), q.size * (1 - 0.55 * u), 0, 2 * Math.PI);
    ctx.globalAlpha = 0.95 * alpha;
    ctx.fill();
    ctx.globalAlpha = 0.6 * alpha;
    ctx.stroke();
  }
}

function origin() {
  const box = toggle.getBoundingClientRect();
  return [box.left + box.width / 2, box.top + box.height / 2];
}

// all keyframes + droplets for one viewport/toggle position/profile
function cacheKey(ox, oy, p) {
  return [innerWidth, innerHeight, ox, oy, p.frames, p.points].join();
}

function build(ox, oy, p) {
  return {
    key: cacheKey(ox, oy, p),
    root: waveFrames(ox, oy, p),
    layers: LAYERS.slice(0, p.layers).map(([, , edge]) => waveFrames(ox, oy, p, edge)),
    list: sprayParticles(ox, oy, p)
  };
}

function warm() {
  if (busy) {
    return;
  }
  const [ox, oy] = origin();
  const p = pick();
  if (cache && cache.key === cacheKey(ox, oy, p)) {
    return;
  }
  cache = build(ox, oy, p);
}

// keep the click path free of keyframe maths: build when idle, rebuild after resizes
function later() {
  if (!document.startViewTransition || reduced.matches) {
    return;
  }
  if (window.requestIdleCallback) {
    requestIdleCallback(warm, { timeout: 2000 });
    return;
  }
  setTimeout(warm, 200);
}

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(later, 250);
});
window.addEventListener("load", later);

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
  const [ox, oy] = origin();
  const p = pick();
  let data = cache;
  if (!data || data.key !== cacheKey(ox, oy, p)) {
    data = build(ox, oy, p);
    cache = data;
  }
  const t1 = performance.now();
  const overlays = LAYERS.slice(0, p.layers).map(([name, fill]) => {
    const el = document.createElement("div");
    el.className = "wave-foam";
    el.style.viewTransitionName = name;
    el.style.background = fill;
    el.setAttribute("aria-hidden", "true");
    return el;
  });
  const canvas = document.createElement("canvas");
  if (p.spray) {
    const dpr = Math.min(window.devicePixelRatio || 1, p.dpr);
    canvas.className = "wave-spray";
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    canvas.setAttribute("aria-hidden", "true");
    canvas.getContext("2d").scale(dpr, dpr);
    overlays.push(canvas);
  }
  let frame = 0;
  let timer = 0;
  function cleanup() {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    overlays.forEach((el) => el.remove());
    busy = false;
    later();
  }
  const transition = document.startViewTransition(() => {
    setTheme(next);
    overlays.forEach((el) => root.appendChild(el));
  });
  transition.ready.then(() => {
    // two slow first frames in a row mean a weak device: use the lite profile from then on
    if (performance.now() - t1 > 400 && p !== PROFILES.lite) {
      strikes += 1;
    }
    if (strikes >= 2) {
      slow = true;
    }
    const timing = { duration: p.duration, easing: "linear" };
    const wave = root.animate({ clipPath: data.root }, { ...timing, pseudoElement: "::view-transition-new(root)" });
    LAYERS.slice(0, p.layers).forEach(([name], i) => {
      root.animate({ clipPath: data.layers[i] }, { ...timing, pseudoElement: `::view-transition-new(${name})` });
    });
    // stall guard starts with the animation, not at the click
    timer = setTimeout(cleanup, p.duration + 1500);
    if (!p.spray) {
      return;
    }
    const ctx = canvas.getContext("2d");
    let last = -1;
    // particle time follows the wave animation so spray stays in sync with the front
    const loop = () => {
      const t = Math.min(1, (Number(wave.currentTime) || 0) / p.duration);
      if (t !== last) {
        last = t;
        drawSpray(ctx, data.list, t, ox, oy);
      }
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
