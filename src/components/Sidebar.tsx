"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2, Monitor, Shield, Users, AlertOctagon, Settings,
  Clock, FileText, Search, Terminal, Activity,
  Calendar, TrendingUp, Briefcase, Film,
  Brain, Target, ClipboardCheck, Globe, MessageSquare,
  Keyboard, Timer, UserCog
} from "lucide-react";
import { cn } from "@/lib/utils";

type MenuItem = { icon: any; label: string; href: string } | { divider: string };

const menuItems: MenuItem[] = [
  { icon: BarChart2, label: "Intelligence", href: "/" },
  { icon: Monitor, label: "Live Stream", href: "/live" },
  { icon: Film, label: "Recordings", href: "/recordings" },
  { divider: "Workforce" },
  { icon: Users, label: "Personnel", href: "/employees" },
  { icon: Clock, label: "Timesheets", href: "/timesheets" },
  { icon: Calendar, label: "Attendance", href: "/attendance" },
  { icon: TrendingUp, label: "Productivity", href: "/productivity" },
  { icon: Timer, label: "Screen Time", href: "/screen-time" },
  { divider: "Analytics" },
  { icon: Brain, label: "Behavior Intel", href: "/behavior" },
  { icon: Target, label: "Insider Threats", href: "/insider-threats" },
  { icon: Globe, label: "Web Monitoring", href: "/web-monitoring" },
  { icon: MessageSquare, label: "Comms Sentinel", href: "/communications" },
  { icon: Keyboard, label: "Keystrokes", href: "/keystrokes" },
  { divider: "Security" },
  { icon: AlertOctagon, label: "Alert Feed", href: "/alerts" },
  { icon: Shield, label: "DLP Policies", href: "/dlp" },
  { icon: Activity, label: "Trigger Log", href: "/trigger-log" },
  { icon: ClipboardCheck, label: "Compliance", href: "/compliance" },
  { divider: "Tools" },
  { icon: Search, label: "OCR Search", href: "/ocr" },
  { icon: FileText, label: "Reports", href: "/reports" },
  { icon: UserCog, label: "Profiles", href: "/profiles" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <aside className="fixed left-0 top-0 h-screen w-[240px] bg-[#0a0a0b] border-r border-white/5 flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#10b981] flex items-center justify-center">
            <Terminal className="w-4 h-4 text-black" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white tracking-tighter uppercase italic leading-none">HBOSE</h1>
            <p className="text-[8px] font-black text-[#10b981] uppercase tracking-[0.3em] mt-0.5">Command Node</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 custom-scrollbar">
        <div className="space-y-0.5 px-3">
          {menuItems.map((item, idx) => {
            if ("divider" in item) {
              return (
                <div key={`div-${item.divider}`} className={`pt-4 pb-2 ${idx > 0 ? "mt-2" : ""}`}>
                  <span className="text-[8px] font-black text-gray-700 uppercase tracking-[0.4em] px-4">{item.divider}</span>
                </div>
              );
            }
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.15em] transition-all group",
                  isActive
                    ? "bg-[#10b981]/10 text-[#10b981] border-l-2 border-[#10b981]"
                    : "text-gray-600 hover:text-white hover:bg-white/[0.03] border-l-2 border-transparent"
                )}
              >
                <item.icon className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-[#10b981]" : "text-gray-700 group-hover:text-gray-400")} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-3">
          <div className="w-1.5 h-1.5 bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">System Active</span>
        </div>
      </div>
    </aside>
  );
}
