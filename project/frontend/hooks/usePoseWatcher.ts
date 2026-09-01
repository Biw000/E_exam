"use client";

import { useCallback, useRef } from "react";
import {
  HeadPose,
  HeadPoseConfig,
  exceedsCritical,
  exceedsWarning,
  poseEventType,
} from "@/lib/headPose";

type Raise = (
  eventType: string,
  description: string,
  metadata: Record<string, unknown>
) => void;

/**
 * Converts head pose into events using angle AND duration together.
 *
 * Angle alone is a terrible signal. Everyone glances at the clock, rubs an
 * eye, or shifts in their chair, and firing on the first off-center frame
 * would fill the log with noise that makes the real signal harder to see.
 *
 * So a deviation has to be held: past warning_duration it becomes a WARNING,
 * and past suspicious_duration it is raised once more with the longer hold
 * recorded. Returning to center resets the timer and nothing is logged.
 */
export function usePoseWatcher(config: HeadPoseConfig, raise: Raise) {
  const startedAt = useRef<number | null>(null);
  const activeType = useRef<string | null>(null);
  const warnedAt = useRef<number | null>(null);
  const escalated = useRef(false);

  const reset = useCallback(() => {
    startedAt.current = null;
    activeType.current = null;
    warnedAt.current = null;
    escalated.current = false;
  }, []);

  const update = useCallback(
    (pose: HeadPose | null) => {
      const now = Date.now();

      if (!pose || !exceedsWarning(pose, config)) {
        reset();
        return;
      }

      const type = poseEventType(pose);

      // Turning from left to right restarts the clock rather than carrying
      // the old duration over to a different direction.
      if (activeType.current !== type) {
        activeType.current = type;
        startedAt.current = now;
        warnedAt.current = null;
        escalated.current = false;
        return;
      }

      const heldMs = now - (startedAt.current ?? now);
      const heldSeconds = heldMs / 1000;

      if (!warnedAt.current && heldSeconds >= config.warning_duration) {
        warnedAt.current = now;
        raise(type, `หันหน้าออกจากหน้าจอต่อเนื่อง ${heldSeconds.toFixed(1)} วินาที`, {
          yaw: Number(pose.yaw.toFixed(1)),
          pitch: Number(pose.pitch.toFixed(1)),
          roll: Number(pose.roll.toFixed(1)),
          held_seconds: Number(heldSeconds.toFixed(1)),
          level: "WARNING",
        });
        return;
      }

      if (!escalated.current && heldSeconds >= config.suspicious_duration) {
        escalated.current = true;
        raise(
          "HEAD_POSE_WARNING",
          `หันหน้าออกจากหน้าจอต่อเนื่อง ${heldSeconds.toFixed(1)} วินาที`,
          {
            yaw: Number(pose.yaw.toFixed(1)),
            pitch: Number(pose.pitch.toFixed(1)),
            held_seconds: Number(heldSeconds.toFixed(1)),
            direction: type,
            critical_angle: exceedsCritical(pose, config),
            level: "SUSTAINED",
          }
        );
      }
    },
    [config, raise, reset]
  );

  return { update, reset };
}
