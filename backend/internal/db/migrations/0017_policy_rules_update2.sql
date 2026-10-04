-- 运营分析 · 优化策略更新
-- 1) vCPU紧张虚机：针对过去 30 天，vCPU 平均使用率 > 85% 且 电源状态 = 运行中（取消 CPU 就绪时间条件），建议增加其 vCPU 配置
UPDATE analytics_policies SET window_days=30, enabled=1,
  conds='[{"field":"cpuAvg","op":">","value":85},{"field":"status","op":"=","value":"active","join":"AND"}]',
  advice='建议增加其 vCPU 配置'
WHERE kind='cpu_tight' AND builtin=1;
-- 2) IO性能压力异常虚拟机：针对过去 30 天，磁盘平均写 I/O 速率 > 150MiB/s 且 电源状态 = 运行中，建议确认其读写是否合理
UPDATE analytics_policies SET window_days=30, enabled=1,
  conds='[{"field":"writeMiB","op":">","value":150},{"field":"status","op":"=","value":"active","join":"AND"}]',
  advice='建议确认其读写是否合理'
WHERE kind='io_pressure' AND builtin=1;
