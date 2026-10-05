const SECTION_HEADINGS = new Set([
  'summary',
  'professional summary',
  'profile',
  'objective',
  'skills',
  'technical skills',
  'core competencies',
  'experience',
  'work experience',
  'work history',
  'employment history',
  'education',
  'projects',
  'certifications',
  'licenses',
  'languages',
  'references',
  'resume',
  'curriculum vitae',
]);

export function extractResumeProfileData(text: string): Record<string, unknown> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
  const extracted: Record<string, unknown> = {};
  const email = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  if (email) extracted.email = email;

  const linkedin = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Z0-9%_-]+\/?/i,
  )?.[0];
  if (linkedin) extracted.linkedin_url = normalizeSocialUrl(linkedin);

  const github = text.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Z0-9_-]+\/?/i,
  )?.[0];
  if (github) extracted.github_url = normalizeSocialUrl(github);

  const name = findName(lines, email);
  if (name) extracted.full_name = name;

  const experience = text.match(
    /\b(\d{1,2}\+?)\s+years?(?:\s+of)?\s+(?:professional\s+)?experience\b/i,
  )?.[1];
  if (experience) {
    const years = Number.parseInt(experience, 10);
    extracted.years_experience = years < 1
      ? 'Less than 1 year'
      : years <= 2
        ? '1–2 years'
        : years <= 5
          ? '3–5 years'
          : years <= 10
            ? '6–10 years'
            : 'More than 10 years';
  }

  const sections = readSections(lines);
  const skillsSection = sections.get('skills') ?? sections.get('technical skills') ??
    sections.get('core competencies');
  if (skillsSection) {
    const skills = skillsSection
      .split(/\r?\n|[,;|•·\u2022]+/)
      .map((skill) => skill.replace(/^[-*]\s*/, '').trim())
      .filter((skill) => skill.length >= 2 && skill.length <= 60)
      .slice(0, 50);
    if (skills.length > 0) extracted.skills = [...new Set(skills)];
  }

  const summary = sections.get('summary') ??
    sections.get('professional summary') ??
    sections.get('profile') ??
    sections.get('objective');
  if (summary) extracted.experience_summary = summary.slice(0, 2000);

  const education = sections.get('education');
  if (education) {
    const educationLevel = education.match(
      /\b(doctorate|ph\.?d\.?|master(?:'s)?|bachelor(?:'s)?|associate(?:'s)?|diploma|high school)\b/i,
    )?.[0];
    if (educationLevel) extracted.education_level = educationLevel;

    const institutionLine = education
      .split(/\r?\n/)
      .find((line) => /\b(?:University|College|Institute|School)\b/i.test(line));
    const institution = institutionLine?.match(
      /(?:[A-Z][\w&'.-]*(?:[ \t]+|$)){0,5}(?:University|College|Institute|School)\b/,
    )?.[0];
    if (institution) extracted.institution = institution.trim();

    const graduationYear = education.match(/\b(?:19|20)\d{2}\b/)?.[0];
    if (graduationYear) extracted.graduation_year = graduationYear;
  }

  return extracted;
}

export function mergeResumeProfileData(
  existing: Record<string, unknown>,
  extracted: Record<string, unknown>,
): { data: Record<string, unknown>; changed: boolean } {
  const data = { ...existing };
  let changed = false;
  for (const [key, value] of Object.entries(extracted)) {
    const current = data[key];
    if (key === 'skills' && Array.isArray(value)) {
      const currentSkills = Array.isArray(current)
        ? current.filter((skill): skill is string => typeof skill === 'string')
        : [];
      const mergedSkills = [...new Set([...currentSkills, ...value.filter(
        (skill): skill is string => typeof skill === 'string',
      )])];
      if (mergedSkills.length !== currentSkills.length) {
        data[key] = mergedSkills;
        changed = true;
      }
    } else if (
      current === undefined ||
      current === null ||
      (typeof current === 'string' && current.trim() === '')
    ) {
      data[key] = value;
      changed = true;
    }
  }
  return { data, changed };
}

function findName(lines: string[], email: string | undefined): string | undefined {
  const candidates = lines.slice(0, 5);
  if (email) {
    const beforeEmail = lines[0]?.split(email)[0]?.trim();
    if (beforeEmail) candidates.unshift(beforeEmail);
  }
  for (const candidate of candidates) {
    const name = candidate
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '')
      .split(/\s+[|•·]\s+| {2,}/)[0]
      .replace(/^[^A-Za-z]+|[^A-Za-z.'’ -]+$/g, '')
      .trim();
    const words = name.split(/\s+/);
    if (
      name.length <= 80 &&
      words.length >= 2 &&
      words.length <= 5 &&
      words.every((word) => /^[A-Za-z][A-Za-z.'’-]*$/.test(word)) &&
      !SECTION_HEADINGS.has(name.toLowerCase())
    ) {
      return name;
    }
  }
  return undefined;
}

function readSections(lines: string[]): Map<string, string> {
  const sections = new Map<string, string>();
  let activeHeading: string | undefined;
  let content: string[] = [];
  const save = () => {
    if (activeHeading && content.length > 0) {
      sections.set(activeHeading, content.join('\n').trim());
    }
  };

  for (const line of lines) {
    const normalized = line
      .replace(/[:\-–—]+$/, '')
      .trim()
      .toLowerCase();
    if (SECTION_HEADINGS.has(normalized)) {
      save();
      activeHeading = normalized;
      content = [];
    } else if (activeHeading) {
      content.push(line);
    }
  }
  save();
  return sections;
}

function trimUrlPunctuation(url: string): string {
  return url.replace(/[),.;]+$/, '');
}

function normalizeSocialUrl(url: string): string {
  const trimmed = trimUrlPunctuation(url);
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
