"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
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
  const [exams, setExams] = useState<ExamListItem[]>([]);
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

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold">รายการสอบ</h1>

        {loading && <p className="text-slate-500">กำลังโหลด...</p>}
        {error && <p className="text-red-600">{error}</p>}

        <div className="space-y-4">
          {exams.map((exam) => {
            const myResult = resultsByExam.get(exam.id);
            return (
              <div key={exam.id} className="card flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{exam.title}</h2>
                    <span className={`badge ${statusColor[exam.status]}`}>{statusLabel[exam.status]}</span>
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
                    เริ่มสอบ
                  </Link>
                ) : (
                  <span className="btn-secondary opacity-50 cursor-not-allowed">
                    {exam.status === "upcoming" ? "ยังไม่เปิด" : "หมดเวลา"}
                  </span>
                )}
              </div>
            );
          })}
          {!loading && exams.length === 0 && <p className="text-slate-500">ยังไม่มีข้อสอบ</p>}
        </div>
      </main>
    </>
  );
}
