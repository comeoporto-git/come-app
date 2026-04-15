"use client";

import { useEffect, useState } from "react";

// Chrome fires this before showing its own install prompt.
// We intercept it so we can show our own button at any time.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

const DISMISSED_KEY = "pwa-install-dismissed";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [hidden, setHidden] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    // Already installed or dismissed this session
    if (isInStandaloneMode()) return;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    if (isIOS()) {
      setShowIOSBanner(true);
      setHidden(false);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setHidden(false);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setHidden(true));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setHidden(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setHidden(true);
    setDeferredPrompt(null);
  }

  if (hidden) return null;

  // iOS — manual instructions banner
  if (showIOSBanner) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2">
        <div className="max-w-lg mx-auto bg-[#32373c] text-white rounded-2xl p-4 shadow-2xl flex items-start gap-3">
          <span className="text-2xl shrink-0 mt-0.5">📱</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Instalar no iPhone</p>
            <p className="text-xs text-white/70 mt-1 leading-relaxed">
              Toca em <strong>Partilhar</strong> <span className="text-base">⎙</span> e depois em{" "}
              <strong>"Adicionar ao Ecrã de Início"</strong>
            </p>
          </div>
          <button
            onClick={dismiss}
            className="text-white/50 hover:text-white text-lg leading-none shrink-0 p-1"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // Android / Chrome — native install prompt
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2">
      <div className="max-w-lg mx-auto bg-[#32373c] text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3">
        <span className="text-2xl shrink-0">📲</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Instalar App</p>
          <p className="text-xs text-white/70 mt-0.5">Adiciona ao ecrã de início</p>
        </div>
        <button
          onClick={dismiss}
          className="text-white/50 hover:text-white text-sm shrink-0 px-2"
          aria-label="Fechar"
        >
          ✕
        </button>
        <button
          onClick={install}
          className="bg-[#667470] hover:bg-[#7b8b87] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shrink-0"
        >
          Instalar
        </button>
      </div>
    </div>
  );
}
