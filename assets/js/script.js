const typedText = document.getElementById("typed-text");
const header = document.querySelector(".site-header");
const navToggle = document.getElementById("nav-toggle");
const navMobile = document.getElementById("nav-mobile");
const mobileLinks = navMobile.querySelectorAll("a");

const typingPhrases = [
  "AI Engineer & DevOps",
  "System Administrator",
  "Microservices Architect"
];

let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;

function typeLoop() {
  const currentPhrase = typingPhrases[phraseIndex];
  const visibleText = currentPhrase.slice(0, charIndex);
  typedText.textContent = visibleText;

  if (!isDeleting && charIndex < currentPhrase.length) {
    charIndex += 1;
    setTimeout(typeLoop, 90);
    return;
  }

  if (isDeleting && charIndex > 0) {
    charIndex -= 1;
    setTimeout(typeLoop, 45);
    return;
  }

  if (!isDeleting) {
    isDeleting = true;
    setTimeout(typeLoop, 1200);
    return;
  }

  isDeleting = false;
  phraseIndex = (phraseIndex + 1) % typingPhrases.length;
  setTimeout(typeLoop, 300);
}

// Simple mobile menu toggle
navToggle.addEventListener("click", () => {
  const isOpen = navMobile.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navMobile.setAttribute("aria-hidden", String(!isOpen));
});

mobileLinks.forEach((link) => {
  link.addEventListener("click", () => {
    navMobile.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
    navMobile.setAttribute("aria-hidden", "true");
  });
});

// Scroll reveal animation
const revealElements = document.querySelectorAll(".reveal");
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("reveal-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);

revealElements.forEach((el) => revealObserver.observe(el));

// Sticky header glass effect
function onScroll() {
  if (window.scrollY > 10) {
    header.classList.add("scrolled");
  } else {
    header.classList.remove("scrolled");
  }
}

window.addEventListener("scroll", onScroll);

// Start typing after initial paint
window.addEventListener("load", () => {
  if (typedText) {
    typeLoop();
  }
});
