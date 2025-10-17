'use client'
import { useAuth } from '@/contexts/AuthContext';
import { usePeer } from '@/providers/Peer';
import { useSocket } from '@/providers/Socket';
import React, { useRef, useState, useCallback, useEffect } from 'react'
import { 
  FiMic, 
  FiMicOff, 
  FiVideo, 
  FiVideoOff, 
  FiPhone, 
  FiPhoneCall,
  FiUser,
  FiSettings,
  FiRefreshCw,
  FiX
} from 'react-icons/fi'
import clsx from 'clsx'

interface VideoCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  remoteUserId: string;
}

export default function VideoCallModal({ isOpen, onClose, roomId, remoteUserId }: VideoCallModalProps) {
  const { user } = useAuth();
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    if(user){
      setPhone(user?.phone);
    }
  }, [user]);

  const {socket} = useSocket();
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const {peer, createOffer, createAnswer, setRemoteAns, sendStream, remoteStream, addIceCandidate} = usePeer();
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  // signaling guards
  const hasSentOfferRef = useRef(false);
  const hasRemoteOfferRef = useRef(false);
  const hasAppliedAnswerRef = useRef(false);
  const lastOfferSdpRef = useRef<string | null>(null);
  const hasAnsweredRef = useRef(false);
  const hasSentStreamOnceRef = useRef(false);

  const [remotePhone, setRemotePhone] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  
  // Video controls state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');

  const handleNewUserJoined = useCallback(async (data: {userId: string}) => {
    const {userId} = data;
    console.log("New user joined", data);
    setRemotePhone(userId)
    
    if (myStream) {
      console.log('Sending my stream to remote user');
      sendStream(myStream)
    }
    
    // Only create offer if we haven't already and there is no remote offer
    if (!hasSentOfferRef.current && !hasRemoteOfferRef.current && peer?.signalingState === 'stable') {
      console.log('Creating offer for remote user');
      const offer = await createOffer();
      hasSentOfferRef.current = true;
      socket?.emit('call-user', {phoneId: userId, offer})
    } else {
      console.log('Skipped creating offer (already sent or remote offer present)', {
        hasSentOffer: hasSentOfferRef.current,
        hasRemoteOffer: hasRemoteOfferRef.current,
        state: peer?.signalingState
      })
    }
  }, [socket, createOffer, myStream, sendStream, peer])

  const handleIncommingCall = useCallback(async (data: {from: string, offer: RTCSessionDescriptionInit}) => {
    const {from, offer} = data;
    console.log("Incoming call from", from);
    setRemotePhone(from)
    hasRemoteOfferRef.current = true;

    // Deduplicate same offer SDP or repeated events
    if (offer && (lastOfferSdpRef.current === (offer as any).sdp)) {
      console.log('Duplicate offer SDP received, skipping');
      return;
    }
    lastOfferSdpRef.current = (offer as any)?.sdp || null;
    
    if (myStream) {
      console.log('Sending my stream in response to incoming call');
      sendStream(myStream)
    }
    
    console.log('Creating answer for incoming call');
    // Basic guard against wrong state and duplicates
    if (peer && (peer.signalingState === 'stable') && peer.currentRemoteDescription) {
      console.log('Already stable with remoteDescription, skipping answer creation')
      return;
    }
    if (hasAnsweredRef.current) {
      console.log('Already answered once, skipping duplicate answer');
      return;
    }
    const ans = await createAnswer(offer)
    hasAnsweredRef.current = true;
    // prefer existing app's event to avoid duplicates
    socket?.emit('call-accepted', {phoneId: from, answer: ans})
  }, [socket, createAnswer, myStream, sendStream])

  const handleCallAccepted = useCallback(async (data: {answer: RTCSessionDescriptionInit}) => {
    const {answer} = data;
    console.log("Call accepted", answer, 'state:', peer?.signalingState);
    // Guard against double-setting answer
    if (!peer) return;
    if (peer.currentRemoteDescription || hasAppliedAnswerRef.current) {
      console.log('Skipping setRemoteAns: remoteDescription already set');
    } else {
      await setRemoteAns(answer)
      hasAppliedAnswerRef.current = true;
    }
    setIsCallActive(true);
    setCallStatus('connected');
    setIsConnecting(false);
    console.log('Call connection established');
  }, [setRemoteAns, peer])

  // Video control functions
  const toggleMute = useCallback(() => {
    if (myStream) {
      const audioTracks = myStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  }, [myStream, isMuted]);

  const toggleVideo = useCallback(() => {
    if (myStream) {
      const videoTracks = myStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !isVideoEnabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  }, [myStream, isVideoEnabled]);

  const shareMyStream = useCallback(async () => {
    if (!myStream) return;
    try {
      await sendStream(myStream);
      // If we know the remote, initiate/refresh the offer so they receive our tracks
      if (remotePhone) {
        const offer = await createOffer();
        socket?.emit('call-user', { phoneId: remotePhone, offer });
        setIsConnecting(true);
        setCallStatus('connecting');
      }
    } catch (e) {
      console.error('Failed to share stream', e);
    }
  }, [myStream, sendStream, remotePhone, createOffer, socket]);

  const endCall = useCallback(() => {
    if (myStream) {
      myStream.getTracks().forEach(track => track.stop());
    }
    setMyStream(null);
    setRemotePhone(null);
    setIsCallActive(false);
    setCallStatus('disconnected');
    setIsConnecting(false);
    socket?.emit('call-ended', { phoneId: remotePhone });
    onClose();
  }, [myStream, socket, remotePhone, onClose]);

  const startCall = useCallback(() => {
    setIsConnecting(true);
    setCallStatus('connecting');
  }, []);

  const getUserMediaStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          facingMode: 'user'
        }, 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      setMyStream(stream)
      setMediaError(null);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("Error accessing camera/microphone:", error);
      setMediaError(errorMessage);
      
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false, 
          audio: { 
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        setMyStream(audioStream)
        setIsVideoEnabled(false);
        if (videoRef.current) {
          videoRef.current.srcObject = audioStream;
        }
        setMediaError("Video not available, using audio only.");
      } catch (audioError) {
        setMediaError(`Error accessing camera/microphone: ${errorMessage}`);
      }
    }
  }, [])

  useEffect(() => {
    if (socket) {
      socket.on('user-joined', handleNewUserJoined)
      socket.on('incomming-call', handleIncommingCall)
      socket.on('call-accepted', handleCallAccepted)
      socket.on('ice-candidate', async ({ from, candidate }) => {
        console.log('Received ICE candidate from', from, candidate);
        if (candidate) {
          try {
            await addIceCandidate(candidate)
          } catch (e) {
            console.error('Failed to add ICE candidate', e)
          }
        }
      })
    }

    return () => {
      if (socket) {
        socket.off('user-joined', handleNewUserJoined)
        socket.off('incomming-call', handleIncommingCall)
        socket.off('call-accepted', handleCallAccepted)
        socket.off('ice-candidate')
      }
    }
  }, [socket, handleNewUserJoined, handleIncommingCall, handleCallAccepted])

  useEffect(() => {
    if (isOpen) {
      getUserMediaStream()
      
      // Join the room when modal opens
      if (socket && user?._id && roomId) {
        console.log('Joining room:', { roomId, phoneId: user._id });
        socket.emit('join-room', { roomId, phoneId: user._id });
        setIsConnecting(true);
        setCallStatus('connecting');
      }

      // Emit our ICE candidates
      if (peer && socket && user?._id) {
        peer.onicecandidate = (event) => {
          if (event.candidate && remotePhone) {
            console.log('Sending ICE candidate to', remotePhone, event.candidate);
            socket.emit('ice-candidate', { toPhoneId: remotePhone, candidate: event.candidate });
          }
        }
      }
    } else {
      // Clean up when modal closes
      if (myStream) {
        myStream.getTracks().forEach(track => track.stop());
        setMyStream(null);
      }
      setRemotePhone(null);
      setIsCallActive(false);
      setCallStatus('idle');
      setIsConnecting(false);
    }
  // }, [isOpen, getUserMediaStream, myStream, socket, user?._id, roomId])
  }, [isOpen])

  // Direct-call when remoteUserId is known (mirror previous project behavior)
  useEffect(() => {
    const tryDirectStart = async () => {
      if (!isOpen || !socket || !user?._id || !remoteUserId) return;
      if (!myStream) return;
      try {
        setRemotePhone(remoteUserId);
        await sendStream(myStream);
        // Avoid double offer when we already have a remote offer/glare
        if (!hasRemoteOfferRef.current && !hasSentOfferRef.current && peer?.signalingState === 'stable') {
          const offer = await createOffer();
          hasSentOfferRef.current = true;
          socket.emit('call-user', { phoneId: remoteUserId, offer });
          setIsConnecting(true);
          setCallStatus('connecting');
        } else {
          console.log('Direct start skipped creating offer (glare/state guard)', {
            hasRemoteOffer: hasRemoteOfferRef.current,
            hasSentOffer: hasSentOfferRef.current,
            state: peer?.signalingState
          })
        }
      } catch (e) {
        console.error('Direct start call failed', e);
      }
    };
    tryDirectStart();
  }, [isOpen, socket, user?._id, remoteUserId, myStream, sendStream, createOffer, peer])

  useEffect(() => {
    if (videoRef.current && myStream) {
      videoRef.current.srcObject = myStream;
    }
    if (remoteVideoRef.current && remoteStream) {
      console.log('Setting remote video stream:', remoteStream);
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [myStream, remoteStream])

  // Debug remote stream changes
  useEffect(() => {
    console.log('Remote stream changed:', remoteStream);
    if (remoteStream) {
      console.log('Remote stream tracks:', remoteStream.getTracks());
      // Mark call connected when remote media arrives
      setIsCallActive(true);
      setCallStatus('connected');
      setIsConnecting(false);
    }
  }, [remoteStream])

  // Auto-send local stream to remote once available
  useEffect(() => {
    const sendOnce = async () => {
      if (!myStream || !remotePhone || hasSentStreamOnceRef.current) return;
      try {
        await sendStream(myStream);
        hasSentStreamOnceRef.current = true;
      } catch (e) {
        console.error('Auto send stream failed', e);
      }
    }
    sendOnce();
  }, [myStream, remotePhone, sendStream])

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 px-6 py-4 flex items-center justify-between rounded-t-lg">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <FiUser className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white text-lg font-semibold">Video Call</h1>
              <p className="text-gray-300 text-sm">
                {callStatus === 'connected' && remotePhone 
                  ? `Connected to ${remotePhone}` 
                  : callStatus === 'connecting' 
                  ? 'Connecting...' 
                  : 'Ready to call'
                }
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className={clsx(
              "w-3 h-3 rounded-full",
              callStatus === 'connected' ? 'bg-green-500' :
              callStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              'bg-gray-500'
            )} />
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <FiX className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Error Message */}
        {mediaError && (
          <div className="mx-6 mt-4 bg-red-900/20 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <FiSettings className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1">
                <p className="text-red-200 text-sm">{mediaError}</p>
                <button 
                  onClick={() => {
                    setMediaError(null);
                    getUserMediaStream();
                  }}
                  className="mt-3 inline-flex items-center px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition-colors"
                >
                  <FiRefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Video Area */}
        <div className="flex-1 relative p-6">
          <div className="relative w-full h-full">
            {/* Remote Video (Main) */}
            <div className="absolute inset-0 bg-gray-800 rounded-lg overflow-hidden shadow-2xl">
              {remoteStream ? (
                <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FiUser className="w-12 h-12 text-gray-400" />
                    </div>
                    <p className="text-gray-400 text-lg">No remote video</p>
                  </div>
                </div>
              )}
            </div>

            {/* Local Video (Picture-in-Picture) */}
            {myStream && (
              <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden shadow-lg border-2 border-gray-600">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  muted 
                  playsInline
                  className="w-full h-full object-cover"
                />
                {!isVideoEnabled && (
                  <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                    <FiVideoOff className="w-6 h-6 text-gray-400" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Control Panel */}
        <div className="bg-gray-800 px-6 py-4 rounded-b-lg">
          <div className="flex items-center justify-center space-x-4">
            {/* Mute/Unmute Button */}
            <button
              onClick={toggleMute}
              className={clsx(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
                isMuted 
                  ? "bg-red-600 hover:bg-red-700 text-white" 
                  : "bg-gray-600 hover:bg-gray-500 text-white"
              )}
              disabled={!myStream}
            >
              {isMuted ? <FiMicOff className="w-6 h-6" /> : <FiMic className="w-6 h-6" />}
            </button>

            {/* Video Toggle Button */}
            <button
              onClick={toggleVideo}
              className={clsx(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200",
                !isVideoEnabled 
                  ? "bg-red-600 hover:bg-red-700 text-white" 
                  : "bg-gray-600 hover:bg-gray-500 text-white"
              )}
              disabled={!myStream}
            >
              {isVideoEnabled ? <FiVideo className="w-6 h-6" /> : <FiVideoOff className="w-6 h-6" />}
            </button>

            {/* Call/End Call Button */}
            {isCallActive ? (
              <button
                onClick={endCall}
                className="w-14 h-14 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition-all duration-200"
              >
                <FiPhone className="w-7 h-7 text-white" />
              </button>
            ) : (
              <button
                onClick={startCall}
                className="w-14 h-14 bg-green-600 hover:bg-green-700 rounded-full flex items-center justify-center transition-all duration-200"
                disabled={!myStream || isConnecting}
              >
                {isConnecting ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FiPhoneCall className="w-7 h-7 text-white" />
                )}
              </button>
            )}

            {/* Share Stream Button */}
            <button
              onClick={shareMyStream}
              className="px-4 h-12 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center text-white text-sm font-medium transition-all duration-200"
              disabled={!myStream}
            >
              Send Stream
            </button>

            {/* Settings Button */}
            <button
              onClick={() => getUserMediaStream()}
              className="w-12 h-12 bg-gray-600 hover:bg-gray-500 rounded-full flex items-center justify-center transition-all duration-200"
            >
              <FiSettings className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Status Text */}
          <div className="text-center mt-4">
            <p className="text-gray-300 text-sm">
              {callStatus === 'connected' && 'Call in progress'}
              {callStatus === 'connecting' && 'Connecting...'}
              {callStatus === 'idle' && 'Ready to start call'}
              {callStatus === 'disconnected' && 'Call ended'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
