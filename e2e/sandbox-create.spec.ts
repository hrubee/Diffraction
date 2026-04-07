/**
 * End-to-end test: Create Sandbox → Ready → Chat iframe
 *
 * Topology:
 *   - Next.js UI runs in a Docker container (or local dev server).
 *   - All /api/* calls are intercepted by Playwright route mocking so no real
 *     backend, OpenShell runtime, or NVIDIA credits are required.
 *   - The mock simulates the full provisioning lifecycle: the sandbox goes from
 *     "not found" (provisioning) to "ready" after a brief delay, exactly as the
 *     real backend behaves when `diffract onboard` completes.
 *
 * What is tested:
 *   1. Login flow (stub auth — /api/auth/me returns 200 so page auto-redirects).
 *   2. Navigate to /sandboxes/new, fill name + NVIDIA key, select model.
 *   3. Submit form → redirect to /sandboxes/e2e-test.
 *   4. Detail page transitions from "provisioning" banner to the tabbed "ready" view.
 *   5. Chat tab renders an <iframe> whose src contains diffract_chat.
 */

import { test, expect, type Page } from "@playwright/test";

// ── Constants ──────────────────────────────────────────────────────────────────

const SANDBOX_NAME = "e2e-test";
const STUB_NVIDIA_KEY = "nvapi-stub-e2e-key-00000000000000000000000000000000";

const MOCK_SANDBOX = {
  id: "mock-001",
  name: SANDBOX_NAME,
  namespace: "default",
  phase: "Running",
  created_at_ms: String(Date.now()),
  current_policy_version: 1,
  spec: {
    provider: "nvidia",
    model: "nvidia/nemotron-3-super-120b-a12b",
  },
  status: {
    sandbox_name: SANDBOX_NAME,
    conditions: [
      {
        type: "Ready",
        status: "True",
        reason: "SandboxReady",
        message: "Sandbox is ready",
      },
    ],
  },
};

// ── Route mocking ──────────────────────────────────────────────────────────────

// Install a single catch-all API mock via page.route("glob:**/api/**").
// Dispatches on method + pathname so specific and general routes don't collide.
// notReadyCount: how many GET /api/sandboxes/:name calls return 404 before ready.
async function mockApiRoutes(page: Page, notReadyCount = 3): Promise<void> {
  let sandboxGetCount = 0;

  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;

    // ── Auth ─────────────────────────────────────────────────────────────────

    if (path === "/api/auth/status") {
      return route.fulfill({ json: { setupRequired: false } });
    }

    if (path === "/api/auth/me") {
      // Always authenticated — login page will auto-redirect
      return route.fulfill({ status: 200, json: { ok: true, username: "admin" } });
    }

    if (path === "/api/auth/login") {
      return route.fulfill({
        status: 200,
        headers: {
          "Set-Cookie": "diffract_session=mock-token; Path=/; HttpOnly",
        },
        json: { ok: true },
      });
    }

    if (path === "/api/auth/logout") {
      return route.fulfill({ json: { ok: true } });
    }

    // ── Health ────────────────────────────────────────────────────────────────

    if (path === "/api/health") {
      return route.fulfill({ json: { status: "ok", version: "e2e-mock" } });
    }

    // ── Sandbox list (POST = create, GET = list) ──────────────────────────────

    if (path === "/api/sandboxes") {
      if (method === "POST") {
        return route.fulfill({ status: 202, json: MOCK_SANDBOX });
      }
      return route.fulfill({ json: { sandboxes: [] } });
    }

    // ── Sandbox detail ────────────────────────────────────────────────────────

    if (path === `/api/sandboxes/${SANDBOX_NAME}`) {
      if (method === "DELETE") {
        return route.fulfill({ json: { deleted: true } });
      }
      // GET: return 404 for the first notReadyCount calls, then return sandbox
      sandboxGetCount++;
      if (sandboxGetCount <= notReadyCount) {
        return route.fulfill({ status: 404, json: { error: "not found" } });
      }
      return route.fulfill({ json: MOCK_SANDBOX });
    }

    // ── Sandbox restart-gateway ───────────────────────────────────────────────

    if (path === `/api/sandboxes/${SANDBOX_NAME}/restart-gateway`) {
      return route.fulfill({ json: { healthy: true } });
    }

    // ── Onboard status (provisioning progress) ────────────────────────────────

    if (path === `/api/onboard-status/${SANDBOX_NAME}`) {
      return route.fulfill({
        json: {
          active: true,
          exitCode: null,
          tail: [
            "[1/6] Pulling base image...",
            "[2/6] Configuring network namespace...",
            "[3/6] Injecting inference route...",
            "[4/6] Applying policy presets...",
          ],
          elapsedMs: 4500,
        },
      });
    }

    // ── Draft / active policy ─────────────────────────────────────────────────

    if (path === `/api/draft-policy/${SANDBOX_NAME}`) {
      return route.fulfill({
        json: { chunks: [], draft_version: 0, last_analyzed_at_ms: 0 },
      });
    }

    if (path === `/api/active-policy/${SANDBOX_NAME}`) {
      return route.fulfill({ json: { policy: null } });
    }

    // ── Gateway token (used by ChatPanel) ─────────────────────────────────────

    if (path === "/api/gateway-token") {
      return route.fulfill({ json: { token: "mock-gateway-token-e2e" } });
    }

    // ── Logs ──────────────────────────────────────────────────────────────────

    if (path.startsWith("/api/logs/")) {
      return route.fulfill({ json: { lines: [] } });
    }

    // ── Providers / models / skills (sidebar/nav calls) ───────────────────────

    if (path === "/api/providers") {
      return route.fulfill({ json: { providers: [] } });
    }
    if (path === "/api/models") {
      return route.fulfill({ json: { models: [] } });
    }
    if (path === "/api/skills") {
      return route.fulfill({ json: { skills: [] } });
    }

    // ── Fallback: pass through (shouldn't normally hit this) ──────────────────
    return route.fulfill({ status: 404, json: { error: "mock: no route" } });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** The detail page uses plain <button> elements for tabs (not role="tab"). */
function tabButton(page: Page, label: string | RegExp) {
  return page.getByRole("button", { name: label }).first();
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe("Create sandbox → ready → chat iframe", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
  });

  test("login page redirects authenticated user to home", async ({ page }) => {
    // /api/auth/me returns 200 → login page auto-redirects on mount
    await page.goto("/login");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("create sandbox form submits and navigates to detail page", async ({
    page,
  }) => {
    await page.goto("/sandboxes/new");

    // Fill sandbox name
    await page.locator("#sandbox-name").fill(SANDBOX_NAME);

    // Fill NVIDIA API key
    await page.locator("#nvidia-api-key").fill(STUB_NVIDIA_KEY);

    // Submit — wait for the POST to complete
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/sandboxes") && r.request().method() === "POST"
      ),
      page.getByRole("button", { name: /create/i }).click(),
    ]);
    expect(response.status()).toBe(202);

    // Should redirect to the sandbox detail page
    await expect(page).toHaveURL(new RegExp(`/sandboxes/${SANDBOX_NAME}`), {
      timeout: 15_000,
    });
  });

  test("detail page shows provisioning banner then transitions to ready", async ({
    page,
  }) => {
    // Navigate directly (as if redirected after form submit)
    await page.goto(`/sandboxes/${SANDBOX_NAME}`);

    // While the first N GET /api/sandboxes/:name calls return 404, the page
    // shows the provisioning panel (amber pulse dot + "Provisioning <name>…").
    await expect(
      page.getByText(new RegExp(`Provisioning ${SANDBOX_NAME}`, "i"))
    ).toBeVisible({ timeout: 10_000 });

    // After notReadyCount=3 poll cycles (3 × 3s ≈ 9s), the mock returns the
    // sandbox and the page transitions to the tabbed "ready" view.
    // The tab bar uses plain <button> elements; wait for "Overview" to appear.
    await expect(tabButton(page, /overview/i)).toBeVisible({ timeout: 30_000 });

    // Provisioning banner should be gone
    await expect(
      page.getByText(new RegExp(`Provisioning ${SANDBOX_NAME}`, "i"))
    ).not.toBeVisible();
  });

  test("chat tab renders iframe with diffract_chat src", async ({ page }) => {
    // Re-mock with notReadyCount=0 so the sandbox is immediately ready
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockApiRoutes(page, 0);

    await page.goto(`/sandboxes/${SANDBOX_NAME}`);

    // Wait for ready state (Overview tab button visible)
    await expect(tabButton(page, /overview/i)).toBeVisible({ timeout: 20_000 });

    // Click the Chat tab
    await tabButton(page, /^chat$/i).click();

    // The iframe src should contain diffract_chat and the sandbox name
    const iframe = page.locator("iframe");
    await expect(iframe).toBeVisible({ timeout: 10_000 });
    const src = await iframe.getAttribute("src");
    expect(src).toContain("diffract_chat");
    expect(src).toContain(SANDBOX_NAME);
  });

  test("full flow: login → create → provision → ready → chat", async ({
    page,
  }) => {
    // 1. Start at login — should be redirected (auth mock returns 200 for /me)
    await page.goto("/login");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // 2. Navigate to new sandbox form
    await page.goto("/sandboxes/new");
    await expect(page).toHaveURL(/\/sandboxes\/new/);

    // 3. Fill form
    await page.locator("#sandbox-name").fill(SANDBOX_NAME);
    await page.locator("#nvidia-api-key").fill(STUB_NVIDIA_KEY);

    // 4. Submit
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/sandboxes") && r.request().method() === "POST"
      ),
      page.getByRole("button", { name: /create/i }).click(),
    ]);
    expect(response.status()).toBe(202);

    // 5. Redirected to detail page → provisioning banner visible
    await expect(page).toHaveURL(new RegExp(`/sandboxes/${SANDBOX_NAME}`), {
      timeout: 15_000,
    });
    await expect(
      page.getByText(new RegExp(`Provisioning ${SANDBOX_NAME}`, "i"))
    ).toBeVisible({ timeout: 10_000 });

    // 6. Transition to ready
    await expect(tabButton(page, /overview/i)).toBeVisible({ timeout: 30_000 });

    // 7. Chat tab → iframe with diffract_chat
    await tabButton(page, /^chat$/i).click();
    const iframe = page.locator("iframe");
    await expect(iframe).toBeVisible({ timeout: 10_000 });
    const src = await iframe.getAttribute("src");
    expect(src).toContain("diffract_chat");
    expect(src).toContain(SANDBOX_NAME);
  });
});
