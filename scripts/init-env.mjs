import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
const destination = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(destination)) {
  console.log("O arquivo .env já existe e foi preservado.");
} else {
  const password = randomBytes(24).toString("hex");
  const secret = randomBytes(48).toString("hex");
  const example = readFileSync(
    new URL("../.env.example", import.meta.url),
    "utf8",
  );
  const content = example
    .replaceAll("troque-esta-senha-local", password)
    .replace(
      "substitua-por-uma-chave-aleatoria-de-pelo-menos-32-caracteres",
      secret,
    );
  writeFileSync(destination, content, { flag: "wx", mode: 0o600 });
  console.log(
    ".env criado com credenciais locais aleatórias. Os valores não são exibidos no terminal.",
  );
}
