"use client";

import { useId, useState } from "react";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Whether to render the eye toggle. The confirm-password field passes false:
   * it stays masked at all times, so the user has to type it from memory
   * rather than reading it off the screen.
   */
  allowReveal?: boolean;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  /** Message shown below the field, styled by `tone`. */
  hint?: string | null;
  tone?: "neutral" | "success" | "error";
  describedBy?: string;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <path d="M2.5 12S6 5.5 12 5.5c1.6 0 3 .5 4.2 1.1M21.5 12S18 18.5 12 18.5c-1.6 0-3-.5-4.2-1.1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m4 4 16 16" />
    </svg>
  );
}

export default function PasswordField({
  label,
  value,
  onChange,
  allowReveal = true,
  autoComplete = "new-password",
  placeholder,
  required = true,
  hint,
  tone = "neutral",
  describedBy,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  const hintColor =
    tone === "success" ? "text-emerald-600" : tone === "error" ? "text-red-600" : "text-slate-500";

  const borderColor =
    tone === "error"
      ? "border-red-300 focus:border-red-500 focus:ring-red-100"
      : tone === "success"
        ? "border-emerald-300 focus:border-emerald-500 focus:ring-emerald-100"
        : "border-slate-200 focus:border-slate-900 focus:ring-slate-100";

  return (
    <div>
      <label htmlFor={inputId} className="block text-[13px] font-medium text-slate-700">
        {label}
      </label>

      <div className="relative mt-1.5">
        <input
          id={inputId}
          type={revealed && allowReveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-describedby={[hint ? hintId : null, describedBy].filter(Boolean).join(" ") || undefined}
          aria-invalid={tone === "error"}
          className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-4 ${borderColor} ${
            allowReveal ? "pr-11" : ""
          }`}
        />

        {allowReveal && (
          <button
            type="button"
            onClick={() => setRevealed((prev) => !prev)}
            aria-label={revealed ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            aria-pressed={revealed}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <EyeIcon open={revealed} />
          </button>
        )}
      </div>

      {hint && (
        <p id={hintId} className={`mt-1.5 text-xs ${hintColor}`}>
          {hint}
        </p>
      )}
    </div>
  );
}
