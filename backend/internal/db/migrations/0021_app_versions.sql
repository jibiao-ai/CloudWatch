-- 系统配置 · 版本信息：版本发布记录。当前版本 = released_at 最新的一条（同日以 id 大者为准）。
-- 后续发布新版本：新增一条迁移 INSERT 一行即可，无需改代码。
CREATE TABLE IF NOT EXISTS app_versions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version     VARCHAR(32)  NOT NULL,
  title       VARCHAR(128) NOT NULL DEFAULT '',
  released_at DATE         NOT NULL,
  notes       TEXT         NOT NULL,
  UNIQUE KEY uk_app_versions_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO app_versions (version, title, released_at, notes) VALUES
('7.1', '私有云可观测平台 7.1', '2026-10-05',
 '监控中心、配置中心、运营中心、告警中心、巡检中心、拓扑与系统配置的完整功能集。\n配置中心总览新增 vCPU / 内存 / 存储使用率卡片，容量与平台汇总 10 秒横向轮播。\n运营中心总览轮播统一为 10 秒，术语统一为「虚拟机」。\n系统配置新增「版本信息」。');
