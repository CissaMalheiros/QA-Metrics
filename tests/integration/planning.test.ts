import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createProject, deleteProject } from "@/server/services";
import { getPlanning, saveEnvironment, saveRelease } from "@/server/planning";

const owner = `planning-${randomUUID()}`, other = `planning-other-${randomUUID()}`;
let projectId: string, foreignId: string;
beforeAll(async () => {
  await db.user.createMany({ data: [owner, other].map(id => ({ id, name: "QA Planning", email: `${id}@example.test` })) });
  projectId = (await createProject(owner, { name: "Planejamento A", clientName: "Cliente A" })).id;
  foreignId = (await createProject(other, { name: "Planejamento B", clientName: "Cliente B" })).id;
});
afterAll(async () => {
  await db.project.deleteMany({ where: { id: { in: [projectId, foreignId] } } });
  await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
  await db.$disconnect();
});

it("cadastra, edita e arquiva sem excluir contexto ou redefinir campos omitidos", async () => {
  const environment = await saveEnvironment(owner, projectId, { name: "QA", baseUrl: "https://qa.example.test" });
  const release = await saveRelease(owner, projectId, { name: "Checkout", version: "2.0.0" });
  expect(await saveEnvironment(owner, projectId, { archived: true }, environment.id)).toMatchObject({ name: "QA", baseUrl: "https://qa.example.test", archived: true });
  expect(await saveRelease(owner, projectId, { archived: true }, release.id)).toMatchObject({ version: "2.0.0", archived: true });
  const context = await getPlanning(owner, projectId);
  expect(context.environments).toHaveLength(1);
  expect(context.releases).toHaveLength(1);
  await expect(deleteProject(owner, projectId)).rejects.toMatchObject({ status: 409 });
});

it("recusa outro usuário e referências de contexto de outro projeto", async () => {
  const external = await saveEnvironment(other, foreignId, { name: "Privado" });
  const release = await saveRelease(other, foreignId, { name: "Privada", version: "1.0" });
  await expect(getPlanning(other, projectId)).rejects.toMatchObject({ status: 404 });
  await expect(saveEnvironment(owner, projectId, { name: "Tentativa" }, external.id)).rejects.toMatchObject({ status: 404 });
  await expect(saveRelease(owner, projectId, { name: "Tentativa" }, release.id)).rejects.toMatchObject({ status: 404 });
});

it("valida URLs sem credenciais e evita versões duplicadas por projeto", async () => {
  await expect(saveEnvironment(owner, projectId, { name: "Inseguro", baseUrl: "javascript:alert(1)" })).rejects.toThrow();
  await expect(saveEnvironment(owner, projectId, { name: "Credencial", baseUrl: "https://user:secret@example.test" })).rejects.toThrow();
  await expect(saveRelease(owner, projectId, { name: "Duplicada", version: "2.0.0" })).rejects.toMatchObject({ code: "P2002" });
});
