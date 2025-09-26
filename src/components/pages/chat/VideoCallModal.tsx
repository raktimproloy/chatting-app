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
  const {peer, createOffer, createAnswer, setRemoteAns, sendStream, remoteStream} = usePeer();
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [remotePhone, setRemotePhone] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  
  // Video controls state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');

  const handleNewUserJoined = useCallback(async (data: {phone: string}) => {
    const {phone} = data;
    console.log("New user joined", data);
    setRemotePhone(phone)
    
    if (myStream) {
      sendStream(myStream)
    }
    
    const offer = await createOffer();
    socket?.emit('call-user', {phone, offer})
  }, [socket, createOffer, myStream, sendStream])

  const handleIncommingCall = useCallback(async (data: {from: string, offer: RTCSessionDescriptionInit}) => {
    const {from, offer} = data;
    console.log("Incomming call from", from);
    setRemotePhone(from)
    
    if (myStream) {
      sendStream(myStream)
    }
    
    const ans = await createAnswer(offer)
    socket?.emit('call-accpeted', {phoneId: from, ans})
  }, [socket, createAnswer, myStream, sendStream])

  const handleCallAccepted = useCallback(async (data: {ans: RTCSessionDescriptionInit}) => {
    const {ans} = data;
    console.log("Call accepted", ans);
    await setRemoteAns(ans)
    setIsCallActive(true);
    setCallStatus('connected');
    setIsConnecting(false);
  }, [setRemoteAns])

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

  useEffect(() => {
    if (isOpen) {
      getUserMediaStream()
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
  }, [isOpen, getUserMediaStream, myStream])

  useEffect(() => {
    if (videoRef.current && myStream) {
      videoRef.current.srcObject = myStream;
    }
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [myStream, remoteStream])

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
                    <p className="text-gray-400 text-lg">
                      {isConnecting ? 'Waiting for remote user...' : 'No remote video'}
                    </p>
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
