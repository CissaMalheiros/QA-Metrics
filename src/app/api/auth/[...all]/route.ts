import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { DEMO_EMAIL } from "@/lib/demo";
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  const path = new URL(request.url).pathname.split("/").pop();
  if (!["sign-in", "email", "sign-out", "get-session"].includes(path ?? "")) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user.email === DEMO_EMAIL) return Response.json({ error: "A conta pública de demonstração não pode alterar credenciais ou perfil." }, { status: 403 });
  }
  return handlers.POST(request);
}
