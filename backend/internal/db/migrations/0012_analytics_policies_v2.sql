-- 运营分析 · 优化策略 v2：僵尸型 / 资源过剩 / 资源不足 / 长期关机 四类策略
-- 1) 使用率按天汇总补充：CPU / 内存最小值（表达「持续大于 N%」）、云主机写 I/O 速率（KiB/s）累计。
--    历史行的最小值默认 0（保守：不会因旧数据误判为「持续偏高」），写速率样本数默认 0（需重新积累满统计周期）
ALTER TABLE analytics_vm_usage
  ADD COLUMN cpu_min DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN mem_min DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN w_sum DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN w_n INT NOT NULL DEFAULT 0;

-- 2) 旧「建议降配 / 建议升配 / 建议回收」由新策略取代（资源过剩 / 资源不足 / 长期关机），已忽略记录同步迁移
UPDATE analytics_ignores SET kind='excess' WHERE kind='downgrade';
UPDATE analytics_ignores SET kind='shortage' WHERE kind='upgrade';
UPDATE analytics_ignores SET kind='longoff' WHERE kind='recycle';
DELETE FROM analytics_policies WHERE kind IN ('downgrade','upgrade','recycle');

INSERT IGNORE INTO analytics_policies(kind,name,enabled,window_days,conds,sort_no) VALUES
('zombie','僵尸型虚拟机',1,10,'[{"field":"status","op":"=","value":"active"},{"field":"writeAvg","op":"<","value":1,"join":"AND"}]',1),
('excess','资源过剩虚拟机',1,10,'[{"field":"cpuMax","op":"<","value":10},{"field":"memMax","op":"<","value":10,"join":"OR"}]',2),
('shortage','资源不足虚拟机',1,10,'[{"field":"cpuMin","op":">","value":90},{"field":"memMin","op":">","value":90,"join":"OR"}]',3),
('longoff','长期关机虚机',1,10,'[{"field":"shutdownDays","op":">=","value":30},{"field":"status","op":"=","value":"soft_deleted","join":"OR"}]',4);
