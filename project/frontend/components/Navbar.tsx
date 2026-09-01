"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken, getRoleFromToken } from "@/lib/auth";

export default function Navbar() {
  const router = useRouter();
  const role = typeof window !== "undefined" ? getRoleFromToken() : null;

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  return (
    <nav className="w-full bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
      <Link href={role === "admin" ? "/admin" : "/student"} className="font-bold text-brand-700">
        E-Exam
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {role === "admin" && (
          <>
            <Link href="/admin/exams" className="hover:text-brand-600">
              จัดการข้อสอบ
            </Link>
            <Link href="/admin/results" className="hover:text-brand-600">
              ผลสอบ
            </Link>
          </>
        )}
        {role === "student" && (
          <Link href="/student" className="hover:text-brand-600">
            รายการสอบ
          </Link>
        )}
        <button onClick={handleLogout} className="btn-secondary py-1.5">
          ออกจากระบบ
        </button>
      </div>
    </nav>
  );
}
