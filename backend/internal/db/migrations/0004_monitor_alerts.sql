-- 性能监控 / 告警中心（对接 EMLA /apis/monitoring/v1/ecms/*）

-- 每个平台最近一次采集的完整快照（概览、节点、磁盘、服务、存储集群等原始解析结果，JSON）
CREATE TABLE IF NOT EXISTS monitor_snapshots (
  provider_id VARCHAR(32) NOT NULL PRIMARY KEY,
  collected_at DATETIME(3) NULL,
  ok TINYINT(1) NOT NULL DEFAULT 0,
  error VARCHAR(500) NOT NULL DEFAULT '',
  duration_ms INT NOT NULL DEFAULT 0,
  summary MEDIUMTEXT NULL,
  nodes MEDIUMTEXT NULL,
  disks MEDIUMTEXT NULL,
  services MEDIUMTEXT NULL,
  storage MEDIUMTEXT NULL,
  steps MEDIUMTEXT NULL,
  last_try_at DATETIME(3) NULL,
  alert_sync_at DATETIME(3) NULL,
  alert_error VARCHAR(500) NOT NULL DEFAULT '',
  alert_firing INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- alert_events 扩展：与 EMLA 告警字段对齐，fingerprint 去重
ALTER TABLE alert_events
  ADD COLUMN fingerprint VARCHAR(64) NOT NULL DEFAULT '' AFTER provider_id,
  ADD COLUMN name_en VARCHAR(255) NOT NULL DEFAULT '' AFTER title,
  ADD COLUMN category VARCHAR(64) NOT NULL DEFAULT '' AFTER severity,
  ADD COLUMN alert_type VARCHAR(32) NOT NULL DEFAULT 'others' AFTER category,
  ADD COLUMN component VARCHAR(128) NOT NULL DEFAULT '' AFTER alert_type,
  ADD COLUMN node_name VARCHAR(128) NOT NULL DEFAULT '' AFTER component,
  ADD COLUMN host_ip VARCHAR(64) NOT NULL DEFAULT '' AFTER node_name,
  ADD COLUMN project_name VARCHAR(128) NOT NULL DEFAULT '' AFTER host_ip,
  ADD COLUMN summary TEXT NULL AFTER content,
  ADD COLUMN solution TEXT NULL AFTER summary,
  ADD COLUMN labels MEDIUMTEXT NULL AFTER solution,
  ADD COLUMN annotations MEDIUMTEXT NULL AFTER labels,
  ADD COLUMN rule_id VARCHAR(64) NOT NULL DEFAULT '' AFTER annotations,
  ADD COLUMN resolved_at DATETIME(3) NULL AFTER fired_at,
  ADD COLUMN last_seen_at DATETIME(3) NULL AFTER resolved_at,
  ADD COLUMN acked TINYINT(1) NOT NULL DEFAULT 0 AFTER last_seen_at,
  ADD COLUMN acked_by VARCHAR(64) NOT NULL DEFAULT '' AFTER acked,
  ADD COLUMN acked_at DATETIME(3) NULL AFTER acked_by,
  ADD COLUMN notified TINYINT(1) NOT NULL DEFAULT 0 AFTER acked_at,
  ADD KEY idx_alert_status (status, severity),
  ADD KEY idx_alert_provider (provider_id, status),
  ADD UNIQUE KEY uk_alert_fp (provider_id, fingerprint, fired_at);

-- 新增按钮权限：预置角色「云平台运维」「生产 SRE」默认拥有监控 / 告警的操作权限（仅在尚未包含时追加；超级管理员为 * 无需处理）
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'monitor:collect')
  WHERE id IN ('r2','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'monitor:collect') IS NULL;
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'alert:ack')
  WHERE id IN ('r2','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'alert:ack') IS NULL;
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'alert:sync')
  WHERE id IN ('r2','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'alert:sync') IS NULL;
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'alert:export')
  WHERE id IN ('r2','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'alert:export') IS NULL;
