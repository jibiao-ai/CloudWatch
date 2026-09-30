import React from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useStore } from '../store/useStore';
import { USER_SOURCES } from '../data/dict';
import { formatDateTime } from '../utils/format';

/** 个人信息（只读）：修改资料由管理员在「用户管理」处理；密码可自助修改 */
export default function ProfilePage() {
  const user = useStore((s) => s.user);
  const navigate = useNavigate();
  const rows = [
    ['用户名', user.username], ['姓名', user.name], ['邮箱', user.email || '-'], ['手机', user.phone || '-'], ['部门', user.department || '-'],
    ['来源', USER_SOURCES.find((s) => s.value === user.source)?.label || user.source], ['最后登录', formatDateTime(user.lastLoginAt)],
  ];
  return (
    <div className="max-w-2xl">
      <PageHeader title="个人信息" description="账号资料由管理员维护，如需变更请联系管理员。" actions={<button type="button" className="btn-default" onClick={() => navigate('/change-password')}><KeyRound size={15} /> 修改密码</button>} />
      <div className="card p-6">
        <div className="flex items-center gap-4 pb-5 mb-5 border-b border-line">
          <div className="w-14 h-14 rounded-full bg-primary text-primary-on flex items-center justify-center text-xl font-semibold">{(user.name || user.username).slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="text-base font-semibold text-fg">{user.name}</div>
            <div className="mt-1 flex flex-wrap gap-1">{(user.roleNames || []).map((r) => <span key={r} className="tag-primary">{r}</span>)}</div>
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          {rows.map(([k, v]) => (
            <div key={k}><dt className="text-xs text-fg-muted">{k}</dt><dd className="text-sm text-fg mt-0.5 break-all">{v}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}
