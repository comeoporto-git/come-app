import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `Find 2-3 real people who work at "PLMJ" (law firm, Portugal). Return ONLY a JSON array:\n[{"name":"Full Name","role":"Job Title","email":"or empty","linkedin_url":""}]`
    }],
  });

  console.log("stop_reason:", response.stop_reason);
  for (const block of response.content) {
    console.log("block type:", block.type);
    if (block.type === "text") console.log("text:", block.text.slice(0, 500));
  }
}
main().catch(console.error);
