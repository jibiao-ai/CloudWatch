-- 清理内置演示数据：用户仅保留 admin；删除「生产 SRE（自定义）」角色。
-- 只按演示数据的固定 ID + 用户名/编码匹配，不会误删管理员自行创建的其他用户和角色。
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE id IN ('u2','u3','u4','u5','u6','u7','u8') AND username IN ('zhangwei','lina','wangfang','liuyang','chenjie','zhaolei','sunmei'));
DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE id IN ('u2','u3','u4','u5','u6','u7','u8') AND username IN ('zhangwei','lina','wangfang','liuyang','chenjie','zhaolei','sunmei'));
DELETE FROM users WHERE id IN ('u2','u3','u4','u5','u6','u7','u8') AND username IN ('zhangwei','lina','wangfang','liuyang','chenjie','zhaolei','sunmei');
DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE id='r5' AND code='prod_sre');
DELETE FROM roles WHERE id='r5' AND code='prod_sre';
