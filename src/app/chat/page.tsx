import Header from '@/components/common/header';
import ChatApp from '@/components/pages/chat';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import React from 'react'

export default function ChatPage() {
  return (
    <ProtectedRoute>
      <Header />
      <ChatApp />
    </ProtectedRoute>
  )
}
