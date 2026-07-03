import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCaseStore } from '@/store/caseStore';
import { useInterestStore } from '@/store/interestStore';
import type { CaseRecord } from '@core/types';

function CalculatorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z" />
    </svg>
  );
}

function ScaleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  );
}

const features = [
  {
    title: '利息计算',
    desc: 'LPR分段计算、多债权交叉、加倍部分延迟履行利息',
    path: '/calculate',
    Icon: CalculatorIcon,
    iconColor: 'text-navy',
    iconBg: 'bg-navy/10',
  },
  {
    title: '分配方案',
    desc: '按顺位分配、诉讼费优先、自动生成方案',
    path: '/distribution',
    Icon: ScaleIcon,
    iconColor: 'text-gold-dim',
    iconBg: 'bg-gold/10',
  },
  {
    title: '案件管理',
    desc: '案件保存、历史记录、数据导入导出',
    path: '/cases',
    Icon: FolderIcon,
    iconColor: 'text-navy-light',
    iconBg: 'bg-navy-light/10',
  },
];

export default function Home() {
  const navigate = useNavigate();
  const caseStore = useCaseStore();
  const interestStore = useInterestStore();
  const [recentCases, setRecentCases] = useState<{ caseNo: string; record: CaseRecord }[]>([]);

  useEffect(() => {
    caseStore.loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const list = caseStore.caseNoList.slice(0, 5).map(caseNo => ({
      caseNo,
      record: caseStore.cases[caseNo],
    }));
    setRecentCases(list);
  }, [caseStore.caseNoList, caseStore.cases]);

  const handleLoadCase = (caseNo: string) => {
    const record = caseStore.get(caseNo);
    if (record) {
      interestStore.loadFromCase(record);
      navigate('/calculate');
    }
  };

  const hasUnsaved = interestStore.hasUnsavedChanges && !interestStore.isSaved;

  return (
    <div className="max-w-6xl mx-auto">
      {/* 未保存提示 */}
      {hasUnsaved && (
        <div className="mb-4 px-4 py-3 bg-gold/10 border border-gold/30 rounded-lg flex items-center gap-2 text-sm text-gold-dim">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span>您有未保存的计算数据，</span>
          <Link to="/calculate" className="underline font-medium hover:text-gold">点击查看</Link>
        </div>
      )}

      {/* Hero */}
      <section className="bg-gradient-to-br from-navy-dark to-navy rounded-2xl p-8 md:p-12 text-white">
        <span className="inline-block px-3 py-1 text-xs font-medium tracking-wide text-gold-light bg-gold/15 rounded-full">
          社会服务
        </span>
        <h1 className="font-serif text-4xl md:text-5xl font-bold mt-4 leading-tight">
          执行小助手 <span className="text-gold">智能计算</span>
        </h1>
        <p className="text-gray-300 text-sm md:text-base mt-4 max-w-2xl leading-relaxed">
          面向执行案件的专业计算工具，支持 LPR 分段利息计算、多债权分配方案自动生成与案件档案管理，让计算更精准、分配更高效。
        </p>
        <div className="flex flex-wrap gap-4 mt-8">
          <Link to="/calculate" className="btn-gold">
            开始计算
          </Link>
          <Link to="/distribution"
            className="px-5 py-2.5 border border-white/40 text-white rounded-lg font-medium hover:bg-white/10 transition-colors">
            分配方案
          </Link>
        </div>
      </section>

      {/* Feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        {features.map(({ title, desc, path, Icon, iconColor, iconBg }) => (
          <Link key={title} to={path} className="card p-6 hover:shadow-md transition-shadow group">
            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg ${iconBg} ${iconColor} mb-4 group-hover:scale-110 transition-transform`}>
              <Icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{desc}</p>
          </Link>
        ))}
      </div>

      {/* 最近案件 */}
      {recentCases.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl font-bold text-navy">最近案件</h2>
            <Link to="/cases" className="text-sm text-gold-dim hover:text-gold">查看全部 →</Link>
          </div>
          <div className="card divide-y divide-gray-100">
            {recentCases.map(({ caseNo, record }) => (
              <button
                key={caseNo}
                onClick={() => handleLoadCase(caseNo)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-navy/5 flex items-center justify-center flex-shrink-0">
                    <FolderIcon className="w-5 h-5 text-navy" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy truncate">{record.case_no}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {record.creditor} vs {record.debtor}
                      {record.case_reason && ` · ${record.case_reason}`}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-gray-300 flex-shrink-0 ml-4">
                  {record.last_modified
                    ? new Date(record.last_modified).toLocaleDateString('zh-CN')
                    : ''}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
