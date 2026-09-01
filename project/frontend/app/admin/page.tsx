"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { api } from "@/lib/api";

interface DashboardStats {
  total_exams: number;
  total_students: number;
  total_attempts: number;
  total_suspicious_events: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api.get<DashboardStats>("/api/admin/dashboard").then(setStats).catch(() => {});
  }, []);

  const cards = [
    { label: "Total Exams", value: stats?.total_exams },
    { label: "Total Students", value: stats?.total_students },
    { label: "Total Attempts", value: stats?.total_attempts },
    { label: "Suspicious Events", value: stats?.total_suspicious_events },
  ];

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="card text-center">
              <p className="text-3xl font-bold text-brand-700">{c.value ?? "-"}</p>
              <p className="text-sm text-slate-500 mt-1">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <Link href="/admin/exams" className="btn-primary">
            จัดการข้อสอบ
          </Link>
          <Link href="/admin/results" className="btn-secondary">
            ดูผลสอบ
          </Link>
        </div>
      </main>
    </>
  );
}
