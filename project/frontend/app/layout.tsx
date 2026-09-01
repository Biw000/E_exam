import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "E-Exam Online Examination System",
  description: "Online exam platform with face verification and anti-cheat monitoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
