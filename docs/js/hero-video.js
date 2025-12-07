document.addEventListener("DOMContentLoaded", function () {
  const placeholder = document.querySelector(".video-placeholder-wrapper");
  const modal = document.getElementById("videoModal");
  const video = document.getElementById("heroVideo");

  // Open popup
  placeholder.addEventListener("click", () => {
    modal.style.display = "flex";
    video.currentTime = 0;
    video.play();
  });

  // Close popup on background click
  modal.querySelector(".video-modal-bg").addEventListener("click", () => {
    modal.style.display = "none";
    video.pause();
  });
});
