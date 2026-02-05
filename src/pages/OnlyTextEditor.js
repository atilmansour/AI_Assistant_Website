import React, { useState, useEffect, useCallback } from "react";
import TextEditor from "../components/QuillTextEditor";
import Button from "../components/Button";
import Modal from "../components/Modal";
import AWS from "aws-sdk";

const OnlyTextEditor = () => {
  const [editorLog, setEditorLog] = useState([]);
  const [currentLastEditedText, setCurrentLastEditedText] = useState("");
  const [isModalOpen, setModalOpen] = useState(false);
  const [isEarlyModalOpen, setEarlyModalOpen] = useState(false);
  const [submit, setSubmit] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [showInactiveModal, setShowInactiveModal] = useState(false); // State for showing inactivity modal
  const pasteFlagC = false;

  const [currentLength, setcurrentLength] = useState(0);

  useEffect(() => {
    if (isModalOpen) {
      setSubmit(true);
    } else {
      setSubmit(false);
    }
  }, [isModalOpen]);

  useEffect(() => {
    const handleCopy = (event) => {
      event.preventDefault();
    };

    const handleCut = (event) => {
      event.preventDefault();
    };

    const handlePaste = (event) => {
      event.preventDefault();
    };

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
        currentLastEditedText.trim().split(/\s+/).filter(Boolean).length,
      );
      if (currentLength >= 80) {
        setCanSubmit(true);
      } else {
        setCanSubmit(false);
      }
    } else {
      setCanSubmit(false);
    }
  }, [currentLastEditedText, currentLength]);

  useEffect(() => {
    let activityTimer = setTimeout(() => {
      setShowInactiveModal(true);
    }, 120000); // 2 minutes in milliseconds

    const activityHandler = () => {
      clearTimeout(activityTimer);
      activityTimer = setTimeout(() => {
        setShowInactiveModal(true);
      }, 120000);
    };

    document.addEventListener("mousemove", activityHandler);
    document.addEventListener("keydown", activityHandler);

    return () => {
      document.removeEventListener("mousemove", activityHandler);
      document.removeEventListener("keydown", activityHandler);
      clearTimeout(activityTimer);
    };
  }, []);

  const handleOpenModal = () => {
    if (canSubmit) {
      setModalOpen(true);
    } else {
      setEarlyModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
  };

  const handleCloseEarlyModal = () => {
    setEarlyModalOpen(false);
  };

  const handleCloseInactiveModal = () => {
    setShowInactiveModal(false);
  };

  function getRandomString(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const middlePart = Array.from(
      { length: length },
      () => characters[Math.floor(Math.random() * characters.length)],
    ).join("");
    return `ANA${middlePart}`;
  }

  const handleConfirmSubmit = async () => {
    setModalOpen(false);
    const logs = {
      id: getRandomString(5),
      editor: editorLog,
    };
    saveLogsToS3(logs);
  };

  const handleEditorLog = useCallback((allLogs) => {
    setEditorLog(allLogs);
    setShowInactiveModal(false);
  }, []);

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

    var upload = s3
      .putObject(params)
      .on("httpUploadProgress", (evt) => {
        console.log(
          "Uploading " + parseInt((evt.loaded * 100) / evt.total) + "%",
        );
      })
      .promise();

    await upload.then((err, data) => {
      console.log(err);
      alert("Please copy this code to qualtrics: " + logs.id);
    });
  };

  return (
    <div>
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
              pasteFlag={pasteFlagC}
              onLastEditedTextChange={setCurrentLastEditedText}
              showAI={false}
            />
          </div>
        </div>
      </div>
      <Modal
        isOpen={showInactiveModal}
        onClose={handleCloseInactiveModal}
        message="I see that you are still thinking about your application. Try writing. It may flow."
        showConfirm={false}
      />
      <div id="submit-button-exp">
        <Button title="Submit" onClick={handleOpenModal} disabled={submit} />
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
        message="Please write a few more sentences in your application."
        showConfirm={false}
      />
    </div>
  );
};

export default OnlyTextEditor;
