import { z } from "zod";

const optionalString = (max) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max).optional().default("")
  );

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().url("Enter a valid URL").optional().default("")
);

const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().email("Enter a valid email address").toLowerCase().optional().default("")
);

const companyFields = {
  name: z.string().trim().min(2, "Company name must be at least 2 characters").max(120),
  logo: optionalUrl.or(optionalString(500)),
  website: optionalUrl,
  industry: z.string().trim().min(2, "Industry is required").max(120),
  size: z.enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]),
  address: optionalString(250),
  city: z.string().trim().min(2, "City is required").max(100),
  state: z.string().trim().min(2, "State is required").max(100),
  country: z.string().trim().min(2, "Country is required").max(100),
  postalCode: optionalString(30),
  description: optionalString(2000),
  contactEmail: optionalEmail,
  contactPhone: optionalString(30)
};

export const createCompanySchema = z.object(companyFields).strict();

export const updateCompanySchema = z
  .object(companyFields)
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one valid field is required"
  });
