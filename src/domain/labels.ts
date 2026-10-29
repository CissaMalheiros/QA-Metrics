export const projectStatusLabels = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  ARCHIVED: "Arquivado",
} as const;
export const priorityLabels = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
} as const;
export const resultStatusLabels = {
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  BLOCKED: "Bloqueado",
  SKIPPED: "Ignorado",
  NOT_RUN: "Não executado",
} as const;
export const bugStatusLabels = {
  OPEN: "Aberto",
  IN_PROGRESS: "Em andamento",
  RESOLVED: "Resolvido",
  CLOSED: "Fechado",
} as const;
export const runStatusLabels = {
  OPEN: "Em andamento",
  COMPLETED: "Finalizado",
} as const;
export const originLabels = {
  MANUAL: "Manual",
  JUNIT: "JUnit XML",
  JUNIT_IMPORT: "JUnit XML",
} as const;
