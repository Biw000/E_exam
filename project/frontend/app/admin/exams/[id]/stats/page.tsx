"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import DonutChart from "@/components/DonutChart";
import { api, ApiError } from "@/lib/api";
import { ExamStats } from "@/types";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export default function ExamStatsPage() {
  const { id } = useParams<{ id: string }>();
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ExamStats>(`/api/admin/exams/${id}/stats`)
      .then(setStats)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "ไม่สามารถโหลดสถิติได้")
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <main className="p-8 text-center text-slate-500">กำลังโหลด...</main>;
  if (!stats) return <main className="p-8 text-center text-red-600">{error}</main>;

  const maxBucket = Math.max(...stats.distribution.map((b) => b.count), 1);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <Link href={`/admin/exams/${id}`} className="text-sm text-indigo-600 hover:underline">
            ← กลับไปหน้าข้อสอบ
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{stats.exam_title}</h1>
          <p className="text-sm text-slate-500">
            {stats.subject_name ?? "ไม่ระบุวิชา"} · คะแนนเต็ม {stats.total_score} ·
            เกณฑ์ผ่าน {stats.passing_percentage}%
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="ผู้เข้าสอบ"
            value={String(stats.participants)}
            hint={stats.in_progress > 0 ? `กำลังสอบ ${stats.in_progress} คน` : undefined}
          />
          <StatCard
            label="คะแนนเฉลี่ย"
            value={stats.average_score !== null ? String(stats.average_score) : "-"}
            hint={
              stats.average_percentage !== null ? `${stats.average_percentage}%` : undefined
            }
          />
          <StatCard
            label="คะแนนสูงสุด"
            value={stats.highest_score !== null ? String(stats.highest_score) : "-"}
          />
          <StatCard
            label="คะแนนต่ำสุด"
            value={stats.lowest_score !== null ? String(stats.lowest_score) : "-"}
          />
        </div>

        <section className="card space-y-4">
          <div>
            <h2 className="text-lg font-semibold">สัดส่วนผ่าน / ไม่ผ่าน</h2>
            <p className="text-xs text-slate-500">
              คิดจากผู้ที่ส่งข้อสอบแล้ว {stats.submitted} คน
              {stats.in_progress > 0 && ` (ไม่รวมผู้ที่กำลังสอบอีก ${stats.in_progress} คน)`}
            </p>
          </div>
          <DonutChart
            slices={[
              { label: "ผ่าน", value: stats.passed, color: "#16a34a" },
              { label: "ไม่ผ่าน", value: stats.failed, color: "#dc2626" },
            ]}
            centerLabel={stats.pass_rate !== null ? `${stats.pass_rate}%` : "-"}
            centerSub="ผ่าน"
          />
        </section>

        <section className="card space-y-3">
          <h2 className="text-lg font-semibold">การกระจายคะแนน</h2>
          <div className="space-y-2">
            {stats.distribution.map((bucket) => (
              <div key={bucket.label} className="flex items-center gap-3">
                <span className="w-20 flex-shrink-0 text-xs text-slate-500">
                  {bucket.label}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full rounded bg-indigo-500 transition-all"
                    style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm tabular-nums">{bucket.count}</span>
              </div>
            ))}
          </div>
          {stats.submitted === 0 && (
            <p className="text-sm text-slate-500">ยังไม่มีผู้ส่งข้อสอบ</p>
          )}
        </section>
      </main>
    </>
  );
}
