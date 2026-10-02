import React, { useMemo, useState } from 'react';
import { RefreshCw, Columns3 } from 'lucide-react';
import DataTable from '../DataTable';
import SearchInput from '../SearchInput';
import CustomSelect from '../CustomSelect';
import ExportButton from '../ExportButton';
import Modal from '../Modal';
import Checkbox from '../Checkbox';
import { analyticsApi } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import { useCan } from '../../hooks/useCan';

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));

/**
 * DetailTable —— 运营分析「资源明细」通用表：搜索（可选字段）+ 刷新 + 列设置 + 导出 + 服务端分页 / 排序。
 * 属性：kind(hosts|pools|vms|disks) / columns / filter(云账号、集群、宿主机等筛选条件，变化时回到第 1 页) /
 *       fields[{value,label}](搜索字段，仅 1 项时不显示字段下拉) / exportTitle / rowKey
 */
export default function DetailTable({ kind, columns, filter = {}, fields = [{ value: 'name', label: '名称' }], exportTitle, rowKey = 'key', pageSizeOptions = [10, 20, 50] }) {
  const canExport = useCan('analytics:export');
  const fk = JSON.stringify(filter);
  const [st, setSt] = useState({ field: fields[0].value, keyword: '', page: 1, pageSize: 10, sort: null, fk });
  const [hidden, setHidden] = useState([]);
  const [colOpen, setColOpen] = useState(false);
  const page = st.fk === fk ? st.page : 1;
  const params = useMemo(() => clean({ ...filter, field: st.field, keyword: st.keyword, sortKey: st.sort?.key, sortOrder: st.sort?.order }), [fk, st.field, st.keyword, st.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useAsync(() => analyticsApi.getList(kind, { ...params, page, pageSize: st.pageSize }), [kind, params, page, st.pageSize]);
  const set = (patch) => setSt((s) => ({ ...s, ...patch, fk }));
  const shown = columns.filter((c) => !hidden.includes(c.key));
  const field = fields.find((f) => f.value === st.field) || fields[0];
  return (
    <>
      <DataTable columns={shown} rows={q.data?.list || []} rowKey={rowKey} loading={q.loading} refreshing={q.refreshing} error={q.error} onRetry={q.reload}
        page={page} pageSize={st.pageSize} total={q.data?.total || 0} pageSizeOptions={pageSizeOptions} onPageChange={(p) => set({ page: p.page, pageSize: p.pageSize })}
        sort={st.sort} onSortChange={(sort) => set({ sort, page: 1 })}
        toolbar={<>
          {fields.length > 1 && <div className="w-[110px]"><CustomSelect size="sm" aria-label="搜索字段" options={fields} value={st.field} onChange={(v) => set({ field: v || fields[0].value, page: 1 })} /></div>}
          <SearchInput value={st.keyword} onChange={(keyword) => set({ keyword, page: 1 })} placeholder={`请输入${field.label}搜索`} width={240} />
        </>}
        extra={<>
          <button type="button" className="btn-default btn-icon" aria-label="刷新" onClick={q.reload}><RefreshCw size={15} className={q.refreshing ? 'animate-spin' : ''} /></button>
          <button type="button" className="btn-default btn-icon" aria-label="列设置" onClick={() => setColOpen(true)}><Columns3 size={15} /></button>
          {canExport && <ExportButton fn={analyticsApi.exportList(kind)} params={params} title={exportTitle} filters={{ [field.label]: st.keyword }} />}
        </>}
        empty={{ title: '暂无数据', description: '当前筛选条件下没有资源，或云平台尚未采集' }} />
      <Modal open={colOpen} title="列设置" subtitle="勾选需要显示的列" width={380} onClose={() => setColOpen(false)}
        footer={<button type="button" className="btn-primary" onClick={() => setColOpen(false)}>完成</button>}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {columns.map((c) => (
            <Checkbox key={c.key} label={c.title} checked={!hidden.includes(c.key)} disabled={!hidden.includes(c.key) && shown.length <= 1}
              onChange={(on) => setHidden((h) => (on ? h.filter((k) => k !== c.key) : [...h, c.key]))} />
          ))}
        </div>
      </Modal>
    </>
  );
}
