"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { api, ApiError } from "@/lib/api";
import { ExamListItem } from "@/types";
import { formatDateTime } from "@/lib/datetime";

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

  /**
   * Grouped by subject, with anything unassigned collected at the end so an
   * exam created before subjects existed never disappears from the list.
   */
  const groups = useMemo(() => {
    const bySubject = new Map<string, { name: string; exams: ExamListItem[] }>();
    const ungrouped: ExamListItem[] = [];

    exams.forEach((exam) => {
      if (!exam.subject_id || !exam.subject_name) {
        ungrouped.push(exam);
        return;
      }
      const entry = bySubject.get(exam.subject_id) ?? {
        name: exam.subject_name,
        exams: [],
      };
      entry.exams.push(exam);
      bySubject.set(exam.subject_id, entry);
    });

    const sorted = [...bySubject.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name, "th"))
      .map(([id, value]) => ({ id, ...value }));

    if (ungrouped.length) {
      sorted.push({ id: "__none__", name: "ไม่ระบุวิชา", exams: ungrouped });
    }
    return sorted;
  }, [exams]);

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
          <div className="flex gap-2">
            <Link href="/admin/subjects" className="btn-secondary">
              จัดการวิชา
            </Link>
            <Link href="/admin/exams/create" className="btn-primary">
              + สร้างข้อสอบใหม่
            </Link>
          </div>
        </div>

        {loading && <p className="text-slate-500">กำลังโหลด...</p>}
        {error && <p className="text-red-600">{error}</p>}

        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.id} className="space-y-2">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {group.name}
                <span className="text-xs font-normal text-slate-400">
                  {group.exams.length} ชุด
                </span>
              </h2>

              {group.exams.map((exam) => (
                <div
                  key={exam.id}
                  className="card flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{exam.title}</h3>
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
                          ? "เปิดสอบ"
                          : exam.status === "upcoming"
                          ? "ยังไม่ถึงเวลา"
                          : "ปิดแล้ว"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">
                      {exam.duration} นาที · {formatDateTime(exam.start_time)} —{" "}
                      {formatDateTime(exam.end_time)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/admin/exams/${exam.id}/stats`} className="btn-secondary">
                      สถิติ
                    </Link>
                    <Link href={`/admin/exams/${exam.id}`} className="btn-secondary">
                      แก้ไข
                    </Link>
                    <button
                      className="btn-secondary text-red-600"
                      onClick={() => handleDelete(exam.id)}
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ))}
          {!loading && exams.length === 0 && <p className="text-slate-500">ยังไม่มีข้อสอบ</p>}
        </div>
      </main>
    </>
  );
}
