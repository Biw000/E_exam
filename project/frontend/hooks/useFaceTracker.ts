"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFaceLandmarker } from "@/lib/faceLandmarker";
import {
  DEFAULT_HEAD_POSE_CONFIG,
  HeadPose,
  HeadPoseConfig,
  poseFromMatrix,
} from "@/lib/headPose";

export type FaceState =
  | "LOADING"
  | "FACE_OK"
  | "NO_FACE"
  | "MULTIPLE_FACES"
  | "UNAVAILABLE";

export interface TrackerFrame {
  state: FaceState;
  faceCount: number;
  pose: HeadPose | null;
}

interface Options {
  /** Detections per second. 5-10 is plenty and leaves the UI responsive. */
  fps?: number;
  enabled: boolean;
  getVideo: () => HTMLVideoElement | null;
  config?: HeadPoseConfig;
  onFrame?: (frame: TrackerFrame) => void;
}

/**
 * Runs face detection in the browser on a throttled loop.
 *
 * Detection is driven by requestAnimationFrame but only actually runs every
 * 1/fps seconds. Processing every frame would pin a CPU core for the whole
 * exam and make the question UI stutter, and nothing here needs 60Hz.
 *
 * No video ever leaves the machine from this hook. Only the derived state is
 * handed to the caller, which is what keeps bandwidth and privacy cost low.
 */
export function useFaceTracker({
  fps = 6,
  enabled,
  getVideo,
  config = DEFAULT_HEAD_POSE_CONFIG,
  onFrame,
}: Options) {
  const [state, setState] = useState<FaceState>("LOADING");
  const [pose, setPose] = useState<HeadPose | null>(null);
  const [faceCount, setFaceCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastRunRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const onFrameRef = useRef(onFrame);
  const configRef = useRef(config);

  // Keep the latest callback/config without restarting the loop, so a parent
  // re-render does not tear down and rebuild the detector.
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const intervalMs = 1000 / fps;

    async function run() {
      let landmarker;
      try {
        landmarker = await getFaceLandmarker();
      } catch {
        if (!cancelled) {
          setState("UNAVAILABLE");
          setLoadError(
            "ไม่สามารถโหลดระบบตรวจจับใบหน้าได้ ระบบจะยังตรวจสอบจากฝั่งเซิร์ฟเวอร์ตามปกติ"
          );
        }
        return;
      }
      if (cancelled) return;

      const tick = () => {
        if (cancelled) return;
        rafRef.current = requestAnimationFrame(tick);

        const now = performance.now();
        if (now - lastRunRef.current < intervalMs) return;
        lastRunRef.current = now;

        const video = getVideo();
        if (!video || video.readyState < 2 || !video.videoWidth) return;

        // MediaPipe rejects a repeated timestamp, which happens whenever the
        // render loop outruns the camera's frame rate.
        if (video.currentTime === lastVideoTimeRef.current) return;
        lastVideoTimeRef.current = video.currentTime;

        let result;
        try {
          result = landmarker.detectForVideo(video, now);
        } catch {
          return; // transient GPU hiccup; the next tick retries
        }

        const count = result.faceLandmarks?.length ?? 0;
        let nextState: FaceState;
        let nextPose: HeadPose | null = null;

        if (count === 0) {
          nextState = "NO_FACE";
        } else if (count > 1) {
          nextState = "MULTIPLE_FACES";
        } else {
          nextState = "FACE_OK";
          const matrix = result.facialTransformationMatrixes?.[0]?.data;
          if (matrix) {
            nextPose = poseFromMatrix(Array.from(matrix), configRef.current);
          }
        }

        setState(nextState);
        setFaceCount(count);
        setPose(nextPose);
        onFrameRef.current?.({ state: nextState, faceCount: count, pose: nextPose });
      };

      rafRef.current = requestAnimationFrame(tick);
    }

    run();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastVideoTimeRef.current = -1;
    };
  }, [enabled, fps, getVideo]);

  const reset = useCallback(() => {
    setState("LOADING");
    setPose(null);
    setFaceCount(0);
  }, []);

  return { state, pose, faceCount, loadError, reset };
}
