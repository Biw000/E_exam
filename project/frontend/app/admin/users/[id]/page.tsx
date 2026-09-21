"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import DonutChart from "@/components/DonutChart";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { StudentReport } from "@/types";

const STATUS_LABEL: Record<string, { text: string; style: string }> = {
  submitted: { text: "ส่งแล้ว", style: "bg-green-100 text-green-700" },
  in_progress: { text: "กำลังสอบ", style: "bg-amber-100 text-amber-800" },
  expired: { text: "หมดเวลา", style: "bg-slate-100 text-slate-600" },
  terminated: { text: "ถูกยกเลิก", style: "bg-red-100 text-red-700" },
};

const REASON_LABEL: Record<string, string> = {
  PROCTORING_STRIKES: "ผิดกฎครบตามจำนวน",
  FACE_ABSENT_TOO_LONG: "ใบหน้าหายจากกล้องนานเกินกำหนด",
  TAB_SWITCH: "สลับหน้าจอ",
  COPY_ATTEMPT: "คัดลอกข้อความ",
  CUT_ATTEMPT: "ตัดข้อความ",
  PASTE_ATTEMPT: "วางข้อความ",
  FULLSCREEN_EXIT: "ออกจากโหมดเต็มหน้าจอ",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export default function StudentReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StudentReport>(`/api/admin/users/${id}/results`)
      .then(setReport)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "ไม่สามารถโหลดข้อมูลผู้สอบได้")
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <main className="p-8 text-center text-slate-500">กำลังโหลด...</main>;
  if (!report) return <main className="p-8 text-center text-red-600">{error}</main>;

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <Link href="/admin/users" className="text-sm text-indigo-600 hover:underline">
            ← กลับไปรายชื่อบัญชี
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{report.name}</h1>
          <p className="text-sm text-slate-500">{report.email}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="เข้าสอบทั้งหมด"
            value={String(report.total_attempts)}
            hint={
              report.terminated_attempts > 0
                ? `ถูกยกเลิก ${report.terminated_attempts} ครั้ง`
                : undefined
            }
          />
          <Stat
            label="คะแนนเฉลี่ย"
            value={report.average_percentage !== null ? `${report.average_percentage}%` : "-"}
            hint={`จาก ${report.graded_attempts} ครั้งที่มีคะแนน`}
          />
          <Stat
            label="คะแนนสูงสุด"
            value={report.best_percentage !== null ? `${report.best_percentage}%` : "-"}
          />
          <Stat
            label="ผ่าน / ไม่ผ่าน"
            value={`${report.passed_count} / ${report.failed_count}`}
          />
        </div>

        {report.graded_attempts > 0 && (
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">สัดส่วนการสอบผ่าน</h2>
            <DonutChart
              slices={[
                { label: "ผ่าน", value: report.passed_count, color: "#16a34a" },
                { label: "ไม่ผ่าน", value: report.failed_count, color: "#dc2626" },
              ]}
              centerLabel={`${Math.round(
                (report.passed_count / report.graded_attempts) * 100
              )}%`}
              centerSub="ผ่าน"
            />
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">ประวัติการสอบ</h2>
          {report.attempts.map((row) => {
            const status = STATUS_LABEL[row.status] ?? STATUS_LABEL.expired;
            return (
              <div key={row.attempt_id} className="card space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.exam_title}</span>
                      <span className={`badge ${status.style}`}>{status.text}</span>
                      {row.passed !== null && (
                        <span
                          className={`badge ${
                            row.passed
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {row.passed ? "ผ่าน" : "ไม่ผ่าน"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      {row.subject_name ?? "ไม่ระบุวิชา"} · เริ่ม {formatDateTime(row.started_at)}
                      {row.submitted_at && ` · ส่ง ${formatDateTime(row.submitted_at)}`}
                    </p>
                    {row.terminated_reason && (
                      <p className="text-sm text-red-600">
                        สาเหตุที่ถูกยกเลิก:{" "}
                        {REASON_LABEL[row.terminated_reason] ?? row.terminated_reason}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold tabular-nums">
                      {row.score !== null ? `${row.score}/${row.total_score}` : "-"}
                    </p>
                    {row.percentage !== null && (
                      <p className="text-xs text-slate-500">
                        {row.percentage}% · เกณฑ์ {row.passing_percentage}%
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
                  <span className="text-slate-500">
                    เหตุการณ์ควรดู {row.warning_events} · ควรตรวจสอบ{" "}
                    <span className={row.suspicious_events > 0 ? "font-medium text-red-600" : ""}>
                      {row.suspicious_events}
                    </span>
                  </span>
                  <Link
                    href={`/admin/attempts/${row.attempt_id}`}
                    className="text-indigo-600 hover:underline"
                  >
                    ดูบันทึกกิจกรรม
                  </Link>
                </div>
              </div>
            );
          })}
          {report.attempts.length === 0 && (
            <p className="text-slate-500">ผู้ใช้นี้ยังไม่เคยเข้าสอบ</p>
          )}
        </section>
      </main>
    </>
  );
}
