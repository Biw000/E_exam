"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { setToken, getRoleFromToken } from "@/lib/auth";

interface TokenResponse {
  access_token: string;
  token_type: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<TokenResponse>("/api/auth/login", { email, password }, false);
      setToken(res.access_token);
      const role = getRoleFromToken();
      router.push(role === "admin" ? "/admin" : "/student");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : err.message);
      } else {
        setError("เกิดข้อผิดพลาด กรุณาลองใหม่ (Network Error)");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-brand-700">เข้าสู่ระบบ</h1>

        <div>
          <label className="text-sm font-medium">อีเมล</label>
          <input
            type="email"
            required
            className="input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium">รหัสผ่าน</label>
          <input
            type="password"
            required
            className="input mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>

        <p className="text-sm text-center text-slate-500">
          ยังไม่มีบัญชี?{" "}
          <Link href="/register" className="text-brand-600 font-medium">
            สมัครสมาชิก
          </Link>
        </p>
      </form>
    </main>
  );
}
