import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import "../App.css";

/**
 * CustomToolbar
 * Defines the Quill toolbar UI, including an optional "AI Assistant" button.
 */
const CustomToolbar = ({ showAI, onOpenChat }) => (
  <div id="toolbar" className="ql-toolbar ql-snow">
    {/* Header dropdown */}
    <span className="ql-formats">
      <select className="ql-header" defaultValue="">
        <option value="1" /> {/* H1 */}
        <option value="2" /> {/* H2 */}
        <option value="" /> {/* Normal */}
      </select>
    </span>

    {/* Basic text formatting */}
    <span className="ql-formats">
      <button type="button" className="ql-bold" />
      <button type="button" className="ql-italic" />
      <button type="button" className="ql-underline" />
      <button type="button" className="ql-link" />
    </span>

    {/* Lists + clear formatting + optional AI button */}
    <span className="ql-formats">
      <button type="button" className="ql-list" value="ordered" />
      <button type="button" className="ql-list" value="bullet" />
      <button type="button" className="ql-clean" />

      {/* Show AI Assistant button only when showAI=true */}
      {showAI && (
        <button
          type="button"
          className="ql-ai"
          // Prevent Quill from losing focus when clicking the button
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpenChat}
        >
          AI Assistant
        </button>
      )}
    </span>
  </div>
);

/**
 * TextEditor
 * A controlled ReactQuill editor that:
 * - Logs snapshots (timestamp + HTML) when the user types/deletes (space/delete rule)
 * - Reports plain text back to the parent via onLastEditedTextChange (e.g., for word count)
 * - Optionally blocks paste based on pasteFlag
 * - Submits accumulated logs when `submit` becomes true
 */
const TextEditor = ({
  submit,
  onEditorSubmit,
  pasteFlag,
  onLastEditedTextChange,
  onOpenChat,
  showAI = false,
  initalTextHere = "",
}) => {
  // Store editor snapshots over time (timestamp + HTML text)
  const [log, setLog] = useState([]);
  // Controlled editor content (HTML)
  const [text, setText] = useState(initalTextHere);
  // Reference to the ReactQuill instance so we can access the underlying Quill editor
  const quillRef = useRef(null);

  // Helper: safely get the underlying Quill editor instance
  const getQuill = () =>
    quillRef.current?.getEditor?.() || quillRef.current?.editor;

  /**
   * When submit becomes true:
   * - Create a timestamp
   * - Send the current logs + the latest text snapshot to the parent
   */
  useEffect(() => {
    if (submit) {
      const timestamp = new Date().toLocaleTimeString();
      onEditorSubmit([...log, { timestamp, text }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submit]);

  /**
   * Paste control:
   * - If pasteFlag is false, block paste inside the editor
   */
  useEffect(() => {
    const root = getQuill()?.root;
    if (!root) return;

    const handlePaste = (event) => {
      if (!pasteFlag) event.preventDefault();
    };

    root.addEventListener("paste", handlePaste);
    return () => root.removeEventListener("paste", handlePaste);
  }, [pasteFlag]);

  /**
   * Disable browser autocomplete inside the Quill editor
   */
  useEffect(() => {
    const root = getQuill()?.root;
    if (root) root.setAttribute("autocomplete", "off");
  }, []);

  /**
   * Quill modules config:
   * - Use our custom toolbar container (#toolbar)
   */
  const modules = useMemo(
    () => ({
      toolbar: { container: "#toolbar" },
    }),
    [],
  );

  /**
   * handleChange runs on each editor change.
   * - Updates the controlled editor value
   * - Sends plain text to parent (for live word count, etc.)
   * - Logs snapshots only when user inserts a space or deletes text (your rule)
   */
  const handleChange = (content, delta, source, editor) => {
    // Keep the editor controlled
    setText(content);

    // Send plain text to parent immediately (useful for word count)
    if (typeof onLastEditedTextChange === "function") {
      const plain = editor.getText().trim(); // Quill adds a trailing "\n"
      onLastEditedTextChange(plain);
    }

    // Only log for actual user actions (not programmatic updates)
    if (source === "user") {
      const ops = delta?.ops || [];

      // Your logging rule: log after inserting a space or any delete
      const spaceInserted = ops.some((op) => op.insert === " ");
      const spaceDeleted = ops.some((op) => typeof op.delete === "number");

      if (spaceInserted || spaceDeleted) {
        const timestamp = new Date().toLocaleTimeString();
        const currentHtml = editor.getHTML ? editor.getHTML() : content;

        // Store timestamp + HTML snapshot
        setLog((prev) => [...prev, { timestamp, text: currentHtml }]);
      }
    }
  };

  return (
    <div className="text-editor-wrapper">
      {/* Custom toolbar above the editor */}
      <CustomToolbar showAI={showAI} onOpenChat={onOpenChat} />

      {/* The actual rich-text editor */}
      <ReactQuill
        theme="snow"
        value={text}
        onChange={handleChange}
        ref={quillRef}
        modules={modules}
      />
    </div>
  );
};

export default TextEditor;
