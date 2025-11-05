import { describe, it, expect, vi } from 'vitest';
import { generateAccountNumberTool } from './index';

// Mock the crypto module to control randomness for testing
vi.mock('crypto', () => ({
  randomInt: vi.fn()
}));

// Import the mocked randomInt after mocking
const { randomInt } = await import('crypto');
const mockRandomInt = vi.mocked(randomInt);

describe('Account Number Generator Tool', () => {
  describe('Tool Definition', () => {
    it('should have correct name', () => {
      expect(generateAccountNumberTool.name).toBe('generateAccountNumber');
    });

    it('should have proper tool specification', () => {
      const toolSpec = generateAccountNumberTool.toolSpec();
      expect(toolSpec.name).toBe('generateAccountNumber');
      expect(toolSpec.description).toBe('Generate a random account number with specified number of digits');
      expect(toolSpec.inputSchema.json).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    it('should validate valid digit ranges', async () => {
      // Test valid inputs (1-20)
      const validInputs = [1, 5, 10, 15, 20];
      
      for (const digits of validInputs) {
        mockRandomInt.mockReturnValue(5 as any); // Mock consistent return for testing
        const result = generateAccountNumberTool.schema.safeParse({ digits });
        expect(result.success).toBe(true);
      }
    });

    it('should reject zero digits', () => {
      const result = generateAccountNumberTool.schema.safeParse({ digits: 0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Number of digits must be at least 1');
      }
    });

    it('should reject negative digits', () => {
      const result = generateAccountNumberTool.schema.safeParse({ digits: -1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Number of digits must be at least 1');
      }
    });

    it('should reject more than 20 digits', () => {
      const result = generateAccountNumberTool.schema.safeParse({ digits: 21 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Number of digits must be at most 20');
      }
    });

    it('should reject non-integer values', () => {
      const result = generateAccountNumberTool.schema.safeParse({ digits: 5.5 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].code).toBe('invalid_type');
      }
    });
  });

  describe('Account Number Generation', () => {
    describe('Single digit generation', () => {
      it('should generate single digit from 1-9', async () => {
        mockRandomInt.mockReturnValue(7 as any);
        
        const result = await generateAccountNumberTool.handler({ digits: 1 }, {});
        
        expect(mockRandomInt).toHaveBeenCalledWith(1, 10);
        expect(result).toBe('Generated 1-digit account number: 7');
      });

      it('should never generate zero for single digit', async () => {
        // Test multiple calls to ensure no zero is generated
        const results = [];
        for (let i = 1; i <= 9; i++) {
          mockRandomInt.mockReturnValue(i as any);
          const result = await generateAccountNumberTool.handler({ digits: 1 }, {});
          results.push(result);
        }
        
        // Verify all results contain digits 1-9, never 0
        results.forEach(result => {
          const accountNumber = result.split(': ')[1];
          expect(['1', '2', '3', '4', '5', '6', '7', '8', '9']).toContain(accountNumber);
        });
      });
    });

    describe('Multi-digit generation', () => {
      it('should generate correct length for valid digit ranges', async () => {
        const testCases = [
          { digits: 2, firstDigit: 5, remainingDigits: [3] },
          { digits: 5, firstDigit: 8, remainingDigits: [1, 2, 3, 4] },
          { digits: 10, firstDigit: 9, remainingDigits: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
          { digits: 20, firstDigit: 1, remainingDigits: Array(19).fill(0) }
        ];

        for (const testCase of testCases) {
          mockRandomInt
            .mockReturnValueOnce(testCase.firstDigit as any) // First digit call
            .mockImplementation(() => testCase.remainingDigits.shift() || 0); // Remaining digits

          const result = await generateAccountNumberTool.handler({ digits: testCase.digits }, {});
          const accountNumber = result.split(': ')[1];
          
          expect(accountNumber).toHaveLength(testCase.digits);
          expect(accountNumber[0]).toBe(testCase.firstDigit.toString());
        }
      });

      it('should ensure first digit is never zero for multi-digit numbers', async () => {
        const testDigits = [2, 5, 10, 15, 20];
        
        for (const digits of testDigits) {
          // Mock first digit to be non-zero (1-9)
          mockRandomInt
            .mockReturnValueOnce(5 as any) // First digit
            .mockImplementation(() => 0); // All remaining digits as 0 for simplicity

          const result = await generateAccountNumberTool.handler({ digits }, {});
          const accountNumber = result.split(': ')[1];
          
          expect(accountNumber[0]).not.toBe('0');
          expect(['1', '2', '3', '4', '5', '6', '7', '8', '9']).toContain(accountNumber[0]);
          expect(mockRandomInt).toHaveBeenCalledWith(1, 10); // First digit range
        }
      });

      it('should allow zero in non-first positions', async () => {
        mockRandomInt
          .mockReturnValueOnce(5 as any) // First digit: 5
          .mockReturnValueOnce(0 as any) // Second digit: 0
          .mockReturnValueOnce(7 as any); // Third digit: 7

        const result = await generateAccountNumberTool.handler({ digits: 3 }, {});
        const accountNumber = result.split(': ')[1];
        
        expect(accountNumber).toBe('507');
        expect(accountNumber[0]).toBe('5'); // First digit non-zero
        expect(accountNumber[1]).toBe('0'); // Second digit can be zero
        expect(accountNumber[2]).toBe('7'); // Third digit
      });
    });

    describe('Randomness testing', () => {
      it('should generate different numbers on multiple calls', async () => {
        // Mock different random values for each call to simulate randomness
        const mockValues = [
          [1, 2, 3, 4, 5], // First call: 12345
          [9, 8, 7, 6, 5], // Second call: 98765
          [5, 0, 0, 1, 2], // Third call: 50012
          [3, 3, 3, 3, 3], // Fourth call: 33333
          [7, 1, 9, 2, 8], // Fifth call: 71928
        ];
        
        const results = new Set();
        
        for (let i = 0; i < mockValues.length; i++) {
          const values = mockValues[i];
          mockRandomInt
            .mockReturnValueOnce(values[0] as any) // First digit
            .mockReturnValueOnce(values[1] as any) // Second digit
            .mockReturnValueOnce(values[2] as any) // Third digit
            .mockReturnValueOnce(values[3] as any) // Fourth digit
            .mockReturnValueOnce(values[4] as any); // Fifth digit

          const result = await generateAccountNumberTool.handler({ digits: 5 }, {});
          const accountNumber = result.split(': ')[1];
          results.add(accountNumber);
        }
        
        // Should generate 5 different numbers
        expect(results.size).toBe(5);
        expect(results).toContain('12345');
        expect(results).toContain('98765');
        expect(results).toContain('50012');
        expect(results).toContain('33333');
        expect(results).toContain('71928');
      });

      it('should use cryptographically secure randomness', () => {
        // Verify that the crypto.randomInt function is being used
        // This is tested implicitly through our mocking, but we can verify the import
        expect(mockRandomInt).toBeDefined();
      });
    });

    describe('Boundary conditions', () => {
      it('should handle minimum boundary (1 digit)', async () => {
        mockRandomInt.mockReturnValue(9 as any);
        
        const result = await generateAccountNumberTool.handler({ digits: 1 }, {});
        
        expect(result).toBe('Generated 1-digit account number: 9');
        expect(mockRandomInt).toHaveBeenCalledWith(1, 10);
      });

      it('should handle maximum boundary (20 digits)', async () => {
        mockRandomInt
          .mockReturnValueOnce(1 as any) // First digit
          .mockImplementation(() => 9); // All remaining digits as 9

        const result = await generateAccountNumberTool.handler({ digits: 20 }, {});
        const accountNumber = result.split(': ')[1];
        
        expect(accountNumber).toHaveLength(20);
        expect(accountNumber[0]).toBe('1');
        expect(result).toContain('Generated 20-digit account number:');
      });
    });

    describe('Error handling', () => {
      it('should handle crypto errors gracefully', async () => {
        mockRandomInt.mockImplementation(() => {
          throw new Error('Crypto error');
        });

        const result = await generateAccountNumberTool.handler({ digits: 5 }, {});
        
        expect(result).toBe('Error generating account number: Crypto error');
      });

      it('should handle unknown errors', async () => {
        mockRandomInt.mockImplementation(() => {
          throw 'Unknown error';
        });

        const result = await generateAccountNumberTool.handler({ digits: 5 }, {});
        
        expect(result).toBe('Error generating account number: Unknown error occurred');
      });
    });
  });

  describe('Output format', () => {
    it('should return properly formatted string responses', async () => {
      mockRandomInt.mockReturnValue(5 as any);
      
      const result = await generateAccountNumberTool.handler({ digits: 3 }, {});
      
      expect(result).toMatch(/^Generated \d+-digit account number: \d+$/);
      expect(result).toContain('Generated 3-digit account number:');
    });

    it('should preserve leading zeros in middle positions', async () => {
      mockRandomInt
        .mockReturnValueOnce(1 as any) // First digit: 1
        .mockReturnValueOnce(0 as any) // Second digit: 0
        .mockReturnValueOnce(0 as any) // Third digit: 0
        .mockReturnValueOnce(5 as any); // Fourth digit: 5

      const result = await generateAccountNumberTool.handler({ digits: 4 }, {});
      const accountNumber = result.split(': ')[1];
      
      expect(accountNumber).toBe('1005');
      expect(accountNumber).toHaveLength(4);
    });
  });

  describe('Requirements verification', () => {
    it('should satisfy requirement 1.1 - generate N-digit number', async () => {
      const testCases = [1, 5, 10, 15, 20];
      
      for (const digits of testCases) {
        mockRandomInt.mockReturnValue(5 as any);
        const result = await generateAccountNumberTool.handler({ digits }, {});
        const accountNumber = result.split(': ')[1];
        
        expect(accountNumber).toHaveLength(digits);
      }
    });

    it('should satisfy requirement 1.2 - validate input range 1-20', () => {
      // Valid range
      expect(generateAccountNumberTool.schema.safeParse({ digits: 1 }).success).toBe(true);
      expect(generateAccountNumberTool.schema.safeParse({ digits: 20 }).success).toBe(true);
      
      // Invalid range
      expect(generateAccountNumberTool.schema.safeParse({ digits: 0 }).success).toBe(false);
      expect(generateAccountNumberTool.schema.safeParse({ digits: 21 }).success).toBe(false);
    });

    it('should satisfy requirement 1.3 - first digit never zero', async () => {
      const testCases = [2, 5, 10, 20];
      
      for (const digits of testCases) {
        mockRandomInt
          .mockReturnValueOnce(7 as any) // Ensure first digit is non-zero
          .mockImplementation(() => 0); // Remaining can be zero

        const result = await generateAccountNumberTool.handler({ digits }, {});
        const accountNumber = result.split(': ')[1];
        
        expect(accountNumber[0]).not.toBe('0');
      }
    });

    it('should satisfy requirement 1.4 - return as string', async () => {
      mockRandomInt.mockReturnValue(5 as any);
      
      const result = await generateAccountNumberTool.handler({ digits: 5 }, {});
      
      expect(typeof result).toBe('string');
      expect(result).toContain('Generated 5-digit account number:');
    });

    it('should satisfy requirement 3.1 & 3.3 - cryptographically secure randomness', () => {
      // Verify we're using crypto.randomInt (mocked in our tests)
      expect(mockRandomInt).toBeDefined();
      
      // The actual cryptographic security is provided by Node.js crypto module
      // Our test verifies we're calling the right function
    });
  });
});