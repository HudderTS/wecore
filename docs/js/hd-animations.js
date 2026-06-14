/* ==========================================================================
   hd-animations.js — WECORE entrance animations (task W3.2)
   --------------------------------------------------------------------------
   Replaces the Webflow IX2 "Fade Up" SCROLL_INTO_VIEW entrance interactions
   (the 500+ KB webflow.schunk runtime) with a ~1 KB IntersectionObserver.

   Every element marked [data-hd-animate] starts hidden (opacity:0 — applied by
   hd.css §15, gated on the .hd-js flag set in <head> so visitors WITHOUT JS see
   the content rather than a blank page) and fades up once, when it scrolls into
   view. Single-shot: each element is unobserved after it fires, matching IX2's
   SCROLL_INTO_VIEW (plays on enter, never reverses). The +300ms "Fade Up 2nd"
   stagger and prefers-reduced-motion live entirely in CSS (hd.css §15); this
   file only toggles the .hd-in trigger class. No Webflow, no jQuery, no CDN.

   Opt-out of the scroll gate with [data-hd-animate-eager]: hero / above-the-fold
   content that must reveal on LOAD (it still fades up), so a tall mobile hero
   can't strand a centerpiece a few px below the fold at opacity:0 forever.
   ========================================================================== */
(function () {
  "use strict";

  var nodes = document.querySelectorAll("[data-hd-animate]");
  if (!nodes.length) return;

  // Legacy browsers without IntersectionObserver: reveal everything at once.
  if (!("IntersectionObserver" in window)) {
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.add("hd-in");
    return;
  }

  // Single callback shared by both observers below: reveal once, then stop.
  function reveal(entries, obs) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("hd-in");
        obs.unobserve(entry.target);
      }
    });
  }

  // threshold 0.1 ≈ IX2's SCROLL_INTO_VIEW; the -40px bottom margin holds the
  // reveal until the element is a little inside the viewport.
  var observer = new IntersectionObserver(reveal, {
    threshold: 0.1,
    rootMargin: "0px 0px -40px 0px",
  });

  // Elements TALLER than the viewport (e.g. a long article body) can never get
  // 10% of their area on screen, so they'd never cross the 0.1 threshold and
  // would stay stranded at opacity:0. Reveal those as soon as any part enters.
  var tallObserver = new IntersectionObserver(reveal, {
    threshold: 0,
    rootMargin: "0px 0px -40px 0px",
  });

  // [data-hd-animate-eager] = above-the-fold / hero content that must reveal on
  // LOAD, never gated on scroll. The scroll observer only fires once an element
  // enters the viewport; a tall mobile hero can push a centerpiece a few px below
  // the fold, where it would never intersect and would stay stuck at opacity:0.
  // Eager elements still play the same fade-up entrance (the .hd-in rule animates
  // them, stagger included) — they just don't wait for an intersection. Everything
  // else keeps the scroll-into-view behavior.
  var viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  nodes.forEach(function (el) {
    var rect = el.getBoundingClientRect();
    var startsInViewport = rect.top < viewportHeight && rect.bottom > 0;

    if (el.hasAttribute("data-hd-animate-eager") || startsInViewport) {
      el.classList.add("hd-in");
    } else if (rect.height >= viewportHeight) {
      // Taller than the viewport: 10% can never be on screen, so use the
      // threshold-0 observer that fires on first contact instead.
      tallObserver.observe(el);
    } else {
      observer.observe(el);
    }
  });
})();
