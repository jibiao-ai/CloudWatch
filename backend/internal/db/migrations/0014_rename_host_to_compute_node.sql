-- 「宿主机」统一更名为「计算节点」：仅更新仍是内置原文的策略建议文案（用户自行修改过的不动）
UPDATE analytics_policies SET advice = REPLACE(advice, '宿主机', '计算节点') WHERE builtin=1 AND advice LIKE '%宿主机%';
