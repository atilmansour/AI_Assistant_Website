/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium, firefox, webkit } = require("playwright");

const CONFIG = {
  baseUrl: (process.env.BASE_URL || "https://your-site.example.com").replace(
    /\/$/,
    "",
  ),
  browsers: (process.env.BROWSERS || "chromium")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  repetitions: Number(process.env.REPETITIONS || 1),
  wordThreshold: Number(process.env.WORD_THRESHOLD || 50),
  minDurationMs: Number(process.env.MIN_DURATION_MS || 180000),
  realDuration: /^true$/i.test(process.env.REAL_DURATION || ""),
  realSubmit: /^true$/i.test(process.env.REAL_SUBMIT || ""),
  useRealLLM: /^true$/i.test(process.env.USE_REAL_LLM || ""),
  runGuardChecks: !/^false$/i.test(process.env.RUN_GUARD_CHECKS || ""),
  runNavigationChecks: !/^false$/i.test(
    process.env.RUN_NAVIGATION_CHECKS || "",
  ),
  navigationAwayMs: Number(process.env.NAVIGATION_AWAY_MS || 5000),
  outputDir: path.resolve(process.env.OUTPUT_DIR || "validation-results"),
  headless: !/^false$/i.test(process.env.HEADLESS || "true"),
};

const CONDITIONS = [
  {
    name: "No LLM / control",
    route: "/c",
    idPattern: /^OL[A-Z0-9]{5}C$/,
    hasEditor: true,
    hasChat: false,
    expectsChatEvents: false,
  },
  {
    name: "Always Visible LLM",
    route: "/u",
    idPattern: /^AVL[A-Z0-9]{5}U$/,
    hasEditor: true,
    hasChat: true,
    expectsChatEvents: false,
  },
  {
    name: "Toggleable LLM",
    route: "/o",
    idPattern: /^TL[A-Z0-9]{5}O$/,
    hasEditor: true,
    hasChat: true,
    expectsChatEvents: true,
    expectedEventTypes: [
      "chat_auto_open",
      "chat_open",
      "chat_collapse",
      "chat_expand",
    ],
  },
  {
    name: "Participant-Initiated LLM",
    route: "/b",
    idPattern: /^PI[A-Z0-9]{5}B$/,
    hasEditor: true,
    hasChat: true,
    expectsChatEvents: true,
    expectedEventTypes: ["chat_open", "chat_collapse", "chat_expand"],
    opensChatByButton: true,
    expectsButtonPressed: true,
  },
  {
    name: "Only Chat",
    route: "/a",
    idPattern: /^OC[A-Z0-9]{5}A$/,
    hasEditor: false,
    hasChat: true,
    expectsChatEvents: false,
  },
];

const LONG_TEXT = [
  "This validation participant writes a complete response for the automated platform test.",
  "The text is deliberately longer than the required threshold so the submission rule can be checked.",
  "It includes several sentences, repeated spaces between normal words, and enough ordinary writing behavior to create editor snapshots.",
  "After consulting the assistant, the participant adds a final sentence confirming that the task is ready for submission.",
].join(" ");

const SHORT_TEXT = "Too short for submission.";

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function browserLauncher(name) {
  if (name === "chromium") return chromium;
  if (name === "firefox") return firefox;
  if (name === "webkit") return webkit;
  if (name === "edge" || name === "msedge") return chromium;
  throw new Error(`Unsupported browser: ${name}`);
}

function browserLaunchOptions(name) {
  const options = { headless: CONFIG.headless };
  if (name === "edge" || name === "msedge") options.channel = "msedge";
  return options;
}

async function addValidationClock(context) {
  await context.addInitScript(
    ({ speedUpTimers }) => {
      const realDateNow = Date.now.bind(Date);
      let offsetMs = 0;
      Date.now = () => realDateNow() + offsetMs;

      try {
        const realPerformanceNow = performance.now.bind(performance);
        Object.defineProperty(performance, "now", {
          configurable: true,
          value: () => realPerformanceNow() + offsetMs,
        });
      } catch {
        // Some browsers may not allow overriding performance.now. Date.now is enough
        // for the platform's 3-minute submit rule.
      }

      window.__validationAdvanceTime = (ms) => {
        offsetMs += ms;
      };

      if (speedUpTimers) {
        const realSetTimeout = window.setTimeout.bind(window);
        window.setTimeout = (fn, delay, ...args) =>
          realSetTimeout(fn, Number(delay) > 2000 ? 250 : delay, ...args);
      }
    },
    { speedUpTimers: !CONFIG.realDuration },
  );
}

async function installRoutes(page, condition, runId) {
  const captured = {
    logPayload: null,
    logResponse: null,
    logUrl: null,
    aiRequests: [],
    aiResponses: [],
  };

  if (!CONFIG.useRealLLM) {
    await page.route("**/api/ai", async (route) => {
      const body = route.request().postDataJSON();
      captured.aiRequests.push(body);
      const mockBody = {
        text: `MOCK_LLM_RESPONSE_${condition.route.replace("/", "").toUpperCase()}_${runId}`,
        provider: body.provider || "mock",
        model: body.model || "mock-model",
      };
      captured.aiResponses.push({ status: 200, body: mockBody });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockBody),
      });
    });
  } else {
    page.on("request", (request) => {
      if (request.url().includes("/api/ai")) {
        captured.aiRequests.push(request.postDataJSON());
      }
    });

    page.on("response", async (response) => {
      if (response.url().includes("/api/ai")) {
        captured.aiResponses.push({
          status: response.status(),
          body: await response.json().catch(async () => ({
            text: await response.text().catch(() => ""),
          })),
        });
      }
    });
  }

  await page.route("**/api/logs", async (route) => {
    captured.logPayload = route.request().postDataJSON();
    captured.logUrl = route.request().url();

    if (CONFIG.realSubmit) {
      await route.continue();
    } else {
      const id =
        captured.logPayload &&
        captured.logPayload.logs &&
        captured.logPayload.logs.id;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          key: `${id || "captured"}.txt`,
          dryRun: true,
        }),
      });
    }
  });

  page.on("response", async (response) => {
    if (response.url().includes("/api/logs")) {
      captured.logResponse = {
        url: response.url(),
        status: response.status(),
        body: await response.text().catch(() => ""),
      };
    }
  });

  page.on("dialog", async (dialog) => {
    captured.alert = dialog.message();
    await dialog.accept();
  });

  return captured;
}

async function closeEarlyModalIfOpen(page) {
  const cancel = page.getByRole("button", { name: "Cancel" });
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click();
  }
}

async function typeInEditor(page, text) {
  const editor = page.locator(".ql-editor").first();
  await editor.waitFor({ state: "visible", timeout: 15000 });
  await editor.click();
  await page.keyboard.type(text, { delay: 1 });
}

async function sendChatMessage(page, message) {
  const input = page
    .locator('input[placeholder="Type your message..."]')
    .first();
  await input.waitFor({ state: "visible", timeout: 15000 });
  const assistantBefore = await page
    .locator("#messages-history .LLMAssistant")
    .count();
  await input.fill(message);
  await page.getByRole("button", { name: "Send" }).click();
  if (CONFIG.useRealLLM) {
    await page.waitForFunction(
      (before) =>
        document.querySelectorAll("#messages-history .LLMAssistant").length >
        before,
      assistantBefore,
      { timeout: 90000 },
    );
  } else {
    await page
      .getByText(/MOCK_LLM_RESPONSE_/)
      .waitFor({ state: "visible", timeout: 15000 });
  }
}

async function advancePastDuration(page) {
  if (CONFIG.realDuration) {
    await page.waitForTimeout(CONFIG.minDurationMs + 1000);
  } else {
    await page.evaluate(
      (ms) => window.__validationAdvanceTime(ms),
      CONFIG.minDurationMs + 1000,
    );
    await page.waitForTimeout(700);
  }
}

async function closeNavigationWarningIfOpen(page) {
  const understood = page.getByRole("button", { name: "I understand" });
  if (await understood.isVisible().catch(() => false)) {
    await understood.click();
  }
}

async function simulatePageAwayAndReturn(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
  });

  if (CONFIG.realDuration) {
    await page.waitForTimeout(CONFIG.navigationAwayMs);
  } else {
    await page.evaluate(
      (ms) => window.__validationAdvanceTime(ms),
      CONFIG.navigationAwayMs,
    );
    await page.waitForTimeout(300);
  }

  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForTimeout(500);
  await closeNavigationWarningIfOpen(page);
}

async function submitAndCapture(page, captured) {
  await page.getByRole("button", { name: "Submit" }).click();
  await page
    .getByText("Are you sure you want to submit?")
    .waitFor({ state: "visible", timeout: 10000 });

  // Give the editor component time to send its final snapshot to the parent
  // after the confirmation modal opens.
  await page.waitForTimeout(750);

  const confirm = page.getByRole("button", { name: "Confirm" });
  await Promise.all([
    page
      .waitForResponse((res) => res.url().includes("/api/logs"), {
        timeout: 30000,
      })
      .catch(() => null),
    confirm.click(),
  ]);

  await page.waitForTimeout(1000);
  assert(
    captured.logPayload && captured.logPayload.logs,
    "No /api/logs payload was captured.",
  );
  if (captured.logResponse) {
    assert(
      captured.logResponse.status >= 200 && captured.logResponse.status < 300,
      `/api/logs returned ${captured.logResponse.status}.`,
    );
  }
  return captured.logPayload.logs;
}

function validateLog(condition, logs, runId) {
  const checks = [];
  const fail = (name, details) => checks.push({ name, ok: false, details });
  const pass = (name, details = "") => checks.push({ name, ok: true, details });

  try {
    assert(
      condition.idPattern.test(logs.id),
      `Unexpected session id: ${logs.id}`,
    );
    pass("condition_id_pattern", logs.id);
  } catch (err) {
    fail("condition_id_pattern", err.message);
  }

  if (condition.hasEditor) {
    try {
      assert(
        Array.isArray(logs.editor),
        "logs.editor is missing or not an array.",
      );
      assert(logs.editor.length > 0, "logs.editor is empty.");
      const finalText = stripHtml(logs.editor[logs.editor.length - 1].text);
      assert(
        wordCount(finalText) >= CONFIG.wordThreshold,
        `Final editor text has ${wordCount(finalText)} words.`,
      );
      assert(
        finalText.includes("validation participant"),
        "Final editor text does not contain the scripted text.",
      );
      assert(
        logs.editor.every((item) => typeof item.t_ms === "number"),
        "One or more editor snapshots lacks numeric t_ms.",
      );
      pass("editor_snapshots", `${logs.editor.length} snapshots`);
    } catch (err) {
      fail("editor_snapshots", err.message);
    }
  } else {
    try {
      assert(
        !("editor" in logs),
        "Chat-only condition should not submit an editor field.",
      );
      pass("no_editor_expected");
    } catch (err) {
      fail("no_editor_expected", err.message);
    }
  }

  if (condition.hasChat) {
    try {
      assert(
        Array.isArray(logs.messages),
        "logs.messages is missing or not an array.",
      );
      assert(
        logs.messages.some(
          (msg) =>
            msg.sender === "user" &&
            String(msg.text).includes(`VALIDATION_CHAT_${runId}`),
        ),
        "Scripted user message was not recorded.",
      );
      const assistantMessages = logs.messages.filter(
        (msg) => msg.sender === "LLMAssistant",
      );
      assert(
        assistantMessages.length >= 1,
        "No assistant message was recorded.",
      );
      if (CONFIG.useRealLLM) {
        assert(
          assistantMessages.some(
            (msg) =>
              String(msg.text || "").trim().length > 0 &&
              !/Sorry, an error occurred\./i.test(String(msg.text)),
          ),
          "No non-error real assistant response was recorded.",
        );
      } else {
        assert(
          assistantMessages.some((msg) =>
            String(msg.text).includes(
              `MOCK_LLM_RESPONSE_${condition.route.replace("/", "").toUpperCase()}_${runId}`,
            ),
          ),
          "Mock assistant response was not recorded.",
        );
      }
      assert(logs.LLMProvider, "LLMProvider is missing.");
      assert(logs.LLMModel, "LLMModel is missing.");
      pass("chat_messages", `${logs.messages.length} messages`);
    } catch (err) {
      fail("chat_messages", err.message);
    }
  } else {
    try {
      assert(
        !("messages" in logs),
        "No-LLM condition should not submit messages.",
      );
      pass("no_messages_expected");
    } catch (err) {
      fail("no_messages_expected", err.message);
    }
  }

  if (condition.expectsChatEvents) {
    try {
      assert(
        Array.isArray(logs.chatEvents),
        "chatEvents is missing or not an array.",
      );
      const types = logs.chatEvents.map((event) => event.type);
      for (const expectedType of condition.expectedEventTypes || []) {
        assert(
          types.includes(expectedType),
          `Missing chat event: ${expectedType}`,
        );
      }
      assert(
        logs.chatEvents.every((event) => typeof event.t_ms === "number"),
        "One or more chat events lacks numeric t_ms.",
      );
      pass("chat_events", types.join(", "));
    } catch (err) {
      fail("chat_events", err.message);
    }
  }

  if (condition.expectsButtonPressed) {
    try {
      assert(
        typeof logs.ButtonPressed === "number",
        "ButtonPressed is missing or not numeric.",
      );
      pass("button_pressed_time", String(logs.ButtonPressed));
    } catch (err) {
      fail("button_pressed_time", err.message);
    }
  }

  try {
    assert(
      Number(logs.NumOfSubmitClicks) >= 1,
      "NumOfSubmitClicks should be at least 1.",
    );
    assert(
      Array.isArray(logs.TimeStampOfSubmitClicks),
      "TimeStampOfSubmitClicks is missing or not an array.",
    );
    assert(
      logs.TimeStampOfSubmitClicks.length >= 1,
      "No submit-click timestamp was recorded.",
    );
    assert(
      logs.TimeStampOfSubmitClicks.every((t) => typeof t === "number"),
      "Submit-click timestamps must be numeric.",
    );
    pass("submit_attempts", `${logs.NumOfSubmitClicks} clicks`);
  } catch (err) {
    fail("submit_attempts", err.message);
  }

  if (CONFIG.runNavigationChecks) {
    try {
      assert(
        typeof logs.navigatedAway === "number",
        "navigatedAway is missing or not numeric.",
      );
      assert(
        logs.navigatedAway >= 1,
        `Expected at least 1 navigation-away event; observed ${logs.navigatedAway}.`,
      );
      assert(
        typeof logs.totalNavigatedAwayMs === "number",
        "totalNavigatedAwayMs is missing or not numeric.",
      );
      assert(
        logs.totalNavigatedAwayMs > 0,
        `Expected positive time-away duration; observed ${logs.totalNavigatedAwayMs}.`,
      );
      assert(
        Array.isArray(logs.navigatedAwayExplained),
        "navigatedAwayExplained is missing or not an array.",
      );
      assert(
        logs.navigatedAwayExplained.length >= 1,
        "No navigation-away episode was recorded.",
      );
      assert(
        logs.navigatedAwayExplained.some(
          (episode) => episode.reason === "window_blur",
        ),
        "No window_blur navigation-away episode was recorded.",
      );
      assert(
        logs.navigatedAwayExplained.every(
          (episode) =>
            typeof episode.atMs === "number" &&
            typeof episode.returnedAtMs === "number" &&
            typeof episode.durationMs === "number",
        ),
        "One or more navigation-away episodes lacks numeric timing fields.",
      );
      pass(
        "navigation_away_event",
        `${logs.navigatedAway} event(s), ${logs.totalNavigatedAwayMs} ms`,
      );
    } catch (err) {
      fail("navigation_away_event", err.message);
    }
  } else {
    try {
      assert(
        typeof logs.navigatedAway === "number",
        "navigatedAway is missing or not numeric.",
      );
      assert(
        typeof logs.totalNavigatedAwayMs === "number",
        "totalNavigatedAwayMs is missing or not numeric.",
      );
      assert(
        Array.isArray(logs.navigatedAwayExplained),
        "navigatedAwayExplained is missing or not an array.",
      );
      pass("navigation_fields_present");
    } catch (err) {
      fail("navigation_fields_present", err.message);
    }
  }

  return checks;
}

async function verifyAdminSession(captured, sessionId) {
  if (!CONFIG.realSubmit || !process.env.ADMIN_PASSWORD || !captured.logUrl) {
    return { checked: false, ok: null, details: "Admin verification skipped." };
  }

  const apiBase = captured.logUrl.replace(/\/api\/logs.*$/i, "");
  const token = crypto
    .createHash("sha256")
    .update(`${process.env.ADMIN_PASSWORD}:admin_access_2026`)
    .digest("hex");

  const response = await fetch(`${apiBase}/api/admin/sessions`, {
    headers: { "X-Admin-Token": token },
  });

  if (!response.ok) {
    return {
      checked: true,
      ok: false,
      details: `Admin endpoint returned ${response.status}.`,
    };
  }

  const data = await response.json();
  const found =
    Array.isArray(data.sessions) &&
    data.sessions.some(
      (s) => s.session_id === sessionId || s.key === `${sessionId}.txt`,
    );
  return {
    checked: true,
    ok: found,
    details: found
      ? "Session found in admin export."
      : "Session not found in admin export.",
  };
}

async function runValidSession(browserName, condition, repetition) {
  const launcher = browserLauncher(browserName);
  const browser = await launcher.launch(browserLaunchOptions(browserName));
  const context = await browser.newContext();
  await addValidationClock(context);
  const page = await context.newPage();
  const runId = `${browserName}_${condition.route.replace("/", "")}_${repetition}`;
  const captured = await installRoutes(page, condition, runId);

  try {
    await page.goto(`${CONFIG.baseUrl}${condition.route}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (condition.hasEditor) {
      await typeInEditor(page, LONG_TEXT);
    }

    if (condition.opensChatByButton) {
      await page.locator(".ql-ai").click();
    }

    if (condition.route === "/o") {
      await page
        .locator(".chat-handle")
        .waitFor({ state: "visible", timeout: 10000 });
      await page.locator(".chat-handle").click();
      await page.waitForTimeout(200);
      await page.locator(".chat-handle").click();
    }

    if (condition.route === "/b") {
      await page
        .locator(".chat-handle")
        .waitFor({ state: "visible", timeout: 10000 });
      await page.locator(".chat-handle").click();
      await page.waitForTimeout(200);
      await page.locator(".chat-handle").click();
    }

    if (condition.hasChat) {
      await sendChatMessage(
        page,
        `VALIDATION_CHAT_${runId}: Please provide one short suggestion.`,
      );
    }

    if (CONFIG.runNavigationChecks) {
      await simulatePageAwayAndReturn(page);
    }

    await advancePastDuration(page);
    const logs = await submitAndCapture(page, captured);
    const checks = validateLog(condition, logs, runId);
    const admin = await verifyAdminSession(captured, logs.id);
    if (admin.checked) {
      checks.push({
        name: "admin_export_contains_session",
        ok: admin.ok,
        details: admin.details,
      });
    }

    const ok = checks.every((check) => check.ok);
    return {
      kind: "valid_session",
      browser: browserName,
      condition: condition.name,
      route: condition.route,
      repetition,
      session_id: logs.id,
      ok,
      checks,
      real_submit: CONFIG.realSubmit,
    };
  } catch (err) {
    return {
      kind: "valid_session",
      browser: browserName,
      condition: condition.name,
      route: condition.route,
      repetition,
      session_id: "",
      ok: false,
      error: err.stack || err.message,
      checks: [],
      real_submit: CONFIG.realSubmit,
    };
  } finally {
    await browser.close();
  }
}

async function expectEarlyBlock(page, captured, label) {
  const before = captured.logPayload;
  await page.getByRole("button", { name: "Submit" }).click();
  await page.locator(".modal").waitFor({ state: "visible", timeout: 10000 });
  const modalText = await page.locator(".modal").innerText();
  assert(
    !/Are you sure you want to submit\?/i.test(modalText),
    `${label}: confirmation modal opened when early block was expected.`,
  );
  assert(
    captured.logPayload === before,
    `${label}: /api/logs was called during blocked submission.`,
  );
  await closeEarlyModalIfOpen(page);
}

async function runGuardChecks(browserName) {
  const launcher = browserLauncher(browserName);
  const browser = await launcher.launch(browserLaunchOptions(browserName));
  const context = await browser.newContext();
  await addValidationClock(context);
  const page = await context.newPage();
  const condition = CONDITIONS.find((c) => c.route === "/c");
  const captured = await installRoutes(page, condition, `guard_${browserName}`);
  const checks = [];

  try {
    await page.goto(`${CONFIG.baseUrl}/c`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await typeInEditor(page, SHORT_TEXT);
    await expectEarlyBlock(page, captured, "short text before time");
    checks.push({
      name: "blocks_short_text_before_time",
      ok: true,
      details: "",
    });

    await advancePastDuration(page);
    await expectEarlyBlock(page, captured, "short text after time");
    checks.push({
      name: "blocks_short_text_after_time",
      ok: true,
      details: "",
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await typeInEditor(page, LONG_TEXT);
    await expectEarlyBlock(page, captured, "long text before time");
    checks.push({
      name: "blocks_long_text_before_time",
      ok: true,
      details: "",
    });

    return {
      kind: "guard_checks",
      browser: browserName,
      condition: "No LLM / control",
      route: "/c",
      repetition: 0,
      session_id: "",
      ok: true,
      checks,
      real_submit: false,
    };
  } catch (err) {
    checks.push({
      name: "guard_checks_error",
      ok: false,
      details: err.message,
    });
    return {
      kind: "guard_checks",
      browser: browserName,
      condition: "No LLM / control",
      route: "/c",
      repetition: 0,
      session_id: "",
      ok: false,
      error: err.stack || err.message,
      checks,
      real_submit: false,
    };
  } finally {
    await browser.close();
  }
}

function summarize(results) {
  const valid = results.filter((r) => r.kind === "valid_session");
  const attempted = valid.length;
  const successful = valid.filter((r) => r.ok).length;
  const failed = attempted - successful;

  const checkRows = [];
  for (const result of results) {
    for (const check of result.checks || []) {
      checkRows.push({
        browser: result.browser,
        condition: result.condition,
        route: result.route,
        kind: result.kind,
        check: check.name,
        ok: check.ok,
        details: check.details || "",
      });
    }
  }

  const byCheck = {};
  for (const row of checkRows) {
    byCheck[row.check] ||= { passed: 0, failed: 0 };
    if (row.ok) byCheck[row.check].passed += 1;
    else byCheck[row.check].failed += 1;
  }

  return {
    generated_at: new Date().toISOString(),
    config: CONFIG,
    attempted_valid_sessions: attempted,
    successful_valid_sessions: successful,
    failed_valid_sessions: failed,
    data_loss_rate_for_valid_sessions: attempted ? failed / attempted : null,
    by_check: byCheck,
  };
}

function writeResults(results, summary) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  const jsonPath = path.join(
    CONFIG.outputDir,
    "technical-validation-results.json",
  );
  const csvPath = path.join(
    CONFIG.outputDir,
    "technical-validation-results.csv",
  );

  fs.writeFileSync(jsonPath, JSON.stringify({ summary, results }, null, 2));

  const rows = [
    "kind,browser,condition,route,repetition,session_id,ok,failed_checks,error",
  ];
  for (const result of results) {
    const failedChecks = (result.checks || [])
      .filter((check) => !check.ok)
      .map((check) => `${check.name}: ${check.details}`)
      .join(" | ");
    rows.push(
      [
        result.kind,
        result.browser,
        result.condition,
        result.route,
        result.repetition,
        result.session_id,
        result.ok,
        failedChecks,
        result.error || "",
      ]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
  }
  fs.writeFileSync(csvPath, `${rows.join("\n")}\n`);

  return { jsonPath, csvPath };
}

async function main() {
  console.log("Technical validation runner");
  console.log(`Base URL: ${CONFIG.baseUrl}`);
  console.log(`Browsers: ${CONFIG.browsers.join(", ")}`);
  console.log(`Repetitions per condition/browser: ${CONFIG.repetitions}`);
  console.log(`Real submit: ${CONFIG.realSubmit}`);
  console.log(`Use real LLM API: ${CONFIG.useRealLLM}`);
  console.log(`Real duration wait: ${CONFIG.realDuration}`);

  const results = [];

  for (const browserName of CONFIG.browsers) {
    if (CONFIG.runGuardChecks) {
      console.log(`\n[${browserName}] Running guard checks`);
      const guard = await runGuardChecks(browserName);
      results.push(guard);
      console.log(guard.ok ? "  passed" : "  failed");
    }

    for (const condition of CONDITIONS) {
      for (
        let repetition = 1;
        repetition <= CONFIG.repetitions;
        repetition += 1
      ) {
        console.log(
          `\n[${browserName}] ${condition.name} repetition ${repetition}`,
        );
        const result = await runValidSession(
          browserName,
          condition,
          repetition,
        );
        results.push(result);
        console.log(result.ok ? `  passed: ${result.session_id}` : "  failed");
        if (!result.ok && result.error)
          console.log(result.error.split("\n")[0]);
      }
    }
  }

  const summary = summarize(results);
  const outputs = writeResults(results, summary);

  console.log("\nSummary");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputs.jsonPath}`);
  console.log(`Wrote ${outputs.csvPath}`);

  if (summary.failed_valid_sessions > 0 || results.some((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
