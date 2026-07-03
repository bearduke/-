import { useState } from 'react';
import {
  interestLawGroups,
  distributionLawItems,
  distributionLawNotes,
  distributionRuleGroups,
} from '@/data/legalData';

type Tab = 'interest' | 'distribution';

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

export default function LegalRef() {
  const [tab, setTab] = useState<Tab>('interest');

  return (
    <div className="max-w-6xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-navy">相关法条</h1>
        <p className="text-gray-500 mt-1 text-sm">
          执行利息计算 · 分配方案计算 · 法律依据速查
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          className={`px-5 py-2.5 text-sm font-medium transition-colors relative ${
            tab === 'interest' ? 'text-navy' : 'text-gray-500 hover:text-navy'
          }`}
          onClick={() => setTab('interest')}
        >
          利息计算
          {tab === 'interest' && (
            <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-gold" />
          )}
        </button>
        <button
          className={`px-5 py-2.5 text-sm font-medium transition-colors relative ${
            tab === 'distribution' ? 'text-navy' : 'text-gray-500 hover:text-navy'
          }`}
          onClick={() => setTab('distribution')}
        >
          分配方案
          {tab === 'distribution' && (
            <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-gold" />
          )}
        </button>
      </div>

      {tab === 'interest' ? (
        <div className="space-y-6">
          {interestLawGroups.map(group => (
            <section key={group.category} className="card p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-navy/10 text-navy flex-shrink-0">
                  <BookIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-navy">{group.title}</h2>
                  {group.summary && (
                    <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{group.summary}</p>
                  )}
                </div>
              </div>
              <div className="space-y-3 mt-4">
                {group.articles.map((art, i) => (
                  <div key={i} className="border-l-2 border-gold/40 pl-4 py-1">
                    <div className="text-sm font-medium text-navy">{art.title}</div>
                    <div className="text-xs text-gold-dim mt-0.5 mb-1.5">{art.number}</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                      {art.content}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* 速查表说明 */}
          <div className="card p-5 bg-navy/5">
            <h2 className="text-base font-semibold text-navy mb-2">参与分配 · 债权清偿顺序速查表</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              整合执行费用 / 特定物优先层 / 无担保资金池五级序位 / 公法罚款 / 没收财产。共 13 个顺位层级，按先行扣除、特定物优先层、无担保资金池、公法财产刑四层结构编排。
            </p>
          </div>

          {/* 顺位列表 */}
          {distributionLawItems.map(item => (
            <section key={item.order} className="card p-5">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gold/15 text-gold-dim font-bold flex items-center justify-center text-lg">
                  {item.order}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-navy">{item.category}</h3>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                      {item.level}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{item.description}</p>
                  <div className="text-xs text-gray-400 mt-2">
                    <span className="font-medium text-gray-500">法律依据：</span>
                    {item.basis}
                  </div>

                  {/* 法条内容 */}
                  <div className="space-y-3 mt-4">
                    {item.articles.map((art, i) => (
                      <div key={i} className="border-l-2 border-gold/40 pl-4 py-1">
                        <div className="text-sm font-medium text-navy">{art.title}</div>
                        <p className="text-sm text-gray-700 leading-relaxed mt-1 whitespace-pre-line">
                          {art.content}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* 提示 */}
                  {item.note && (
                    <div className="mt-3 px-3 py-2 bg-gold/5 border border-gold/20 rounded text-xs text-gold-dim leading-relaxed">
                      <span className="font-medium">提示：</span>
                      {item.note}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ))}

          {/* 衔接提示 */}
          <section className="card p-6">
            <h2 className="text-base font-semibold text-navy mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-gold rounded-full" />
              几点衔接提示
            </h2>
            <div className="space-y-3">
              {distributionLawNotes.map((note, i) => (
                <p key={i} className="text-sm text-gray-600 leading-relaxed pl-3 border-l-2 border-gray-200">
                  {note}
                </p>
              ))}
            </div>
          </section>

          {/* 专项规则（延迟履行利息不参与分配、提高比例） */}
          {distributionRuleGroups.map(group => (
            <section key={group.category} className="card p-6 border-l-4 border-l-gold">
              <div className="flex items-start gap-3 mb-4">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-gold/15 text-gold-dim flex-shrink-0">
                  <BookIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-navy">{group.title}</h2>
                  <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{group.summary}</p>
                </div>
              </div>
              <div className="space-y-3 mt-4">
                {group.articles.map((art, i) => (
                  <div key={i} className="border-l-2 border-gold/40 pl-4 py-1">
                    <div className="text-sm font-medium text-navy">{art.title}</div>
                    <div className="text-xs text-gold-dim mt-0.5 mb-1.5">{art.number}</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                      {art.content}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
