import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  getAdminCompanies,
  getAdminCompanyDetails,
  getAdminUserDetails,
  getAdminUsers,
  getAuditLogs,
  getPlatformOverview,
  getSystemHealth,
  updateCompanyAccountStatus,
  updateUserAccountStatus
} from "../services/adminAnalyticsService.js";

export const getAdminOverview = asyncHandler(async (_req, res) => {
  res.status(200).json(new ApiResponse(200, "Admin analytics overview fetched", await getPlatformOverview()));
});

export const listCompanies = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Admin companies fetched", await getAdminCompanies(req.query)));
});

export const getCompanyDetails = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Admin company details fetched", await getAdminCompanyDetails(req.params.id)));
});

export const updateCompanyStatus = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Company account status updated", { company: await updateCompanyAccountStatus(req.user.id, req.params.id, req.body) }));
});

export const listUsers = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Admin users fetched", await getAdminUsers(req.query)));
});

export const getUserDetails = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Admin user details fetched", await getAdminUserDetails(req.params.id)));
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "User account status updated", { user: await updateUserAccountStatus(req.user.id, req.params.id, req.body) }));
});

export const listAuditLogs = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, "Audit logs fetched", await getAuditLogs(req.query)));
});

export const getSystemHealthStatus = asyncHandler(async (_req, res) => {
  res.status(200).json(new ApiResponse(200, "System health fetched", await getSystemHealth()));
});
