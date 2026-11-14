const root = document.documentElement;
const toggle = document.querySelector(".theme-toggle");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

function setTheme(theme) {
  root.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch (e) {}
}

function flip(x, y) {
  let next = "light";
  if (root.dataset.theme === "light") {
    next = "dark";
  }
  if (!document.startViewTransition || reduced.matches) {
    setTheme(next);
    return;
  }
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const transition = document.startViewTransition(() => setTheme(next));
  transition.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 800, easing: "cubic-bezier(.4,0,.2,1)", pseudoElement: "::view-transition-new(root)" }
    );
  });
}

toggle.addEventListener("click", (e) => {
  const box = toggle.getBoundingClientRect();
  // keyboard activation reports 0,0, so fall back to the button centre
  let x = e.clientX;
  let y = e.clientY;
  if (!x && !y) {
    x = box.left + box.width / 2;
    y = box.top + box.height / 2;
  }
  flip(x, y);
});

document.addEventListener("keydown", (e) => {
  const el = e.target;
  const typing = el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  if (e.key.toLowerCase() === "t" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const box = toggle.getBoundingClientRect();
    flip(box.left + box.width / 2, box.top + box.height / 2);
  }
});

const menu = document.querySelector(".menu-btn");
const nav = document.getElementById("nav");
menu.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menu.setAttribute("aria-expanded", String(open));
});
