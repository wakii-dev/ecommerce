import { preflight } from './helpers/env';

/** Playwright globalSetup — preflight fail-FAST với hướng dẫn. */
export default async function globalSetup(): Promise<void> {
  await preflight();
}
