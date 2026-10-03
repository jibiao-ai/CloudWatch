# 前端范式

## 页签页（参照 AnalyticsPage / CapacityPage）
```jsx
const [sp, setSp] = useSearchParams();
const tab = TABS.some(t => t.key === sp.get('tab')) ? sp.get('tab') : 'home';
const go = useCallback(next => setSp(next, { replace: true }), [setSp]);  // 页签与筛选同步到地址栏，便于刷新与分享
```
外壳 `AnalyticsShell({ title, description, tabs, tab, onTab, idPrefix, searchPlaceholder, children })`，`children(d, tick, reloadOv, keyword, clearKeyword)`：`tick` 每次点刷新自增，子图表据此重新加载。

## 筛选栏
`<FilterBar><Filter label="所属云平台" options value onChange width/> … <span className="ml-auto">跳转链接</span></FilterBar>`。上游筛选变化时清空下游（如换云平台 → 清空计算节点、集群存储）。跳转到其他模块用 `<Link to="/monitor?tab=hosts">在监控中心查看计算节点信息</Link>`，文案写动作，不写「模块 · 页签」。

## 服务端列表
```jsx
const list = useListQuery('key', q => api.getList({...q}).then(r => ({ list: r.list, total: r.total })), { page:1, pageSize:10, ... });
<DataTable columns rows={list.rows} loading={list.loading} refreshing={list.refreshing} error={list.error} onRetry={list.reload}
  page={list.query.page} pageSize={list.query.pageSize} total={list.total} onPageChange={p => list.setQuery(p, {resetPage:false})} />
```
外部关键字（页头全局搜索）注入：`useEffect(() => { if (query.keyword !== keyword) setQuery({ keyword }); }, [keyword])`。

## 下拉分组（优化建议页）
两个 `CustomSelect`：「虚拟机侧」「物理侧」，选项 = `全部（N）` + 各策略 `名称（命中数）`，默认虚拟机侧「全部」；与「优化策略」入口同一行。选「全部」→ `?side=vm|phys`，选单条 → `?kind=<策略ID>`。

## DatePicker
```jsx
<DatePicker value={from} onChange={setFrom} max={to} width={136} aria-label="开始日期" />
<DatePicker withTime value={dt} onChange={setDt} size="md" />   // 'YYYY-MM-DDTHH:mm'
```
范围校验：`from > to` 时显示 warning，不请求接口。

## 空态文案
区分三种：未筛选无数据（说明原因与前置条件）、筛选无结果（提示调整条件）、已忽略为空。
