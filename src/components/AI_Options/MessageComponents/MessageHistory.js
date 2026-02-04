import React, { useEffect, useRef } from "react";

const MessageHistory = ({ messages }) => {
  console.log(messages);

  //reference to end of messages
  const messagesEndRef = useRef(null);

  //this function allows to scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  //every time messages have an update - scroll down
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    //printing messages history
    <div id="chat-output">
      {messages?.map((message, index) => (
        <div key={index} className={message?.sender}>
          {message?.text}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageHistory;
