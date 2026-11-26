// Форма обратной связи: в окне картины («Связаться с автором», data-mode="popup")
// и на странице «Об авторе» («Написать мне», data-mode="inline").
// Отправляет сообщение функции в Яндекс Облаке; если не вышло за три попытки —
// предлагает отправить его со своей почты. Обычный скрипт (не модуль), чтобы
// работать и в копии сайта, открытой с диска.
(() => {
  const DELAYS = [1000, 2000]; // паузы между попытками
  const TIMEOUT_MS = 6000; // сколько ждать каждую попытку
  // Функция считает ботом отправку быстрее 3000 мс после раскрытия формы и молча
  // её отбрасывает. Имя и контакт сохраняются между картинами, текст заполнен —
  // человек может нажать «Отправить» сразу, поэтому форма сама выжидает остаток.
  const MIN_FILL_MS = 3200;

  /** Сколько ещё подождать перед отправкой, чтобы не попасть под порог функции. */
  function waitBeforeSend(openedAt, now, minMs = MIN_FILL_MS) {
    return Math.max(0, minMs - (now - openedAt));
  }

  /** Половинка эмодзи (после обрезки по maxlength) ломает encodeURIComponent — заменяем её на «�». */
  function wellFormed(value) {
    const text = String(value ?? "");
    return typeof text.toWellFormed === "function"
      ? text.toWellFormed()
      : text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
  }

  /** Имена пустых обязательных полей. */
  function validate({ name, contact, message }) {
    const missing = [];
    if (!String(name ?? "").trim()) missing.push("name");
    if (!String(contact ?? "").trim()) missing.push("contact");
    if (!String(message ?? "").trim()) missing.push("message");
    return missing;
  }

  function letterBody({ name, contact, message, link, painting }) {
    const linkLine = link ? [`${painting ? "Картина" : "Страница"}: ${link}`] : [];
    const lines = [message || "", "", `Имя: ${name}`, `Контакт: ${contact}`, ...linkLine];
    return wellFormed(lines.join("\r\n"));
  }

  /** Ссылка «написать письмо» с адресом, темой и текстом. */
  function buildMailto({ user, domain, painting, name, contact, message, link }) {
    const subject = wellFormed(painting ? `Картина «${painting}»` : "Сообщение с сайта");
    const body = letterBody({ name, contact, message, link, painting });
    return `mailto:${user}@${domain}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  /** Одна попытка: успех только при ответе 2xx с JSON { ok: true }. */
  async function attemptSend(fetchFn, endpoint, payload, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // text/plain — «простой» запрос, без предварительного запроса CORS
      const res = await fetchFn(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) return false;
      const data = await res.json();
      return data?.ok === true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** До delays.length + 1 попыток с паузами между ними. */
  async function sendWithRetry(attempt, { delays = DELAYS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    for (let i = 0; ; i++) {
      if (await attempt()) return true;
      if (i >= delays.length) return false;
      await sleep(delays[i]);
    }
  }

  /** Ссылка для письма: с картиной — на её окно (#w-…), без картины — адрес страницы. */
  function pageLink({ origin, pathname }, paintingId) {
    return `${origin}${pathname}${paintingId ? `#w-${paintingId}` : ""}`;
  }

  window.ContactForm = { MIN_FILL_MS, waitBeforeSend, validate, buildMailto, attemptSend, sendWithRetry, pageLink };

  // --- Страница ---------------------------------------------------------------

  /** Оживляет один блок формы. Блоки независимы: у каждого свои поля, состояние и отсчёт времени. */
  function setupContactForm(root) {
    const inline = root.dataset.mode === "inline";
    const dialog = inline ? null : root.closest("dialog");
    if (!inline && !dialog) return;

    const form = root.querySelector(".contact__form");
    const openButton = root.querySelector('[data-action="contact"]');
    const submitButton = form.querySelector('button[type="submit"]');
    const doneEl = root.querySelector(".contact__done");
    const fallbackEl = root.querySelector(".contact__fallback");
    const mailLink = root.querySelector(".contact__mail");
    const copyButton = root.querySelector(".contact__copy");
    const addressEl = root.querySelector(".contact__address");
    const previewEl = root.querySelector(".contact__preview");
    const field = (name) => form.elements.namedItem(name);
    const { endpoint, mailUser, mailDomain } = root.dataset;
    const isPreview = "preview" in root.dataset;

    let painting = { id: "", title: "" };
    let token = 0; // растёт при каждом открытии окна: ответы старых отправок не трогают новую картину
    let openedAt = Date.now();
    let copyText = "";

    function setSending(on) {
      submitButton.disabled = on;
      submitButton.textContent = on ? "Отправляем…" : "Отправить";
    }

    function showHints(missing) {
      for (const hint of form.querySelectorAll(".contact__hint")) {
        const bad = missing.includes(hint.dataset.for);
        hint.hidden = !bad;
        field(hint.dataset.for).closest(".contact__field").classList.toggle("is-invalid", bad);
      }
    }

    if (inline) {
      // Форма на странице открыта сразу. Отсчёт для защиты от ботов — с первого касания формы;
      // если её не касались (автозаполнение), — с загрузки страницы. Минимум форма всё равно выждет сама.
      root.hidden = false;
      let touched = false;
      form.addEventListener("focusin", () => {
        if (touched) return;
        touched = true;
        openedAt = Date.now();
      });
    } else {
      // Новая картина: форма свёрнута, заготовка с её названием; имя и контакт остаются
      dialog.addEventListener("lightbox:open", (event) => {
        token += 1;
        painting = { id: event.detail?.id ?? "", title: event.detail?.title ?? "" };
        root.hidden = false;
        openButton.hidden = false;
        form.hidden = true;
        doneEl.hidden = true;
        fallbackEl.hidden = true;
        previewEl.hidden = true;
        showHints([]);
        setSending(false);
        field("website").value = "";
        field("message").value = painting.title ? `Здравствуйте! Меня интересует картина «${painting.title}».` : "";
      });

      openButton.addEventListener("click", () => {
        openButton.hidden = true;
        form.hidden = false;
        openedAt = Date.now();
        form.scrollIntoView({ block: "start" });
        field("name").focus({ preventScroll: true });
      });
    }

    // Результат появляется под формой — на телефоне он может оказаться за краем экрана
    function reveal(element) {
      element.hidden = false;
      // Без плавности: анимация прокрутки может не успеть или не начаться (фоновая вкладка и т. п.)
      element.scrollIntoView({ block: "nearest" });
    }

    function showFallback(values) {
      addressEl.textContent = `${mailUser}@${mailDomain}`;
      mailLink.href = buildMailto({ user: mailUser, domain: mailDomain, ...values });
      copyText = letterBody(values);
      copyButton.textContent = "Скопировать текст";
      reveal(fallbackEl);
    }

    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copyText);
        copyButton.textContent = "Скопировано";
      } catch {
        field("message").select(); // хотя бы выделить текст сообщения
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitButton.disabled) return;
      const values = {
        name: field("name").value.trim(),
        contact: field("contact").value.trim(),
        message: field("message").value.trim(),
      };
      const missing = validate(values);
      showHints(missing);
      if (missing.length) {
        field(missing[0]).focus();
        return;
      }
      fallbackEl.hidden = true;
      previewEl.hidden = true;
      if (isPreview) {
        reveal(previewEl);
        return;
      }

      const myToken = token;
      const details = { ...values, painting: painting.title, link: pageLink(location, painting.id) };
      setSending(true);
      await new Promise((resolve) => setTimeout(resolve, waitBeforeSend(openedAt, Date.now())));
      if (myToken !== token) return; // пока ждали, окно переключили на другую картину
      const payload = { ...details, website: field("website").value, elapsed: Date.now() - openedAt };
      const ok = await sendWithRetry(() => attemptSend(fetch, endpoint, payload, TIMEOUT_MS));
      if (myToken !== token) return; // окно уже показывает другую картину
      setSending(false);
      if (ok) {
        form.hidden = true;
        reveal(doneEl);
      } else {
        showFallback(details);
      }
    });
  }

  document.querySelectorAll(".contact").forEach(setupContactForm);
})();
