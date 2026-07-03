import { create } from 'zustand';
import type { CaseRecord } from '@core/types';
import { storage } from '@/adapters/storageAdapter';

function sortByLastModified(cases: Record<string, CaseRecord>): string[] {
  return Object.values(cases)
    .sort((a, b) => {
      const ta = a.last_modified ? new Date(a.last_modified).getTime() : 0;
      const tb = b.last_modified ? new Date(b.last_modified).getTime() : 0;
      return tb - ta;
    })
    .map(c => c.case_no);
}

export interface CaseState {
  cases: Record<string, CaseRecord>;
  caseNoList: string[];

  loadAll: () => void;
  save: (data: CaseRecord) => void;
  get: (caseNo: string) => CaseRecord | null;
  delete: (caseNo: string) => void;
  search: (keyword: string) => string[];
}

export const useCaseStore = create<CaseState>((set, get) => ({
  cases: {},
  caseNoList: [],

  loadAll: () => {
    const cases = storage.getCases();
    set({ cases, caseNoList: sortByLastModified(cases) });
  },

  save: data => {
    const cases = storage.getCases();
    cases[data.case_no] = { ...data, last_modified: new Date().toISOString() };
    storage.saveCases(cases);
    set({ cases: { ...cases }, caseNoList: sortByLastModified(cases) });
  },

  get: caseNo => {
    const cases = get().cases;
    return cases[caseNo] || null;
  },

  delete: caseNo => {
    const cases = { ...get().cases };
    delete cases[caseNo];
    storage.saveCases(cases);
    set({ cases, caseNoList: sortByLastModified(cases) });
  },

  search: keyword => {
    const cases = get().cases;
    const kw = keyword.trim().toLowerCase();
    if (!kw) return get().caseNoList;
    return Object.values(cases)
      .filter(c => {
        return (
          c.case_no.toLowerCase().includes(kw) ||
          c.creditor.toLowerCase().includes(kw) ||
          c.debtor.toLowerCase().includes(kw) ||
          c.case_reason.toLowerCase().includes(kw) ||
          c.id_card.toLowerCase().includes(kw)
        );
      })
      .sort((a, b) => {
        const ta = a.last_modified ? new Date(a.last_modified).getTime() : 0;
        const tb = b.last_modified ? new Date(b.last_modified).getTime() : 0;
        return tb - ta;
      })
      .map(c => c.case_no);
  },
}));
