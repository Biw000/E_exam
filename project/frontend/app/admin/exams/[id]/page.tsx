"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api, ApiError } from "@/lib/api";
import { ExamDetail, Question } from "@/types";

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

  const [questionText, setQuestionText] = useState("");
  const [score, setScore] = useState(10);
  const [choices, setChoices] = useState<ChoiceForm[]>(emptyChoices());
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<ExamDetail>(`/api/exams/${id}/admin`);
      setExam(data);
    } catch {
      setError("ไม่พบข้อสอบนี้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
        <div>
          <h1 className="text-2xl font-bold">{exam.title}</h1>
          <p className="text-sm text-slate-500">
            {exam.duration} นาที · {new Date(exam.start_time).toLocaleString("th-TH")} —{" "}
            {new Date(exam.end_time).toLocaleString("th-TH")}
          </p>
        </div>

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
