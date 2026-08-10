"use client";

import { useState, useTransition } from "react";
import { connectInstagram } from "@/actions/social";

export function InstagramConnectForm() {
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [igBusinessAccountId, setIgBusinessAccountId] = useState("");
  const [fbPageId, setFbPageId] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await connectInstagram({ pageAccessToken, igBusinessAccountId, fbPageId });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div>
        <label className="text-xs font-semibold text-gray-500">Instagram Business Account ID</label>
        <input
          value={igBusinessAccountId}
          onChange={(e) => setIgBusinessAccountId(e.target.value)}
          required
          className="mt-1 w-full text-sm bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
          placeholder="17841400..."
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500">Facebook Page ID</label>
        <input
          value={fbPageId}
          onChange={(e) => setFbPageId(e.target.value)}
          required
          className="mt-1 w-full text-sm bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#667470]/30"
          placeholder="10015..."
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500">Page Access Token (de longa duração)</label>
        <textarea
          value={pageAccessToken}
          onChange={(e) => setPageAccessToken(e.target.value)}
          required
          rows={3}
          className="mt-1 w-full text-sm bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#667470]/30 resize-none font-mono text-xs"
          placeholder="EAAG..."
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Gera este token no Graph API Explorer da Meta, com as permissões pages_show_list, instagram_basic e
          instagram_manage_insights — sem qualquer permissão de publicação.
        </p>
      </div>
      <button
        type="submit"
        disabled={isPending || !pageAccessToken || !igBusinessAccountId}
        className="w-full bg-[#32373c] hover:bg-[#202427] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
      >
        {isPending ? "A ligar…" : "Ligar Instagram"}
      </button>
    </form>
  );
}
