import { BadRequestException } from '@nestjs/common';
import { normalizeJobUrl } from './day-one.service';

describe('normalizeJobUrl', () => {
  it('normalizes a secure public-link candidate and drops its fragment', () => {
    expect(normalizeJobUrl('https://jobs.example.com/role#apply')).toBe(
      'https://jobs.example.com/role',
    );
  });

  it.each([
    'http://jobs.example.com/role',
    'https://user:pass@jobs.example.com/role',
    'https://jobs.example.com:8443/role',
    'file:///etc/passwd',
    'not a URL',
    `https://jobs.example.com/${'a'.repeat(2048)}`,
  ])('rejects unsupported URL %s', (value) => {
    expect(() => normalizeJobUrl(value)).toThrow(BadRequestException);
  });
});
