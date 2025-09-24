// components/ChatList.tsx
import { User } from '@/services/api';
import { ChatUser } from '.';

interface ChatListProps {
  onlineUsers: User[];
  users: ChatUser[];
  onUserSelect: (user: ChatUser) => void;
  selectedUser: ChatUser | null;
}

const ChatList: React.FC<ChatListProps> = ({ users, onUserSelect, selectedUser, onlineUsers }) => {
  console.log("chat Users", users)
  return (
    <div className="overflow-y-auto">
      <div className="p-4">
        <h2 className="text-lg font-medium text-gray-900">Recent chats</h2>
      </div>
      <ul className="divide-y divide-gray-200">
        {users.map(user => (
          <li 
            key={user.id} 
            className={`p-4 hover:bg-gray-50 cursor-pointer ${selectedUser?.id === user.id ? 'bg-blue-50' : ''}`}
            onClick={() => onUserSelect(user)}
          >
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 relative">
                <img className="h-10 w-10 rounded-full" src={user.avatar} alt={user.name} />
                <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white 
                  ${onlineUsers.some((onlineUser: User) => onlineUser?._id === user.id) ? 'bg-green-400' : 
                    user.status === 'away' ? 'bg-yellow-400' : 'bg-gray-400'}`} 
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-sm text-gray-500 truncate">{user.lastMessage || 'No messages yet'}</p>
              </div>
              {user.unreadCount && user.unreadCount > 0 && (
                <div className="flex-shrink-0">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-indigo-500">
                    <span className="text-xs font-medium text-white">{user.unreadCount}</span>
                  </span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChatList;