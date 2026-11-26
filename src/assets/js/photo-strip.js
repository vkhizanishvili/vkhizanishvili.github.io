// Окно картины на телефоне: одна прокрутка, фото при прокрутке уменьшается
// (картина целиком) до полоски 2 : 1 и остаётся вверху. На широких экранах
// ничего не делает. Обычный скрипт (не модуль) — работает и в копии с диска.
//
// Само уменьшение делает браузер: CSS-анимация, привязанная к прокрутке
// (animation-timeline), масштабирует рамку с картиной от её нижнего края.
// Браузер пересчитывает её в том же кадре, что и прокрутку, — без рывков.
// Скрипт только меряет окно. Для браузеров без такой анимации — запасной
// вариант: масштаб по событиям прокрутки.
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

  /** Во сколько раз уменьшено фото, когда оно стало полоской. */
  function minPhotoScale({ start, strip }) {
    return strip / start;
  }

  /** Масштаб фото при данной прокрутке (для браузеров без анимации по прокрутке). */
  function photoScaleAt(scrollTop, sizes) {
    return visiblePhotoHeight(scrollTop, sizes) / sizes.start;
  }

  window.PhotoStrip = { photoSizes, visiblePhotoHeight, minPhotoScale, photoScaleAt };

  // --- Страница ---------------------------------------------------------------

  const dialog = document.getElementById("lightbox");
  const layout = dialog?.querySelector(".lightbox__layout");
  if (!layout) return;

  const narrow = window.matchMedia("(max-width: 959px)");
  // Есть анимация по прокрутке — скрипту на прокрутку реагировать не нужно
  const scrollTimelines = Boolean(window.CSS?.supports?.("animation-timeline: scroll()"));
  const vars = ["--photo-start", "--photo-strip", "--photo-scale-min", "--photo-k"];
  let sizes = null;

  function update() {
    if (sizes && !scrollTimelines) layout.style.setProperty("--photo-k", String(photoScaleAt(layout.scrollTop, sizes)));
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
    layout.style.setProperty("--photo-scale-min", String(minPhotoScale(sizes)));
    update();
  }

  function toTop() {
    layout.scrollTop = 0;
    measure();
  }

  if (!scrollTimelines) layout.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", measure);
  narrow.addEventListener?.("change", measure);
  // Новая картина и щелчок по миниатюре — окно сначала, фото большое
  dialog.addEventListener("lightbox:open", toTop);
  dialog.addEventListener("click", (event) => {
    if (event.target.closest(".details__photos a")) toTop();
  });
})();
