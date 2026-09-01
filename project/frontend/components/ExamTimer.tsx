"use client";

import { useEffect, useState } from "react";

interface ExamTimerProps {
  /** ISO deadline computed by the caller from server_time + remaining duration */
  deadline: string;
  onExpire: () => void;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Purely a display timer. The backend is the source of truth for whether
 * time has actually expired (see is_attempt_time_expired) — this component
 * only drives the UI and triggers an auto-submit attempt when it hits zero.
 */
export default function ExamTimer({ deadline, onExpire }: ExamTimerProps) {
  const [remainingMs, setRemainingMs] = useState(() => new Date(deadline).getTime() - Date.now());
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const ms = new Date(deadline).getTime() - Date.now();
      setRemainingMs(ms);
      if (ms <= 0 && !expired) {
        setExpired(true);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, expired]);

  const isLow = remainingMs < 60_000;

  return (
    <div className={`font-mono text-xl font-bold ${isLow ? "text-red-600" : "text-brand-700"}`}>
      Time Remaining: {formatRemaining(remainingMs)}
    </div>
  );
}
