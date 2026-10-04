import React from 'react';
import { Link } from 'react-router-dom';
import Panel from './Panel';
import CapacityBar from '../CapacityBar';
import Skeleton from '../Skeleton';
import { formatBytes } from '../../utils/format';

const Bar = ({ v, label }) => (v == null ? <span className="text-fg-subtle">—</span> : <div className="w-[170px]"><CapacityBar compact used={v} total={100} label={label} /></div>);

/** BackendPanel —— 基础资源使用率（按集群存储后端）：每一套存储后端各占一行，显示总容量、分配率与使用率（1 位小数） */
export default function BackendPanel({ list, loading }) {
  return (
    <Panel title="集群存储分配率 / 使用率（按存储后端）" actions={<Link to="/monitor?tab=pools" className="text-[13px] text-primary-text hover:underline">在监控中心查看集群存储明细</Link>}>
      {loading ? <Skeleton.Block className="h-[120px]" /> : !list?.length ? <p className="text-[13px] text-fg-muted py-6 text-center">暂无集群存储数据，请先在配置中心中采集</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-fg-muted border-b border-line">
                <th className="py-2 pr-4 font-medium">后端名称</th><th className="py-2 pr-4 font-medium">所属云平台</th>
                <th className="py-2 pr-4 font-medium text-right">总容量</th><th className="py-2 pr-4 font-medium">存储分配率</th><th className="py-2 font-medium">存储使用率</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.key} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 font-medium break-all">{b.name}{b.pools > 1 && <span className="text-xs text-fg-subtle font-normal ml-1">（{b.pools} 个存储池）</span>}</td>
                  <td className="py-2 pr-4 text-fg-muted">{b.platform}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatBytes(b.totalGb * 1024 ** 3, 2)}</td>
                  <td className="py-2 pr-4"><Bar v={b.allocPercent} label="存储分配率" /></td>
                  <td className="py-2"><Bar v={b.usedPercent} label="存储使用率" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
