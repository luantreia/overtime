import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { validateUserCreation, handleValidationErrors } from '../../src/validators/userValidator.js';

describe('User Validator', () => {
  it('should export validation middleware array', () => {
    expect(Array.isArray(validateUserCreation)).toBe(true);
    expect(validateUserCreation.length).toBeGreaterThan(0);
  });

  it('should export handleValidationErrors function', () => {
    expect(typeof handleValidationErrors).toBe('function');
  });

  // TODO: Add proper integration tests with express app
  // Testing express-validator middleware requires a full Express context
});