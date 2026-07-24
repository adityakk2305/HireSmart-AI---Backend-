import mongoose from "mongoose";
import Company from "../models/Company.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "company";

export const generateUniqueCompanySlug = async (name, excludeCompanyId = null) => {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let suffix = 1;

  while (
    await Company.exists({
      slug,
      ...(excludeCompanyId ? { _id: { $ne: excludeCompanyId } } : {})
    })
  ) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  return slug;
};

export const ensureHRHasNoCompany = async (userId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.role !== "hr") {
    throw new ApiError(403, "Only HR users can create a company profile");
  }

  if (user.companyId || (await Company.exists({ createdBy: user._id }))) {
    throw new ApiError(409, "Company profile already exists for this HR account");
  }

  return user;
};

export const attachCompanyToUser = async (userId, companyId, session = null) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { companyId },
    { new: true, runValidators: true, session }
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
};

const createCompanyWithoutTransaction = async (userId, payload) => {
  const user = await ensureHRHasNoCompany(userId);
  const slug = await generateUniqueCompanySlug(payload.name);
  let company;

  try {
    company = await Company.create({
      ...payload,
      slug,
      createdBy: user._id
    });

    const updatedUser = await attachCompanyToUser(user._id, company._id);
    return { company, user: updatedUser };
  } catch (error) {
    if (company?._id) {
      await Company.findByIdAndDelete(company._id);
    }
    throw error;
  }
};

export const createCompanyForUser = async (userId, payload) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const user = await ensureHRHasNoCompany(userId);
      const slug = await generateUniqueCompanySlug(payload.name);
      const [company] = await Company.create(
        [
          {
            ...payload,
            slug,
            createdBy: user._id
          }
        ],
        { session }
      );
      const updatedUser = await attachCompanyToUser(user._id, company._id, session);
      result = { company, user: updatedUser };
    });

    return result;
  } catch (error) {
    if (
      error.message?.includes("Transaction numbers") ||
      error.message?.includes("replica set") ||
      error.message?.includes("Transaction")
    ) {
      return createCompanyWithoutTransaction(userId, payload);
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

export const getCompanyForUser = async (userId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.companyId) {
    throw new ApiError(404, "Company onboarding is required");
  }

  const company = await Company.findOne({
    _id: user.companyId,
    createdBy: user._id,
    isActive: true
  });

  if (!company) {
    throw new ApiError(404, "Company not found");
  }

  return company;
};

export const updateCompanyForUser = async (userId, payload) => {
  const company = await getCompanyForUser(userId);
  const updates = { ...payload };

  if (updates.name && updates.name !== company.name) {
    updates.slug = await generateUniqueCompanySlug(updates.name, company._id);
  }

  Object.assign(company, updates);
  await company.save();
  return company;
};

export const getCompanyOnboardingForUser = async (userId) => {
  const user = await User.findById(userId);
  const hasCompany = Boolean(user?.companyId);

  return {
    requiresCompanyOnboarding: !hasCompany,
    hasCompany,
    companyId: user?.companyId || null
  };
};
