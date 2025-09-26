// components/ChatWindow.tsx
import { useState, useRef, useEffect } from 'react';
import { ChatUser, Message } from '.';
import { Socket } from 'socket.io-client';
import VideoCallModal from './VideoCallModal';

interface ChatWindowProps {
  user: ChatUser;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onBack: () => void;
  // Updated interface - removed onPoke prop
  socket: Socket;
  yourId: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ user, messages, onSendMessage, onBack, socket, yourId }) => {
  const [message, setMessage] = useState('');
  const [isVideoCallOpen, setIsVideoCallOpen] = useState(false);
  const [roomId, setRoomId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleVideo = () => {
    console.log('Video clicked');
    // Generate a random number between 0 and 9999 (inclusive)
    const randomNumber = Math.floor(Math.random() * 10000);
    setRoomId(randomNumber.toString());
    setIsVideoCallOpen(true);
    
    socket.emit("requestingVideoCall", {
      senderId: yourId,
      receiverId: user.id,
      conversationId: user.conversationId,
      roomId: randomNumber
    });
  };

  const handleCloseVideoCall = () => {
    setIsVideoCallOpen(false);
    setRoomId('');
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center px-4 py-3 border-b border-gray-200 bg-white">
          <button 
            className="lg:hidden mr-3 text-gray-500"
            onClick={onBack}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-shrink-0 relative">
            <img className="h-10 w-10 rounded-full" src={user.avatar} alt={user.name} />
            <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white 
              ${user.status === 'online' ? 'bg-green-400' : 
                user.status === 'away' ? 'bg-yellow-400' : 'bg-gray-400'}`} 
            />
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500 capitalize">{user.status}</p>
          </div>
          <div className="flex space-x-2">
            <button className="p-2 text-gray-500 hover:text-indigo-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
            <button className="p-2 text-gray-500 hover:text-indigo-600" onClick={() => handleVideo()}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          <div className="space-y-4">
            {messages.map(msg => (
              <div 
                key={msg.id} 
                className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.isMe ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 shadow'}`}>
                  <p>{msg.content}</p>
                  <p className={`text-xs mt-1 ${msg.isMe ? 'text-indigo-200' : 'text-gray-500'}`}>
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="bg-white border-t border-gray-200 p-4">
          <form onSubmit={handleSubmit} className="flex space-x-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 rounded-md border text-black border-gray-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!message.trim()}
              className="px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {/* Video Call Modal */}
      <VideoCallModal
        isOpen={isVideoCallOpen}
        onClose={handleCloseVideoCall}
        roomId={roomId}
        remoteUserId={user.id}
      />
    </>
  );
};

export default ChatWindow;