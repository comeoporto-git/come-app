"use client";

import { useCallback, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

function PlaidLinkInner({
  linkToken,
  onSuccess,
}: {
  linkToken: string;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const onPlaidSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { name?: string } | null }) => {
      setLoading(true);
      await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token: publicToken,
          institution_name: metadata?.institution?.name ?? "Crédito Agrícola",
        }),
      });
      setLoading(false);
      onSuccess();
      window.location.reload();
    },
    [onSuccess]
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess: onPlaidSuccess });

  return (
    <button
      onClick={() => open()}
      disabled={!ready || loading}
      className="text-xs bg-[#32373c] text-white font-semibold px-3 py-1.5 rounded-full hover:bg-[#1e2226] disabled:opacity-50 transition-colors"
    >
      {loading ? "A ligar…" : "Ligar Conta"}
    </button>
  );
}

export function PlaidConnectButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  async function start() {
    setFetching(true);
    const res = await fetch("/api/plaid/link-token", { method: "POST" });
    const data = await res.json();
    setLinkToken(data.link_token);
    setFetching(false);
  }

  if (linkToken) {
    return <PlaidLinkInner linkToken={linkToken} onSuccess={() => setLinkToken(null)} />;
  }

  return (
    <button
      onClick={start}
      disabled={fetching}
      className="text-xs bg-[#32373c] text-white font-semibold px-3 py-1.5 rounded-full hover:bg-[#1e2226] disabled:opacity-50 transition-colors"
    >
      {fetching ? "A carregar…" : "Ligar Conta"}
    </button>
  );
}
