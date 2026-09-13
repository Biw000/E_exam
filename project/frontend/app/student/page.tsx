"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api, ApiError } from "@/lib/api";
import { ExamListItem, MyResult } from "@/types";

const statusLabel: Record<string, string> = {
  upcoming: "ยังไม่เปิด",
  open: "เปิดสอบ",
  closed: "ปิดแล้ว",
};

const statusColor: Record<string, string> = {
  upcoming: "bg-amber-100 text-amber-700",
  open: "bg-green-100 text-green-700",
  closed: "bg-slate-200 text-slate-600",
};

export default function StudentDashboard() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [results, setResults] = useState<MyResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [examList, myResults] = await Promise.all([
          api.get<ExamListItem[]>("/api/exams"),
          api.get<MyResult[]>("/api/results/my"),
        ]);
        setExams(examList);
        setResults(myResults);
      } catch {
        setError("ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const resultsByExam = new Map(results.map((r) => [r.exam_id, r]));

  /** Exams grouped by subject, with anything unassigned last. */
  const groups = useMemo(() => {
    const bySubject = new Map<string, { name: string; exams: ExamListItem[] }>();
    const ungrouped: ExamListItem[] = [];

    exams.forEach((exam) => {
      if (!exam.subject_id || !exam.subject_name) {
        ungrouped.push(exam);
        return;
      }
      const entry = bySubject.get(exam.subject_id) ?? { name: exam.subject_name, exams: [] };
      entry.exams.push(exam);
      bySubject.set(exam.subject_id, entry);
    });

    const sorted = [...bySubject.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name, "th"))
      .map(([id, value]) => ({ id, ...value }));
    if (ungrouped.length) sorted.push({ id: "__none__", name: "ไม่ระบุวิชา", exams: ungrouped });
    return sorted;
  }, [exams]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      const exam = await api.post<{ id: string; status: string }>("/api/exams/join", {
        code: joinCode.trim(),
      });
      if (exam.status !== "open") {
        setJoinError("พบข้อสอบแล้ว แต่ยังไม่ถึงเวลาสอบหรือหมดเวลาแล้ว");
        return;
      }
      router.push(`/exam/${exam.id}?code=${encodeURIComponent(joinCode.trim())}`);
    } catch (err) {
      setJoinError(err instanceof ApiError ? err.message : "ไม่พบข้อสอบที่ใช้รหัสนี้");
    } finally {
      setJoining(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold">รายการสอบ</h1>

        <section className="card space-y-3">
          <div>
            <h2 className="font-semibold">เข้าห้องสอบด้วยรหัส</h2>
            <p className="text-sm text-slate-500">
              ถ้าผู้คุมสอบให้รหัสมา กรอกที่นี่เพื่อเข้าห้องสอบได้ทันที
            </p>
          </div>
          <form onSubmit={handleJoin} className="flex flex-wrap gap-2">
            <input
              className="input flex-1 font-mono uppercase tracking-widest"
              placeholder="เช่น ABC123"
              value={joinCode}
              maxLength={12}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              aria-label="รหัสเข้าห้องสอบ"
            />
            <button type="submit" className="btn-primary" disabled={joining}>
              {joining ? "กำลังตรวจสอบ..." : "เข้าห้องสอบ"}
            </button>
          </form>
          {joinError && <p className="text-sm text-red-600">{joinError}</p>}
        </section>

        {loading && <p className="text-slate-500">กำลังโหลด...</p>}
        {error && <p className="text-red-600">{error}</p>}

        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.id} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {group.name}
              </h2>
              {group.exams.map((exam) => {
            const myResult = resultsByExam.get(exam.id);
            return (
              <div key={exam.id} className="card flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{exam.title}</h2>
                    <span className={`badge ${statusColor[exam.status]}`}>{statusLabel[exam.status]}</span>
                    {exam.requires_code && (
                      <span className="badge bg-indigo-100 text-indigo-700">ต้องใช้รหัส</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{exam.description}</p>
                  <p className="text-sm text-slate-500 mt-1">ระยะเวลา: {exam.duration} นาที</p>
                  {myResult?.status === "submitted" && (
                    <p className="text-sm text-green-700 mt-1">
                      คะแนนของคุณ: {myResult.score}/{myResult.total_score} ({myResult.percentage}%)
                    </p>
                  )}
                </div>

                {myResult?.status === "submitted" ? (
                  <span className="btn-secondary opacity-70 cursor-default">ส่งข้อสอบแล้ว</span>
                ) : exam.status === "open" ? (
                  <Link href={`/exam/${exam.id}`} className="btn-primary whitespace-nowrap">
                    {exam.requires_code ? "เข้าห้องสอบ" : "เริ่มสอบ"}
                  </Link>
                ) : (
                  <span className="btn-secondary opacity-50 cursor-not-allowed">
                    {exam.status === "upcoming" ? "ยังไม่เปิด" : "หมดเวลา"}
                  </span>
                )}
              </div>
                );
              })}
            </section>
          ))}
          {!loading && exams.length === 0 && <p className="text-slate-500">ยังไม่มีข้อสอบ</p>}
        </div>
      </main>
    </>
  );
}
