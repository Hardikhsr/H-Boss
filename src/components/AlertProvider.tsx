"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { toast, Toaster } from "sonner";

export function AlertProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const socket = io("/", { path: "/socket.io", transports: ["websocket", "polling"] });

        socket.on("new-alert", (data) => {
            toast.error(`0xALERT: ${data.hostname.toUpperCase()}`, {
                description: `PROTOCOL_VIOLATION: ${data.message.toUpperCase()}`,
                duration: 5000,
                position: "top-right",
                className: "bg-black border border-red-600/50 text-white font-black uppercase tracking-widest rounded-none",
            });

            // Native Browser Notification
            if (Notification.permission === "granted") {
                new Notification(`HBOSE Alert: ${data.hostname}`, {
                    body: data.message,
                    icon: "/favicon.ico"
                });
            } else if (Notification.permission !== "denied") {
                Notification.requestPermission();
            }
        });

        return () => { socket.disconnect(); };
    }, []);

    return (
        <>
            <Toaster theme="dark" richColors closeButton />
            {children}
        </>
    );
}
