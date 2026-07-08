import { useState } from 'react';
import { Alert, Checkbox, Form, Input, Modal, Select, Space, Typography } from 'antd';
import { createRole, updateRole } from '../api';
import { DATA_SCOPES, getProjectEditGrantError, SCOPE_NAMES } from '../../../shared/catalog.ts';
import type {
  DataScope,
  EnabledStatus,
  PermissionCatalogEntry,
  PermissionCode,
  RoleGrant,
  RoleRecord,
} from '../../../shared/contracts.ts';
import { useMutation } from '../useMutation';

interface RoleFormValues {
  name: string;
  description: string;
  status: EnabledStatus;
}
type GrantDraft = Partial<Record<PermissionCode, DataScope | null>>;

/** 编辑器随打开/关闭挂载，表单草稿和提交错误不会残留到下一次编辑。 */
export function RoleEditor({
  role,
  catalog,
  onCancel,
  onSaved,
}: {
  role?: RoleRecord;
  catalog: readonly PermissionCatalogEntry[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form] = Form.useForm<RoleFormValues>();
  const [grants, setGrants] = useState<GrantDraft>(() =>
    Object.fromEntries((role?.permissions ?? []).map((grant) => [grant.code, grant.dataScope])),
  );
  const mutation = useMutation('角色保存失败');
  const permissions: RoleGrant[] = catalog
    .filter((permission) => Object.hasOwn(grants, permission.code))
    .map((permission) => ({ code: permission.code, dataScope: grants[permission.code] ?? null }));
  const grantError = getProjectEditGrantError(permissions);

  function setGrant(code: PermissionCode, value: DataScope | null | undefined) {
    setGrants((current) => {
      const next = { ...current };
      if (value === undefined) delete next[code];
      else next[code] = value;
      return next;
    });
  }

  async function handleSubmit(values: RoleFormValues) {
    if (grantError) return;
    const input = { name: values.name, description: values.description, permissions };
    const saved = await mutation.run(() =>
      role ? updateRole(role.id, { ...input, status: values.status }) : createRole(input),
    );
    if (saved) await onSaved();
  }

  return (
    <Modal
      title={role ? `编辑角色：${role.name}` : '新建角色'}
      open
      width={720}
      confirmLoading={mutation.pending}
      okText="保存"
      cancelText="取消"
      okButtonProps={{ disabled: Boolean(grantError) }}
      cancelButtonProps={{ disabled: mutation.pending }}
      closable={!mutation.pending}
      mask={{ closable: !mutation.pending }}
      keyboard={!mutation.pending}
      onOk={() => form.submit()}
      onCancel={onCancel}
    >
      {mutation.error && (
        <Alert className="form-error" type="error" showIcon title={mutation.error} />
      )}
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: role?.name ?? '',
          description: role?.description ?? '',
          status: role?.status ?? 'enabled',
        }}
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          label="角色名称"
          name="name"
          rules={[{ required: true, whitespace: true, message: '请输入角色名称' }]}
        >
          <Input placeholder="请输入角色名称" />
        </Form.Item>
        <Form.Item label="说明（可选）" name="description">
          <Input.TextArea rows={2} placeholder="补充角色用途（可留空）" />
        </Form.Item>
        {role && (
          <Form.Item label="状态" name="status">
            <Select
              options={[
                { value: 'enabled', label: '启用' },
                { value: 'disabled', label: '停用' },
              ]}
            />
          </Form.Item>
        )}
        <Form.Item label="授权设置">
          <Space className="full-width" orientation="vertical" size={8}>
            {catalog.map((permission) => {
              const granted = Object.hasOwn(grants, permission.code);
              return (
                <Space key={permission.code} wrap>
                  <Checkbox
                    checked={granted}
                    onChange={(event) =>
                      setGrant(
                        permission.code,
                        event.target.checked
                          ? permission.requiresDataScope
                            ? 'self'
                            : null
                          : undefined,
                      )
                    }
                  >
                    {permission.name}
                  </Checkbox>
                  {granted && permission.requiresDataScope && (
                    <Space size={4}>
                      <Typography.Text type="secondary">可见范围</Typography.Text>
                      <Select
                        size="small"
                        className="scope-select"
                        value={grants[permission.code]}
                        options={DATA_SCOPES.map((scope) => ({
                          value: scope,
                          label: SCOPE_NAMES[scope],
                        }))}
                        onChange={(scope: DataScope) => setGrant(permission.code, scope)}
                      />
                    </Space>
                  )}
                </Space>
              );
            })}
            <Typography.Text type="secondary">
              项目编辑必须同时授予项目查看权限，且编辑范围不能超过查看范围。
            </Typography.Text>
            {grantError && <Alert type="error" showIcon title={grantError} />}
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}
