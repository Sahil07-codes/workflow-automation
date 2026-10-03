import { z } from 'zod';

/**
 * Education record
 */
export const EducationSchema = z.object({
  level: z.enum(['10TH', '12TH', 'UG', 'PG']),
  field: z.string().min(1).max(200),
  school_name: z.string().min(1).max(200),
  cgpa: z.number().min(0).max(10).optional(),
  year_passed: z.number().int().min(1980).max(new Date().getFullYear()),
});

export type Education = z.infer<typeof EducationSchema>;

/**
 * Work experience record
 */
export const ExperienceSchema = z.object({
  job_title: z.string().min(1).max(200),
  company_name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  start_date: z.string().date(),
  end_date: z.string().date().optional(),
  currently_working: z.boolean().default(false),
});

export type Experience = z.infer<typeof ExperienceSchema>;

/**
 * Project record
 */
export const ProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500),
  link: z.string().url().optional(),
  date: z.string().date().optional(),
});

export type Project = z.infer<typeof ProjectSchema>;

/**
 * Profile data (encrypted in database)
 */
export const ProfileDataSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone_e164: z.string().regex(/^\+\d{1,15}$/),
  date_of_birth: z.string().date().optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  country: z.string().min(1).max(100).default('IN'),
  bio: z.string().max(500).optional(),
  education: z.array(EducationSchema).default([]),
  experience: z.array(ExperienceSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  skills: z.array(z.string()).default([]),
  links: z.object({
    linkedin: z.string().url().optional(),
    github: z.string().url().optional(),
    portfolio: z.string().url().optional(),
  }).optional(),
  resume_key: z.string().optional(), // S3 key for uploaded resume
});

export type ProfileData = z.infer<typeof ProfileDataSchema>;

/**
 * Update profile request
 */
export const UpdateProfileRequestSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  phone_e164: z.string().regex(/^\+\d{1,15}$/).optional(),
  date_of_birth: z.string().date().optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  country: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  education: z.array(EducationSchema).optional(),
  experience: z.array(ExperienceSchema).optional(),
  projects: z.array(ProjectSchema).optional(),
  skills: z.array(z.string()).optional(),
  links: z.object({
    linkedin: z.string().url().optional(),
    github: z.string().url().optional(),
    portfolio: z.string().url().optional(),
  }).optional(),
});

export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

/**
 * Profile confirmation (after user review)
 */
export const ConfirmProfileRequestSchema = z.object({
  profile_version: z.number().int().positive().optional(), // If null, confirms current
  acknowledged: z.boolean(),
});

export type ConfirmProfileRequest = z.infer<typeof ConfirmProfileRequestSchema>;

/**
 * Job preferences
 */
export const JobPreferencesSchema = z.object({
  roles: z.array(z.string().min(1)).min(1),
  locations: z.array(z.string().min(1)).min(1),
  remote_preference: z.enum(['ONSITE', 'HYBRID', 'REMOTE']).optional(),
  min_salary_inr: z.number().int().min(0).optional(),
  max_salary_inr: z.number().int().optional(),
  excluded_companies: z.array(z.string()).default([]),
  min_match_score: z.number().int().min(0).max(100).default(60),
  daily_cap: z.number().int().min(1).max(500).default(25),
  auto_approve: z.object({
    enabled: z.boolean().default(false),
    min_score: z.number().int().min(0).max(100).optional(),
    companies: z.array(z.string()).default([]),
  }).optional(),
});

export type JobPreferences = z.infer<typeof JobPreferencesSchema>;

/**
 * Update preferences request
 */
export const UpdatePreferencesRequestSchema = JobPreferencesSchema.partial();

export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequestSchema>;
