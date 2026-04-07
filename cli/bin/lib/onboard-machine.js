// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Explicit state machine for the onboard wizard.
//
// Each step declares:
//   id            — unique string key (matches session.steps key)
//   execute(ctx)  — async fn; returns partial context update or void
//   restoreCtx    — fn(ctx, sessionData) called when step already complete on resume
//   timeout       — ms; defaults to DEFAULT_STEP_TIMEOUT_MS
//   onError       — async fn(err, ctx) → bool; true = recovered (continue), false = abort
//   nonFatal      — bool; if true, failure is logged but execution continues
//
// Resume falls out of the machine: load persisted session, every step already
// marked "complete" is skipped (restoreCtx called to rebuild context), remaining
// steps run normally.

"use strict";

const DEFAULT_STEP_TIMEOUT_MS = 10 * 60 * 1000; // 10 min per step

class TimeoutError extends Error {
  constructor(stepId, ms) {
    super(`Step '${stepId}' timed out after ${ms}ms`);
    this.name = "TimeoutError";
    this.stepId = stepId;
    this.timeoutMs = ms;
  }
}

/**
 * Race a promise against a deadline.
 * @param {Promise<*>} promise
 * @param {number} ms  — 0 or negative = no timeout
 * @param {string} stepId — used in error message
 * @returns {Promise<*>}
 */
function withTimeout(promise, ms, stepId) {
  if (!ms || ms <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new TimeoutError(stepId, ms)),
      ms
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * Session adapter interface expected by OnboardMachine.
 *
 * Concrete implementations are provided by callers; tests supply a lightweight
 * in-memory version.  Production callers wrap the onboard-session module.
 *
 * interface SessionAdapter {
 *   getStepState(id: string): 'pending' | 'in_progress' | 'complete' | 'failed' | 'skipped'
 *   getData(): object          // returns the full session object (read-only snapshot)
 *   markStarted(id: string): void
 *   markComplete(id: string, contextSnapshot: object): void
 *   markFailed(id: string, message: string): void
 * }
 */

/**
 * Build a SessionAdapter backed by the onboard-session module.
 * @param {object} sessionModule — the require("./onboard-session") export
 * @returns {object}
 */
function makeSessionAdapter(sessionModule) {
  return {
    getStepState(id) {
      const sess = sessionModule.loadSession();
      return sess?.steps?.[id]?.status ?? "pending";
    },
    getData() {
      return sessionModule.loadSession() ?? {};
    },
    markStarted(id) {
      sessionModule.markStepStarted(id);
    },
    markComplete(id, ctxSnapshot) {
      sessionModule.markStepComplete(id, ctxSnapshot ?? {});
    },
    markFailed(id, message) {
      sessionModule.markStepFailed(id, message ?? null);
    },
  };
}

/**
 * Core state machine.  Given an ordered list of step definitions and a
 * session adapter it runs each step in sequence, persisting progress.
 *
 * Usage:
 *   const machine = new OnboardMachine({ steps, session, context });
 *   await machine.run();
 *   // machine.context holds the accumulated output of all steps.
 */
class OnboardMachine {
  /**
   * @param {object} opts
   * @param {Array<StepDef>} opts.steps — ordered step definitions
   * @param {SessionAdapter}  opts.session
   * @param {object}         [opts.context={}] — mutable shared state (gpu, model, …)
   * @param {Function}       [opts.onEvent]    — optional callback(event) for step lifecycle events
   *   Each event has the shape: { step: string, status: string, ts: string, error?: string }
   *   Statuses emitted: "skipped" | "started" | "complete" | "failed"
   */
  constructor({ steps, session, context = {}, onEvent }) {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new TypeError("OnboardMachine: steps must be a non-empty array");
    }
    if (!session || typeof session.getStepState !== "function") {
      throw new TypeError("OnboardMachine: session must implement SessionAdapter");
    }
    this.stepDefs = steps;
    this.session = session;
    this.context = context;
    this._onEvent = typeof onEvent === "function" ? onEvent : null;
  }

  /** Emit a structured step event to the caller-supplied callback (if any). */
  _emit(step, status, extra = {}) {
    if (!this._onEvent) return;
    try {
      this._onEvent({ step, status, ts: new Date().toISOString(), ...extra });
    } catch {
      // Never let event emission crash the machine
    }
  }

  /**
   * Execute the machine from the current persisted state.
   * Returns when all steps complete (or throws on unrecoverable failure).
   */
  async run() {
    for (const step of this.stepDefs) {
      const state = this.session.getStepState(step.id);

      if (state === "complete") {
        // Step already done — restore context from persisted session data, skip.
        if (typeof step.restoreCtx === "function") {
          step.restoreCtx(this.context, this.session.getData());
        }
        this._emit(step.id, "skipped");
        continue;
      }

      this.session.markStarted(step.id);
      this._emit(step.id, "started");

      const timeoutMs =
        typeof step.timeout === "number" ? step.timeout : DEFAULT_STEP_TIMEOUT_MS;

      try {
        const result = await withTimeout(
          Promise.resolve().then(() => step.execute(this.context)),
          timeoutMs,
          step.id
        );

        // Merge partial context updates returned by execute()
        if (result !== null && result !== undefined && typeof result === "object") {
          Object.assign(this.context, result);
        }

        this.session.markComplete(step.id, this.context);
        this._emit(step.id, "complete");
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.session.markFailed(step.id, errMsg);
        this._emit(step.id, "failed", { error: errMsg });

        // Attempt recovery via step-level onError handler
        let recovered = false;
        if (typeof step.onError === "function") {
          try {
            recovered = !!(await step.onError(err, this.context));
          } catch {
            // onError itself threw — treat as unrecovered
          }
        }

        if (step.nonFatal || recovered) {
          // Non-fatal or explicitly recovered — continue to next step
          continue;
        }

        // Unrecoverable — propagate to caller
        throw err;
      }
    }
  }
}

module.exports = {
  DEFAULT_STEP_TIMEOUT_MS,
  OnboardMachine,
  TimeoutError,
  makeSessionAdapter,
  withTimeout,
};
