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
}

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
}: Options) {
  const lastFired = useRef<Record<string, number>>({});
  const suppressed = useRef<Record<string, number>>({});
  const logRef = useRef(log);

  useEffect(() => {
    logRef.current = log;
  }, [log]);

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

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        fire("TAB_SWITCH", "สลับแท็บหรือย่อหน้าต่างระหว่างสอบ");
      }
    };

    const onBlur = () => fire("WINDOW_BLUR", "หน้าต่างสอบสูญเสียโฟกัส");
    const onFocus = () => fire("WINDOW_FOCUS", "กลับมาที่หน้าต่างสอบ");

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        fire("FULLSCREEN_EXIT", "ออกจากโหมดเต็มหน้าจอ");
      }
    };

    const onCopy = () => fire("COPY_ATTEMPT", "พยายามคัดลอกข้อความ");
    const onCut = () => fire("CUT_ATTEMPT", "พยายามตัดข้อความ");
    const onPaste = () => fire("PASTE_ATTEMPT", "พยายามวางข้อความ");

    const onContextMenu = (e: MouseEvent) => {
      if (blockContextMenu) e.preventDefault();
      fire("CONTEXT_MENU", "เปิดเมนูคลิกขวา");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "c") fire("COPY_ATTEMPT", "กด Ctrl+C");
      else if (key === "x") fire("CUT_ATTEMPT", "กด Ctrl+X");
      else if (key === "v") fire("PASTE_ATTEMPT", "กด Ctrl+V");
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

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, fire, blockContextMenu]);

  return { fire };
}
