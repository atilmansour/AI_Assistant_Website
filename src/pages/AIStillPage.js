import { useState, useEffect, useCallback, useRef } from "react";
import TextEditor from "../components/QuillTextEditor";
import AI_API from "../components/AI_Options/AI_API";
import Button from "../components/Button";
import Modal from "../components/Modal";
import "../App.css";
import AWS from "aws-sdk";

const AIStillPage = () => {
  const [editorLog, setEditorLog] = useState([]);
  const [currentLastEditedText, setCurrentLastEditedText] = useState("");
  const [messagesLog, setMessagesLog] = useState([]);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isEarlyModalOpen, setEarlyModalOpen] = useState(false);
  const [submit, setSubmit] = useState(false);
  const pasteFlagI = false;
  const [canSubmit, setCanSubmit] = useState(false);
  const startTimeRef = useRef(Date.now());
  const [submitAttempts, setSubmitAttempts] = useState(0);
  const [submitAttemptTimesMs, setSubmitAttemptTimesMs] = useState([]); // [t1, t2, ...]

  const [currentLength, setcurrentLength] = useState(0);
  const [canSubmitWord, setCanSubmitWord] = useState(false);
  const [canSubmitTime, setCanSubmitTime] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messageEarlyModal, setMessageEarlyModal] = useState(
    "Most participants spend more time developing their ideas before submitting. Please review your work and add any additional thoughts before continuing.",
  );

  // Chat open/close/collapse events (ms since page start)
  const startMsRef = useRef(performance.now());

  // optional: prevent auto-open from firing multiple times
  const hasAutoOpenedRef = useRef(false);

  const openChat = useCallback(() => {
    setIsChatOpen(true); // always open fully
  }, []);

  useEffect(() => {
    setSubmit(isModalOpen);
  }, [isModalOpen]);

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

  //useEffect(() => {
  //  const timer = setTimeout(() => {
  //    setCanSubmitTime(true);
  //  }, 180000); // 3 minutes
  //  return () => clearTimeout(timer);
  //}, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCanSubmitTime(Date.now() - startTimeRef.current >= 180000); // 3 min
    }, 500); // update twice/sec

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

  useEffect(() => {
    const wc = currentLastEditedText.trim().split(/\s+/).filter(Boolean).length;

    setcurrentLength(wc);
    setCanSubmitWord(wc >= 50);
  }, [currentLastEditedText]);

  // Auto open chat after 20 seconds
  useEffect(() => {
    const t = setTimeout(() => {
      if (!hasAutoOpenedRef.current) {
        hasAutoOpenedRef.current = true;
        openChat();
      }
    }, 100);

    return () => clearTimeout(t);
  }, [openChat]);

  useEffect(() => {
    setCanSubmit(canSubmitWord && canSubmitTime);
    if (!canSubmitWord && !canSubmitTime)
      setMessageEarlyModal(
        "Most participants spend more time developing their ideas before submitting. Please review your work and add any additional thoughts before continuing.",
      );
    else if (!canSubmitWord)
      setMessageEarlyModal(
        "Most participants suggest more developed ideas before submitting. Please review your work and add any additional thoughts before continuing.",
      );
    else if (!canSubmitTime)
      setMessageEarlyModal(
        "Most participants spend more time developing their ideas before submitting. Please review your work and add any additional thoughts before continuing.",
      );
  }, [canSubmitWord, canSubmitTime]);

  const handleOpenModal = () => {
    const t_ms = Math.round(performance.now() - startMsRef.current);

    setSubmitAttempts((n) => n + 1);
    setSubmitAttemptTimesMs((prev) => [...prev, t_ms]);

    if (canSubmit) setModalOpen(true);
    else setEarlyModalOpen(true);
  };

  const handleCloseModal = () => setModalOpen(false);
  const handleCloseEarlyModal = () => setEarlyModalOpen(false);

  function getRandomString(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const middlePart = Array.from(
      { length },
      () => characters[Math.floor(Math.random() * characters.length)],
    ).join("");
    return `PO${middlePart}45`; //You can add prefix/suffix to the random string each .txt receives, so it would be easier to differeniate between conditions
  }

  const handleConfirmSubmit = async () => {
    setModalOpen(false);
    const logs = {
      id: getRandomString(5),
      NumOfSubmitClicks: submitAttempts,
      TimeStampOfSubmitClicks: submitAttemptTimesMs,
      messages: messagesLog,
      editor: editorLog,
    };
    saveLogsToS3(logs);
  };

  const handleEditorLog = useCallback((allLogs) => {
    setEditorLog(allLogs);
  }, []);

  const handleMessages = useCallback((allMessages) => {
    setMessagesLog(allMessages);
  }, []);

  // Function to save logs to S3

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

  const assistantSlotClass = `${isChatOpen ? "open" : ""}`.trim();

  return (
    <div>
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
              pasteFlag={pasteFlagI}
              onLastEditedTextChange={setCurrentLastEditedText}
              showAI={false}
            />
          </div>
        </div>

        {/* RIGHT: Chat slot (open + collapsible handle) */}
        <div id="assistant-slot" className={assistantSlotClass}>
          {/* handle shows only after chat is opened */}
          {isChatOpen}

          <div className="assistant-inner">
            <div className="chat-shell-header">
              <div>AI Assistant</div>
            </div>

            <AI_API
              onMessagesSubmit={handleMessages}
              initialMessages={[
                "Hello, this is a present message that you can edit in your code in AIStillPage.js (theInitialMsg).",
                "This is the second message, you can edit, add more, or delete me.",
              ]}
              lastEditedText={currentLastEditedText}
              aiProvider={"chatgpt"} // "chatgpt" | "claude" | "gemini
            />
          </div>
        </div>
      </div>

      <div id="submit-and-open">
        <div id="submit-button-exp">
          <Button title="Submit" onClick={handleOpenModal} />
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onConfirm={handleConfirmSubmit}
        message="Are you sure you want to submit?"
        showConfirm={true}
      />

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
