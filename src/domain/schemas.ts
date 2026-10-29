import { z } from "zod";

export const PROJECT_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const RESULT_STATUSES = [
  "PASSED",
  "FAILED",
  "BLOCKED",
  "SKIPPED",
  "NOT_RUN",
] as const;
export const BUG_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const RUN_STATUSES = ["OPEN", "COMPLETED"] as const;
export const RUN_SOURCES = ["MANUAL", "JUNIT_IMPORT"] as const;
export const CASE_ORIGINS = ["MANUAL", "JUNIT", "GHERKIN", "CSV"] as const;
export const CASE_TYPES = ["FUNCTIONAL", "API", "UI", "INTEGRATION", "SECURITY", "EXPLORATORY"] as const;
export const CASE_STATES = ["DRAFT", "READY", "ARCHIVED"] as const;

const id = z.string().trim().min(1, "Identificador obrigatório.").max(128);
const text = (max: number) =>
  z.string().trim().max(max, `Use no máximo ${max} caracteres.`);
const title = text(200).min(
  3,
  "Informe um título com pelo menos 3 caracteres.",
);
const caseTags = z.array(text(50).regex(/^@?[\p{L}\p{N}_.:-]+$/u, "Use tags sem espaços, como smoke ou regressao.")).max(30)
  .transform(values => [...new Set(values.map(value => value.replace(/^@/, "").toLowerCase()))]);

export const projectSchema = z.object({
  name: text(120).min(2, "Informe o nome do projeto."),
  clientName: text(120).min(1, "Informe o cliente."),
  description: text(5000).default(""),
  environment: text(200).default(""),
  status: z.enum(PROJECT_STATUSES).default("ACTIVE"),
});

export const testCaseSchema = z.object({
  title,
  description: text(5000).default(""),
  preconditions: text(5000).default(""),
  steps: z
    .array(text(2000).min(1, "Um passo não pode ficar vazio."))
    .min(1, "Informe pelo menos um passo.")
    .max(100, "Use no máximo 100 passos."),
  expectedResult: text(5000).min(1, "Informe o resultado esperado."),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  suiteId: z.union([id, z.literal("")]).nullable().optional().transform(value => value || null),
  tags: caseTags.default([]),
  type: z.enum(CASE_TYPES).default("FUNCTIONAL"),
  state: z.enum(CASE_STATES).default("READY"),
});

export const runSchema = z.object({
  name: text(200).min(3, "Informe um nome com pelo menos 3 caracteres."),
  testCaseIds: z
    .array(id)
    .min(1, "Selecione pelo menos um caso.")
    .max(1000, "Selecione no máximo 1.000 casos por ciclo.")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Selecione cada caso apenas uma vez.",
    ),
});

export const resultSchema = z.object({
  status: z.enum(RESULT_STATUSES),
  notes: text(5000).default(""),
});

export const bugSchema = z.object({
  title,
  description: text(10000).min(1, "Descreva o defeito."),
  stepsToReproduce: text(5000).default(""),
  severity: z.enum(SEVERITIES).default("MEDIUM"),
  status: z.enum(BUG_STATUSES).default("OPEN"),
  testResultId: z
    .union([id, z.literal("")])
    .nullable()
    .optional()
    .transform((value) => value || null),
});

// Zod 4 applies inner defaults even after .partial(). PATCH schemas must omit
// those defaults so changing one field never resets unrelated stored values.
export const projectUpdateSchema = z
  .object({
    name: projectSchema.shape.name,
    clientName: projectSchema.shape.clientName,
    description: projectSchema.shape.description.removeDefault(),
    environment: projectSchema.shape.environment.removeDefault(),
    status: projectSchema.shape.status.removeDefault(),
  })
  .partial();

export const testCaseUpdateSchema = z
  .object({
    title: testCaseSchema.shape.title,
    description: testCaseSchema.shape.description.removeDefault(),
    preconditions: testCaseSchema.shape.preconditions.removeDefault(),
    steps: testCaseSchema.shape.steps,
    expectedResult: testCaseSchema.shape.expectedResult,
    priority: testCaseSchema.shape.priority.removeDefault(),
    suiteId: z.union([id, z.literal("")]).nullable().transform(value => value || null),
    tags: caseTags,
    type: z.enum(CASE_TYPES),
    state: z.enum(CASE_STATES),
  })
  .partial();

export const bugUpdateSchema = z
  .object({
    title: bugSchema.shape.title,
    description: bugSchema.shape.description,
    stepsToReproduce: bugSchema.shape.stepsToReproduce.removeDefault(),
    severity: bugSchema.shape.severity.removeDefault(),
    status: bugSchema.shape.status.removeDefault(),
    testResultId: z
      .union([id, z.literal("")])
      .nullable()
      .transform((value) => value || null),
  })
  .partial();

export const resultUpdateSchema = z
  .object({
    status: resultSchema.shape.status,
    notes: resultSchema.shape.notes.removeDefault(),
  })
  .partial();

export type ProjectInput = z.infer<typeof projectSchema>;
export type TestCaseInput = z.infer<typeof testCaseSchema>;
export type RunInput = z.infer<typeof runSchema>;
export type ResultInput = z.infer<typeof resultSchema>;
export type BugInput = z.infer<typeof bugSchema>;
export type ResultStatus = (typeof RESULT_STATUSES)[number];
