"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { api, ApiError } from "@/lib/api";
import { ExamDetail, Question, Subject } from "@/types";
import {
  formatDateTime,
  localInputToUtcIso,
  utcIsoToLocalInput,
} from "@/lib/datetime";

interface ChoiceForm {
  choice_text: string;
  is_correct: boolean;
}

const emptyChoices = (): ChoiceForm[] => [
  { choice_text: "", is_correct: true },
  { choice_text: "", is_correct: false },
  { choice_text: "", is_correct: false },
  { choice_text: "", is_correct: false },
];

export default function AdminExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Exam settings form, seeded from the loaded exam.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [passingPercentage, setPassingPercentage] = useState(50);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  const [questionText, setQuestionText] = useState("");
  const [score, setScore] = useState(10);
  const [choices, setChoices] = useState<ChoiceForm[]>(emptyChoices());
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<ExamDetail>(`/api/exams/${id}/admin`);
      setExam(data);
      setTitle(data.title);
      setDescription(data.description ?? "");
      setDuration(data.duration);
      setStartTime(utcIsoToLocalInput(data.start_time));
      setEndTime(utcIsoToLocalInput(data.end_time));
      setSubjectId(data.subject_id ?? "");
      setPassingPercentage(data.passing_percentage ?? 50);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "ไม่สามารถโหลดข้อมูลข้อสอบได้"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    api
      .get<Subject[]>("/api/subjects")
      .then(setSubjects)
      .catch(() => {
        /* subject list is optional */
      });
  }, []);

  async function patchExam(body: Record<string, unknown>, message: string) {
    setSavingSettings(true);
    setSettingsMessage(null);
    setError(null);
    try {
      await api.put(`/api/exams/${id}`, body);
      await load();
      setSettingsMessage(message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!(start < end)) {
      setError("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
      return;
    }
    await patchExam(
      {
        title,
        description,
        duration,
        start_time: localInputToUtcIso(startTime),
        end_time: localInputToUtcIso(endTime),
        subject_id: subjectId || null,
        passing_percentage: passingPercentage,
      },
      "บันทึกการตั้งค่าแล้ว"
    );
  }

  /**
   * Open / close are expressed as changes to the exam window rather than a
   * separate flag, so there is only ever one source of truth for whether an
   * exam is running. Opening also pushes the end time out by the full duration
   * so nobody is cut short the moment they start.
   */
  async function handleOpenNow() {
    const now = new Date();
    const newEnd = new Date(now.getTime() + Number(duration) * 60_000);
    await patchExam(
      { start_time: now.toISOString(), end_time: newEnd.toISOString() },
      `เปิดสอบแล้ว ปิดอัตโนมัติในอีก ${duration} นาที`
    );
  }

  async function handleCloseNow() {
    if (!confirm("ปิดข้อสอบตอนนี้? ผู้ที่กำลังสอบอยู่จะถูกตัดเวลาทันที")) return;
    const now = new Date().toISOString();
    await patchExam({ end_time: now }, "ปิดข้อสอบแล้ว");
  }

  function updateChoiceText(index: number, text: string) {
    setChoices((prev) => prev.map((c, i) => (i === index ? { ...c, choice_text: text } : c)));
  }

  function setCorrect(index: number) {
    setChoices((prev) => prev.map((c, i) => ({ ...c, is_correct: i === index })));
  }

  async function handleAddQuestion(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/exams/${id}/questions`, {
        question_text: questionText,
        score,
        order: (exam?.questions.length ?? 0) + 1,
        choices: choices
          .filter((c) => c.choice_text.trim() !== "")
          .map((c, i) => ({ choice_text: c.choice_text, is_correct: c.is_correct, order: i + 1 })),
      });
      setQuestionText("");
      setScore(10);
      setChoices(emptyChoices());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เพิ่มคำถามไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!confirm("ยืนยันการลบคำถามนี้?")) return;
    try {
      await api.del(`/api/questions/${questionId}`);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "ลบคำถามไม่สำเร็จ");
    }
  }

  if (loading) return <main className="p-8 text-center text-slate-500">กำลังโหลด...</main>;
  if (!exam) return <main className="p-8 text-center text-red-600">{error}</main>;

  return (
    <>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{exam.title}</h1>
                <span
                  className={`badge ${
                    exam.status === "open"
                      ? "bg-green-100 text-green-700"
                      : exam.status === "upcoming"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {exam.status === "open"
                    ? "กำลังเปิดสอบ"
                    : exam.status === "upcoming"
                    ? "ยังไม่ถึงเวลา"
                    : "ปิดแล้ว"}
                </span>
              </div>
              {exam.description && (
                <p className="mt-1 text-sm text-slate-600">{exam.description}</p>
              )}
              <p className="mt-1 text-sm text-slate-500">
                {exam.subject_name ?? "ไม่ระบุวิชา"} · {exam.duration} นาที · {formatDateTime(exam.start_time)} —{" "}
                {formatDateTime(exam.end_time)}
              </p>
            </div>
            <Link href={`/admin/exams/${id}/stats`} className="btn-secondary">
              ดูสถิติ
            </Link>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              {settingsOpen ? "ซ่อนการตั้งค่า" : "แก้ไขข้อสอบ"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleOpenNow}
              disabled={savingSettings}
            >
              เปิดสอบตอนนี้
            </button>
            <button
              type="button"
              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              onClick={handleCloseNow}
              disabled={savingSettings || exam.status === "closed"}
            >
              ปิดข้อสอบตอนนี้
            </button>
          </div>

          {settingsMessage && (
            <p className="text-sm text-green-700">{settingsMessage}</p>
          )}
        </div>

        {settingsOpen && (
          <section className="card space-y-4">
            <h2 className="text-lg font-semibold">ตั้งค่าข้อสอบ</h2>
            <form onSubmit={handleSaveSettings} className="space-y-3">
              <div>
                <label className="text-sm font-medium">หัวข้อข้อสอบ</label>
                <input
                  required
                  className="input mt-1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">คำอธิบาย</label>
                <textarea
                  className="input mt-1"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">วิชา</label>
                  <select
                    className="input mt-1"
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                  >
                    <option value="">ไม่ระบุวิชา</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code ? `${s.code} — ${s.name}` : s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">เกณฑ์ผ่าน (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input mt-1"
                    value={passingPercentage}
                    onChange={(e) => setPassingPercentage(Number(e.target.value))}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">ระยะเวลา (นาที)</label>
                <input
                  type="number"
                  min={1}
                  required
                  className="input mt-1 w-32"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">เวลาเริ่ม</label>
                  <input
                    type="datetime-local"
                    required
                    className="input mt-1"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">เวลาสิ้นสุด</label>
                  <input
                    type="datetime-local"
                    required
                    className="input mt-1"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="btn-primary" disabled={savingSettings}>
                {savingSettings ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
              </button>
            </form>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">คำถามทั้งหมด ({exam.questions.length})</h2>
          {exam.questions.map((q: Question, idx: number) => (
            <div key={q.id} className="card space-y-2">
              <div className="flex items-start justify-between">
                <p className="font-medium">
                  {idx + 1}. {q.question_text} <span className="text-sm text-slate-400">({q.score} คะแนน)</span>
                </p>
                <button className="text-red-600 text-sm" onClick={() => handleDeleteQuestion(q.id)}>
                  ลบ
                </button>
              </div>
              <ul className="text-sm text-slate-600 space-y-1">
                {q.choices.map((c) => (
                  <li key={c.id} className={c.is_correct ? "text-green-700 font-medium" : ""}>
                    {c.is_correct ? "✓ " : "○ "}
                    {c.choice_text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">เพิ่มคำถามใหม่</h2>
          <form onSubmit={handleAddQuestion} className="space-y-3">
            <div>
              <label className="text-sm font-medium">คำถาม</label>
              <textarea
                required
                className="input mt-1"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">คะแนน</label>
              <input
                type="number"
                min={0}
                className="input mt-1 w-32"
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">ตัวเลือก (เลือกข้อที่ถูกต้อง)</label>
              {choices.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" name="correct" checked={c.is_correct} onChange={() => setCorrect(i)} />
                  <input
                    className="input"
                    placeholder={`ตัวเลือก ${i + 1}`}
                    value={c.choice_text}
                    onChange={(e) => updateChoiceText(i, e.target.value)}
                  />
                </div>
              ))}
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "กำลังบันทึก..." : "เพิ่มคำถาม"}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
