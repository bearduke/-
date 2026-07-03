import { create } from 'zustand';
import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageNumber,
  Footer,
} from 'docx';
import {
  calculateDistribution,
  formatDistributionResult,
  importExcelRow,
  parseMoney,
} from '@core';
import type {
  CaseRecord,
  DistributionCase,
  DistributionResult,
} from '@core/types';

export interface DistributionState {
  cases: DistributionCase[];
  totalAmount: string;
  results: DistributionResult[];
  remaining: number;
  resultText: string;

  addCase: (caseData: Omit<DistributionCase, 'id'>) => void;
  updateCase: (idx: number, caseData: Partial<DistributionCase>) => void;
  deleteCase: (idx: number) => void;
  clearAll: () => void;
  setTotalAmount: (amount: string) => void;
  calculate: () => void;
  importFromDb: (records: CaseRecord[]) => void;
  setResultText: (text: string) => void;
  exportToExcel: () => Promise<void>;
  exportEmptyTemplate: () => Promise<void>;
  generateWord: () => Promise<void>;
  importFromExcel: (file: File) => Promise<boolean>;
}

export const useDistributionStore = create<DistributionState>((set, get) => ({
  cases: [],
  totalAmount: '',
  results: [],
  remaining: 0,
  resultText: '',

  addCase: caseData =>
    set(state => ({
      cases: [...state.cases, { ...caseData, id: state.cases.length + 1 }],
    })),

  updateCase: (idx, caseData) =>
    set(state => {
      const cases = [...state.cases];
      if (idx >= 0 && idx < cases.length) {
        cases[idx] = { ...cases[idx], ...caseData, id: cases[idx].id };
      }
      return { cases };
    }),

  deleteCase: idx =>
    set(state => ({
      cases: state.cases
        .filter((_, i) => i !== idx)
        .map((c, i) => ({ ...c, id: i + 1 })),
    })),

  clearAll: () =>
    set({ cases: [], totalAmount: '', results: [], remaining: 0, resultText: '' }),

  setTotalAmount: amount => set({ totalAmount: amount }),

  calculate: () => {
    const state = get();
    const total = parseMoney(state.totalAmount);
    const output = calculateDistribution(state.cases, total);
    set({
      results: output.results,
      remaining: output.remaining,
      resultText: formatDistributionResult(output.results, output.remaining, total),
    });
  },

  // 从案件库导入：按传入顺序追加（多选+按选择顺序排列）
  importFromDb: records => {
    if (!records || records.length === 0) return;
    set(state => {
      const newCases: DistributionCase[] = records.map((r, i) => ({
        id: state.cases.length + i + 1,
        case_no: r.case_no || '',
        creditor: r.creditor || '',
        debtor: r.debtor || '',
        id_card: r.id_card || '',
        exec_basis: r.exec_basis || '',
        case_reason: r.case_reason || '',
        // 案件库中的本金/利息/诉讼费：优先取 calc_result 中的剩余值，其次取顶层字段
        principal: r.calc_result
          ? Math.round((r.calc_result.total_remaining_principal + r.calc_result.remaining_other) * 100) / 100
          : (r.principal ?? 0),
        interest: r.calc_result
          ? Math.round(r.calc_result.total_remaining_interest * 100) / 100
          : (r.interest ?? 0),
        litigation_fee: r.calc_result
          ? Math.round(r.calc_result.remaining_litigation * 100) / 100
          : (r.litigation_fee ?? 0),
        claim_priority: '第一顺位',
        claim_type: '普通债权',
        boost_ratio: 0,
      }));
      return { cases: [...state.cases, ...newCases] };
    });
  },

  setResultText: text => set({ resultText: text }),

  // 导出分配计算表（参考 Python controller.py export_dist_excel + model.py export_to_excel_data）
  exportToExcel: async () => {
    const state = get();
    if (state.cases.length === 0) {
      // 空列表时由 UI 层提示，这里直接返回
      return;
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = '执行小助手';
    wb.created = new Date();

    // 样式预设
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
    };
    const headerFill = {
      type: 'pattern' as const, pattern: 'solid' as const,
      fgColor: { argb: 'FF1F2A44' },
    } as const;
    const headerFont: Partial<ExcelJS.Font> = {
      name: '宋体', size: 10, bold: true, color: { argb: 'FFFFFFFF' },
    };
    const cellFont: Partial<ExcelJS.Font> = { name: '宋体', size: 10 };
    const totalFont: Partial<ExcelJS.Font> = {
      name: '宋体', size: 10, bold: true, color: { argb: 'FF1F2A44' },
    };
    const headerAlign: Partial<ExcelJS.Alignment> = {
      vertical: 'middle' as const, horizontal: 'center' as const, wrapText: true,
    };
    const leftAlign: Partial<ExcelJS.Alignment> = {
      vertical: 'middle' as const, horizontal: 'left' as const, wrapText: true,
    };
    const rightAlign: Partial<ExcelJS.Alignment> = {
      vertical: 'middle' as const, horizontal: 'right' as const, wrapText: true,
    };

    const fmtMoney = (n: number) => Number((Math.round(n * 100) / 100).toFixed(2));

    // ===== Sheet 1: 案件数据 =====
    const ws1 = wb.addWorksheet('案件数据', {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { defaultRowHeight: 18 },
    });
    const importHeaders = ['案号', '债权人', '债务人', '证件号（债权人）', '执行依据', '案由', '本金', '利息', '诉讼费', '债权顺位', '债权类型', '提高比例'];
    ws1.columns = [
      { width: 22 }, { width: 16 }, { width: 16 }, { width: 20 },
      { width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 12 }, { width: 20 }, { width: 12 },
    ];
    // 表头
    const hRow1 = ws1.getRow(1);
    hRow1.height = 22;
    importHeaders.forEach((h, i) => {
      const cell = hRow1.getCell(i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.alignment = headerAlign;
      cell.border = thinBorder;
    });
    // 数据行
    state.cases.forEach((c, idx) => {
      const row = ws1.getRow(idx + 2);
      row.height = 18;
      const vals = [
        c.case_no, c.creditor, c.debtor, c.id_card,
        c.exec_basis, c.case_reason,
        fmtMoney(c.principal), fmtMoney(c.interest), fmtMoney(c.litigation_fee),
        c.claim_priority, c.claim_type, c.boost_ratio || 0,
      ];
      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.font = cellFont;
        cell.border = thinBorder;
        if (i >= 6 && i <= 8) {
          cell.alignment = rightAlign;
          cell.numFmt = '#,##0.00';
        } else if (i === 11) {
          // 提高比例列
          cell.alignment = rightAlign;
          cell.numFmt = '0"%"';
        } else {
          cell.alignment = leftAlign;
        }
      });
    });

    // ===== Sheet 2: 分配结果 =====
    if (state.results.length > 0) {
      const ws2 = wb.addWorksheet('分配结果', {
        views: [{ state: 'frozen', ySplit: 1 }],
        properties: { defaultRowHeight: 18 },
      });
      const resultHeaders = ['案号', '申请执行人', '申请执行标的金额', '诉讼费', '本案分配金额', '执行费', '实际发放金额'];
      ws2.columns = [
        { width: 22 }, { width: 16 }, { width: 20 }, { width: 14 },
        { width: 18 }, { width: 14 }, { width: 18 },
      ];
      // 表头
      const hRow2 = ws2.getRow(1);
      hRow2.height = 22;
      resultHeaders.forEach((h, i) => {
        const cell = hRow2.getCell(i + 1);
        cell.value = h;
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.alignment = headerAlign;
        cell.border = thinBorder;
      });

      // 汇总变量
      let totalClaim = 0;
      let totalCost = 0;
      let totalAllocation = 0;
      let totalExecFee = 0;
      let totalActual = 0;

      // 数据行
      state.results.forEach((r, idx) => {
        const c = r.case;
        const claimAmount = c.principal + c.interest + c.litigation_fee;
        const row = ws2.getRow(idx + 2);
        row.height = 18;
        const vals = [
          c.case_no, c.creditor,
          fmtMoney(claimAmount), fmtMoney(c.litigation_fee),
          fmtMoney(r.distributed), fmtMoney(r.exec_fee), fmtMoney(r.actual),
        ];
        vals.forEach((v, i) => {
          const cell = row.getCell(i + 1);
          cell.value = v;
          cell.font = cellFont;
          cell.border = thinBorder;
          if (i >= 2) {
            cell.alignment = rightAlign;
            cell.numFmt = '#,##0.00';
          } else {
            cell.alignment = leftAlign;
          }
        });
        totalClaim += claimAmount;
        totalCost += c.litigation_fee;
        totalAllocation += r.distributed;
        totalExecFee += r.exec_fee;
        totalActual += r.actual;
      });

      // 总计行
      const totalRow = ws2.getRow(state.results.length + 2);
      totalRow.height = 20;
      const totalVals = ['总计', '', fmtMoney(totalClaim), fmtMoney(totalCost), fmtMoney(totalAllocation), fmtMoney(totalExecFee), fmtMoney(totalActual)];
      totalVals.forEach((v, i) => {
        const cell = totalRow.getCell(i + 1);
        cell.value = v;
        cell.font = totalFont;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } } as ExcelJS.Fill;
        cell.border = thinBorder;
        if (i >= 2) {
          cell.alignment = rightAlign;
          cell.numFmt = '#,##0.00';
        } else {
          cell.alignment = leftAlign;
        }
      });

      // 打印设置
      ws2.pageSetup = {
        orientation: 'landscape' as const,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      };
      (ws2 as unknown as { pageMargins: unknown }).pageMargins = {
        left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2,
      };
    }

    // 打印设置（Sheet 1）
    ws1.pageSetup = {
      orientation: 'landscape' as const,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };
    (ws1 as unknown as { pageMargins: unknown }).pageMargins = {
      left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2,
    };

    // ===== 触发下载 =====
    const caseNo = state.cases[0]?.case_no || '';
    const invalidChars = /[<>:"/\\|?*]/g;
    const caseNoClean = caseNo.replace(invalidChars, '_');
    const fileName = caseNoClean
      ? `${caseNoClean}分配方案.xlsx`
      : '分配方案.xlsx';

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // 导出空表格模板（仅含表头，供用户填写后导入）
  exportEmptyTemplate: async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = '执行小助手';
    wb.created = new Date();

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
    };
    const headerFill = {
      type: 'pattern' as const, pattern: 'solid' as const,
      fgColor: { argb: 'FF1F2A44' },
    } as const;
    const headerFont: Partial<ExcelJS.Font> = {
      name: '宋体', size: 10, bold: true, color: { argb: 'FFFFFFFF' },
    };
    const headerAlign: Partial<ExcelJS.Alignment> = {
      vertical: 'middle' as const, horizontal: 'center' as const, wrapText: true,
    };

    const ws1 = wb.addWorksheet('案件数据', {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { defaultRowHeight: 18 },
    });
    const importHeaders = ['案号', '债权人', '债务人', '证件号（债权人）', '执行依据', '案由', '本金', '利息', '诉讼费', '债权顺位', '债权类型', '提高比例'];
    ws1.columns = [
      { width: 22 }, { width: 16 }, { width: 16 }, { width: 20 },
      { width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 12 }, { width: 20 }, { width: 12 },
    ];
    const hRow1 = ws1.getRow(1);
    hRow1.height = 22;
    importHeaders.forEach((h, i) => {
      const cell = hRow1.getCell(i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.alignment = headerAlign;
      cell.border = thinBorder;
    });

    // 为「债权顺位」「债权类型」列添加下拉选项（前 500 行）
    const PRIORITIES_LIST = ['第一顺位', '第二顺位', '第三顺位', '第四顺位'];
    const CLAIM_TYPES_LIST = [
      '执行费用（共益）', '船舶航空器优先权', '职工债权（工资）',
      '商品房购房款本金返还请求权', '建设工程价款优先受偿权', '有担保债权',
      '职工债权（经济补偿金等）', '税收优先权',
      '人身损害赔偿中的医疗费用（含附带民事赔偿医疗费）',
      '刑事退赔', '普通债权', '罚款（罚金）', '没收财产',
    ];
    // Excel 数据验证公式字符串总长度限制约 255 字符，债权类型列表超长
    // 改用「隐藏 Sheet 存放选项」的方式实现下拉
    const listSheet = wb.addWorksheet('选项列表', { state: 'hidden' });
    listSheet.getColumn(1).values = ['债权顺位', ...PRIORITIES_LIST];
    listSheet.getColumn(2).values = ['债权类型', ...CLAIM_TYPES_LIST];

    // 债权顺位下拉（J列 = 第10列）
    for (let r = 2; r <= 500; r++) {
      ws1.getCell(r, 10).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`=选项列表!$A$2:$A$${PRIORITIES_LIST.length + 1}`],
      };
      // 债权类型下拉（K列 = 第11列）
      ws1.getCell(r, 11).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`=选项列表!$B$2:$B$${CLAIM_TYPES_LIST.length + 1}`],
      };
    }

    ws1.pageSetup = {
      orientation: 'landscape' as const,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };
    (ws1 as unknown as { pageMargins: unknown }).pageMargins = {
      left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2,
    };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '分配方案模板.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // 生成分配方案 Word 文档（完整移植 Python controller.py generate_dist_doc）
  generateWord: async () => {
    const state = get();
    // 若未计算，先自动触发计算
    let results = state.results;
    if (results.length === 0 && state.cases.length > 0 && parseMoney(state.totalAmount) > 0) {
      const total = parseMoney(state.totalAmount);
      const output = calculateDistribution(state.cases, total);
      results = output.results;
      set({ results: output.results, remaining: output.remaining,
        resultText: formatDistributionResult(output.results, output.remaining, total) });
    }
    if (results.length === 0) {
      alert('分配计算结果为空，请先设置分配总金额并添加案件');
      return;
    }

    // ===== 字体与样式常量 =====
    const FONT_FANG = '仿宋';
    const FONT_SONG = '宋体';
    const PT_16 = 32;       // 16pt = 32 half-points
    const PT_22 = 44;       // 22pt
    const PT_12 = 24;       // 12pt
    const PT_8 = 16;        // 8pt
    const LINE_26 = 520;    // 26pt 固定值 = 520 twips
    const LINE_14 = 280;    // 14pt 固定值 = 280 twips（表格行）
    const INDENT_32 = 640;  // 32pt 首行缩进 = 640 twips

    // 金额格式化（千分位 + 2位小数）
    const fmtMoney = (n: number) => {
      if (n === null || n === undefined) return '';
      return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // 中文日期格式化（移植 to_chinese_date）
    const toChineseDate = (dt: Date) => {
      const cnNums: Record<string, string> = {
        '0': '〇', '1': '一', '2': '二', '3': '三', '4': '四',
        '5': '五', '6': '六', '7': '七', '8': '八', '9': '九',
      };
      const yearStr = String(dt.getFullYear()).split('').map(ch => cnNums[ch]).join('');
      const month = dt.getMonth() + 1;
      let monthStr: string;
      if (month < 10) monthStr = cnNums[String(month)];
      else if (month === 10) monthStr = '十';
      else monthStr = '十' + cnNums[String(month - 10)];
      const day = dt.getDate();
      let dayStr: string;
      if (day < 10) dayStr = cnNums[String(day)];
      else if (day === 10) dayStr = '十';
      else if (day < 20) dayStr = '十' + cnNums[String(day - 10)];
      else if (day === 20) dayStr = '二十';
      else if (day < 30) dayStr = '二十' + cnNums[String(day - 20)];
      else if (day === 30) dayStr = '三十';
      else dayStr = '三十一';
      return `${yearStr}年${monthStr}月${dayStr}日`;
    };

    // 通用段落构造（仿宋16pt，首行缩进32pt，行距26pt）
    const bodyPara = (text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
      new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: LINE_26, lineRule: 'exact' as const },
        indent: { firstLine: INDENT_32 },
        children: [new TextRun({
          text, font: FONT_FANG, size: PT_16, bold: opts.bold ?? false,
        })],
      });

    // ===== 文档段落构建 =====
    const children: (Paragraph | Table)[] = [];

    // 标题
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240, line: LINE_26, lineRule: 'exact' as const },
      children: [new TextRun({
        text: '执行财产分配方案',
        font: FONT_SONG, size: PT_22, bold: true,
      })],
    }));

    // 案号（右对齐）
    if (state.cases.length > 0) {
      children.push(new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 0, line: LINE_26, lineRule: 'exact' as const },
        children: [new TextRun({ text: state.cases[0].case_no, font: FONT_FANG, size: PT_16 })],
      }));
    }

    // 一、案件的由来及执行情况
    children.push(bodyPara('一、案件的由来及执行情况', { bold: true }));
    if (state.cases.length > 0) {
      const fc = state.cases[0];
      children.push(bodyPara(
        `本院在执行申请执行人${fc.creditor}与被执行人${fc.debtor}${fc.case_reason}案件中，`
        + `因被执行人${fc.debtor}可供执行的财产不足以清偿全部债务，`
        + `需对被执行人${fc.debtor}的执行财产进行分配。`
        + `据此，本院依法组成合议庭，对财产分配进行审查，现已审查完毕。`
      ));
    }

    // 二、各债权人执行情况
    children.push(bodyPara('二、各债权人执行情况', { bold: true }));
    results.forEach((r, idx) => {
      const c = r.case;
      const claimAmount = c.principal + c.interest + c.litigation_fee;
      children.push(bodyPara(
        `${idx + 1}.债权人${c.creditor}：`
        + `执行案号为${c.case_no}，`
        + `执行依据为${c.exec_basis}，`
        + `申请执行的标的金额为${fmtMoney(claimAmount)}元，`
        + `其中债权本金${fmtMoney(c.principal)}元，`
        + `利息${fmtMoney(c.interest)}元，`
        + `诉讼费用${fmtMoney(c.litigation_fee)}元。`
      ));
    });

    // 三、债权分配
    children.push(bodyPara('三、债权分配', { bold: true }));

    const now = new Date();
    const totalAmount = parseMoney(state.totalAmount);
    if (state.cases.length > 0) {
      const fc = state.cases[0];
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      children.push(bodyPara(
        `在执行过程中，截至${y}年${m}月${d}日，`
        + `本院共执行到位被执行人${fc.debtor}名下执行财产${fmtMoney(totalAmount)}元，`
        + `本次可分配款项共${fmtMoney(totalAmount)}元，将作如下顺序分配：`
      ));
    }

    const rules = [
      '1.执行费用（如财产处置中产生的评估费、保管费、拍卖佣金等）/诉讼费用（如案件受理费、保全费等）；',
      '2.优先债权（如职工工资、有担保债权、税款等）；',
      '3.普通债权；',
      '4.处于同一顺位的债权按照各债权占该顺位总债权的比例进行分配，案件执行费从各债权人本案分配金额中计除（到手金额为实际发放金额）。',
    ];
    rules.forEach(rule => children.push(bodyPara(rule)));

    children.push(bodyPara(
      '综上所述，根据《最高人民法院关于适用<中华人民共和国民事诉讼法>的解释》'
      + '第五百零六条、第五百零八条的规定，制定财产分配方案如下：（单位：元）'
    ));

    // ===== 表格 =====
    const borderAll = {
      top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    };
    const cellBorders = {
      top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    };

    const mkCell = (text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
      new TableCell({
        borders: cellBorders,
        children: [new Paragraph({
          alignment: opts.align ?? AlignmentType.CENTER,
          spacing: { before: 0, after: 0, line: LINE_14, lineRule: 'exact' as const },
          children: [new TextRun({
            text, font: FONT_FANG, size: PT_12, bold: opts.bold ?? false,
          })],
        })],
      });

    const headers = ['案号', '申请执行人', '申请执行标的金额', '诉讼费', '本案分配金额', '执行费', '实际发放金额'];
    const headerRow = new TableRow({
      tableHeader: true,
      children: headers.map(h => mkCell(h, { bold: true })),
    });

    let totalClaim = 0, totalCost = 0, totalAlloc = 0, totalExecFee = 0, totalActual = 0;
    const dataRows: TableRow[] = results.map(r => {
      const c = r.case;
      const claimAmount = c.principal + c.interest + c.litigation_fee;
      totalClaim += claimAmount;
      totalCost += c.litigation_fee;
      totalAlloc += r.distributed;
      totalExecFee += r.exec_fee;
      totalActual += r.actual;
      return new TableRow({
        children: [
          mkCell(c.case_no),
          mkCell(c.creditor),
          mkCell(fmtMoney(claimAmount)),
          mkCell(fmtMoney(c.litigation_fee)),
          mkCell(fmtMoney(r.distributed)),
          mkCell(fmtMoney(r.exec_fee)),
          mkCell(fmtMoney(r.actual)),
        ],
      });
    });

    const totalRow = new TableRow({
      children: [
        mkCell('总计', { bold: true }),
        mkCell('', { bold: true }),
        mkCell(fmtMoney(totalClaim), { bold: true }),
        mkCell(fmtMoney(totalCost), { bold: true }),
        mkCell(fmtMoney(totalAlloc), { bold: true }),
        mkCell(fmtMoney(totalExecFee), { bold: true }),
        mkCell(fmtMoney(totalActual), { bold: true }),
      ],
    });

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: borderAll.top, bottom: borderAll.bottom, left: borderAll.left, right: borderAll.right,
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      },
      rows: [headerRow, ...dataRows, totalRow],
    }));

    // 异议条款
    children.push(bodyPara(
      '债权人或者被执行人对分配方案有异议的，应当自收到分配方案之日起十五日内向本院提出书面异议，'
      + '并同时对分配方案提出修正意见。债权人或者被执行人对分配方案提出异议的，'
      + '执行法院应当通知未提出异议的债权人、被执行人。'
    ));
    children.push(bodyPara(
      '未提出异议的债权人、被执行人自收到通知之日起十五日内未提出反对意见的，'
      + '执行法院依异议人的意见对分配方案审查修正后进行分配；提出反对意见的，应当通知异议人。'
      + '异议人可以自收到通知之日起十五日内，以提出反对意见的债权人、被执行人为被告，向执行法院提起诉讼；'
      + '异议人逾期未提起诉讼的，执行法院按照原分配方案进行分配。'
    ));
    children.push(bodyPara('特此告知'));

    // 空行
    children.push(new Paragraph({
      spacing: { before: 0, after: 0, line: LINE_26, lineRule: 'exact' as const },
      children: [new TextRun({ text: '', font: FONT_FANG, size: PT_16 })],
    }));
    children.push(new Paragraph({
      spacing: { before: 0, after: 0, line: LINE_26, lineRule: 'exact' as const },
      children: [new TextRun({ text: '', font: FONT_FANG, size: PT_16 })],
    }));
    children.push(new Paragraph({
      spacing: { before: 0, after: 0, line: LINE_26, lineRule: 'exact' as const },
      children: [new TextRun({ text: '', font: FONT_FANG, size: PT_16 })],
    }));

    // 白色隐藏标记 zdqz（右对齐，白色8pt）
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 0, after: 0 },
      indent: { right: 1300 },
      children: [new TextRun({ text: 'zdqz', font: FONT_FANG, size: PT_8, color: 'FFFFFF' })],
    }));

    // 中文日期（右对齐）
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 0, after: 0, line: LINE_26, lineRule: 'exact' as const },
      children: [new TextRun({ text: toChineseDate(now), font: FONT_FANG, size: PT_16 })],
    }));

    // ===== 页脚（页码） =====
    const footer = new Footer({
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: '- ', font: FONT_FANG, size: PT_12 }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT_FANG, size: PT_12 }),
          new TextRun({ text: ' -', font: FONT_FANG, size: PT_12 }),
        ],
      })],
    });

    // ===== 构建 Document =====
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1800, right: 1800 },
          },
        },
        footers: { default: footer },
        children,
      }],
    });

    // ===== 触发下载 =====
    const caseNo = state.cases[0]?.case_no || '';
    const invalidChars = /[<>:"/\\|?*]/g;
    const caseNoClean = caseNo.replace(invalidChars, '_');
    const fileName = caseNoClean ? `${caseNoClean}分配方案.docx` : '分配方案.docx';

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // 从导出的分配计算表导入案件数据
  importFromExcel: async file => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(arrayBuffer);

      // 优先读取「案件数据」Sheet
      const ws = wb.getWorksheet('案件数据') || wb.worksheets[0];
      if (!ws) return false;

      // 读取表头
      const headerRow = ws.getRow(1);
      const headers: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        headers.push(String(headerRow.getCell(c).value || '').trim());
      }

      // 按行读取数据
      const newCases: DistributionCase[] = [];
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const rowDict: Record<string, unknown> = {};
        let hasData = false;
        for (let c = 1; c <= headers.length; c++) {
          const key = headers[c - 1];
          if (!key) continue;
          const val = row.getCell(c).value;
          rowDict[key] = val;
          if (val !== null && val !== undefined && String(val).trim()) {
            hasData = true;
          }
        }
        if (!hasData) continue;

        const caseData = importExcelRow(rowDict);
        // 跳过案号为"总计"的行
        if (caseData.case_no === '总计') continue;
        newCases.push(caseData);
      }

      if (newCases.length === 0) return false;

      set(state => ({
        cases: [
          ...state.cases,
          ...newCases.map((c, i) => ({ ...c, id: state.cases.length + i + 1 })),
        ],
      }));
      return true;
    } catch (e) {
      console.error('导入分配计算表失败:', e);
      return false;
    }
  },
}));
