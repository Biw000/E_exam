import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-3xl font-bold text-brand-700">E-Exam Online Examination System</h1>
      <p className="text-slate-600 text-center max-w-md">
        ระบบสอบออนไลน์พร้อมยืนยันตัวตนด้วยใบหน้า และตรวจจับความผิดปกติระหว่างสอบ
      </p>
      <div className="flex gap-4">
        <Link href="/login" className="btn-primary">
          เข้าสู่ระบบ
        </Link>
        <Link href="/register" className="btn-secondary">
          สมัครสมาชิก
        </Link>
      </div>
    </main>
  );
}
