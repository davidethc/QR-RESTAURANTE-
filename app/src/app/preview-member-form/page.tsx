import { notFound } from "next/navigation";
import { Geist } from "next/font/google";
import { MemberFormPreview } from "./preview";

const geist = Geist({ subsets: ["latin"] });

// TEMPORAL M00-T05: borrar esta carpeta antes de integrar el formulario.
export default function PreviewMemberFormPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div data-theme="admin" className="min-h-dvh bg-background p-6">
      <style>{`:root{--font-geist:${geist.style.fontFamily}}`}</style>
      <MemberFormPreview />
    </div>
  );
}
