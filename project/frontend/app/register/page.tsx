"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FaceEnrollment from "@/components/FaceEnrollment";
import PasswordField from "@/components/PasswordField";
import { api, ApiError } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { checkPassword, strengthSegments } from "@/lib/password";

interface TokenResponse {
  access_token: string;
  token_type: string;
}

const STRENGTH_COLORS: Record<string, string> = {
  weak: "bg-red-500",
  fair: "bg-amber-500",
  good: "bg-sky-500",
  strong: "bg-emerald-500",
};

const STRENGTH_TEXT: Record<string, string> = {
  weak: "text-red-600",
  fair: "text-amber-600",
  good: "text-sky-600",
  strong: "text-emerald-600",
};

function CheckIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-emerald-600" fill="currentColor">
      <path d="M13.3 4.3 6.5 11.1 2.7 7.3l1.1-1.1 2.7 2.7 5.7-5.7 1.1 1.1Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-slate-300" fill="currentColor">
      <circle cx="8" cy="8" r="3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
      <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"details" | "face">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  const passwordCheck = useMemo(() => checkPassword(password), [password]);
  const segments = strengthSegments(passwordCheck.strength);

  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = confirmTouched && password === confirmPassword;
  const confirmTone = !confirmTouched ? "neutral" : passwordsMatch ? "success" : "error";
  const confirmHint = !confirmTouched
    ? null
    : passwordsMatch
      ? "✓ รหัสผ่านตรงกัน"
      : "✕ รหัสผ่านไม่ตรงกัน";

  const canContinue =
    name.trim().length > 0 && email.trim().length > 0 && passwordCheck.allPassed && passwordsMatch;

  function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!passwordCheck.allPassed) {
      setError(
        passwordCheck.tooLong
          ? "รหัสผ่านยาวเกินไป"
          : "รหัสผ่านยังไม่ผ่านเงื่อนไขทั้งหมด กรุณาตรวจสอบรายการด้านล่างช่องรหัสผ่าน"
      );
      return;
    }
    if (password !== confirmPassword) {
      setError("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setStep("face");
  }

  async function handleFaceCapture(samples: Record<string, string>) {
    setBusy(true);
    setResultMessage(null);
    try {
      const res = await api.post<TokenResponse>(
        "/api/auth/register",
        {
          name: name.trim(),
          email: email.trim(),
          password,
          confirm_password: confirmPassword,
          face_samples: samples,
        },
        false
      );
      setToken(res.access_token);
      setRegistered(true);
      setResultMessage("สมัครสมาชิกสำเร็จ กำลังนำท่านเข้าสู่ระบบ...");
      setTimeout(() => router.push("/student"), 800);
    } catch (err) {
      if (err instanceof ApiError) {
        setResultMessage(err.message);
      } else {
        setResultMessage("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <ShieldIcon />
          </div>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">
              สร้างบัญชีผู้เข้าสอบ
            </h1>
            <p className="text-[13px] text-slate-500">ระบบสอบออนไลน์พร้อมการยืนยันตัวตน</p>
          </div>
        </div>

        {/* Step indicator */}
        <ol className="mb-5 flex items-center gap-2 text-[12px]" aria-label="ขั้นตอนการสมัคร">
          {[
            { key: "details", label: "ข้อมูลบัญชี" },
            { key: "face", label: "ลงทะเบียนใบหน้า" },
          ].map((item, index) => {
            const isActive = step === item.key;
            const isDone = step === "face" && item.key === "details";
            return (
              <li key={item.key} className="flex flex-1 items-center gap-2">
                <span
                  aria-current={isActive ? "step" : undefined}
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold transition ${
                    isDone
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isActive
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-400"
                  }`}
                >
                  {isDone ? "✓" : index + 1}
                </span>
                <span className={isActive || isDone ? "text-slate-900" : "text-slate-400"}>
                  {item.label}
                </span>
                {index === 0 && <span className="h-px flex-1 bg-slate-200" />}
              </li>
            );
          })}
        </ol>

        {step === "details" ? (
          <form
            onSubmit={handleDetailsSubmit}
            className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
            noValidate
          >
            <div>
              <label htmlFor="reg-name" className="block text-[13px] font-medium text-slate-700">
                ชื่อ-นามสกุล
              </label>
              <input
                id="reg-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-100"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-[13px] font-medium text-slate-700">
                อีเมล
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-100"
              />
            </div>

            <div>
              <PasswordField
                label="รหัสผ่าน"
                value={password}
                onChange={setPassword}
                allowReveal
                describedBy="password-requirements"
              />

              {/* Strength meter */}
              {password.length > 0 && (
                <div className="mt-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400">
                      ความแข็งแรง
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${STRENGTH_TEXT[passwordCheck.strength] ?? "text-slate-400"}`}
                    >
                      {passwordCheck.strengthLabel}
                    </span>
                  </div>
                  <div
                    className="mt-1 flex gap-1"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={4}
                    aria-valuenow={segments}
                    aria-label="ความแข็งแรงของรหัสผ่าน"
                  >
                    {[0, 1, 2, 3].map((index) => (
                      <span
                        key={index}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          index < segments
                            ? (STRENGTH_COLORS[passwordCheck.strength] ?? "bg-slate-300")
                            : "bg-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Requirements */}
              <ul id="password-requirements" className="mt-3 space-y-1.5">
                {passwordCheck.rules.map((rule) => (
                  <li
                    key={rule.id}
                    className={`flex items-center gap-2 text-[12px] ${
                      rule.passed ? "text-slate-600" : "text-slate-400"
                    }`}
                  >
                    <CheckIcon passed={rule.passed} />
                    {rule.label}
                  </li>
                ))}
              </ul>

              {passwordCheck.tooLong && (
                <p className="mt-2 text-xs text-red-600">รหัสผ่านยาวเกินขีดจำกัดของระบบ</p>
              )}
            </div>

            <PasswordField
              label="ยืนยันรหัสผ่าน"
              value={confirmPassword}
              onChange={setConfirmPassword}
              allowReveal={false}
              hint={confirmHint}
              tone={confirmTone}
            />

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canContinue}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              ถัดไป: ลงทะเบียนใบหน้า
            </button>

            <p className="text-center text-[13px] text-slate-500">
              มีบัญชีแล้ว?{" "}
              <Link
                href="/login"
                className="font-medium text-slate-900 underline underline-offset-4 hover:text-slate-700"
              >
                เข้าสู่ระบบ
              </Link>
            </p>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
              <p className="mb-4 text-[13px] leading-relaxed text-slate-600">
                ระบบจะบันทึกข้อมูลใบหน้าของท่านเพื่อใช้ยืนยันตัวตนก่อนเข้าสอบเท่านั้น
                ภาพถ่ายจะไม่ถูกเก็บไว้ และข้อมูลใบหน้าจะไม่ถูกส่งกลับมาแสดงผลที่หน้าเว็บ
              </p>
              <FaceEnrollment
                onComplete={handleFaceCapture}
                submitting={busy}
                errorMessage={registered ? null : resultMessage}
              />
              {registered && resultMessage && (
                <p className="mt-3 text-sm font-medium text-green-700">{resultMessage}</p>
              )}
            </div>

            <button
              type="button"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setStep("details")}
              disabled={busy || registered}
            >
              ย้อนกลับ
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
