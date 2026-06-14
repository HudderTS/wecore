(function () {
  "use strict";

  function getTrack(slider) {
    return slider.querySelector(".hd-snap-track, .home_reviews_mask");
  }

  function step(track, direction) {
    const slide = track.querySelector(".hd-snap-slide, .home_reviews_slide");
    const distance = slide ? slide.getBoundingClientRect().width : track.clientWidth;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: distance * direction, behavior: reduceMotion ? "auto" : "smooth" });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-hd-slider-prev], [data-hd-slider-next]").forEach(function (button) {
      const slider = button.closest(".hd-snap-slider, .home_reviews_slider");
      const track = slider && getTrack(slider);
      if (!track) return;

      button.addEventListener("click", function () {
        step(track, button.hasAttribute("data-hd-slider-prev") ? -1 : 1);
      });
    });
  });
})();
