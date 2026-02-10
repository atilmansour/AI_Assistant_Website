/**
 * Summary:
 * This page shows an AI assistant chat only (no writing editor),
 * logs user activity, and sends the logs to your backend endpoint (/api/logs)
 * so the Lambda can save them to S3.
 *
 * If you change anything, focus on the "CONFIG YOU WILL EDIT" comments below.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import AI_API from "../components/AI_Options/AI_API";
import Button from "../components/Button";
import Modal from "../components/Modal";
import "../App.css";

const OnlyAI = () => {
  // ----------------------------
  // LOGGING STATE (what we save)
  // ----------------------------
  const [messagesLog, setMessagesLog] = useState([]); // logs from chat messages

  // ----------------------------
  // MODALS + SUBMIT STATE
  // ----------------------------
  const [isModalOpen, setModalOpen] = useState(false); // "Are you sure?" modal
  const [isEarlyModalOpen, setEarlyModalOpen] = useState(false); // "Too early to submit" modal

  // canSubmit = time requirement ONLY (chat-only page)
  const [canSubmit, setCanSubmit] = useState(false);

  // Used to measure time spent on page for "minimum time before submit"
  const startTimeRef = useRef(Date.now());

  // Track how many times they clicked submit + when (ms since page start)
  const [submitAttempts, setSubmitAttempts] = useState(0);
  const [submitAttemptTimesMs, setSubmitAttemptTimesMs] = useState([]); // [t1, t2, ...]

  // ----------------------------
  // SUBMIT REQUIREMENTS
  // ----------------------------
  const [canSubmitTime, setCanSubmitTime] = useState(false); // time threshold met?

  // CONFIG YOU WILL EDIT:
  // Message shown if participant tries to submit too early (time not met)
  const [messageEarlyModal, setMessageEarlyModal] = useState(
    "Most participants spend more time developing their ideas before submitting. Please continue using the chat before continuing.",
  );

  // Chat open/close/collapse events (ms since page start)
  const startMsRef = useRef(performance.now());

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
  // Time requirement (minimum time on page)
  // CONFIG YOU WILL EDIT:
  // Currently: 3 minutes (180000 ms)
  // ----------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      setCanSubmitTime(Date.now() - startTimeRef.current >= 180000); // 3 min
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

  // Combined eligibility + early-modal message (chat-only => time only)
  useEffect(() => {
    setCanSubmit(canSubmitTime);

    if (!canSubmitTime) {
      setMessageEarlyModal(
        "Most participants spend more time developing their ideas before submitting. Please continue using the chat before continuing.",
      );
    }
  }, [canSubmitTime]);

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
    return `PO${middlePart}45`;
  }

  // Called when user confirms submit
  const handleConfirmSubmit = async () => {
    setModalOpen(false);

    // Build logs object that will be uploaded to S3 by your backend
    const logs = {
      id: getRandomString(5),
      NumOfSubmitClicks: submitAttempts,
      TimeStampOfSubmitClicks: submitAttemptTimesMs,
      messages: messagesLog,
      // editor removed in chat-only page
    };

    saveLogsToS3(logs);
  };

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
        <div id="title-text">AI Assistant</div>
      </div>

      {/* Reuse your editor container so it’s the same size as the editor box */}
      <div id="content-container">
        <div id="editor-area" className="full">
          <div id="text-editor-container" className="chat-only-container">
            <AI_API
              onMessagesSubmit={handleMessages}
              // CONFIG YOU WILL EDIT:
              // Initial messages shown in the chat.
              initialMessages={[
                "Hello, this is a present message that you can edit in your code in AIStillPage.js (theInitialMsg).",
                "This is the second message, you can edit, add more, or delete me.",
              ]}
              // chat-only page: no editor context
              lastEditedText={""}
              // CONFIG YOU WILL EDIT:
              // Choose provider: "chatgpt" | "claude" | "gemini"
              aiProvider={"chatgpt"}
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

      {/* Early-submit modal (time requirement not met) */}
      <Modal
        isOpen={isEarlyModalOpen}
        onClose={handleCloseEarlyModal}
        message={messageEarlyModal}
        showConfirm={false}
      />
    </div>
  );
};

export default OnlyAI;
