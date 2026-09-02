"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { AdminUser } from "@/types";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "student" | "admin">("all");
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    api
      .get<AdminUser[]>("/api/admin/users")
      .then(setUsers)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "ไม่สามารถโหลดรายชื่อบัญชีได้")
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== "all" && u.role !== filter) return false;
      if (!term) return true;
      return (
        u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
      );
    });
  }, [users, filter, search]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await api.del(`/api/admin/users/${pendingDelete.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ลบบัญชีไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold">จัดการบัญชีผู้ใช้</h1>
          <p className="mt-1 text-sm text-slate-500">
            ทั้งหมด {users.length} บัญชี · การลบบัญชีจะลบข้อมูลใบหน้า ประวัติการสอบ
            คำตอบ และบันทึกเหตุการณ์ทั้งหมดของผู้ใช้รายนั้นไปด้วย และไม่สามารถกู้คืนได้
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: "all", label: "ทั้งหมด" },
              { key: "student", label: "นักศึกษา" },
              { key: "admin", label: "ผู้ดูแลระบบ" },
            ] as const
          ).map((f) => (
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
          <input
            className="ml-auto w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm sm:w-56"
            placeholder="ค้นหาชื่อหรืออีเมล"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="ค้นหาบัญชี"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {loading && <p className="text-slate-500">กำลังโหลด...</p>}

        <div className="space-y-2">
          {visible.map((user) => (
            <div key={user.id} className="card flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{user.name}</span>
                  <span
                    className={`badge ${
                      user.role === "admin"
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {user.role === "admin" ? "ผู้ดูแลระบบ" : "นักศึกษา"}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{user.email}</p>
                <p className="mt-1 text-xs text-slate-400">
                  สมัครเมื่อ {formatDateTime(user.created_at)} · สอบไปแล้ว{" "}
                  {user.attempt_count} ครั้ง ·{" "}
                  {user.face_enrolled
                    ? `ลงทะเบียนใบหน้า ${user.enrolled_poses.length} มุม (${user.enrolled_poses.join(", ")})`
                    : "ยังไม่ได้ลงทะเบียนใบหน้า"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50"
                onClick={() => setPendingDelete(user)}
              >
                ลบบัญชี
              </button>
            </div>
          ))}

          {!loading && visible.length === 0 && (
            <p className="text-slate-500">ไม่พบบัญชีที่ตรงกับเงื่อนไข</p>
          )}
        </div>
      </main>

      {/* Deleting an account destroys their exam history too, so the name is
          shown back to the admin before anything is removed. */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">ยืนยันการลบบัญชี</h2>
            <p className="text-sm text-slate-600">
              กำลังจะลบ <span className="font-medium">{pendingDelete.name}</span> (
              {pendingDelete.email})
              {pendingDelete.attempt_count > 0 && (
                <> พร้อมประวัติการสอบ {pendingDelete.attempt_count} ครั้ง</>
              )}{" "}
              การกระทำนี้ย้อนกลับไม่ได้
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "กำลังลบ..." : "ลบบัญชี"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
