// Архив пересыльщика формы для загрузки в Yandex Cloud Functions.
//   npm run contact-function   →   offline/contact-function.zip
// В корне архива: index.js, message.js, package.json (зависимости Яндекс
// установит сам). Как загрузить — docs/contact-form-setup.md.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILES = ["index.js", "message.js", "package.json"];

export async function makeContactFunctionZip(outFile = "offline/contact-function.zip") {
  const entries = {};
  for (const name of FILES) entries[name] = new Uint8Array(await readFile(path.join(root, "cloud", "contact", name)));
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, zipSync(entries));
  return outFile;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Готово: ${await makeContactFunctionZip()}`);
}
