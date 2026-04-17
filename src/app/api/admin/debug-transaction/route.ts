import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { auth } from "@/lib/auth";

/**
 * GET /api/admin/debug-transaction?id=<notion_page_id>
 * Returns the raw property names + file field values for a transaction page.
 * Admin only. Remove after debugging.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const page = (await notion.pages.retrieve({ page_id: id })) as PageObjectResponse;
    const props = page.properties as Record<string, unknown>;

    // Return all property names + any that look like files
    const summary: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(props)) {
      const v = value as Record<string, unknown>;
      if (v?.type === "files") {
        summary[name] = {
          type: "files",
          files: (v.files as Array<Record<string, unknown>>)?.map((f) => ({
            name: f.name,
            type: f.type,
            url: (f as Record<string, unknown>).type === "external"
              ? (f.external as Record<string, unknown>)?.url
              : (f.file as Record<string, unknown>)?.url,
          })),
        };
      } else {
        summary[name] = { type: v?.type };
      }
    }

    return NextResponse.json({ id, properties: summary });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
