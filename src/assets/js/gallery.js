// Галерея: фильтр по сериям и крупный просмотр картины.
// Без JavaScript сайт тоже работает: карточка открывает большое фото.
(() => {
  const grid = document.getElementById("gallery");
  if (!grid) return;

  const cards = [...grid.querySelectorAll(".card")];
  const filtersEl = document.querySelector(".filters");
  const seriesDescs = [...document.querySelectorAll(".series-desc")];
  let currentSeries = "all";

  // --- Фильтр по сериям ----------------------------------------------------

  function filterHash() {
    return currentSeries === "all" ? "" : `#series-${currentSeries}`;
  }

  function setHash(hash) {
    history.replaceState(null, "", hash || location.pathname + location.search);
  }

  function applyFilter(seriesId, { updateHash = true } = {}) {
    currentSeries = cards.some((c) => c.dataset.series === seriesId) ? seriesId : "all";
    for (const card of cards) {
      card.hidden = currentSeries !== "all" && card.dataset.series !== currentSeries;
    }
    filtersEl?.querySelectorAll(".filter").forEach((button) => {
      const active = button.dataset.filter === currentSeries;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    for (const desc of seriesDescs) desc.hidden = desc.dataset.seriesDesc !== currentSeries;
    if (updateHash) setHash(filterHash());
  }

  if (filtersEl) {
    filtersEl.hidden = false;
    filtersEl.addEventListener("click", (event) => {
      const button = event.target.closest(".filter");
      if (button) applyFilter(button.dataset.filter);
    });
  }

  // --- Крупный просмотр ----------------------------------------------------

  const dialog = document.getElementById("lightbox");
  const canUseDialog = dialog && typeof dialog.showModal === "function";
  let openCard = null;
  let closeLightbox = () => {};

  if (canUseDialog) {
    const $ = (selector) => dialog.querySelector(selector);
    const img = $(".lightbox__img");
    const titleEl = $(".lightbox__title");
    const metaEl = $(".lightbox__meta");
    const priceEl = $(".lightbox__price");
    const detailsEl = $(".lightbox__details");
    const actionsEl = $(".lightbox__actions");

    let currentCard = null;
    let photoLinks = [];

    img.addEventListener("load", () => img.classList.remove("is-loading"));

    function showPhoto(index) {
      const link = photoLinks[index];
      if (!link) return;
      const thumb = link.querySelector("img");
      img.classList.add("is-loading");
      img.srcset = thumb.srcset;
      img.sizes = "(min-width: 960px) calc(100vw - 380px), 100vw";
      img.src = link.href;
      img.width = thumb.width;
      img.height = thumb.height;
      img.alt = thumb.alt;
      if (img.complete) img.classList.remove("is-loading");
      photoLinks.forEach((a, i) => a.classList.toggle("is-active", i === index));
    }

    function open(card) {
      currentCard = card;
      titleEl.textContent = card.querySelector(".card__title")?.textContent ?? "";
      const meta = card.querySelector(".card__meta")?.textContent ?? "";
      metaEl.textContent = meta;
      metaEl.hidden = !meta;
      priceEl.replaceChildren(
        ...[...card.querySelector(".card__price").childNodes].map((n) => n.cloneNode(true)),
      );

      const details = card.querySelector("template.card__details").content.cloneNode(true);
      detailsEl.replaceChildren(details);
      photoLinks = [...detailsEl.querySelectorAll(".details__photos a")];

      const order = card.querySelector(".btn-order");
      actionsEl.replaceChildren(...(order ? [order.cloneNode(true)] : []));

      showPhoto(0);
      if (!dialog.open) dialog.showModal();
      setHash(`#w-${card.dataset.id}`);
      // Для формы «Связаться с автором» (contact-form.js)
      dialog.dispatchEvent(new CustomEvent("lightbox:open", { detail: { id: card.dataset.id, title: card.dataset.title } }));
    }

    function close() {
      if (dialog.open) dialog.close();
    }

    dialog.addEventListener("close", () => {
      setHash(filterHash());
      currentCard?.querySelector(".card__image")?.focus({ preventScroll: true });
      currentCard = null;
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) return close();
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action === "close") return close();
      const thumb = event.target.closest(".details__photos a");
      if (thumb) {
        event.preventDefault();
        showPhoto(photoLinks.indexOf(thumb));
      }
    });

    grid.addEventListener("click", (event) => {
      const link = event.target.closest(".card__image");
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      open(link.closest(".card"));
    });

    openCard = open;
    closeLightbox = close;
  }

  // --- Ссылки: #series-<id> — серия, #w-<id> — конкретная картина ----------

  function handleHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash.startsWith("series-")) {
      closeLightbox();
      applyFilter(hash.slice("series-".length), { updateHash: false });
    } else if (hash.startsWith("w-") && openCard) {
      const card = cards.find((c) => c.id === hash);
      if (!card) return;
      if (card.hidden) applyFilter("all", { updateHash: false });
      openCard(card);
    } else if (!hash) {
      closeLightbox();
      applyFilter("all", { updateHash: false });
    }
  }

  handleHash();
  window.addEventListener("hashchange", handleHash);
})();
