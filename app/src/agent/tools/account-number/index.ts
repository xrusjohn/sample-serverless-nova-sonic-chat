import { z } from 'zod';
import { randomInt } from 'crypto';
import { zodToJsonSchemaBody } from '@/lib/utils';
import { ToolDefinition } from '../common';

const inputSchema = z.object({
  digits: z.number()
    .int()
    .min(1, 'Number of digits must be at least 1')
    .max(20, 'Number of digits must be at most 20')
    .describe('Number of digits for the account number (1-20)')
});

const name = 'generateAccountNumber';

/**
 * Generates a random account number with the specified number of digits.
 * Ensures the first digit is never zero for multi-digit numbers.
 * Uses cryptographically secure randomness via Node.js crypto module.
 */
function generateRandomAccountNumber(digits: number): string {
  if (digits === 1) {
    // Single digit case: generate random digit from 1-9 (excluding 0)
    return randomInt(1, 10).toString();
  }
  
  // Multi-digit case: first digit 1-9, remaining digits 0-9
  let accountNumber = '';
  
  // First digit: 1-9 (never zero to maintain proper N-digit length)
  accountNumber += randomInt(1, 10).toString();
  
  // Remaining digits: 0-9
  for (let i = 1; i < digits; i++) {
    accountNumber += randomInt(0, 10).toString();
  }
  
  return accountNumber;
}

const handler = async (input: z.infer<typeof inputSchema>) => {
  try {
    // Input validation is handled by Zod schema before this handler is called
    const { digits } = input;
    
    // Generate the account number
    const accountNumber = generateRandomAccountNumber(digits);
    
    return `Generated ${digits}-digit account number: ${accountNumber}`;
  } catch (error) {
    // Handle any unexpected errors during generation
    if (error instanceof Error) {
      return `Error generating account number: ${error.message}`;
    }
    return 'Error generating account number: Unknown error occurred';
  }
};

export const generateAccountNumberTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name,
  handler,
  schema: inputSchema,
  toolSpec: () => ({
    name,
    description: 'Generate a random account number with specified number of digits',
    inputSchema: {
      json: JSON.stringify(zodToJsonSchemaBody(inputSchema)),
    },
  }),
};