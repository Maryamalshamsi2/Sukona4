import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sukona",
  description: "Beauty business management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#F5F5F7] text-[#1D1D1F] antialiased font-sans">{children}</body>
    </html>
  );
}
