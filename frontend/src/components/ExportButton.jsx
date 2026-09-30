import React, { useState } from 'react';
import { Download } from 'lucide-react';
import LoadingButton from './LoadingButton';
import { useToast } from '../hooks/useToast';
import { downloadBlob, buildExportName } from '../utils/download';

/**
 * ExportButton —— Excel 导出（导出内容 = 当前筛选结果，而非全量）
 * 属性：fn(params,{onProgress}) => Promise<Blob>（来自 api.js 的 exportXxx）/ params(当前筛选条件) / title(文件名前缀) / filters(用于文件名的条件摘要) / disabled
 * 导出中显示进度百分比；文件名含筛选条件与时间戳。
 */
export default function ExportButton({ fn, params, title, filters, disabled, label = '导出 Excel' }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(null);
  const toast = useToast();
  const run = async () => {
    setBusy(true);
    setPct(0);
    try {
      const blob = await fn(params, { onProgress: (p) => setPct(p) });
      const name = buildExportName(title, filters);
      downloadBlob(blob, name);
      toast.success('导出成功', name);
    } catch (e) {
      toast.error('导出失败', e.message);
    } finally {
      setBusy(false);
      setPct(null);
    }
  };
  return (
    <LoadingButton icon={Download} loading={busy} disabled={disabled} onClick={run} aria-label={label}>
      {busy ? `导出中${pct ? ` ${pct}%` : '…'}` : label}
    </LoadingButton>
  );
}
