import React, { useState } from "react";
import Button from "../../Button";

/**
 * MessageInput
 * A text input + Send button for a chat UI.
 *
 * Props:
 * - onSendMessage - called with the message text when the user sends
 */

const MessageInput = ({ onSendMessage }) => {
  // Stores what the user is currently typing
  const [userMessage, setUserMessage] = useState("");

  // Update state as the user types
  const handleInputChange = (event) => {
    setUserMessage(event.target.value);
  };

  // Send the message to the parent component and clear the input
  const handleSendMessage = () => {
    onSendMessage(userMessage);
    setUserMessage(""); // Reset input to empty after sending
  };

  // Allow sending by pressing Enter
  const handleKeyPress = (event) => {
    if (event.key === "Enter") {
      handleSendMessage();
    }
  };

  return (
    <div className="user-send">
      <input
        type="text"
        value={userMessage} // Controlled input: value comes from React state
        onChange={handleInputChange}
        onKeyDown={handleKeyPress}
        placeholder="Type your message..."
      />
      <Button title="Send" onClick={handleSendMessage} />
    </div>
  );
};

export default MessageInput;
