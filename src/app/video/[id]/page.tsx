import React from 'react'
import Room from '@/components/pages/video'
import Header from '@/components/common/header'
import ProtectedRoute from '@/components/common/ProtectedRoute'

export default async function page({params}: {params: Promise<{id: string}>}) {
  const { id } = await params;
  
  return (
    <ProtectedRoute>
      <Header />
      <Room id={id} />
    </ProtectedRoute>
  )
}
