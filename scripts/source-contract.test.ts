import { describe, expect, it } from 'vitest';
import { sourceTokenBytes, sourceTokens } from './source-contract';

describe('source contract tokens', () => {
  it.each([
    ["where('participants', 'array-contains', uid), where('creatorUid', '==', uid)", 'where(\n"participants", "array-contains", uid,\n),\n/* next clause */ where("creatorUid", "==", uid,)'],
    ["head.format === 3 ? [where('format', '==', 3)] : []", 'head.format === 3\n? [where("format", "==", 3,),]\n: []'],
    ["if (before?.format === 3 && row.format === 2) continue;", 'if (\nbefore?.format === 3 && row.format === 2\n)\ncontinue;'],
    ["import { DiscoveryCard } from './DiscoveryCard';", 'import {\n DiscoveryCard,\n} from "./DiscoveryCard";'],
  ])('ignores only formatting in %s', (compact, expanded) => {
    expect(sourceTokens(expanded)).toBe(sourceTokens(compact));
  });

  it.each([
    ["where('creatorUid', '==', uid)", "where('creatorUid', '!=', uid)"],
    ["where('a', '==', uid), where('b', '==', uid)", "where('b', '==', uid), where('a', '==', uid)"],
    ["const name = 'two words';", "const name = 'twowords';"],
    ['const pattern = /a b/;', 'const pattern = /ab/;'],
    ['const text = `a ${value} b`;', 'const text = `a ${value}b`;'],
    ['const rows = [1, , 2];', 'const rows = [1, 2];'],
    ['const rows = [,];', 'const rows = [];'],
    ['const rows = [1, ,];', 'const rows = [1,];'],
  ])('retains meaningful tokens in %s', (before, after) => {
    expect(sourceTokens(before)).not.toBe(sourceTokens(after));
  });

  it('counts UTF-8 token bytes including literal content, but not layout or comments', () => {
    const compact = "const terms = ['two words'];";
    expect(sourceTokenBytes("// explanation\nconst terms = [\n 'two words',\n];")).toBe(sourceTokenBytes(compact));
    expect(sourceTokenBytes("const terms = ['twowords'];")).toBe(sourceTokenBytes(compact) - 1);
    expect(sourceTokenBytes("const terms = ['é'];")).toBe(sourceTokenBytes("const terms = ['e'];") + 1);
    const overhead = sourceTokenBytes("const terms = [''];");
    expect(sourceTokenBytes(`const terms = ['${'x'.repeat(8192 - overhead)}'];`)).toBe(8192);
    expect(sourceTokenBytes(`const terms = ['${'x'.repeat(8193 - overhead)}'];`)).toBeGreaterThan(8192);
  });
});
