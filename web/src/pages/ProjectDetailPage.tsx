import { Button, Card, Descriptions, Space } from 'antd';
import { useNavigate, useParams } from 'react-router';
import { ProjectRecordStatus } from '../components/ProjectRecordStatus';
import { usePermission } from '../identity';
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
  const editPermission = usePermission('project.record.edit');
  const navigate = useNavigate();

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
          {/* 编辑入口按 project.record.edit 显示；页面保存时服务端仍会独立校验。 */}
          {editPermission && (
            <Button type="primary" onClick={() => navigate(`/projects/records/${projectId}/edit`)}>
              编辑
            </Button>
          )}
          <Button onClick={() => navigate('/projects/list')}>返回列表</Button>
        </Space>
      }
    >
      {state.kind === 'ready' ? (
        <Descriptions
          column={1}
          size="middle"
          items={[
            { key: 'id', label: '项目编号', children: state.project.id },
            { key: 'name', label: '项目名称', children: state.project.name },
            { key: 'owner', label: '负责人', children: state.project.owner.name },
            { key: 'team', label: '所属团队', children: state.project.team.name },
            { key: 'status', label: '状态', children: state.project.status },
            { key: 'description', label: '描述', children: state.project.description || '—' },
            { key: 'createdAt', label: '创建时间', children: state.project.createdAt },
            { key: 'updatedAt', label: '更新时间', children: state.project.updatedAt },
          ]}
        />
      ) : (
        <ProjectRecordStatus state={state} onRetry={reload} />
      )}
    </Card>
  );
}
