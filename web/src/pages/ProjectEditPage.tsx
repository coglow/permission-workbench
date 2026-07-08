import { Alert, Button, Card, Descriptions, Form, Space } from 'antd';
import { useNavigate, useParams } from 'react-router';
import { updateProject } from '../api';
import type { ProjectInput } from '../../../shared/contracts.ts';
import { ProjectFormFields } from '../components/ProjectFormFields';
import { ProjectRecordStatus } from '../components/ProjectRecordStatus';
import { usePermission } from '../identity';
import { useProjectRecord } from '../useProjectRecord';
import { useMutation } from '../useMutation';
import { ForbiddenPage, NotFoundPage } from './StatusPages';

/**
 * 项目编辑页（固定路由 /projects/records/:id/edit）。
 *
 * 现有值通过详情接口回显，因此无权查看或越出数据范围时会分别得到 403 与 404，与详情页一致；
 * 保存只提交名称、状态与描述，负责人与所属团队只读展示。
 */
export function ProjectEditPage() {
  const { id } = useParams();
  const editPermission = usePermission('project.record.edit');
  const navigate = useNavigate();

  const projectId = id ?? '';

  const mutation = useMutation('保存失败');
  // 没有编辑权限时不取数，直接按 403 展示。
  const { state, reload } = useProjectRecord(projectId, { enabled: Boolean(editPermission) });

  async function handleSave(values: ProjectInput) {
    if (await mutation.run(() => updateProject(projectId, values))) {
      navigate(`/projects/records/${projectId}`, { replace: true });
    }
  }

  if (!editPermission) return <ForbiddenPage message="缺少项目编辑权限" />;
  if (state.kind === 'denied') return <ForbiddenPage message={state.message} />;
  if (state.kind === 'missing') return <NotFoundPage message={state.message} />;
  // 有编辑权限码也可能超出该记录的编辑范围，直接访问编辑地址同样不能打开表单。
  if (state.kind === 'ready' && !state.data.canEdit) {
    return <ForbiddenPage message="项目记录不在可编辑的数据范围内" />;
  }

  return (
    <Card
      title="编辑项目"
      extra={<Button onClick={() => navigate(`/projects/records/${projectId}`)}>返回详情</Button>}
    >
      {state.kind === 'ready' ? (
        <>
          {/* 负责人与所属团队不可编辑，只读展示；项目编号同样只做展示。 */}
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: 'id', label: '项目编号', children: state.data.id },
              { key: 'owner', label: '负责人', children: state.data.owner.name },
              { key: 'team', label: '所属团队', children: state.data.team.name },
            ]}
          />

          {mutation.error && (
            <Alert className="form-error" type="error" showIcon title={mutation.error} />
          )}

          <Form
            layout="vertical"
            initialValues={{
              name: state.data.name,
              status: state.data.status,
              description: state.data.description,
            }}
            onFinish={(values) => void handleSave(values)}
          >
            <ProjectFormFields />

            <Space>
              <Button type="primary" htmlType="submit" loading={mutation.pending}>
                保存
              </Button>
              <Button onClick={() => navigate(`/projects/records/${projectId}`)}>取消</Button>
            </Space>
          </Form>
        </>
      ) : (
        <ProjectRecordStatus state={state} onRetry={reload} />
      )}
    </Card>
  );
}
