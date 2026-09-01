"use client";

import { useRef, useState } from "react";
import Camera, { CameraHandle } from "./Camera";

interface FaceVerificationProps {
  title: string;
  actionLabel: string;
  onCapture: (imageBase64: string) => Promise<void>;
  busy?: boolean;
  resultMessage?: string | null;
  resultOk?: boolean | null;
}

/**
 * Reusable face-capture step used both for face registration (sign up)
 * and face verification (before starting an exam). Always shows the
 * privacy notice before the camera preview, per PDPA-style consent
 * requirements described in the project spec.
 */
export default function FaceVerification({
  title,
  actionLabel,
  onCapture,
  busy,
  resultMessage,
  resultOk,
}: FaceVerificationProps) {
  const cameraRef = useRef<CameraHandle>(null);
  const [consented, setConsented] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  async function handleCapture() {
    const frame = cameraRef.current?.captureFrameBase64();
    if (!frame) {
      setCameraError("ไม่สามารถจับภาพจากกล้องได้ กรุณาลองใหม่");
      return;
    }
    await onCapture(frame);
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>

      {!consented ? (
        <div className="space-y-3">
          <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
            <p>• ระบบใช้กล้องเพื่อยืนยันตัวตนผู้เข้าสอบ</p>
            <p>• ระบบอาจตรวจสอบใบหน้าเป็นระยะระหว่างการสอบ เพื่อป้องกันการทุจริต</p>
            <p>• ระบบจะจัดเก็บข้อมูล Face Embedding (ไม่ใช่ภาพถ่ายโดยตรง) เพื่อใช้เปรียบเทียบ</p>
            <p>• กรุณายินยอมก่อนเปิดใช้งานกล้อง</p>
          </div>
          <button className="btn-primary" onClick={() => setConsented(true)}>
            ยินยอมและเปิดกล้อง
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <Camera ref={cameraRef} onError={setCameraError} className="max-w-md" />
          {cameraError && <p className="text-red-600 text-sm">{cameraError}</p>}
          <button className="btn-primary" onClick={handleCapture} disabled={busy}>
            {busy ? "กำลังตรวจสอบ..." : actionLabel}
          </button>
          {resultMessage && (
            <p className={`text-sm font-medium ${resultOk ? "text-green-600" : "text-red-600"}`}>
              {resultMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
