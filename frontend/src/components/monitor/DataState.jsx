import React from 'react';
import Skeleton from '../Skeleton';
import ErrorState from '../ErrorState';

/** DataState —— 监控中心页签内部的异步数据壳：加载骨架 / 错误重试 / 渲染 children(data) */
export default function DataState({ q, children }) {
  if (q.loading) return <Skeleton.Block className="h-[240px]" />;
  if (q.error) return <div className="card"><ErrorState error={q.error} onRetry={q.reload} /></div>;
  return q.data ? children(q.data) : null;
}
