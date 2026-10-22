import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Button } from "@/components/ui/button";
import { DEVICE_COOKIE } from "@/lib/devices/constants";
import { DEVICE_REVOKED_MESSAGE, NO_SECRET_KEY_MESSAGE } from "@/lib/devices/messages";
import { checkDevice, getRestaurantName } from "@/lib/devices/service";
import { PinPad } from "./_components/pin-pad";

export const instant = false;
export const metadata: Metadata = { title: "Ingresar con PIN" };

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px] rounded-card border border-border bg-card px-7 py-8 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-body-sm text-muted-foreground">{body}</p>
        <Button asChild className="mt-6 min-h-11 w-full">
          <Link href="/login">Iniciar sesión con correo</Link>
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
