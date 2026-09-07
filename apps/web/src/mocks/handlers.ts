import { http, HttpResponse } from 'msw';
import { API_BASE_PATH, type HealthResponse } from '@parcelguard/contracts';

/**
 * Task 1 placeholder handler set. Stateful demo handlers for every PLAN.md §7
 * endpoint are implemented in Task 3.
 */
export const handlers = [
  http.get(`${API_BASE_PATH}/health`, () => {
    const data: HealthResponse = { api: 'ok', model: 'mock', terminal3: 'mock' };
    return HttpResponse.json({ data, request_id: 'req_mock_health' });
  }),
];
