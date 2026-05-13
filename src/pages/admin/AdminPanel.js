/*
  AdminPanel.js

  This file defines the researcher-facing admin dashboard for reviewing experiment sessions.
  It loads submitted sessions from the backend, displays summary statistics by condition,
  allows researchers to search/filter submissions, inspect individual session details
  (messages, text-editor progress, configuration, and raw logs), export the data as CSV/JSON,
  and delete sessions when needed.

  CONFIG YOU WILL EDIT:
  Researchers may customize the displayed condition names, condition colors, table columns,
  exported fields, and dashboard labels to match their own study design.
*/

import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5050";

// Main admin table columns
// The `key` should match a field created in normalizeSession() below.
// The `label` is what researchers see in the dashboard.
// The `tooltip` explains the measure when researchers hover over the column.
const TABLE_COLUMNS = [
  {
    key: "session_id",
    label: "Session ID",
    tooltip: "Unique experiment/session identifier.",
  },
  {
    key: "condition",
    label: "Condition",
    tooltip: "Experiment condition type.",
  },
  {
    key: "rounds_of_interaction",
    label: "Rounds of Interaction",
    tooltip:
      "Number of participant-to-AI interaction rounds, derived from participant chat messages.",
  },
  {
    key: "final_word_count",
    label: "Final Words",
    tooltip: "Final word count in the submitted text editor content.",
  },
  {
    key: "session_duration",
    label: "Duration",
    tooltip:
      "Approximate total experiment duration from the latest saved timestamp.",
  },
  {
    key: "participant_message_count",
    label: "Participant Msgs",
    tooltip: "Number of participant chat messages.",
  },
  {
    key: "ai_message_count",
    label: "LLM Msgs",
    tooltip: "Number of LLM assistant responses.",
  },
  { key: "created_at", label: "Submitted", tooltip: "Submission/upload time." },
];

const ACTIONS_TOOLTIP = "Available admin actions for the session.";
const TOOLTIP_DELAY_MS = 800;

// CONFIG YOU WILL EDIT: Experimental condition names
// These labels appear in the admin filter and summary cards.
// If you rename conditions in your study, update the labels here too.
const CONDITIONS = [
  "No LLM / control",
  "Always Visible LLM",
  "Toggleable LLM",
  "Participant-Initiated LLM",
  "Only Chat",
];

// CONFIG YOU WILL EDIT: Condition colors in the admin dashboard
// Edit these colors if you want condition badges/cards to match your study materials.
// Keep the same condition names as in CONDITIONS above.
const CONDITION_STYLES = {
  "No LLM / control": {
    background: "#eef2f7",
    border: "#cbd5e1",
    color: "#334155",
    accent: "#64748b",
  },
  "Always Visible LLM": {
    background: "#e0f2fe",
    border: "#7dd3fc",
    color: "#075985",
    accent: "#0284c7",
  },
  "Toggleable LLM": {
    background: "#ecfdf5",
    border: "#86efac",
    color: "#166534",
    accent: "#16a34a",
  },
  "Participant-Initiated LLM": {
    background: "#fef3c7",
    border: "#fcd34d",
    color: "#92400e",
    accent: "#d97706",
  },
  "Only Chat": {
    background: "#f3e8ff",
    border: "#d8b4fe",
    color: "#6b21a8",
    accent: "#9333ea",
  },
};

const UNKNOWN_CONDITION_STYLE = {
  background: "#f8f9fa",
  border: "#e5e7eb",
  color: "#555",
  accent: "#9ca3af",
};

function getConditionStyle(condition) {
  return CONDITION_STYLES[condition] || UNKNOWN_CONDITION_STYLE;
}

function getConditionBadgeStyle(condition) {
  const conditionStyle = getConditionStyle(condition);
  return {
    background: conditionStyle.background,
    borderColor: conditionStyle.border,
    color: conditionStyle.color,
  };
}

function getConditionCardStyle(condition) {
  const conditionStyle = getConditionStyle(condition);
  return {
    background: conditionStyle.background,
    borderColor: conditionStyle.border,
    borderLeftColor: conditionStyle.accent,
  };
}

function authHeader() {
  const token = sessionStorage.getItem("adminToken") || "";
  return {
    Authorization: `Bearer ${token}`,
    "X-Admin-Token": token,
  };
}

function formatDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

// CONFIG YOU MAY NEED TO EDIT: Condition detection from session IDs
// These rules infer the condition from the session ID prefix/suffix.
// Edit this only if you change the session ID format used by your experimental conditions.
// Example: AVL...U is currently treated as "Always Visible LLM".
function deriveConditionFromId(id = "") {
  if (/^OL[A-Z0-9]+C$/.test(id)) return "No LLM / control";
  if (/^AVL[A-Z0-9]+U$/.test(id)) return "Always Visible LLM";
  if (/^TL[A-Z0-9]+O$/.test(id)) return "Toggleable LLM";
  if (/^PI[A-Z0-9]+B$/.test(id)) return "Participant-Initiated LLM";
  if (/^OC[A-Z0-9]+A$/.test(id)) return "Only Chat";
  return "";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function decodeHtmlEntities(value) {
  if (typeof document === "undefined") return value;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function htmlToPlainText(value) {
  const html = String(value ?? "");
  if (!html) return "";
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ");
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

function countWords(value) {
  const text = htmlToPlainText(value);
  const matches = text.match(/\b[\w']+\b/g);
  return matches ? matches.length : 0;
}

function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "-";

  const totalSeconds = Math.round(value / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function getMessageSender(message) {
  return String(message?.sender || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function isParticipantMessage(message) {
  return getMessageSender(message) === "user";
}

function isAIMessage(message) {
  return ["llmassistant", "assistant", "ai", "model"].includes(
    getMessageSender(message),
  );
}

function getWordCountOverTime(editorProgress) {
  return editorProgress
    .filter((snapshot) => Number.isFinite(Number(snapshot?.t_ms)))
    .map((snapshot) => ({
      t_ms: Number(snapshot.t_ms),
      time: formatDuration(Number(snapshot.t_ms)),
      word_count: countWords(snapshot?.text),
    }));
}

function getSessionDurationMs({ raw, messages, editorProgress }) {
  const timestamps = [];
  const addTimestamp = (value) => {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) timestamps.push(number);
  };

  editorProgress.forEach((snapshot) => addTimestamp(snapshot?.t_ms));
  messages.forEach((message) => addTimestamp(message?.timestamp));
  safeArray(raw?.chatEvents).forEach((event) => addTimestamp(event?.t_ms));
  safeArray(raw?.TimeStampOfSubmitClicks).forEach(addTimestamp);
  addTimestamp(raw?.ButtonPressed);
  safeArray(raw?.navigatedAwayExplained).forEach((event) => {
    addTimestamp(event?.atMs);
    addTimestamp(event?.returnedAtMs);
  });

  return timestamps.length ? Math.max(...timestamps) : null;
}

function normalizeSession(session) {
  const raw = session?.raw_payload_json || session?.logs || session || {};
  const sessionId = String(
    session?.session_id ||
      raw?.id ||
      session?.key?.replace(/\.txt$/i, "") ||
      "",
  );
  const messages = safeArray(session?.full_messages_json || raw?.messages);
  const editorProgress = safeArray(
    session?.editor_progress_json || raw?.editor,
  );
  const finalSubmission =
    session?.final_solution ||
    editorProgress[editorProgress.length - 1]?.text ||
    "";
  const timeAwayMs = Number(raw?.totalNavigatedAwayMs ?? 0);
  const sessionDurationMs = getSessionDurationMs({
    raw,
    messages,
    editorProgress,
  });
  const participantMessageCount = messages.filter(isParticipantMessage).length;
  const aiMessageCount = messages.filter(isAIMessage).length;
  const wordCountOverTime = getWordCountOverTime(editorProgress);
  const finalWordCount = editorProgress.length
    ? countWords(finalSubmission)
    : "-";

  return {
    ...session,
    session_id: sessionId,
    key: session?.key || `${sessionId}.txt`,
    condition: session?.condition || deriveConditionFromId(sessionId),
    rounds_of_interaction:
      session?.total_rounds ??
      messages.filter((message) => message?.sender === "user").length,
    text_editor_snapshots: editorProgress.length,
    message_count: messages.length,
    participant_message_count: participantMessageCount,
    ai_message_count: aiMessageCount,
    final_word_count: finalWordCount,
    session_duration_ms: sessionDurationMs,
    session_duration:
      sessionDurationMs == null ? "-" : formatDuration(sessionDurationMs),
    time_away_ms: Number.isFinite(timeAwayMs) ? timeAwayMs : 0,
    time_away: formatDuration(Number.isFinite(timeAwayMs) ? timeAwayMs : 0),
    leave_events: Number(raw?.navigatedAway ?? 0),
    leave_event_details: safeArray(raw?.navigatedAwayExplained),
    submit_attempt_timestamps: safeArray(raw?.TimeStampOfSubmitClicks),
    chat_events: safeArray(raw?.chatEvents),
    word_count_over_time: wordCountOverTime,
    created_at: session?.created_at || "",
    submit_click_count:
      raw?.NumOfSubmitClicks ?? session?.submit_click_count ?? "",
    text_editor_final_submission: finalSubmission,
    text_editor_progress: editorProgress,
    configuration: {
      LLMProvider: raw?.LLMProvider || "",
      LLMModel: raw?.LLMModel || "",
      backgroundAIMessage:
        raw?.backgroundAIMessage ?? raw?.backgroundLLMMessage ?? "",
    },
    messages,
    logs: raw,
  };
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getTableCellValue(session, column) {
  if (column.key === "created_at") return formatDate(session[column.key]);
  return session[column.key] ?? "-";
}

function average(values) {
  const numbers = values.map(Number).filter((value) => Number.isFinite(value));
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function tableExportRows(sessions) {
  return sessions.map((session) =>
    TABLE_COLUMNS.reduce((row, column) => {
      row[column.key] = getTableCellValue(session, column);
      return row;
    }, {}),
  );
}

// These are the fields included when researchers choose "Export full session data".
function fullExportRows(sessions) {
  return sessions.map((session) => ({
    ...tableExportRows([session])[0],
    submit_click_count: session.submit_click_count,
    submit_attempt_timestamps: session.submit_attempt_timestamps,
    time_away: session.time_away,
    time_away_ms: session.time_away_ms,
    leave_events: session.leave_events,
    leave_event_details: session.leave_event_details,
    participant_message_count: session.participant_message_count,
    ai_message_count: session.ai_message_count,
    final_word_count: session.final_word_count,
    session_duration: session.session_duration,
    session_duration_ms: session.session_duration_ms,
    word_count_over_time: session.word_count_over_time,
    text_editor_snapshots: session.text_editor_snapshots,
    message_count: session.message_count,
    text_editor_final_submission: session.text_editor_final_submission,
    text_editor_progress: session.text_editor_progress,
    configuration: session.configuration,
    messages: session.messages,
    chat_events: session.chat_events,
    logs: session.logs,
    s3_key: session.key,
  }));
}

function exportCSV(sessions, scope) {
  const rows =
    scope === "table" ? tableExportRows(sessions) : fullExportRows(sessions);
  const columns =
    scope === "table"
      ? TABLE_COLUMNS.map((c) => c.key)
      : Object.keys(rows[0] || {});
  const csvRows = rows.map((row) =>
    columns
      .map((column) => {
        const value =
          typeof row[column] === "object"
            ? JSON.stringify(row[column])
            : row[column];
        return csvEscape(value);
      })
      .join(","),
  );
  downloadBlob(
    [columns.join(","), ...csvRows].join("\n"),
    "text/csv;charset=utf-8;",
    `sessions_${scope}_${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

function exportJSON(sessions, scope) {
  const rows =
    scope === "table" ? tableExportRows(sessions) : fullExportRows(sessions);
  downloadBlob(
    JSON.stringify(rows, null, 2),
    "application/json;charset=utf-8;",
    `sessions_${scope}_${new Date().toISOString().slice(0, 10)}.json`,
  );
}

const AdminPanel = () => {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState("messages");
  const [search, setSearch] = useState("");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [exportScope, setExportScope] = useState("table");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/admin/sessions`, {
        headers: authHeader(),
      });

      if (res.status === 401) {
        sessionStorage.removeItem("adminToken");
        window.location.href = "/admin/login";
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load sessions");
      setSessions((data.sessions || []).map(normalizeSession));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionStorage.getItem("adminToken")) {
      window.location.href = "/admin/login";
      return;
    }

    loadSessions();
  }, [loadSessions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions
      .filter(
        (session) =>
          conditionFilter === "all" || session.condition === conditionFilter,
      )
      .filter(
        (session) =>
          !q ||
          session.session_id.toLowerCase().includes(q) ||
          session.condition.toLowerCase().includes(q),
      );
  }, [sessions, search, conditionFilter]);

  const stats = useMemo(() => {
    const byCondition = CONDITIONS.reduce((acc, condition) => {
      acc[condition] = sessions.filter(
        (session) => session.condition === condition,
      ).length;
      return acc;
    }, {});
    const avgRounds = average(
      sessions.map((session) => session.rounds_of_interaction),
    );
    const avgFinalWordCount = average(
      sessions
        .filter((session) => session.text_editor_snapshots > 0)
        .map((session) => session.final_word_count),
    );
    const avgSessionDuration = average(
      sessions
        .map((session) => session.session_duration_ms)
        .filter((value) => value != null),
    );
    const avgTimeAway = average(
      sessions.map((session) => session.time_away_ms),
    );

    return {
      total: sessions.length,
      avgRounds: avgRounds == null ? "-" : avgRounds.toFixed(1),
      avgFinalWordCount:
        avgFinalWordCount == null ? "-" : avgFinalWordCount.toFixed(1),
      avgSessionDuration:
        avgSessionDuration == null ? "-" : formatDuration(avgSessionDuration),
      avgTimeAway: avgTimeAway == null ? "-" : formatDuration(avgTimeAway),
      byCondition,
    };
  }, [sessions]);

  const deleteSession = async (session) => {
    if (
      !window.confirm(
        `Delete session ${session.session_id}? This cannot be undone.`,
      )
    )
      return;
    setActionLoading(session.session_id);

    try {
      const res = await fetch(`${API_BASE}/api/admin/sessions`, {
        method: "DELETE",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.session_id,
          key: session.key,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");

      setSessions((prev) =>
        prev.filter((row) => row.session_id !== session.session_id),
      );
      if (selected?.session_id === session.session_id) setSelected(null);
    } catch (err) {
      alert("Delete failed: " + err.message);
    } finally {
      setActionLoading("");
    }
  };

  const logout = () => {
    sessionStorage.removeItem("adminToken");
    window.location.href = "/admin/login";
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <span style={s.headerTitle}>Admin Panel - Experiment Sessions</span>
        <div style={s.headerActions}>
          <button onClick={loadSessions} style={s.headerButton}>
            Refresh
          </button>
          <select
            value={exportScope}
            onChange={(event) => setExportScope(event.target.value)}
            style={s.headerSelect}
          >
            <option value="table">Export table only</option>
            <option value="full">Export full session data</option>
          </select>
          <button
            onClick={() => exportCSV(filtered, exportScope)}
            style={s.headerButton}
          >
            CSV
          </button>
          <button
            onClick={() => exportJSON(filtered, exportScope)}
            style={s.headerButton}
          >
            JSON
          </button>
          <button
            onClick={logout}
            style={{ ...s.headerButton, ...s.dangerButton }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={s.statsPanel}>
        <div style={s.statsRow}>
          <Stat label="Total sessions" value={stats.total} />
          <Stat label="Avg rounds" value={stats.avgRounds} />
          <Stat label="Avg final words" value={stats.avgFinalWordCount} />
          <Stat label="Avg session duration" value={stats.avgSessionDuration} />
          <Stat label="Avg time away" value={stats.avgTimeAway} />
        </div>
        <div style={s.conditionStatsRow}>
          {CONDITIONS.map((condition) => (
            <Stat
              key={condition}
              label={condition}
              value={stats.byCondition[condition]}
              condition={condition}
            />
          ))}
        </div>
      </div>

      <div style={s.controls}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search session ID or condition"
          style={s.searchInput}
        />
        <select
          value={conditionFilter}
          onChange={(event) => setConditionFilter(event.target.value)}
          style={s.select}
        >
          <option value="all">All conditions</option>
          {CONDITIONS.map((condition) => (
            <option key={condition} value={condition}>
              {condition}
            </option>
          ))}
        </select>
        <span style={s.countBadge}>
          {filtered.length} row{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && <div style={s.errorBanner}>Error: {error}</div>}
      {loading && <div style={s.loadingBanner}>Loading sessions...</div>}

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr style={s.theadRow}>
              {TABLE_COLUMNS.map((column) => (
                <th key={column.key} style={s.th}>
                  <DelayedTooltip content={column.tooltip}>
                    {column.label}
                  </DelayedTooltip>
                </th>
              ))}
              <th style={s.th}>
                <DelayedTooltip content={ACTIONS_TOOLTIP}>
                  Actions
                </DelayedTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={TABLE_COLUMNS.length + 1} style={s.emptyCell}>
                  No sessions found
                </td>
              </tr>
            )}
            {filtered.map((session) => (
              <tr
                key={session.key || session.session_id}
                onClick={() => {
                  setSelected(session);
                  setDetailTab("messages");
                }}
                style={s.tr}
              >
                {TABLE_COLUMNS.map((column) => (
                  <td key={column.key} style={s.td}>
                    {column.key === "session_id" ? (
                      <span style={s.mono}>{session[column.key]}</span>
                    ) : column.key === "condition" ? (
                      <span
                        style={{
                          ...s.badge,
                          ...getConditionBadgeStyle(session[column.key]),
                        }}
                      >
                        {session[column.key] || "Unknown"}
                      </span>
                    ) : (
                      getTableCellValue(session, column)
                    )}
                  </td>
                ))}
                <td style={s.td} onClick={(event) => event.stopPropagation()}>
                  <button
                    onClick={() => deleteSession(session)}
                    disabled={actionLoading === session.session_id}
                    style={s.deleteButton}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <SessionModal
          session={selected}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};

const Stat = ({ label, value, condition }) => {
  const conditionStyle = condition ? getConditionStyle(condition) : null;

  return (
    <div
      style={{
        ...s.statCard,
        ...(condition ? getConditionCardStyle(condition) : {}),
      }}
    >
      <div
        style={{
          ...s.statVal,
          ...(conditionStyle ? { color: conditionStyle.color } : {}),
        }}
      >
        {value}
      </div>
      <div
        style={{
          ...s.statLabel,
          ...(conditionStyle ? { color: conditionStyle.color } : {}),
        }}
      >
        {label}
      </div>
    </div>
  );
};

const SessionModal = ({ session, detailTab, setDetailTab, onClose }) => {
  const tabs = [
    ["messages", "Chat / Messages"],
    ["metrics", "Metrics"],
    ["textEditor", "Text Editor"],
    ["configuration", "Configuration"],
    ["raw", "Raw Logs"],
  ];

  return (
    <div style={s.modalOverlay} onMouseDown={onClose}>
      <div style={s.modal} onMouseDown={(event) => event.stopPropagation()}>
        <div style={s.modalHeader}>
          <div>
            <div style={s.modalTitle}>{session.session_id}</div>
            <div
              style={{
                ...s.modalSubtitle,
                color: getConditionStyle(session.condition).color,
              }}
            >
              {session.condition || "Unknown condition"}
            </div>
          </div>
          <button onClick={onClose} style={s.closeButton}>
            x
          </button>
        </div>

        <div style={s.metaGrid}>
          <Meta label="Session ID" value={session.session_id} />
          <div>
            <span style={s.metaKey}>Condition: </span>
            <span
              style={{
                ...s.badge,
                ...getConditionBadgeStyle(session.condition),
              }}
            >
              {session.condition || "Unknown"}
            </span>
          </div>
          <Meta
            label="Rounds of Interaction"
            value={session.rounds_of_interaction}
          />
          <Meta label="Final word count" value={session.final_word_count} />
          <Meta label="Session duration" value={session.session_duration} />
          <Meta label="Leave events" value={session.leave_events} />
          <Meta
            label="Participant messages"
            value={session.participant_message_count}
          />
          <Meta label="AI messages" value={session.ai_message_count} />
          <Meta label="Submitted" value={formatDate(session.created_at)} />
          <Meta label="Submit clicks" value={session.submit_click_count} />
        </div>

        <div style={s.tabs}>
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setDetailTab(key)}
              style={{ ...s.tab, ...(detailTab === key ? s.tabActive : {}) }}
            >
              {label}
            </button>
          ))}
        </div>

        {detailTab === "messages" && (
          <div style={s.scrollArea}>
            {session.messages.length === 0 && (
              <Empty>No chat/messages recorded.</Empty>
            )}
            {session.messages.map((message, index) => (
              <div
                key={`${message.timestamp}-${index}`}
                style={{
                  ...s.messageBubble,
                  alignSelf:
                    message.sender === "user" ? "flex-end" : "flex-start",
                  background: message.sender === "user" ? "#0094ff" : "#f0f0f0",
                  color: message.sender === "user" ? "#fff" : "#222",
                }}
              >
                <div style={s.messageMeta}>
                  {message.sender || "message"}
                  {message.timestamp != null
                    ? ` - ${(message.timestamp / 1000).toFixed(1)}s`
                    : ""}
                </div>
                <div style={s.preWrap}>{message.text}</div>
              </div>
            ))}
          </div>
        )}

        {detailTab === "metrics" && (
          <div style={s.scrollArea}>
            <SectionTitle>Session Metrics</SectionTitle>
            <div style={s.configGrid}>
              <Meta label="Session duration" value={session.session_duration} />
              <Meta label="Leave events" value={session.leave_events} />
              <Meta
                label="Participant messages"
                value={session.participant_message_count}
              />
              <Meta label="AI messages" value={session.ai_message_count} />
              <Meta label="Final word count" value={session.final_word_count} />
              <Meta
                label="Text editor snapshots"
                value={session.text_editor_snapshots}
              />
              <Meta label="Total messages" value={session.message_count} />
            </div>
          </div>
        )}

        {detailTab === "textEditor" && (
          <div style={s.editorSplit}>
            <div style={{ ...s.editorPane, minHeight: 220 }}>
              <div style={s.editorPaneHeader}>
                Text Editor - Final Submission
              </div>
              <div style={s.editorPaneBody}>
                <textarea
                  readOnly
                  value={session.text_editor_final_submission || ""}
                  placeholder="No final text-editor submission recorded."
                  style={s.textareaFill}
                />
              </div>
            </div>
            <div style={{ ...s.editorPane, minHeight: 280 }}>
              <div style={s.editorPaneHeader}>Text Editor - Progress</div>
              <div style={s.editorPaneBody}>
                {session.text_editor_progress.length === 0 ? (
                  <Empty>No text-editor progress recorded.</Empty>
                ) : (
                  <pre style={s.jsonBlockFill}>
                    {JSON.stringify(session.text_editor_progress, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}

        {detailTab === "configuration" && (
          <div style={s.scrollArea}>
            <div style={s.configGrid}>
              <Meta
                label="LLMProvider"
                value={session.configuration.LLMProvider}
              />
              <Meta label="LLMModel" value={session.configuration.LLMModel} />
              <Meta
                label="backgroundAIMessage"
                value={session.configuration.backgroundAIMessage}
              />
            </div>
          </div>
        )}

        {detailTab === "raw" && (
          <div style={s.scrollArea}>
            <pre style={s.jsonBlock}>
              {JSON.stringify(session.logs, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

const Meta = ({ label, value }) => (
  <div>
    <span style={s.metaKey}>{label}: </span>
    <span style={s.metaVal}>{value ?? ""}</span>
  </div>
);

const SectionTitle = ({ children }) => (
  <div style={s.sectionTitle}>{children}</div>
);

const Empty = ({ children }) => <div style={s.empty}>{children}</div>;

const DelayedTooltip = ({ children, content }) => {
  const [open, setOpen] = useState(false);
  const [timerId, setTimerId] = useState(null);

  const clearTooltipTimer = useCallback(() => {
    if (timerId) window.clearTimeout(timerId);
    setTimerId(null);
  }, [timerId]);

  const showLater = () => {
    clearTooltipTimer();
    const nextTimerId = window.setTimeout(() => {
      setOpen(true);
      setTimerId(null);
    }, TOOLTIP_DELAY_MS);
    setTimerId(nextTimerId);
  };

  const hide = () => {
    clearTooltipTimer();
    setOpen(false);
  };

  useEffect(
    () => () => {
      if (timerId) window.clearTimeout(timerId);
    },
    [timerId],
  );

  return (
    <span
      style={s.tooltipWrap}
      onMouseEnter={showLater}
      onMouseLeave={hide}
      onFocus={showLater}
      onBlur={hide}
      tabIndex={0}
    >
      <span style={s.tooltipLabel}>{children}</span>
      {open && (
        <span role="tooltip" style={s.tooltipBubble}>
          {content}
        </span>
      )}
    </span>
  );
};

const s = {
  page: {
    minHeight: "100vh",
    background: "#f4f4f4",
    fontFamily: "Arial, sans-serif",
    fontSize: "0.9rem",
    color: "#222",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "1rem",
    padding: "0.7rem 1.5rem",
    background: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  headerTitle: { fontWeight: 700, fontSize: "1.05rem", color: "#0094ff" },
  headerActions: {
    display: "flex",
    gap: "0.4rem",
    alignItems: "center",
    flexWrap: "wrap",
  },
  headerButton: {
    minHeight: 28,
    padding: "0.3rem 0.58rem",
    border: "1px solid #8ab8ff",
    borderRadius: 3,
    background: "#edf5ff",
    color: "#0f3d75",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "0.78rem",
    lineHeight: 1.1,
  },
  dangerButton: {
    borderColor: "#ef9a9a",
    background: "#fff1ef",
    color: "#a61b1b",
  },
  statsPanel: {
    display: "grid",
    gap: "0.55rem",
    padding: "0.75rem 1.5rem",
    background: "#fff",
    borderBottom: "1px solid #eee",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))",
    gap: "0.65rem",
  },
  conditionStatsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "0.65rem",
  },
  statsBar: {
    display: "flex",
    gap: "0.75rem",
    padding: "0.75rem 1.5rem",
    background: "#fff",
    borderBottom: "1px solid #eee",
    flexWrap: "wrap",
  },
  statCard: {
    background: "#f8f9fa",
    border: "1px solid #eee",
    borderLeft: "4px solid transparent",
    borderRadius: 6,
    padding: "0.5rem 1rem",
    textAlign: "center",
    minWidth: 0,
  },
  statVal: { fontSize: "1.35rem", fontWeight: 700, color: "#0094ff" },
  statLabel: { fontSize: "0.74rem", color: "#777", marginTop: 2 },
  controls: {
    display: "flex",
    gap: "0.75rem",
    padding: "0.75rem 1.5rem",
    alignItems: "center",
    flexWrap: "wrap",
  },
  searchInput: {
    width: 300,
    padding: "0.48rem 0.75rem",
    border: "1px solid #ccc",
    borderRadius: 4,
    boxSizing: "border-box",
  },
  select: {
    padding: "0.45rem 0.7rem",
    border: "1px solid #ccc",
    borderRadius: 4,
    background: "#fff",
  },
  headerSelect: {
    minHeight: 28,
    maxWidth: 190,
    padding: "0.28rem 0.48rem",
    border: "1px solid #ccc",
    borderRadius: 3,
    background: "#fff",
    color: "#333",
    fontSize: "0.78rem",
    lineHeight: 1.1,
  },
  countBadge: { marginLeft: "auto", color: "#777", fontSize: "0.84rem" },
  errorBanner: {
    margin: "0 1.5rem 0.75rem",
    padding: "0.6rem 0.75rem",
    background: "#ffebee",
    color: "#c62828",
    borderRadius: 4,
  },
  loadingBanner: { textAlign: "center", padding: "1rem", color: "#777" },
  tableWrap: {
    margin: "0 1.5rem 1.5rem",
    background: "#fff",
    borderRadius: 6,
    boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
    overflow: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" },
  theadRow: { background: "#f8f9fa" },
  th: {
    padding: "0.55rem 0.75rem",
    textAlign: "left",
    borderBottom: "2px solid #eee",
    whiteSpace: "nowrap",
  },
  tooltipWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    outline: "none",
  },
  tooltipLabel: {
    borderBottom: "1px dotted #aeb7c2",
    cursor: "help",
  },
  tooltipBubble: {
    position: "absolute",
    left: 0,
    top: "calc(100% + 8px)",
    zIndex: 30,
    width: 220,
    maxWidth: "min(220px, calc(100vw - 32px))",
    padding: "0.45rem 0.55rem",
    border: "1px solid #d7dde5",
    borderRadius: 4,
    background: "#263241",
    color: "#fff",
    boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
    fontSize: "0.74rem",
    fontWeight: 500,
    lineHeight: 1.35,
    whiteSpace: "normal",
    pointerEvents: "none",
  },
  tr: { borderBottom: "1px solid #f0f0f0", cursor: "pointer" },
  td: { padding: "0.48rem 0.75rem", verticalAlign: "middle" },
  mono: { fontFamily: "monospace", fontSize: "0.82rem" },
  badge: {
    display: "inline-block",
    padding: "0.16rem 0.5rem",
    border: "1px solid transparent",
    borderRadius: 4,
    background: "#e3f2fd",
    color: "#1565c0",
    fontWeight: 700,
    fontSize: "0.76rem",
  },
  deleteButton: {
    minHeight: 24,
    padding: "0.18rem 0.44rem",
    border: "1px solid #ef9a9a",
    borderRadius: 3,
    background: "#fff",
    color: "#c62828",
    cursor: "pointer",
    fontSize: "0.76rem",
    lineHeight: 1.1,
  },
  emptyCell: { textAlign: "center", padding: "2rem", color: "#888" },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "grid",
    placeItems: "center",
    zIndex: 100,
    padding: "1rem",
  },
  modal: {
    width: "min(980px, calc(100vw - 32px))",
    height: "min(760px, calc(100vh - 32px))",
    background: "#fff",
    borderRadius: 6,
    boxShadow: "0 8px 30px rgba(0,0,0,0.22)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.8rem 1rem",
    borderBottom: "1px solid #eee",
    background: "#f8f9fa",
  },
  modalTitle: { fontWeight: 700, fontFamily: "monospace" },
  modalSubtitle: { marginTop: 2, color: "#777", fontSize: "0.82rem" },
  closeButton: {
    border: "none",
    background: "transparent",
    color: "#777",
    fontSize: "1.1rem",
    cursor: "pointer",
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "0.35rem 1rem",
    padding: "0.75rem 1rem",
    borderBottom: "1px solid #eee",
    fontSize: "0.82rem",
  },
  metaKey: { color: "#777" },
  metaVal: { fontWeight: 600, wordBreak: "break-word" },
  tabs: {
    display: "flex",
    gap: "0.15rem",
    padding: "0 0.75rem",
    borderBottom: "1px solid #eee",
    overflowX: "auto",
  },
  tab: {
    padding: "0.38rem 0.58rem",
    border: "none",
    borderBottom: "2px solid transparent",
    background: "transparent",
    color: "#777",
    cursor: "pointer",
    flexShrink: 0,
    fontSize: "0.78rem",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  },
  tabActive: {
    color: "#0094ff",
    borderBottomColor: "#0094ff",
    fontWeight: 700,
  },
  scrollArea: {
    flex: 1,
    overflow: "auto",
    padding: "0.85rem 1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.65rem",
  },
  messageBubble: {
    maxWidth: "86%",
    padding: "0.55rem 0.75rem",
    borderRadius: 8,
    lineHeight: 1.45,
  },
  messageMeta: { opacity: 0.72, fontSize: "0.72rem", marginBottom: "0.25rem" },
  preWrap: { whiteSpace: "pre-wrap" },
  textarea: {
    minHeight: 150,
    width: "100%",
    resize: "vertical",
    border: "1px solid #ddd",
    borderRadius: 4,
    padding: "0.75rem",
    boxSizing: "border-box",
    fontFamily: "Arial, sans-serif",
    lineHeight: 1.5,
  },
  editorSplit: {
    flex: 1,
    overflow: "auto",
    padding: "0.85rem 1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  editorPane: {
    display: "flex",
    flexDirection: "column",
    resize: "vertical",
    overflow: "hidden",
    border: "1px solid #ddd",
    borderRadius: 4,
    background: "#fff",
    maxHeight: "70vh",
  },
  editorPaneHeader: {
    flexShrink: 0,
    padding: "0.45rem 0.65rem",
    borderBottom: "1px solid #eee",
    background: "#f8f9fa",
    color: "#333",
    fontWeight: 700,
    fontSize: "0.82rem",
  },
  editorPaneBody: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
  },
  textareaFill: {
    minHeight: "100%",
    width: "100%",
    resize: "none",
    border: "none",
    padding: "0.75rem",
    boxSizing: "border-box",
    fontFamily: "Arial, sans-serif",
    lineHeight: 1.5,
    outline: "none",
  },
  sectionTitle: { fontWeight: 700, color: "#333", marginTop: "0.25rem" },
  jsonBlock: {
    margin: 0,
    padding: "0.75rem",
    background: "#fafafa",
    border: "1px solid #eee",
    borderRadius: 4,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    fontSize: "0.8rem",
  },
  jsonBlockFill: {
    minHeight: "100%",
    margin: 0,
    padding: "0.75rem",
    boxSizing: "border-box",
    background: "#fafafa",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    fontSize: "0.8rem",
  },
  configGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "0.75rem",
    fontSize: "0.9rem",
  },
  empty: { color: "#888", padding: "0.5rem 0" },
};

export default AdminPanel;
