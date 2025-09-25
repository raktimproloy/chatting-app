'use client'
import React, {useEffect, useMemo, useState, useCallback} from 'react'

interface PeerContextType {
    peer: RTCPeerConnection;
    createOffer: () => Promise<RTCSessionDescriptionInit>;
    createAnswer: (offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>;
    setRemoteAns: (ans: RTCSessionDescriptionInit) => Promise<void>;
    sendStream: (stream: MediaStream) => Promise<void>;
    remoteStream: MediaStream | null;
}

const PeerContext = React.createContext<PeerContextType | null>(null)

export const usePeer = () => {
    const context = React.useContext(PeerContext)
    if (!context) {
        throw new Error('usePeer must be used within a PeerProvider')
    }
    return context
}

interface PeerProviderProps {
    children: React.ReactNode;
}

export const PeerProvider: React.FC<PeerProviderProps> = ({children}) => {
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const peer = useMemo(() => new RTCPeerConnection({
        iceServers:[
            {
                urls:[
                    'stun:stun.l.google.com:19302',
                    'stun:global.stun.twilio.com:3478'
                ]
            }
        ]
    }), [])
    

    const createOffer = async() => {
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        return offer
    }

    const createAnswer = async(offer: RTCSessionDescriptionInit) => {
        await peer.setRemoteDescription(offer)
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        return answer
    }

    const setRemoteAns = async(ans: RTCSessionDescriptionInit) => {
        await peer.setRemoteDescription(ans)
    }

    const sendStream = async(stream: MediaStream) => {
        const tracks = stream.getTracks()
        for(const track of tracks) {
            // Check if track already exists before adding
            const existingSenders = peer.getSenders()
            const trackExists = existingSenders.some(sender => sender.track === track)
            
            if (!trackExists) {
                peer.addTrack(track, stream)
            }
        }
    }

    const handleTrackEvent = useCallback((event: RTCTrackEvent) => {
        const streams = event.streams;
        setRemoteStream(streams[0])
    }, [])


    useEffect(() => {
        peer.addEventListener('track', handleTrackEvent)
        
        return () => {
            peer.removeEventListener('track', handleTrackEvent)
        }
    }, [peer, handleTrackEvent])

    return(
        <PeerContext.Provider value={{peer, createOffer, createAnswer, setRemoteAns, sendStream, remoteStream}}>{children}</PeerContext.Provider>
    )
}