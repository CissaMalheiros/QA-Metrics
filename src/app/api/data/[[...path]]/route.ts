import { auth } from "@/lib/auth";
import { errorResponse, ServiceError } from "@/server/errors";
import { assertSameOrigin, readJson, readJUnitUpload } from "@/server/http";
import * as service from "@/server/services";
import * as library from "@/server/case-library";
import * as gherkin from "@/server/gherkin";
import * as csv from "@/server/csv";
import * as planning from "@/server/planning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ path?: string[] }> };

async function handle(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      throw new ServiceError(401, "Entre na sua conta para continuar.");
    const userId = session.user.id;
    const method = request.method;
    if (method !== "GET") assertSameOrigin(request);
    const path = (await context.params).path ?? [];
    const [collection, projectId, resource, resourceId, action, actionId] =
      path;
    let result: unknown;
    let status = 200;

    if (path.length === 1 && collection === "overview" && method === "GET") {
      result = await service.getOverview(userId);
    } else if (collection === "projects" && path.length === 1) {
      if (method === "GET")
        result = { projects: await service.listProjects(userId) };
      else if (method === "POST") {
        result = {
          project: await service.createProject(userId, await readJson(request)),
        };
        status = 201;
      }
    } else if (collection === "projects" && projectId && path.length === 2) {
      if (method === "GET")
        result = await service.getProject(userId, projectId);
      else if (method === "PATCH")
        result = {
          project: await service.updateProject(
            userId,
            projectId,
            await readJson(request),
          ),
        };
      else if (method === "DELETE")
        result = await service.deleteProject(userId, projectId);
    } else if (collection === "projects" && projectId) {
      if (resource === "planning" && path.length === 3 && method === "GET") {
        result = await planning.getPlanning(userId, projectId);
      } else if (resource === "plans" && path.length === 3 && method === "GET") {
        result = { plans: await planning.listPlans(userId, projectId) };
      } else if (resource === "plans" && path.length === 3 && method === "POST") {
        result = { plan: await planning.savePlan(userId, projectId, await readJson(request)) }; status = 201;
      } else if (resource === "plans" && resourceId && path.length === 4 && method === "PATCH") {
        result = { plan: await planning.savePlan(userId, projectId, await readJson(request), resourceId) };
      } else if (resource === "plans" && resourceId && action === "clone" && path.length === 5 && method === "POST") {
        result = { plan: await planning.clonePlan(userId, projectId, resourceId) }; status = 201;
      } else if (resource === "environments" && path.length === 3 && method === "POST") {
        result = { environment: await planning.saveEnvironment(userId, projectId, await readJson(request)) }; status = 201;
      } else if (resource === "environments" && resourceId && path.length === 4 && method === "PATCH") {
        result = { environment: await planning.saveEnvironment(userId, projectId, await readJson(request), resourceId) };
      } else if (resource === "releases" && path.length === 3 && method === "POST") {
        result = { release: await planning.saveRelease(userId, projectId, await readJson(request)) }; status = 201;
      } else if (resource === "releases" && resourceId && path.length === 4 && method === "PATCH") {
        result = { release: await planning.saveRelease(userId, projectId, await readJson(request), resourceId) };
      } else if (resource === "csv" && resourceId && path.length === 4 && method === "POST") {
        if (resourceId === "inspect") result = await csv.inspectCSV(userId, projectId, await readJson(request));
        else if (resourceId === "preview") result = await csv.previewCSV(userId, projectId, await readJson(request));
        else if (resourceId === "import") result = await csv.importCSV(userId, projectId, await readJson(request));
      } else if (resource === "csv" && resourceId === "export" && path.length === 4 && method === "GET") {
        const output = await csv.exportCSV(userId, projectId, Object.fromEntries(new URL(request.url).searchParams));
        return new Response(output, { headers: {
          "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="qa-metrics-casos.csv"',
          "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        } });
      } else if (resource === "features" && resourceId === "preview" && path.length === 4 && method === "POST") {
        result = await gherkin.previewFeature(userId, projectId, await readJson(request));
      } else if (resource === "features" && path.length === 3 && method === "POST") {
        result = await gherkin.saveFeature(userId, projectId, await readJson(request));
      } else if (resource === "features" && resourceId && action === "export" && path.length === 5 && method === "GET") {
        const feature = await gherkin.exportFeature(userId, projectId, resourceId);
        return new Response(feature.source, { headers: {
          "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${feature.name}"`,
          "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        } });
      } else if (resource === "library" && path.length === 3 && method === "GET") {
        result = await library.getCaseLibrary(userId, projectId, Object.fromEntries(new URL(request.url).searchParams));
      } else if (resource === "suites" && path.length === 3 && method === "POST") {
        result = { suite: await library.saveSuite(userId, projectId, await readJson(request)) };
        status = 201;
      } else if (resource === "suites" && resourceId && path.length === 4 && method === "PATCH") {
        result = { suite: await library.saveSuite(userId, projectId, await readJson(request), resourceId) };
      } else if (resource === "suites" && resourceId && path.length === 4 && method === "DELETE") {
        result = await library.deleteSuite(userId, projectId, resourceId);
      } else if (resource === "cases" && resourceId === "bulk" && path.length === 4 && method === "PATCH") {
        result = await library.bulkUpdateCases(userId, projectId, await readJson(request));
      } else if (resource === "cases" && resourceId && action === "duplicate" && path.length === 5 && method === "POST") {
        result = { testCase: await library.duplicateCase(userId, projectId, resourceId) };
        status = 201;
      } else if (resource === "cases" && resourceId && action === "revisions" && path.length === 5 && method === "GET") {
        result = { revisions: await library.listCaseRevisions(userId, projectId, resourceId) };
      } else if (resource === "audit" && path.length === 3 && method === "GET") {
        result = { events: await service.listAuditLogs(userId, projectId, new URL(request.url).searchParams.get("before") ?? undefined) };
      } else if (resource === "cases" && path.length === 3) {
        if (method === "GET")
          result = { cases: await service.listCases(userId, projectId) };
        else if (method === "POST") {
          result = {
            testCase: await service.createCase(
              userId,
              projectId,
              await readJson(request),
            ),
          };
          status = 201;
        }
      } else if (resource === "cases" && resourceId && path.length === 4) {
        if (method === "GET")
          result = {
            testCase: await service.getCase(userId, projectId, resourceId),
          };
        else if (method === "PATCH")
          result = {
            testCase: await service.updateCase(
              userId,
              projectId,
              resourceId,
              await readJson(request),
            ),
          };
        else if (method === "DELETE")
          result = await service.deleteCase(userId, projectId, resourceId);
      } else if (resource === "runs" && path.length === 3) {
        if (method === "GET")
          result = { runs: await service.listRuns(userId, projectId) };
        else if (method === "POST") {
          result = {
            run: await service.createRun(
              userId,
              projectId,
              await readJson(request),
            ),
          };
          status = 201;
        }
      } else if (resource === "runs" && resourceId) {
        if (path.length === 4 && method === "GET")
          result = { run: await service.getRun(userId, projectId, resourceId) };
        else if (path.length === 5 && (action === "start" || action === "cancel") && method === "POST")
          result = { run: await service.transitionRun(userId, projectId, resourceId, action) };
        else if (
          path.length === 5 &&
          action === "complete" &&
          method === "POST"
        )
          result = {
            run: await service.completeRun(userId, projectId, resourceId),
          };
        else if (
          path.length === 6 &&
          action === "results" &&
          actionId &&
          method === "PATCH"
        )
          result = {
            result: await service.updateResult(
              userId,
              projectId,
              resourceId,
              actionId,
              await readJson(request),
            ),
          };
      } else if (resource === "bugs" && path.length === 3) {
        if (method === "GET")
          result = { bugs: await service.listBugs(userId, projectId) };
        else if (method === "POST") {
          result = {
            bug: await service.createBug(
              userId,
              projectId,
              await readJson(request),
            ),
          };
          status = 201;
        }
      } else if (resource === "bugs" && resourceId && path.length === 4) {
        if (method === "GET")
          result = { bug: await service.getBug(userId, projectId, resourceId) };
        else if (method === "PATCH")
          result = {
            bug: await service.updateBug(
              userId,
              projectId,
              resourceId,
              await readJson(request),
            ),
          };
        else if (method === "DELETE")
          result = await service.deleteBug(userId, projectId, resourceId);
      } else if (
        resource === "imports" &&
        path.length === 3 &&
        method === "POST"
      ) {
        const upload = await readJUnitUpload(request);
        const imported = await service.importJUnit(
          userId,
          projectId,
          upload.input,
          upload.name,
        );
        result = imported;
        status = imported.duplicate ? 200 : 201;
      }
    }
    if (result === undefined)
      throw new ServiceError(404, "Operação não encontrada.");
    return Response.json(result, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
