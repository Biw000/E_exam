"use client";

import { forwardRef } from "react";
import Camera, { CameraErrorKind, CameraHandle } from "./Camera";
import type { FaceState } from "@/hooks/useFaceTracker";
import type { HeadPose } from "@/lib/headPose";

interface Props {
  state: FaceState;
  pose: HeadPose | null;
  poseWarning: boolean;
  onError: (message: string, kind: CameraErrorKind) => void;
}

interface StatusLine {
  label: string;
  tone: "ok" | "warn" | "idle";
}

function statusFor(state: FaceState, poseWarning: boolean): StatusLine {
  if (state === "LOADING") return { label: "กำลังเตรียมกล้อง", tone: "idle" };
  if (state === "UNAVAILABLE") return { label: "ตรวจสอบจากเซิร์ฟเวอร์", tone: "idle" };
  if (state === "NO_FACE") return { label: "ไม่พบใบหน้า", tone: "warn" };
  if (state === "MULTIPLE_FACES") return { label: "พบหลายใบหน้า", tone: "warn" };
  if (poseWarning) return { label: "กรุณามองที่หน้าจอ", tone: "warn" };
  return { label: "ยืนยันใบหน้าแล้ว", tone: "ok" };
}

const TONE_STYLES: Record<StatusLine["tone"], string> = {
  ok: "bg-green-50 text-green-700 border-green-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  idle: "bg-slate-50 text-slate-500 border-slate-200",
};

const DOT_STYLES: Record<StatusLine["tone"], string> = {
  ok: "bg-green-500",
  warn: "bg-amber-500",
  idle: "bg-slate-400",
};

/**
 * Fixed corner preview during the exam.
 *
 * Deliberately calm: red is reserved for something actually wrong right now,
 * not used as a permanent border. A camera panel that looks alarmed for the
 * whole exam just raises the student's stress and stops meaning anything.
 */
const MonitorPanel = forwardRef<CameraHandle, Props>(
  ({ state, pose, poseWarning, onError }, ref) => {
    const status = statusFor(state, poseWarning);

    return (
      <div className="fixed bottom-4 right-4 z-40 w-40 sm:w-48">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <Camera ref={ref} onError={onError} className="w-full" />
          <div className={`flex items-center gap-2 border-t px-2 py-1.5 text-[11px] ${TONE_STYLES[status.tone]}`}>
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT_STYLES[status.tone]}`} />
            <span className="truncate" aria-live="polite">
              {status.label}
            </span>
          </div>
        </div>
        {pose && process.env.NODE_ENV === "development" && (
          <p className="mt-1 text-right text-[10px] tabular-nums text-slate-400">
            y {pose.yaw.toFixed(0)}° p {pose.pitch.toFixed(0)}°
          </p>
        )}
      </div>
    );
  }
);

MonitorPanel.displayName = "MonitorPanel";
export default MonitorPanel;
