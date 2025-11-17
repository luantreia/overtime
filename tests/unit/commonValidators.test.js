// tests/unit/commonValidators.test.js
import { describe, it, expect } from '@jest/globals';
import { validateObjectIdParam, validatePagination, validateEmail } from '../../src/validators/commonValidators.js';
import { validationResult } from 'express-validator';

describe('Common Validators', () => {
  describe('validateObjectIdParam', () => {
    it('should validate a valid ObjectId', async () => {
      const req = {
        params: { id: '507f1f77bcf86cd799439011' },
      };
      const res = {};
      const next = () => {};

      for (const validator of validateObjectIdParam()) {
        await validator.run(req);
      }

      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should reject an invalid ObjectId', async () => {
      const req = {
        params: { id: 'invalid-id' },
      };
      const res = {};
      const next = () => {};

      for (const validator of validateObjectIdParam()) {
        await validator.run(req);
      }

      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('validatePagination', () => {
    it('should validate valid pagination params', async () => {
      const req = {
        query: { page: '1', limit: '10' },
      };

      for (const validator of validatePagination) {
        await validator.run(req);
      }

      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should reject invalid page number', async () => {
      const req = {
        query: { page: '0', limit: '10' },
      };

      for (const validator of validatePagination) {
        await validator.run(req);
      }

      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });

    it('should reject limit exceeding max', async () => {
      const req = {
        query: { page: '1', limit: '200' },
      };

      for (const validator of validatePagination) {
        await validator.run(req);
      }

      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should validate a valid email', async () => {
      const req = {
        body: { email: 'test@example.com' },
      };

      for (const validator of validateEmail()) {
        await validator.run(req);
      }

      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(true);
    });

    it('should reject an invalid email', async () => {
      const req = {
        body: { email: 'invalid-email' },
      };

      for (const validator of validateEmail()) {
        await validator.run(req);
      }

      const errors = validationResult(req);
      expect(errors.isEmpty()).toBe(false);
    });
  });
});
