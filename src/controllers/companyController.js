import Company from "../models/Company.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  createCompanyForUser,
  getCompanyForUser,
  getCompanyOnboardingForUser,
  updateCompanyForUser
} from "../services/companyService.js";

export const createCompany = asyncHandler(async (req, res) => {
  const { company, user } = await createCompanyForUser(req.user.id, req.body);

  res.status(201).json(
    new ApiResponse(201, "Company profile created successfully", {
      company: company.toSafeObject(),
      user: user.toSafeObject()
    })
  );
});

export const getMyCompany = asyncHandler(async (req, res) => {
  const company = await getCompanyForUser(req.user.id);

  res.status(200).json(
    new ApiResponse(200, "Company profile fetched", {
      company: company.toSafeObject()
    })
  );
});

export const updateMyCompany = asyncHandler(async (req, res) => {
  const company = await updateCompanyForUser(req.user.id, req.body);

  res.status(200).json(
    new ApiResponse(200, "Company profile updated", {
      company: company.toSafeObject()
    })
  );
});

export const getCompanyOnboardingStatus = asyncHandler(async (req, res) => {
  const status = await getCompanyOnboardingForUser(req.user.id);

  res.status(200).json(new ApiResponse(200, "Company onboarding status fetched", status));
});

export const uploadCompanyLogo = asyncHandler(async (req, res) => {
  const company = await getCompanyForUser(req.user.id);
  company.logo = `/uploads/images/companies/${req.file.filename}`;
  await company.save();

  res.status(200).json(
    new ApiResponse(200, "Company logo uploaded", {
      company: company.toSafeObject()
    })
  );
});

export const getAdminCompanySummary = asyncHandler(async (_req, res) => {
  const companies = await Company.find({ isActive: true })
    .select("name slug logo industry size city state country createdAt")
    .sort({ createdAt: -1 })
    .limit(10);

  res.status(200).json(
    new ApiResponse(200, "Company summary fetched", {
      companies: companies.map((company) => company.toSafeObject())
    })
  );
});
