import React from 'react';
import Panel from './Panel';
import Donut from './Donut';
import Skeleton from '../Skeleton';

/** DonutPanel —— 环形分布卡片：标题 + 环形图（加载中显示骨架）。actions 放右上角的切换控件 */
export default function DonutPanel({ title, data, unit, loading, actions, colorOf, emptyText }) {
  return (
    <Panel title={title} actions={actions}>
      {loading ? <Skeleton.Block className="h-[170px]" /> : <Donut data={data || []} unit={unit} colorOf={colorOf} emptyText={emptyText} />}
    </Panel>
  );
}
