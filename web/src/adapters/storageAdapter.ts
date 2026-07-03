import type { CaseRecord, LprRecord } from '@core/types';

const CASES_KEY = 'execution_assistant_cases';
const LPR_KEY = 'execution_assistant_lpr';

export interface StorageAdapter {
  getCases(): Record<string, CaseRecord>;
  saveCases(cases: Record<string, CaseRecord>): void;
  getLprData(): LprRecord[] | null;
  saveLprData(data: LprRecord[]): void;
}

class LocalStorageAdapter implements StorageAdapter {
  getCases(): Record<string, CaseRecord> {
    try {
      const raw = localStorage.getItem(CASES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  saveCases(cases: Record<string, CaseRecord>): void {
    localStorage.setItem(CASES_KEY, JSON.stringify(cases));
  }
  getLprData(): LprRecord[] | null {
    try {
      const raw = localStorage.getItem(LPR_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  saveLprData(data: LprRecord[]): void {
    localStorage.setItem(LPR_KEY, JSON.stringify(data));
  }
}

export const storage = new LocalStorageAdapter();
