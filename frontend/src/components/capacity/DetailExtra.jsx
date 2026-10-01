import React from 'react';
import { gb, Tag } from './capUtil';
import { formatBytes } from '../../utils/format';

/** 详情内的小表格：表头 + 行，空数据时给出提示 */
function MiniTable({ cols, rows, empty, loading }) {
  if (loading) return <p className="text-[13px] text-fg-muted">加载中…</p>;
  if (!rows?.length) return <p className="text-[13px] text-fg-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto border border-line rounded-lg">
      <table className="w-full text-[13px]">
        <thead><tr className="bg-muted text-fg-muted text-left">{cols.map((c) => <th key={c[0]} className="px-3 py-2 font-medium whitespace-nowrap">{c[0]}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || r.mac || r.name || i} className="border-t border-line align-top">
              {cols.map((c) => <td key={c[0]} className="px-3 py-2 text-fg break-all">{c[2] ? c[2](r) : (r[c[1]] == null || r[c[1]] === '' ? '—' : String(r[c[1]]))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Sec = ({ title, children }) => <section><h3 className="text-[13px] font-semibold text-fg mb-2">{title}</h3>{children}</section>;

/** 虚拟机详情：关联的系统盘 / 数据盘 / 安全组（含规则） */
export function VmExtra({ row, loading }) {
  const disks = row.disks || [];
  const diskCols = [
    ['磁盘名称', 'name'], ['UUID', 'id', (r) => <code className="text-[12px] text-fg-muted">{r.id}</code>], ['挂载点', 'device'],
    ['容量', 'size', (r) => (r.size == null ? '—' : gb(r.size))], ['类型', 'volumeType'], ['状态', 'status'],
  ];
  const sg = row.securityGroupList || [];
  return (
    <>
      <Sec title={`关联的系统盘（${disks.filter((d) => d.kind === '系统盘').length}）`}>
        <MiniTable loading={loading} cols={diskCols} rows={disks.filter((d) => d.kind === '系统盘')} empty="未关联系统盘（或云硬盘数据尚未采集）" />
      </Sec>
      <Sec title={`关联的数据盘（${disks.filter((d) => d.kind === '数据盘').length}）`}>
        <MiniTable loading={loading} cols={diskCols} rows={disks.filter((d) => d.kind === '数据盘')} empty="未挂载数据盘" />
      </Sec>
      <Sec title={`安全组（${sg.length}）`}>
        {loading ? <p className="text-[13px] text-fg-muted">加载中…</p> : !sg.length ? <p className="text-[13px] text-fg-muted">未关联安全组</p> : (
          <div className="space-y-3">
            {sg.map((g) => (
              <div key={g.id || g.name}>
                <div className="flex items-center gap-2 mb-1.5"><span className="text-sm font-medium text-fg">{g.name}</span>{g.description && <span className="text-xs text-fg-muted">{g.description}</span>}<Tag text={`${g.ruleCount ?? 0} 条规则`} tone="default" /></div>
                {!!g.rules?.length && <MiniTable cols={[['方向', 'direction'], ['协议类型', 'ethertype'], ['协议', 'protocol'], ['端口范围', 'port'], ['远端', 'remote']]} rows={g.rules} empty="" />}
              </div>
            ))}
          </div>
        )}
      </Sec>
    </>
  );
}

/** 物理节点详情：网卡 / 磁盘清单（BMC 账号密码不在此展示） */
export function PhysExtra({ row, loading }) {
  return (
    <>
      <Sec title={`网卡（${row.nicCount ?? 0}）`}>
        <MiniTable loading={loading} cols={[['名称', 'name'], ['MAC', 'mac'], ['状态', 'state'], ['速率（Mbps）', 'speed'], ['型号', 'model']]} rows={row.interfaces} empty="无网卡信息" />
      </Sec>
      <Sec title={`磁盘（${row.diskCount ?? 0}）`}>
        <MiniTable loading={loading} cols={[['名称', 'name'], ['容量', 'size', (r) => (r.size == null ? '—' : formatBytes(r.size, 2))], ['介质', 'mediaType'], ['接口', 'interfaceType'], ['序列号', 'serial'], ['型号', 'model']]} rows={row.disks} empty="无磁盘信息" />
      </Sec>
    </>
  );
}
