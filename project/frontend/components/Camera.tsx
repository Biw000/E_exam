"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface CameraHandle {
  captureFrameBase64: () => string | null;
  getVideo: () => HTMLVideoElement | null;
  isReady: () => boolean;
}

export type CameraErrorKind =
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "IN_USE"
  | "UNSUPPORTED"
  | "UNKNOWN";

interface CameraProps {
  onError?: (message: string, kind: CameraErrorKind) => void;
  onReady?: () => void;
  className?: string;
  /** Mirror the preview so moving right on screen matches moving right in real life. */
  mirrored?: boolean;
  /**
   * Tailwind aspect classes for the video box. The default is portrait on
   * phones and landscape from `sm` up: a 16:9 box on a narrow screen crops the
   * forehead and chin, which is exactly what enrollment needs to see.
   */
  aspectClassName?: string;
}

const ERROR_MESSAGES: Record<CameraErrorKind, string> = {
  PERMISSION_DENIED:
    "ระบบต้องใช้กล้องเพื่อยืนยันตัวตน กรุณาอนุญาตการใช้งานกล้องในเบราว์เซอร์แล้วโหลดหน้านี้ใหม่",
  NOT_FOUND: "ไม่พบกล้องในอุปกรณ์นี้ กรุณาเชื่อมต่อกล้องแล้วลองใหม่",
  IN_USE: "กล้องกำลังถูกใช้งานโดยโปรแกรมอื่น กรุณาปิดโปรแกรมนั้นแล้วลองใหม่",
  UNSUPPORTED:
    "เบราว์เซอร์นี้ไม่รองรับการใช้งานกล้อง กรุณาใช้ Chrome, Edge หรือ Safari เวอร์ชันล่าสุด",
  UNKNOWN: "ไม่สามารถเปิดกล้องได้ กรุณาลองใหม่อีกครั้ง",
};

function classifyError(err: unknown): CameraErrorKind {
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "SecurityError") return "PERMISSION_DENIED";
    if (err.name === "NotFoundError" || err.name === "OverconstrainedError") return "NOT_FOUND";
    if (err.name === "NotReadableError" || err.name === "AbortError") return "IN_USE";
  }
  return "UNKNOWN";
}

/**
 * Live camera preview. Exposes the raw <video> element so a face tracker can
 * read frames directly, plus captureFrameBase64() for the calls that still
 * need a still image on the server.
 *
 * The stream is always stopped on unmount. Leaving it running keeps the camera
 * light on after the exam ends, which users reasonably read as the app still
 * watching them.
 */
const Camera = forwardRef<CameraHandle, CameraProps>(
  (
    {
      onError,
      onReady,
      className,
      mirrored = true,
      aspectClassName = "aspect-[3/4] sm:aspect-[4/3]",
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
      let cancelled = false;

      async function start() {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          onError?.(ERROR_MESSAGES.UNSUPPORTED, "UNSUPPORTED");
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          });
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
          onReady?.();

          // Fires if the user revokes camera access or unplugs the device
          // mid-exam, so the page can log CAMERA_DISABLED.
          stream.getVideoTracks().forEach((track) => {
            track.addEventListener("ended", () => {
              if (!cancelled) {
                setReady(false);
                onError?.("กล้องถูกปิดระหว่างการใช้งาน", "IN_USE");
              }
            });
          });
        } catch (err) {
          const kind = classifyError(err);
          onError?.(ERROR_MESSAGES[kind], kind);
        }
      }

      start();

      return () => {
        cancelled = true;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      captureFrameBase64: () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !video.videoWidth) return null;
        // Downscale: the backend only needs enough resolution to find
        // landmarks, and a smaller frame is a much smaller upload.
        const maxWidth = 480;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.75);
      },
      getVideo: () => videoRef.current,
      isReady: () => ready,
    }));

    return (
      <div className={className}>
        <video
          ref={videoRef}
          muted
          playsInline
          className={`w-full rounded-lg bg-slate-900 object-cover ${aspectClassName}`}
          style={mirrored ? { transform: "scaleX(-1)" } : undefined}
        />
        <canvas ref={canvasRef} className="hidden" />
        {!ready && <p className="text-sm text-slate-500 mt-2">กำลังเปิดกล้อง...</p>}
      </div>
    );
  }
);

Camera.displayName = "Camera";
export default Camera;
