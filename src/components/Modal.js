import React from "react";
import Button from "./Button";
import "../App.css";

const Modal = ({ isOpen, onClose, onConfirm, message, showConfirm }) => {
  if (!isOpen) return null;

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
