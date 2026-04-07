// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  OnboardMachine,
  TimeoutError,
  makeSessionAdapter,
  withTimeout,
  DEFAULT_STEP_TIMEOUT_MS,
} = require("../bin/lib/onboard-machine");

// ── Helpers ──────────────────────────────────────────────────────

/** In-memory SessionAdapter for tests — no filesystem I/O */
function makeMemorySession(initialStates = {}) {
  const stepStates = { ...initialStates };
  const data = {};
  return {
    getStepState(id) {
      return stepStates[id] ?? "pending";
    },
    getData() {
      return { ...data };
    },
    markStarted(id) {
      stepStates[id] = "in_progress";
    },
    markComplete(id, ctx) {
      stepStates[id] = "complete";
      Object.assign(data, ctx ?? {});
    },
    markFailed(id, msg) {
      stepStates[id] = "failed";
      data[`${id}_error`] = msg;
    },
    // Expose internal state for assertions
    _states: stepStates,
    _data: data,
  };
}

/** Build a simple step that resolves to a context patch. */
function makeStep(id, fn, extras = {}) {
  return { id, execute: fn, ...extras };
}

// ── withTimeout ───────────────────────────────────────────────────

describe("withTimeout", () => {
  it("resolves when promise completes before deadline", async () => {
    const result = await withTimeout(Promise.resolve(42), 1000, "test");
    assert.equal(result, 42);
  });

  it("rejects with TimeoutError when promise exceeds deadline", async () => {
    const neverResolves = new Promise(() => {});
    await assert.rejects(
      () => withTimeout(neverResolves, 10, "slow-step"),
      (err) => {
        assert.ok(err instanceof TimeoutError, "should be TimeoutError");
        assert.equal(err.stepId, "slow-step");
        assert.equal(err.timeoutMs, 10);
        return true;
      }
    );
  });

  it("passes through rejection from underlying promise", async () => {
    const boom = Promise.reject(new Error("kaboom"));
    await assert.rejects(
      () => withTimeout(boom, 1000, "failing-step"),
      { message: "kaboom" }
    );
  });

  it("skips timeout enforcement when ms <= 0", async () => {
    // Should not throw even with a long-lived promise — we just resolve immediately
    const result = await withTimeout(Promise.resolve("ok"), 0, "no-timeout");
    assert.equal(result, "ok");
  });
});

// ── OnboardMachine constructor ─────────────────────────────────────

describe("OnboardMachine constructor", () => {
  it("throws on empty steps array", () => {
    assert.throws(
      () => new OnboardMachine({ steps: [], session: makeMemorySession() }),
      /steps must be a non-empty array/
    );
  });

  it("throws when session lacks getStepState", () => {
    assert.throws(
      () => new OnboardMachine({ steps: [makeStep("a", async () => {})], session: {} }),
      /session must implement SessionAdapter/
    );
  });

  it("accepts valid steps and session", () => {
    const m = new OnboardMachine({
      steps: [makeStep("a", async () => {})],
      session: makeMemorySession(),
    });
    assert.ok(m instanceof OnboardMachine);
  });
});

// ── Happy path ───────────────────────────────────────────────────

describe("OnboardMachine happy path", () => {
  it("runs all steps in order and merges context", async () => {
    const order = [];
    const sess = makeMemorySession();
    const m = new OnboardMachine({
      steps: [
        makeStep("alpha", async (ctx) => { order.push("alpha"); return { x: 1 }; }),
        makeStep("beta",  async (ctx) => { order.push("beta");  return { y: ctx.x + 1 }; }),
        makeStep("gamma", async (ctx) => { order.push("gamma"); return { z: ctx.y + 1 }; }),
      ],
      session: sess,
      context: {},
    });

    await m.run();

    assert.deepEqual(order, ["alpha", "beta", "gamma"]);
    assert.equal(m.context.x, 1);
    assert.equal(m.context.y, 2);
    assert.equal(m.context.z, 3);
    assert.equal(sess._states.alpha, "complete");
    assert.equal(sess._states.beta, "complete");
    assert.equal(sess._states.gamma, "complete");
  });

  it("steps that return null/undefined don't pollute context", async () => {
    const sess = makeMemorySession();
    const m = new OnboardMachine({
      steps: [
        makeStep("step1", async () => undefined),
        makeStep("step2", async () => null),
      ],
      session: sess,
      context: { keep: true },
    });
    await m.run();
    assert.equal(m.context.keep, true);
  });
});

// ── Resume (idempotency) ──────────────────────────────────────────

describe("OnboardMachine resume", () => {
  it("skips steps already marked complete in session", async () => {
    const executed = new Set();
    const sess = makeMemorySession({ step1: "complete", step2: "complete" });
    const m = new OnboardMachine({
      steps: [
        makeStep("step1", async () => { executed.add("step1"); }),
        makeStep("step2", async () => { executed.add("step2"); }),
        makeStep("step3", async () => { executed.add("step3"); }),
      ],
      session: sess,
    });
    await m.run();
    assert.ok(!executed.has("step1"), "step1 should be skipped");
    assert.ok(!executed.has("step2"), "step2 should be skipped");
    assert.ok(executed.has("step3"), "step3 should run");
  });

  it("calls restoreCtx on skipped steps to rebuild context", async () => {
    const sess = makeMemorySession({ preflight: "complete" });
    // Pretend session data has gpu
    sess._data.gpu = { type: "nvidia" };
    const m = new OnboardMachine({
      steps: [
        {
          id: "preflight",
          execute: async () => { throw new Error("should not run"); },
          restoreCtx(ctx, data) {
            ctx.gpu = data.gpu;
          },
        },
        makeStep("gateway", async (ctx) => ({ sawGpu: ctx.gpu?.type })),
      ],
      session: sess,
      context: {},
    });
    await m.run();
    assert.equal(m.context.gpu?.type, "nvidia");
    assert.equal(m.context.sawGpu, "nvidia");
  });
});

// ── Error handling ────────────────────────────────────────────────

describe("OnboardMachine error handling", () => {
  it("marks step failed and rethrows on unrecoverable error", async () => {
    const sess = makeMemorySession();
    const boom = new Error("boom");
    const m = new OnboardMachine({
      steps: [makeStep("bad", async () => { throw boom; })],
      session: sess,
    });
    await assert.rejects(() => m.run(), { message: "boom" });
    assert.equal(sess._states.bad, "failed");
  });

  it("subsequent steps are not run after unrecoverable failure", async () => {
    const ran = [];
    const sess = makeMemorySession();
    const m = new OnboardMachine({
      steps: [
        makeStep("step1", async () => { throw new Error("fail"); }),
        makeStep("step2", async () => { ran.push("step2"); }),
      ],
      session: sess,
    });
    await assert.rejects(() => m.run());
    assert.deepEqual(ran, []);
  });

  it("nonFatal steps continue execution even on failure", async () => {
    const ran = [];
    const sess = makeMemorySession();
    const m = new OnboardMachine({
      steps: [
        makeStep("soft", async () => { throw new Error("soft fail"); }, { nonFatal: true }),
        makeStep("after", async () => { ran.push("after"); }),
      ],
      session: sess,
    });
    await m.run(); // should not throw
    assert.deepEqual(ran, ["after"]);
    assert.equal(sess._states.soft, "failed");
    assert.equal(sess._states.after, "complete");
  });

  it("onError returning true resumes execution", async () => {
    const ran = [];
    const sess = makeMemorySession();
    let onErrorCalled = false;
    const m = new OnboardMachine({
      steps: [
        {
          id: "recoverable",
          execute: async () => { throw new Error("transient"); },
          async onError() { onErrorCalled = true; return true; }, // recovered
        },
        makeStep("next", async () => { ran.push("next"); }),
      ],
      session: sess,
    });
    await m.run();
    assert.ok(onErrorCalled);
    assert.deepEqual(ran, ["next"]);
  });

  it("onError returning false still throws", async () => {
    const sess = makeMemorySession();
    const m = new OnboardMachine({
      steps: [
        {
          id: "unrecoverable",
          execute: async () => { throw new Error("fatal"); },
          async onError() { return false; },
        },
      ],
      session: sess,
    });
    await assert.rejects(() => m.run(), { message: "fatal" });
    assert.equal(sess._states.unrecoverable, "failed");
  });
});

// ── Timeout ───────────────────────────────────────────────────────

describe("OnboardMachine timeout", () => {
  it("times out a slow step and marks it failed", async () => {
    const sess = makeMemorySession();
    const m = new OnboardMachine({
      steps: [
        {
          id: "slow",
          timeout: 20, // 20ms — will expire before neverResolves
          execute: () => new Promise(() => {}),
        },
      ],
      session: sess,
    });
    await assert.rejects(
      () => m.run(),
      (err) => {
        assert.ok(err instanceof TimeoutError);
        assert.equal(err.stepId, "slow");
        return true;
      }
    );
    assert.equal(sess._states.slow, "failed");
  });

  it("nonFatal timeout continues to next step", async () => {
    const ran = [];
    const sess = makeMemorySession();
    const m = new OnboardMachine({
      steps: [
        {
          id: "slow-nonfatal",
          timeout: 20,
          nonFatal: true,
          execute: () => new Promise(() => {}),
        },
        makeStep("after-timeout", async () => { ran.push("after"); }),
      ],
      session: sess,
    });
    await m.run();
    assert.deepEqual(ran, ["after"]);
    assert.equal(sess._states["slow-nonfatal"], "failed");
    assert.equal(sess._states["after-timeout"], "complete");
  });
});

// ── Event emission ────────────────────────────────────────────────

describe("OnboardMachine event emission", () => {
  it("emits started and complete events for each step", async () => {
    const events = [];
    const sess = makeMemorySession();
    const m = new OnboardMachine({
      steps: [
        makeStep("s1", async () => {}),
        makeStep("s2", async () => {}),
      ],
      session: sess,
      onEvent: (e) => events.push(e),
    });
    await m.run();

    const statuses = events.map((e) => `${e.step}:${e.status}`);
    assert.deepEqual(statuses, ["s1:started", "s1:complete", "s2:started", "s2:complete"]);
    // Each event has a ts field
    for (const e of events) {
      assert.ok(typeof e.ts === "string" && e.ts.length > 0, "event must have ts");
    }
  });

  it("emits skipped for already-complete steps on resume", async () => {
    const events = [];
    const sess = makeMemorySession({ s1: "complete" });
    const m = new OnboardMachine({
      steps: [
        makeStep("s1", async () => {}),
        makeStep("s2", async () => {}),
      ],
      session: sess,
      onEvent: (e) => events.push(e),
    });
    await m.run();

    const statuses = events.map((e) => `${e.step}:${e.status}`);
    assert.deepEqual(statuses, ["s1:skipped", "s2:started", "s2:complete"]);
  });

  it("emits failed event with error field on step failure", async () => {
    const events = [];
    const sess = makeMemorySession();
    const m = new OnboardMachine({
      steps: [
        makeStep("boom", async () => { throw new Error("oops"); }, { nonFatal: true }),
      ],
      session: sess,
      onEvent: (e) => events.push(e),
    });
    await m.run();

    const failEvt = events.find((e) => e.status === "failed");
    assert.ok(failEvt, "should have a failed event");
    assert.equal(failEvt.step, "boom");
    assert.equal(failEvt.error, "oops");
  });

  it("does not throw if onEvent callback throws", async () => {
    const sess = makeMemorySession();
    const m = new OnboardMachine({
      steps: [makeStep("ok", async () => {})],
      session: sess,
      onEvent: () => { throw new Error("bad callback"); },
    });
    // Machine should complete normally despite broken callback
    await assert.doesNotReject(() => m.run());
  });
});

// ── makeSessionAdapter ────────────────────────────────────────────

describe("makeSessionAdapter", () => {
  it("bridges onboard-session module to SessionAdapter interface", () => {
    const calls = [];
    const fakeModule = {
      loadSession: () => ({
        steps: { myStep: { status: "complete" } },
        model: "test-model",
      }),
      markStepStarted: (id) => calls.push(`started:${id}`),
      markStepComplete: (id, ctx) => calls.push(`complete:${id}`),
      markStepFailed: (id, msg) => calls.push(`failed:${id}:${msg}`),
    };

    const adapter = makeSessionAdapter(fakeModule);

    assert.equal(adapter.getStepState("myStep"), "complete");
    assert.equal(adapter.getStepState("unknown"), "pending");

    const data = adapter.getData();
    assert.equal(data.model, "test-model");

    adapter.markStarted("myStep");
    assert.deepEqual(calls, ["started:myStep"]);

    adapter.markComplete("myStep", { x: 1 });
    assert.deepEqual(calls, ["started:myStep", "complete:myStep"]);

    adapter.markFailed("myStep", "err");
    assert.deepEqual(calls, ["started:myStep", "complete:myStep", "failed:myStep:err"]);
  });

  it("returns pending when loadSession returns null", () => {
    const fakeModule = {
      loadSession: () => null,
      markStepStarted: () => {},
      markStepComplete: () => {},
      markStepFailed: () => {},
    };
    const adapter = makeSessionAdapter(fakeModule);
    assert.equal(adapter.getStepState("any"), "pending");
    const data = adapter.getData();
    assert.deepEqual(data, {});
  });
});

// ── DEFAULT_STEP_TIMEOUT_MS sanity ────────────────────────────────

describe("constants", () => {
  it("DEFAULT_STEP_TIMEOUT_MS is 10 minutes", () => {
    assert.equal(DEFAULT_STEP_TIMEOUT_MS, 10 * 60 * 1000);
  });
});
