import { create } from 'zustand';
import { calculateInterest, formatInterestResult, parseMoney, formatMoney } from '@core';
import type {
  ClaimInput,
  PaymentInput,
  InterestCalcParams,
  InterestCalcResult,
  CaseRecord,
} from '@core/types';
import { storage } from '@/adapters/storageAdapter';
import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  LineRuleType,
} from 'docx';

type FormField =
  | 'caseNo'
  | 'creditor'
  | 'debtor'
  | 'caseReason'
  | 'idCard'
  | 'execBasis'
  | 'otherFees'
  | 'litigationFee'
  | 'interestClaim'
  | 'dueDate';

function createDefaultClaim(): ClaimInput {
  return {
    principal: 0,
    rate_type: '一年期LPR分段',
    lpr_multiple: 100,
    fixed_rate: 0,
    days_per_year: 365,
    start_date: '',
    end_date: '',
  };
}

function createDefaultPayment(): PaymentInput {
  return {
    amount: 0,
    date: '',
    deduct_order: [],
  };
}

function createInitialState() {
  return {
    caseNo: '',
    creditor: '',
    debtor: '',
    caseReason: '',
    idCard: '',
    execBasis: '',
    otherFees: '',
    litigationFee: '',
    interestClaim: '',
    dueDate: '',
    claims: [createDefaultClaim()] as ClaimInput[],
    payments: [] as PaymentInput[],
    calcResult: null as InterestCalcResult | null,
    isSaved: false,
    loadedCaseNo: null as string | null,
    hasUnsavedChanges: false,
    resultText: '',
  };
}

export interface InterestState extends ReturnType<typeof createInitialState> {
  updateField: (field: FormField, value: string) => void;
  addClaim: () => void;
  removeClaim: (idx: number) => void;
  updateClaim: (idx: number, field: keyof ClaimInput, value: string | number) => void;
  addPayment: () => void;
  removePayment: (idx: number) => void;
  updatePayment: (idx: number, field: keyof PaymentInput, value: string | number) => void;
  setDeductOrder: (idx: number, order: string[]) => void;
  calculate: () => void;
  clearAll: () => void;
  loadFromCase: (data: CaseRecord) => void;
  saveToDb: () => void;
  exportToExcel: () => Promise<void>;
  importFromExcel: (file: File) => Promise<boolean>;
  generateWord: () => Promise<void>;
}

export const useInterestStore = create<InterestState>((set, get) => ({
  ...createInitialState(),

  updateField: (field, value) =>
    set({ [field]: value, hasUnsavedChanges: true } as Partial<InterestState>),

  addClaim: () =>
    set(state => ({
      claims: [...state.claims, createDefaultClaim()],
      hasUnsavedChanges: true,
    })),

  removeClaim: idx =>
    set(state => ({
      claims: state.claims.filter((_, i) => i !== idx),
      hasUnsavedChanges: true,
    })),

  updateClaim: (idx, field, value) =>
    set(state => {
      const claims = [...state.claims];
      claims[idx] = { ...claims[idx], [field]: value } as ClaimInput;
      return { claims, hasUnsavedChanges: true };
    }),

  addPayment: () =>
    set(state => ({
      payments: [...state.payments, createDefaultPayment()],
      hasUnsavedChanges: true,
    })),

  removePayment: idx =>
    set(state => ({
      payments: state.payments.filter((_, i) => i !== idx),
      hasUnsavedChanges: true,
    })),

  updatePayment: (idx, field, value) =>
    set(state => {
      const payments = [...state.payments];
      payments[idx] = { ...payments[idx], [field]: value } as PaymentInput;
      return { payments, hasUnsavedChanges: true };
    }),

  setDeductOrder: (idx, order) =>
    set(state => {
      const payments = [...state.payments];
      payments[idx] = { ...payments[idx], deduct_order: order };
      return { payments, hasUnsavedChanges: true };
    }),

  calculate: () => {
    const state = get();
    const params: InterestCalcParams = {
      case_no: state.caseNo,
      creditor: state.creditor,
      debtor: state.debtor,
      case_reason: state.caseReason,
      id_card: state.idCard,
      exec_basis: state.execBasis,
      other_fees: parseMoney(state.otherFees),
      litigation_fee: parseMoney(state.litigationFee),
      interest_claim: parseMoney(state.interestClaim),
      due_date: state.dueDate,
      claims: state.claims,
      payments: state.payments,
    };
    const result = calculateInterest(params);
    set({
      calcResult: result,
      resultText: formatInterestResult(result),
    });
  },

  clearAll: () => set(createInitialState()),

  loadFromCase: data => {
    const srcClaims = data.calc_result?.claims;
    const claims: ClaimInput[] =
      srcClaims && srcClaims.length > 0
        ? srcClaims.map(c => ({
            principal: c.principal,
            rate_type: c.rate_type,
            lpr_multiple: c.lpr_multiple,
            fixed_rate: c.fixed_rate,
            days_per_year: c.days_per_year,
            start_date: c.start_date,
            end_date: c.end_date,
          }))
        : [createDefaultClaim()];
    const srcPayments = data.calc_result?.payments;
    const payments: PaymentInput[] =
      srcPayments && srcPayments.length > 0
        ? srcPayments.map(p => ({
            amount: p.amount,
            date: p.date,
            deduct_order: p.deduct_order,
          }))
        : [];
    set({
      caseNo: data.case_no || '',
      creditor: data.creditor || '',
      debtor: data.debtor || '',
      caseReason: data.case_reason || '',
      idCard: data.id_card || '',
      execBasis: data.exec_basis || '',
      otherFees: data.other_fees !== undefined ? String(data.other_fees) : '',
      litigationFee: data.litigation_fee !== undefined ? String(data.litigation_fee) : '',
      interestClaim: data.interest_claim !== undefined ? String(data.interest_claim) : '',
      dueDate: data.due_date || '',
      claims,
      payments,
      calcResult: data.calc_result || null,
      isSaved: true,
      loadedCaseNo: data.case_no || '',
      hasUnsavedChanges: false,
      resultText: data.calc_result ? formatInterestResult(data.calc_result) : '',
    });
  },

  saveToDb: () => {
    const state = get();
    const caseNo = state.caseNo;
    if (!caseNo) return;

    // 自动计算（如果尚未计算或已有修改）
    let calcResult = state.calcResult;
    if (!calcResult || state.hasUnsavedChanges) {
      const params: InterestCalcParams = {
        case_no: state.caseNo,
        creditor: state.creditor,
        debtor: state.debtor,
        case_reason: state.caseReason,
        id_card: state.idCard,
        exec_basis: state.execBasis,
        other_fees: parseMoney(state.otherFees),
        litigation_fee: parseMoney(state.litigationFee),
        interest_claim: parseMoney(state.interestClaim),
        due_date: state.dueDate,
        claims: state.claims,
        payments: state.payments,
      };
      calcResult = calculateInterest(params);
    }

    const record: CaseRecord = {
      case_no: caseNo,
      creditor: state.creditor,
      debtor: state.debtor,
      case_reason: state.caseReason,
      id_card: state.idCard,
      exec_basis: state.execBasis,
      other_fees: parseMoney(state.otherFees),
      litigation_fee: parseMoney(state.litigationFee),
      interest_claim: parseMoney(state.interestClaim),
      due_date: state.dueDate,
      calc_result: calcResult || undefined,
      last_modified: new Date().toISOString(),
    };
    const cases = storage.getCases();
    cases[caseNo] = record;
    storage.saveCases(cases);
    set({
      isSaved: true,
      loadedCaseNo: caseNo,
      hasUnsavedChanges: false,
      calcResult: calcResult,
      resultText: calcResult ? formatInterestResult(calcResult) : state.resultText,
    });
  },

  exportToExcel: async () => {
    const state = get();
    const wb = new ExcelJS.Workbook();
    wb.creator = '执行小助手';
    wb.created = new Date();
    const ws = wb.addWorksheet('利息计算表', {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { defaultRowHeight: 16 },
    });

    // 样式预设
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
    };
    const wrapAlign: Partial<ExcelJS.Alignment> = {
      vertical: 'middle', horizontal: 'left', wrapText: true,
    };
    const centerAlign: Partial<ExcelJS.Alignment> = {
      vertical: 'middle', horizontal: 'center', wrapText: true,
    };
    const rightAlign: Partial<ExcelJS.Alignment> = {
      vertical: 'middle', horizontal: 'right', wrapText: true,
    };

    // 列结构：col1=标签 | cols2..(maxMidCols+1)=债权/清偿数据 | col(maxMidCols+2)=算式 | col(maxMidCols+3)=金额
    const calc = state.calcResult;
    const maxMidCols = Math.max(state.claims.length, state.payments.length, 1);
    const totalCols = 1 + maxMidCols + (calc ? 2 : 0); // = maxMidCols + 3 (when calc exists)

    // 算式列和金额列的位置（1-indexed）
    const FORMULA_COL = calc ? maxMidCols + 2 : 0;
    const AMOUNT_COL = calc ? maxMidCols + 3 : 0;

    // 列宽：一次性设置，确保内容显示完整（基本信息的标签也放在数据列位置，需加宽）
    const colConfigs: { width: number }[] = [];
    for (let i = 0; i < totalCols; i++) {
      let width = 24; // 数据列默认宽度（足够显示日期/标签/数值）
      if (i === 0) width = 26; // 标签列
      else if (calc && i === FORMULA_COL - 1) width = 64; // 算式列（0-indexed）
      else if (calc && i === AMOUNT_COL - 1) width = 18; // 金额列（0-indexed）
      colConfigs.push({ width });
    }
    ws.columns = colConfigs;

    let rowIdx = 1;
    const safeMerge = (r: number, c1: number, r2: number, c2: number) => {
      if (c1 < c2) ws.mergeCells(r, c1, r2, c2);
    };
    const mergeAll = () => safeMerge(rowIdx, 1, rowIdx, totalCols);

    // 通用：为行中未使用的列添加边框并合并（从 startCol 到 totalCols）
    const fillAndMergeRest = (row: ExcelJS.Row, startCol: number) => {
      if (startCol > totalCols) return;
      for (let c = startCol; c <= totalCols; c++) {
        row.getCell(c).border = thinBorder;
      }
      safeMerge(rowIdx, startCol, rowIdx, totalCols);
    };

    // ===== 标题 =====
    const titleRow = ws.getRow(rowIdx);
    titleRow.height = 26;
    const titleCell = titleRow.getCell(1);
    titleCell.value = '利息计算表';
    titleCell.font = { name: '宋体', size: 14, bold: true, color: { argb: 'FF1F2A44' } };
    titleCell.alignment = centerAlign;
    titleCell.border = thinBorder;
    mergeAll();
    rowIdx++;

    // 导出时间
    const timeRow = ws.getRow(rowIdx);
    timeRow.height = 14;
    const timeCell = timeRow.getCell(1);
    timeCell.value = `导出时间：${new Date().toLocaleString('zh-CN')}`;
    timeCell.font = { name: '宋体', size: 8, italic: true, color: { argb: 'FF808080' } };
    timeCell.alignment = { horizontal: 'right' as const, vertical: 'middle' as const };
    mergeAll();
    rowIdx++;

    // ===== 区块标题通用函数 =====
    const addSectionTitle = (text: string) => {
      const row = ws.getRow(rowIdx);
      row.height = 18;
      const cell = row.getCell(1);
      cell.value = text;
      cell.font = { name: '宋体', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F2A44' } };
      cell.alignment = { vertical: 'middle' as const, horizontal: 'left' as const, indent: 1 };
      cell.border = thinBorder;
      mergeAll();
      rowIdx++;
    };

    // ===== 案件基本信息（横向2对/行） =====
    addSectionTitle('一、案件基本信息');
    const basicInfo: [string, string][] = [
      ['案号', state.caseNo],
      ['申请执行人', state.creditor],
      ['被执行人', state.debtor],
      ['案由', state.caseReason],
      ['证件号', state.idCard],
      ['执行依据', state.execBasis],
      ['其他费用(元)', state.otherFees],
      ['诉讼费(元)', state.litigationFee],
      ['诉讼请求利息金额(元)', state.interestClaim],
      ['履行期限届满之日', state.dueDate],
    ];
    // 每行2对：col1=label1, col2=val1, col3=label2, col4=val2
    // 剩余列(5..totalCols)合并
    for (let i = 0; i < basicInfo.length; i += 2) {
      const row = ws.getRow(rowIdx);
      row.height = 20;
      // 第1对
      const [l1, v1] = basicInfo[i];
      const lc1 = row.getCell(1);
      lc1.value = l1;
      lc1.font = { name: '宋体', size: 9, bold: true, color: { argb: 'FF1F2A44' } };
      lc1.alignment = wrapAlign;
      lc1.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF5F5F5' } };
      lc1.border = thinBorder;
      const vc1 = row.getCell(2);
      vc1.value = v1;
      vc1.font = { name: '宋体', size: 9 };
      vc1.alignment = wrapAlign;
      vc1.border = thinBorder;
      // 第2对（如果有）
      if (i + 1 < basicInfo.length) {
        const [l2, v2] = basicInfo[i + 1];
        const lc2 = row.getCell(3);
        lc2.value = l2;
        lc2.font = { name: '宋体', size: 9, bold: true, color: { argb: 'FF1F2A44' } };
        lc2.alignment = wrapAlign;
        lc2.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF5F5F5' } };
        lc2.border = thinBorder;
        const vc2 = row.getCell(4);
        vc2.value = v2;
        vc2.font = { name: '宋体', size: 9 };
        vc2.alignment = wrapAlign;
        vc2.border = thinBorder;
      } else {
        // 只有1对，col3/col4 留空带边框
        for (let c = 3; c <= 4; c++) {
          row.getCell(c).border = thinBorder;
          row.getCell(c).fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF5F5F5' } };
        }
        safeMerge(rowIdx, 3, rowIdx, 4);
      }
      // 剩余列合并
      fillAndMergeRest(row, 5);
      rowIdx++;
    }

    // ===== 债权信息（横向） =====
    addSectionTitle(`二、债权信息（共${state.claims.length}笔）`);
    const claimFields: [string, (c: ClaimInput) => string | number][] = [
      ['本金(元)', c => c.principal],
      ['利率类型', c => c.rate_type],
      ['LPR倍数(%)', c => c.rate_type !== '固定利率' ? c.lpr_multiple : '—'],
      ['固定利率(%)', c => c.rate_type === '固定利率' ? c.fixed_rate : '—'],
      ['一年天数', c => c.days_per_year],
      ['起算之日', c => c.start_date],
      ['结算之日', c => c.end_date],
    ];
    // 表头
    {
      const row = ws.getRow(rowIdx);
      row.height = 18;
      const c0 = row.getCell(1);
      c0.value = '项目';
      c0.font = { name: '宋体', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      c0.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC9A227' } };
      c0.alignment = centerAlign;
      c0.border = thinBorder;
      state.claims.forEach((_, i) => {
        const cell = row.getCell(i + 2);
        cell.value = `债权${i + 1}`;
        cell.font = { name: '宋体', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC9A227' } };
        cell.alignment = centerAlign;
        cell.border = thinBorder;
      });
      // 未使用的债权列合并
      if (state.claims.length < maxMidCols) {
        for (let c = state.claims.length + 2; c <= maxMidCols + 1; c++) {
          row.getCell(c).border = thinBorder;
          row.getCell(c).fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC9A227' } };
        }
        safeMerge(rowIdx, state.claims.length + 2, rowIdx, maxMidCols + 1);
      }
      // 算式+金额列也加表头色
      if (calc) {
        for (let c = FORMULA_COL; c <= AMOUNT_COL; c++) {
          row.getCell(c).border = thinBorder;
          row.getCell(c).fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC9A227' } };
        }
        safeMerge(rowIdx, FORMULA_COL, rowIdx, AMOUNT_COL);
      }
      rowIdx++;
    }
    // 数据行
    for (const [label, getter] of claimFields) {
      const row = ws.getRow(rowIdx);
      row.height = 16;
      const labelCell = row.getCell(1);
      labelCell.value = label;
      labelCell.font = { name: '宋体', size: 9, bold: true };
      labelCell.alignment = wrapAlign;
      labelCell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF5F5F5' } };
      labelCell.border = thinBorder;
      state.claims.forEach((claim, i) => {
        const cell = row.getCell(i + 2);
        const v = getter(claim);
        cell.value = typeof v === 'number' ? Number(v.toFixed(2)) : v;
        cell.font = { name: '宋体', size: 9 };
        cell.alignment = typeof v === 'number' ? rightAlign : wrapAlign;
        cell.border = thinBorder;
      });
      // 未使用的债权列合并
      if (state.claims.length < maxMidCols) {
        for (let c = state.claims.length + 2; c <= maxMidCols + 1; c++) {
          row.getCell(c).border = thinBorder;
        }
        safeMerge(rowIdx, state.claims.length + 2, rowIdx, maxMidCols + 1);
      }
      // 算式+金额列合并留空
      if (calc) {
        for (let c = FORMULA_COL; c <= AMOUNT_COL; c++) {
          row.getCell(c).border = thinBorder;
        }
        safeMerge(rowIdx, FORMULA_COL, rowIdx, AMOUNT_COL);
      }
      rowIdx++;
    }

    // ===== 清偿记录（横向） =====
    if (state.payments.length > 0) {
      addSectionTitle(`三、清偿记录（共${state.payments.length}笔）`);
      const payFields: [string, (p: PaymentInput) => string | number][] = [
        ['金额(元)', p => p.amount],
        ['日期', p => p.date],
        ['抵扣顺序', p => p.deduct_order.join(' → ')],
      ];
      // 表头
      {
        const row = ws.getRow(rowIdx);
        row.height = 18;
        const p0 = row.getCell(1);
        p0.value = '项目';
        p0.font = { name: '宋体', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        p0.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC9A227' } };
        p0.alignment = centerAlign;
        p0.border = thinBorder;
        state.payments.forEach((_, i) => {
          const cell = row.getCell(i + 2);
          cell.value = `清偿${i + 1}`;
          cell.font = { name: '宋体', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC9A227' } };
          cell.alignment = centerAlign;
          cell.border = thinBorder;
        });
        if (state.payments.length < maxMidCols) {
          for (let c = state.payments.length + 2; c <= maxMidCols + 1; c++) {
            row.getCell(c).border = thinBorder;
            row.getCell(c).fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC9A227' } };
          }
          safeMerge(rowIdx, state.payments.length + 2, rowIdx, maxMidCols + 1);
        }
        if (calc) {
          for (let c = FORMULA_COL; c <= AMOUNT_COL; c++) {
            row.getCell(c).border = thinBorder;
            row.getCell(c).fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC9A227' } };
          }
          safeMerge(rowIdx, FORMULA_COL, rowIdx, AMOUNT_COL);
        }
        rowIdx++;
      }
      for (const [label, getter] of payFields) {
        const row = ws.getRow(rowIdx);
        // 抵扣顺序行内容较长，需根据内容自动调整行高
        if (label === '抵扣顺序') {
          let maxLines = 1;
          state.payments.forEach(p => {
            const text = p.deduct_order.join(' → ');
            // 估算换行行数：每列宽约24字符，中文字符占2宽度，留2字符padding
            const estLines = Math.max(1, Math.ceil(text.length / 11));
            if (estLines > maxLines) maxLines = estLines;
          });
          row.height = Math.max(16, maxLines * 15);
        } else {
          row.height = 16;
        }
        const labelCell = row.getCell(1);
        labelCell.value = label;
        labelCell.font = { name: '宋体', size: 9, bold: true };
        labelCell.alignment = wrapAlign;
        labelCell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF5F5F5' } };
        labelCell.border = thinBorder;
        state.payments.forEach((p, i) => {
          const cell = row.getCell(i + 2);
          const v = getter(p);
          cell.value = typeof v === 'number' ? Number(v.toFixed(2)) : v;
          cell.font = { name: '宋体', size: 9 };
          cell.alignment = typeof v === 'number' ? rightAlign : wrapAlign;
          cell.border = thinBorder;
        });
        if (state.payments.length < maxMidCols) {
          for (let c = state.payments.length + 2; c <= maxMidCols + 1; c++) {
            row.getCell(c).border = thinBorder;
          }
          safeMerge(rowIdx, state.payments.length + 2, rowIdx, maxMidCols + 1);
        }
        if (calc) {
          for (let c = FORMULA_COL; c <= AMOUNT_COL; c++) {
            row.getCell(c).border = thinBorder;
          }
          safeMerge(rowIdx, FORMULA_COL, rowIdx, AMOUNT_COL);
        }
        rowIdx++;
      }
    }

    // ===== 利息计算算式 =====
    if (calc) {
      const sectionIdx = state.payments.length > 0 ? '四' : '三';
      addSectionTitle(`${sectionIdx}、利息计算算式`);

      // 算式表头：col1=项目, cols2..(maxMidCols+1)合并=算式, col(maxMidCols+2)=金额
      {
        const row = ws.getRow(rowIdx);
        row.height = 18;
        // 合并数据列作为算式列
        safeMerge(rowIdx, 2, rowIdx, FORMULA_COL);
        const headerCells = [
          { col: 1, val: '项目' },
          { col: 2, val: '算式' },
          { col: AMOUNT_COL, val: '金额(元)' },
        ];
        for (const { col, val } of headerCells) {
          const cell = row.getCell(col);
          cell.value = val;
          cell.font = { name: '宋体', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC9A227' } };
          cell.alignment = centerAlign;
          cell.border = thinBorder;
        }
        // 合并区域内的其他单元格也加边框+底色
        for (let c = 3; c <= FORMULA_COL; c++) {
          row.getCell(c).border = thinBorder;
          row.getCell(c).fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFC9A227' } };
        }
        rowIdx++;
      }

      // 通用：添加算式行
      const addFormulaRow = (label: string, formula: string, amount: number | string | null, opts?: { labelBold?: boolean; indent?: string; isTotal?: boolean; isSummary?: boolean }) => {
        const row = ws.getRow(rowIdx);
        row.height = 16;
        const indent = opts?.indent || '';
        const lCell = row.getCell(1);
        lCell.value = indent + label;
        lCell.font = { name: '宋体', size: 9, bold: opts?.labelBold || opts?.isTotal || opts?.isSummary || false };
        lCell.alignment = wrapAlign;
        if (opts?.isTotal || opts?.isSummary) {
          lCell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF4D6' } };
        }
        lCell.border = thinBorder;
        // 合并数据列作为算式列
        safeMerge(rowIdx, 2, rowIdx, FORMULA_COL);
        const fCell = row.getCell(2);
        fCell.value = formula || '';
        fCell.font = { name: '宋体', size: 9 };
        fCell.alignment = wrapAlign;
        if (opts?.isTotal || opts?.isSummary) {
          fCell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF4D6' } };
        }
        fCell.border = thinBorder;
        for (let c = 3; c <= FORMULA_COL; c++) {
          row.getCell(c).border = thinBorder;
          if (opts?.isTotal || opts?.isSummary) row.getCell(c).fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF4D6' } };
        }
        // 金额列
        const aCell = row.getCell(AMOUNT_COL);
        if (amount !== null) {
          aCell.value = typeof amount === 'number' ? Number(amount.toFixed(2)) : amount;
        }
        aCell.font = { name: '宋体', size: 9, bold: opts?.isTotal || opts?.isSummary || false };
        aCell.alignment = rightAlign;
        if (opts?.isTotal || opts?.isSummary) {
          aCell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF4D6' } };
        }
        aCell.border = thinBorder;
        rowIdx++;
      };

      // —— 一般债务利息 ——
      addFormulaRow('【一般债务利息】', '', null, { labelBold: true });
      for (let i = 0; i < calc.claims.length; i++) {
        const claim = calc.claims[i];
        addFormulaRow(`债权${i + 1}：本金${formatMoney(claim.principal)}元`, '', null, { labelBold: true });
        const stageGroups = new Map<number, typeof claim.interest_segments>();
        for (const seg of claim.interest_segments) {
          if (!stageGroups.has(seg.stage_idx)) stageGroups.set(seg.stage_idx, []);
          stageGroups.get(seg.stage_idx)!.push(seg);
        }
        for (const [, segs] of stageGroups) {
          const first = segs[0];
          const totalDays = segs.reduce((sum, s) => sum + s.days, 0);
          addFormulaRow(`${first.stage_start} → ${first.stage_end}`, `(${totalDays}天)`, null, { indent: '  ' });
          for (const seg of segs) {
            for (const d of seg.details) {
              addFormulaRow('', d.formula, d.interest, { indent: '    ' });
            }
          }
        }
      }
      addFormulaRow('小计：一般债务利息', '', calc.total_general, { isTotal: true });

      // —— 加倍部分延迟履行利息 ——
      addFormulaRow('【加倍部分延迟履行利息】', '', null, { labelBold: true });
      for (const ds of calc.delay_segments) {
        addFormulaRow(`${ds.period_start}至${ds.period_end}`, ds.formula, ds.delay_interest);
      }
      addFormulaRow('小计：加倍部分延迟履行利息', '', calc.total_delay, { isTotal: true });

      // —— 汇总 ——
      addSectionTitle(`${sectionIdx}附、汇总`);
      addFormulaRow('汇总：债务总金额', '', calc.debt_total, { isSummary: true });
      addFormulaRow('汇总：债务利息总金额', '', calc.debt_interest_total, { isSummary: true });
      addFormulaRow('汇总：尚待清偿利息总金额', '', calc.remaining_interest_total, { isSummary: true });
      if (calc.total_payments_sum > 0) {
        addFormulaRow('汇总：清偿金额之和', '', calc.total_payments_sum, { isSummary: true });
      }
      addFormulaRow('汇总：尚待清偿债务总金额', '', calc.remaining_debt_total, { isSummary: true });
    }

    // 打印设置：A4 纵向，窄边距，填满页面宽度
    ws.pageSetup = {
      paperSize: 9, // A4
      orientation: 'portrait' as const,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        top: 0.25, bottom: 0.25, left: 0.25, right: 0.25,
        header: 0.1, footer: 0.1,
      },
    } as Partial<ExcelJS.PageSetup>;
    (ws as unknown as { pageMargins: unknown }).pageMargins = {
      top: 0.25, bottom: 0.25, left: 0.25, right: 0.25,
      header: 0.1, footer: 0.1,
    };

    // 导出
    const fileCaseNo = (state.caseNo || '未命名案件').replace(/[\\/:*?"<>|]/g, '_');
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileCaseNo}_利息计算表.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importFromExcel: async (file) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.getWorksheet('利息计算表') || wb.worksheets[0];
      if (!ws) return false;

      // 把每行转为字符串数组（按实际列数）
      const getRow = (r: number): string[] => {
        const row = ws.getRow(r);
        const vals: string[] = [];
        const colCount = row.cellCount;
        for (let c = 1; c <= colCount; c++) {
          const cell = row.getCell(c);
          const v = cell.value;
          if (v === null || v === undefined) {
            vals.push('');
          } else if (typeof v === 'object' && 'text' in v) {
            vals.push(String((v as { text: string }).text));
          } else if (typeof v === 'object' && 'result' in v) {
            vals.push(String((v as { result: unknown }).result ?? ''));
          } else {
            vals.push(String(v));
          }
        }
        return vals;
      };

      // 找某行中任意列等于 label，返回下一列的值（支持横向布局 label1|val1|label2|val2）
      const findValue = (label: string): string => {
        for (let r = 1; r <= ws.rowCount; r++) {
          const vals = getRow(r);
          for (let c = 0; c < vals.length - 1; c++) {
            if (vals[c] !== undefined && vals[c].trim() === label) {
              return vals[c + 1] || '';
            }
          }
        }
        return '';
      };

      // 找包含关键字的区块标题行（substring 匹配，如"二、债权信息（共2笔）"含"债权信息"）
      const findSectionRow = (keyword: string): number => {
        for (let r = 1; r <= ws.rowCount; r++) {
          const vals = getRow(r);
          if (vals[0] !== undefined && vals[0].includes(keyword)) {
            return r;
          }
        }
        return -1;
      };

      // 找表头行（col1='项目'，在 sectionRow 之后）
      const findTableHeaderRow = (afterRow: number): number => {
        for (let r = afterRow + 1; r <= Math.min(afterRow + 3, ws.rowCount); r++) {
          const vals = getRow(r);
          if (vals[0] !== undefined && vals[0].trim() === '项目') {
            return r;
          }
        }
        return -1;
      };

      // 解析债权（横向布局：section title → 表头行"项目|债权1|债权2..." → 数据行）
      const claims: ClaimInput[] = [];
      const claimSectionRow = findSectionRow('债权信息');
      if (claimSectionRow > 0) {
        const headerRow = findTableHeaderRow(claimSectionRow);
        if (headerRow > 0) {
          const headerVals = getRow(headerRow);
          // 统计"债权N"列数
          let claimCount = 0;
          for (let c = 1; c < headerVals.length; c++) {
            const v = (headerVals[c] || '').trim();
            if (/^债权\d+$/.test(v)) claimCount++;
            else break;
          }
          const knownClaimLabels = ['本金(元)', '利率类型', 'LPR倍数(%)', '固定利率(%)', '一年天数', '起算之日', '结算之日'];
          for (let c = 0; c < claimCount; c++) {
            const claim = createDefaultClaim();
            for (let r = headerRow + 1; r <= ws.rowCount; r++) {
              const vals = getRow(r);
              if (!vals[0] || !knownClaimLabels.includes(vals[0].trim())) break;
              const key = vals[0].trim();
              const val = vals[c + 1] || '';
              if (key === '本金(元)') claim.principal = parseMoney(val);
              else if (key === '利率类型') claim.rate_type = val || '一年期LPR分段';
              else if (key === 'LPR倍数(%)') claim.lpr_multiple = val && val !== '—' ? parseMoney(val) : 100;
              else if (key === '固定利率(%)') claim.fixed_rate = val && val !== '—' ? parseMoney(val) : 0;
              else if (key === '一年天数') claim.days_per_year = parseInt(val) || 365;
              else if (key === '起算之日') claim.start_date = val;
              else if (key === '结算之日') claim.end_date = val;
            }
            if (claim.principal > 0 || claim.start_date) {
              claims.push(claim);
            }
          }
        }
      }

      // 解析清偿（横向布局：section title → 表头行"项目|清偿1|清偿2..." → 数据行）
      const payments: PaymentInput[] = [];
      const paySectionRow = findSectionRow('清偿记录');
      if (paySectionRow > 0) {
        const headerRow = findTableHeaderRow(paySectionRow);
        if (headerRow > 0) {
          const headerVals = getRow(headerRow);
          let payCount = 0;
          for (let c = 1; c < headerVals.length; c++) {
            const v = (headerVals[c] || '').trim();
            if (/^清偿\d+$/.test(v)) payCount++;
            else break;
          }
          const knownPayLabels = ['金额(元)', '日期', '抵扣顺序'];
          for (let p = 0; p < payCount; p++) {
            const payment = createDefaultPayment();
            for (let r = headerRow + 1; r <= ws.rowCount; r++) {
              const vals = getRow(r);
              if (!vals[0] || !knownPayLabels.includes(vals[0].trim())) break;
              const key = vals[0].trim();
              const val = vals[p + 1] || '';
              if (key === '金额(元)') payment.amount = parseMoney(val);
              else if (key === '日期') payment.date = val;
              else if (key === '抵扣顺序') payment.deduct_order = val ? val.split(' → ') : [];
            }
            if (payment.amount > 0 || payment.date) {
              payments.push(payment);
            }
          }
        }
      }

      set({
        caseNo: findValue('案号'),
        creditor: findValue('申请执行人'),
        debtor: findValue('被执行人'),
        caseReason: findValue('案由'),
        idCard: findValue('证件号'),
        execBasis: findValue('执行依据'),
        otherFees: findValue('其他费用(元)'),
        litigationFee: findValue('诉讼费(元)'),
        interestClaim: findValue('诉讼请求利息金额(元)'),
        dueDate: findValue('履行期限届满之日'),
        claims: claims.length > 0 ? claims : [createDefaultClaim()],
        payments,
        calcResult: null,
        isSaved: false,
        loadedCaseNo: null,
        hasUnsavedChanges: true,
        resultText: '',
      });
      return true;
    } catch {
      return false;
    }
  },

  generateWord: async () => {
    const state = get();
    const calc = state.calcResult;
    if (!calc) return;

    // 日期格式：2026年3月3日（不要大写）
    const cnDate = (d: string): string => {
      if (!d) return '';
      const parts = d.split('-');
      if (parts.length !== 3) return d;
      return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
    };

    const startDate = calc.claims[0]?.start_date ? cnDate(calc.claims[0].start_date) : '';
    const endDate = calc.claims[0]?.end_date ? cnDate(calc.claims[0].end_date) : '';
    const dueDateStr = calc.due_date ? cnDate(calc.due_date) : '';

    // 介绍段（参考"利息计算说明参考.doc"）
    const paymentPart = calc.total_payments_sum > 0
      ? `期间被执行人已清偿${formatMoney(calc.total_payments_sum)}元，分段抵扣后，现明确我方主张被执行人应支付的利息总金额为${formatMoney(calc.remaining_interest_total)}元，全部应付债务总额为${formatMoney(calc.remaining_debt_total)}元。`
      : '';
    const introText = `关于${state.caseNo}与${state.debtor}一案，一般债务利息自${startDate}起算，加倍部分延迟履行利息自执行依据履行期限届满之日即${dueDateStr}起算，全部计算至${endDate}。依据本案生效执行依据及执行申请书计算，截至结算之日，债务总金额为${formatMoney(calc.debt_total)}元：其中债务本金为${formatMoney(calc.total_principal)}元，不计一般债务利息的其他债务为${formatMoney(calc.other_fees)}元，利息总额为${formatMoney(calc.debt_interest_total)}元（含一般债务利息${formatMoney(calc.total_general)}元，加倍部分延迟履行利息${formatMoney(calc.total_delay)}元），诉讼费用为${formatMoney(calc.litigation_fee)}元。${paymentPart}`;

    // 字体常量
    const FONT_HEI = '黑体';
    const FONT_FANG = '仿宋';
    const FONT_SONG = '宋体';
    const PT_22 = 44; // 22pt → half-points
    const PT_16 = 32; // 16pt
    const PT_10_5 = 21; // 10.5pt

    // 段落构造助手
    // 行距规则：参考文档 rule=4（固定值），正文27pt=540twips，明细12pt=240twips
    // 首行缩进: twips，16pt×2字符=32pt=640twips，10.5pt×2字符=21pt=420twips
    const p = (text: string, opts?: {
      font?: string;
      size?: number;
      bold?: boolean;
      align?: (typeof AlignmentType)[keyof typeof AlignmentType];
      firstLineIndent?: number; // twips
      lineSpacing?: number; // twips
      lineRule?: (typeof LineRuleType)[keyof typeof LineRuleType];
    }): Paragraph => {
      const font = opts?.font || FONT_FANG;
      const size = opts?.size || PT_16;
      const lineSpacing = opts?.lineSpacing ?? 520; // 默认正文 26pt
      const lineRule = opts?.lineRule ?? LineRuleType.AT_LEAST; // 默认最小值
      return new Paragraph({
        alignment: opts?.align,
        indent: opts?.firstLineIndent ? { firstLine: opts.firstLineIndent } : undefined,
        spacing: {
          before: 0,
          after: 0,
          line: lineSpacing,
          lineRule,
        },
        children: [
          new TextRun({
            text,
            font: { name: font, eastAsia: font },
            size,
            bold: opts?.bold || false,
          }),
        ],
      });
    };

    // 缩进常量（twips）
    const INDENT_2CHAR_16PT = 640;  // 32pt × 20（正文2字符）
    const INDENT_DETAIL = 420;       // 明细算式行缩进 21pt

    // 正文行距：26pt 最小值 = 520 twips（lineRule=AT_LEAST）
    const LINE_BODY = 520;
    // 标题行距：30pt 最小值 = 600 twips（lineRule=AT_LEAST）
    const LINE_TITLE = 600;
    // 明细行距：单倍行距（lineRule=AUTO，line=240 表示单倍）
    const LINE_DETAIL = 240;

    const paragraphs: Paragraph[] = [];

    // [1] 标题：黑体22pt 居中 最小值30pt 无缩进
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0, line: LINE_TITLE, lineRule: LineRuleType.AT_LEAST },
      children: [
        new TextRun({
          text: '利息计算说明',
          font: { name: FONT_HEI, eastAsia: FONT_HEI },
          size: PT_22,
        }),
      ],
    }));

    // [2] 介绍段：仿宋16pt 两端对齐 首行缩进2字符(640twips) 固定值27pt
    paragraphs.push(p(introText, {
      font: FONT_FANG, size: PT_16, align: AlignmentType.JUSTIFIED,
      firstLineIndent: INDENT_2CHAR_16PT, lineSpacing: LINE_BODY,
    }));

    // [3] 特此说明
    paragraphs.push(p('特此说明', {
      font: FONT_FANG, size: PT_16, align: AlignmentType.JUSTIFIED,
      firstLineIndent: INDENT_2CHAR_16PT, lineSpacing: LINE_BODY,
    }));

    // [4-6] 3个空行（仿宋16pt 固定值27pt 首行缩进2字符）
    for (let i = 0; i < 3; i++) {
      paragraphs.push(p('', {
        font: FONT_FANG, size: PT_16,
        firstLineIndent: INDENT_2CHAR_16PT, lineSpacing: LINE_BODY,
      }));
    }

    // [7] 申请执行人： 居中（参考文档带前导空格，但align=1居中即可）
    paragraphs.push(p('申请执行人：', {
      font: FONT_FANG, size: PT_16, align: AlignmentType.CENTER,
      firstLineIndent: INDENT_2CHAR_16PT, lineSpacing: LINE_BODY,
    }));

    // [8] 空行（申请执行人与年月日之间留一行空白）
    paragraphs.push(p('', {
      font: FONT_FANG, size: PT_16, lineSpacing: LINE_BODY,
    }));

    // [9] 年 月 日 右对齐
    paragraphs.push(p('年    月    日', {
      font: FONT_FANG, size: PT_16, align: AlignmentType.RIGHT,
      firstLineIndent: INDENT_2CHAR_16PT, lineSpacing: LINE_BODY,
    }));

    // [10-11] 2个空行（仿宋16pt，无缩进，固定值27pt）
    for (let i = 0; i < 2; i++) {
      paragraphs.push(p('', {
        font: FONT_FANG, size: PT_16, lineSpacing: LINE_BODY,
      }));
    }

    // [12] 附计算明细如下：宋体10.5pt 单倍行距 无缩进
    paragraphs.push(p('附计算明细如下：', {
      font: FONT_SONG, size: PT_10_5, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));

    // [13] 一般债务利息： 宋体10.5pt 加粗
    paragraphs.push(p('一般债务利息：', {
      font: FONT_SONG, size: PT_10_5, bold: true, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));

    // 一般债务利息明细（按债权分组）
    for (let i = 0; i < calc.claims.length; i++) {
      const claim = calc.claims[i];
      // 债权N：本金X元（无缩进）
      paragraphs.push(p(`债权${i + 1}：本金${formatMoney(claim.principal)}元`, {
        font: FONT_SONG, size: PT_10_5, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
      }));
      // 按大阶段分组
      const stageGroups = new Map<number, typeof claim.interest_segments>();
      for (const seg of claim.interest_segments) {
        if (!stageGroups.has(seg.stage_idx)) stageGroups.set(seg.stage_idx, []);
        stageGroups.get(seg.stage_idx)!.push(seg);
      }
      for (const [, segs] of stageGroups) {
        const first = segs[0];
        const totalDays = segs.reduce((sum, s) => sum + s.days, 0);
        // 阶段标题（无缩进）
        paragraphs.push(p(`${first.stage_start} → ${first.stage_end}  (${totalDays}天)`, {
          font: FONT_SONG, size: PT_10_5, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
        }));
        // 各LPR小分段算式（首行缩进21pt=420twips，匹配参考文档）
        for (const seg of segs) {
          for (const d of seg.details) {
            paragraphs.push(p(d.formula, {
              font: FONT_SONG, size: PT_10_5,
              firstLineIndent: INDENT_DETAIL, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
            }));
          }
        }
      }
    }
    // 小计（首行缩进21pt）
    paragraphs.push(p(`小计：${formatMoney(calc.total_general)}元`, {
      font: FONT_SONG, size: PT_10_5,
      firstLineIndent: INDENT_DETAIL, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));

    // 空行
    paragraphs.push(p('', {
      font: FONT_SONG, size: PT_10_5,
      firstLineIndent: INDENT_DETAIL, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));

    // 加倍部分延迟履行利息：
    paragraphs.push(p('加倍部分延迟履行利息：', {
      font: FONT_SONG, size: PT_10_5, bold: true, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));
    for (const ds of calc.delay_segments) {
      // 参考文档格式：2024-07-03至2025-07-02：(20,000.00 + 1,000.00) × 0.0175% × 365 = 1,341.38
      paragraphs.push(p(`${ds.period_start}至${ds.period_end}：${ds.formula}`, {
        font: FONT_SONG, size: PT_10_5,
        firstLineIndent: INDENT_DETAIL, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
      }));
    }
    paragraphs.push(p(`小计：${formatMoney(calc.total_delay)}元`, {
      font: FONT_SONG, size: PT_10_5,
      firstLineIndent: INDENT_DETAIL, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));

    // 空行
    paragraphs.push(p('', {
      font: FONT_SONG, size: PT_10_5,
      firstLineIndent: INDENT_DETAIL, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));

    // 债务金额统计（参考文档格式：汇总：单独成段加粗，各项首行缩进21pt不加粗）
    paragraphs.push(p('汇总：', {
      font: FONT_SONG, size: PT_10_5, bold: true,
      lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));
    paragraphs.push(p(`债务总金额 = ${formatMoney(calc.total_principal)}(本金) + ${formatMoney(calc.total_general)}(一般利息) + ${formatMoney(calc.other_fees)}(其他费用) + ${formatMoney(calc.litigation_fee)}(诉讼费用) + ${formatMoney(calc.total_delay)}(延迟利息) = ${formatMoney(calc.debt_total)}元`, {
      font: FONT_SONG, size: PT_10_5,
      firstLineIndent: INDENT_DETAIL, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));
    paragraphs.push(p(`债务利息总金额 = ${formatMoney(calc.debt_interest_total)}元`, {
      font: FONT_SONG, size: PT_10_5,
      firstLineIndent: INDENT_DETAIL, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));
    paragraphs.push(p(`尚待清偿利息总金额 = ${formatMoney(calc.remaining_interest_total)}元`, {
      font: FONT_SONG, size: PT_10_5,
      firstLineIndent: INDENT_DETAIL, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));
    if (calc.total_payments_sum > 0) {
      paragraphs.push(p(`清偿金额之和 = ${formatMoney(calc.total_payments_sum)}元`, {
        font: FONT_SONG, size: PT_10_5,
        firstLineIndent: INDENT_DETAIL, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
      }));
    }
    paragraphs.push(p(`尚待清偿债务总金额 = ${formatMoney(calc.remaining_debt_total)}元`, {
      font: FONT_SONG, size: PT_10_5,
      firstLineIndent: INDENT_DETAIL, lineSpacing: LINE_DETAIL, lineRule: LineRuleType.AUTO,
    }));

    // 构建文档（页边距：上下2.54cm=1440twips，左右3.17cm=1800twips）
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1800,
              right: 1800,
            },
          },
        },
        children: paragraphs,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileCaseNo = (state.caseNo || '未命名案件').replace(/[\\/:*?"<>|]/g, '_');
    a.download = `${fileCaseNo}_利息计算说明.docx`;
    a.click();
    URL.revokeObjectURL(url);
  },
}));
