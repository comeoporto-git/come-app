import { redirect } from "next/navigation";

// The brand brief now lives in the one company guide ("Marca e redes sociais").
export default function BrandBriefPage() {
  redirect("/admin/guia#marca-e-redes-sociais");
}
