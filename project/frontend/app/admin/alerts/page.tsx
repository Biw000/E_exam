"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { ProctorAlert } from "@/types";

const POLL_MS = 20_000;

const EVENT_LABELS: Record<string, string> = {
  MULTIPLE_FACES: "พบมากกว่า 1 ใบหน้า",
  FACE_MISMATCH: "ใบหน้าไม่ตรงกับที่ลงทะเบียน",
  ATTEMPT_TERMINATED: "การสอบถูกยกเลิก",
  PROCTORING_STRIKES: "ผิดกฎครบตามจำนวน",
  CAMERA_DISABLED: "กล้องถูกปิด",
};

export default function AdminAlertsPage() {
  const [alerts, setAlerts] = useState<ProctorAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [live, setLive] = useState(true);
  const seen = useRef<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await api.get<ProctorAlert[]>("/api/admin/alerts?minutes=180");
      const incoming = new Set<string>();
      data.forEach((a) => {
        if (!seen.current.has(a.event_id)) incoming.add(a.event_id);
        seen.current.add(a.event_id);
      });
      setAlerts(data);
      setFreshIds(incoming);
      setLastChecked(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ไม่สามารถโหลดการแจ้งเตือนได้");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Polled, not pushed. A websocket would not survive the backend spinning
  // down on an idle free instance, and a 20-second delay is imperceptible to
  // someone watching an exam room.
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, load]);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">การแจ้งเตือนผู้คุมสอบ</h1>
            <p className="mt-1 text-sm text-slate-500">
              เหตุการณ์ระดับควรตรวจสอบและการสอบที่ถูกยกเลิกใน 3 ชั่วโมงล่าสุด
              อัปเดตอัตโนมัติทุก 20 วินาที
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setLive((v) => !v)}
            aria-pressed={live}
          >
            {live ? "หยุดอัปเดตอัตโนมัติ" : "เปิดอัปเดตอัตโนมัติ"}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span
            className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-slate-300"}`}
            aria-hidden="true"
          />
          {lastChecked
            ? `ตรวจสอบล่าสุด ${lastChecked.toLocaleTimeString("th-TH")}`
            : "กำลังตรวจสอบ..."}
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="space-y-2" aria-live="polite">
          {alerts.map((alert) => (
            <div
              key={alert.event_id}
              className={`card ${
                freshIds.has(alert.event_id) ? "ring-2 ring-red-200" : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge bg-red-100 text-red-700">
                      {EVENT_LABELS[alert.event_type] ?? alert.event_type}
                    </span>
                    {alert.attempt_status === "terminated" && (
                      <span className="badge bg-slate-200 text-slate-700">ยุติแล้ว</span>
                    )}
                  </div>
                  <p className="mt-1 font-medium">{alert.student_name}</p>
                  <p className="text-sm text-slate-500">{alert.student_email}</p>
                  <p className="text-sm text-slate-600">
                    {alert.exam_title}
                    {alert.description && ` · ${alert.description}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">{formatDateTime(alert.created_at)}</p>
                  <Link
                    href={`/admin/attempts/${alert.attempt_id}`}
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    ดูบันทึกทั้งหมด
                  </Link>
                </div>
              </div>
            </div>
          ))}

          {alerts.length === 0 && !error && (
            <p className="text-slate-500">ไม่มีการแจ้งเตือนในช่วง 3 ชั่วโมงที่ผ่านมา</p>
          )}
        </div>
      </main>
    </>
  );
}
