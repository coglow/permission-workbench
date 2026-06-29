import { useState } from 'react';
import { Alert, Button, Card, Descriptions, Form, Space } from 'antd';
import { useLocation, useNavigate, useParams, useRevalidator } from 'react-router';
import { ApiError, updateProject, type ProjectInput } from '../api';
import { ProjectFormFields } from '../components/ProjectFormFields';
import { ProjectRecordStatus } from '../components/ProjectRecordStatus';
import { usePermission } from '../identity';
import { useProjectRecord } from '../useProjectRecord';
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
  const location = useLocation();
  const { revalidate } = useRevalidator();

  const projectId = id ?? '';

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 没有编辑权限时不取数，直接按 403 展示。
  const { state, reload } = useProjectRecord(projectId, { enabled: Boolean(editPermission) });

  async function handleSave(values: ProjectInput) {
    setSaving(true);
    setSaveError(null);

    try {
      await updateProject(projectId, values);
      // 保存成功后回到详情页，让用户看到服务端返回的最新值。
      navigate(`/projects/records/${projectId}`, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // 与取数保持同一套会话失效处理：确认身份后带着当前地址回登录页。
        await revalidate();
        navigate('/login', { replace: true, state: { from: location.pathname } });
        return;
      }

      // 服务端返回的原文直接展示，不覆盖成通用提示。
      setSaveError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (!editPermission) return <ForbiddenPage message="缺少项目编辑权限" />;
  if (state.kind === 'denied') return <ForbiddenPage message={state.message} />;
  if (state.kind === 'missing') return <NotFoundPage message={state.message} />;

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
              { key: 'id', label: '项目编号', children: state.project.id },
              { key: 'owner', label: '负责人', children: state.project.owner.name },
              { key: 'team', label: '所属团队', children: state.project.team.name },
            ]}
          />

          {saveError && <Alert className="form-error" type="error" showIcon title={saveError} />}

          <Form
            layout="vertical"
            initialValues={{
              name: state.project.name,
              status: state.project.status,
              description: state.project.description,
            }}
            onFinish={(values) => void handleSave(values)}
          >
            <ProjectFormFields />

            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
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
