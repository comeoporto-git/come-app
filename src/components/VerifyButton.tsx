"use client";

import { useTransition } from "react";
import { verifyTransactionAction } from "@/actions/transactions";

export function VerifyButton({
  transactionId,
  verified,
  disabled,
}: {
  transactionId: string;
  verified: boolean;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await verifyTransactionAction(transactionId, !verified);
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={disabled || pending}
      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
        verified
          ? "bg-green-500 text-white hover:bg-green-600"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      } disabled:opacity-50`}
    >
      {pending ? "…" : verified ? "✓ Verificado" : "Verificar"}
    </button>
  );
}
