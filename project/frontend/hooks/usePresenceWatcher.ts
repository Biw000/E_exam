"use client";

import { useCallback, useRef } from "react";
import type { FaceState } from "@/hooks/useFaceTracker";

interface Thresholds {
  /** Out of frame this long in one stretch = one strike. */
  strikeSeconds: number;
  /** Out of frame longer than this in one stretch = restart immediately. */
  restartSeconds: number;
  /** A second face held this long = one strike. */
  multipleFaceSeconds?: number;
}

interface Handlers {
  onAbsenceStrike: (heldSeconds: number) => void;
  onAbsenceRestart: (heldSeconds: number) => void;
  onMultipleFacesStrike: (heldSeconds: number) => void;
}

/**
 * Turns the per-frame face state into episodes with a duration.
 *
 * The tracker reports NO_FACE on every frame the face is missing - six or
 * more times a second. Counting each of those as a strike (as the previous
 * version did) meant half a second out of frame ended the exam. Here an
 * episode starts when the face disappears, is judged by how long it lasts,
 * and ends when the face returns:
 *
 *   under strikeSeconds  -> nothing, the student leaned or glanced away
 *   reaches strikeSeconds -> one strike, once per episode
 *   passes restartSeconds -> the attempt restarts right away
 */
export function usePresenceWatcher(
  { strikeSeconds, restartSeconds, multipleFaceSeconds = 3 }: Thresholds,
  { onAbsenceStrike, onAbsenceRestart, onMultipleFacesStrike }: Handlers
) {
  const absentSince = useRef<number | null>(null);
  const absenceStruck = useRef(false);
  const absenceRestarted = useRef(false);

  const multipleSince = useRef<number | null>(null);
  const multipleStruck = useRef(false);

  const reset = useCallback(() => {
    absentSince.current = null;
    absenceStruck.current = false;
    absenceRestarted.current = false;
    multipleSince.current = null;
    multipleStruck.current = false;
  }, []);

  const update = useCallback(
    (state: FaceState, nowMs: number) => {
      // --- absence ---
      if (state === "NO_FACE") {
        if (absentSince.current === null) absentSince.current = nowMs;
        const held = (nowMs - absentSince.current) / 1000;

        if (!absenceRestarted.current && held > restartSeconds) {
          absenceRestarted.current = true;
          onAbsenceRestart(held);
        } else if (!absenceStruck.current && held >= strikeSeconds) {
          absenceStruck.current = true;
          onAbsenceStrike(held);
        }
      } else if (state !== "LOADING") {
        absentSince.current = null;
        absenceStruck.current = false;
        absenceRestarted.current = false;
      }

      // --- a second person ---
      if (state === "MULTIPLE_FACES") {
        if (multipleSince.current === null) multipleSince.current = nowMs;
        const held = (nowMs - multipleSince.current) / 1000;
        if (!multipleStruck.current && held >= multipleFaceSeconds) {
          multipleStruck.current = true;
          onMultipleFacesStrike(held);
        }
      } else if (state !== "LOADING") {
        multipleSince.current = null;
        multipleStruck.current = false;
      }
    },
    [strikeSeconds, restartSeconds, multipleFaceSeconds, onAbsenceStrike, onAbsenceRestart, onMultipleFacesStrike]
  );

  /** Seconds the face has currently been missing, for the on-screen countdown. */
  const absentFor = useCallback((nowMs: number) => {
    return absentSince.current === null ? 0 : (nowMs - absentSince.current) / 1000;
  }, []);

  return { update, reset, absentFor };
}
