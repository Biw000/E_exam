"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { api, ApiError } from "@/lib/api";
import { ExamListItem } from "@/types";

export default function AdminExamsPage() {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<ExamListItem[]>("/api/exams");
      setExams(data);
    } catch {
      setError("ไม่สามารถโหลดรายการข้อสอบได้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("ยืนยันการลบข้อสอบนี้?")) return;
    try {
      await api.del(`/api/exams/${id}`);
      setExams((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "ลบข้อสอบไม่สำเร็จ");
    }
  }

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">จัดการข้อสอบ</h1>
          <Link href="/admin/exams/create" className="btn-primary">
            + สร้างข้อสอบใหม่
          </Link>
        </div>

        {loading && <p className="text-slate-500">กำลังโหลด...</p>}
        {error && <p className="text-red-600">{error}</p>}

        <div className="space-y-3">
          {exams.map((exam) => (
            <div key={exam.id} className="card flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{exam.title}</h2>
                <p className="text-sm text-slate-500">
                  {exam.duration} นาที · {new Date(exam.start_time).toLocaleString("th-TH")} —{" "}
                  {new Date(exam.end_time).toLocaleString("th-TH")}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/admin/exams/${exam.id}`} className="btn-secondary">
                  แก้ไข
                </Link>
                <button className="btn-secondary text-red-600" onClick={() => handleDelete(exam.id)}>
                  ลบ
                </button>
              </div>
            </div>
          ))}
          {!loading && exams.length === 0 && <p className="text-slate-500">ยังไม่มีข้อสอบ</p>}
        </div>
      </main>
    </>
  );
}
