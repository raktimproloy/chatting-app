'use client';
import { useEffect, useState } from 'react';
import ChatList from './ChatList';
import UserList from './UserList';
import ChatWindow from './ChatWindow';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getAllUsers, 
  getConversations, 
  getMessages, 
  sendMessage, 
  createConversation,
  markMessagesAsSeen,
  UserListItem,
  ConversationUserData,
  MessageResponse,
  MessageRequest,
  User
} from '@/services/api';
import { io, Socket } from 'socket.io-client';

export interface ChatUser {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'away' | 'offline';
  lastSeen?: string;
  lastMessage?: string;
  unreadCount?: number;
  conversationId?: string;
  phone?: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId?: string;
  content: string;
  timestamp: string;
  isMe: boolean;
  seen: boolean;
  seenAt?: string | null;
}

const ChatApp: React.FC = () => {
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [activeView, setActiveView] = useState<'chats' | 'users'>('chats');
  const { user } = useAuth();

  // Utility function to calculate time ago
  const getTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const messageTime = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - messageTime.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    } else {
      const weeks = Math.floor(diffInSeconds / 604800);
      return `${weeks}w ago`;
    }
  };
  
  // State for data from APIs
  const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<ConversationUserData[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all users when component mounts
  useEffect(() => {
    if (user?._id) {
      fetchAllUsers();
      fetchConversations();
    }
  }, [user]);

  // Fetch all users from the API
  const fetchAllUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const usersData = await getAllUsers();
      // Filter out current user from the list
      const filteredUsers = usersData.filter(userItem => userItem.userId !== user?._id);
      setAllUsers(filteredUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // Fetch conversations for current user
  const fetchConversations = async () => {
    if (!user?._id) return;
    
    try {
      setLoading(true);
      setError(null);
      const conversationsData = await getConversations(user._id);
      
      // Remove duplicates from API data
      const uniqueConversations = conversationsData.filter((conv, index, self) => 
        index === self.findIndex(c => c.conversationId === conv.conversationId)
      );
      
      setConversations(uniqueConversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      setError('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };







  // Fetch messages for a conversation
  const fetchMessages = async (conversationId: string) => {
    if (!conversationId) return;
    
    try {
      setLoading(true);
      setError(null);
      const messagesData = await getMessages(conversationId);
      
      // Transform API messages to our Message interface
      const transformedMessages: Message[] = messagesData.map((msg, index) => ({
        id: msg._id || `${conversationId}-${index}`,
        senderId: msg.user._id,
        content: msg.message,
        timestamp: msg.createdAt,
        isMe: msg.user._id === user?._id,
        seen: msg.seen,
        seenAt: msg.seenAt
      }));
      
      setMessages(transformedMessages);
      
      // Mark messages as seen for the current user
      if (user?._id) {
        await markMessagesAsSeen(conversationId, user._id);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  // Handle user selection from chat list or user list
  const handleUserSelect = async (selectedChatUser: ChatUser) => {
    // Only fetch messages if switching to a different conversation
    const isDifferentConversation = selectedUser?.conversationId !== selectedChatUser.conversationId;
    
    setSelectedUser(selectedChatUser);
    
    // If user has a conversationId, fetch messages only if it's a different conversation
    if (selectedChatUser.conversationId && isDifferentConversation) {
      await fetchMessages(selectedChatUser.conversationId);
    } else if (!selectedChatUser.conversationId) {
      // If no conversation exists, check if there's an existing conversation with this user
      const existingConversation = conversations.find(conv => conv.user._id === selectedChatUser.id);
      
      if (existingConversation) {
        // Update the selected user with the conversation ID and fetch messages
        const updatedUser = { ...selectedChatUser, conversationId: existingConversation.conversationId };
        setSelectedUser(updatedUser);
        await fetchMessages(existingConversation.conversationId);
      } else {
        // No existing conversation, clear messages - new conversation will be created when first message is sent
        setMessages([]);
      }
    }
    // If it's the same conversation, keep existing messages
  };

  // Handle sending a message
  const handleSendMessage = async (content: string) => {
    if (!selectedUser || !user?._id) return;
    
    try {
      setError(null);
      
      const messageData: MessageRequest = {
        senderId: user._id,
        message: content,
        receiverId: selectedUser.id
      };

      // If we have a conversationId, use it, otherwise create a new conversation
      if (selectedUser.conversationId) {
        messageData.conversationId = selectedUser.conversationId;
      }

      const response = await sendMessage(messageData);
      console.log('Message sent:', response);

      // If a new conversation was created, update the selected user
      if (response.conversationId && !selectedUser.conversationId) {
        setSelectedUser(prev => prev ? { ...prev, conversationId: response.conversationId } : null);
        // Refresh conversations list
        await fetchConversations();
      }

      // Add message to UI immediately for sender
      const conversationId = response.conversationId || selectedUser.conversationId;
      if (conversationId) {
        const newMessage: Message = {
          id: `${conversationId}-${Date.now()}`,
          senderId: user._id,
          content: content,
          timestamp: new Date().toISOString(),
          isMe: true,
          seen: false,
          seenAt: undefined
        };
        setMessages(prevMessages => [...prevMessages, newMessage]);
      }

      // Send message via socket for real-time communication to receiver
      if (socket && conversationId) {
        socket.emit("sendMessage", {
          senderId: user._id,
          receiverId: selectedUser.id,
          message: content,
          conversationId: conversationId
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
    }
  };

  // Transform API data to ChatUser interface for display
  const transformToChatUsers = (data: (UserListItem | ConversationUserData)[]): ChatUser[] => {
    return data.map(item => {
      let lastMessageText = 'No messages yet';
      
      if ('lastMessage' in item && item.lastMessage) {
        const senderPrefix = item.isLastMessageFromCurrentUser ? 'You: ' : '';
        const timeAgo = item.lastMessageTime ? getTimeAgo(item.lastMessageTime) : '';
        lastMessageText = `${senderPrefix}${item.lastMessage} • ${timeAgo}`;
      }
      
      return {
        id: 'userId' in item ? item.userId : item.user._id,
        name: item.user.fullname,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(item.user.fullname)}&background=6366f1&color=ffffff`,
        status: 'online' as const,
        phone: item.user.phone,
        conversationId: 'conversationId' in item ? item.conversationId : undefined,
        lastMessage: lastMessageText
      };
    });
  };

  // Get chatted users (from conversations)
  const chattedUsers = transformToChatUsers(conversations);
  
  // Get all users for the users list
  const usersList = transformToChatUsers(allUsers);


  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Create socket connection only once
    const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000');
    setSocket(newSocket);

    // Cleanup function to disconnect socket when component unmounts
    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (socket && user?._id) {
      // Join user when socket is ready and user is available
      console.log(`Emitting joinUser with userId: ${user._id}`);
      socket.emit('joinUser', user._id);

      // Listen for users list updates
      socket.on("getUsers", (users) => {
        console.log("Users List", users);
        setOnlineUsers(users);
      });


      socket.on("getMessage", (data) => {
        console.log("Get Message", data);
        
        const isCurrentConversation = selectedUser?.conversationId === data.conversationId;
        const isNewConversation = !selectedUser?.conversationId && data.conversationId;
        const isFromSelectedUser = data.senderId === selectedUser?.id;
        const isToCurrentUser = data.receiverId === user?._id;

        console.log("Message conditions:", {
          isCurrentConversation,
          isNewConversation,
          isFromSelectedUser,
          isToCurrentUser
        });

        // Add message if it's to current user
        if(isToCurrentUser){
          // Check if this is a new conversation (sender not in existing conversations)
          const senderInConversations = conversations.find(conv => conv.user._id === data.senderId);
          
          if(!senderInConversations){
            console.log("New Conversation", data);
            // Add new conversation to the top of the list
            const newConversation = {
              conversationId: data.conversationId,
              user: {
                _id: data.senderId,
                fullname: data.user.fullname,
                phone: data.user.phone
              }
            };
            
            setConversations((prevConversations) => {
              // Check if conversation already exists to prevent duplicates
              const conversationExists = prevConversations.some(conv => 
                conv.conversationId === newConversation.conversationId || 
                conv.user._id === newConversation.user._id
              );
              
              if (conversationExists) {
                console.log("Conversation already exists, not adding duplicate");
                return prevConversations;
              }
              
              return [newConversation, ...prevConversations];
            });
            
            // Only auto-select if no user is currently selected
            if(!selectedUser){
              
              // Add the message to UI without clearing existing messages
              const newMessage: Message = {
                id: `${data.conversationId}-${Date.now()}`,
                senderId: data.senderId,
                content: data.message,
                timestamp: new Date().toISOString(),
                isMe: false,
                seen: false,
                seenAt: undefined
              };
              setMessages(prevMessages => [...prevMessages, newMessage]);
              
              console.log("New conversation added and user selected");
            } else {
              // If another user is selected, just add the conversation to the list
              console.log("New conversation added to list, but not auto-selected");
            }
            return;
          }
          
          // Handle existing conversation
          console.log("Adding message to UI");
          
          // Only add message if the sender is currently selected or if no user is selected
          const isFromSelectedUser = selectedUser?.id === data.senderId;
          const isCurrentConversation = selectedUser?.conversationId === data.conversationId;
          
          if(isFromSelectedUser && isCurrentConversation){
            // Add message to current conversation
            const messageId = `${data.conversationId}-${Date.now()}`;
            setMessages((prevMessages) => {
              // Check if message already exists to prevent duplicates
              const messageExists = prevMessages.some(msg => 
                msg.content === data.message && 
                msg.senderId === data.senderId && 
                Math.abs(new Date(msg.timestamp).getTime() - Date.now()) < 1000 // within 1 second
              );
              
              if (messageExists) {
                return prevMessages;
              }
              
              return [...prevMessages, {
                id: messageId,
                senderId: data.senderId,
                content: data.message,
                timestamp: new Date().toISOString(),
                isMe: false,
                seen: false,
                seenAt: undefined
              }];
            });
          } else {
            console.log("Message received from different user/conversation - not auto-selecting");
          }
        }else {
          console.log("Message not added - not for current user");
        }
      })

      // Cleanup event listeners when dependencies change
      return () => {
        socket.off("getUsers");
        socket.off("getMessage");
      };
    }
  }, [socket, user?._id]);



  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar for mobile */}
      <div className={`lg:hidden fixed inset-0 z-40 bg-gray-800 bg-opacity-75 transition-opacity ${selectedUser ? 'hidden' : 'block'}`}>
        <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform">
          <div className="flex flex-col h-full">
            <div className="flex p-4 border-b border-gray-200">
              <button
                className={`flex-1 py-2 text-center font-medium ${activeView === 'chats' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}
                onClick={() => setActiveView('chats')}
              >
                Chats
              </button>
              <button
                className={`flex-1 py-2 text-center font-medium ${activeView === 'users' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}
                onClick={() => setActiveView('users')}
              >
                Users
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : error ? (
                <div className="p-4 text-center text-red-600">
                  <p>{error}</p>
                  <button 
                    onClick={() => {
                      if (activeView === 'chats') fetchConversations();
                      else fetchAllUsers();
                    }}
                    className="mt-2 text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                activeView === 'chats' ? (
                  <ChatList onlineUsers={onlineUsers} users={chattedUsers} onUserSelect={handleUserSelect} selectedUser={selectedUser} />
                ) : (
                  <UserList users={usersList} onUserSelect={handleUserSelect} selectedUser={selectedUser} onlineUsers={onlineUsers} />
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden lg:flex lg:w-1/3 xl:w-1/4 flex-col border-r border-gray-200 bg-white">
        <div className="flex border-b border-gray-200">
          <button
            className={`flex-1 py-4 text-center font-medium ${activeView === 'chats' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}
            onClick={() => setActiveView('chats')}
          >
            Chats
          </button>
          <button
            className={`flex-1 py-4 text-center font-medium ${activeView === 'users' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}
            onClick={() => setActiveView('users')}
          >
            Users
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-600">
              <p>{error}</p>
              <button 
                onClick={() => {
                  if (activeView === 'chats') fetchConversations();
                  else fetchAllUsers();
                }}
                className="mt-2 text-sm text-indigo-600 hover:text-indigo-800"
              >
                Retry
              </button>
            </div>
          ) : (
            activeView === 'chats' ? (
              <ChatList onlineUsers={onlineUsers} users={chattedUsers} onUserSelect={handleUserSelect} selectedUser={selectedUser} />
            ) : (
              <UserList users={usersList} onUserSelect={handleUserSelect} selectedUser={selectedUser} onlineUsers={onlineUsers} />
            )
          )}
        </div>
      </div>

      {/* Chat window */}
      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <ChatWindow 
            socket={socket!}
            yourId={user?._id!}
            user={selectedUser} 
            messages={messages} 
            onSendMessage={handleSendMessage}
            onBack={() => setSelectedUser(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">No chat selected</h3>
              <p className="mt-2 text-sm text-gray-500">Select a user from the list to start chatting</p>
              <button
                type="button"
                className="mt-4 lg:hidden inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                onClick={() => setActiveView('chats')}
              >
                Open chat list
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatApp;