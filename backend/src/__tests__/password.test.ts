import { validatePasswordStrength, hashPassword, comparePassword } from '../common/utils/password';

describe('Password Utils', () => {
  describe('validatePasswordStrength', () => {
    it('should reject passwords shorter than 12 chars', () => {
      const result = validatePasswordStrength('Short1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 12 characters long');
    });

    it('should reject passwords without uppercase', () => {
      const result = validatePasswordStrength('lowercaseonly1!@');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject passwords without lowercase', () => {
      const result = validatePasswordStrength('UPPERCASEONLY1!@');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject passwords without numbers', () => {
      const result = validatePasswordStrength('NoNumbersHere!@#');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should reject passwords without special chars', () => {
      const result = validatePasswordStrength('NoSpecialChars123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should reject common passwords', () => {
      const result = validatePasswordStrength('password');
      expect(result.valid).toBe(false);
    });

    it('should accept valid strong passwords', () => {
      const result = validatePasswordStrength('MyStr0ng!Pass#2024');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('hashPassword / comparePassword', () => {
    it('should hash and verify passwords correctly', async () => {
      const password = 'TestPassword123!@#';
      const hash = await hashPassword(password);
      expect(hash).not.toBe(password);
      expect(await comparePassword(password, hash)).toBe(true);
      expect(await comparePassword('wrong', hash)).toBe(false);
    });
  });
});
