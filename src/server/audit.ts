import type { Prisma } from "@/generated/prisma/client";

export function recordAudit(
  client: Prisma.TransactionClient,
  context: { workspaceId: string; projectId: string; actorId: string; action: string },
  result: unknown,
) {
  const value = result && typeof result === "object" ? result : {};
  const subject = "run" in value && value.run && typeof value.run === "object" ? value.run : value;
  return client.auditLog.create({
    data: {
      ...context,
      subjectId: "id" in subject && typeof subject.id === "string" ? subject.id : context.projectId,
      metadata: {
        ...("status" in subject && typeof subject.status === "string" ? { status: subject.status } : {}),
        ...("duplicate" in value && typeof value.duplicate === "boolean" ? { duplicate: value.duplicate } : {}),
      },
    },
  });
}
