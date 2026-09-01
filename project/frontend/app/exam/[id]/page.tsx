"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Camera, { CameraHandle } from "@/components/Camera";
import FaceVerification from "@/components/FaceVerification";
import ExamTimer from "@/components/ExamTimer";
import QuestionCard from "@/components/QuestionCard";
import { api, ApiError } from "@/lib/api";
import { Attempt, ExamDetail } from "@/types";

const FACE_CHECK_INTERVAL_MS = 7000;
const AUTOSAVE_DEBOUNCE_MS = 800;

type Phase = "loading" | "closed" | "verify" | "exam" | "submitted" | "error";

export default function ExamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  const monitorCameraRef = useRef<CameraHandle>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingSync = useRef<Set<string>>(new Set());
  const localStorageKey = attempt ? `eexam_answers_${attempt.id}` : null;

  // ---- Load exam metadata ----
  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<ExamDetail>(`/api/exams/${id}`);
        setExam(data);
        if (data.status !== "open") {
          setPhase("closed");
        } else {
          setPhase("verify");
        }
      } catch {
        setErrorMsg("ไม่พบข้อสอบนี้");
        setPhase("error");
      }
    }
    load();
  }, [id]);

  // ---- Start attempt (after face verification capture) ----
  async function handleStart(imageBase64: string) {
    setVerifyBusy(true);
    setVerifyMessage(null);
    try {
      const started = await api.post<Attempt>(`/api/exams/${id}/start`, { face_image_base64: imageBase64 });
      setAttempt(started);

      // Merge server-saved answers with any not-yet-synced local answers.
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
      setVerifyMessage(err instanceof ApiError ? err.message : "Face verification failed");
    } finally {
      setVerifyBusy(false);
    }
  }

  function requestFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        /* user may block fullscreen; anti-cheat listener still logs exits */
      });
    }
  }

  const logEvent = useCallback(
    async (eventType: string, description?: string, confidence?: number) => {
      if (!attempt) return;
      try {
        await api.post(`/api/attempts/${attempt.id}/events`, {
          event_type: eventType,
          description,
          confidence,
        });
      } catch {
        // best-effort; do not block the exam UI on logging failures
      }
    },
    [attempt]
  );

  // ---- Anti-cheat: tab switch + fullscreen exit listeners ----
  useEffect(() => {
    if (phase !== "exam") return;

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        logEvent("TAB_SWITCH", "Tab hidden or window lost focus");
      }
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        logEvent("FULLSCREEN_EXIT", "Exited fullscreen mode");
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [phase, logEvent]);

  // ---- Anti-cheat: periodic face monitoring ----
  useEffect(() => {
    if (phase !== "exam" || !attempt) return;

    const interval = setInterval(async () => {
      const frame = monitorCameraRef.current?.captureFrameBase64();
      if (!frame) return;
      try {
        await api.post(`/api/attempts/${attempt.id}/face-check`, { image_base64: frame });
      } catch {
        // network hiccup during a background check; next interval will retry
      }
    }, FACE_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [phase, attempt]);

  function handleCameraError(message: string) {
    if (attempt) logEvent("CAMERA_DISABLED", message);
  }

  // ---- Answer selection: local state + localStorage + debounced autosave ----
  function handleSelect(questionId: string, choiceId: string) {
    const next = { ...answers, [questionId]: choiceId };
    setAnswers(next);
    if (localStorageKey) localStorage.setItem(localStorageKey, JSON.stringify(next));

    if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
    pendingSync.current.add(questionId);
    saveTimers.current[questionId] = setTimeout(() => syncAnswer(questionId, choiceId), AUTOSAVE_DEBOUNCE_MS);
  }

  async function syncAnswer(questionId: string, choiceId: string) {
    if (!attempt) return;
    setSaveStatus("saving");
    try {
      await api.post(`/api/attempts/${attempt.id}/answers`, { question_id: questionId, choice_id: choiceId });
      pendingSync.current.delete(questionId);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
      // stays in localStorage; retried when connection returns (see effect below)
    }
  }

  // ---- Retry any answers still pending sync once the browser is back online ----
  useEffect(() => {
    function onOnline() {
      if (!attempt) return;
      pendingSync.current.forEach((qid) => {
        if (answers[qid]) syncAnswer(qid, answers[qid]);
      });
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, answers]);

  const deadline = useMemo(() => {
    if (!attempt) return null;
    return new Date(new Date(attempt.started_at).getTime() + attempt.duration * 60_000).toISOString();
  }, [attempt]);

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (!attempt || submitting) return;
      setSubmitting(true);
      try {
        await api.post(`/api/attempts/${attempt.id}/submit`);
        if (localStorageKey) localStorage.removeItem(localStorageKey);
        setAutoSubmitted(auto);
        setPhase("submitted");
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      } catch (err) {
        setErrorMsg(err instanceof ApiError ? err.message : "ไม่สามารถส่งข้อสอบได้ กรุณาลองใหม่");
      } finally {
        setSubmitting(false);
      }
    },
    [attempt, submitting, localStorageKey]
  );

  // ---- Render ----
  if (phase === "loading") return <main className="p-8 text-center text-slate-500">กำลังโหลด...</main>;
  if (phase === "error")
    return <main className="p-8 text-center text-red-600">{errorMsg}</main>;
  if (phase === "closed")
    return (
      <main className="p-8 text-center space-y-4">
        <p className="text-red-600 font-medium">ข้อสอบนี้ยังไม่เปิดสอบ หรือหมดเวลาแล้ว (Exam Not Started / Expired)</p>
        <button className="btn-secondary" onClick={() => router.push("/student")}>
          กลับหน้ารายการสอบ
        </button>
      </main>
    );

  if (phase === "verify" && exam) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4">
          <h1 className="text-xl font-bold text-center">{exam.title}</h1>
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

  if (phase === "submitted") {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md text-center space-y-4">
          <h1 className="text-xl font-bold text-green-700">ส่งข้อสอบเรียบร้อยแล้ว</h1>
          {autoSubmitted && <p className="text-amber-600 text-sm">ระบบส่งข้อสอบอัตโนมัติเนื่องจากหมดเวลา</p>}
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
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">{exam?.title}</h1>
          <ExamTimer deadline={deadline} onExpire={() => handleSubmit(true)} />
        </div>

        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {saveStatus === "saving" && "กำลังบันทึกคำตอบ..."}
            {saveStatus === "saved" && "บันทึกคำตอบแล้ว"}
            {saveStatus === "error" && "บันทึกไม่สำเร็จ จะลองใหม่เมื่อเชื่อมต่อได้"}
          </span>
          <Camera ref={monitorCameraRef} onError={handleCameraError} className="w-24" />
        </div>

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
            Previous
          </button>
          {currentIndex < attempt.questions.length - 1 ? (
            <button
              className="btn-primary"
              onClick={() => setCurrentIndex((i) => Math.min(attempt.questions.length - 1, i + 1))}
            >
              Next
            </button>
          ) : (
            <button className="btn-primary" disabled={submitting} onClick={() => handleSubmit(false)}>
              {submitting ? "กำลังส่ง..." : "Submit Exam"}
            </button>
          )}
        </div>
      </main>
    );
  }

  return null;
}
