import type { priorityLabels } from "@/domain/labels";
export type Suite = { id: string; name: string; parentId: string | null };
export type LibraryCase = {
  id: string; number: number; title: string; description: string; preconditions: string;
  steps: string[]; expectedResult: string; priority: keyof typeof priorityLabels; origin: string; createdAt: string;
  suiteId: string | null; tags: string[]; type: string; state: string; revision: number;
  format: string; gherkinSource: string; gherkinOriginalSource: string; gherkinKey: string | null; gherkinLanguage: string;
  requirementRef: string; automationRef: string;
};
export const caseCode = (value: number) => `TC-${String(value).padStart(3, "0")}`;
export const caseTypeLabels: Record<string, string> = { FUNCTIONAL: "Funcional", API: "API", UI: "Interface", INTEGRATION: "Integração", SECURITY: "Segurança", EXPLORATORY: "Exploratório" };
export const caseStateLabels: Record<string, string> = { DRAFT: "Rascunho", READY: "Pronto", ARCHIVED: "Arquivado" };

export function suitePath(suite: Suite, suites: Suite[]): string {
  const names = [suite.name];
  const visited = new Set([suite.id]);
  let parent = suites.find(value => value.id === suite.parentId);
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id); names.unshift(parent.name);
    parent = suites.find(value => value.id === parent!.parentId);
  }
  return names.join(" / ");
}
