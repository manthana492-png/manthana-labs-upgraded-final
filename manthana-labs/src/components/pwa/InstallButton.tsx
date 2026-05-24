import { useEffect, useState } from "react";
import { Download, Smartphone, Apple, Monitor, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "android" | "ios" | "desktop" | "macos" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIPad =
    /iPad/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
  if (/iPhone|iPod/.test(ua) || isIPad) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh/.test(ua)) return "macos";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

interface InstallButtonProps {
  variant?: "default" | "outline" | "secondary" | "ghost" | "hero";
  size?: "sm" | "default" | "lg";
  className?: string;
  label?: string;
}

export function InstallButton({
  variant = "default",
  size = "default",
  className,
  label = "Install App",
}: InstallButtonProps) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  const platform = detectPlatform();

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "accepted") {
          setInstalled(true);
        }
        setDeferred(null);
        return;
      } catch {
        /* fall through to instructions */
      }
    }
    setOpen(true);
  };

  const btnVariant = variant === "hero" ? "default" : variant;

  return (
    <>
      <Button
        variant={btnVariant as any}
        size={size}
        className={className}
        onClick={handleClick}
      >
        <Download className="mr-2 h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Install Manthana-Labs</DialogTitle>
            <DialogDescription>
              Get the native app experience on any device. Works offline-friendly,
              launches from your home screen, and runs full-screen.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue={platform === "other" ? "desktop" : platform}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="android">
                <Smartphone className="h-4 w-4 mr-1" />
                Android
              </TabsTrigger>
              <TabsTrigger value="ios">
                <Apple className="h-4 w-4 mr-1" />
                iOS
              </TabsTrigger>
              <TabsTrigger value="desktop">
                <Monitor className="h-4 w-4 mr-1" />
                Windows
              </TabsTrigger>
              <TabsTrigger value="macos">
                <Apple className="h-4 w-4 mr-1" />
                Mac
              </TabsTrigger>
            </TabsList>

            <TabsContent value="android" className="space-y-2 text-sm pt-3">
              <p className="font-medium">Chrome / Edge / Brave on Android</p>
              <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                <li>Tap the <span className="font-semibold">⋮ menu</span> in the top-right.</li>
                <li>Tap <span className="font-semibold">Install app</span> or <span className="font-semibold">Add to Home screen</span>.</li>
                <li>Confirm. The app will appear on your home screen and run like a native app.</li>
              </ol>
            </TabsContent>

            <TabsContent value="ios" className="space-y-2 text-sm pt-3">
              <p className="font-medium">Safari on iPhone / iPad</p>
              <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                <li>
                  Tap the <Share2 className="inline h-3.5 w-3.5" /> <span className="font-semibold">Share</span> button at the bottom (or top on iPad).
                </li>
                <li>Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.</li>
                <li>Tap <span className="font-semibold">Add</span>. Manthana-Labs will install as a full-screen app.</li>
              </ol>
              <p className="text-xs text-muted-foreground">Note: iOS requires Safari for installation. Chrome/Firefox on iOS won't show the option.</p>
            </TabsContent>

            <TabsContent value="desktop" className="space-y-2 text-sm pt-3">
              <p className="font-medium">Chrome / Edge on Windows or Linux</p>
              <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                <li>Look for the <span className="font-semibold">install icon</span> (⊕ or 🖥) in the address bar on the right.</li>
                <li>Click it, then click <span className="font-semibold">Install</span>.</li>
                <li>Or open the browser menu → <span className="font-semibold">Apps → Install Manthana-Labs</span>.</li>
              </ol>
              <p className="text-xs text-muted-foreground">The app gets a Start Menu shortcut, taskbar icon, and its own window.</p>
            </TabsContent>

            <TabsContent value="macos" className="space-y-2 text-sm pt-3">
              <p className="font-medium">Safari, Chrome, or Edge on macOS</p>
              <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                <li>
                  <span className="font-semibold">Safari:</span> File menu → <span className="font-semibold">Add to Dock…</span>
                </li>
                <li>
                  <span className="font-semibold">Chrome / Edge:</span> Click the install icon in the address bar, or menu → <span className="font-semibold">Install Manthana-Labs</span>.
                </li>
                <li>The app launches from Launchpad / Dock with its own window — just like a native Mac app.</li>
              </ol>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
