import React from "react";
import Button from "./Button";
import "../App.css";

/**
 * Modal
 * A simple modal/popup that shows a message and action buttons.
 *
 * Props:
 * - isOpen (boolean): controls whether the modal is visible
 * - onClose (function): runs when the user clicks Cancel
 * - onConfirm (function): runs when the user clicks Confirm (optional)
 * - message (string): text shown inside the modal
 * - showConfirm (boolean): whether to show the Confirm button
 */

const Modal = ({ isOpen, onClose, onConfirm, message, showConfirm }) => {
  // If the modal isn't open, render nothing
  if (!isOpen) return null;

  //else, overlay the modal in the center.
  return (
    <div className="modal-overlay">
      <div className="modal">
        <p>{message}</p>
        <div className="buttons-on-modal">
          {showConfirm && <Button onClick={onConfirm} to="/" title="Confirm" />}
          <Button onClick={onClose} title="Cancel" />
        </div>
      </div>
    </div>
  );
};

export default Modal;
