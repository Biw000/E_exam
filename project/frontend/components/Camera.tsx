"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface CameraHandle {
  captureFrameBase64: () => string | null;
}

interface CameraProps {
  onError?: (message: string) => void;
  className?: string;
}

/**
 * Wraps the browser MediaDevices API to show a live camera preview and
 * expose a captureFrameBase64() method (via ref) that grabs the current
 * frame as a base64 JPEG data URL, for sending to the backend face APIs.
 */
const Camera = forwardRef<CameraHandle, CameraProps>(({ onError, className }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (err) {
        onError?.("ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้งานกล้อง (Camera Permission Denied)");
      }
    }

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    captureFrameBase64: () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !ready) return null;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.8);
    },
  }));

  return (
    <div className={className}>
      <video ref={videoRef} muted playsInline className="w-full rounded-lg bg-slate-900 aspect-video object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      {!ready && <p className="text-sm text-slate-500 mt-2">กำลังเปิดกล้อง...</p>}
    </div>
  );
});

Camera.displayName = "Camera";
export default Camera;
