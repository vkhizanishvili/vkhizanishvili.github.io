// Окно картины на телефоне: одна прокрутка, фото при прокрутке уменьшается
// (картина целиком) до полоски 2 : 1 и остаётся вверху. На широких экранах
// ничего не делает. Обычный скрипт (не модуль) — работает и в копии с диска.
(() => {
  const START_SHARE = 0.55; // фото при открытии — 55 % высоты окна
  const STRIP_RATIO = 2; // полоска: ширина : высота = 2 : 1

  /** Высота фото при открытии и высота полоски для окна заданного размера. */
  function photoSizes(width, height) {
    const start = Math.round(height * START_SHARE);
    const strip = Math.min(Math.round(width / STRIP_RATIO), start);
    return { start, strip };
  }

  /** Видимая высота фото при прокрутке (отскок вверх на iPhone не увеличивает фото). */
  function visiblePhotoHeight(scrollTop, { start, strip }) {
    return Math.max(strip, start - Math.max(0, scrollTop));
  }

  window.PhotoStrip = { photoSizes, visiblePhotoHeight };

  // --- Страница ---------------------------------------------------------------

  const dialog = document.getElementById("lightbox");
  const layout = dialog?.querySelector(".lightbox__layout");
  if (!layout) return;

  const narrow = window.matchMedia("(max-width: 959px)");
  const vars = ["--photo-start", "--photo-strip", "--photo-visible"];
  let sizes = null;

  // Обновляем прямо в обработчике прокрутки: событие и так приходит раз в кадр,
  // а одна CSS-переменная — дёшево (requestAnimationFrame в фоновой вкладке стоит)
  function update() {
    if (sizes) layout.style.setProperty("--photo-visible", `${visiblePhotoHeight(layout.scrollTop, sizes)}px`);
  }

  function measure() {
    if (!narrow.matches || !dialog.open) {
      sizes = null;
      for (const name of vars) layout.style.removeProperty(name);
      return;
    }
    sizes = photoSizes(layout.clientWidth, layout.clientHeight);
    layout.style.setProperty("--photo-start", `${sizes.start}px`);
    layout.style.setProperty("--photo-strip", `${sizes.strip}px`);
    update();
  }

  function toTop() {
    layout.scrollTop = 0;
    measure();
  }

  layout.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", measure);
  narrow.addEventListener?.("change", measure);
  // Новая картина и щелчок по миниатюре — окно сначала, фото большое
  dialog.addEventListener("lightbox:open", toTop);
  dialog.addEventListener("click", (event) => {
    if (event.target.closest(".details__photos a")) toTop();
  });
})();
