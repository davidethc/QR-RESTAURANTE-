import {
  saveMemberSchema,
  type MemberRole,
  type SaveMemberInput,
} from "@/lib/validations/staff";

export type MemberFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  active: boolean;
  roles: MemberRole[];
  cashRegisterIds: string[];
};
export type MemberFormInitial = MemberFormValues & {
  memberId: string;
  /** null means the caller has no presence information; never pass a hash. */
  hasPin: boolean | null;
};
export type MemberFormInput = Omit<
  SaveMemberInput,
  "memberId" | "pin" | "password" | "cashRegisterIds"
> &
  Partial<
    Pick<SaveMemberInput, "memberId" | "pin" | "password" | "cashRegisterIds">
  >;
export type MemberFormField = keyof MemberFormValues | "pin" | "password";
export type MemberFormErrors = Partial<Record<MemberFormField, string>>;

export function memberFormInput(
  values: MemberFormValues,
  credentials: { pin: string; password: string },
  memberId?: string,
): MemberFormInput {
  return {
    ...(memberId ? { memberId } : {}),
    fullName: `${values.firstName.trim()} ${values.lastName.trim()}`,
    roles: values.roles,
    active: values.active,
    emailLoginEnabled: true,
    email: values.email.trim(),
    ...(values.roles.includes("CASHIER")
      ? { cashRegisterIds: values.cashRegisterIds }
      : {}),
    ...(!memberId || credentials.pin ? { pin: credentials.pin } : {}),
    ...(!memberId || credentials.password
      ? { password: credentials.password }
      : {}),
  };
}

export function memberFormErrors(
  values: MemberFormValues,
  input: MemberFormInput,
  hasPin: boolean | null,
): MemberFormErrors {
  const errors: MemberFormErrors = {};
  const result = saveMemberSchema.safeParse(input);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] === "fullName" ? "firstName" : issue.path[0];
      if (
        typeof field === "string" &&
        [
          "firstName",
          "roles",
          "active",
          "email",
          "password",
          "pin",
          "cashRegisterIds",
        ].includes(field)
      ) {
        errors[field as MemberFormField] ??= issue.message;
      }
    }
  }
  if (!values.firstName.trim()) errors.firstName = "Completa este campo.";
  if (!values.lastName.trim()) errors.lastName = "Completa este campo.";
  if (hasPin === false && !input.pin)
    errors.pin = "Asigna un PIN de 4 dígitos.";
  return errors;
}

/** ActionResult currently exposes a single message, not structured field errors. */
export function memberServerErrorField(
  message: string,
): MemberFormField | undefined {
  if (/\bPIN\b/i.test(message)) return "pin";
  if (/\bcorreo\b/i.test(message)) return "email";
  if (/\bclave\b|contraseña/i.test(message)) return "password";
  if (/\bcajas?\b/i.test(message)) return "cashRegisterIds";
  if (/\broles?\b/i.test(message)) return "roles";
  if (/\bnombre\b|100 caracteres/i.test(message)) return "firstName";
  if (/\bactivo\b/i.test(message)) return "active";
}
