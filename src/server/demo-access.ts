import { DEMO_EMAIL } from "@/lib/demo";
import { ServiceError } from "@/server/errors";

export function assertDemoAccess(email: string, method: string, path: string[]) {
  if (email !== DEMO_EMAIL || method === "GET") return;
  const preview = method === "POST" && path.length === 4 && path[0] === "projects" &&
    ((path[2] === "features" && path[3] === "preview") ||
      (path[2] === "csv" && ["inspect", "preview"].includes(path[3])));
  if (!preview) throw new ServiceError(403,
    "A demonstração compartilhada é somente leitura. Crie uma conta própria para testar alterações em um espaço separado.");
}
