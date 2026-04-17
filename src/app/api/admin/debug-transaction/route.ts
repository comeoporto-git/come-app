import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { auth } from "@/lib/auth";

const TRANSACTIONS_DB = process.env.NOTION_TRANSACTIONS_DB_ID!;

/**
 * GET /api/admin/debug-transaction?tourId=<tour_id_from_url>
 * Returns ONLY the file-type fields + all property names for each transaction.
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
    return NextResponse.json(
      { error: "Pass ?tourId=<id from the tour URL>" },
      { status: 400 }
    );
  }

  const res = await notion.databases.query({
    database_id: TRANSACTIONS_DB,
    filter: { property: "🎫 Sales", relation: { contains: tourId } },
  } as Parameters<typeof notion.databases.query>[0]);

  const transactions = (res.results as PageObjectResponse[]).map((page) => {
    const props = page.properties as Record<string, unknown>;

    // Every property name in this DB (so we know all field names)
    const allFieldNames = Object.keys(props).sort();

    // Only the files fields with their content
    const fileFields: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(props)) {
      const v = value as Record<string, unknown>;
      if (v?.type === "files") {
        const files = (v.files as Array<Record<string, unknown>>) ?? [];
        fileFields[name] = files.length === 0
          ? "(empty)"
          : files.map((f) => ({
              fileType: f.type,
              url: f.type === "external"
                ? (f.external as Record<string, unknown>)?.url
                : "(notion-hosted)",
            }));
      }
    }

    // Supplier name from title
    const titleProp = Object.values(props).find(
      (p) => (p as Record<string, unknown>)?.type === "title"
    ) as Record<string, unknown> | undefined;
    const title =
      (titleProp?.title as Array<{ plain_text: string }>)?.[0]?.plain_text ?? "(no title)";

    return {
      id: page.id,
      supplier: title,
      allFieldNames,
      fileFields,
    };
  });

  return NextResponse.json({ tourId, count: transactions.length, transactions }, { status: 200 });
}
