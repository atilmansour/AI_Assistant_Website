import React, { useState, useEffect } from "react";
import MessageInput from "./MessageComponents/MessageInput";
import axios from "axios";
import MessageDisplay from "./MessageComponents/MessageHistory";
import "../../App.css";

const ChatGPT = ({
  onMessagesSubmit,
  initialMessages = [],
  lastEditedText,
}) => {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    onMessagesSubmit(messages);
  }, [messages, onMessagesSubmit]);

  useEffect(() => {
    setMessages(
      (initialMessages || []).map((text) => ({
        timestamp: new Date().toLocaleTimeString(),
        text,
        sender: "chatbot",
      }))
    );
  }, []);

  const sendMessage = async (userMessage) => {
    const timestamp = new Date().toLocaleTimeString();

    const newUserMessage = {
      timestamp,
      text: userMessage,
      sender: "user",
    };
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);

    const writingContext = lastEditedText
      ? `This is what I have written so far: ${lastEditedText}`
      : ``;

    const chatHistory = [
      { role: "user", content: writingContext },
      ...messages.map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.text,
      })),
      { role: "user", content: userMessage },
    ];

    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          max_tokens: 1000, //max tokens
          model: "gpt-4o", //GPT version, change to the model you would like
          messages: chatHistory, //Sending the entire history so that GPT would have a "memory" of the entire conversation
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: process.env.REACT_APP_GPT_KEY, //this is the environment variable - your gpt private key
          },
        }
      );

      const chatbotResponse = response.data.choices[0].message.content.trim();

      setMessages((prevMessages) => [
        ...prevMessages,
        { timestamp, text: chatbotResponse, sender: "chatbot" }, //Updating new messages - marking the sender as chatbot.
      ]);
    } catch (error) {
      //in case of an error, the chatbot sends: "sorry, an error occurred."
      console.error("Error:", error);
      setMessages((prevMessages) => [
        ...prevMessages,
        { timestamp, text: "Sorry, an error occurred.", sender: "chatbot" },
      ]);
    }
  };

  return (
    <div id="chat-container">
      <div id="chat-output">
        <div id="messages-history">
          <MessageDisplay messages={messages} />
        </div>
      </div>

      <MessageInput onSendMessage={sendMessage} />
    </div>
  );
};

export default ChatGPT;
