"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { signIn } from "@/lib/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

const inputClass =
  "h-12 rounded-xl bg-card px-3.5 text-body-lg md:text-body-lg aria-invalid:border-destructive";

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginInput) {
    startTransition(async () => {
      const result = await signIn(values.email, values.password);
      if (!result.ok) {
        setError("root", { message: result.error });
        return;
      }
      router.push("/today?entrada=1");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Correo</FieldLabel>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            aria-invalid={errors.email ? true : undefined}
            className={inputClass}
            {...register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? true : undefined}
            className={inputClass}
            {...register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>

        {errors.root?.message && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-money-out-border bg-money-out-soft px-4 py-3 text-body-sm font-medium text-money-out-soft-foreground"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {errors.root.message}
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={isPending}
          className="h-12 w-full rounded-xl bg-foreground text-body-lg font-semibold text-background hover:bg-foreground/90"
        >
          {isPending ? <Loader2 aria-hidden className="animate-spin" /> : <LogIn aria-hidden />}
          {isPending ? "Entrando…" : "Iniciar sesión"}
        </Button>
      </FieldGroup>
    </form>
  );
}
