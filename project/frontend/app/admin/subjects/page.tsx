"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { api, ApiError } from "@/lib/api";
import { Subject } from "@/types";

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api
      .get<Subject[]>("/api/subjects")
      .then(setSubjects)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "ไม่สามารถโหลดรายการวิชาได้")
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setCode("");
    setDescription("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { name, code: code || null, description: description || null };
      if (editingId) {
        await api.put(`/api/subjects/${editingId}`, body);
      } else {
        await api.post("/api/subjects", body);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "บันทึกวิชาไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(subject: Subject) {
    setEditingId(subject.id);
    setName(subject.name);
    setCode(subject.code ?? "");
    setDescription(subject.description ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(subject: Subject) {
    const warning =
      subject.exam_count > 0
        ? `ลบวิชา "${subject.name}"? ข้อสอบ ${subject.exam_count} ชุดในวิชานี้จะไม่ถูกลบ แต่จะกลายเป็นข้อสอบที่ไม่ระบุวิชา`
        : `ลบวิชา "${subject.name}"?`;
    if (!confirm(warning)) return;
    try {
      await api.del(`/api/subjects/${subject.id}`);
      if (editingId === subject.id) resetForm();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ลบวิชาไม่สำเร็จ");
    }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">จัดการวิชา</h1>
          <p className="mt-1 text-sm text-slate-500">
            ใช้จัดกลุ่มข้อสอบตามรายวิชา การลบวิชาจะไม่ลบข้อสอบหรือผลสอบ
            ข้อสอบจะย้ายไปอยู่กลุ่มไม่ระบุวิชาแทน
          </p>
        </div>

        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">
            {editingId ? "แก้ไขวิชา" : "เพิ่มวิชาใหม่"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">ชื่อวิชา</label>
                <input
                  required
                  className="input mt-1"
                  placeholder="เช่น การเขียนโปรแกรมเบื้องต้น"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">รหัสวิชา</label>
                <input
                  className="input mt-1"
                  placeholder="เช่น CS101"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">คำอธิบาย</label>
              <textarea
                className="input mt-1"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "เพิ่มวิชา"}
              </button>
              {editingId && (
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  ยกเลิก
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">วิชาทั้งหมด ({subjects.length})</h2>
          {loading && <p className="text-slate-500">กำลังโหลด...</p>}
          {subjects.map((subject) => (
            <div key={subject.id} className="card flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {subject.name}
                  {subject.code && (
                    <span className="ml-2 text-sm text-slate-400">{subject.code}</span>
                  )}
                </p>
                {subject.description && (
                  <p className="text-sm text-slate-600">{subject.description}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  ข้อสอบ {subject.exam_count} ชุด
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-sm text-indigo-600 hover:underline"
                  onClick={() => startEdit(subject)}
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => handleDelete(subject)}
                >
                  ลบ
                </button>
              </div>
            </div>
          ))}
          {!loading && subjects.length === 0 && (
            <p className="text-slate-500">ยังไม่มีวิชา เพิ่มวิชาแรกได้จากฟอร์มด้านบน</p>
          )}
        </section>
      </main>
    </>
  );
}
