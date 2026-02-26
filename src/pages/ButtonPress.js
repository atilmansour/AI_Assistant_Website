/**
 * Summary:
 * This page shows a writing editor + an AI assistant. The AI starts CLOSED and opens only
 * when the participant clicks the AI button (from the editor toolbar). We log:
 * - editor activity
 * - chat messages
 * - chat open/close/collapse events (with timestamps)
 * - when the AI was first opened (ms after page load)
 * - submit attempts + submit attempt times
 * Then we POST everything to /api/logs, and the backend (Lambda) saves it to S3.
 *
 * sreach for: CONFIG YOU WILL EDIT to edit relevant changes
 */

import { useState, useEffect, useCallback, useRef } from "react";
import TextEditor from "../components/QuillTextEditor";
import AI_API from "../components/AI_Options/AI_API";
import Button from "../components/Button";
import Modal from "../components/Modal";
import "../App.css";

const ButtonPress = () => {
  // CONFIG YOU WILL EDIT:
  // Choose provider: "chatgpt" | "claude" | "gemini"
  const aiProvider = "chatgpt";

  // ----------------------------
  // LOGGING STATE (what we save)
  // ----------------------------
  const [editorLog, setEditorLog] = useState([]); // logs from TextEditor
  const [currentLastEditedText, setCurrentLastEditedText] = useState(""); // latest text (for word count + AI context)
  const [messagesLog, setMessagesLog] = useState([]); // logs from AI chat (messages)

  // ----------------------------
  // MODALS + SUBMIT STATE
  // ----------------------------
  const [isModalOpen, setModalOpen] = useState(false); // final "confirm submit" modal
  const [isEarlyModalOpen, setEarlyModalOpen] = useState(false); // "too early to submit" modal
  const [submit, setSubmit] = useState(false); // passed to the editor (if editor uses it)

  // NOTE: currently pasteFlagI is always false.
  // If you want to turn paste prevention on/off dynamically, make it a state variable.
  const pasteFlagI = true;

  // Track submit clicks (even failed/early attempts)
  const [submitAttempts, setSubmitAttempts] = useState(0);
  const [submitAttemptTimesMs, setSubmitAttemptTimesMs] = useState([]); // [t1, t2, ...]

  // ----------------------------
  // SUBMIT REQUIREMENTS
  // canSubmit = word threshold AND time threshold
  // ----------------------------
  const [canSubmit, setCanSubmit] = useState(false);
  const [currentLength, setcurrentLength] = useState(0); // word count
  const startTimeRef = useRef(Date.now()); // used for minimum time rule

  const [canSubmitWord, setCanSubmitWord] = useState(false);
  const [canSubmitTime, setCanSubmitTime] = useState(false);

  // CONFIG YOU WILL EDIT:
  // The message shown when user tries to submit too early
  const [messageEarlyModal, setMessageEarlyModal] = useState(
    "Most participants spend more time developing their ideas before submitting. Please review your work and add any additional thoughts before continuing.",
  );

  // ----------------------------
  // CHAT UI STATE
  // - AI is closed initially
  // - opens only when user clicks AI button
  // - supports collapsing the chat slot
  // ----------------------------
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  // Track whether AI has ever been used (used to hide/show editor AI button)
  const [aiUsed, setAiUsed] = useState(false);

  // Measure how long after page load the AI was first opened
  const pageStartMsRef = useRef(Date.now());
  const [openAiAfterMs, setOpenAiAfterMs] = useState(null);

  // Use performance.now() for accurate elapsed time logs (ms since page start)
  const startMsRef = useRef(performance.now());

  // Chat events timeline: open/close/collapse/expand with timestamps
  const [chatEvents, setChatEvents] = useState([]);

  // If modal is open, mark submit=true for editor (if you use that signal)
  // NOTE: you included isEarlyModalOpen in deps; it’s not needed but harmless.
  useEffect(() => {
    setSubmit(isModalOpen);
  }, [isModalOpen, isEarlyModalOpen]);

  // ----------------------------
  // Optional: disable copy/cut/paste
  // ----------------------------
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
  // Word requirement
  // CONFIG YOU WILL EDIT:
  // Minimum words currently: 50
  // ----------------------------
  useEffect(() => {
    const wc = currentLastEditedText.trim().split(/\s+/).filter(Boolean).length;

    setcurrentLength(wc);
    setCanSubmitWord(wc >= 50);
  }, [currentLastEditedText]);

  // Helper: push a chat event into chatEvents with timestamp
  const logChatEvent = useCallback((type, extra = {}) => {
    const t = Math.round(performance.now() - startMsRef.current);
    setChatEvents((prev) => [...prev, { t_ms: t, type, ...extra }]);
  }, []);

  // ----------------------------
  // Time requirement (minimum time on page)
  // CONFIG YOU WILL EDIT:
  // Minimum time currently: 3 minutes (180000 ms)
  // ----------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      setCanSubmitTime(Date.now() - startTimeRef.current >= 180000); // 3 min
    }, 500); // update twice/sec

    return () => clearInterval(interval);
  }, []);

  // Update immediately when they return to the tab (keeps timer accurate)
  useEffect(() => {
    const onVis = () => {
      setCanSubmitTime(Date.now() - startTimeRef.current >= 180000);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Combine time + word conditions into canSubmit and set the early message text
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

  // When user clicks Submit button:
  // 1) log click time
  // 2) show confirm modal if eligible, else show early modal
  const handleOpenModal = () => {
    const t_ms = Math.round(performance.now() - startMsRef.current);

    setSubmitAttempts((n) => n + 1);
    setSubmitAttemptTimesMs((prev) => [...prev, t_ms]);

    if (canSubmit) setModalOpen(true);
    else setEarlyModalOpen(true);
  };

  const handleCloseModal = () => setModalOpen(false);
  const handleCloseEarlyModal = () => setEarlyModalOpen(false);

  // Called when user opens chat (from editor toolbar button)
  // We log the time after page start (ButtonPressed = openAiAfterMs)
  const handleOpenChat = useCallback(() => {
    setAiUsed(true);

    const elapsed = Date.now() - pageStartMsRef.current;
    setOpenAiAfterMs(elapsed);

    setIsChatOpen(true);
    setIsChatCollapsed(false);

    logChatEvent("chat_open", { source: "toolbar" });
  }, [logChatEvent]);

  // Close chat completely
  const closeChat = useCallback(() => {
    setIsChatOpen(false);
    setIsChatCollapsed(false);
    logChatEvent("chat_close");
  }, [logChatEvent]);

  // Collapse/expand chat slot (UI only, chat remains "open")
  const toggleCollapseChat = useCallback(() => {
    setIsChatCollapsed((v) => {
      const next = !v;
      logChatEvent(next ? "chat_collapse" : "chat_expand");
      return next;
    });
  }, [logChatEvent]);

  // Generate a random submission ID (also becomes the S3 filename)
  // CONFIG YOU WILL EDIT:
  // Change prefix/suffix to tag condition (example: B = ButtonPress condition)
  function getRandomString(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const middlePart = Array.from(
      { length },
      () => characters[Math.floor(Math.random() * characters.length)],
    ).join("");
    return `BP${middlePart}B`;
  }

  // Called when user confirms submit
  const handleConfirmSubmit = async () => {
    setModalOpen(false);

    // Build logs to upload to S3
    const logs = {
      id: getRandomString(5),
      aiProvider: aiProvider,

      // Chat interaction summary
      chatEvents: chatEvents, // open/close/collapse events (timestamped)
      ButtonPressed: openAiAfterMs, // ms after page load that user opened AI (null if never opened)

      // Submit attempts summary
      NumOfSubmitClicks: submitAttempts,
      TimeStampOfSubmitClicks: submitAttemptTimesMs,

      // Detailed logs
      messages: messagesLog,
      editor: editorLog,

      // Helpful metadata
      wordCount: currentLength,
    };

    // NOTE: This can throw. If you want a nicer error message, use try/catch here.
    saveLogsToS3(logs);
  };

  // Receive editor logs from TextEditor component
  const handleEditorLog = useCallback((allLogs) => {
    setEditorLog(allLogs);
  }, []);

  // Receive chat messages logs from AI_API component
  const handleMessages = (allMessages) => {
    setMessagesLog(allMessages);
  };

  // ----------------------------
  // Upload logs to backend (/api/logs)
  // CONFIG YOU WILL EDIT:
  // - REACT_APP_API_BASE in your frontend .env
  // - Backend route must exist: POST /api/logs
  // ----------------------------
  const saveLogsToS3 = async (logs) => {
    const API_BASE = process.env.REACT_APP_API_BASE;

    const res = await fetch(`${API_BASE}/api/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Save failed");

    // CONFIG YOU WILL EDIT:
    // What the participant sees after successful upload
    alert("Please copy this code to qualtrics: " + logs.id);
  };

  // Used by CSS to style the chat open/collapsed state
  const assistantSlotClass = `${isChatOpen ? "open" : ""} ${
    isChatCollapsed ? "collapsed" : ""
  }`.trim();

  return (
    <div>
      {/* CONFIG YOU WILL EDIT:
          Put your study instructions here.
      */}
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
              // When user clicks the AI button in the editor toolbar, open the chat panel
              onOpenChat={handleOpenChat}
              // showAI={!aiUsed} means: show the AI button only until the AI is used the first time
              showAI={!aiUsed}
            />
          </div>
        </div>

        <div id="assistant-slot" className={assistantSlotClass}>
          {/* Collapse handle only shows if chat is open */}
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
              // CONFIG YOU WILL EDIT:
              // Initial messages shown to participants in the chat
              initialMessages={[
                "Hello, this is a present message that you can edit in your code in AIStillPage.js (theInitialMsg).",
                "This is the second message, you can edit, add more, or delete me.",
              ]}
              lastEditedText={currentLastEditedText}
              aiProvider={aiProvider}
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

      {/* Early-submit modal (word/time requirement not met) */}
      <Modal
        isOpen={isEarlyModalOpen}
        onClose={handleCloseEarlyModal}
        message={messageEarlyModal}
        showConfirm={false}
      />
    </div>
  );
};

export default ButtonPress;
