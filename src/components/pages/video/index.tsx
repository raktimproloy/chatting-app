'use client'
import { usePeer } from '@/providers/Peer';
import { useSocket } from '@/providers/Socket';
import React, { useRef, useState, useCallback, useEffect } from 'react'


interface VideoPageProps {
  id: string;
}

export default function VideoPage({id}: VideoPageProps) {
  const {socket} = useSocket();
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const {peer, createOffer, createAnswer, setRemoteAns, sendStream, remoteStream} = usePeer();
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [remoteEmail, setRemoteEmail] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);


  const handleNewUserJoined = useCallback(async (data: {emailId: string}) => {
      const {emailId} = data;
      console.log("New user joined", data);
      setRemoteEmail(emailId)
      
      // Send stream first, then create offer
      if (myStream) {
          sendStream(myStream)
      }
      
      const offer = await createOffer();
      socket?.emit('call-user', {emailId, offer})
  }, [socket, createOffer, myStream, sendStream])

  const handleIncommingCall = useCallback(async (data: {from: string, offer: RTCSessionDescriptionInit}) => {
      const {from, offer} = data;
      console.log("Incomming call from", from);
      console.log("Offer", offer);
      setRemoteEmail(from)
      
      // Send stream first, then create answer
      if (myStream) {
          sendStream(myStream)
      }
      
      const ans = await createAnswer(offer)
      socket?.emit('call-accpeted', {emailId: from, ans})
  }, [socket, createAnswer, myStream, sendStream])


  const handleCallAccepted = useCallback(async (data: {ans: RTCSessionDescriptionInit}) => {
      const {ans} = data;
      console.log("Call accepted", ans);
      await setRemoteAns(ans)
  }, [setRemoteAns])

  useEffect(() => {
      if (socket) {
          socket.on('user-joined', handleNewUserJoined)
          socket.on('incomming-call', handleIncommingCall)
          socket.on('call-accpeted', handleCallAccepted)
      }

      return () => {
          if (socket) {
              socket.off('user-joined', handleNewUserJoined)
              socket.off('incomming-call', handleIncommingCall)
              socket.off('call-accpeted', handleCallAccepted)
          }
      }
  }, [socket, handleNewUserJoined, handleIncommingCall, handleCallAccepted])




  const getUserMediaStream = useCallback(async () => {
      try {
          // Try to get both video and audio first
          const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true})
          console.log("stream", stream);
          setMyStream(stream)
          // Set the stream to the video element
          if (videoRef.current) {
              videoRef.current.srcObject = stream;
          }
      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error("Error accessing camera/microphone:", error);
          setMediaError(errorMessage);
          
          // Try with just audio if video fails
          try {
              console.log("Trying with audio only...");
              const audioStream = await navigator.mediaDevices.getUserMedia({video: false, audio: true})
              console.log("Audio stream", audioStream);
              setMyStream(audioStream)
              if (videoRef.current) {
                  videoRef.current.srcObject = audioStream;
              }
              setMediaError("Video not available, using audio only. Please check your camera permissions.");
          } catch (audioError) {
              const audioErrorMessage = audioError instanceof Error ? audioError.message : 'Unknown audio error';
              console.error("Error accessing audio:", audioError);
              setMediaError(`Error accessing camera/microphone: ${errorMessage}\n\nPlease make sure:\n1. You have granted camera/microphone permissions\n2. No other application is using the camera\n3. You are using HTTPS (required by some browsers)\n4. Your browser supports WebRTC`);
          }
      }
  }, [])

  useEffect(() => {
      getUserMediaStream()
  }, [getUserMediaStream])

  // Update video element when stream changes
  useEffect(() => {
      if (videoRef.current && myStream) {
          videoRef.current.srcObject = myStream;
      }
      if (remoteVideoRef.current && remoteStream) {
          remoteVideoRef.current.srcObject = remoteStream;
      }
  }, [myStream, remoteStream])

  const handleNegotiationNeededEvent = useCallback(async () => {        
      if (remoteEmail && socket && peer) {
          const localOffer = peer.localDescription;
          socket.emit('call-user', {emailId: remoteEmail, offer: localOffer})
      }
  }, [remoteEmail, socket, peer])

  useEffect(() => {
      if (!peer) return;
      
      peer.addEventListener('negotiationneeded', handleNegotiationNeededEvent)
      return () => {
          peer.removeEventListener('negotiationneeded', handleNegotiationNeededEvent)
      }
  }, [peer, handleNegotiationNeededEvent])
  return (
    <div>
    <h4>You are connected to {remoteEmail || 'No one'}</h4>
    
    {mediaError && (
        <div style={{ 
            background: '#ffebee', 
            color: '#c62828', 
            padding: '10px', 
            margin: '10px 0',
            borderRadius: '4px',
            whiteSpace: 'pre-line'
        }}>
            {mediaError}
            <button 
                onClick={() => {
                    setMediaError(null);
                    getUserMediaStream();
                }}
                style={{
                    marginLeft: '10px',
                    padding: '5px 10px',
                    background: '#1976d2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                }}
            >
                Retry
            </button>
        </div>
    )}
    
    <video 
        ref={videoRef} 
        autoPlay 
        muted 
        playsInline
        style={{ width: '300px', height: '200px' }}
    />
    <video 
        ref={remoteVideoRef} 
        autoPlay 
        playsInline
        style={{ width: '300px', height: '200px' }}
    />
</div>
  )
}
