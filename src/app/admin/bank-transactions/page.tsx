import { redirect } from "next/navigation";

export default function BankTransactionsRedirect() {
  redirect("/accountant?tab=movimentos");
}
