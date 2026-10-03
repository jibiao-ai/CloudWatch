-- 运营分析 · 优化策略更新
-- 1) vCPU紧张虚机：针对过去 30 天，vCPU 平均使用率 > 80% 且 CPU 就绪时间占比 > 10% 且 电源状态 = 运行中
UPDATE analytics_policies SET window_days=30, enabled=1,
  conds='[{"field":"cpuAvg","op":">","value":80},{"field":"readyAvg","op":">","value":10,"join":"AND"},{"field":"status","op":"=","value":"active","join":"AND"}]',
  advice='建议提高其 vCPU 配置或迁移至负载较低的计算节点'
WHERE kind='cpu_tight' AND builtin=1;
-- 2) 内存不足虚机：针对过去 30 天，内存平均使用率 > 85% 且 电源状态 = 运行中（取消 Swap 条件与建议）
UPDATE analytics_policies SET window_days=30, enabled=1,
  conds='[{"field":"memAvg","op":">","value":85},{"field":"status","op":"=","value":"active","join":"AND"}]',
  advice='建议提高其内存配置'
WHERE kind='mem_short' AND builtin=1;
-- 3) 去掉「磁盘空间高风险虚拟机」策略及其忽略项
DELETE FROM analytics_ignores WHERE kind='disk_full';
DELETE FROM analytics_policies WHERE kind='disk_full';
