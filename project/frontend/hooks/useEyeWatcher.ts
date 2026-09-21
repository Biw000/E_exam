"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EyeMetrics } from "@/lib/eyes";
import { eyesClosed, gazeDirection } from "@/lib/eyes";
import type { HeadPose } from "@/lib/headPose";

interface Options {
  enabled: boolean;
  blinkThreshold: number;
  gazeThreshold: number;
  gazeAwaySeconds: number;
  /** Center tolerance in degrees, to know whether the head is facing forward. */
  headCenterTolerance: number;
  log: (eventType: string, description: string, metadata: Record<string, unknown>) => void;
  summaryIntervalMs?: number;
}

/**
 * Blink counting and gaze tracking.
 *
 * Blinks use hysteresis: an eye must pass the closed threshold and then come
 * back clearly open before one blink is counted. A single threshold would
 * count a half-closed squint that hovers around the line as several blinks.
 *
 * Gaze only matters when the head is facing the screen. If the head is turned
 * too, head pose already covers it; the interesting case is "face forward,
 * eyes to the side", which head pose alone cannot see.
 *
 * Blink counts at 10-12 detections a second will miss the fastest blinks
 * (about 100 ms). Treat the number as an approximate rate, not an exact tally.
 */
export function useEyeWatcher({
  enabled,
  blinkThreshold,
  gazeThreshold,
  gazeAwaySeconds,
  headCenterTolerance,
  log,
  summaryIntervalMs = 60_000,
}: Options) {
  const [blinks, setBlinks] = useState(0);

  const closed = useRef(false);
  const blinkTotal = useRef(0);
  const blinkWindow = useRef(0);

  const gazeSince = useRef<number | null>(null);
  const gazeDir = useRef<string | null>(null);
  const gazeLogged = useRef(false);
  const gazeAwayMs = useRef(0);
  const lastAt = useRef<number | null>(null);

  const logRef = useRef(log);
  useEffect(() => {
    logRef.current = log;
  }, [log]);

  const update = useCallback(
    (eyes: EyeMetrics | null, pose: HeadPose | null, nowMs: number) => {
      const dt = lastAt.current === null ? 0 : nowMs - lastAt.current;
      lastAt.current = nowMs;
      if (!eyes) {
        gazeSince.current = null;
        gazeDir.current = null;
        gazeLogged.current = false;
        return;
      }

      // --- blinks (with hysteresis) ---
      const openThreshold = Math.max(0, blinkThreshold - 0.2);
      if (!closed.current && eyesClosed(eyes, blinkThreshold)) {
        closed.current = true;
      } else if (
        closed.current &&
        eyes.blinkLeft < openThreshold &&
        eyes.blinkRight < openThreshold
      ) {
        closed.current = false;
        blinkTotal.current += 1;
        blinkWindow.current += 1;
        setBlinks(blinkTotal.current);
      }

      // --- gaze, only while the head faces the screen ---
      const headForward =
        !!pose &&
        Math.abs(pose.yaw) < headCenterTolerance &&
        Math.abs(pose.pitch) < headCenterTolerance;
      const dir = headForward ? gazeDirection(eyes, gazeThreshold) : null;

      if (dir) {
        gazeAwayMs.current += dt;
        if (gazeDir.current !== dir) {
          gazeDir.current = dir;
          gazeSince.current = nowMs;
          gazeLogged.current = false;
        }
        const held = (nowMs - (gazeSince.current ?? nowMs)) / 1000;
        if (!gazeLogged.current && held >= gazeAwaySeconds) {
          gazeLogged.current = true;
          logRef.current("GAZE_AWAY", "ลูกตามองออกนอกหน้าจอขณะหันหน้าตรง", {
            direction: dir,
            held_seconds: Number(held.toFixed(1)),
            gaze_x: Number(eyes.gazeX.toFixed(2)),
            gaze_y: Number(eyes.gazeY.toFixed(2)),
          });
        }
      } else {
        gazeSince.current = null;
        gazeDir.current = null;
        gazeLogged.current = false;
      }
    },
    [blinkThreshold, gazeThreshold, gazeAwaySeconds, headCenterTolerance]
  );

  // One summary row per interval: blink rate and total seconds of gaze away.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      const minutes = summaryIntervalMs / 60_000;
      logRef.current("EYE_ACTIVITY", "สรุปการกระพริบตาและการมอง", {
        blinks: blinkWindow.current,
        blinks_per_minute: Number((blinkWindow.current / minutes).toFixed(1)),
        gaze_away_seconds: Number((gazeAwayMs.current / 1000).toFixed(1)),
        window_seconds: summaryIntervalMs / 1000,
        total_blinks: blinkTotal.current,
      });
      blinkWindow.current = 0;
      gazeAwayMs.current = 0;
    }, summaryIntervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, summaryIntervalMs]);

  return { update, blinks };
}
