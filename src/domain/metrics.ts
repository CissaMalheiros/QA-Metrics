import { RESULT_STATUSES, type ResultStatus } from "./schemas";

/** A taxa considera somente aprovados e reprovados; demais estados ficam separados. */
export function calculateMetrics(results: ReadonlyArray<{ status: string }>) {
  const counts: Record<ResultStatus, number> = {
    PASSED: 0,
    FAILED: 0,
    BLOCKED: 0,
    SKIPPED: 0,
    NOT_RUN: 0,
  };
  for (const { status } of results) {
    if (!RESULT_STATUSES.includes(status as ResultStatus)) {
      throw new Error(
        `Situação de resultado desconhecida: ${status.slice(0, 40)}`,
      );
    }
    counts[status as ResultStatus] += 1;
  }
  const denominator = counts.PASSED + counts.FAILED;
  return {
    counts,
    passed: counts.PASSED,
    failed: counts.FAILED,
    blocked: counts.BLOCKED,
    skipped: counts.SKIPPED,
    notRun: counts.NOT_RUN,
    total: results.length,
    denominator,
    passRate: denominator ? (counts.PASSED / denominator) * 100 : null,
  };
}
