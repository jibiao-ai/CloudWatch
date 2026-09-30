CREATE TABLE IF NOT EXISTS host_mappings (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  console_ip VARCHAR(45) NOT NULL,
  root_domain VARCHAR(190) NOT NULL,
  components VARCHAR(512) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  probe_port INT NOT NULL DEFAULT 443,
  remark VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  updated_by VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uk_host_mappings_root (root_domain),
  KEY idx_host_mappings_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
