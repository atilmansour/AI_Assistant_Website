/**
 * Summary:
 * This page shows a writing editor + an AI assistant panel, logs user activity,
 * and sends the logs to your backend endpoint (/api/logs) so the Lambda can save them to S3.
 *
 * sreach for: CONFIG YOU WILL EDIT to edit relevant changes
 */

import { useState, useEffect, useCallback, useRef } from "react";
import TextEditor from "../components/QuillTextEditor";
import AI_API from "../components/AI_Options/AI_API";
import Button from "../components/Button";
import Modal from "../components/Modal";
import "../App.css";

const AIStillPage = () => {
  // CONFIG YOU WILL EDIT:
  // Choose provider: "chatgpt" | "claude" | "gemini"
  const aiProvider = "chatgpt";

  // ----------------------------
  // LOGGING STATE (what we save)
  // ----------------------------
  const [editorLog, setEditorLog] = useState([]); // logs from the text editor
  const [currentLastEditedText, setCurrentLastEditedText] = useState(""); // latest editor text (used for word count + AI context)
  const [messagesLog, setMessagesLog] = useState([]); // logs from chat messages

  // ----------------------------
  // MODALS + SUBMIT STATE
  // ----------------------------
  const [isModalOpen, setModalOpen] = useState(false); // "Are you sure?" modal
  const [isEarlyModalOpen, setEarlyModalOpen] = useState(false); // "Too early to submit" modal
  const [submit, setSubmit] = useState(false); // passed to editor to mark submit moment (if your editor uses it)

  //pasteFlag decides if you enable or disable copying and pasting:
  //CONFIG YOU WILL EDIT: when true, users can copy and paste to the text editor.
  const pasteFlag = true;

  // canSubmit = time requirement AND word requirement
  const [canSubmit, setCanSubmit] = useState(false);

  // Used to measure time spent on page for "minimum time before submit"
  const startTimeRef = useRef(Date.now());

  // Track how many times they clicked submit + when (ms since page start)
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

  // CONFIG YOU WILL EDIT:
  // Message shown if participant tries to submit too early (word/time not met)
  const [messageEarlyModal, setMessageEarlyModal] = useState(
    "Most participants spend more time developing their ideas before submitting. Please review your work and add any additional thoughts before continuing.",
  );

  // Chat open/close/collapse events (ms since page start)
  const startMsRef = useRef(performance.now());

  // Prevent auto-open from firing multiple times
  const hasAutoOpenedRef = useRef(false);

  // Opens chat panel (full open)
  const openChat = useCallback(() => {
    setIsChatOpen(true);
  }, []);

  // Keep submit flag aligned with the submit modal
  useEffect(() => {
    setSubmit(isModalOpen);
  }, [isModalOpen]);

  // Optional: disable copy/cut/paste completely
  //CONFIG YOU WILL EDIT: Adjust to your liking (delete this function if you want to enable).
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
  // CONFIG YOU WILL EDIT:
  // Currently: 3 minutes (180000 ms)
  // ----------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      setCanSubmitTime(Date.now() - startTimeRef.current >= 180000);
    }, 500); // update twice/sec

    return () => clearInterval(interval);
  }, []);

  // Update immediately when they return to the tab (so the timer is accurate)
  useEffect(() => {
    const onVis = () => {
      setCanSubmitTime(Date.now() - startTimeRef.current >= 180000);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // ----------------------------
  // Word requirement (minimum words typed)
  // CONFIG YOU WILL EDIT:
  // Currently: >= 50 words
  // ----------------------------
  useEffect(() => {
    const wc = currentLastEditedText.trim().split(/\s+/).filter(Boolean).length;
    setcurrentLength(wc);
    setCanSubmitWord(wc >= 50);
  }, [currentLastEditedText]);

  // ----------------------------
  // Auto open chat after 100 ms, so users experience it as opening immediately.
  // ----------------------------
  useEffect(() => {
    const t = setTimeout(() => {
      if (!hasAutoOpenedRef.current) {
        hasAutoOpenedRef.current = true;
        openChat();
      }
    }, 100);

    return () => clearTimeout(t);
  }, [openChat]);

  // Combined eligibility + build the early-modal message
  useEffect(() => {
    setCanSubmit(canSubmitWord && canSubmitTime);
    //CONFIG YOU WILL EDIT:
    //Change here the messages users see when attempting to submit:
    if (!canSubmitWord && !canSubmitTime) {
      //Before writing word threshold + time threshold has passed
      setMessageEarlyModal(
        "Most participants spend more time developing their ideas before submitting. Please review your work and add any additional thoughts before continuing.",
      );
    } else if (!canSubmitWord) {
      //Before writing word threshold only
      setMessageEarlyModal(
        "Most participants suggest more developed ideas before submitting. Please review your work and add any additional thoughts before continuing.",
      );
    } else if (!canSubmitTime) {
      //before time threshold has passed
      setMessageEarlyModal(
        "Most participants spend more time developing their ideas before submitting. Please review your work and add any additional thoughts before continuing.",
      );
    }
  }, [canSubmitWord, canSubmitTime]);

  // When user clicks Submit button:
  // 1) log click time
  // 2) either open confirmation modal (if eligible) OR early modal (if not eligible)
  const handleOpenModal = () => {
    const t_ms = Math.round(performance.now() - startMsRef.current);

    setSubmitAttempts((n) => n + 1);
    setSubmitAttemptTimesMs((prev) => [...prev, t_ms]);

    if (canSubmit) setModalOpen(true);
    else setEarlyModalOpen(true);
  };

  const handleCloseModal = () => setModalOpen(false);
  const handleCloseEarlyModal = () => setEarlyModalOpen(false);

  // Generate a random ID for each submission (.txt file name)
  // CONFIG YOU WILL EDIT:
  // You can change prefix/suffix to identify study condition, cohort, etc.
  function getRandomString(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const middlePart = Array.from(
      { length },
      () => characters[Math.floor(Math.random() * characters.length)],
    ).join("");
    return `ASP${middlePart}U`;
  }

  // Called when user confirms submit
  const handleConfirmSubmit = async () => {
    setModalOpen(false);

    // Build logs object that will be uploaded to S3 by your backend
    const logs = {
      id: getRandomString(5),
      aiProvider: aiProvider,
      NumOfSubmitClicks: submitAttempts,
      TimeStampOfSubmitClicks: submitAttemptTimesMs,
      messages: messagesLog,
      editor: editorLog,
    };

    // NOTE: This function is async and can throw.
    // If you want to show an error popup, wrap with try/catch:
    // try { await saveLogsToS3(logs); } catch(e) { alert("Upload failed"); }
    saveLogsToS3(logs);
  };

  // Called by TextEditor component to provide the full editor log array
  const handleEditorLog = useCallback((allLogs) => {
    setEditorLog(allLogs);
  }, []);

  // Called by AI_API component to provide the full messages log array
  const handleMessages = useCallback((allMessages) => {
    setMessagesLog(allMessages);
  }, []);

  // ----------------------------
  // Upload logs to backend (/api/logs)
  // CONFIG YOU WILL EDIT:
  // 1) REACT_APP_API_BASE in your .env (frontend)
  // 2) Lambda route must handle POST /api/logs and write to S3
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
    // This is the message shown to participants after upload succeeds.
    alert("Please copy this code to qualtrics: " + logs.id);
  };

  // CSS helper class for chat open/closed styling
  const assistantSlotClass = `${isChatOpen ? "open" : ""}`.trim();

  return (
    <div>
      {/* CONFIG YOU WILL EDIT:
          Put your study instructions here (can include <strong>bold</strong> text).
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
          className={`title-fade-in ${isChatOpen ? "show" : ""}`}
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
              pasteFlag={pasteFlag}
              onLastEditedTextChange={setCurrentLastEditedText}
              showAI={false}
            />
          </div>
        </div>

        {/* RIGHT: Chat slot */}
        <div id="assistant-slot" className={assistantSlotClass}>
          {isChatOpen}

          <div className="assistant-inner">
            <div className="chat-shell-header">
              <div>AI Assistant</div>
            </div>

            <AI_API
              onMessagesSubmit={handleMessages}
              // CONFIG YOU WILL EDIT:
              // Initial messages shown in the chat.
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

export default AIStillPage;
