/**
 *Summary:
 * the AI assistant opens automatically after 20 seconds (even if the participant never clicks it),
 * so we can measure the effect of proactively offering AI help. We log chat auto-open + open/close/collapse events and upload to S3.
 *
 * CONFIG YOU WILL EDIT:
 * - Auto-open delay (currently 20000 ms = 20 seconds)
 * - Minimum time before submit (currently 180000 ms = 3 minutes)
 * - Minimum word count (currently 50 words)
 * - Instructions text + initial chat messages
 * - API base URL: REACT_APP_API_BASE (frontend .env)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import TextEditor from "../components/QuillTextEditor";
import AI_API from "../components/AI_Options/AI_API";
import Button from "../components/Button";
import Modal from "../components/Modal";
import "../App.css";

const ProActiveOfferingCond = () => {
  // ----------------------------
  // LOGGING STATE (what we save)
  // ----------------------------
  const [editorLog, setEditorLog] = useState([]); // logs from the text editor
  const [currentLastEditedText, setCurrentLastEditedText] = useState(""); // latest editor text (for word count + AI context)
  const [messagesLog, setMessagesLog] = useState([]); // chat message logs

  // ----------------------------
  // MODALS + SUBMIT STATE
  // ----------------------------
  const [isModalOpen, setModalOpen] = useState(false); // "Are you sure?" modal
  const [isEarlyModalOpen, setEarlyModalOpen] = useState(false); // "Too early to submit" modal
  const [submit, setSubmit] = useState(false); // passed into TextEditor (if editor uses it)

  // NOTE: pasteFlagI is always false; if you want to toggle it, make it state.
  const pasteFlagI = false;

  // canSubmit depends on both time + word requirements
  const [canSubmit, setCanSubmit] = useState(false);

  // Used to measure "minimum time before submit"
  const startTimeRef = useRef(Date.now());

  // Track how many times user clicked submit + at what times (ms since page start)
  const [submitAttempts, setSubmitAttempts] = useState(0);
  const [submitAttemptTimesMs, setSubmitAttemptTimesMs] = useState([]); // [t1, t2, ...]

  // ----------------------------
  // SUBMIT REQUIREMENTS
  // ----------------------------
  const [currentLength, setcurrentLength] = useState(0); // current word count
  const [canSubmitWord, setCanSubmitWord] = useState(false); // word threshold met?
  const [canSubmitTime, setCanSubmitTime] = useState(false); // time threshold met?

  // ----------------------------
  // CHAT UI STATE
  // ----------------------------
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  // Message shown when user tries to submit too early
  const [messageEarlyModal, setMessageEarlyModal] = useState(
    "Most participants spend more time developing their ideas before submitting. Please review your work and add any additional thoughts before continuing.",
  );

  // ----------------------------
  // CHAT EVENT LOGGING
  // We store "what happened" + "when it happened" (ms since page start).
  // ----------------------------
  const startMsRef = useRef(performance.now());
  const [chatEvents, setChatEvents] = useState([]);

  const logChatEvent = useCallback((type, extra = {}) => {
    const t = Math.round(performance.now() - startMsRef.current);
    setChatEvents((prev) => [...prev, { t_ms: t, type, ...extra }]);
  }, []);

  // Prevent the auto-open effect from running twice (React strict mode can double-run effects in dev)
  const hasAutoOpenedRef = useRef(false);

  // Open chat (fully open, not collapsed)
  const openChat = useCallback(() => {
    setIsChatOpen(true);
    setIsChatCollapsed(false);
    logChatEvent("chat_open");
  }, [logChatEvent]);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
    setIsChatCollapsed(false);
    logChatEvent("chat_close");
  }, [logChatEvent]);

  const toggleCollapseChat = useCallback(() => {
    setIsChatCollapsed((v) => {
      const next = !v;
      logChatEvent(next ? "chat_collapse" : "chat_expand");
      return next;
    });
  }, [logChatEvent]);

  // Keep submit flag aligned with modal state
  useEffect(() => {
    setSubmit(isModalOpen);
  }, [isModalOpen]);

  // Optional: disable copy/cut/paste
  useEffect(() => {
    const handleCopy = (event) => event.preventDefault();
    const handleCut = (event) => event.preventDefault();
    const handlePaste = (event) => event.preventDefault();

    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("paste", handlePaste);
    };
  }, []);

  // ----------------------------
  // Time requirement (minimum time on page)
  // CONFIG YOU WILL EDIT: currently 3 minutes (180000 ms)
  // ----------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      setCanSubmitTime(Date.now() - startTimeRef.current >= 180000);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Update immediately when they return to the tab
  useEffect(() => {
    const onVis = () => {
      setCanSubmitTime(Date.now() - startTimeRef.current >= 180000);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // ----------------------------
  // Word requirement (minimum words typed)
  // CONFIG YOU WILL EDIT: currently >= 50 words
  // ----------------------------
  useEffect(() => {
    const wc = currentLastEditedText.trim().split(/\s+/).filter(Boolean).length;
    setcurrentLength(wc);
    setCanSubmitWord(wc >= 50);
  }, [currentLastEditedText]);

  // ----------------------------
  // PROACTIVE OFFERING: Auto-open chat after 20 seconds
  // CONFIG YOU WILL EDIT: change 20000 ms if needed
  // ----------------------------
  useEffect(() => {
    const t = setTimeout(() => {
      if (!hasAutoOpenedRef.current) {
        hasAutoOpenedRef.current = true;

        // Important: this marks that the chat was opened automatically by the condition
        logChatEvent("chat_auto_open");

        openChat();
      }
    }, 20000);

    return () => clearTimeout(t);
  }, [openChat, logChatEvent]);

  // Combined eligibility + build early-modal message
  useEffect(() => {
    setCanSubmit(canSubmitWord && canSubmitTime);

    if (!canSubmitWord && !canSubmitTime) {
      setMessageEarlyModal(
        "Most participants spend more time developing their ideas before submitting. Please review your work and add any additional thoughts before continuing.",
      );
    } else if (!canSubmitWord) {
      setMessageEarlyModal(
        "Most participants suggest more developed ideas before submitting. Please review your work and add any additional thoughts before continuing.",
      );
    } else if (!canSubmitTime) {
      setMessageEarlyModal(
        "Most participants spend more time developing their ideas before submitting. Please review your work and add any additional thoughts before continuing.",
      );
    }
  }, [canSubmitWord, canSubmitTime]);

  // When user clicks submit:
  // - log click time
  // - show confirm modal if eligible, else show early modal
  const handleOpenModal = () => {
    const t_ms = Math.round(performance.now() - startMsRef.current);

    setSubmitAttempts((n) => n + 1);
    setSubmitAttemptTimesMs((prev) => [...prev, t_ms]);

    if (canSubmit) setModalOpen(true);
    else setEarlyModalOpen(true);
  };

  const handleCloseModal = () => setModalOpen(false);
  const handleCloseEarlyModal = () => setEarlyModalOpen(false);

  // Generate an ID for each submission (.txt name in S3)
  // CONFIG YOU WILL EDIT: change prefix/suffix to tag condition/cohort
  function getRandomString(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const middlePart = Array.from(
      { length },
      () => characters[Math.floor(Math.random() * characters.length)],
    ).join("");
    return `PO${middlePart}45`;
  }

  // Called when user confirms submit
  const handleConfirmSubmit = async () => {
    setModalOpen(false);

    // Everything we want to save for this condition
    const logs = {
      id: getRandomString(5),
      chatEvents: chatEvents, // includes chat_auto_open + UI events
      NumOfSubmitClicks: submitAttempts,
      TimeStampOfSubmitClicks: submitAttemptTimesMs,
      messages: messagesLog,
      editor: editorLog,
      wordCount: currentLength, // helpful extra metadata
    };

    // NOTE: can throw; if you want user-friendly errors, wrap in try/catch
    saveLogsToS3(logs);
  };

  // Receive editor logs
  const handleEditorLog = useCallback((allLogs) => {
    setEditorLog(allLogs);
  }, []);

  // Receive chat message logs
  const handleMessages = useCallback((allMessages) => {
    setMessagesLog(allMessages);
  }, []);

  // Upload logs to backend (/api/logs) which writes to S3
  // CONFIG YOU WILL EDIT: REACT_APP_API_BASE must exist in frontend .env
  const saveLogsToS3 = async (logs) => {
    const API_BASE = process.env.REACT_APP_API_BASE;

    const res = await fetch(`${API_BASE}/api/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Save failed");

    alert("Please copy this code to qualtrics: " + logs.id);
  };

  // CSS helper class for chat open/collapsed styling
  const assistantSlotClass = `${isChatOpen ? "open" : ""} ${
    isChatCollapsed ? "collapsed" : ""
  }`.trim();

  return (
    <div>
      {/* CONFIG YOU WILL EDIT: put your participant instructions here */}
      <p id="instructions" style={{ display: "block" }}>
        Instructions: You can write here your instructions.{" "}
        <strong>The important instructions can be in bold .</strong> While less
        important parts can be in regular fond. Adjust to your liking.
      </p>

      <div id="title-container">
        <div id="title-text">Text Editor</div>

        <div
          id="title-assistant"
          className={`title-fade-in ${
            isChatOpen && !isChatCollapsed ? "show" : ""
          }`}
        >
          AI Assistant
        </div>
      </div>

      <div id="content-container">
        <div id="editor-area">
          <div id="text-editor-container">
            <TextEditor
              submit={submit}
              onEditorSubmit={handleEditorLog}
              pasteFlag={pasteFlagI}
              onLastEditedTextChange={setCurrentLastEditedText}
              showAI={false} // condition-specific: AI is not a button; it's auto-opened instead
            />
          </div>
        </div>

        {/* RIGHT: Chat slot (open + collapsible handle) */}
        <div id="assistant-slot" className={assistantSlotClass}>
          {/* Collapse handle only shows after chat is opened */}
          {isChatOpen && (
            <button
              className="chat-handle"
              onClick={toggleCollapseChat}
              aria-label={isChatCollapsed ? "Show chat" : "Hide chat"}
              title={isChatCollapsed ? "Show chat" : "Hide chat"}
              type="button"
            >
              {isChatCollapsed ? "❮" : "❯"}
            </button>
          )}

          <div className="assistant-inner">
            <div className="chat-shell-header">
              <div>AI Assistant</div>

              <button
                className="chat-close"
                onClick={closeChat}
                aria-label="Close chat"
                type="button"
              >
                ✕
              </button>
            </div>

            <AI_API
              onMessagesSubmit={handleMessages}
              // CONFIG YOU WILL EDIT: starter chat messages
              initialMessages={[
                "Hello, this is a present message that you can edit in your code in AIStillPage.js (theInitialMsg).",
                "This is the second message, you can edit, add more, or delete me.",
              ]}
              lastEditedText={currentLastEditedText}
              // CONFIG YOU WILL EDIT: choose provider
              aiProvider={"chatgpt"} // "chatgpt" | "claude" | "gemini"
            />
          </div>
        </div>
      </div>

      <div id="submit-and-open">
        <div id="submit-button-exp">
          <Button title="Submit" onClick={handleOpenModal} />
        </div>
      </div>

      {/* Final submit confirmation modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onConfirm={handleConfirmSubmit}
        message="Are you sure you want to submit?"
        showConfirm={true}
      />

      {/* Early submit modal: word/time requirement not met */}
      <Modal
        isOpen={isEarlyModalOpen}
        onClose={handleCloseEarlyModal}
        message={messageEarlyModal}
        showConfirm={false}
      />
    </div>
  );
};

export default ProActiveOfferingCond;
