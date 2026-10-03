import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import {
  FormDetectionError,
  CaptchaDetectedError,
  LoginRequiredError,
  JobNotFoundError,
  FormNotFoundError,
  TimeoutError,
  BrowserCrashError,
} from '../applications/exceptions/form-detection.exception';
import { PlaywrightManagerService } from './playwright-manager.service';

export interface FormField {
  id: string;
  name: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  value?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
}

export interface FormSchema {
  fields: FormField[];
  source: string;
  detectedAt: Date;
  fieldCount: number;
}

@Injectable()
export class FormDetectorService {
  private readonly logger = new Logger('FormDetectorService');

  constructor(private playwrightManager: PlaywrightManagerService) {}

  async detectForm(
    applyUrl: string,
    jobSource: string,
  ): Promise<FormSchema> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`Attempt ${attempt}/${maxRetries}: ${applyUrl}`);

        let html: string;
        let page: any;

        try {
          const result = await this.playwrightManager.navigateToJob(
            applyUrl,
            30000,
          );
          html = result.html;
          page = result.page;

          // Close page after use
          if (page) {
            await page.close().catch(() => {});
          }
        } catch (error) {
          if (error instanceof TimeoutError) {
            throw error;
          }
          throw new FormDetectionError(
            'NAVIGATION_FAILED',
            `Failed to navigate: ${error.message}`,
          );
        }

        // Validate HTML
        this.validateHtml(html);

        // Extract fields
        const fields = this.extractFormFields(html);

        if (fields.length === 0) {
          throw new FormNotFoundError();
        }

        this.logger.log(
          `Successfully detected ${fields.length} form fields`,
        );

        return {
          fields,
          source: jobSource,
          detectedAt: new Date(),
          fieldCount: fields.length,
        };
      } catch (error) {
        lastError = error;

        // Don't retry on permanent errors
        if (
          error instanceof CaptchaDetectedError ||
          error instanceof LoginRequiredError ||
          error instanceof JobNotFoundError ||
          error instanceof FormNotFoundError
        ) {
          throw error;
        }

        // Exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(`Attempt failed, retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Unknown error during form detection');
  }

  private validateHtml(html: string) {
    if (!html || html.length < 100) {
      throw new FormDetectionError(
        'INVALID_HTML',
        'HTML content too short or empty',
      );
    }

    const htmlLower = html.toLowerCase();

    // Detect CAPTCHA
    if (
      htmlLower.includes('g-recaptcha') ||
      htmlLower.includes('recaptcha') ||
      htmlLower.includes('hcaptcha') ||
      htmlLower.includes('cloudflare')
    ) {
      throw new CaptchaDetectedError();
    }

    // Detect login requirement
    if (
      htmlLower.includes('login') &&
      htmlLower.includes('password') &&
      !htmlLower.includes('form')
    ) {
      throw new LoginRequiredError();
    }

    // Detect 404
    if (
      htmlLower.includes('404') ||
      htmlLower.includes('not found') ||
      htmlLower.includes('page not found')
    ) {
      throw new JobNotFoundError();
    }
  }

  private extractFormFields(html: string): FormField[] {
    const $ = cheerio.load(html);
    const fields: FormField[] = [];
    let fieldIndex = 0;

    $('input, select, textarea').each((index, element) => {
      const $el = $(element);

      const type = this.normalizeFieldType($el.attr('type') || 'text');

      // Skip hidden and submit fields
      if (type === 'hidden' || type === 'submit' || type === 'button') {
        return;
      }

      const name =
        $el.attr('name') || $el.attr('id') || `field_${fieldIndex}`;
      const label = this.extractLabel($el, $);

      const field: FormField = {
        id: `field_${fieldIndex}`,
        name,
        type,
        label,
        required: $el.attr('required') !== undefined,
        placeholder: $el.attr('placeholder'),
        options: this.extractOptions($el),
        value: ($el.val() as string) || undefined,
        pattern: $el.attr('pattern'),
        minLength: parseInt($el.attr('minlength') || '0'),
        maxLength: parseInt($el.attr('maxlength') || '999999'),
        disabled: $el.prop('disabled') === true,
      };

      fields.push(field);
      fieldIndex++;
    });

    return fields;
  }

  private extractLabel(
    $field: cheerio.Cheerio<cheerio.Element>,
    $: cheerio.CheerioAPI,
  ): string {
    // Try label[for="field_id"]
    const fieldId = $field.attr('id');
    if (fieldId) {
      const labelText = $(`label[for="${fieldId}"]`).text().trim();
      if (labelText) return labelText;
    }

    // Try parent <label>
    const parentLabel = $field.closest('label').text().trim();
    if (parentLabel) return parentLabel;

    // Use placeholder or name
    return (
      $field.attr('placeholder') ||
      $field.attr('name') ||
      $field.attr('id') ||
      ''
    );
  }

  private extractOptions(
    $field: cheerio.Cheerio<cheerio.Element>,
  ): string[] | undefined {
    if ($field.is('select')) {
      const options = $field
        .find('option')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(opt => opt.length > 0);

      return options.length > 0 ? options : undefined;
    }

    return undefined;
  }

  private normalizeFieldType(type: string): string {
    const typeMap: Record<string, string> = {
      text: 'text',
      email: 'email',
      tel: 'phone',
      phone: 'phone',
      number: 'number',
      date: 'date',
      checkbox: 'checkbox',
      radio: 'radio',
      select: 'select',
      textarea: 'textarea',
      url: 'url',
      password: 'password',
      file: 'file',
      hidden: 'hidden',
      submit: 'submit',
      button: 'button',
    };

    return typeMap[type.toLowerCase()] || 'text';
  }
}
