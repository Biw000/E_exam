"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Camera, { CameraErrorKind, CameraHandle } from "./Camera";
import { useFaceTracker } from "@/hooks/useFaceTracker";
import {
  DEFAULT_HEAD_POSE_CONFIG,
  ENROLL_INSTRUCTIONS,
  ENROLL_SEQUENCE,
  EnrollPose,
  HeadPoseConfig,
  enrollHint,
  matchesEnrollPose,
} from "@/lib/headPose";
import { api } from "@/lib/api";

interface Props {
  /** Called once every pose has been captured. */
  onComplete: (samples: Record<string, string>) => void | Promise<void>;
  submitting?: boolean;
  errorMessage?: string | null;
}

// How long the target pose must be held before the frame is captured. Stops a
// sample being taken mid-turn, which produces a blurry, unusable embedding.
const HOLD_MS = 700;

export default function FaceEnrollment({ onComplete, submitting, errorMessage }: Props) {
  const cameraRef = useRef<CameraHandle>(null);

  const [consented, setConsented] = useState(false);
  const [config, setConfig] = useState<HeadPoseConfig>(DEFAULT_HEAD_POSE_CONFIG);
  const [stepIndex, setStepIndex] = useState(0);
  const [samples, setSamples] = useState<Record<string, string>>({});
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKind, setCameraKind] = useState<CameraErrorKind | null>(null);
  const [justCaptured, setJustCaptured] = useState<EnrollPose | null>(null);

  const holdStart = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const stepRef = useRef(0);
  const finishedRef = useRef(false);

  const target: EnrollPose | undefined = ENROLL_SEQUENCE[stepIndex];
  const done = stepIndex >= ENROLL_SEQUENCE.length;

  useEffect(() => {
    stepRef.current = stepIndex;
  }, [stepIndex]);

  // Thresholds come from the backend so the browser and the server agree on
  // what counts as "turned left" without the numbers living in two places.
  useEffect(() => {
    api
      .get<HeadPoseConfig>("/api/face/config")
      .then(setConfig)
      .catch(() => {
        /* keep defaults; enrollment still works */
      });
  }, []);

  const getVideo = useCallback(() => cameraRef.current?.getVideo() ?? null, []);

  const capture = useCallback(
    (pose: EnrollPose) => {
      const frame = cameraRef.current?.captureFrameBase64();
      if (!frame) return;
      setSamples((prev) => ({ ...prev, [pose]: frame }));
      setJustCaptured(pose);
      setStepIndex((i) => i + 1);
      holdStart.current = null;
      window.setTimeout(() => setJustCaptured(null), 1200);
    },
    []
  );

  const { state, pose, loadError } = useFaceTracker({
    enabled: consented && !done,
    getVideo,
    config,
    fps: 8,
    onFrame: ({ state: faceState, pose: headPose }) => {
      if (capturingRef.current || finishedRef.current) return;
      const current = ENROLL_SEQUENCE[stepRef.current];
      if (!current) return;

      if (faceState !== "FACE_OK" || !headPose) {
        holdStart.current = null;
        return;
      }
      if (!matchesEnrollPose(headPose, current, config)) {
        holdStart.current = null;
        return;
      }

      const now = Date.now();
      if (holdStart.current === null) {
        holdStart.current = now;
        return;
      }
      if (now - holdStart.current >= HOLD_MS) {
        capturingRef.current = true;
        capture(current);
        window.setTimeout(() => {
          capturingRef.current = false;
        }, 400);
      }
    },
  });

  // Hand the finished set upward exactly once.
  useEffect(() => {
    if (!done || finishedRef.current) return;
    if (Object.keys(samples).length < ENROLL_SEQUENCE.length) return;
    finishedRef.current = true;
    void onComplete(samples);
  }, [done, samples, onComplete]);

  function handleCameraError(message: string, kind: CameraErrorKind) {
    setCameraError(message);
    setCameraKind(kind);
  }

  function retryStep() {
    finishedRef.current = false;
    setStepIndex(0);
    setSamples({});
    holdStart.current = null;
  }

  const progress = Math.round((Math.min(stepIndex, ENROLL_SEQUENCE.length) / ENROLL_SEQUENCE.length) * 100);

  if (!consented) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">สร้างโปรไฟล์ยืนยันตัวตน</h2>
          <p className="text-sm text-slate-500 mt-1">
            ระบบจะบันทึกใบหน้าของคุณ 5 มุม เพื่อใช้ยืนยันตัวตนก่อนเข้าสอบ
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-2">
          <p>• ระบบใช้กล้องเพื่อยืนยันว่าผู้เข้าสอบเป็นเจ้าของบัญชีจริง</p>
          <p>• ระบบจัดเก็บเฉพาะค่าทางคณิตศาสตร์ที่ได้จากใบหน้า ไม่ได้เก็บภาพถ่าย</p>
          <p>• ระหว่างสอบระบบจะตรวจสอบใบหน้าเป็นระยะ และบันทึกเหตุการณ์ที่ผิดปกติไว้ให้ผู้คุมสอบตรวจสอบ</p>
          <p>• ข้อมูลนี้ใช้เพื่อการสอบเท่านั้น และจะไม่ถูกส่งกลับมายังหน้าเว็บอีก</p>
        </div>

        <button type="button" className="btn-primary w-full" onClick={() => setConsented(true)}>
          ยินยอมและเปิดกล้อง
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-slate-900">ลงทะเบียนใบหน้า</h2>
        <span className="text-sm text-slate-500 tabular-nums">
          {Math.min(stepIndex, ENROLL_SEQUENCE.length)} / {ENROLL_SEQUENCE.length}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar"
           aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}
           aria-label="ความคืบหน้าการลงทะเบียนใบหน้า">
        <div
          className="h-full rounded-full bg-slate-900 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="relative">
        <Camera ref={cameraRef} onError={handleCameraError} className="w-full" />
        {justCaptured && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-900/60">
            <span className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900">
              บันทึกท่า {justCaptured} แล้ว
            </span>
          </div>
        )}
      </div>

      {cameraError ? (
        <p className="text-sm text-red-600" role="alert">
          {cameraError}
          {cameraKind === "PERMISSION_DENIED" && (
            <span className="mt-1 block text-slate-500">
              เปิดสิทธิ์ได้จากไอคอนกล้องบนแถบที่อยู่ของเบราว์เซอร์
            </span>
          )}
        </p>
      ) : done ? (
        <p className="text-sm font-medium text-green-700">
          {submitting ? "กำลังสร้างบัญชี..." : "ลงทะเบียนใบหน้าครบทุกมุมแล้ว"}
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-base font-medium text-slate-900">
            {target ? ENROLL_INSTRUCTIONS[target] : ""}
          </p>
          <p className="text-sm text-slate-500" aria-live="polite">
            {state === "LOADING"
              ? "กำลังเตรียมระบบตรวจจับใบหน้า..."
              : state === "MULTIPLE_FACES"
              ? "พบมากกว่า 1 ใบหน้า กรุณาให้มีเพียงคุณคนเดียวในเฟรม"
              : state === "UNAVAILABLE"
              ? "ไม่สามารถตรวจจับใบหน้าอัตโนมัติได้"
              : target
              ? enrollHint(pose, target, config)
              : ""}
          </p>
        </div>
      )}

      {loadError && <p className="text-sm text-amber-600">{loadError}</p>}
      {errorMessage && (
        <p className="text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {ENROLL_SEQUENCE.map((p, i) => (
          <span
            key={p}
            className={`rounded-full border px-3 py-1 text-xs ${
              samples[p]
                ? "border-green-200 bg-green-50 text-green-700"
                : i === stepIndex
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-400"
            }`}
          >
            {samples[p] ? "✓ " : ""}
            {p}
          </span>
        ))}
      </div>

      {(state === "UNAVAILABLE" || cameraKind === "PERMISSION_DENIED") && !done && (
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => {
            const current = ENROLL_SEQUENCE[stepIndex];
            if (current) capture(current);
          }}
        >
          ถ่ายภาพด้วยตนเอง
        </button>
      )}

      {done && !submitting && (
        <button type="button" className="btn-secondary w-full" onClick={retryStep}>
          ถ่ายใหม่ทั้งหมด
        </button>
      )}
    </div>
  );
}
