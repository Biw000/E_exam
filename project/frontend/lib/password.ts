/**
 * Password rules for live feedback in the register form.
 *
 * These mirror `backend/app/services/password_policy.py`. Keep the two in sync:
 * this file exists for UX only - the backend is what actually enforces the
 * policy, since anything running in the browser can be bypassed.
 */

export const MIN_LENGTH = 8;
export const MAX_BYTES = 72;

const SPECIAL_PATTERN = /[!@#$%^&*?_\-+=.,:;()[\]{}<>/\\|~`'"]/;

export interface PasswordRule {
  id: string;
  label: string;
  passed: boolean;
}

export type StrengthLevel = "empty" | "weak" | "fair" | "good" | "strong";

export interface PasswordCheck {
  rules: PasswordRule[];
  passedCount: number;
  allPassed: boolean;
  strength: StrengthLevel;
  strengthLabel: string;
  tooLong: boolean;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function checkPassword(password: string): PasswordCheck {
  const rules: PasswordRule[] = [
    {
      id: "length",
      label: `อย่างน้อย ${MIN_LENGTH} ตัวอักษร`,
      passed: password.length >= MIN_LENGTH,
    },
    { id: "upper", label: "ตัวพิมพ์ใหญ่ (A-Z)", passed: /[A-Z]/.test(password) },
    { id: "lower", label: "ตัวพิมพ์เล็ก (a-z)", passed: /[a-z]/.test(password) },
    { id: "digit", label: "ตัวเลข (0-9)", passed: /[0-9]/.test(password) },
    { id: "special", label: "อักขระพิเศษ (! @ # $ % ^ & * ? _)", passed: SPECIAL_PATTERN.test(password) },
  ];

  const passedCount = rules.filter((rule) => rule.passed).length;
  const tooLong = byteLength(password) > MAX_BYTES;
  const allPassed = passedCount === rules.length && !tooLong;

  // Length beyond the minimum earns a bonus, so a long passphrase that hits
  // every rule reads as "strong" rather than merely "good".
  let score = passedCount;
  if (password.length >= 12 && passedCount >= 4) score += 1;

  let strength: StrengthLevel = "empty";
  let strengthLabel = "";

  if (password.length > 0) {
    if (score <= 2) {
      strength = "weak";
      strengthLabel = "อ่อน";
    } else if (score === 3) {
      strength = "fair";
      strengthLabel = "พอใช้";
    } else if (score === 4 || (score === 5 && !allPassed)) {
      strength = "good";
      strengthLabel = "ดี";
    } else {
      strength = "strong";
      strengthLabel = "แข็งแรง";
    }
  }

  return { rules, passedCount, allPassed, strength, strengthLabel, tooLong };
}

/** 0-4 filled segments for the strength meter. */
export function strengthSegments(strength: StrengthLevel): number {
  switch (strength) {
    case "weak":
      return 1;
    case "fair":
      return 2;
    case "good":
      return 3;
    case "strong":
      return 4;
    default:
      return 0;
  }
}
