import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[a-z]/, "Password must include at least one lowercase letter")
  .regex(/[0-9]/, "Password must include at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must include at least one special character");

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(80).optional(),
    phone: z.string().trim().max(30).optional().default(""),
    profileImage: z.string().trim().max(500).optional().default("")
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one valid profile field is required"
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmNewPassword: z.string()
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "New passwords must match",
    path: ["confirmNewPassword"]
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"]
  });
