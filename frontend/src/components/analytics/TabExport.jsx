import React from 'react';
import ExportButton from '../ExportButton';
import { analyticsApi } from '../../services/api';
import { useCan } from '../../hooks/useCan';

/** TabExport —— 运营中心各页签的「导出 Excel」（权限 analytics:export）：kind = home | base | vm | disk | policy；params 为当前筛选条件，filters 用于文件名 */
export default function TabExport({ kind, title, params, filters }) {
  const can = useCan('analytics:export');
  if (!can) return null;
  return <ExportButton fn={(p, opt) => analyticsApi.exportTab(kind, p, opt)} params={params} title={`运营中心-${title}`} filters={filters} />;
}
