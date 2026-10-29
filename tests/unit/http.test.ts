import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSameOrigin,
  MAX_XML_BYTES,
  readJson,
  readJUnitUpload,
} from "../../src/server/http";

const url = "http://localhost:3000/api/data/projects";
const jsonRequest = (body: string, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
const uploadRequest = (form: FormData) =>
  new Request(url, { method: "POST", body: form });
const xmlForm = (
  contents = '<testsuite><testcase name="Login"/></testsuite>',
  fileName = "results.xml",
) => {
  const form = new FormData();
  form.set("file", new File([contents], fileName, { type: "application/xml" }));
  return form;
};

afterEach(() => vi.unstubAllEnvs());

describe("origem das operações de escrita", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1:3000"])(
    "aceita a origem local %s",
    (origin) => {
      expect(() =>
        assertSameOrigin(
          new Request(url, {
            headers: { origin, "sec-fetch-site": "same-origin" },
          }),
        ),
      ).not.toThrow();
    },
  );

  it("aceita a origem explícita da configuração de autenticação", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");
    expect(() =>
      assertSameOrigin(
        new Request(url, { headers: { origin: "http://localhost:3100" } }),
      ),
    ).not.toThrow();
  });

  it.each([
    undefined,
    "https://external.example",
    "null",
    "http://localhost:3000.attacker.test",
  ])("recusa origem ausente ou externa: %s", (origin) => {
    const request = new Request(url, { headers: origin ? { origin } : {} });
    expect(() => assertSameOrigin(request)).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("recusa solicitação identificada pelo navegador como cross-site", () => {
    expect(() =>
      assertSameOrigin(
        new Request(url, {
          headers: {
            origin: "http://localhost:3000",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
});

describe("leitura limitada dos formulários JSON", () => {
  it("lê JSON válido com charset sem alterar os dados", async () => {
    await expect(
      readJson(
        jsonRequest('{"name":"Projeto São Paulo"}', {
          "content-type": "application/json; charset=utf-8",
        }),
      ),
    ).resolves.toEqual({ name: "Projeto São Paulo" });
  });

  it("retorna erro 400 para JSON malformado e corpo ausente", async () => {
    await expect(readJson(jsonRequest('{"name":'))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      readJson(
        new Request(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("recusa Content-Type incorreto e bytes UTF-8 inválidos", async () => {
    await expect(
      readJson(new Request(url, { method: "POST", body: "{}" })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      readJson(
        new Request(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: new Uint8Array([0xff]),
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("aplica limite no Content-Length antes de tentar interpretar o JSON", async () => {
    await expect(
      readJson(
        jsonRequest("{}", { "content-length": String(1024 * 1024 + 1) }),
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readJson(jsonRequest("{}", { "content-length": "invalid" })),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("interrompe o stream acima do limite mesmo sem Content-Length", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(600 * 1024));
      },
      cancel() {
        canceled = true;
      },
    });
    const request = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(readJson(request)).rejects.toMatchObject({ status: 413 });
    expect(canceled).toBe(true);
  });
});

describe("upload JUnit XML", () => {
  it("lê arquivo e nome do ciclo do multipart", async () => {
    const contents = '<testsuite><testcase name="Login"/></testsuite>';
    const form = xmlForm(contents, "RESULTS.XML");
    form.set("name", "Regressão de outubro");
    const result = await readJUnitUpload(uploadRequest(form));
    expect(result.input.toString("utf8")).toBe(contents);
    expect(result.name).toBe("Regressão de outubro");
  });

  it("recusa formulários sem arquivo ou arquivo enviado como texto", async () => {
    await expect(
      readJUnitUpload(uploadRequest(new FormData())),
    ).rejects.toMatchObject({ status: 400 });
    const form = new FormData();
    form.set("file", "results.xml");
    await expect(readJUnitUpload(uploadRequest(form))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("recusa extensão incorreta, nome de ciclo excessivo e multipart inválido", async () => {
    await expect(
      readJUnitUpload(uploadRequest(xmlForm("<testsuite/>", "script.js"))),
    ).rejects.toMatchObject({ status: 400 });
    const form = xmlForm();
    form.set("name", "a".repeat(201));
    await expect(readJUnitUpload(uploadRequest(form))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      readJUnitUpload(
        new Request(url, {
          method: "POST",
          headers: { "content-type": "multipart/form-data; boundary=missing" },
          body: "not multipart",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("recusa Content-Type diferente de multipart", async () => {
    await expect(readJUnitUpload(jsonRequest("{}"))).rejects.toMatchObject({
      status: 415,
    });
  });

  it("aplica limite de 5 MiB ao arquivo apesar de multipart permitir seus cabeçalhos", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array(MAX_XML_BYTES + 1)], "large.xml"),
    );
    await expect(readJUnitUpload(uploadRequest(form))).rejects.toMatchObject({
      status: 413,
    });
  });

  it("recusa Content-Length excessivo antes de materializar o multipart", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(MAX_XML_BYTES + 128 * 1024 + 1),
      },
      body: "small",
    });
    await expect(readJUnitUpload(request)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("interrompe multipart em streaming acima do limite sem confiar no Content-Length", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() {
        canceled = true;
      },
    });
    const request = new Request(url, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=test" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(readJUnitUpload(request)).rejects.toMatchObject({
      status: 413,
    });
    expect(canceled).toBe(true);
  });
});
