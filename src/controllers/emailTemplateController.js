import EmailTemplate from "../models/EmailTemplate.js";
import ApiResponse from "../utils/ApiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  ensureUserCompany,
  generateTextFallback,
  getDefaultTemplateForCategory,
  getOwnedTemplate,
  previewTemplate as previewTemplateService,
  sanitizeTemplateHtml,
  seedDefaultEmailTemplatesForCompany,
  slugifyTemplate,
  validateTemplateVariables
} from "../services/emailTemplateService.js";

const templatePayload = (template) => template.toSafeObject();

export const createTemplate = asyncHandler(async (req, res) => {
  const { user, company } = await ensureUserCompany(req.user.id);
  const htmlBody = sanitizeTemplateHtml(req.body.htmlBody);
  const textBody = req.body.textBody?.trim() || generateTextFallback(htmlBody);
  const availableVariables = validateTemplateVariables(req.body.subject, htmlBody, textBody);
  const template = await EmailTemplate.create({
    ...req.body,
    companyId: company._id,
    slug: slugifyTemplate(req.body.slug || req.body.name),
    htmlBody,
    textBody,
    availableVariables,
    isDefault: false,
    createdBy: user._id,
    updatedBy: user._id
  });
  res.status(201).json(new ApiResponse(201, "Email template created", { template: templatePayload(template) }));
});

export const getTemplates = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  await seedDefaultEmailTemplatesForCompany(company._id, req.user.id);
  const filter = { companyId: company._id };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.isActive) filter.isActive = req.query.isActive === "true";
  if (req.query.search) {
    const regex = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: regex }, { slug: regex }, { subject: regex }];
  }
  const templates = await EmailTemplate.find(filter).sort({ category: 1, isDefault: -1, name: 1 });
  res.status(200).json(new ApiResponse(200, "Email templates fetched", { templates: templates.map(templatePayload) }));
});

export const getTemplateById = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  const template = await getOwnedTemplate(company._id, req.params.id);
  res.status(200).json(new ApiResponse(200, "Email template fetched", { template: templatePayload(template) }));
});

export const updateTemplate = asyncHandler(async (req, res) => {
  const { user, company } = await ensureUserCompany(req.user.id);
  const template = await getOwnedTemplate(company._id, req.params.id);
  const next = { ...template.toObject(), ...req.body };
  const htmlBody = req.body.htmlBody !== undefined ? sanitizeTemplateHtml(req.body.htmlBody) : template.htmlBody;
  const textBody = req.body.textBody !== undefined ? (req.body.textBody.trim() || generateTextFallback(htmlBody)) : template.textBody;
  const availableVariables = validateTemplateVariables(next.subject, htmlBody, textBody);

  template.set({
    ...req.body,
    slug: req.body.slug ? slugifyTemplate(req.body.slug) : template.slug,
    htmlBody,
    textBody,
    availableVariables,
    version: template.version + 1,
    updatedBy: user._id
  });
  await template.save();
  res.status(200).json(new ApiResponse(200, "Email template updated", { template: templatePayload(template) }));
});

export const duplicateTemplate = asyncHandler(async (req, res) => {
  const { user, company } = await ensureUserCompany(req.user.id);
  const source = await getOwnedTemplate(company._id, req.params.id);
  const template = await EmailTemplate.create({
    companyId: company._id,
    name: `${source.name} Copy`,
    slug: `${source.slug}-copy-${Date.now()}`,
    category: source.category,
    subject: source.subject,
    htmlBody: source.htmlBody,
    textBody: source.textBody,
    availableVariables: source.availableVariables,
    isDefault: false,
    isActive: true,
    createdBy: user._id,
    updatedBy: user._id
  });
  res.status(201).json(new ApiResponse(201, "Email template duplicated", { template: templatePayload(template) }));
});

export const deleteTemplate = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  const template = await getOwnedTemplate(company._id, req.params.id);
  if (template.isDefault) {
    template.isActive = false;
    await template.save();
    return res.status(200).json(new ApiResponse(200, "Default template disabled", { template: templatePayload(template) }));
  }
  await template.deleteOne();
  return res.status(200).json(new ApiResponse(200, "Email template deleted", { id: req.params.id }));
});

export const previewTemplate = asyncHandler(async (req, res) => {
  const { company } = await ensureUserCompany(req.user.id);
  const template = req.body.templateId ? await getOwnedTemplate(company._id, req.body.templateId) : null;
  const preview = previewTemplateService({ template, payload: req.body });
  res.status(200).json(new ApiResponse(200, "Email template preview generated", { preview }));
});

export const resetDefaultTemplate = asyncHandler(async (req, res) => {
  const { user, company } = await ensureUserCompany(req.user.id);
  const template = await getOwnedTemplate(company._id, req.params.id);
  const defaults = getDefaultTemplateForCategory(template.category);
  if (!defaults) {
    return res.status(400).json(new ApiResponse(400, "No default template exists for this category"));
  }
  const htmlBody = sanitizeTemplateHtml(defaults.htmlBody);
  const textBody = defaults.textBody || generateTextFallback(htmlBody);
  template.set({
    ...defaults,
    htmlBody,
    textBody,
    availableVariables: validateTemplateVariables(defaults.subject, htmlBody, textBody),
    isDefault: true,
    isActive: true,
    version: template.version + 1,
    updatedBy: user._id
  });
  await template.save();
  res.status(200).json(new ApiResponse(200, "Default email template reset", { template: templatePayload(template) }));
});
