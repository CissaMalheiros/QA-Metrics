import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { RunContextFields } from "@/components/run-context";

test("reteste exibe apenas o contexto utilizado, preservando o formulário de ciclos", () => {
  const retest = renderToStaticMarkup(createElement(RunContextFields, { projectId: "project", retest: true }));
  for (const field of ["creationKey", "environmentId", "releaseId", "build"]) expect(retest).toContain(`name="${field}"`);
  const run = renderToStaticMarkup(createElement(RunContextFields, { projectId: "project" }));
  for (const field of ["responsibleId", "scheduledStart", "scheduledEnd", "notes", "entryCriteria", "exitCriteria", "draft"]) {
    expect(retest).not.toContain(`name="${field}"`);
    expect(run).toContain(`name="${field}"`);
  }
});
