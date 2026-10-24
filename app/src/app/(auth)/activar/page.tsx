import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NO_SECRET_KEY_MESSAGE } from "@/lib/devices/messages";
import { MissingServiceKeyError, getLinkInfo } from "@/lib/devices/service";
import { deviceLinkTokenSchema } from "@/lib/validations/devices";
import { ActivateForm } from "./_components/activate-form";

export const instant = false;

// El token viaja en la URL: que no salga en el Referer ni se indexe.
export const metadata: Metadata = {
  title: "Vincular dispositivo",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-caja
      className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-10 sm:px-6"
    >
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card px-6 py-7 shadow-md sm:px-7">
        {children}
      </div>
    </main>
  );
}

export default async function ActivarPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = deviceLinkTokenSchema.safeParse(token);

  let info: Awaited<ReturnType<typeof getLinkInfo>> = null;
  let configError = false;
  if (valid.success) {
    try {
      info = await getLinkInfo(valid.data);
    } catch (e) {
      if (e instanceof MissingServiceKeyError) configError = true;
      else console.error("[activar] no se pudo leer el enlace");
    }
  }

  if (configError) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-foreground">Falta una configuración</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">{NO_SECRET_KEY_MESSAGE}</p>
      </Shell>
    );
  }

  if (!valid.success || !info) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-foreground">Este enlace ya no sirve</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Los enlaces de vinculación se usan una sola vez y vencen a los pocos minutos. Pide a un
          administrador que genere uno nuevo desde Personal.
        </p>
        <Button asChild variant="outline" className="mt-6 min-h-11 w-full">
          <Link href="/login">Ir al inicio de sesión</Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold text-foreground text-balance">
        Vincular este dispositivo a {info.restaurant_name}
      </h1>
      <p className="mt-2 text-body-sm text-muted-foreground">
        Después podrás entrar aquí solo con tu PIN. Ponle un nombre para reconocerlo en la lista.
      </p>
      <ActivateForm token={valid.data} suggestedName={info.suggested_name ?? ""} />
    </Shell>
  );
}
