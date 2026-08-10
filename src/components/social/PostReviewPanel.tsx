"use client";

import { useState, useTransition } from "react";
import { addPostComment, setPostCopyStatus } from "@/actions/social";

export type PostComment = { id: string; author_type: "owner" | "ai"; body: string; created_at: string };

export function PostReviewPanel({
  postId,
  status,
  comments,
}: {
  postId: string;
  status: string;
  comments: PostComment[];
}) {
  const [text, setText] = useState("");
  const [isSending, startSend] = useTransition();
  const [isToggling, startToggle] = useTransition();

  function submitComment() {
    const body = text.trim();
    if (!body || isSending) return;
    setText("");
    startSend(async () => {
      await addPostComment(postId, body);
    });
  }

  function toggleApproval() {
    startToggle(async () => {
      await setPostCopyStatus(postId, status === "approved" ? "in_review" : "approved");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Conversa de revisão</p>
        <button
          type="button"
          onClick={toggleApproval}
          disabled={isToggling}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 ${
            status === "approved"
              ? "bg-white/10 text-white/60 hover:bg-white/15"
              : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }`}
        >
          {status === "approved" ? "↺ Reverter aprovação" : "Aprovar copy"}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[420px] min-h-[160px]">
          {comments.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">
              Sem comentários ainda. Escreve o que gostarias de mudar na legenda.
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className={`flex ${c.author_type === "owner" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] text-[13px] leading-relaxed px-3 py-2 rounded-xl break-words whitespace-pre-wrap ${
                    c.author_type === "owner"
                      ? "bg-[#111514] text-white rounded-br-sm"
                      : "bg-[#f5f5f0] text-[#32373c] rounded-bl-sm"
                  }`}
                >
                  {c.body}
                </div>
              </div>
            ))
          )}
          {isSending && (
            <div className="flex justify-start">
              <div className="bg-[#f5f5f0] text-[#32373c]/50 text-[13px] px-3 py-2 rounded-xl rounded-bl-sm">
                A rever a legenda…
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-3 flex items-end gap-2">
          <textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitComment();
              }
            }}
            placeholder="O que gostarias de mudar na legenda?"
            disabled={isSending}
            className="flex-1 resize-none text-[13px] bg-gray-50 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-[#667470]/30 disabled:opacity-50 min-h-[38px] max-h-[120px]"
          />
          <button
            type="button"
            onClick={submitComment}
            disabled={isSending || !text.trim()}
            className="flex-none text-xs font-semibold bg-[#32373c] hover:bg-[#202427] text-white px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
