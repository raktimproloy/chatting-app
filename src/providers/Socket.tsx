'use client'
import React, {useMemo} from 'react'
import {io, Socket} from 'socket.io-client'

interface SocketContextType {
    socket: Socket | null;
}

const SocketContext = React.createContext<SocketContextType | null>(null)

export const useSocket = () => {
    const context = React.useContext(SocketContext)
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider')
    }
    return context
}

interface SocketProviderProps {
    children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({children}) => {
    const socket = useMemo(() => {
        // Get the current hostname and use it for the socket connection
        const socketUrl = `${process.env.NEXT_PUBLIC_SOCKET_URL}` || 'http://localhost:5000';
        console.log('Connecting to socket server:', socketUrl);
        
        const socketConnection = io(socketUrl, {
            transports: ['websocket', 'polling'],
            timeout: 20000,
        });
        
        // Add connection event listeners for debugging
        socketConnection.on('connect', () => {
            console.log('Socket connected successfully!');
        });
        
        socketConnection.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
        });
        
        socketConnection.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
        });
        
        return socketConnection;
    }, [])
    return (
        <SocketContext.Provider value={{socket}}>
            {children}
        </SocketContext.Provider>
    )
}