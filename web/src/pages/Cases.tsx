import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCaseStore } from '@/store/caseStore';
import { useInterestStore } from '@/store/interestStore';

export default function Cases() {
  const navigate = useNavigate();
  const caseStore = useCaseStore();
  const interestStore = useInterestStore();
  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);

  useEffect(() => {
    caseStore.loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSearchResults(caseStore.search(keyword));
  }, [keyword, caseStore.cases]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadCase = (caseNo: string) => {
    const record = caseStore.get(caseNo);
    if (record) {
      interestStore.loadFromCase(record);
      navigate('/calculate');
    }
  };

  const handleDelete = (caseNo: string) => {
    if (confirm(`确定删除案件「${caseNo}」？`)) {
      caseStore.delete(caseNo);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-navy">案件管理</h1>
        <p className="text-gray-500 mt-1 text-sm">案件保存 · 历史记录 · 快速加载</p>
      </div>

      {/* 搜索栏 */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input className="input-field pl-10" placeholder="搜索案号、当事人、案由、证件号..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)} />
          </div>
          <span className="text-sm text-gray-400 whitespace-nowrap">
            共 {searchResults.length} 件
          </span>
        </div>
      </div>

      {/* 案件列表 */}
      {searchResults.length === 0 ? (
        <div className="card p-16 text-center text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-200"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="text-sm">{keyword ? '未找到匹配的案件' : '暂无保存的案件'}</p>
          <p className="text-xs text-gray-300 mt-1">{keyword ? '试试其他关键词' : '在利息计算页保存案件后会显示在这里'}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 bg-gray-50/50">
                <th className="text-left py-3 px-4 font-medium">案号</th>
                <th className="text-left py-3 px-4 font-medium">申请执行人</th>
                <th className="text-left py-3 px-4 font-medium">被执行人</th>
                <th className="text-left py-3 px-4 font-medium">案由</th>
                <th className="text-left py-3 px-4 font-medium">修改时间</th>
                <th className="text-center py-3 px-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map(caseNo => {
                const c = caseStore.cases[caseNo];
                if (!c) return null;
                return (
                  <tr key={caseNo} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-navy font-medium">{c.case_no}</td>
                    <td className="py-3 px-4">{c.creditor || '-'}</td>
                    <td className="py-3 px-4">{c.debtor || '-'}</td>
                    <td className="py-3 px-4 text-gray-500">{c.case_reason || '-'}</td>
                    <td className="py-3 px-4 text-gray-400 text-xs font-mono">{formatDate(c.last_modified)}</td>
                    <td className="py-3 px-4 text-center">
                      <button className="text-navy text-xs hover:text-navy-light mr-3"
                        onClick={() => handleLoadCase(caseNo)}>加载</button>
                      <button className="text-red-500 text-xs hover:text-red-700"
                        onClick={() => handleDelete(caseNo)}>删除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
