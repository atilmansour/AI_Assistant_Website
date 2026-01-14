import { useState, useEffect, useCallback, useRef } from "react";
import TextEditor from "../components/QuillTextEditor";
import ChatGPT from "../components/ChatGPT/ChatGPT";
import Button from "../components/Button";
import Modal from "../components/Modal";
import "../App.css";
import AWS from "aws-sdk";

const ButtonPress = () => {
  const [editorLog, setEditorLog] = useState([]);
  const [currentLastEditedText, setCurrentLastEditedText] = useState("");
  const [messagesLog, setMessagesLog] = useState([]);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isEarlyModalOpen, setEarlyModalOpen] = useState(false);
  const [submit, setSubmit] = useState(false);
  const pasteFlagI = false;

  const [canSubmit, setCanSubmit] = useState(false);
  const [currentLength, setcurrentLength] = useState(0);
  const [canSubmitWord, setCanSubmitWord] = useState(false);
  const [canSubmitTime, setCanSubmitTime] = useState(false);

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
    if (currentLastEditedText.length > 0) {
      setcurrentLength(
        currentLastEditedText.trim().split(/\s+/).filter(Boolean).length
      );
      if (currentLength >= 50) {
        setCanSubmitWord(true);
      } else {
        setCanSubmitWord(false);
      }
    } else {
      setCanSubmitWord(false);
    }
  }, [currentLastEditedText, currentLength]);

  const logChatEvent = useCallback((type, extra = {}) => {
    const t = Math.round(performance.now() - startMsRef.current);
    setChatEvents((prev) => [...prev, { t_ms: t, type, ...extra }]);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setCanSubmitTime(true), 180000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setCanSubmit(canSubmitWord && canSubmitTime);
  }, [canSubmitWord, canSubmitTime]);

  const handleOpenModal = () => {
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
      () => characters[Math.floor(Math.random() * characters.length)]
    ).join("");
    return `B${middlePart}1`;
  }

  const handleConfirmSubmit = async () => {
    setModalOpen(false);
    const logs = {
      id: getRandomString(5),
      chatEvents: chatEvents,
      ButtonPressed: openAiAfterMs,
      messages: messagesLog,
      editor: editorLog,
      wordCount: currentLength,
      canSubmitWord,
      canSubmitTime,
      canSubmit,
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
    const S3_BUCKET = process.env.REACT_APP_BucketS3;
    const REGION = "eu-north-1";

    AWS.config.update({
      accessKeyId: process.env.REACT_APP_ACCESS_KEY_ID,
      secretAccessKey: process.env.REACT_APP_SECRET_ACCESS_KEY,
    });

    const s3 = new AWS.S3({
      params: { Bucket: S3_BUCKET },
      region: REGION,
    });

    const key = logs.id.toString() + ".txt";
    const logsString = JSON.stringify(logs);

    const params = {
      Bucket: S3_BUCKET,
      Key: key,
      Body: logsString,
    };

    const upload = s3
      .putObject(params)
      .on("httpUploadProgress", (evt) => {
        console.log(
          "Uploading " + parseInt((evt.loaded * 100) / evt.total) + "%"
        );
      })
      .promise();

    await upload.then((err) => {
      console.log(err);
      alert("Please copy this code to qualtrics: " + logs.id);
    });
  };

  const assistantSlotClass = `${isChatOpen ? "open" : ""} ${
    isChatCollapsed ? "collapsed" : ""
  }`.trim();

  return (
    <div>
      <p id="instructions" style={{ display: "block" }}>
        Instructions: Please write 4-5 concrete and actionable ideas for
        improving the Prolific platform. For each idea, please: Assign a number
        (e.g., Idea 1, Idea 2, Idea 3), Provide a short title, Include a brief
        description explaining the idea. {"\n"}
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

            <ChatGPT
              onMessagesSubmit={handleMessages}
              initialMessages={[
                "Hello, I am your AI assistant. Feel free to ask me for help when brainstorming ideas!",
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
        message="Please continue working on the task."
        showConfirm={false}
      />
    </div>
  );
};

export default ButtonPress;
