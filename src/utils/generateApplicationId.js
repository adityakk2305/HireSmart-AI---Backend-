import crypto from "crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const randomSuffix = (length = 6) => {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};

export const generateApplicationId = async (CandidateModel, date = new Date()) => {
  const year = date.getFullYear();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const applicationId = `HSA-${year}-${randomSuffix()}`;
    const exists = await CandidateModel.exists({ applicationId });

    if (!exists) {
      return applicationId;
    }
  }

  throw new Error("Unable to generate a unique application ID");
};
