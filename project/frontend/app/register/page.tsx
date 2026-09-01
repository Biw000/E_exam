"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FaceVerification from "@/components/FaceVerification";
import { api, ApiError } from "@/lib/api";
import { setToken } from "@/lib/auth";

interface TokenResponse {
  access_token: string;
  token_type: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"details" | "face">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    setStep("face");
  }

  async function handleFaceCapture(imageBase64: string) {
    setBusy(true);
    setResultMessage(null);
    try {
      const res = await api.post<TokenResponse>(
        "/api/auth/register",
        { name, email, password, face_image_base64: imageBase64 },
        false
      );
      setToken(res.access_token);
      setResultMessage("สมัครสมาชิกสำเร็จ กำลังนำท่านเข้าสู่ระบบ...");
      setTimeout(() => router.push("/student"), 800);
    } catch (err) {
      if (err instanceof ApiError) {
        setResultMessage(err.message);
      } else {
        setResultMessage("เกิดข้อผิดพลาด กรุณาลองใหม่ (Network Error)");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      {step === "details" ? (
        <form onSubmit={handleDetailsSubmit} className="card w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-brand-700">สมัครสมาชิก</h1>

          <div>
            <label className="text-sm font-medium">ชื่อ-นามสกุล</label>
            <input required className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

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
            <label className="text-sm font-medium">รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)</label>
            <input
              type="password"
              required
              minLength={8}
              className="input mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" className="btn-primary w-full">
            ถัดไป: ลงทะเบียนใบหน้า
          </button>

          <p className="text-sm text-center text-slate-500">
            มีบัญชีแล้ว?{" "}
            <Link href="/login" className="text-brand-600 font-medium">
              เข้าสู่ระบบ
            </Link>
          </p>
        </form>
      ) : (
        <div className="w-full max-w-md space-y-4">
          <FaceVerification
            title="ลงทะเบียนใบหน้า"
            actionLabel="ถ่ายภาพและสมัครสมาชิก"
            onCapture={handleFaceCapture}
            busy={busy}
            resultMessage={resultMessage}
            resultOk={resultMessage?.includes("สำเร็จ")}
          />
          <button className="btn-secondary w-full" onClick={() => setStep("details")} disabled={busy}>
            ย้อนกลับ
          </button>
        </div>
      )}
    </main>
  );
}
