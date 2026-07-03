import { useEffect, useRef, useState } from 'react';
import { useDistributionStore } from '@/store/distributionStore';
import { useCaseStore } from '@/store/caseStore';
import MoneyInput from '@/components/MoneyInput';
import ConfirmDialog from '@/components/ConfirmDialog';
import type { CaseRecord } from '@core/types';

const CLAIM_PRIORITIES = ['第一顺位', '第二顺位', '第三顺位', '第四顺位'];

const CLAIM_TYPES = [
  '执行费用（共益）',
  '船舶航空器优先权',
  '职工债权（工资）',
  '商品房购房款本金返还请求权',
  '建设工程价款优先受偿权',
  '有担保债权',
  '职工债权（经济补偿金等）',
  '税收优先权',
  '人身损害赔偿中的医疗费用（含附带民事赔偿医疗费）',
  '刑事退赔',
  '普通债权',
  '罚款（罚金）',
  '没收财产',
];

const EMPTY_FORM = {
  case_no: '', creditor: '', debtor: '', id_card: '',
  exec_basis: '', case_reason: '', principal: '',
  interest: '', litigation_fee: '',
  claim_priority: '第一顺位',
  claim_type: '普通债权',
  boost_ratio: '0',
};

export default function Distribution() {
  const store = useDistributionStore();
  const caseStore = useCaseStore();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingIdx, setEditingIdx] = useState(-1);
  // 从库导入弹窗状态
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedCaseNos, setSelectedCaseNos] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  // 导出/导入状态提示
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  // 隐藏的文件选择 input
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 清空确认弹窗
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  // 空表格导出确认弹窗
  const [showEmptyExportConfirm, setShowEmptyExportConfirm] = useState(false);

  // 仅在组件挂载时加载一次案件库
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    caseStore.loadAll();
  }, [caseStore]);

  // 3秒后清除提示
  useEffect(() => {
    if (exportMsg) {
      const t = setTimeout(() => setExportMsg(''), 3000);
      return () => clearTimeout(t);
    }
  }, [exportMsg]);

  const setField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAddOrUpdate = () => {
    if (!form.case_no && !form.creditor) return;
    const caseData = {
      case_no: form.case_no,
      creditor: form.creditor,
      debtor: form.debtor,
      id_card: form.id_card,
      exec_basis: form.exec_basis,
      case_reason: form.case_reason,
      principal: parseFloat(form.principal.replace(/,/g, '')) || 0,
      interest: parseFloat(form.interest.replace(/,/g, '')) || 0,
      litigation_fee: parseFloat(form.litigation_fee.replace(/,/g, '')) || 0,
      claim_priority: form.claim_priority,
      claim_type: form.claim_type,
      boost_ratio: parseFloat(form.boost_ratio) || 0,
    };
    if (editingIdx >= 0) {
      store.updateCase(editingIdx, caseData);
      setEditingIdx(-1);
    } else {
      store.addCase(caseData);
    }
    setForm({ ...EMPTY_FORM });
  };

  const handleEdit = (idx: number) => {
    const c = store.cases[idx];
    setForm({
      case_no: c.case_no, creditor: c.creditor, debtor: c.debtor,
      id_card: c.id_card, exec_basis: c.exec_basis, case_reason: c.case_reason,
      principal: String(c.principal), interest: String(c.interest),
      litigation_fee: String(c.litigation_fee),
      claim_priority: c.claim_priority,
      claim_type: c.claim_type,
      boost_ratio: String(c.boost_ratio || 0),
    });
    setEditingIdx(idx);
  };

  // 打开"从库导入"弹窗
  const handleOpenImport = () => {
    setSelectedCaseNos([]);
    setSearchKeyword('');
    setShowImportModal(true);
  };

  const toggleSelect = (caseNo: string) => {
    setSelectedCaseNos(prev =>
      prev.includes(caseNo) ? prev.filter(c => c !== caseNo) : [...prev, caseNo]
    );
  };

  const handleConfirmImport = () => {
    const records: CaseRecord[] = selectedCaseNos
      .map(no => caseStore.get(no))
      .filter((r): r is CaseRecord => r !== null);
    if (records.length === 0) {
      setShowImportModal(false);
      return;
    }
    store.importFromDb(records);
    setExportMsg(`已导入 ${records.length} 条案件`);
    setShowImportModal(false);
  };

  // 导出分配计算表
  const handleExport = async () => {
    // 空列表时提示是否导出空模板
    if (store.cases.length === 0) {
      setShowEmptyExportConfirm(true);
      return;
    }
    setExporting(true);
    setExportMsg('');
    try {
      await store.exportToExcel();
      setExportMsg('导出成功');
    } catch (e) {
      setExportMsg(`导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  // 确认导出空模板
  const handleConfirmEmptyExport = async () => {
    setShowEmptyExportConfirm(false);
    setExporting(true);
    setExportMsg('');
    try {
      await store.exportEmptyTemplate();
      setExportMsg('已导出空表格模板');
    } catch (e) {
      setExportMsg(`导出失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  // 生成 Word 分配方案文书
  const handleGenerateWord = async () => {
    setExporting(true);
    setExportMsg('');
    try {
      await store.generateWord();
      setExportMsg('Word 方案已生成');
    } catch (e) {
      setExportMsg(`生成失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  // 导入分配计算表
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExportMsg('正在导入...');
    try {
      const ok = await store.importFromExcel(file);
      setExportMsg(ok ? `导入成功，共 ${store.cases.length} 条案件` : '导入失败：未识别到有效数据');
    } catch (err) {
      setExportMsg(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    }
    // 清空 input value 以便重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredCaseNos = caseStore.search(searchKeyword);

  return (
    <div className="max-w-7xl mx-auto">
      {/* 页面标题 + 右上角操作按钮（与利息计算模块保持同频） */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-navy">分配方案</h1>
          <p className="text-gray-500 mt-1 text-sm">按顺位分配执行款项 · 诉讼费优先扣除 · 自动生成方案</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {exportMsg && (
            <span className={`text-sm px-3 py-1 rounded-lg ${
              exportMsg.includes('失败') ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'
            }`}>{exportMsg}</span>
          )}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
            className="hidden" onChange={handleImportExcel} />
          <button className="btn-outline text-sm py-2 px-3"
            onClick={() => fileInputRef.current?.click()}
            disabled={exporting}>
            导入分配表
          </button>
          <button className="btn-outline text-sm py-2 px-3"
            onClick={handleExport}
            disabled={exporting}>
            {exporting ? '导出中...' : '导出分配表'}
          </button>
          <button className="btn-outline text-sm py-2 px-3"
            onClick={handleGenerateWord}
            disabled={exporting || store.cases.length === 0}>
            生成Word方案
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* 左侧：输入区 */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* 分配总金额 */}
          <section className="card p-5">
            <h2 className="text-base font-semibold text-navy mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-gold rounded-full" />
              分配总金额
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <MoneyInput value={store.totalAmount}
                  onChange={v => store.setTotalAmount(v)} placeholder="请输入可分配的总金额" />
              </div>
              <button className="btn-gold whitespace-nowrap" onClick={() => store.calculate()}>
                计算分配
              </button>
            </div>
          </section>

          {/* 案件录入表单 */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-navy flex items-center gap-2">
                <span className="w-1 h-4 bg-gold rounded-full" />
                {editingIdx >= 0 ? `编辑案件 ${editingIdx + 1}` : '添加案件'}
              </h2>
              <div className="flex gap-2">
                <button className="btn-outline text-sm py-1.5 px-3"
                  onClick={handleOpenImport}>
                  从库导入
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <label className="label-text">案号</label>
                <input className="input-field" value={form.case_no}
                  onChange={e => setField('case_no', e.target.value)} />
              </div>
              <div>
                <label className="label-text">案由</label>
                <input className="input-field" value={form.case_reason}
                  onChange={e => setField('case_reason', e.target.value)} />
              </div>
              <div>
                <label className="label-text">债权人</label>
                <input className="input-field" value={form.creditor}
                  onChange={e => setField('creditor', e.target.value)} />
              </div>
              <div>
                <label className="label-text">债务人</label>
                <input className="input-field" value={form.debtor}
                  onChange={e => setField('debtor', e.target.value)} />
              </div>
              <div>
                <label className="label-text">证件号（债权人）</label>
                <input className="input-field" value={form.id_card}
                  onChange={e => setField('id_card', e.target.value)} />
              </div>
              <div>
                <label className="label-text">执行依据</label>
                <input className="input-field" value={form.exec_basis}
                  onChange={e => setField('exec_basis', e.target.value)} />
              </div>
              <div>
                <label className="label-text">本金（元）</label>
                <MoneyInput value={form.principal}
                  onChange={v => setField('principal', v)} />
              </div>
              <div>
                <label className="label-text">利息（元）</label>
                <MoneyInput value={form.interest}
                  onChange={v => setField('interest', v)} />
              </div>
              <div>
                <label className="label-text">诉讼费（元）</label>
                <MoneyInput value={form.litigation_fee}
                  onChange={v => setField('litigation_fee', v)} />
              </div>
              <div>
                <label className="label-text">债权顺位</label>
                <select className="input-field" value={form.claim_priority}
                  onChange={e => setField('claim_priority', e.target.value)}>
                  {CLAIM_PRIORITIES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label-text">债权类型</label>
                <select className="input-field" value={form.claim_type}
                  onChange={e => setField('claim_type', e.target.value)}>
                  {CLAIM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label-text">提高比例</label>
                <div className="relative">
                  <input className="input-field pr-8" type="number" min="0" step="1"
                    value={form.boost_ratio}
                    onChange={e => setField('boost_ratio', e.target.value)}
                    placeholder="0" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button className="btn-primary" onClick={handleAddOrUpdate}>
                {editingIdx >= 0 ? '更新案件' : '添加案件'}
              </button>
              {editingIdx >= 0 && (
                <button className="btn-outline" onClick={() => {
                  setEditingIdx(-1);
                  setForm({ ...EMPTY_FORM });
                }}>取消编辑</button>
              )}
            </div>
          </section>

          {/* 案件列表 */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-navy flex items-center gap-2">
                <span className="w-1 h-4 bg-gold rounded-full" />
                案件列表 ({store.cases.length})
              </h2>
              {store.cases.length > 0 && (
                <button className="text-red-500 text-sm hover:text-red-700"
                  onClick={() => setShowClearConfirm(true)}>
                  清空全部
                </button>
              )}
            </div>

            {store.cases.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">暂无案件，请添加</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="text-left py-2 px-2 font-medium">序号</th>
                      <th className="text-left py-2 px-2 font-medium">案号</th>
                      <th className="text-left py-2 px-2 font-medium">债权人</th>
                      <th className="text-right py-2 px-2 font-medium">本金</th>
                      <th className="text-right py-2 px-2 font-medium">利息</th>
                      <th className="text-right py-2 px-2 font-medium">诉讼费</th>
                      <th className="text-center py-2 px-2 font-medium">顺位</th>
                      <th className="text-center py-2 px-2 font-medium">类型</th>
                      <th className="text-right py-2 px-2 font-medium">提高</th>
                      <th className="text-center py-2 px-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.cases.map((c, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-2 text-gray-400">{idx + 1}</td>
                        <td className="py-2 px-2 text-navy font-medium">{c.case_no || '-'}</td>
                        <td className="py-2 px-2">{c.creditor || '-'}</td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{c.principal.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{c.interest.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        <td className="py-2 px-2 text-right font-mono text-xs">{c.litigation_fee.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                        <td className="py-2 px-2 text-center">
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-navy/5 text-navy">{c.claim_priority}</span>
                        </td>
                        <td className="py-2 px-2 text-center text-xs text-gray-600">{c.claim_type}</td>
                        <td className="py-2 px-2 text-right font-mono text-xs">
                          {c.boost_ratio > 0 ? `${c.boost_ratio}%` : '-'}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button className="text-navy text-xs hover:text-navy-light mr-2"
                            onClick={() => handleEdit(idx)}>编辑</button>
                          <button className="text-red-500 text-xs hover:text-red-700"
                            onClick={() => store.deleteCase(idx)}>删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* 右侧：结果区 */}
        <div className="w-[440px] flex-shrink-0">
          <div className="card sticky top-6">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="text-base font-semibold text-navy">分配方案结果</h2>
              {store.resultText && (
                <button className="text-xs text-gold-dim hover:text-gold"
                  onClick={() => navigator.clipboard.writeText(store.resultText)}>
                  复制结果
                </button>
              )}
            </div>
            <div className="p-4">
              {store.resultText ? (
                <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all max-h-[70vh] overflow-y-auto leading-relaxed">
                  {store.resultText}
                </pre>
              ) : (
                <div className="text-center py-16 text-gray-400">
                  <p className="text-sm">添加案件并设置总金额后</p>
                  <p className="text-sm">点击「计算分配」查看结果</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 从库导入弹窗 */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-[640px] max-h-[80vh] flex flex-col">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-navy">从案件库导入（可多选，按选择顺序排列）</h3>
              <button className="text-gray-400 hover:text-gray-600"
                onClick={() => setShowImportModal(false)}>✕</button>
            </div>
            <div className="px-5 py-3 border-b border-gray-100">
              <input className="input-field" placeholder="搜索案号/债权人/债务人/案由/证件号"
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)} />
              <p className="text-xs text-gray-500 mt-2">
                已选 {selectedCaseNos.length} 件 · 点击案件可选中/取消，按选择顺序排列
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {filteredCaseNos.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">案件库为空，请先在「利息计算」中保存案件</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredCaseNos.map(no => {
                    const c = caseStore.get(no);
                    if (!c) return null;
                    const selectedIdx = selectedCaseNos.indexOf(no);
                    const isSelected = selectedIdx >= 0;
                    return (
                      <li key={no} className="py-2 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleSelect(no)}>
                        <span className={`w-6 h-6 flex items-center justify-center rounded border text-xs ${
                          isSelected
                            ? 'bg-navy text-white border-navy'
                            : 'border-gray-300 text-transparent'
                        }`}>
                          {isSelected ? selectedIdx + 1 : ''}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-navy font-medium truncate">{c.case_no || '-'}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {c.creditor || '-'} · {c.debtor || '-'} · {c.case_reason || '-'}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400">
                          {c.last_modified ? new Date(c.last_modified).toLocaleDateString('zh-CN') : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {selectedCaseNos.length > 0 ? `将按选择顺序导入 ${selectedCaseNos.length} 件` : '请选择要导入的案件'}
              </span>
              <div className="flex gap-2">
                <button className="btn-outline" onClick={() => setShowImportModal(false)}>取消</button>
                <button className="btn-primary"
                  disabled={selectedCaseNos.length === 0}
                  onClick={handleConfirmImport}>
                  导入所选 {selectedCaseNos.length || ''} 件
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 清空确认弹窗 */}
      <ConfirmDialog
        open={showClearConfirm}
        title="清空确认"
        message="确定清空所有案件？"
        confirmText="清空"
        onConfirm={() => {
          store.clearAll();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* 空表格导出确认弹窗 */}
      <ConfirmDialog
        open={showEmptyExportConfirm}
        title="导出空表格"
        message="案件列表为空，是否导出空表格用于填表？"
        confirmText="导出空表格"
        onConfirm={handleConfirmEmptyExport}
        onCancel={() => setShowEmptyExportConfirm(false)}
      />
    </div>
  );
}
