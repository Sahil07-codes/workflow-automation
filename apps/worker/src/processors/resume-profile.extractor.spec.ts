import {
  extractResumeProfileData,
  mergeResumeProfileData,
} from './resume-profile.extractor';

describe('extractResumeProfileData', () => {
  it('extracts recognizable contact, social, experience, skills, and education details', () => {
    const result = extractResumeProfileData(`Jordan Lee
jordan.lee@example.com | https://www.linkedin.com/in/jordan-lee
https://github.com/jordanlee

Professional Summary
Software engineer with 5+ years of experience building web applications.

Skills
TypeScript, React, PostgreSQL

Education
Master's in Computer Science
Northbridge University
2022`);

    expect(result).toMatchObject({
      full_name: 'Jordan Lee',
      email: 'jordan.lee@example.com',
      linkedin_url: 'https://www.linkedin.com/in/jordan-lee',
      github_url: 'https://github.com/jordanlee',
      years_experience: '3–5 years',
      skills: ['TypeScript', 'React', 'PostgreSQL'],
      education_level: "Master's",
      institution: 'Northbridge University',
      graduation_year: '2022',
    });
    expect(result.experience_summary).toContain('Software engineer');
  });

  it('returns no speculative values when recognizable resume details are absent', () => {
    expect(extractResumeProfileData('A document with no profile information.')).toEqual({});
  });
});

describe('mergeResumeProfileData', () => {
  it('fills missing profile fields and adds skills without overwriting existing user data', () => {
    const result = mergeResumeProfileData(
      { full_name: 'User Edited Name', location: 'Toronto', skills: ['TypeScript'] },
      {
        full_name: 'Resume Name',
        location: 'Vancouver',
        github_url: 'https://github.com/resume-user',
        skills: ['TypeScript', 'React'],
      },
    );

    expect(result.changed).toBe(true);
    expect(result.data).toEqual({
      full_name: 'User Edited Name',
      location: 'Toronto',
      github_url: 'https://github.com/resume-user',
      skills: ['TypeScript', 'React'],
    });
  });

  it('does not mark an unchanged profile as modified', () => {
    expect(
      mergeResumeProfileData(
        { full_name: 'Existing Name', skills: ['React'] },
        { full_name: 'Resume Name', skills: ['React'] },
      ),
    ).toEqual({
      data: { full_name: 'Existing Name', skills: ['React'] },
      changed: false,
    });
  });
});
