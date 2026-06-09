import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OMNI-SEC | AI Smart Surveillance Dashboard",
  description: "AI-powered real-time surveillance system that recognizes objects, logs threat timeline telemetry, generates alarms, and compiles automated incident reports.",
  icons: {
    icon: "/favicon.ico",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
