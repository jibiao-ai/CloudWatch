-- 运营分析 · 优化策略 v3：虚拟机侧 8 条 + 物理侧 4 条内置策略（统计周期 30 天），支持自定义创建（名称 / 资源类型 / 范围 / 筛选条件 / 忽略项）
-- 1) 策略表扩展：资源类型 vm|host|pool|disk、范围（JSON）、建议处置文案、是否内置
ALTER TABLE analytics_policies
  ADD COLUMN resource_type VARCHAR(16) NOT NULL DEFAULT 'vm',
  ADD COLUMN scope TEXT NULL,
  ADD COLUMN advice VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN builtin TINYINT(1) NOT NULL DEFAULT 0;

-- 2) 云主机使用率按天汇总补充：CPU 就绪占比 / 内存交换 / 磁盘时延 / 文件系统使用率（平台未提供的指标对应样本数为 0）
ALTER TABLE analytics_vm_usage
  ADD COLUMN ready_sum DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN ready_n INT NOT NULL DEFAULT 0,
  ADD COLUMN swap_max DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN swap_n INT NOT NULL DEFAULT 0,
  ADD COLUMN lat_sum DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN lat_n INT NOT NULL DEFAULT 0,
  ADD COLUMN fs_max DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN fs_n INT NOT NULL DEFAULT 0;

-- 3) 历史回填游标：首次采样时从 Gnocchi 回填过去 30 天的按天汇总，30 天周期的策略无需等待 30 天才有数据
ALTER TABLE analytics_state ADD COLUMN last_backfill_at DATETIME(3) NULL;

-- 4) 旧「资源过剩 / 资源不足」拆分为 vCPU / 内存 两类，已忽略记录归并到 vCPU 类
UPDATE analytics_ignores SET kind='cpu_excess' WHERE kind='excess';
UPDATE analytics_ignores SET kind='cpu_tight' WHERE kind='shortage';
DELETE FROM analytics_policies WHERE kind IN ('excess','shortage');

-- 5) 内置策略（ignores 的 vm_id 列沿用，存放各类资源的 ID：云主机 ID / 宿主机名 / 存储池名 / 云硬盘 ID）
UPDATE analytics_policies SET name='僵尸型虚拟机',resource_type='vm',enabled=1,window_days=30,builtin=1,sort_no=8,advice='建议确认用途后关停或删除',
  conds='[{"field":"writeAvg","op":"<","value":1},{"field":"status","op":"=","value":"active","join":"AND"}]' WHERE kind='zombie';
UPDATE analytics_policies SET name='长期关机虚拟机',resource_type='vm',enabled=1,window_days=30,builtin=1,sort_no=5,advice='建议删除以释放计算、存储资源',
  conds='[{"field":"status","op":"=","value":"shutoff"},{"field":"shutdownDays","op":">","value":30,"join":"AND"}]' WHERE kind='longoff';

INSERT IGNORE INTO analytics_policies(kind,name,resource_type,enabled,window_days,conds,advice,builtin,sort_no) VALUES
('cpu_excess','vCPU过剩虚机','vm',1,30,'[{"field":"cpuAvg","op":"<","value":15},{"field":"status","op":"=","value":"active","join":"AND"}]','建议降低其 vCPU 配置',1,1),
('mem_excess','内存过剩虚机','vm',1,30,'[{"field":"memAvg","op":"<","value":20},{"field":"status","op":"=","value":"active","join":"AND"}]','建议降低其内存配置',1,2),
('cpu_tight','vCPU紧张虚机','vm',1,30,'[{"field":"cpuAvg","op":">","value":80},{"field":"readyAvg","op":">","value":10,"join":"AND"},{"field":"status","op":"=","value":"active","join":"AND"}]','建议提高其 vCPU 配置或迁移至负载较低的宿主机',1,3),
('mem_short','内存不足虚机','vm',1,30,'[{"field":"memAvg","op":">","value":85},{"field":"swap","op":"=","value":"yes","join":"AND"},{"field":"status","op":"=","value":"active","join":"AND"}]','建议提高其内存配置',1,4),
('io_pressure','IO性能压力异常虚拟机','vm',1,30,'[{"field":"latAvg","op":">","value":20},{"field":"status","op":"=","value":"active","join":"AND"}]','建议排查存储性能或迁移磁盘',1,6),
('disk_full','磁盘空间高风险虚拟机','vm',1,30,'[{"field":"fsMax","op":">","value":90},{"field":"status","op":"=","value":"active","join":"AND"}]','建议清理文件或扩容磁盘',1,7),
('host_cpu','物理机CPU水位过高','host',1,30,'[{"field":"cpuAvg","op":">","value":85}]','建议迁移部分云主机或扩容计算节点',1,9),
('host_mem','物理机内存水位过高','host',1,30,'[{"field":"memAvg","op":">","value":85}]','建议迁移部分云主机或扩容计算节点',1,10),
('pool_full','存储容量临近耗尽','pool',1,30,'[{"field":"usedPercent","op":">","value":85}]','建议清理数据或扩容存储',1,11),
('orphan_disk','存在孤立磁盘','disk',1,30,'[{"field":"attachCount","op":"=","value":0}]','建议确认后删除以释放存储空间',1,12);

-- 6) 忽略项的资源 ID 列加长（存储池名称可能较长）
ALTER TABLE analytics_ignores MODIFY vm_id VARCHAR(255) NOT NULL;
