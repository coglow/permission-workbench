import { Button, Card, Descriptions, Space, Tag } from 'antd';
import { useNavigate, useParams } from 'react-router';
import { PROJECT_STATUS_COLORS } from '../api';
import { ProjectRecordStatus } from '../components/ProjectRecordStatus';
import { useDefaultPagePath } from '../identity';
import { useProjectRecord } from '../useProjectRecord';
import { ForbiddenPage, NotFoundPage } from './StatusPages';

/**
 * 项目详情页。
 *
 * 路由是项目记录的固定路由（不进菜单配置）。取数与状态分流交给 useProjectRecord：
 * 403 与 404 分别是“无权限”和“记录不存在”两种不同语义，页面按状态分别展示。
 */
export function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const defaultPath = useDefaultPagePath();

  // 路由保证 :id 一定有值，这里统一取出来，避免在回调里反复处理 undefined。
  const projectId = id ?? '';
  const { state, reload } = useProjectRecord(projectId);

  // 无权与记录不存在复用统一的 403 / 404 页面，两者的操作入口保持一致。
  if (state.kind === 'denied') return <ForbiddenPage message={state.message} />;
  if (state.kind === 'missing') return <NotFoundPage message={state.message} />;

  return (
    <Card
      title="项目详情"
      extra={
        <Space>
          {/* 入口按服务端返回的记录级编辑能力显示，写接口仍独立校验最新授权。 */}
          {state.kind === 'ready' && state.data.canEdit && (
            <Button type="primary" onClick={() => navigate(`/projects/records/${projectId}/edit`)}>
              编辑
            </Button>
          )}
          <Button onClick={() => navigate(defaultPath ?? '/')}>返回可访问页面</Button>
        </Space>
      }
    >
      {state.kind === 'ready' ? (
        <Descriptions
          column={1}
          size="middle"
          items={[
            { key: 'id', label: '项目编号', children: state.data.id },
            { key: 'name', label: '项目名称', children: state.data.name },
            { key: 'owner', label: '负责人', children: state.data.owner.name },
            { key: 'team', label: '所属团队', children: state.data.team.name },
            {
              key: 'status',
              label: '状态',
              children: (
                <Tag color={PROJECT_STATUS_COLORS[state.data.status]}>{state.data.status}</Tag>
              ),
            },
            { key: 'description', label: '描述', children: state.data.description || '—' },
            { key: 'createdAt', label: '创建时间', children: state.data.createdAt },
            { key: 'updatedAt', label: '更新时间', children: state.data.updatedAt },
          ]}
        />
      ) : (
        <ProjectRecordStatus state={state} onRetry={reload} />
      )}
    </Card>
  );
}
