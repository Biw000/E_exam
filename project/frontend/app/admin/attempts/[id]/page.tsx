"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { EventSeverity, SuspiciousEvent } from "@/types";
import { formatDateTime } from "@/lib/datetime";

const SEVERITY_STYLES: Record<EventSeverity, string> = {
  INFO: "bg-slate-100 text-slate-600",
  WARNING: "bg-amber-100 text-amber-800",
  SUSPICIOUS: "bg-red-100 text-red-700",
};

const SEVERITY_LABEL: Record<EventSeverity, string> = {
  INFO: "ทั่วไป",
  WARNING: "ควรดู",
  SUSPICIOUS: "ควรตรวจสอบ",
};

// Weights match SEVERITY_WEIGHT in the backend model so the number a reviewer
// sees here is the same one the backend would compute.
const SEVERITY_WEIGHT: Record<EventSeverity, number> = {
  INFO: 0,
  WARNING: 2,
  SUSPICIOUS: 5,
};

const FILTERS: Array<{ key: "ALL" | EventSeverity; label: string }> = [
  { key: "ALL", label: "ทั้งหมด" },
  { key: "INFO", label: "ทั่วไป" },
  { key: "WARNING", label: "ควรดู" },
  { key: "SUSPICIOUS", label: "ควรตรวจสอบ" },
];

export default function AdminAttemptEventsPage() {
  const { id } = useParams<{ id: string }>();
  const [events, setEvents] = useState<SuspiciousEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | EventSeverity>("ALL");

  useEffect(() => {
    api
      .get<SuspiciousEvent[]>(`/api/admin/attempts/${id}/events`)
      .then(setEvents)
      .catch(() => setError("ไม่สามารถโหลดข้อมูลเหตุการณ์ได้"))
      .finally(() => setLoading(false));
  }, [id]);

  const counts = useMemo(() => {
    const base: Record<EventSeverity, number> = { INFO: 0, WARNING: 0, SUSPICIOUS: 0 };
    events.forEach((ev) => {
      const sev = (ev.severity ?? "INFO") as EventSeverity;
      if (base[sev] !== undefined) base[sev] += 1;
    });
    return base;
  }, [events]);

  const reviewScore = useMemo(
    () =>
      events.reduce((total, ev) => {
        const sev = (ev.severity ?? "INFO") as EventSeverity;
        return total + (SEVERITY_WEIGHT[sev] ?? 0);
      }, 0),
    [events]
  );

  const visible = useMemo(
    () => (filter === "ALL" ? events : events.filter((ev) => (ev.severity ?? "INFO") === filter)),
    [events, filter]
  );

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">บันทึกกิจกรรมระหว่างสอบ</h1>
          <p className="mt-1 text-sm text-slate-500">
            รายการด้านล่างคือกิจกรรมที่ระบบตรวจพบ ไม่ใช่ข้อสรุปว่ามีการทุจริต
            เบราว์เซอร์ไม่สามารถตรวจสอบโปรแกรมอื่นหรืออุปกรณ์นอกหน้าจอได้
            กรุณาใช้ประกอบการพิจารณาเท่านั้น
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["INFO", "WARNING", "SUSPICIOUS"] as EventSeverity[]).map((sev) => (
            <div key={sev} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">{SEVERITY_LABEL[sev]}</p>
              <p className="text-xl font-semibold tabular-nums">{counts[sev]}</p>
            </div>
          ))}
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">คะแนนลำดับการตรวจ</p>
            <p className="text-xl font-semibold tabular-nums">{reviewScore}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                filter === f.key
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 text-slate-600 hover:border-slate-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-slate-500">กำลังโหลด...</p>}
        {error && <p className="text-red-600">{error}</p>}

        <div className="space-y-2">
          {visible.map((ev) => {
            const severity = (ev.severity ?? "INFO") as EventSeverity;
            return (
              <div key={ev.id} className="card flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${SEVERITY_STYLES[severity]}`}>
                      {SEVERITY_LABEL[severity]}
                    </span>
                    <span className="font-mono text-sm text-slate-700">{ev.event_type}</span>
                  </div>
                  {ev.description && (
                    <p className="mt-1 text-sm text-slate-600">{ev.description}</p>
                  )}
                  {ev.confidence !== null && ev.confidence !== undefined && (
                    <p className="text-xs text-slate-400">distance: {ev.confidence.toFixed(3)}</p>
                  )}
                  {ev.event_metadata && Object.keys(ev.event_metadata).length > 0 && (
                    <p className="mt-1 break-words text-xs text-slate-400">
                      {Object.entries(ev.event_metadata)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <span className="whitespace-nowrap text-xs text-slate-400">
                  {formatDateTime(ev.created_at)}
                </span>
              </div>
            );
          })}

          {!loading && visible.length === 0 && (
            <p className="text-slate-500">
              {events.length === 0
                ? "ไม่มีเหตุการณ์ที่บันทึกไว้"
                : "ไม่มีเหตุการณ์ในระดับที่เลือก"}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
