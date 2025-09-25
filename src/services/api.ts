/**
 * API Service
 * Handles all API requests with authentication token management
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

/**
 * Get authentication token from localStorage
 */
const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
};

/**
 * Make authenticated API request
 */
export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = getAuthToken();
  
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  
  // If token is invalid or expired, clear it
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    // Redirect to login page
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
  
  return response;
};

/**
 * GET request helper
 */
export const apiGet = (endpoint: string): Promise<Response> => {
  return apiRequest(endpoint, { method: 'GET' });
};

/**
 * POST request helper
 */
export const apiPost = (endpoint: string, data?: any): Promise<Response> => {
  return apiRequest(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
};

/**
 * PUT request helper
 */
export const apiPut = (endpoint: string, data?: any): Promise<Response> => {
  return apiRequest(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
};

/**
 * DELETE request helper
 */
export const apiDelete = (endpoint: string): Promise<Response> => {
  return apiRequest(endpoint, { method: 'DELETE' });
};

/**
 * Upload file helper
 */
export const apiUpload = (endpoint: string, file: File): Promise<Response> => {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append('file', file);
  
  return fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });
};

// ==================== AUTHENTICATION APIs ====================

export interface AuthResponse {
  success: boolean;
  message: string;
  data?: {
    user: User;
    token: string;
  };
}

export interface User {
  _id: string;
  fullname: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  phone: string;
  password: string;
}

export interface RegisterRequest {
  fullname: string;
  phone: string;
  password: string;
}

/**
 * Register a new user
 */
export const registerUser = async (userData: RegisterRequest): Promise<AuthResponse> => {
  const response = await apiPost('/auth/register', userData);
  return response.json();
};

/**
 * Login user
 */
export const loginUser = async (credentials: LoginRequest): Promise<AuthResponse> => {
  const response = await apiPost('/auth/login', credentials);
  return response.json();
};

/**
 * Get current user profile
 */
export const getCurrentUser = async (): Promise<{ success: boolean; data: { user: User } }> => {
  const response = await apiGet('/auth/me');
  return response.json();
};

// ==================== USERS APIs ====================

export interface UserListItem {
  user: {
    fullname: string;
    phone: string;
  };
  userId: string;
}

/**
 * Get all users
 */
export const getAllUsers = async (): Promise<UserListItem[]> => {
  const response = await apiGet('/users');
  return response.json();
};

// ==================== CONVERSATIONS APIs ====================

export interface ConversationRequest {
  senderId: string;
  receiverId: string;
}

export interface ConversationUserData {
  user: {
    fullname: string;
    phone: string;
    _id: string;
  };
  conversationId: string;
  lastMessage?: string;
  lastMessageTime?: string;
  lastMessageSenderId?: string;
  isLastMessageFromCurrentUser?: boolean;
  hasSeen?: boolean;
  notSeenBy?: Array<{
    userId: string;
    lastSeenAt: string;
  }>;
}

/**
 * Create a new conversation
 */
export const createConversation = async (conversationData: ConversationRequest): Promise<any> => {
  const response = await apiPost('/conversation', conversationData);
  return response.json();
};

/**
 * Get conversations for a user
 */
export const getConversations = async (userId: string): Promise<ConversationUserData[]> => {
  const response = await apiGet(`/conversation/${userId}`);
  return response.json();
};

// ==================== MESSAGES APIs ====================

export interface MessageRequest {
  conversationId?: string;
  senderId: string;
  message: string;
  receiverId?: string;
}

export interface MessageResponse {
  user: {
    fullname: string;
    phone: string;
    _id: string;
  };
  message: string;
  createdAt: string;
  _id: string;
}

/**
 * Send a message
 */
export const sendMessage = async (messageData: MessageRequest): Promise<any> => {
  const response = await apiPost('/message', messageData);
  return response.json();
};

/**
 * Get messages for a conversation
 */
export const getMessages = async (conversationId: string): Promise<MessageResponse[]> => {
  const response = await apiGet(`/message/${conversationId}`);
  return response.json();
};

/**
 * Mark messages as seen
 */
export const markMessagesAsSeen = async (conversationId: string, userId: string): Promise<any> => {
  const response = await apiPut(`/message/seen/${conversationId}`, { userId });
  return response.json();
};

// ==================== HEALTH CHECK API ====================

/**
 * Check server health
 */
export const checkServerHealth = async (): Promise<{ success: boolean; message: string; timestamp: string }> => {
  const response = await apiGet('/health');
  return response.json();
};