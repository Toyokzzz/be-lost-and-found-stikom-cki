import { generateClaimCode } from '../src/utils/claimCodeGenerator';

describe('Claim Code Generator (CST-06 & SRS-FR-005)', () => {
  it('should generate a claim code with exact length of 6 characters', () => {
    const code = generateClaimCode();
    expect(code).toBeDefined();
    expect(code.length).toBe(6);
  });

  it('should contain only uppercase alphanumeric characters and exclude ambiguous 0, O, 1, I', () => {
    const code = generateClaimCode();
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(code).not.toContain('0');
    expect(code).not.toContain('O');
    expect(code).not.toContain('1');
    expect(code).not.toContain('I');
  });

  it('should generate unique codes across multiple iterations', () => {
    const generatedCodes = new Set<string>();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const code = generateClaimCode();
      generatedCodes.add(code);
    }

    // In 100 iterations, with 32^6 (> 1 billion) possibilities, all should be unique
    expect(generatedCodes.size).toBe(iterations);
  });
});
