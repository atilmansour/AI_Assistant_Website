import React, { useState } from 'react';
import Button from '../../Button';

const MessageInput = ({ onSendMessage }) => {
  //setUserMessage is a function that updates current state with userMessage
  const [userMessage, setUserMessage] = useState('');

  const handleInputChange = (event) => {
    setUserMessage(event.target.value);
  };

  const handleSendMessage = () => {
    onSendMessage(userMessage);
    setUserMessage(''); //reset message box to empty
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      // Call the sendMessage function when Enter is pressed
      handleSendMessage();
    }
  };

  return (
    <div className='user-send'>
      <input
        type='text'
        value={userMessage} //value is updated to the current message
        onChange={handleInputChange}
        onKeyDown={handleKeyPress}
        placeholder='Type your message...'
      />
      <Button title='Send' onClick={handleSendMessage} />
    </div>
  );
};

export default MessageInput;
