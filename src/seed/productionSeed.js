import { connectDB, closeDB } from "../config/db.js";
import env, { validateEnv } from "../config/env.js";
import Company from "../models/Company.js";
import Job from "../models/Job.js";
import User from "../models/User.js";

const required = (name, fallback = "") => process.env[name] || fallback;

const main = async () => {
  validateEnv();
  await connectDB(env.mongoUri);

  const adminEmail = required("SEED_ADMIN_EMAIL", "admin@hiresmart.com").toLowerCase();
  const adminPassword = required("SEED_ADMIN_PASSWORD");
  const hrEmail = required("SEED_HR_EMAIL", "hr@hiresmart.com").toLowerCase();
  const hrPassword = required("SEED_HR_PASSWORD");

  if (!adminPassword || !hrPassword) {
    throw new Error("SEED_ADMIN_PASSWORD and SEED_HR_PASSWORD are required for production seed.");
  }

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: "HireSmart Admin",
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      accountStatus: "Active",
      isActive: true
    });
  }

  let hr = await User.findOne({ email: hrEmail });
  if (!hr) {
    hr = await User.create({
      name: "Demo HR Manager",
      email: hrEmail,
      password: hrPassword,
      role: "hr",
      accountStatus: "Active",
      isActive: true
    });
  }

  const company = await Company.findOneAndUpdate(
    { slug: "hiresmart-production-demo" },
    {
      $setOnInsert: {
        name: "HireSmart Production Demo",
        slug: "hiresmart-production-demo",
        industry: "Technology",
        size: "11-50",
        city: "Bengaluru",
        state: "Karnataka",
        country: "India",
        contactEmail: hrEmail,
        createdBy: hr._id,
        accountStatus: "Active",
        isActive: true,
        description: "Production-safe demo tenant for validating deployment readiness."
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  hr.companyId = company._id;
  await hr.save({ validateBeforeSave: false });

  const jobs = [
    {
      title: "Product Engineer",
      department: "Engineering",
      requiredSkills: ["React", "Node.js", "MongoDB"],
      preferredSkills: ["DevOps", "Testing"]
    },
    {
      title: "Talent Operations Specialist",
      department: "People",
      requiredSkills: ["Recruiting", "Interview Coordination", "Analytics"],
      preferredSkills: ["Employer Branding"]
    }
  ];

  for (const job of jobs) {
    const slug = `${company.slug}-${job.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
    await Job.findOneAndUpdate(
      { publicApplicationSlug: slug },
      {
        $setOnInsert: {
          companyId: company._id,
          createdBy: hr._id,
          ...job,
          employmentType: "Full-time",
          workMode: "Hybrid",
          location: "Bengaluru",
          minimumExperience: 2,
          maximumExperience: 6,
          education: "Bachelor's degree or equivalent experience",
          description:
            "This production-safe sample role is used to validate deployments, permissions, workflows, and public application routing without importing candidate data.",
          responsibilities: ["Own reliable hiring workflows", "Collaborate with cross-functional teams", "Maintain high quality operating standards"],
          openings: 2,
          deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
          status: "Active",
          publishedAt: new Date(),
          publicApplicationSlug: slug
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  console.log(`Production seed completed for admin ${admin.email}, HR ${hr.email}, company ${company.slug}`);
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDB();
  });
