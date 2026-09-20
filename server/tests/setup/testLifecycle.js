import { beforeEach, afterEach } from 'vitest';
import { clearDatabase } from '../helpers/testDb.js';
import { resetRateLimiters } from '../../src/middleware/rateLimiter.js';
import emailService from '../../src/services/emailService.js';
import { _resetCustomMediaHandlers } from '../../src/services/mediaService.js';
import { presenceManager } from '../../src/socket/socketUtils.js';
import typingManager from '../../src/socket/typingManager.js';

beforeEach(async () => {
  // Wipe test DB to guarantee total isolation between test cases
  await clearDatabase();

  // Reset rate limiting counters so tests never encounter 429 unintentionally
  resetRateLimiters();

  // Clear in-memory email inspection queue
  emailService.clearQueue();

  // Reset any custom media upload/delete mocks
  _resetCustomMediaHandlers();

  // Reset in-memory socket presence and typing states
  presenceManager.reset();
  typingManager.reset();
});

afterEach(async () => {
  // Clean up mocks and state
  _resetCustomMediaHandlers();
  emailService.clearQueue();
  resetRateLimiters();
  presenceManager.reset();
  typingManager.reset();
});
