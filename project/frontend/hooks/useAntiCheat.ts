"use client";

import { useCallback, useEffect, useRef } from "react";

export type EventLogger = (
  eventType: string,
  description?: string,
  metadata?: Record<string, unknown>
) => void;

interface Options {
  enabled: boolean;
  log: EventLogger;
  /** Suppress a repeat of the same event type inside this many milliseconds. */
  cooldownMs?: number;
  /** Block the right-click menu during the exam. */
  blockContextMenu?: boolean;
  /**
   * Strict proctoring. When on, the events listed in STRICT_VIOLATIONS end the
   * attempt on the first occurrence instead of only being logged.
   */
  strict?: boolean;
  onViolation?: (eventType: string, description: string) => void;
}

/**
 * The events that end an attempt in strict mode.
 *
 * WINDOW_BLUR is deliberately NOT in this list even though it looks similar to
 * TAB_SWITCH: focus is lost by system notifications, IME switches and password
 * managers, none of which the student controls. visibilitychange is a much
 * better signal that someone actually left the page.
 */
const STRICT_VIOLATIONS: Record<string, string> = {
  TAB_SWITCH: "ออกจากหน้าต่างสอบ",
  COPY_ATTEMPT: "คัดลอกข้อความ",
  CUT_ATTEMPT: "ตัดข้อความ",
  PASTE_ATTEMPT: "วางข้อความ",
  FULLSCREEN_EXIT: "ออกจากโหมดเต็มหน้าจอ",
};

/**
 * Watches the browser activity a web page is actually allowed to observe.
 *
 * What this can see: tab visibility, window focus, fullscreen state, clipboard
 * events fired at the page, and the key chords the browser lets a page cancel.
 *
 * What it cannot see, and does not pretend to: other applications running on
 * the machine, other browser windows, a second monitor, or a phone on the desk.
 * Anything claiming otherwise from inside a browser is guessing. Everything
 * recorded here is therefore logged as activity for a human to review, never
 * as proof of cheating.
 */
export function useAntiCheat({
  enabled,
  log,
  cooldownMs = 15000,
  blockContextMenu = true,
  strict = false,
  onViolation,
}: Options) {
  const lastFired = useRef<Record<string, number>>({});
  const suppressed = useRef<Record<string, number>>({});
  const logRef = useRef(log);
  const violationRef = useRef(onViolation);
  const strictRef = useRef(strict);
  const firedViolation = useRef(false);

  // Counters for ordinary input activity. Reported as a periodic summary
  // rather than one event per click, which would be unusable noise.
  const clicks = useRef(0);
  const keystrokes = useRef(0);

  useEffect(() => {
    logRef.current = log;
  }, [log]);
  useEffect(() => {
    violationRef.current = onViolation;
  }, [onViolation]);
  useEffect(() => {
    strictRef.current = strict;
  }, [strict]);

  /**
   * Rate-limits repeats. Fifty NO_FACE ticks in a row should be one row in the
   * database with a count, not fifty rows that bury everything else in the log.
   */
  const fire = useCallback(
    (eventType: string, description?: string, metadata?: Record<string, unknown>) => {
      const now = Date.now();
      const last = lastFired.current[eventType] ?? 0;

      if (now - last < cooldownMs) {
        suppressed.current[eventType] = (suppressed.current[eventType] ?? 0) + 1;
        return;
      }

      const repeats = suppressed.current[eventType] ?? 0;
      suppressed.current[eventType] = 0;
      lastFired.current[eventType] = now;

      logRef.current(eventType, description, {
        ...metadata,
        ...(repeats > 0 ? { suppressed_repeats: repeats } : {}),
      });
    },
    [cooldownMs]
  );

  /**
   * Strict-mode events bypass the cooldown entirely: the rule is "first
   * occurrence ends the attempt", so swallowing one as a duplicate would make
   * the rule behave differently depending on timing.
   */
  const check = useCallback(
    (eventType: string, description?: string, metadata?: Record<string, unknown>) => {
      const label = STRICT_VIOLATIONS[eventType];
      if (strictRef.current && label && !firedViolation.current) {
        firedViolation.current = true;
        logRef.current(eventType, description, { ...metadata, strict_violation: true });
        violationRef.current?.(eventType, label);
        return;
      }
      fire(eventType, description, metadata);
    },
    [fire]
  );

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        check("TAB_SWITCH", "สลับแท็บหรือย่อหน้าต่างระหว่างสอบ");
      }
    };

    const onBlur = () => check("WINDOW_BLUR", "หน้าต่างสอบสูญเสียโฟกัส");
    const onFocus = () => check("WINDOW_FOCUS", "กลับมาที่หน้าต่างสอบ");

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        check("FULLSCREEN_EXIT", "ออกจากโหมดเต็มหน้าจอ");
      }
    };

    const onCopy = () => check("COPY_ATTEMPT", "พยายามคัดลอกข้อความ");
    const onCut = () => check("CUT_ATTEMPT", "พยายามตัดข้อความ");
    const onPaste = () => check("PASTE_ATTEMPT", "พยายามวางข้อความ");

    const onContextMenu = (e: MouseEvent) => {
      if (blockContextMenu) e.preventDefault();
      check("CONTEXT_MENU", "เปิดเมนูคลิกขวา");
    };

    const onClick = () => {
      clicks.current += 1;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keystrokes.current += 1;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "c") check("COPY_ATTEMPT", "กด Ctrl+C");
      else if (key === "x") check("CUT_ATTEMPT", "กด Ctrl+X");
      else if (key === "v") check("PASTE_ATTEMPT", "กด Ctrl+V");
      // Ctrl+Tab, Alt+Tab and Win/Cmd are handled by the OS and never reach
      // the page, so there is nothing to record for them.
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClick);

    // One summary per minute keeps a record of how active the session was
    // without writing a database row for every single click.
    const activityTimer = window.setInterval(() => {
      if (clicks.current === 0 && keystrokes.current === 0) return;
      logRef.current("INPUT_ACTIVITY", "สรุปการใช้เมาส์และคีย์บอร์ด", {
        clicks: clicks.current,
        keystrokes: keystrokes.current,
        window_seconds: 60,
      });
      clicks.current = 0;
      keystrokes.current = 0;
    }, 60_000);

    return () => {
      window.clearInterval(activityTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClick);
    };
  }, [enabled, check, blockContextMenu]);

  return { fire };
}
