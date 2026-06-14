document.addEventListener("DOMContentLoaded", function () {
  const trigger = document.querySelector(".video-placeholder-wrapper");
  const modal = document.getElementById("videoModal");
  const video = document.getElementById("heroVideo");

  if (!trigger || !modal || !video) return;

  const closeButton = modal.querySelector(".video-modal-close");
  const backdrop = modal.querySelector(".video-modal-bg");
  const content = modal.querySelector(".video-modal-content");
  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "video[controls]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  function focusableItems() {
    return Array.from(modal.querySelectorAll(focusableSelector))
      .filter((element) => element.offsetWidth > 0 || element.offsetHeight > 0);
  }

  function openModal() {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    video.currentTime = 0;
    video.play().catch(function () {});
    (closeButton || video).focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    video.pause();
    trigger.focus();
  }

  function trapFocus(event) {
    if (event.key !== "Tab" || modal.hidden) return;
    const items = focusableItems();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  trigger.addEventListener("click", openModal);
  if (closeButton) closeButton.addEventListener("click", closeModal);
  if (backdrop) backdrop.addEventListener("click", closeModal);
  // Tap/click anywhere outside the video content closes the modal. Listening on
  // the modal overlay (not just the thin backdrop layer) catches the flex
  // padding around the content too, so "empty space" taps on mobile work.
  modal.addEventListener("click", function (event) {
    if (content && !content.contains(event.target)) closeModal();
  });
  modal.addEventListener("keydown", trapFocus);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });
});
