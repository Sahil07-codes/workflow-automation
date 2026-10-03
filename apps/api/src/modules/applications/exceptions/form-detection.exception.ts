export class FormDetectionError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'FormDetectionError';
    Object.setPrototypeOf(this, FormDetectionError.prototype);
  }
}

export class CaptchaDetectedError extends FormDetectionError {
  constructor(details?: Record<string, unknown>) {
    super('CAPTCHA_DETECTED', 'Page requires CAPTCHA verification', details);
    Object.setPrototypeOf(this, CaptchaDetectedError.prototype);
  }
}

export class LoginRequiredError extends FormDetectionError {
  constructor(details?: Record<string, unknown>) {
    super('LOGIN_REQUIRED', 'Page requires authentication', details);
    Object.setPrototypeOf(this, LoginRequiredError.prototype);
  }
}

export class JobNotFoundError extends FormDetectionError {
  constructor(details?: Record<string, unknown>) {
    super('JOB_NOT_FOUND', 'Job page no longer exists (404)', details);
    Object.setPrototypeOf(this, JobNotFoundError.prototype);
  }
}

export class FormNotFoundError extends FormDetectionError {
  constructor(details?: Record<string, unknown>) {
    super('FORM_NOT_FOUND', 'No application form found on page', details);
    Object.setPrototypeOf(this, FormNotFoundError.prototype);
  }
}

export class TimeoutError extends FormDetectionError {
  constructor(details?: Record<string, unknown>) {
    super('TIMEOUT', 'Form detection timed out after 30 seconds', details);
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export class BrowserCrashError extends FormDetectionError {
  constructor(details?: Record<string, unknown>) {
    super('BROWSER_CRASH', 'Browser crashed or connection lost', details);
    Object.setPrototypeOf(this, BrowserCrashError.prototype);
  }
}

export class InvalidUrlError extends FormDetectionError {
  constructor(url: string, details?: Record<string, unknown>) {
    super('INVALID_URL', `Invalid or malformed URL: ${url}`, details);
    Object.setPrototypeOf(this, InvalidUrlError.prototype);
  }
}
