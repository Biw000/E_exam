"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { api, ApiError } from "@/lib/api";
import { localInputToUtcIso } from "@/lib/datetime";

interface ExamAdminDetail {
  id: string;
}

export default function CreateExamPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // The attempt deadline is the earlier of (start + duration) and end_time,
    // so a window shorter than the duration silently cuts every attempt short.
    // Catch that here rather than letting an exam go out misconfigured.
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!(start < end)) {
      setError("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
      return;
    }
    const windowMinutes = (end.getTime() - start.getTime()) / 60000;
    if (windowMinutes < Number(duration)) {
      setError(
        `ช่วงเวลาเปิดสอบยาว ${Math.round(windowMinutes)} นาที แต่ตั้งระยะเวลาทำข้อสอบไว้ ${duration} นาที ` +
          "ผู้สอบจะถูกตัดเวลาเมื่อถึงเวลาสิ้นสุด กรุณาขยายเวลาสิ้นสุดหรือลดระยะเวลาทำข้อสอบ"
      );
      return;
    }

    setLoading(true);
    try {
      const created = await api.post<ExamAdminDetail>("/api/exams", {
        title,
        description,
        duration,
        start_time: localInputToUtcIso(startTime),
        end_time: localInputToUtcIso(endTime),
      });
      router.push(`/admin/exams/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "สร้างข้อสอบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="max-w-xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">สร้างข้อสอบใหม่</h1>
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="text-sm font-medium">ชื่อข้อสอบ</label>
            <input required className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">คำอธิบาย</label>
            <textarea
              className="input mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">ระยะเวลา (นาที)</label>
            <input
              type="number"
              min={1}
              required
              className="input mt-1"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-sm font-medium">เวลาเริ่ม</label>
            <input
              type="datetime-local"
              required
              className="input mt-1"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">เวลาสิ้นสุด</label>
            <input
              type="datetime-local"
              required
              className="input mt-1"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "กำลังสร้าง..." : "สร้างข้อสอบและเพิ่มคำถาม"}
          </button>
        </form>
      </main>
    </>
  );
}
