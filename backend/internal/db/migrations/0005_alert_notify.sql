-- 告警独立同步间隔（每个平台，秒）与恢复通知标记
ALTER TABLE providers
  ADD COLUMN alert_interval_sec INT NOT NULL DEFAULT 60 AFTER sync_interval_min;

-- notified：告警触发通知是否已处理；resolve_notified：恢复通知是否已处理（默认 1 = 无需通知，仅在 告警中→已恢复 迁移时置 0）
ALTER TABLE alert_events
  ADD COLUMN resolve_notified TINYINT(1) NOT NULL DEFAULT 1 AFTER notified;

-- 升级前已恢复的历史告警不再补发通知
UPDATE alert_events SET notified=1 WHERE status='resolved';
