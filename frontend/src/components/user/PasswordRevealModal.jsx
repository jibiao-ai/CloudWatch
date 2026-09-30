import React, { useState } from 'react';
import { Check, Copy, ShieldAlert } from 'lucide-react';
import Modal from '../Modal';
import { copyText } from '../../utils/download';
import { useToast } from '../../hooks/useToast';

/** 一次性展示密码（含复制按钮）—— 关闭后无法再次查看；用于新建用户初始密码 / 重置密码 */
export default function PasswordRevealModal({ open, title, username, password, onClose }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const copy = async () => {
    const ok = await copyText(password);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); } else toast.error('复制失败', '请手动选中复制');
  };
  return (
    <Modal open={open} width={460} title={title} onClose={onClose} closeOnMask={false}
      footer={<button type="button" className="btn-primary" onClick={onClose}>我已记录，关闭</button>}>
      <div className="flex gap-2 p-3 rounded-lg bg-warning-soft text-[13px] text-fg mb-4"><ShieldAlert size={16} className="text-warning shrink-0 mt-0.5" />该密码仅展示这一次，关闭后无法再次查看。用户下次登录需强制修改密码。</div>
      <div className="text-xs text-fg-muted mb-1.5">账号：<b className="text-fg">{username}</b></div>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2.5 rounded-md bg-muted border border-line text-[15px] font-mono tracking-wide select-all break-all text-fg" data-testid="revealed-password">{password}</code>
        <button type="button" className="btn-default" onClick={copy} aria-label="复制密码">{copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}{copied ? '已复制' : '复制'}</button>
      </div>
    </Modal>
  );
}
