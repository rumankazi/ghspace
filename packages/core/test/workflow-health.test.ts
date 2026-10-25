import { describe, expect, test } from "bun:test";
import { workflowHealth, worstHealth } from "../src/workflow-health.ts";

/** A completed run, unless the case overrides it. */
function run(over: Partial<Parameters<typeof workflowHealth>[0]> = {}) {
  return workflowHealth({ runId: 1, status: "completed", conclusion: "success", ...over });
}

describe("workflowHealth", () => {
  test("a workflow that has never run has no verdict", () => {
    expect(workflowHealth({ runId: null, status: null, conclusion: null })).toBe("idle");
  });

  test("success is passing", () => {
    expect(run()).toBe("passing");
  });

  for (const conclusion of ["failure", "timed_out", "startup_failure"] as const) {
    test(`${conclusion} is failing`, () => {
      expect(run({ conclusion })).toBe("failing");
    });
  }

  test("a run waiting for approval is failing, because somebody has to act", () => {
    expect(run({ conclusion: "action_required" })).toBe("failing");
  });

  // The trap this file exists for: anything that is not an outright failure is
  // tempting to call green, and a repository whose runs are all cancelled would
  // then report as healthy.
  for (const conclusion of ["cancelled", "skipped", "neutral", "stale"] as const) {
    test(`${conclusion} is neither passing nor failing`, () => {
      expect(run({ conclusion })).toBe("idle");
    });
  }

  test("an unfinished run is running", () => {
    expect(run({ status: "in_progress", conclusion: null })).toBe("running");
  });

  test("a queued run is running", () => {
    expect(run({ status: "queued", conclusion: null })).toBe("running");
  });

  /*
   * GitHub leaves `status: "completed"` on a finished run, so the status alone
   * cannot say whether anything is still happening.
   */
  test("the conclusion wins over a completed status", () => {
    expect(run({ status: "completed", conclusion: "failure" })).toBe("failing");
  });

  test("a status this build does not recognise is no verdict, not a guess", () => {
    expect(run({ status: null, conclusion: null })).toBe("idle");
  });
});

describe("worstHealth", () => {
  test("one failing workflow makes the repository failing", () => {
    expect(worstHealth(["passing", "failing", "running", "idle"])).toBe("failing");
  });

  test("running outranks passing, so a repository mid-build says so", () => {
    expect(worstHealth(["passing", "running", "passing"])).toBe("running");
  });

  test("all green is passing", () => {
    expect(worstHealth(["passing", "passing"])).toBe("passing");
  });

  test("a repository whose workflows have never run has no verdict", () => {
    expect(worstHealth(["idle", "idle"])).toBe("idle");
  });

  test("no workflows at all is no verdict rather than green", () => {
    expect(worstHealth([])).toBe("idle");
  });
});
