import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { InvalidUrlError } from '../../applications/exceptions/form-detection.exception';

@Injectable()
export class PlaywrightManagerService {
  private readonly logger = new Logger('PlaywrightManagerService');
  private browser: Browser | null = null;

  async initBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  async navigateToJob(
    applyUrl: string,
    timeout: number = 30000,
  ): Promise<{ page: Page; context: BrowserContext; html: string }> {
    // Validate URL
    try {
      new URL(applyUrl);
    } catch {
      throw new InvalidUrlError(applyUrl);
    }

    const browser = await this.initBrowser();
    const context = await browser.createBrowserContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    try {
      // Set user agent
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/120.0.0.0 Safari/537.36',
      );

      // Navigate with timeout
      const response = await page.goto(applyUrl, {
        waitUntil: 'domcontentloaded',
        timeout,
      });

      if (!response?.ok()) {
        throw new Error(`HTTP ${response?.status()}`);
      }

      // Wait for form or content
      await page
        .waitForSelector('form, input[type="text"]', {
          timeout: 10000,
        })
        .catch(() => {
          // Form might not have <form> tag, continue anyway
        });

      // Small delay for dynamic content
      await page.waitForTimeout(1000);

      const html = await page.content();

      return { page, context, html };
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
