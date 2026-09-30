// 菜单图标映射：后端返回图标名（字符串），此处解析为 lucide 组件（统一图标风格，禁止 emoji）
import {
  LayoutDashboard, Gauge, Boxes, LayoutList, ClipboardCheck, Activity, Database, BellRing, Network, ChartPie,
  Settings2, Server, Users, ShieldCheck, ScrollText, Globe, SlidersHorizontal, Circle,
} from 'lucide-react';

const MAP = { LayoutDashboard, Gauge, Boxes, LayoutList, ClipboardCheck, Activity, Database, BellRing, Network, ChartPie, Settings2, Server, Users, ShieldCheck, ScrollText, Globe, SlidersHorizontal };
export const getIcon = (name) => MAP[name] || Circle;
