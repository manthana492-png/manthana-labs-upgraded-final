import { Link, NavLink, useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/lib/store";
import {
  LayoutGrid,
  History,
  Settings,
  LogOut,
  Plus,
  ChevronDown,
  CreditCard,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { QuotaChip } from "@/components/billing/QuotaChip";

const NAV = [
  { to: "/app", label: "Studio", icon: LayoutGrid, end: true },
  { to: "/app/history", label: "Worklist", icon: History },
  { to: "/app/billing", label: "Billing", icon: CreditCard },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { doctor, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-paper">
      {/* Top nav — desktop & mobile combined */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link to="/app" className="focus-ring rounded-md">
            <Logo />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-ring",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" strokeWidth={2.2} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => navigate("/app/new")}
              className="hidden sm:inline-flex bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New study
            </Button>
            <Button
              size="icon"
              onClick={() => navigate("/app/new")}
              className="sm:hidden bg-primary text-primary-foreground hover:bg-primary/90"
              aria-label="New study"
            >
              <Plus className="h-4 w-4" />
            </Button>

            <QuotaChip />

            <ThemeSwitcher />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="focus-ring flex items-center gap-2 rounded-full pr-2 pl-1 py-1 hover:bg-accent/50 transition">
                  <div className="h-8 w-8 rounded-full bg-gradient-clinical text-primary-foreground flex items-center justify-center text-xs font-semibold">
                    {doctor?.fullName?.split(" ").slice(-2).map((s) => s[0]).join("") ?? "DR"}
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1.5">
                  <div className="text-sm font-medium">{doctor?.fullName}</div>
                  <div className="text-xs text-muted-foreground truncate">{doctor?.email}</div>
                  <div className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
                    {doctor?.councilNumber}
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/app/billing")}>
                  <CreditCard className="h-4 w-4 mr-2" /> Plan &amp; Billing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/app/settings")}>
                  <Settings className="h-4 w-4 mr-2" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    signOut();
                    navigate("/login");
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container py-6 md:py-10 pb-28 md:pb-10">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/70 bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[0.65rem] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5" strokeWidth={2.2} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
