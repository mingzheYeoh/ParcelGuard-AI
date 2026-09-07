/**
 * Frontend runtime mode (PLAN.md §11 F4). One definition, because a default
 * that disagrees between the MSW bootstrap and the UI silently produces a
 * "live" app with no server behind it.
 *
 * mock — MSW answers every request in the browser.
 * live — no worker starts; failures stay visible as failures.
 */
export const API_MODE: 'mock' | 'live' =
  import.meta.env.VITE_API_MODE === 'live' ? 'live' : 'mock';

export const IS_MOCK = API_MODE === 'mock';
