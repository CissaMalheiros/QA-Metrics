import { describe, expect, it } from "vitest";
import { calculateMetrics } from "../../src/domain/metrics";

describe("métricas de execução", () => {
  it("explicita o denominador e exclui bloqueados, ignorados e não executados", () => {
    const metrics = calculateMetrics([
      { status: "PASSED" },
      { status: "PASSED" },
      { status: "PASSED" },
      { status: "FAILED" },
      { status: "BLOCKED" },
      { status: "SKIPPED" },
      { status: "NOT_RUN" },
    ]);
    expect(metrics).toEqual({
      counts: { PASSED: 3, FAILED: 1, BLOCKED: 1, SKIPPED: 1, NOT_RUN: 1 },
      passed: 3,
      failed: 1,
      blocked: 1,
      skipped: 1,
      notRun: 1,
      total: 7,
      denominator: 4,
      passRate: 75,
    });
  });

  it("não inventa taxa quando não há execução com resultado definido", () => {
    expect(calculateMetrics([])).toMatchObject({
      total: 0,
      denominator: 0,
      passRate: null,
    });
    expect(
      calculateMetrics([{ status: "BLOCKED" }, { status: "NOT_RUN" }]),
    ).toMatchObject({ denominator: 0, passRate: null });
  });

  it("representa corretamente zero, cem e percentuais não inteiros", () => {
    expect(calculateMetrics([{ status: "FAILED" }]).passRate).toBe(0);
    expect(calculateMetrics([{ status: "PASSED" }]).passRate).toBe(100);
    expect(
      calculateMetrics([
        { status: "PASSED" },
        { status: "FAILED" },
        { status: "FAILED" },
      ]).passRate,
    ).toBeCloseTo(100 / 3);
  });

  it("recusa situações desconhecidas em vez de produzir um total inconsistente", () => {
    expect(() => calculateMetrics([{ status: "UNKNOWN" }])).toThrow(
      "desconhecida",
    );
  });
});
