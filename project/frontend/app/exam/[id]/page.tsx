"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CameraErrorKind, CameraHandle } from "@/components/Camera";
import MonitorPanel from "@/components/MonitorPanel";
import FaceVerification from "@/components/FaceVerification";
import ExamTimer from "@/components/ExamTimer";
import QuestionCard from "@/components/QuestionCard";
import { TrackerFrame, useFaceTracker } from "@/hooks/useFaceTracker";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import { usePoseWatcher } from "@/hooks/usePoseWatcher";
import { DEFAULT_HEAD_POSE_CONFIG, HeadPoseConfig, exceedsWarning } from "@/lib/headPose";
import { api, ApiError } from "@/lib/api";
import { Attempt, ExamDetail } from "@/types";
import { parseServerDate } from "@/lib/datetime";

const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * Serious proctoring events allowed before the attempt is ended.
 *
 * Three rather than one: a single NO_FACE can come from the student reaching
 * for a dropped pen or a laptop lid shifting, and ending an exam over that
 * would be unjust. Three separate occurrences is a pattern.
 */
const STRIKE_LIMIT = 3;

/** How long the student sees the explanation before the retake begins. */
const AUTO_RESTART_DELAY_MS = 6000;

type Phase =
  | "loading"
  | "closed"
  | "verify"
  | "exam"
  | "submitted"
  | "terminated"
  | "error";

export default function ExamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Pre-filled when the student arrived from the "join by code" box.
  const [joinCode, setJoinCode] = useState(searchParams.get("code") ?? "");

  const [phase, setPhase] = useState<Phase>("loading");
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<HeadPoseConfig>(DEFAULT_HEAD_POSE_CONFIG);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [poseWarning, setPoseWarning] = useState(false);
  const [terminationReason, setTerminationReason] = useState<string | null>(null);
  const [strikes, setStrikes] = useState(0);
  const [autoRestart, setAutoRestart] = useState(false);
  const strikesRef = useRef(0);

  const monitorCameraRef = useRef<CameraHandle>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingSync = useRef<Set<string>>(new Set());
  const attemptRef = useRef<Attempt | null>(null);
  const phaseRef = useRef<Phase>("loading");
  const localStorageKey = attempt ? `eexam_answers_${attempt.id}` : null;

  useEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ---- Load exam metadata + tracking thresholds ----
  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<ExamDetail>(`/api/exams/${id}`);
        setExam(data);
        setPhase(data.status !== "open" ? "closed" : "verify");
      } catch {
        setErrorMsg("ไม่พบข้อสอบนี้");
        setPhase("error");
      }
    }
    load();
    api
      .get<HeadPoseConfig>("/api/face/config")
      .then(setConfig)
      .catch(() => {
        /* defaults are fine */
      });
  }, [id]);

  // ---- Event logging (fire and forget; never blocks the exam UI) ----
  const logEvent = useCallback(
    (eventType: string, description?: string, metadata?: Record<string, unknown>) => {
      const current = attemptRef.current;
      if (!current) return;
      api
        .post(`/api/attempts/${current.id}/events`, {
          event_type: eventType,
          description,
          event_metadata: metadata ?? null,
        })
        .catch(() => {
          /* best effort: a dropped log must not interrupt the exam */
        });
    },
    []
  );

  /**
   * Ends the attempt when a strict-mode rule is broken. Whatever was answered
   * is still graded on the server; the reason is recorded so a human can grant
   * another attempt if the trigger was unfair.
   */
  const handleViolation = useCallback(
    async (eventType: string, label: string) => {
      const current = attemptRef.current;
      if (!current) return;
      setTerminationReason(label);
      setPhase("terminated");
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      try {
        await api.post(`/api/attempts/${current.id}/terminate`, {
          reason: eventType,
          detail: label,
        });
      } catch {
        /* the attempt is over on screen either way; the event log has the record */
      }
    },
    []
  );

  /**
   * Strike rule: three serious proctoring events end the attempt.
   *
   * Counted here rather than on the server because the browser is where the
   * events originate, and a student should see the count climbing instead of
   * being cut off with no warning. The server still records every event, so
   * the strike total can be verified from the log afterwards.
   */
  const addStrike = useCallback(
    (label: string) => {
      strikesRef.current += 1;
      const count = strikesRef.current;
      setStrikes(count);
      if (count >= STRIKE_LIMIT) {
        setAutoRestart(true);
        void handleViolation("PROCTORING_STRIKES", `${label} (ครบ ${STRIKE_LIMIT} ครั้ง)`);
      }
    },
    [handleViolation]
  );

  const { fire } = useAntiCheat({
    enabled: phase === "exam",
    log: logEvent,
    cooldownMs: (config.face_check_interval_seconds || 7) * 2000,
    strict: !!exam?.strict_mode,
    onViolation: handleViolation,
  });

  /**
   * Fires an event and counts it as a strike. Face-related problems and
   * sustained head movement come through here; ordinary browser noise does not.
   */
  const fireStrike = useCallback(
    (eventType: string, label: string, metadata?: Record<string, unknown>) => {
      if (phaseRef.current !== "exam" || strikesRef.current >= STRIKE_LIMIT) return;
      fire(eventType, label, { ...metadata, strike: strikesRef.current + 1 });
      addStrike(label);
    },
    [fire, addStrike]
  );

  const raisePose = useCallback(
    (eventType: string, description: string, metadata: Record<string, unknown>) => {
      // Only the sustained escalation counts as a strike; the first warning at
      // 3 seconds is logged but does not punish a long glance at the clock.
      if (metadata.level === "SUSTAINED") {
        fireStrike(eventType, "หันหน้าออกจากหน้าจอเป็นเวลานาน", metadata);
      } else {
        fire(eventType, description, metadata);
      }
    },
    [fire, fireStrike]
  );

  const { update: updatePose, reset: resetPose } = usePoseWatcher(config, raisePose);

  const getVideo = useCallback(() => monitorCameraRef.current?.getVideo() ?? null, []);

  const handleFrame = useCallback(
    ({ state, pose }: TrackerFrame) => {
      if (state === "NO_FACE") {
        resetPose();
        setPoseWarning(false);
        fireStrike("NO_FACE", "ใบหน้าออกจากกล้อง");
        return;
      }
      if (state === "MULTIPLE_FACES") {
        resetPose();
        setPoseWarning(false);
        fireStrike("MULTIPLE_FACES", "พบมากกว่า 1 ใบหน้าในกล้อง");
        return;
      }
      updatePose(pose ?? null);
      setPoseWarning(!!pose && exceedsWarning(pose, config));
    },
    [fireStrike, updatePose, resetPose, config]
  );

  const { state: faceState, pose } = useFaceTracker({
    enabled: phase === "exam",
    getVideo,
    config,
    fps: 6,
    onFrame: handleFrame,
  });

  // ---- Periodic server-side identity check ----
  // The browser tracker answers "is a face there and where is it pointing".
  // Only the server can answer "is it the right person", because that needs
  // the enrolled embedding, which never leaves the backend.
  useEffect(() => {
    if (phase !== "exam" || !attempt) return;
    const intervalMs = Math.max(3, config.face_check_interval_seconds) * 1000;

    const interval = setInterval(async () => {
      const frame = monitorCameraRef.current?.captureFrameBase64();
      if (!frame) return;
      try {
        await api.post(`/api/attempts/${attempt.id}/face-check`, {
          image_base64: frame,
          head_pose: pose ?? null,
        });
      } catch {
        /* transient network issue; the next tick retries */
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [phase, attempt, config.face_check_interval_seconds, pose]);

  // ---- Start attempt after face verification ----
  async function handleStart(imageBase64: string) {
    setVerifyBusy(true);
    setVerifyMessage(null);
    try {
      const started = await api.post<Attempt>(`/api/exams/${id}/start`, {
        face_image_base64: imageBase64,
        join_code: joinCode || null,
      });
      setAttempt(started);
      attemptRef.current = started;

      const localRaw = localStorage.getItem(`eexam_answers_${started.id}`);
      const localAnswers: Record<string, string> = localRaw ? JSON.parse(localRaw) : {};
      const serverAnswers: Record<string, string> = {};
      started.answers.forEach((a) => {
        if (a.choice_id) serverAnswers[a.question_id] = a.choice_id;
      });
      setAnswers({ ...localAnswers, ...serverAnswers });

      setPhase("exam");
      requestFullscreen();
    } catch (err) {
      setVerifyMessage(err instanceof ApiError ? err.message : "ยืนยันใบหน้าไม่สำเร็จ");
    } finally {
      setVerifyBusy(false);
    }
  }

  function requestFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        // Browsers only grant fullscreen from a user gesture. If it is refused
        // the exam still runs; leaving it is recorded like any other event.
      });
    }
  }

  function handleCameraError(message: string, kind: CameraErrorKind) {
    setErrorMsg(message);
    if (attemptRef.current) fireStrike("CAMERA_DISABLED", "กล้องถูกปิดระหว่างสอบ", { kind });
  }

  // ---- Answers: local state + localStorage + debounced autosave ----
  function handleSelect(questionId: string, choiceId: string) {
    const next = { ...answers, [questionId]: choiceId };
    setAnswers(next);
    if (localStorageKey) localStorage.setItem(localStorageKey, JSON.stringify(next));

    if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
    pendingSync.current.add(questionId);
    saveTimers.current[questionId] = setTimeout(
      () => syncAnswer(questionId, choiceId),
      AUTOSAVE_DEBOUNCE_MS
    );
  }

  async function syncAnswer(questionId: string, choiceId: string) {
    const current = attemptRef.current;
    if (!current) return;
    setSaveStatus("saving");
    try {
      await api.post(`/api/attempts/${current.id}/answers`, {
        question_id: questionId,
        choice_id: choiceId,
      });
      pendingSync.current.delete(questionId);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      // The answer stays in localStorage and is retried when back online.
    }
  }

  useEffect(() => {
    function onOnline() {
      if (!attemptRef.current) return;
      pendingSync.current.forEach((qid) => {
        if (answers[qid]) syncAnswer(qid, answers[qid]);
      });
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // Clear pending autosave timers on unmount so they cannot fire after the
  // component is gone.
  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  // After the strike limit the student goes straight back into a fresh attempt
  // (new shuffle, no saved answers) rather than being left on a dead end.
  useEffect(() => {
    if (phase !== "terminated" || !autoRestart) return;
    const used = (exam?.attempts_used ?? 0) + 1;
    const limit = exam?.max_attempts ?? 1;
    if (limit !== 0 && used >= limit) return;
    const timer = window.setTimeout(() => window.location.reload(), AUTO_RESTART_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, autoRestart, exam]);

  const deadline = useMemo(() => {
    if (!attempt) return null;
    const startedAt = parseServerDate(attempt.started_at);
    if (!startedAt) return null;
    return new Date(startedAt.getTime() + attempt.duration * 60_000).toISOString();
  }, [attempt]);

  const handleSubmit = useCallback(
    async (auto = false) => {
      const current = attemptRef.current;
      if (!current || submitting) return;
      setSubmitting(true);
      try {
        await api.post(`/api/attempts/${current.id}/submit`);
        if (localStorageKey) localStorage.removeItem(localStorageKey);
        setAutoSubmitted(auto);
        setPhase("submitted");
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      } catch (err) {
        setErrorMsg(
          err instanceof ApiError ? err.message : "ไม่สามารถส่งข้อสอบได้ กรุณาลองใหม่"
        );
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, localStorageKey]
  );

  // ---- Render ----
  if (phase === "loading")
    return <main className="p-8 text-center text-slate-500">กำลังโหลด...</main>;

  if (phase === "error") return <main className="p-8 text-center text-red-600">{errorMsg}</main>;

  if (phase === "closed")
    return (
      <main className="p-8 text-center space-y-4">
        <p className="font-medium text-red-600">
          ข้อสอบนี้ยังไม่เปิดสอบ หรือหมดเวลาแล้ว (Exam Not Started / Expired)
        </p>
        <button className="btn-secondary" onClick={() => router.push("/student")}>
          กลับหน้ารายการสอบ
        </button>
      </main>
    );

  if (phase === "verify" && exam) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4">
          <h1 className="text-center text-xl font-bold">{exam.title}</h1>
          <p className="text-center text-sm text-slate-500">
            แนะนำให้ทำข้อสอบบนคอมพิวเตอร์หรือโน้ตบุ๊ก เนื่องจากต้องใช้กล้องและโหมดเต็มหน้าจอ
          </p>
          {exam.max_attempts > 0 && (
            <p className="text-center text-sm text-slate-500">
              สิทธิ์การสอบ: ใช้ไปแล้ว {exam.attempts_used} จาก {exam.max_attempts} ครั้ง
            </p>
          )}
          {exam.strict_mode && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">ข้อสอบนี้ใช้กฎการคุมสอบแบบเข้มงวด</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>ระบบจะเข้าสู่โหมดเต็มหน้าจอเมื่อเริ่มสอบ</li>
                <li>สลับแท็บหรือย่อหน้าต่าง 1 ครั้ง การสอบจะถูกยกเลิกทันที</li>
                <li>คัดลอก ตัด หรือวางข้อความ 1 ครั้ง การสอบจะถูกยกเลิกทันที</li>
                <li>ออกจากโหมดเต็มหน้าจอ การสอบจะถูกยกเลิกทันที</li>
                <li>
                  ลำดับข้อสอบถูกสุ่มใหม่ทุกครั้ง หากเริ่มสอบใหม่จะต้องทำใหม่ทุกข้อ
                </li>
              </ul>
              <p className="mt-2">
                ปิดการแจ้งเตือนและโปรแกรมอื่นก่อนเริ่มสอบ เพื่อไม่ให้ถูกยกเลิกโดยไม่ตั้งใจ
              </p>
            </div>
          )}
          {exam.requires_code && (
            <div className="card space-y-2">
              <label className="text-sm font-medium" htmlFor="join-code">
                รหัสเข้าห้องสอบ
              </label>
              <input
                id="join-code"
                className="input font-mono uppercase tracking-widest"
                placeholder="กรอกรหัสที่ผู้คุมสอบให้"
                value={joinCode}
                maxLength={12}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <p className="text-xs text-slate-500">
                ข้อสอบนี้ต้องใช้รหัสเข้าห้อง กรอกให้ถูกต้องก่อนยืนยันใบหน้า
              </p>
            </div>
          )}
          <FaceVerification
            title="ยืนยันตัวตนก่อนเข้าสอบ"
            actionLabel="ยืนยันตัวตนและเริ่มสอบ"
            onCapture={handleStart}
            busy={verifyBusy}
            resultMessage={verifyMessage}
            resultOk={false}
          />
        </div>
      </main>
    );
  }

  if (phase === "terminated") {
    const used = (exam?.attempts_used ?? 0) + 1;
    const limit = exam?.max_attempts ?? 1;
    const hasRetry = limit === 0 || used < limit;
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md space-y-4 text-center">
          <h1 className="text-xl font-bold text-red-700">การสอบถูกยกเลิก</h1>
          <p className="text-sm text-slate-600">
            ระบบตรวจพบ{terminationReason ?? "การกระทำที่ผิดกฎการสอบ"} ระหว่างทำข้อสอบ
            การสอบครั้งนี้จึงถูกยุติ และคำตอบที่ทำไว้ถูกบันทึกไว้แล้ว
          </p>
          <p className="text-sm text-slate-500">ผู้คุมสอบได้รับการแจ้งเตือนแล้ว</p>
          {autoRestart && hasRetry && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ระบบจะเริ่มการสอบครั้งใหม่ให้อัตโนมัติในอีกสักครู่
            </p>
          )}
          <p className="text-sm text-slate-500">
            {hasRetry
              ? limit === 0
                ? "คุณสามารถเริ่มสอบใหม่ได้ โดยข้อสอบจะถูกสุ่มลำดับใหม่และเริ่มจากข้อแรก"
                : `ใช้สิทธิ์ไปแล้ว ${used} จาก ${limit} ครั้ง เริ่มสอบใหม่ได้อีก ${limit - used} ครั้ง โดยข้อสอบจะถูกสุ่มลำดับใหม่`
              : "ใช้สิทธิ์การสอบครบตามที่กำหนดแล้ว หากเห็นว่าไม่เป็นธรรม กรุณาติดต่อผู้คุมสอบ"}
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => router.push("/student")}>
              กลับหน้ารายการสอบ
            </button>
            {hasRetry && (
              <button className="btn-primary flex-1" onClick={() => window.location.reload()}>
                เริ่มสอบใหม่
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (phase === "submitted") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md space-y-4 text-center">
          <h1 className="text-xl font-bold text-green-700">ส่งข้อสอบเรียบร้อยแล้ว</h1>
          {autoSubmitted && (
            <p className="text-sm text-amber-600">ระบบส่งข้อสอบอัตโนมัติเนื่องจากหมดเวลา</p>
          )}
          <button className="btn-primary w-full" onClick={() => router.push("/student")}>
            กลับหน้ารายการสอบ
          </button>
        </div>
      </main>
    );
  }

  if (phase === "exam" && attempt && deadline) {
    const question = attempt.questions[currentIndex];
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 pb-40">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">{exam?.title}</h1>
          <ExamTimer deadline={deadline} onExpire={() => handleSubmit(true)} />
        </div>

        <p className="text-sm text-slate-500">
          {saveStatus === "saving" && "กำลังบันทึกคำตอบ..."}
          {saveStatus === "saved" && "บันทึกคำตอบแล้ว"}
          {saveStatus === "error" && "บันทึกไม่สำเร็จ จะลองใหม่เมื่อเชื่อมต่อได้"}
        </p>

        {question && (
          <QuestionCard
            question={question}
            index={currentIndex}
            total={attempt.questions.length}
            selectedChoiceId={answers[question.id] ?? null}
            onSelect={(choiceId) => handleSelect(question.id, choiceId)}
          />
        )}

        <div className="flex items-center justify-between">
          <button
            className="btn-secondary"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          >
            ข้อก่อนหน้า
          </button>
          {currentIndex < attempt.questions.length - 1 ? (
            <button
              className="btn-primary"
              onClick={() =>
                setCurrentIndex((i) => Math.min(attempt.questions.length - 1, i + 1))
              }
            >
              ข้อถัดไป
            </button>
          ) : (
            <button className="btn-primary" disabled={submitting} onClick={() => handleSubmit(false)}>
              {submitting ? "กำลังส่ง..." : "ส่งข้อสอบ"}
            </button>
          )}
        </div>

        <MonitorPanel
          ref={monitorCameraRef}
          state={faceState}
          pose={pose}
          poseWarning={poseWarning}
          strikes={strikes}
          strikeLimit={STRIKE_LIMIT}
          onError={handleCameraError}
        />
      </main>
    );
  }

  return null;
}
