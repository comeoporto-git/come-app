import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user?.role;
  if (role === "Guide")  redirect("/guide");
  if (role === "Chef")   redirect("/guide");
  if (role === "Driver") redirect("/guide");
  if (role === "Super Guide") redirect("/super-guide");
  if (role === "Accountant") redirect("/accountant");
  if (role === "Admin") redirect("/admin");

  redirect("/login");
}
