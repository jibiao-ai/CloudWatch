-- 容量管理：每个平台最近一次采集到的计算节点 / 虚拟机 / 云硬盘 / 虚拟网卡 / 存储池原始对象（JSON 经 gzip 压缩，含完整原始对象与衍生字段）
CREATE TABLE IF NOT EXISTS capacity_snapshots (
  provider_id VARCHAR(32) NOT NULL PRIMARY KEY,
  collected_at DATETIME(3) NULL,
  ok TINYINT(1) NOT NULL DEFAULT 0,
  error VARCHAR(500) NOT NULL DEFAULT '',
  duration_ms INT NOT NULL DEFAULT 0,
  nodes LONGBLOB NULL,
  vms LONGBLOB NULL,
  volumes LONGBLOB NULL,
  ports LONGBLOB NULL,
  pools LONGBLOB NULL,
  steps MEDIUMTEXT NULL,
  last_try_at DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
