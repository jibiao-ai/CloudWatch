import React, { useEffect, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import Modal from '../Modal';
import Checkbox from '../Checkbox';
import LoadingButton from '../LoadingButton';
import { inspectionApi, providerApi, pollTask } from '../../services/api';
import { useToast } from '../../hooks/useToast';

/** RunModal —— 立即巡检：选择云平台（默认全选）→ 发起 → 轮询进度 */
export default function RunModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [plats, setPlats] = useState([]);
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setPct(0); setMsg('');
    providerApi.getProviderList({ page: 1, pageSize: 200 }).then((r) => {
      const l = r.list || [];
      setPlats(l);
      setSel(l.map((p) => p.id));
    }).catch(() => {});
  }, [open]);

  const toggle = (id, on) => setSel((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const run = async () => {
    setBusy(true); setPct(2); setMsg('正在发起巡检…');
    try {
      const { taskId } = await inspectionApi.run(sel.length === plats.length ? [] : sel);
      const t = await pollTask(taskId, { interval: 1000, timeout: 600000, onProgress: (x) => { setPct(x.progress || 0); setMsg(x.message || ''); } });
      toast.success('巡检完成', t.message);
      onDone?.();
      onClose();
    } catch (e) {
      toast.error('巡检失败', e.message);
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title="立即巡检" subtitle="巡检全程只读，不会对云平台做任何变更" width={520} onClose={busy ? undefined : onClose} closeOnMask={!busy}
      footer={<>
        <button type="button" className="btn-default" disabled={busy} onClick={onClose}>取消</button>
        <LoadingButton variant="primary" icon={PlayCircle} loading={busy} disabled={!sel.length} onClick={run}>开始巡检</LoadingButton>
      </>}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg">选择云平台（已选 {sel.length} / {plats.length}）</span>
          <Checkbox label="全选" disabled={busy} checked={plats.length > 0 && sel.length === plats.length} indeterminate={sel.length > 0 && sel.length < plats.length} onChange={(on) => setSel(on ? plats.map((p) => p.id) : [])} />
        </div>
        <ul className="border border-line rounded-lg divide-y divide-line max-h-[260px] overflow-y-auto">
          {plats.map((p) => (
            <li key={p.id} className="px-3 py-2.5"><Checkbox disabled={busy} checked={sel.includes(p.id)} onChange={(on) => toggle(p.id, on)} label={<span>{p.name}<span className="text-xs text-fg-subtle ml-2">{p.consoleIp}</span></span>} /></li>
          ))}
          {!plats.length && <li className="px-3 py-6 text-center text-sm text-fg-muted">还没有对接云平台</li>}
        </ul>
        {busy && (
          <div role="status" aria-live="polite">
            <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
            <p className="text-xs text-fg-muted mt-1.5">{msg || '巡检中…'}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
