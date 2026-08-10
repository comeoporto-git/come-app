"use client";

import { setPostCategory } from "@/actions/social";
import { CategorySelect } from "@/components/social/CategorySelect";

export function PostCategoryPicker({ postId, category }: { postId: string; category: string | null }) {
  return <CategorySelect value={category} onChange={(next) => setPostCategory(postId, next)} />;
}
