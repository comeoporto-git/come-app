import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { auth } from "@/lib/auth";

const TRANSACTIONS_DB = process.env.NOTION_TRANSACTIONS_DB_ID!;

/**
 * GET /api/admin/debug-transaction?tourId=<tour_id_from_url>
 *
 * Pass the tour ID from the browser URL (e.g. /guide/tours/31917fed-...).
 * Returns all transactions for that tour with their Notion property names
 * and any file field values so we can identify the correct field name.
 * Admin only. Remove after debugging.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "Admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tourId = searchParams.get("tourId");
  if (!tourId) {
    return NextResponse.json({ error: "Pass ?tourId=<id from the tour URL>" }, { status: 400 });
  }

  try {
    const res = await notion.databases.query({
      database_id: TRANSACTIONS_DB,
      filter: { property: "🎫 Sales", relation: { contains: tourId } },
    } as Parameters<typeof notion.databases.query>[0]);

    const transactions = (res.results as PageObjectResponse[]).map((page) => {
      const props = page.properties as Record<string, unknown>;

      // Collect every property: just its type for most, full detail for files
      const propSummary: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(props)) {
        const v = value as Record<string, unknown>;
        if (v?.type === "files") {
          const files = (v.files as Array<Record<string, unknown>>) ?? [];
          propSummary[name] = {
            type: "files",
            count: files.length,
            files: files.map((f) => ({
              name: f.name,
              fileType: f.type,
              url: f.type === "external"
                ? (f.external as Record<string, unknown>)?.url
                : (f.file as Record<string, unknown>)?.url,
            })),
          };
        } else {
          propSummary[name] = String(v?.type ?? "unknown");
        }
      }

      // Also pull the title for readability
      const titleProp = Object.values(props).find(
        (p) => (p as Record<string, unknown>)?.type === "title"
      ) as Record<string, unknown> | undefined;
      const title = (titleProp?.title as Array<{ plain_text: string }>)?.[0]?.plain_text ?? "";

      return { id: page.id, title, properties: propSummary };
    });

    return NextResponse.json({ tourId, count: transactions.length, transactions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
