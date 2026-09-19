import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proctored Coding Platform",
  description: "Coding tests for web development students",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
