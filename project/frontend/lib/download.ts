import { getToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * File downloads for the admin pages.
 *
 * Two modes. By default a file goes to the browser's Downloads folder like any
 * other download. If the admin picks a folder once, later exports are written
 * straight into it with no save dialog.
 *
 * What a web page CANNOT do, and this deliberately does not pretend to: create
 * a folder on the admin's machine on its own, or write anywhere without the
 * person having chosen that location. The File System Access API exists exactly
 * so the choice stays with the user, and it only works in Chromium browsers.
 */

type DirHandle = any; // FileSystemDirectoryHandle, not in the TS lib target yet

let directoryHandle: DirHandle | null = null;

export function supportsDirectorySave(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function hasSaveFolder(): boolean {
  return directoryHandle !== null;
}

/** Ask the admin to choose a folder. Returns its name, or null if cancelled. */
export async function chooseSaveFolder(): Promise<string | null> {
  if (!supportsDirectorySave()) return null;
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: "readwrite" });
    directoryHandle = handle;
    return handle.name ?? "โฟลเดอร์ที่เลือก";
  } catch {
    // The picker throws when the user cancels; that is not an error.
    return null;
  }
}

export function clearSaveFolder() {
  directoryHandle = null;
}

/** Pull the filename out of Content-Disposition, falling back to a default. */
function filenameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : fallback;
}

/**
 * Download a CSV from the API. Writes into the chosen folder when there is one,
 * otherwise falls back to a normal browser download.
 */
export async function downloadCsv(path: string, fallbackName: string): Promise<string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* the error body may not be JSON */
    }
    throw new Error(detail);
  }

  const blob = await res.blob();
  const name = filenameFrom(res.headers.get("Content-Disposition"), fallbackName);

  if (directoryHandle) {
    try {
      const fileHandle = await directoryHandle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return name;
    } catch {
      // Permission can lapse when the tab is reopened. Drop the handle and let
      // the normal download path below take over rather than failing.
      directoryHandle = null;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return name;
}
