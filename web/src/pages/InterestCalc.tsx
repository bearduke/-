import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterestStore } from '@/store/interestStore';
import { formatMoney } from '@core';
import DatePicker from '@/components/DatePicker';
import MoneyInput from '@/components/MoneyInput';
import DeductOrderEditor from '@/components/DeductOrderEditor';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function InterestCalc() {
  const store = useInterestStore();
  const navigate = useNavigate();
  const [deductEditorOpen, setDeductEditorOpen] = useState(false);
  const [editingPaymentIdx, setEditingPaymentIdx] = useState(-1);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const showMsg = (msg: string, isError = false) => {
    if (isError) {
      setSaveError(msg);
      setSaveMsg('');
    } else {
      setSaveMsg(msg);
      setSaveError('');
    }
    setTimeout(() => { setSaveMsg(''); setSaveError(''); }, 3000);
  };

  const handleSave = () => {
    if (!store.caseNo) {
      showMsg('请先填写案号', true);
      return;
    }
    store.saveToDb();
    showMsg('已保存到案件库');
  };

  const handleExportExcel = () => {
    store.exportToExcel();
    showMsg('已导出Excel');
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = await store.importFromExcel(file);
    showMsg(ok ? '导入成功' : '导入失败：文件格式不正确', !ok);
    e.target.value = '';
  };

  const handleGenerateWord = () => {
    if (!store.calcResult) {
      showMsg('请先计算利息', true);
      return;
    }
    store.generateWord();
    showMsg('已生成Word说明');
  };

  const handleGoToCases = () => {
    navigate('/cases');
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-navy">利息计算</h1>
          <p className="text-gray-500 mt-1 text-sm">LPR分段计算 · 多债权交叉 · 加倍部分延迟履行利息</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {saveMsg && (
            <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-lg">{saveMsg}</span>
          )}
          {saveError && (
            <span className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded-lg">{saveError}</span>
          )}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
          <button className="btn-outline text-sm py-2 px-3" onClick={() => fileInputRef.current?.click()}>导入Excel</button>
          <button className="btn-outline text-sm py-2 px-3" onClick={handleExportExcel}>导出Excel</button>
          <button className="btn-outline text-sm py-2 px-3" onClick={handleGenerateWord}>生成Word说明</button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* 左侧：输入区 */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* 基本信息 */}
          <section className="card p-5">
            <h2 className="text-base font-semibold text-navy mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-gold rounded-full" />
              案件基本信息
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <label className="label-text">案号</label>
                <input className="input-field" value={store.caseNo}
                  onChange={e => store.updateField('caseNo', e.target.value)} />
              </div>
              <div>
                <label className="label-text">案由</label>
                <input className="input-field" value={store.caseReason}
                  onChange={e => store.updateField('caseReason', e.target.value)} />
              </div>
              <div>
                <label className="label-text">申请执行人</label>
                <input className="input-field" value={store.creditor}
                  onChange={e => store.updateField('creditor', e.target.value)} />
              </div>
              <div>
                <label className="label-text">被执行人</label>
                <input className="input-field" value={store.debtor}
                  onChange={e => store.updateField('debtor', e.target.value)} />
              </div>
              <div>
                <label className="label-text">证件号</label>
                <input className="input-field" value={store.idCard}
                  onChange={e => store.updateField('idCard', e.target.value)} />
              </div>
              <div>
                <label className="label-text">执行依据</label>
                <input className="input-field" value={store.execBasis}
                  onChange={e => store.updateField('execBasis', e.target.value)} />
              </div>
              <div>
                <label className="label-text">其他费用（元）</label>
                <MoneyInput value={store.otherFees}
                  onChange={v => store.updateField('otherFees', v)} />
              </div>
              <div>
                <label className="label-text">诉讼费（元）</label>
                <MoneyInput value={store.litigationFee}
                  onChange={v => store.updateField('litigationFee', v)} />
              </div>
              <div>
                <label className="label-text">诉讼请求利息金额（元）</label>
                <MoneyInput value={store.interestClaim}
                  onChange={v => store.updateField('interestClaim', v)} />
              </div>
              <div>
                <label className="label-text">履行期限届满之日</label>
                <DatePicker value={store.dueDate}
                  onChange={v => store.updateField('dueDate', v)} />
              </div>
            </div>
          </section>

          {/* 债权信息 */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-navy flex items-center gap-2">
                <span className="w-1 h-4 bg-gold rounded-full" />
                债权信息
              </h2>
              <button className="btn-outline text-sm py-1.5 px-3"
                onClick={() => store.addClaim()}>+ 添加债权</button>
            </div>

            <div className="space-y-4">
              {store.claims.map((claim, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-navy bg-navy/5 px-2 py-0.5 rounded">
                      债权 {idx + 1}
                    </span>
                    {store.claims.length > 1 && (
                      <button className="text-red-500 text-xs hover:text-red-700"
                        onClick={() => store.removeClaim(idx)}>删除</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <label className="label-text">本金（元）</label>
                      <MoneyInput value={String(claim.principal)}
                        onChange={v => store.updateClaim(idx, 'principal', v)} />
                    </div>
                    <div>
                      <label className="label-text">利率类型</label>
                      <select className="input-field" value={claim.rate_type}
                        onChange={e => store.updateClaim(idx, 'rate_type', e.target.value)}>
                        <option value="一年期LPR分段">一年期LPR分段</option>
                        <option value="五年期LPR分段">五年期LPR分段</option>
                        <option value="固定利率">固定利率</option>
                      </select>
                    </div>
                    {claim.rate_type !== '固定利率' ? (
                      <div>
                        <label className="label-text">LPR倍数（%）</label>
                        <input type="number" className="input-field" value={claim.lpr_multiple}
                          onChange={e => store.updateClaim(idx, 'lpr_multiple', e.target.value)} />
                      </div>
                    ) : (
                      <div>
                        <label className="label-text">固定利率（%）</label>
                        <input type="number" className="input-field" value={claim.fixed_rate}
                          onChange={e => store.updateClaim(idx, 'fixed_rate', e.target.value)} />
                      </div>
                    )}
                    <div>
                      <label className="label-text">一年天数</label>
                      <select className="input-field" value={claim.days_per_year}
                        onChange={e => store.updateClaim(idx, 'days_per_year', Number(e.target.value))}>
                        <option value={365}>365</option>
                        <option value={360}>360</option>
                      </select>
                    </div>
                    <div>
                      <label className="label-text">起算之日</label>
                      <DatePicker value={claim.start_date}
                        onChange={v => store.updateClaim(idx, 'start_date', v)} />
                    </div>
                    <div>
                      <label className="label-text">结算之日</label>
                      <DatePicker value={claim.end_date}
                        onChange={v => store.updateClaim(idx, 'end_date', v)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 清偿记录 */}
          <section className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-navy flex items-center gap-2">
                <span className="w-1 h-4 bg-gold rounded-full" />
                清偿记录
              </h2>
              <button className="btn-outline text-sm py-1.5 px-3"
                onClick={() => store.addPayment()}>+ 添加清偿</button>
            </div>

            {store.payments.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">暂无清偿记录</p>
            ) : (
              <div className="space-y-4">
                {store.payments.map((payment, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-navy bg-navy/5 px-2 py-0.5 rounded">
                        清偿 {idx + 1}
                      </span>
                      <div className="flex items-center gap-3">
                        <button className="text-navy text-xs hover:text-navy-light"
                          onClick={() => {
                            setEditingPaymentIdx(idx);
                            setDeductEditorOpen(true);
                          }}>编辑抵扣顺序</button>
                        <button className="text-red-500 text-xs hover:text-red-700"
                          onClick={() => store.removePayment(idx)}>删除</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <label className="label-text">清偿金额（元）</label>
                        <MoneyInput value={String(payment.amount)}
                          onChange={v => store.updatePayment(idx, 'amount', v)} />
                      </div>
                      <div>
                        <label className="label-text">清偿时间</label>
                        <DatePicker value={payment.date}
                          onChange={v => store.updatePayment(idx, 'date', v)} />
                      </div>
                    </div>
                    {payment.deduct_order.length > 0 && (
                      <p className="text-xs text-gray-400 mt-2">
                        抵扣顺序：{payment.deduct_order.join(' → ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-3">
            <button className="btn-gold" onClick={() => store.calculate()}>
              计算利息
            </button>
            <button className="btn-primary" onClick={handleSave}
              disabled={!store.caseNo}>
              保存到案件库
            </button>
            <button className="btn-outline text-sm" onClick={handleGoToCases}>
              从案件库加载
            </button>
            <button className="btn-outline" onClick={() => window.print()}
              disabled={!store.resultText}>
              打印
            </button>
            <button className="btn-outline" onClick={() => setShowClearConfirm(true)}>
              清空
            </button>
          </div>
        </div>

        {/* 右侧：结果区 */}
        <div className="w-[440px] flex-shrink-0 space-y-4">
          <div className="sticky top-6 space-y-4">
            {/* 结算摘要 */}
            {store.calcResult && (
              <div className="card p-5">
                <h2 className="text-base font-semibold text-navy mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-gold rounded-full" />
                  结算摘要
                </h2>
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-600">债务总金额</span>
                    <span className="font-serif text-lg font-bold text-navy">{formatMoney(store.calcResult.debt_total)}元</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-600">债务利息总金额</span>
                    <span className="font-serif text-lg font-bold text-navy">{formatMoney(store.calcResult.debt_interest_total)}元</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-600">尚待清偿利息总金额</span>
                    <span className="font-serif text-lg font-bold text-navy">{formatMoney(store.calcResult.remaining_interest_total)}元</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-2 border-t border-gray-100">
                    <span className="text-sm text-gray-600">尚待清偿债务总金额</span>
                    <span className="font-serif text-lg font-bold text-gold-dim">{formatMoney(store.calcResult.remaining_debt_total)}元</span>
                  </div>
                </div>
              </div>
            )}

            {/* 计算详情 */}
            <div className="card">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <h2 className="text-base font-semibold text-navy">计算详情</h2>
                {store.resultText && (
                  <button className="text-xs text-gold-dim hover:text-gold"
                    onClick={() => navigator.clipboard.writeText(store.resultText)}>
                    复制
                  </button>
                )}
              </div>
              <div className="p-4">
                {store.resultText ? (
                  <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all max-h-[60vh] overflow-y-auto leading-relaxed">
                    {store.resultText}
                  </pre>
                ) : (
                  <div className="text-center py-16 text-gray-400">
                    <p className="text-sm">填写债权信息后</p>
                    <p className="text-sm">点击「计算利息」查看结果</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 抵扣顺序编辑器 */}
      <DeductOrderEditor
        open={deductEditorOpen}
        initialOrder={editingPaymentIdx >= 0 ? store.payments[editingPaymentIdx]?.deduct_order || [] : []}
        claimsCount={store.claims.length}
        onSave={(order) => {
          if (editingPaymentIdx >= 0) {
            store.setDeductOrder(editingPaymentIdx, order);
          }
          setDeductEditorOpen(false);
        }}
        onClose={() => setDeductEditorOpen(false)}
      />

      {/* 清空确认弹窗 */}
      <ConfirmDialog
        open={showClearConfirm}
        title="清空确认"
        message="确定清空所有数据？"
        confirmText="清空"
        onConfirm={() => {
          store.clearAll();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
