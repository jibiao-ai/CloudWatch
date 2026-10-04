-- 告警中心：已恢复的告警视为已确认。存量「已恢复且未确认」记录回填为已确认（确认人=系统自动，确认时间=恢复时间）。
-- 之后由 ApplySync 在每次同步时自动维护：恢复 → 自动确认；复发 → 撤销系统自动确认。
UPDATE alert_events
   SET acked=1, acked_by='系统(自动恢复)', acked_at=COALESCE(resolved_at, last_seen_at, fired_at)
 WHERE status='resolved' AND acked=0;
