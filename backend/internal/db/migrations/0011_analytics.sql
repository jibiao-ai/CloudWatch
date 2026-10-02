-- 运营分析：历史采样 / 云主机状态跟踪 / 优化策略 / 已忽略资源。
-- 资源数量与云主机使用率历史不在监控中心的 metric_samples 里（那里只有平台级与节点级指标），因此单独落库。

-- 每个平台每小时一条的资源数量快照（云主机 / 运行中 / 云盘 / 云盘容量 / 宿主机 / 存储器），用于「云主机趋势」「磁盘趋势」
CREATE TABLE IF NOT EXISTS analytics_counts (
  provider_id VARCHAR(32) NOT NULL,
  sampled_at DATETIME(3) NOT NULL,
  vms INT NOT NULL DEFAULT 0,
  vms_running INT NOT NULL DEFAULT 0,
  disks INT NOT NULL DEFAULT 0,
  disk_gb BIGINT NOT NULL DEFAULT 0,
  hosts INT NOT NULL DEFAULT 0,
  pools INT NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id, sampled_at),
  KEY idx_ac_time (sampled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 每台云主机每天一行的使用率汇总（CPU / 内存的累计和 / 样本数 / 最大值），平均值 = sum / n
CREATE TABLE IF NOT EXISTS analytics_vm_usage (
  provider_id VARCHAR(32) NOT NULL,
  vm_id VARCHAR(64) NOT NULL,
  day DATE NOT NULL,
  cpu_sum DOUBLE NOT NULL DEFAULT 0,
  cpu_n INT NOT NULL DEFAULT 0,
  cpu_max DOUBLE NOT NULL DEFAULT 0,
  mem_sum DOUBLE NOT NULL DEFAULT 0,
  mem_n INT NOT NULL DEFAULT 0,
  mem_max DOUBLE NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id, vm_id, day),
  KEY idx_avu_day (day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 云主机当前状态及进入该状态的时间（用于「持续关机 / 持续运行时长」）
CREATE TABLE IF NOT EXISTS analytics_vm_state (
  provider_id VARCHAR(32) NOT NULL,
  vm_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT '',
  since DATETIME(3) NOT NULL,
  PRIMARY KEY (provider_id, vm_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 采样游标：只处理「比上次更新」的资产快照 / 监控快照，避免同一份快照重复累计
CREATE TABLE IF NOT EXISTS analytics_state (
  provider_id VARCHAR(32) NOT NULL PRIMARY KEY,
  last_cap_at DATETIME(3) NULL,
  last_mon_at DATETIME(3) NULL,
  last_count_at DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 优化策略（升配 / 降配 / 回收）：conds 为条件数组 [{field,op,value,join}]，join 为与上一条件的连接（AND 优先于 OR）
CREATE TABLE IF NOT EXISTS analytics_policies (
  kind VARCHAR(16) NOT NULL PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  window_days INT NOT NULL DEFAULT 10,
  conds TEXT NOT NULL,
  sort_no INT NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NULL,
  updated_by VARCHAR(64) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO analytics_policies(kind,name,enabled,window_days,conds,sort_no) VALUES
('upgrade','建议升配',1,10,'[{"field":"cpuMax","op":">=","value":90},{"field":"memMax","op":">=","value":90,"join":"OR"}]',1),
('recycle','建议回收',1,10,'[{"field":"shutdownDays","op":">=","value":30},{"field":"status","op":"=","value":"soft_deleted","join":"OR"}]',2),
('downgrade','建议降配',1,10,'[{"field":"cpuMax","op":"<=","value":1},{"field":"memMax","op":"<=","value":1,"join":"OR"}]',3);

-- 已忽略的优化建议（按 建议类型 + 平台 + 云主机 粒度）
CREATE TABLE IF NOT EXISTS analytics_ignores (
  kind VARCHAR(16) NOT NULL,
  provider_id VARCHAR(32) NOT NULL,
  vm_id VARCHAR(64) NOT NULL,
  vm_name VARCHAR(255) NOT NULL DEFAULT '',
  created_by VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (kind, provider_id, vm_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 新增权限：运营分析的忽略 / 策略编辑 / 导出。预置角色「云平台运维」「生产 SRE」获得全部，「只读观察员」获得查看（仅在尚未包含时追加）
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'analytics:view')
  WHERE id IN ('r2','r3','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'analytics:view') IS NULL;
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'analytics:ignore')
  WHERE id IN ('r2','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'analytics:ignore') IS NULL;
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'analytics:policy_update')
  WHERE id IN ('r2','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'analytics:policy_update') IS NULL;
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'analytics:export')
  WHERE id IN ('r2','r3','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'analytics:export') IS NULL;
