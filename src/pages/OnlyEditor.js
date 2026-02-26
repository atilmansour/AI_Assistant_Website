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

import React, { useState, useEffect, useCallback } from "react";
import TextEditor from "../components/QuillTextEditor";
import Button from "../components/Button";
import Modal from "../components/Modal";

const OnlyEditor = () => {
  // ----------------------------
  // LOGGING STATE
  // ----------------------------
  const [editorLog, setEditorLog] = useState([]); // detailed logs from the editor
  const [currentLastEditedText, setCurrentLastEditedText] = useState(""); // latest editor text (used to compute word count)

  // ----------------------------
  // MODALS + SUBMISSION STATE
  // ----------------------------
  const [isModalOpen, setModalOpen] = useState(false); // final "confirm submit" modal
  const [isEarlyModalOpen, setEarlyModalOpen] = useState(false); // "not enough words yet" modal
  const [submit, setSubmit] = useState(false); // used to disable the submit button + passed into TextEditor
  const [canSubmit, setCanSubmit] = useState(false); // true only when word threshold is met

  // CONFIG YOU WILL EDIT: pasteFlag is always false here (and TextEditor has its own paste prevention too).
  // If you want to control paste behavior dynamically, convert this into a state variable.
  const pasteFlag = false;

  // Word count
  const [currentLength, setcurrentLength] = useState(0);

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
  // Word threshold check
  // CONFIG YOU WILL EDIT:
  // Minimum words currently: 50
  // ----------------------------
  useEffect(() => {
    if (currentLastEditedText.length > 0) {
      setcurrentLength(
        currentLastEditedText.trim().split(/\s+/).filter(Boolean).length,
      );

      if (currentLength >= 50) {
        setCanSubmit(true);
      } else {
        setCanSubmit(false);
      }
    } else {
      setCanSubmit(false);
    }
  }, [currentLastEditedText, currentLength]);

  // Open the submit flow:
  // - If canSubmit: show confirm modal
  const handleOpenModal = () => {
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
      editor: editorLog,
    };

    saveLogsToS3(logs);
  };

  // Receives the full editor logs array from TextEditor
  const handleEditorLog = useCallback((allLogs) => {
    setEditorLog(allLogs);
  }, []);

  // Upload logs to backend (/api/logs) which saves to S3
  // CONFIG YOU WILL EDIT:
  // - REACT_APP_API_BASE must be set in your frontend .env
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
    alert("Please copy this code to qualtrics: " + logs.id);
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
        message="Please write a few more sentences in your application."
        showConfirm={false}
      />
    </div>
  );
};

export default OnlyEditor;
