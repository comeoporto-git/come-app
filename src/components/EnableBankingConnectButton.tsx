"use client";

export function EnableBankingConnectButton() {
  return (
    <a
      href="/api/enablebanking/connect"
      className="text-xs bg-[#32373c] text-white font-semibold px-3 py-1.5 rounded-full hover:bg-[#1a2018] active:scale-95 transition-all"
    >
      + Ligar Conta
    </a>
  );
}
