import { describe, it, expect } from 'vitest';
import {
  normalizeJsTokens,
  computeShingles,
  computeJaccardSimilarity,
  compareSubmissions,
} from '@/server/services/integrity/similarity';

describe('Similarity detection & token normalization', () => {
  it('normalizes variable names and strips comments and whitespace', () => {
    const code1 = `
      // Calculate two sum
      function twoSum(nums, target) {
        /* use hash map */
        const map = new Map();
        for (let i = 0; i < nums.length; i++) {
          const comp = target - nums[i];
          if (map.has(comp)) return [map.get(comp), i];
          map.set(nums[i], i);
        }
        return [];
      }
    `;

    const code2 = `
      function solve(arr, k) {
        const dict = new Map();
        for (let idx = 0; idx < arr.length; idx++) {
          const diff = k - arr[idx];
          if (dict.has(diff)) return [dict.get(diff), idx];
          dict.set(arr[idx], idx);
        }
        return [];
      }
    `;

    const tokens1 = normalizeJsTokens(code1);
    const tokens2 = normalizeJsTokens(code2);

    // Both functions have identical logic, only variable names differ:
    // tokens should be identical after placeholder renaming!
    expect(tokens1).toEqual(tokens2);

    const { similarity } = compareSubmissions(code1, code2);
    expect(similarity).toBe(1.0);
  });

  it('reports lower similarity for different algorithmic structures', () => {
    const code1 = `
      function containsDuplicate(nums) {
        const set = new Set();
        for (let i = 0; i < nums.length; i++) {
          if (set.has(nums[i])) return true;
          set.add(nums[i]);
        }
        return false;
      }
    `;

    const code2 = `
      function containsDuplicate(nums) {
        nums.sort((a, b) => a - b);
        for (let i = 0; i < nums.length - 1; i++) {
          if (nums[i] === nums[i + 1]) return true;
        }
        return false;
      }
    `;

    const { similarity } = compareSubmissions(code1, code2);
    expect(similarity).toBeLessThan(0.7);
  });

  it('correctly computes Jaccard similarity over shingles', () => {
    const s1 = new Set(['a b c', 'b c d', 'c d e']);
    const s2 = new Set(['a b c', 'b c d', 'x y z']);
    // Intersection: 2, Union: 4 => J = 0.5
    expect(computeJaccardSimilarity(s1, s2)).toBe(0.5);
  });

  it('handles empty code safely', () => {
    expect(compareSubmissions('', '').similarity).toBe(1.0);
    expect(compareSubmissions('function a(){}', '').similarity).toBe(0.0);
  });
});
