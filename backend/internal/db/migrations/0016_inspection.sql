-- 自动化巡检：巡检报告（复用 0001 的 inspection_results）+ 巡检配置（阈值 / 定时）+ 新增权限

ALTER TABLE inspection_results
  ADD COLUMN title VARCHAR(160) NOT NULL DEFAULT '' AFTER task_id,
  ADD COLUMN trigger_type VARCHAR(16) NOT NULL DEFAULT 'manual' AFTER title,
  ADD COLUMN operator VARCHAR(64) NOT NULL DEFAULT '' AFTER trigger_type,
  ADD COLUMN operator_name VARCHAR(64) NOT NULL DEFAULT '' AFTER operator,
  ADD COLUMN scope VARCHAR(1024) NOT NULL DEFAULT '' AFTER operator_name,
  ADD COLUMN started_at DATETIME(3) NULL AFTER scope,
  ADD COLUMN overall VARCHAR(8) NOT NULL DEFAULT '' AFTER started_at,
  ADD COLUMN score INT NOT NULL DEFAULT 0 AFTER overall,
  ADD COLUMN cnt_ok INT NOT NULL DEFAULT 0 AFTER score,
  ADD COLUMN cnt_warn INT NOT NULL DEFAULT 0 AFTER cnt_ok,
  ADD COLUMN cnt_bad INT NOT NULL DEFAULT 0 AFTER cnt_warn,
  ADD COLUMN cnt_na INT NOT NULL DEFAULT 0 AFTER cnt_bad,
  ADD KEY idx_inspection_task (task_id);

CREATE TABLE IF NOT EXISTS inspection_config (
  id INT NOT NULL PRIMARY KEY,
  config MEDIUMTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  updated_by VARCHAR(64) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 新增权限：立即巡检 / 导出报告 / 巡检设置 / 删除报告。预置角色「云平台运维」「生产 SRE」获得全部，「只读观察员」获得导出（均仅在尚未包含时追加）
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'inspection:view')
  WHERE id IN ('r2','r3','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'inspection:view') IS NULL;
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'inspection:run')
  WHERE id IN ('r2','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'inspection:run') IS NULL;
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'inspection:export')
  WHERE id IN ('r2','r3','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'inspection:export') IS NULL;
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'inspection:config')
  WHERE id IN ('r2','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'inspection:config') IS NULL;
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'inspection:delete')
  WHERE id IN ('r2','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'inspection:delete') IS NULL;
