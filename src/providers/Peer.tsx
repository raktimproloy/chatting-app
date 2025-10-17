'use client'
import React, {useEffect, useMemo, useState, useCallback} from 'react'

interface PeerContextType {
    peer: RTCPeerConnection | null;
    createOffer: () => Promise<RTCSessionDescriptionInit>;
    createAnswer: (offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>;
    setRemoteAns: (ans: RTCSessionDescriptionInit) => Promise<void>;
    sendStream: (stream: MediaStream) => Promise<void>;
    remoteStream: MediaStream | null;
    addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
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
    const peer = useMemo(() => {
        // Only create RTCPeerConnection in browser environment
        if (typeof window === 'undefined') {
            return null;
        }
        return new RTCPeerConnection({
            iceServers:[
                {
                    urls:[
                        'stun:stun.l.google.com:19302',
                        'stun:global.stun.twilio.com:3478'
                    ]
                }
            ]
        });
    }, [])
    

    const createOffer = async() => {
        if (!peer) {
            throw new Error('RTCPeerConnection not available');
        }
        // Only create offer from stable state; otherwise return existing local description
        if (peer.signalingState !== 'stable') {
            console.log('Skipping createOffer: signalingState', peer.signalingState)
            const existing = peer.localDescription;
            if (existing) return existing;
        }
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        return offer
    }

    const createAnswer = async(offer: RTCSessionDescriptionInit) => {
        if (!peer) {
            throw new Error('RTCPeerConnection not available');
        }
        // If we already answered (stable with remote set), return existing answer
        if (peer.signalingState === 'stable' && peer.currentRemoteDescription) {
            console.log('Skipping createAnswer: already stable with remoteDescription')
            const existing = peer.localDescription;
            if (existing) return existing;
            return await Promise.resolve({} as RTCSessionDescriptionInit)
        }
        // Glare handling: if we have a local offer, rollback before applying remote offer
        if (peer.signalingState === 'have-local-offer') {
            try {
                await peer.setLocalDescription({ type: 'rollback' } as any)
                console.log('Rollback done before setting remote offer')
            } catch (e) {
                console.warn('Rollback failed', e)
            }
        }
        // Set remote offer if needed
        if (!peer.currentRemoteDescription || peer.currentRemoteDescription.type !== 'offer') {
            await peer.setRemoteDescription(offer)
        }
        // Only create answer when in have-remote-offer
        if (peer.signalingState !== 'have-remote-offer') {
            console.log('Skipping createAnswer: signalingState', peer.signalingState)
            const existing = peer.localDescription;
            if (existing) return existing;
        }
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        return answer
    }

    const setRemoteAns = async(ans: RTCSessionDescriptionInit) => {
        if (!peer) {
            throw new Error('RTCPeerConnection not available');
        }
        // Avoid duplicate remote answer application
        if (peer.currentRemoteDescription && peer.signalingState === 'stable') {
            console.log('Skipping setRemoteAns: already stable with remoteDescription')
            return;
        }
        await peer.setRemoteDescription(ans)
    }

    const sendStream = async(stream: MediaStream) => {
        if (!peer) {
            throw new Error('RTCPeerConnection not available');
        }
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
        console.log('Track event received:', event);
        const streams = event.streams;
        console.log('Remote streams:', streams);
        if (streams && streams.length > 0) {
            console.log('Setting remote stream:', streams[0]);
            setRemoteStream(streams[0])
        }
    }, [])


    useEffect(() => {
        if (!peer) return;
        
        peer.addEventListener('track', handleTrackEvent)
        
        return () => {
            peer.removeEventListener('track', handleTrackEvent)
        }
    }, [peer, handleTrackEvent])

    return(
        <PeerContext.Provider value={{peer, createOffer, createAnswer, setRemoteAns, sendStream, remoteStream, addIceCandidate: async (candidate: RTCIceCandidateInit) => {
            if (!peer) return;
            try {
                await peer.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error('Error adding received ICE candidate', e);
            }
        }}}>{children}</PeerContext.Provider>
    )
}