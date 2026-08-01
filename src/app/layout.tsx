import type { Metadata } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AlertProvider } from "@/components/AlertProvider";

const firaSans = Fira_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: '--font-inter' });
const firaCode = Fira_Code({ subsets: ["latin"], variable: '--font-mono' });

export const metadata: Metadata = {
  title: "HBOSE | Tactical Command Node",
  description: "HBOSE — Enterprise Behavioral Intelligence & DLP Network.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${firaSans.variable} ${firaCode.variable} dark`}>
      <body className="bg-[#050505] text-white min-h-screen antialiased selection:bg-[#10b981] selection:text-black">
        <AlertProvider>
          <div className="flex">
            <Sidebar />
            <main className="flex-1 pl-64 min-h-screen relative">
              {/* Tactical Scanner Effect Overlay */}
              <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.03] grid-bg" />

              <div className="relative z-10 p-12 max-w-[1920px] mx-auto min-h-screen">
                {children}

                {/* Footer HUD */}
                <footer className="mt-32 pt-12 border-t border-white/5 flex justify-between items-center text-[9px] font-black text-gray-700 uppercase tracking-[0.3em]">
                  <div>System: HBOSE_OS v6.0</div>
                  <div className="flex gap-8">
                    <span>Encryption: AES-256-GCM</span>
                    <span>Latency: 2ms</span>
                    <span>Auth: Secured</span>
                  </div>
                </footer>
              </div>
            </main>
          </div>
        </AlertProvider>
      </body>
    </html>
  );
}
