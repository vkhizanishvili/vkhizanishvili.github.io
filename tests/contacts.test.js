import { test } from "node:test";
import assert from "node:assert/strict";
import { contactsList, handle } from "../src/_lib/contacts.js";

test("handle strips @, protocol and domain prefixes", () => {
  assert.equal(handle("@artist", "t.me"), "artist");
  assert.equal(handle("https://t.me/artist", "t.me"), "artist");
  assert.equal(handle("https://www.instagram.com/artist/", "instagram.com"), "artist");
  assert.equal(handle("vk.com/artist", "vk.com"), "artist");
  assert.equal(handle("  artist  ", "vk.com"), "artist");
  assert.equal(handle("", "vk.com"), "");
  assert.equal(handle(undefined, "vk.com"), "");
});

test("contactsList skips empty contacts", () => {
  assert.deepEqual(contactsList({ email: "", phone: "  " }), []);
  assert.deepEqual(contactsList(undefined), []);
});

test("contactsList builds links for every filled contact in a fixed order", () => {
  const list = contactsList({
    city: "Москва",
    vk: "artist_vk",
    instagram: "@artist_ig",
    whatsapp: "+7 (900) 123-45-67",
    telegram: "@artist_tg",
    phone: "+7 (900) 123-45-67",
    email: "hello@example.com",
  });
  assert.deepEqual(
    list.map((c) => [c.label, c.text, c.href]),
    [
      ["Почта", "hello@example.com", "mailto:hello@example.com"],
      ["Телефон", "+7 (900) 123-45-67", "tel:+79001234567"],
      ["Telegram", "@artist_tg", "https://t.me/artist_tg"],
      ["WhatsApp", "+7 (900) 123-45-67", "https://wa.me/79001234567"],
      ["Instagram*", "@artist_ig", "https://instagram.com/artist_ig"],
      ["ВКонтакте", "artist_vk", "https://vk.com/artist_vk"],
      ["Город", "Москва", null],
    ],
  );
});

test("contactsList marks Instagram as requiring the Meta disclaimer", () => {
  const [ig] = contactsList({ instagram: "x" });
  assert.equal(ig.metaNote, true);
  const [mail] = contactsList({ email: "a@b.c" });
  assert.equal(mail.metaNote, false);
});

test("phone in 8XXX format becomes +7 for links", () => {
  const [phone, wa] = contactsList({ phone: "8 900 123-45-67", whatsapp: "8 900 123-45-67" });
  assert.equal(phone.href, "tel:+79001234567");
  assert.equal(wa.href, "https://wa.me/79001234567");
});
