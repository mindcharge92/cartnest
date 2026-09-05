import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppHeader } from "../components/app-header";
import { SessionProvider } from "../components/session-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CartNest",
  description: "Multi-vendor e-commerce marketplace for Nigerian businesses.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <AppHeader />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
