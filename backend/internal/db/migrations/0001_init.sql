CREATE TABLE IF NOT EXISTS system_meta (
  k VARCHAR(64) NOT NULL PRIMARY KEY,
  v MEDIUMTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  code VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  builtin TINYINT(1) NOT NULL DEFAULT 0,
  permissions LONGTEXT NOT NULL,
  data_scopes LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL DEFAULT '',
  email VARCHAR(128) NOT NULL DEFAULT '',
  phone VARCHAR(32) NOT NULL DEFAULT '',
  department VARCHAR(64) NOT NULL DEFAULT '',
  source VARCHAR(16) NOT NULL DEFAULT 'local',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  password_hash VARCHAR(100) NOT NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  password_changed_at DATETIME(3) NOT NULL,
  fail_count INT NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id VARCHAR(32) NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  access_hash CHAR(64) NOT NULL,
  refresh_hash CHAR(64) NOT NULL,
  access_expires_at DATETIME(3) NOT NULL,
  refresh_expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  last_active_at DATETIME(3) NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  UNIQUE KEY uk_sessions_access (access_hash),
  UNIQUE KEY uk_sessions_refresh (refresh_hash),
  KEY idx_sessions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_failures (
  username VARCHAR(64) NOT NULL PRIMARY KEY,
  cnt INT NOT NULL DEFAULT 0,
  last_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  group_key VARCHAR(32) NOT NULL PRIMARY KEY,
  value LONGTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  updated_by VARCHAR(64) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alert_channels (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  type VARCHAR(16) NOT NULL,
  name VARCHAR(64) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  config LONGTEXT NOT NULL,
  secret_enc VARBINARY(2048) NULL,
  sort_no INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_alert_channels_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assets (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  mime VARCHAR(64) NOT NULL,
  size INT NOT NULL,
  data LONGBLOB NOT NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  occurred_at DATETIME(3) NOT NULL,
  operator VARCHAR(64) NOT NULL DEFAULT '',
  operator_name VARCHAR(64) NOT NULL DEFAULT '',
  ip VARCHAR(64) NOT NULL DEFAULT '',
  module VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL,
  target VARCHAR(255) NOT NULL DEFAULT '',
  target_id VARCHAR(64) NOT NULL DEFAULT '',
  target_link VARCHAR(255) NOT NULL DEFAULT '',
  result VARCHAR(16) NOT NULL,
  duration_ms INT NOT NULL DEFAULT 0,
  error TEXT NULL,
  request_params LONGTEXT NULL,
  KEY idx_audit_time (occurred_at),
  KEY idx_audit_operator (operator),
  KEY idx_audit_module (module, action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 以下三张表由后续「监控 / 巡检 / 告警」模块写入；数据保留策略已对其生效（按时间列清理）。
CREATE TABLE IF NOT EXISTS metric_samples (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider_id VARCHAR(32) NOT NULL,
  metric VARCHAR(96) NOT NULL,
  target VARCHAR(128) NOT NULL DEFAULT '',
  value DOUBLE NOT NULL,
  sampled_at DATETIME(3) NOT NULL,
  KEY idx_metric_time (sampled_at),
  KEY idx_metric_key (provider_id, metric, sampled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inspection_results (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider_id VARCHAR(32) NOT NULL,
  task_id VARCHAR(32) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL,
  summary TEXT NULL,
  detail LONGTEXT NULL,
  finished_at DATETIME(3) NOT NULL,
  KEY idx_inspection_time (finished_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alert_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider_id VARCHAR(32) NOT NULL DEFAULT '',
  severity VARCHAR(16) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'firing',
  fired_at DATETIME(3) NOT NULL,
  KEY idx_alert_time (fired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
