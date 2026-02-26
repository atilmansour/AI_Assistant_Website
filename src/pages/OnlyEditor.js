/**
 * OnlyEditor.js
 * Condition: OnlyEditor — editor-only baseline (no AI assistant). Participants must write at least 80 words to submit,
 * On submit, we upload ONLY editor logs to S3.
 *
 * CONFIG YOU WILL EDIT:
 * - Word threshold (currently 80)
 * - Instructions text shown to participants
 * - API base URL: REACT_APP_API_BASE (frontend .env)
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import TextEditor from "../components/QuillTextEditor";
import Button from "../components/Button";
import Modal from "../components/Modal";

const OnlyEditor = () => {
  // ----------------------------
  // LOGGING STATE
  // ----------------------------
  const [editorLog, setEditorLog] = useState([]); // detailed logs from the editor
  const [currentLastEditedText, setCurrentLastEditedText] = useState(""); // latest editor text (used to compute word count)
  const startMsRef = useRef(performance.now());

  // ----------------------------
  // MODALS + SUBMISSION STATE
  // ----------------------------
  const [isModalOpen, setModalOpen] = useState(false); // final "confirm submit" modal
  const [isEarlyModalOpen, setEarlyModalOpen] = useState(false); // "not enough words yet" modal
  const [submit, setSubmit] = useState(false); // used to disable the submit button + passed into TextEditor
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

  // CONFIG YOU WILL EDIT:
  // Message shown if participant tries to submit too early (word/time not met)
  const [messageEarlyModal, setMessageEarlyModal] = useState(
    "Insert here your message, encouraging participants to write for more time + words (participants tried to submit before time + word count threshold).",
  );

  // CONFIG YOU WILL EDIT: pasteFlag is always false here (and TextEditor has its own paste prevention too).
  // If you want to control paste behavior dynamically, convert this into a state variable.
  const pasteFlag = false;

  // Keep `submit` aligned with the "confirm submit" modal state
  // (When modal is open, the submit button becomes disabled)
  useEffect(() => {
    setSubmit(isModalOpen);
  }, [isModalOpen]);

  //CONFIG YOU WILL EDIT: disables copy/cut/paste, delete the following func to enable
  // We recommend keeping in this condition, unless users are expected to copy and paste from external website.
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

  // Combined eligibility + build the early-modal message
  useEffect(() => {
    setCanSubmit(canSubmitWord && canSubmitTime);
    //CONFIG YOU WILL EDIT:
    //Change here the messages users see when attempting to submit:
    if (!canSubmitWord && !canSubmitTime) {
      //Before writing word threshold + time threshold has passed
      setMessageEarlyModal(
        "Insert here your message, encouraging participants to write for more time + words (participants tried to submit before time + word count threshold).",
      );
    } else if (!canSubmitWord) {
      //Before writing word threshold only
      setMessageEarlyModal(
        "Insert here your message, encouraging participants to write for more words (participants tried to submit before word count threshold).",
      );
    } else if (!canSubmitTime) {
      //before time threshold has passed
      setMessageEarlyModal(
        "Insert here your message, encouraging participants to write for more time (participants tried to submit before time threshold).",
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

  // Generates an ID that becomes the submission code + S3 filename
  // CONFIG YOU WILL EDIT:
  // Change prefix "OE" or suffix "C" if you want to tag a condition/cohort
  function getRandomString(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const middlePart = Array.from(
      { length },
      () => characters[Math.floor(Math.random() * characters.length)],
    ).join("");
    return `OE${middlePart}C`;
  }

  // Called when user confirms submit
  const handleConfirmSubmit = async () => {
    setModalOpen(false);

    // Only editor logs are saved in this condition
    const logs = {
      id: getRandomString(5),
      NumOfSubmitClicks: submitAttempts,
      TimeStampOfSubmitClicks: submitAttemptTimesMs,
      editor: editorLog,
    };

    saveLogsToS3(logs);
  };

  // Receives the full editor logs array from TextEditor
  const handleEditorLog = useCallback((allLogs) => {
    setEditorLog(allLogs);
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

    //CONFIG YOU WILL EDIT
    // Message shown after successful upload
    alert("Please copy this code to XXX: " + logs.id);
  };

  return (
    <div>
      {/* CONFIG YOU WILL EDIT:
          Put your participant instructions here.
      */}
      <p id="instructions" style={{ display: "block" }}>
        Instructions: You can write here your instructions.{" "}
        <strong>The important instructions can be in bold .</strong> While less
        important parts can be in regular fond. Adjust to your liking.
      </p>

      <div id="title-text-control">Text Editor</div>

      <div id="content-container">
        <div id="editor-area">
          <div id="text-editor-container">
            <TextEditor
              submit={submit}
              onEditorSubmit={handleEditorLog}
              pasteFlag={pasteFlag}
              onLastEditedTextChange={setCurrentLastEditedText}
              showAI={false} // Condition-specific: AI is disabled
            />
          </div>
        </div>
      </div>

      <div id="submit-button-exp">
        {/* Submit is disabled while the confirm modal is open */}
        <Button title="Submit" onClick={handleOpenModal} disabled={submit} />
      </div>

      {/* Final submit confirmation modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onConfirm={handleConfirmSubmit}
        message="Are you sure you want to submit?"
        showConfirm={true}
      />

      {/* Early submit modal: user has not met the word requirement */}
      <Modal
        isOpen={isEarlyModalOpen}
        onClose={handleCloseEarlyModal}
        message={messageEarlyModal}
        showConfirm={false}
      />
    </div>
  );
};

export default OnlyEditor;
