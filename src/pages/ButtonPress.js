import { useState, useEffect, useCallback, useRef } from "react";
import TextEditor from "../components/QuillTextEditor";
import AI_API from "../components/AI_Options/AI_API";
import Button from "../components/Button";
import Modal from "../components/Modal";
import "../App.css";

const ButtonPress = () => {
  const [editorLog, setEditorLog] = useState([]);
  const [currentLastEditedText, setCurrentLastEditedText] = useState("");
  const [messagesLog, setMessagesLog] = useState([]);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isEarlyModalOpen, setEarlyModalOpen] = useState(false);
  const [submit, setSubmit] = useState(false);
  const pasteFlagI = false;

  const [submitAttempts, setSubmitAttempts] = useState(0);
  const [submitAttemptTimesMs, setSubmitAttemptTimesMs] = useState([]); // [t1, t2, ...]

  const [canSubmit, setCanSubmit] = useState(false);
  const [currentLength, setcurrentLength] = useState(0);
  const startTimeRef = useRef(Date.now());

  const [canSubmitWord, setCanSubmitWord] = useState(false);
  const [canSubmitTime, setCanSubmitTime] = useState(false);
  const [messageEarlyModal, setMessageEarlyModal] = useState(
    "Most participants spend more time developing their ideas before submitting. Please review your work and add any additional thoughts before continuing.",
  );
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);

  const pageStartMsRef = useRef(Date.now());
  const [openAiAfterMs, setOpenAiAfterMs] = useState(null);

  const startMsRef = useRef(performance.now());
  const [chatEvents, setChatEvents] = useState([]);

  useEffect(() => {
    setSubmit(isModalOpen);
  }, [isModalOpen, isEarlyModalOpen]);

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

  useEffect(() => {
    const wc = currentLastEditedText.trim().split(/\s+/).filter(Boolean).length;

    setcurrentLength(wc);
    setCanSubmitWord(wc >= 50);
  }, [currentLastEditedText]);

  const logChatEvent = useCallback((type, extra = {}) => {
    const t = Math.round(performance.now() - startMsRef.current);
    setChatEvents((prev) => [...prev, { t_ms: t, type, ...extra }]);
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

  const handleOpenChat = useCallback(() => {
    setAiUsed(true);
    const elapsed = Date.now() - pageStartMsRef.current;
    setOpenAiAfterMs(elapsed);
    setIsChatOpen(true);
    setIsChatCollapsed(false);
    logChatEvent("chat_open", { source: "toolbar" });
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

  function getRandomString(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const middlePart = Array.from(
      { length },
      () => characters[Math.floor(Math.random() * characters.length)],
    ).join("");
    return `B${middlePart}45`;
  }

  const handleConfirmSubmit = async () => {
    setModalOpen(false);
    const logs = {
      id: getRandomString(5),
      chatEvents: chatEvents,
      ButtonPressed: openAiAfterMs,
      NumOfSubmitClicks: submitAttempts,
      TimeStampOfSubmitClicks: submitAttemptTimesMs,
      messages: messagesLog,
      editor: editorLog,
      wordCount: currentLength,
    };

    saveLogsToS3(logs);
  };

  const handleEditorLog = useCallback((allLogs) => {
    setEditorLog(allLogs);
  }, []);

  const handleMessages = (allMessages) => {
    setMessagesLog(allMessages);
  };

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

  const assistantSlotClass = `${isChatOpen ? "open" : ""} ${
    isChatCollapsed ? "collapsed" : ""
  }`.trim();

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
              onOpenChat={handleOpenChat}
              showAI={!aiUsed}
            />
          </div>
        </div>

        <div id="assistant-slot" className={assistantSlotClass}>
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
              initialMessages={[
                "Hello, this is a present message that you can edit in your code in AIStillPage.js (theInitialMsg).",
                "This is the second message, you can edit, add more, or delete me.",
              ]}
              lastEditedText={currentLastEditedText}
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

export default ButtonPress;
