/**
 * Summary:
 * This page shows an LLM Assistant chat only (no writing editor),
 * logs user activity, and sends the logs to your backend endpoint (/api/logs)
 * so the Lambda can save them to S3.
 *
 * sreach for: CONFIG YOU WILL EDIT to edit relevant changes
 */

import { useState, useEffect, useCallback, useRef } from "react";
import AI_API from "../components/AI_Options/AI_API";
import Button from "../components/Button";
import Modal from "../components/Modal";
import "../App.css";

const OnlyChat = () => {
  // CONFIG YOU WILL EDIT:
  // Choose provider: "chatgpt" | "claude" | "gemini" | "Groq"
  const LLMProvider = "chatgpt";
  // CONFIG YOU WILL EDIT:
  //You can specify here the model you want according to the provider, the default models are:
  // "gpt-4o" | "claude-sonnet-4-20250514" | "gemini-2.5-flash" | "llama-3.3-70b-versatile"
  const LLMModel = "gpt-4o";

  //CONFIG YOU WILL EDIT:
  //Here, you can give the LLM Assistant background informaiton about the task,
  // or instructions to reply in a certain way.
  const backgroundAIMessage = "";

  // ----------------------------
  // LOGGING STATE (what we save)
  // ----------------------------
  const [messagesLog, setMessagesLog] = useState([]); // logs from chat messages

  // Tracks whether participants left the page/tab.
  // All timing values are in milliseconds since page start.
  const [navigatedAway, setNavigatedAway] = useState(0);
  const [totalNavigatedAwayMs, setTotalNavigatedAwayMs] = useState(0);
  const [navigatedAwayExplained, setNavigatedAwayExplained] = useState([]);

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

  // Used to store the moment when the participant leaves the page/tab.
  const awayStartRef = useRef(null);

  // ----------------------------
  // SUBMIT REQUIREMENTS
  // ----------------------------
  const [canSubmitTime, setCanSubmitTime] = useState(false); // time threshold met?

  // CONFIG YOU WILL EDIT:
  // Message shown if participant tries to submit too early (time not met)
  const [messageEarlyModal, setMessageEarlyModal] = useState(
    "Insert here your message, encouraging participants to write for more time (participants tried to submit before time threshold).",
  );

  // Chat open/close/collapse events (ms since page start)
  const startMsRef = useRef(performance.now());

  // Optional: disable copy/cut/paste completely
  //CONFIG YOU WILL EDIT: Adjust to your liking (delete this function if you want to enable).
  //We recommend keeping in this condition unless the user can copy from external websites.
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
  // Track when participants leave and return to the page
  // All times are in ms since page start, matching TimeStampOfSubmitClicks.
  // ----------------------------
  useEffect(() => {
    const getTimeMs = () => Math.round(performance.now() - startMsRef.current);

    const markAway = (reason) => {
      // Avoid double-counting if both blur and visibilitychange fire
      if (awayStartRef.current !== null) return;

      awayStartRef.current = {
        atMs: getTimeMs(),
        reason,
      };
    };

    const markReturned = () => {
      if (awayStartRef.current === null) return;

      const returnedAtMs = getTimeMs();
      const durationMs = returnedAtMs - awayStartRef.current.atMs;

      const episode = {
        atMs: awayStartRef.current.atMs,
        durationMs,
        returnedAtMs,
        reason: awayStartRef.current.reason,
      };

      setNavigatedAway((prev) => prev + 1);
      setTotalNavigatedAwayMs((prev) => prev + durationMs);
      setNavigatedAwayExplained((prev) => [...prev, episode]);

      awayStartRef.current = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        markAway("visibility_hidden");
      } else if (document.visibilityState === "visible") {
        markReturned();
      }
    };

    const handleBlur = () => {
      markAway("window_blur");
    };

    const handleFocus = () => {
      markReturned();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
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

  // Combined eligibility + early-modal message (chat-only => time only)
  useEffect(() => {
    setCanSubmit(canSubmitTime);

    if (!canSubmitTime) {
      setMessageEarlyModal(
        "Insert here your message, encouraging participants to write for more time (participants tried to submit before time threshold).",
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
    return `OC${middlePart}A`;
  }

  // Called when user confirms submit
  const handleConfirmSubmit = async () => {
    setModalOpen(false);

    // Build logs object that will be uploaded to S3 by your backend
    const logs = {
      id: getRandomString(5),
      LLMProvider: LLMProvider,
      LLMModel: LLMModel,
      backgroundLLMMessage: backgroundAIMessage,

      NumOfSubmitClicks: submitAttempts,
      TimeStampOfSubmitClicks: submitAttemptTimesMs,

      navigatedAway: navigatedAway,
      totalNavigatedAwayMs: totalNavigatedAwayMs,
      navigatedAwayExplained: navigatedAwayExplained,

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
    alert("Please copy this code to XXX: " + logs.id);
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
        <div id="title-text">LLM Assistant</div>
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
                "Hello, this is a present message that you can edit in your code in OnlyChat.js (initialMessages).",
                "This is the second message, you can edit, add more, or delete me.",
              ]}
              // chat-only page: no editor context
              lastEditedText={""}
              LLMProvider={LLMProvider}
              LLMModel={LLMModel}
              backgroundAIMessage={backgroundAIMessage}
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

export default OnlyChat;
