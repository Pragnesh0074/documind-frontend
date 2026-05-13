import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocBot",
  description: "AI-Powered RAG System for your PDF documents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
