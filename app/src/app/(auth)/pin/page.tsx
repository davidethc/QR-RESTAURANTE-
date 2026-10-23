import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Mail, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEVICE_COOKIE } from "@/lib/devices/constants";
import { DEVICE_REVOKED_MESSAGE, NO_SECRET_KEY_MESSAGE } from "@/lib/devices/messages";
import { checkDevice, getRestaurantName } from "@/lib/devices/service";
import { PinPad } from "./_components/pin-pad";

export const instant = false;
export const metadata: Metadata = { title: "Ingresar con PIN" };

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main
      data-caja
      className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-10 sm:px-6"
    >
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-card px-6 py-7 shadow-md sm:px-7">
        <span className="mb-4 flex size-12 items-center justify-center rounded-xl border border-attention-border bg-attention-soft text-attention-soft-foreground">
          <MonitorSmartphone aria-hidden className="size-6" />
        </span>
        <h1 className="text-title-lg font-bold leading-tight text-foreground">{title}</h1>
        <p className="mt-2 text-body text-muted-foreground">{body}</p>
        <Button
          asChild
          className="mt-6 h-12 w-full rounded-xl bg-foreground text-body-lg font-semibold text-background hover:bg-foreground/90"
        >
          <Link href="/login">
            <Mail aria-hidden />
            Iniciar sesión con correo
          </Link>
        </Button>
      </div>
    </main>
  );
}

export default async function PinPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const secret = (await cookies()).get(DEVICE_COOKIE)?.value;

  if (!secret) {
    return motivo === "revocado" ? (
      <Notice title="Dispositivo desvinculado" body={DEVICE_REVOKED_MESSAGE} />
    ) : (
      <Notice
        title="Este dispositivo no está vinculado"
        body="El acceso por PIN solo funciona en dispositivos vinculados. Un administrador puede vincularlo desde Personal."
      />
    );
  }

  const check = await checkDevice(secret);
  if (check.state === "revoked") {
    // La cookie no se puede borrar desde un Server Component; la limpia el
    // proxy en /staff y pinLoginAction al primer intento.
    return <Notice title="Dispositivo desvinculado" body={DEVICE_REVOKED_MESSAGE} />;
  }
  if (check.state === "unavailable") {
    return <Notice title="No se pudo comprobar el dispositivo" body={`${NO_SECRET_KEY_MESSAGE} Si ya está configurada, intenta de nuevo en un momento.`} />;
  }

  let restaurantName: string | null = null;
  try {
    restaurantName = await getRestaurantName(check.device.restaurant_id);
  } catch {
    restaurantName = null;
  }

  return <PinPad restaurantName={restaurantName} deviceName={check.device.name} />;
}
