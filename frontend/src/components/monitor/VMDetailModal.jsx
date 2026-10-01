import React, { useMemo, useState } from 'react';
import Modal from '../Modal';
import CustomSelect from '../CustomSelect';
import ConsoleLink from '../ConsoleLink';
import SeriesChart from './SeriesChart';
import { useAsync } from '../../hooks/useAsync';
import { monitorApi } from '../../services/api';
import { RANGES, formatRate } from '../../utils/monitorUtil';

const toRows = (series, keys) => {
  const by = new Map();
  keys.forEach(([metric, key]) => (series?.[metric] || []).forEach((p) => {
    const r = by.get(p.t) || { t: p.t };
    r[key] = +p.v.toFixed(2);
    by.set(p.t, r);
  }));
  return [...by.values()].sort((a, b) => a.t - b.t);
};

/** VMDetailModal —— 云主机监控详情：实时向 Gnocchi 取 cpu_util / memory.util / disk.read|write.bytes.rate 曲线 */
export default function VMDetailModal({ vm, platform, providerId, onClose }) {
  const [range, setRange] = useState('6h');
  const q = useAsync(() => (vm ? monitorApi.getVMMetrics(providerId, vm.id, range) : Promise.resolve(null)), [vm?.id, providerId, range]);
  const s = q.data?.series;
  const cpu = useMemo(() => toRows(s, [['cpu_util', 'cpu']]), [s]);
  const mem = useMemo(() => toRows(s, [['memory.util', 'mem']]), [s]);
  const io = useMemo(() => toRows(s, [['disk.read.bytes.rate', 'rd'], ['disk.write.bytes.rate', 'wr']]), [s]);
  if (!vm) return null;
  const c = { loading: q.loading, error: q.error, emptyTitle: '暂无监控数据', emptyDesc: '该云主机在所选时间范围内没有 Gnocchi 采样（关机或未启用监控）' };
  return (
    <Modal open title={`云主机监控详情 · ${vm.name}`} width={1020} onClose={onClose}
      subtitle={<span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1"><span>ID：{vm.id}</span>{vm.node && <span>所在节点：{vm.node}</span>}{platform && <span className="inline-flex items-center gap-1.5">所属云平台：{platform.name}<ConsoleLink ip={platform.consoleIp} /></span>}</span>}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs text-fg-muted">数据来自 Gnocchi（cpu_util / memory.util / disk.read.bytes.rate / disk.write.bytes.rate），随所选范围自动匹配粒度</span>
        <div className="w-[140px] shrink-0"><CustomSelect aria-label="趋势范围" value={range} onChange={setRange} options={RANGES} /></div>
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <SeriesChart {...c} title="CPU 使用率" data={cpu} series={[{ key: 'cpu', name: 'CPU 使用率' }]} unit="%" domain={[0, 100]} minPoints={1} seriesOffset={0} />
        <SeriesChart {...c} title="内存使用率" data={mem} series={[{ key: 'mem', name: '内存使用率' }]} unit="%" domain={[0, 100]} minPoints={1} seriesOffset={1} />
        <div className="lg:col-span-2"><SeriesChart {...c} title="磁盘读 / 写速率" data={io} series={[{ key: 'rd', name: '读' }, { key: 'wr', name: '写' }]} format={formatRate} minPoints={1} seriesOffset={2} /></div>
      </div>
    </Modal>
  );
}
