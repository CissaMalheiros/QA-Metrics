import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { IntegrationSettings } from "@/components/integration-settings";

test("demonstração explica restrição de tokens sem oferecer criação", () => {
  const demo = renderToStaticMarkup(createElement(IntegrationSettings, { projectId: "demo-project", demo: true }));
  expect(demo).toContain("use uma conta própria");
  expect(demo).not.toContain("<form");
  const regular = renderToStaticMarkup(createElement(IntegrationSettings, { projectId: "regular-project" }));
  expect(regular).toContain("<form");
  expect(regular).toContain("Gerar token de ingestão");
});
