"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { AdminResult } from "@/types";
import { formatDateTime } from "@/lib/datetime";

const statusLabel: Record<string, string> = {
  in_progress: "กำลังทำข้อสอบ",
  submitted: "ส่งแล้ว",
  expired: "หมดเวลา",
};

export default function AdminResultsPage() {
  const [results, setResults] = useState<AdminResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AdminResult[]>("/api/admin/results")
      .then(setResults)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold">ผลสอบทั้งหมด</h1>

        {loading && <p className="text-slate-500">กำลังโหลด...</p>}

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4">นักเรียน</th>
                <th className="py-2 pr-4">ข้อสอบ</th>
                <th className="py-2 pr-4">คะแนน</th>
                <th className="py-2 pr-4">สถานะ</th>
                <th className="py-2 pr-4">เริ่มสอบ</th>
                <th className="py-2 pr-4">ส่งสอบ</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.attempt_id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    {r.student_name}
                    <div className="text-xs text-slate-400">{r.student_email}</div>
                  </td>
                  <td className="py-2 pr-4">{r.exam_title}</td>
                  <td className="py-2 pr-4">
                    {r.score ?? "-"}/{r.total_score}
                  </td>
                  <td className="py-2 pr-4">{statusLabel[r.status]}</td>
                  <td className="py-2 pr-4">{formatDateTime(r.started_at)}</td>
                  <td className="py-2 pr-4">
                    {formatDateTime(r.submitted_at)}
                  </td>
                  <td className="py-2">
                    <Link href={`/admin/attempts/${r.attempt_id}`} className="text-brand-600 font-medium">
                      ดู Events
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && results.length === 0 && <p className="text-slate-500 py-4">ยังไม่มีข้อมูล</p>}
        </div>
      </main>
    </>
  );
}
