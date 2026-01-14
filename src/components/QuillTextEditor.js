import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import "../App.css";

//Having a custom toolbar - relevant if you want to have "ButtonPress.js" as one of the conditions in your expirment
//This part adds a button named "AI Assistant" as the first time opening ChatGPT window.
// The data includes after how many milliseconds the user pressed the button.
//In case you do not want the button, you may use other conditions (there, showAI = false).
const CustomToolbar = ({ showAI, onOpenChat }) => (
  <div id="toolbar" className="ql-toolbar ql-snow">
    <span className="ql-formats">
      <select className="ql-header" defaultValue="">
        <option value="1" />
        <option value="2" />
        <option value="" />
      </select>
    </span>

    <span className="ql-formats">
      {" "}
      {/* Toolbar includes other functions as bold, italic, underline, etc. */}
      <button type="button" className="ql-bold" />
      <button type="button" className="ql-italic" />
      <button type="button" className="ql-underline" />
      <button type="button" className="ql-link" />
    </span>

    <span className="ql-formats">
      <button type="button" className="ql-list" value="ordered" />
      <button type="button" className="ql-list" value="bullet" />
      <button type="button" className="ql-clean" />

      {showAI && (
        <button
          type="button"
          className="ql-ai"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpenChat}
        >
          AI Assistant
        </button> /*Here, is the AI button, if you want to change it's name, change here */
      )}
    </span>
  </div>
);

const TextEditor = ({
  submit,
  onEditorSubmit, //handling submitting the text.
  pasteFlag, //pasteFlag checks if pasting to the text editor are allowed.
  onLastEditedTextChange, //saving last updated text.
  onOpenChat, //Opening chat.
  showAI = false, //the default is that there is no AI button.
}) => {
  const [log, setLog] = useState([]);
  const [text, setText] = useState("");
  const quillRef = useRef(null);

  const getQuill = () =>
    quillRef.current?.getEditor?.() || quillRef.current?.editor;

  useEffect(() => {
    if (submit) {
      const timestamp = new Date().toLocaleTimeString();
      onEditorSubmit([...log, { timestamp, text }]);
    }
  }, [submit]); // the log saves the exact timestamp and text.

  useEffect(() => {
    const root = getQuill()?.root;
    if (!root) return;

    const handlePaste = (event) => {
      if (!pasteFlag) event.preventDefault();
    };

    root.addEventListener("paste", handlePaste);
    return () => root.removeEventListener("paste", handlePaste);
  }, [pasteFlag]); //We remove paste if the flage is false

  useEffect(() => {
    const root = getQuill()?.root;
    if (root) root.setAttribute("autocomplete", "off"); //turning off autocomplete - we want our AI to be the only AI used.
  }, []);

  const modules = useMemo(
    () => ({
      toolbar: { container: "#toolbar" },
    }),
    []
  );

  const handleChange = (content, delta, source, editor) => {
    // Always keep editor controlled
    setText(content);

    // Only log after space insert/delete
    if (source === "user") {
      const ops = delta?.ops || [];
      const spaceInserted = ops.some((op) => op.insert === " ");
      const spaceDeleted = ops.some((op) => typeof op.delete === "number");

      if (spaceInserted || spaceDeleted) {
        const timestamp = new Date().toLocaleTimeString();
        const currentHtml = editor.getHTML ? editor.getHTML() : content;

        setLog((prev) => [...prev, { timestamp, text: currentHtml }]);
      }
    }
  };

  return (
    <div className="text-editor-wrapper">
      <CustomToolbar showAI={showAI} onOpenChat={onOpenChat} />
      <ReactQuill
        theme="snow"
        value={text}
        onChange={handleChange}
        onBlur={() => onLastEditedTextChange(text)}
        ref={quillRef}
        modules={modules}
      />
    </div>
  );
};

export default TextEditor;
