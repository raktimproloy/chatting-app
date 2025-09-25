import React from 'react'
import Room from '@/components/pages/video'

export default function page({params}: {params: {id: string}}) {
  return (
    <Room id={params.id} />
  )
}
