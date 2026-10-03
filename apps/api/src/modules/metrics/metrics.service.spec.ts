import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('records HTTP request counts and durations by route and status', async () => {
    service.recordHttpRequest('GET', '/v1/jobs', 200, 0.125);

    const metrics = await service.getMetrics();

    expect(metrics).toContain('autoapply_http_requests_total');
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('route="/v1/jobs"');
    expect(metrics).toContain('status_code="200"');
    expect(metrics).toContain('autoapply_http_request_duration_seconds');
  });

  it('uses Prometheus text exposition format', () => {
    expect(service.contentType).toContain('text/plain');
  });
});
