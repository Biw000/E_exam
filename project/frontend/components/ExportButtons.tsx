"use client";

import { useState } from "react";
import {
  chooseSaveFolder,
  clearSaveFolder,
  downloadCsv,
  hasSaveFolder,
  supportsDirectorySave,
} from "@/lib/download";

export interface ExportItem {
  label: string;
  path: string;
  filename: string;
}

/**
 * Download buttons plus the optional "save into this folder" control.
 *
 * The folder choice lasts for the current tab only. Keeping the permission
 * across reloads would mean storing a handle and re-prompting anyway, and a
 * silent write into a folder the admin chose weeks ago is worse behaviour than
 * asking again.
 */
export default function ExportButtons({ items }: { items: ExportItem[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(item: ExportItem) {
    setBusy(item.path);
    setError(null);
    setMessage(null);
    try {
      const name = await downloadCsv(item.path, item.filename);
      setMessage(
        hasSaveFolder() ? `บันทึก ${name} ลงโฟลเดอร์แล้ว` : `ดาวน์โหลด ${name} แล้ว`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function handleChooseFolder() {
    const name = await chooseSaveFolder();
    if (name) {
      setFolder(name);
      setMessage(`ไฟล์ที่ดาวน์โหลดต่อจากนี้จะถูกบันทึกลงโฟลเดอร์ ${name}`);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.path}
            type="button"
            className="btn-secondary text-sm"
            disabled={busy === item.path}
            onClick={() => handleDownload(item)}
          >
            {busy === item.path ? "กำลังสร้างไฟล์..." : `⬇ ${item.label}`}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {supportsDirectorySave() ? (
          folder ? (
            <>
              <span>
                บันทึกลงโฟลเดอร์ <span className="font-medium text-slate-700">{folder}</span>
              </span>
              <button
                type="button"
                className="text-indigo-600 hover:underline"
                onClick={() => {
                  clearSaveFolder();
                  setFolder(null);
                  setMessage(null);
                }}
              >
                ยกเลิก
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="text-indigo-600 hover:underline"
                onClick={handleChooseFolder}
              >
                เลือกโฟลเดอร์สำหรับบันทึกไฟล์
              </button>
              <span>เลือกครั้งเดียว ไฟล์ถัดไปจะบันทึกลงโฟลเดอร์นั้นโดยไม่ถามซ้ำ</span>
            </>
          )
        ) : (
          <span>
            เบราว์เซอร์นี้ไม่รองรับการเลือกโฟลเดอร์ ไฟล์จะถูกบันทึกลงโฟลเดอร์ดาวน์โหลดตามปกติ
          </span>
        )}
      </div>

      {message && <p className="text-xs text-green-700">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
