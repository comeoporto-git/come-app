"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice for COME AI, using the browser's own speech services (no extra cost):
 * dictation (speech → text) and reading answers aloud (text → speech).
 */

// The Web Speech API isn't in TypeScript's DOM types everywhere.
type SpeechResultList = { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: SpeechResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const LANG = "pt-PT";

/**
 * Dictation: start() listens; while speaking, `interim` shows the words so far;
 * when the person stops, onFinal gets the full text.
 */
export function useDictation(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

  useEffect(() => {
    // Known only in the browser, after the first render.
    const id = setTimeout(() => setSupported(!!recognitionClass()), 0);
    return () => clearTimeout(id);
  }, []);

  const start = useCallback(() => {
    const Rec = recognitionClass();
    if (!Rec) return;
    stopSpeaking();
    setError(null);
    finalRef.current = "";
    setInterim("");
    const rec = new Rec();
    rec.lang = LANG;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      const last = e.results[e.results.length - 1];
      if (last?.isFinal) finalRef.current = text;
      setInterim(text);
    };
    rec.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Sem acesso ao microfone — autoriza-o nas definições do browser." : e.error === "no-speech" ? null : `Erro no microfone (${e.error}).`);
    };
    rec.onend = () => {
      setListening(false);
      const text = (finalRef.current || "").trim();
      setInterim("");
      if (text) onFinalRef.current(text);
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, interim, error, start, stop };
}

/** What to read aloud: the answer's text without markdown, tables or cards. */
export function speakableText(answer: string): string {
  const cards = (answer.match(/\[\[sugestao:[0-9a-f-]{36}\]\]/gi) ?? []).length;
  const text = answer
    .replace(/\[\[sugestao:[0-9a-f-]{36}\]\]/gi, " ")
    .split("\n")
    .filter((l) => !l.trim().startsWith("|"))           // tables
    .join("\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")             // links → their text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const note = cards ? ` ${cards === 1 ? "Tens uma proposta" : `Tens ${cards} propostas`} para confirmar no ecrã.` : "";
  return `${text}${note}`.trim();
}

/** Reads text aloud in Portuguese (European voice when the device has one). */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = synth.getVoices();
  const voice = voices.find((v) => v.lang === "pt-PT") ?? voices.find((v) => v.lang?.startsWith("pt")) ?? null;
  // Long answers are read in sentences (some browsers cut long utterances).
  const parts = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  for (const p of parts) {
    const u = new SpeechSynthesisUtterance(p.trim());
    u.lang = voice?.lang ?? LANG;
    if (voice) u.voice = voice;
    u.rate = 1.05;
    synth.speak(u);
  }
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
