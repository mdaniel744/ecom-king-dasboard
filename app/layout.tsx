import { ClerkProvider } from '@clerk/nextjs';
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Ecom King Dashboard",
  description: "Multi-tenant store management dashboard",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ecom King",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#752eb8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="m-0 p-0">
          {children}
          <RegisterServiceWorker />
          <Toaster richColors position="top-right" closeButton />
        </body>
      </html>
    </ClerkProvider>
  );
}
