"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";
import { SuspiciousEvent } from "@/types";

const eventColor: Record<string, string> = {
  FACE_OK: "bg-green-100 text-green-700",
  NO_FACE: "bg-amber-100 text-amber-700",
  MULTIPLE_FACES: "bg-red-100 text-red-700",
  FACE_MISMATCH: "bg-red-100 text-red-700",
  TAB_SWITCH: "bg-orange-100 text-orange-700",
  FULLSCREEN_EXIT: "bg-orange-100 text-orange-700",
  CAMERA_DISABLED: "bg-red-100 text-red-700",
};

export default function AdminAttemptEventsPage() {
  const { id } = useParams<{ id: string }>();
  const [events, setEvents] = useState<SuspiciousEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<SuspiciousEvent[]>(`/api/admin/attempts/${id}/events`)
      .then(setEvents)
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Suspicious Events</h1>

        {loading && <p className="text-slate-500">กำลังโหลด...</p>}

        <div className="space-y-2">
          {events.map((ev) => (
            <div key={ev.id} className="card flex items-center justify-between">
              <div>
                <span className={`badge ${eventColor[ev.event_type] ?? "bg-slate-100 text-slate-600"}`}>
                  {ev.event_type}
                </span>
                {ev.description && <p className="text-sm text-slate-600 mt-1">{ev.description}</p>}
                {ev.confidence !== null && (
                  <p className="text-xs text-slate-400">distance: {ev.confidence.toFixed(3)}</p>
                )}
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {new Date(ev.created_at).toLocaleString("th-TH")}
              </span>
            </div>
          ))}
          {!loading && events.length === 0 && <p className="text-slate-500">ไม่มีเหตุการณ์ที่บันทึกไว้</p>}
        </div>
      </main>
    </>
  );
}
