import { z } from "zod";
import { db } from "@/lib/db";
import { requireProject, withProject } from "@/server/services";
import { ServiceError } from "@/server/errors";

const name = z.string().trim().min(1, "Informe o nome.").max(120);
const baseUrl = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, "Use uma URL HTTP/HTTPS sem usuário ou senha.");
export const environmentSchema = z.object({ name, baseUrl: baseUrl.default(""), archived: z.boolean().default(false) }).strict();
export const releaseSchema = z.object({ name, version: z.string().trim().min(1, "Informe a versão.").max(80), archived: z.boolean().default(false) }).strict();

export async function getPlanning(userId: string, projectId: string) {
  await requireProject(userId, projectId);
  const [environments, releases] = await Promise.all([
    db.environment.findMany({ where: { projectId }, orderBy: [{ archived: "asc" }, { name: "asc" }] }),
    db.release.findMany({ where: { projectId }, orderBy: [{ archived: "asc" }, { createdAt: "desc" }] }),
  ]);
  return { environments, releases };
}

export async function saveEnvironment(userId: string, projectId: string, input: unknown, environmentId?: string) {
  const data = environmentId
    ? z.object({ name, baseUrl, archived: z.boolean() }).partial().strict().parse(input)
    : environmentSchema.parse(input);
  return withProject(userId, projectId, environmentId ? "ENVIRONMENT_UPDATED" : "ENVIRONMENT_CREATED", async client => {
    if (environmentId) {
      if (!await client.environment.findFirst({ where: { id: environmentId, projectId } })) throw new ServiceError(404, "Ambiente não encontrado.");
      return client.environment.update({ where: { id: environmentId }, data });
    }
    return client.environment.create({ data: { ...environmentSchema.parse(data), projectId } });
  });
}

export async function saveRelease(userId: string, projectId: string, input: unknown, releaseId?: string) {
  const data = releaseId
    ? z.object({ name, version: releaseSchema.shape.version, archived: z.boolean() }).partial().strict().parse(input)
    : releaseSchema.parse(input);
  return withProject(userId, projectId, releaseId ? "RELEASE_UPDATED" : "RELEASE_CREATED", async client => {
    if (releaseId) {
      if (!await client.release.findFirst({ where: { id: releaseId, projectId } })) throw new ServiceError(404, "Versão não encontrada.");
      return client.release.update({ where: { id: releaseId }, data });
    }
    return client.release.create({ data: { ...releaseSchema.parse(data), projectId } });
  });
}
