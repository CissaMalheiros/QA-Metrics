import { authorizeIntegration, ingestJUnit } from "@/server/integrations";
import { readLimitedBody, MAX_XML_BYTES } from "@/server/http";
import { errorResponse, ServiceError } from "@/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const identity = await authorizeIntegration(request.headers.get("authorization"));
    const bytes = await readLimitedBody(request, MAX_XML_BYTES + 65536);
    let form: FormData;
    try { form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData(); } catch { throw new ServiceError(400, "Envie multipart/form-data com file e metadados."); }
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xml") || file.size > MAX_XML_BYTES) throw new ServiceError(400, "Envie JUnit .xml de até 5 MiB.");
    const fields: Record<string, string> = {};
    for (const [key, value] of form) if (key !== "file") { if (typeof value !== "string" || key in fields) throw new ServiceError(400, "Metadados inválidos."); fields[key] = value; }
    const result = await ingestJUnit(identity, Buffer.from(await file.arrayBuffer()), fields);
    return Response.json({ runId: result.run.id, duplicate: result.duplicate, importedCases: result.importedCases }, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
