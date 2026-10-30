import { ServiceError } from "@/server/errors";

export const MAX_XML_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_XML_BYTES + 128 * 1024;
const MAX_JSON_BYTES = 1024 * 1024;

export function assertSameOrigin(request: Request) {
  const allowed = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
  if (process.env.BETTER_AUTH_URL)
    allowed.add(new URL(process.env.BETTER_AUTH_URL).origin);
  const origin = request.headers.get("origin");
  if (
    !origin ||
    !allowed.has(origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new ServiceError(
      403,
      "Origem da solicitação não permitida. Atualize a página e tente novamente.",
    );
  }
}

export async function readLimitedBody(
  request: Request,
  maximum: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const rawLength = request.headers.get("content-length");
  if (rawLength && (!/^\d+$/.test(rawLength) || Number(rawLength) > maximum)) {
    throw new ServiceError(
      413,
      "O arquivo ou formulário excede o limite permitido.",
    );
  }
  if (!request.body)
    throw new ServiceError(400, "Envie os dados da solicitação.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 30000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new ServiceError(408, "Tempo limite de envio excedido.");
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel();
        throw new ServiceError(
          413,
          "O arquivo ou formulário excede o limite permitido.",
        );
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJson(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new ServiceError(415, "Envie um formulário JSON válido.");
  }
  const bytes = await readLimitedBody(request, MAX_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ServiceError(400, "O formulário contém JSON inválido.");
  }
}

export async function readJUnitUpload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data"))
    throw new ServiceError(415, "Selecione um arquivo XML para importar.");
  const bytes = await readLimitedBody(request, MAX_MULTIPART_BYTES);
  let form: FormData;
  try {
    form = await new Response(bytes, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new ServiceError(400, "Não foi possível ler o formulário enviado.");
  }
  const file = form.get("file");
  if (!(file instanceof File))
    throw new ServiceError(400, "Selecione um arquivo XML para importar.");
  if (file.size > MAX_XML_BYTES)
    throw new ServiceError(413, "O arquivo XML deve ter no máximo 5 MB.");
  if (!file.name.toLowerCase().endsWith(".xml"))
    throw new ServiceError(400, "Selecione um arquivo com extensão .xml.");
  const name = form.get("name");
  if (name !== null && (typeof name !== "string" || name.length > 200))
    throw new ServiceError(400, "O nome do ciclo deve ter até 200 caracteres.");
  return {
    input: Buffer.from(await file.arrayBuffer()),
    name: typeof name === "string" ? name : undefined,
  };
}
