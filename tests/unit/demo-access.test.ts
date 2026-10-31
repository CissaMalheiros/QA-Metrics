import { describe, expect, it } from "vitest";
import { assertDemoAccess } from "@/server/demo-access";
import { DEMO_EMAIL } from "@/lib/demo";

describe("proteção da demonstração compartilhada", () => {
  it("permite consultas e downloads", () => {
    for (const path of [["projects"], ["projects", "id", "evidence", "file"]]) {
      expect(() => assertDemoAccess(DEMO_EMAIL, "GET", path)).not.toThrow();
    }
  });
  it.each(["POST", "PATCH", "DELETE"])("bloqueia %s antes de alterar dados", method => {
    for (const path of [["projects"], ["projects", "id", "cases"], ["projects", "id", "evidence", "file"], ["projects", "id", "tokens"]]) {
      expect(() => assertDemoAccess(DEMO_EMAIL, method, path)).toThrow(expect.objectContaining({ status: 403 }));
      expect(() => assertDemoAccess("avaliador@example.test", method, path)).not.toThrow();
    }
  });
  it("permite somente as prévias que não gravam no banco", () => {
    for (const [resource, action] of [["features", "preview"], ["csv", "inspect"], ["csv", "preview"]]) {
      expect(() => assertDemoAccess(DEMO_EMAIL, "POST", ["projects", "id", resource, action])).not.toThrow();
    }
    expect(() => assertDemoAccess(DEMO_EMAIL, "POST", ["projects", "id", "cases", "preview"])).toThrow();
    expect(() => assertDemoAccess(DEMO_EMAIL, "DELETE", ["projects", "id", "csv", "preview"])).toThrow();
  });
});
